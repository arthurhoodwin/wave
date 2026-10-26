'use strict';
const fs=require('node:fs/promises'),{createReadStream,createWriteStream}=require('node:fs'),path=require('node:path');
const {sign,createPublicKey}=require('node:crypto'),{pipeline}=require('node:stream/promises');const {MAGIC,PRODUCT,digest,compare}=require('../src/main/updates/update-manager.cjs');
(async()=>{
 const [input,target,current,keyFile,base,baseVersion]=process.argv.slice(2);
 if(!input||!target||!current||!keyFile)throw Error('Usage: package-update.cjs target-directory output.waveupdate version private-key.pem base-directory base-version (EXE input: legacy format)');
 compare(current,current);const key=await fs.readFile(keyFile),pinned=await fs.readFile(path.join(__dirname,'../build/update-public.pem'),'utf8');
 if(createPublicKey(key).export({type:'spki',format:'pem'})!==pinned)throw Error('Signing key does not match the public key in Wave');
 let magic=MAGIC,body,extra={},sha512,bytes;
 if((await fs.stat(input)).isDirectory()){
  if(baseVersion!=='runtime'&&(!base||!baseVersion||compare(current,baseVersion)<=0))throw Error('A previous unpacked build and its exact older version are required');
  // The packaged ASAR is the authoritative version, not the caller-supplied label.
  const asar=require('@electron/asar');for(const [root,expected] of (baseVersion==='runtime'?[[input,current]]:[[input,current],[base,baseVersion]])){const p=JSON.parse(asar.extractFile(path.join(root,'resources/app.asar'),'package.json'));if((p.releaseVersion||p.version)!==expected)throw Error('ASAR version differs from the requested version');}
  const delta=require('../src/main/updates/file-update.cjs'),patch=baseVersion==='runtime'?{body:await require('../src/main/updates/runtime-update.cjs').create(input,JSON.parse(await fs.readFile(base,'utf8'))),changed:'application',total:'runtime reused',newBytes:0}:await delta.createPatch(base,input);body=patch.body;magic=delta.MAGIC;sha512=delta.hash(body);bytes=body.length;extra=baseVersion==='runtime'?{kind:'runtime'}:{kind:'files',baseVersion};if(baseVersion==='runtime')magic=Buffer.from('WAVEUPD3\n');console.log('Changed files:',patch.changed,'of',patch.total,'; new block bytes:',patch.newBytes,'; compressed bytes:',bytes);
 }else{bytes=(await fs.stat(input)).size;sha512=await digest(input);}
 const payload=JSON.stringify({product:PRODUCT,arch:'x64',version:current,bytes,sha512,...extra}),envelope=Buffer.from(JSON.stringify({payload,signature:sign(null,Buffer.from(payload),key).toString('base64')})),length=Buffer.alloc(4);length.writeUInt32LE(envelope.length);
 const output=createWriteStream(target,{flags:'wx'});output.write(Buffer.concat([magic,length,envelope]));if(body)output.end(body);else await pipeline(createReadStream(input),output);
 if(body)await require('node:stream/promises').finished(output);console.log('Signed Wave update created:',path.basename(target));
})().catch(e=>{console.error(e.message);process.exitCode=1;});
