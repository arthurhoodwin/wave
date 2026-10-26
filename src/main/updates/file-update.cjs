'use strict';
// Signed file patches reuse unchanged blocks; they never contain or execute scripts.
const fs=require('./disk-fs.cjs').promises,path=require('node:path'),{createHash}=require('node:crypto'),{brotliCompressSync,brotliDecompressSync,constants}=require('node:zlib');
const MAGIC=Buffer.from('WAVEUPD2\n'),LIMIT=512*1024*1024;
const hash=b=>createHash('sha512').update(b).digest('hex');
// Content-defined boundaries survive insertions in ASAR headers and source files.
const gear=Uint32Array.from({length:256},(_,i)=>{let x=i+1;for(let k=0;k<8;k++)x=Math.imul(x^(x>>>13),0x5bd1e995);return x>>>0;});
function* chunks(bytes){let start=0,fp=0;for(let i=0;i<bytes.length;i++){fp=((fp<<1)+gear[bytes[i]])>>>0;const size=i+1-start;if(size>=16384&&((fp&32767)===0||size>=131072)){yield[start,i+1];start=i+1;fp=0;}}if(start<bytes.length)yield[start,bytes.length];}
const validHash=s=>typeof s==='string'&&/^[a-f0-9]{128}$/.test(s);
function safeName(s){return typeof s==='string'&&s.length>0&&s.length<240&&s.split('/').every(p=>p&&p!=='.'&&p!=='..'&&!/[\\:\x00-\x1f<>"|?*]/.test(p)&&!/[. ]$/.test(p)&&!/^(con|prn|aux|nul|com[0-9]|lpt[0-9])(?:\.|$)/i.test(p));}
async function filePath(root,name){if(!safeName(name))throw Error('Недопустимый путь обновления');root=path.resolve(root);const parts=name.split('/');let at=root;for(const part of parts){at=path.join(at,part);try{if((await fs.lstat(at)).isSymbolicLink())throw Error('Ссылка в каталоге обновления');}catch(e){if(e.code!=='ENOENT')throw e;}}return at;}
async function tree(root){const rows=[];async function walk(rel=''){for(const e of await fs.readdir(path.join(root,rel),{withFileTypes:true})){const name=rel?rel+'/'+e.name:e.name;if(!safeName(name)||e.isSymbolicLink())throw Error('Недопустимый файл сборки');if(e.isDirectory())await walk(name);else if(e.isFile()){const bytes=await fs.readFile(path.join(root,name));rows.push({path:name,size:bytes.length,sha512:hash(bytes)});}else throw Error('Недопустимый тип файла');}}await walk();return rows.sort((a,b)=>a.path.localeCompare(b.path,'en'));}
async function createPatch(baseRoot,targetRoot){const base=await tree(baseRoot),target=await tree(targetRoot),old=new Map(base.map(r=>[r.path,r])),next=new Map(target.map(r=>[r.path,r])),files=[],data=[];let offset=0;
 for(const name of [...new Set([...old.keys(),...next.keys()])].sort()){
  const a=old.get(name),b=next.get(name);if(a?.sha512===b?.sha512)continue;
  const item={path:name,before:a?.sha512||null,after:b?.sha512||null,size:b?.size||0,ops:[]};files.push(item);if(!b)continue;
  const source=a?await fs.readFile(path.join(baseRoot,name)):Buffer.alloc(0),dest=await fs.readFile(path.join(targetRoot,name)),blocks=new Map();
  for(const [at,end] of chunks(source)){const chunk=source.subarray(at,end);blocks.set(hash(chunk),[at,chunk.length]);}
  for(const [at,end] of chunks(dest)){const chunk=dest.subarray(at,end),match=blocks.get(hash(chunk));if(match){const prev=item.ops.at(-1);if(prev?.copy&&prev.copy[0]+prev.copy[1]===match[0])prev.copy[1]+=match[1];else item.ops.push({copy:[...match]});}else{const prev=item.ops.at(-1);if(prev?.data&&prev.data[0]+prev.data[1]===offset)prev.data[1]+=chunk.length;else item.ops.push({data:[offset,chunk.length]});data.push(chunk);offset+=chunk.length;}}
 }
 if(!files.length)throw Error('Сборки одинаковы');if(offset>LIMIT-1048576)throw Error('Изменения слишком велики: используйте установщик');
 const index=Buffer.from(JSON.stringify({base,target,files}));if(index.length>1048576)throw Error('Слишком много файлов обновления');const length=Buffer.alloc(4);length.writeUInt32LE(index.length);
 return {body:brotliCompressSync(Buffer.concat([length,index,...data]),{params:{[constants.BROTLI_PARAM_QUALITY]:6}}),changed:files.length,total:target.length,newBytes:offset};
}
function decode(body){let raw;try{raw=brotliDecompressSync(body,{maxOutputLength:LIMIT});}catch{throw Error('Пакет файлов повреждён или слишком велик');}if(raw.length<4)throw Error('Оборванный индекс обновления');const n=raw.readUInt32LE();if(n<2||n>1048576||n+4>raw.length)throw Error('Неверный индекс обновления');let index;try{index=JSON.parse(raw.subarray(4,n+4));}catch{throw Error('Неверный индекс обновления');}const data=raw.subarray(n+4);
 for(const rows of [index.base,index.target,index.files]){if(!Array.isArray(rows)||rows.length>4096)throw Error('Неверный список файлов');const seen=new Set();for(const r of rows){if(!safeName(r.path)||seen.has(r.path.toLowerCase()))throw Error('Повтор или недопустимый путь');seen.add(r.path.toLowerCase());}}
 for(const rows of [index.base,index.target])for(const r of rows)if(!validHash(r.sha512)||!Number.isSafeInteger(r.size)||r.size<0||r.size>LIMIT)throw Error('Неверная контрольная сумма файла');
 const base=new Map(index.base.map(r=>[r.path,r])),target=new Map(index.target.map(r=>[r.path,r])),changed=new Set();
 for(const f of index.files){changed.add(f.path);if(f.before!==(base.get(f.path)?.sha512||null)||f.after!==(target.get(f.path)?.sha512||null)||f.before===f.after||f.size!==(target.get(f.path)?.size||0)||!Array.isArray(f.ops))throw Error('Неверная операция обновления');let size=0;for(const op of f.ops){const range=op.copy||op.data;if(!!op.copy===!!op.data||!Array.isArray(range)||range.length!==2||!range.every(Number.isSafeInteger)||range[0]<0||range[1]<=0||range[0]+range[1]>(op.copy?(base.get(f.path)?.size||0):data.length))throw Error('Неверный блок обновления');size+=range[1];}if(size!==f.size)throw Error('Неверный размер файла');}
 for(const name of new Set([...base.keys(),...target.keys()]))if(base.get(name)?.sha512!==target.get(name)?.sha512&&!changed.has(name))throw Error('Неполный пакет обновления');
 return {...index,data};
}
async function verifyBase(root,rows){for(const r of rows){const file=await filePath(root,r.path);try{const stat=await fs.stat(file);if(!stat.isFile()||stat.size!==r.size||hash(await fs.readFile(file))!==r.sha512)throw Error();}catch{throw Error('Файл Wave «'+r.path+'» недоступен или отличается от основы обновления. Используйте полный установщик.');}}}
async function prepare({body,installRoot,directory,version,current}){const p=decode(body);await verifyBase(installRoot,p.base);const forward={base:p.base,files:[]},reverse={base:p.target,files:[]};await fs.mkdir(path.join(directory,'files'),{recursive:true});await fs.mkdir(path.join(directory,'rollback','files'),{recursive:true});
 for(let i=0;i<p.files.length;i++){const f=p.files[i],name=await filePath(installRoot,f.path);let original=Buffer.alloc(0);if(f.before)original=await fs.readFile(name);else{try{await fs.lstat(name);throw Error('Новый файл уже существует');}catch(e){if(e.code!=='ENOENT')throw e;}}
  const source='files/'+i;forward.files.push({path:f.path,before:f.before,after:f.after,source:f.after?source:null});reverse.files.push({path:f.path,before:f.after,after:f.before,source:f.before?source:null});
  if(f.before)await fs.writeFile(path.join(directory,'rollback',source),original,{flag:'wx'});
  if(f.after){const out=Buffer.alloc(f.size);let at=0;for(const op of f.ops){const [start,size]=op.copy||op.data;(op.copy?original:p.data).copy(out,at,start,start+size);at+=size;}if(hash(out)!==f.after)throw Error('Контрольная сумма изменённого файла не совпадает');await fs.writeFile(path.join(directory,source),out,{flag:'wx'});}
 }
 const file=path.join(directory,'plan.json'),undo=path.join(directory,'rollback','plan.json');await fs.writeFile(file,JSON.stringify({...forward,version}),{flag:'wx'});await fs.writeFile(undo,JSON.stringify({...reverse,version:current}),{flag:'wx'});return{file,sha512:hash(await fs.readFile(file)),undo,undoHash:hash(await fs.readFile(undo))};
}
module.exports={MAGIC,LIMIT,chunks,hash,validHash,safeName,filePath,tree,createPatch,decode,verifyBase,prepare};
