'use strict';
const fs=require('node:fs/promises'),path=require('node:path'),{createHash,randomUUID}=require('node:crypto'),{trackData,validRoot}=require('./personal-library.cjs');
// Separate journal keeps the complete selection across rollback to older apps,
// whose personal-index reader only understands the first 100 queued entries.
class DownloadQueue{
 constructor(library){this.library=library;this.pending=Promise.resolve();}
 file(root){if(!validRoot(root))throw Error('Аккаунт изменился');return path.join(this.library.directory,createHash('sha256').update(root).digest('hex')+'.queue.dat');}
 normalize(rows){if(!Array.isArray(rows)||rows.length>5000)throw Error('Очередь загрузок повреждена');const ids=new Set(),keys=new Set();return rows.map(row=>{const track=trackData(row?.track);if(!track||!(/^[a-f0-9-]{36}$/.test(row.id))||ids.has(row.id)||keys.has(track.key))throw Error('Очередь загрузок повреждена');ids.add(row.id);keys.add(track.key);const p=row.partial,partial=p&&typeof p.folder==='string'&&path.isAbsolute(p.folder)&&/^[a-f0-9]{64}$/.test(p.source)&&/^"[^"\r\n]{1,300}"$/.test(p.etag||'')?{folder:p.folder,source:p.source,etag:p.etag}:null;return{id:row.id,track,state:'paused',...(partial?{partial}:{})};});}
 async load(root,legacy){await this.pending;try{const file=this.file(root);if((await fs.stat(file)).size>12*1024**2)throw Error();const data=JSON.parse(await this.library.decrypt(await fs.readFile(file)));if(data.schema!==1)throw Error();return this.normalize(data.items);}catch(e){if(e.code==='ENOENT')return this.normalize(legacy||[]);throw Error('Не удалось открыть очередь загрузок. Сохранённая очередь не изменена.');}}
 save(root,items){const rows=this.normalize(items),clear=JSON.stringify({schema:1,items:rows});if(Buffer.byteLength(clear)>10*1024**2)return Promise.reject(Error('Очередь слишком велика для сохранения'));const job=this.pending.then(async()=>{const file=this.file(root),temp=file+'.'+randomUUID();await fs.mkdir(path.dirname(file),{recursive:true});try{await fs.writeFile(temp,await this.library.encrypt(clear),{flag:'wx',mode:0o600});await fs.rename(temp,file);}finally{await fs.rm(temp,{force:true}).catch(()=>{});}});this.pending=job.catch(()=>{});return job;}
}
module.exports={DownloadQueue};
