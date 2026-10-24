'use strict';
// Build actual ASAR files under Node, then exercise the real Electron fs shim.
const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto'),{spawnSync}=require('node:child_process');
const {createPatch,MAGIC,hash}=require('../src/main/updates/file-update.cjs'),{PRODUCT}=require('../src/main/updates/update-manager.cjs');
(async()=>{
 const scratch=path.resolve(__dirname,'../work');await fs.mkdir(scratch,{recursive:true});const root=await fs.mkdtemp(path.join(scratch,'electron-updates-'));
 try{
  for(const [version,name] of [['0.8.0','base'],['0.8.1','target']]){
   const source=path.join(root,name+'-source'),dest=path.join(root,name,'resources');await fs.mkdir(source,{recursive:true});await fs.mkdir(dest,{recursive:true});
   await fs.writeFile(path.join(source,'package.json'),JSON.stringify({name:'update-fixture',version}));await fs.writeFile(path.join(source,'index.cjs'),'module.exports='+JSON.stringify(version));
   await require('@electron/asar').createPackage(source,path.join(dest,'app.asar'));
  }
  const patch=await createPatch(path.join(root,'base'),path.join(root,'target')),keys=crypto.generateKeyPairSync('ed25519');
  const payload=JSON.stringify({product:PRODUCT,arch:'x64',kind:'files',version:'0.8.1',baseVersion:'0.8.0',bytes:patch.body.length,sha512:hash(patch.body)}),envelope=Buffer.from(JSON.stringify({payload,signature:crypto.sign(null,Buffer.from(payload),keys.privateKey).toString('base64')})),length=Buffer.alloc(4);length.writeUInt32LE(envelope.length);
  await fs.writeFile(path.join(root,'test.waveupdate'),Buffer.concat([MAGIC,length,envelope,patch.body]));await fs.writeFile(path.join(root,'public.pem'),keys.publicKey.export({type:'spki',format:'pem'}));
  const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
  const electron=phase=>{const child=spawnSync(require('electron'),[path.resolve(__dirname,'../tests/electron/update-files.cjs'),root,phase],{env,windowsHide:true,encoding:'utf8',timeout:30000});if(child.status!==0)throw Error(child.stderr||child.stdout||child.error?.message||'Electron update test failed');};
  const apply=async phase=>{const selection=JSON.parse(await fs.readFile(path.join(root,phase+'-selection.json'),'utf8')),job=path.join(root,'job.json');await fs.writeFile(job,JSON.stringify({pid:2147483647,noRestart:true,kind:'files',installer:selection.file,sha512:selection.sha512,directory:path.join(root,'base')}));const result=spawnSync('powershell.exe',['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',path.resolve(__dirname,'../build/windows/apply-update.ps1'),'-JobFile',job],{windowsHide:true,encoding:'utf8',timeout:15000});if(result.status!==0)throw Error(result.stderr||'Patch helper failed');};
  // Electron must exit before the helper replaces an archive it has opened.
  electron('forward');await apply('forward');
  const expected=await fs.readFile(path.join(root,'target/resources/app.asar'));if(!(await fs.readFile(path.join(root,'base/resources/app.asar'))).equals(expected))throw Error('Forward archive differs');
  electron('rollback');await apply('rollback');
  const original=await fs.readFile(path.join(root,'base-original.asar'));if(!(await fs.readFile(path.join(root,'base/resources/app.asar'))).equals(original))throw Error('Rollback archive differs');
  const report={electron:JSON.parse(await fs.readFile(path.join(root,'report.json'),'utf8')).electron,virtualAsar:true,forward:true,rollback:true,tamperRejected:true,helperAfterElectronExit:true};
  console.log('Electron ASAR update integration passed:',JSON.stringify(report));
 }finally{if(path.dirname(root)!==scratch||!path.basename(root).startsWith('electron-updates-'))throw Error('Unsafe test cleanup path');await fs.rm(root,{recursive:true,force:true});}
})().catch(e=>{console.error(e.stack);process.exitCode=1;});
