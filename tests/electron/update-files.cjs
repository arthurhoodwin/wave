'use strict';
const {app}=require('electron'),fs=require('node:fs'),raw=require('original-fs'),path=require('node:path'),assert=require('node:assert/strict');
const {UpdateManager}=require('../../src/main/updates/update-manager.cjs'),delta=require('../../src/main/updates/file-update.cjs'),root=process.argv[2],phase=process.argv[3];
app.setPath('userData',path.join(root,'profile'));
app.whenReady().then(async()=>{
 try{
  const installed=path.join(root,'base'),archive=path.join(installed,'resources/app.asar');
  assert.equal(fs.statSync(archive).isFile(),false,'Electron must expose the archive as a virtual directory');assert.equal(raw.statSync(archive).isFile(),true);
  const launches=[],common={directory:path.join(root,'updates'),installDirectory:installed,installed:true,publicKey:raw.readFileSync(path.join(root,'public.pem'),'utf8'),encrypt:s=>Buffer.from(s),decrypt:b=>b.toString(),launch:async job=>launches.push(job)};
  if(phase==='forward'){
   raw.copyFileSync(archive,path.join(root,'base-original.asar'));
   const manager=new UpdateManager({...common,version:'0.8.0'});await manager.stage(path.join(root,'test.waveupdate'));await manager.install();
  }else{
   const next=new UpdateManager({...common,version:'0.8.1'});await next.load();assert.equal(next.status().rollback,'0.8.0');await next.install(true);
   const expected=raw.readFileSync(archive),tampered=path.join(root,'tampered');raw.mkdirSync(path.join(tampered,'resources'),{recursive:true});raw.writeFileSync(path.join(tampered,'resources/app.asar'),Buffer.concat([expected,Buffer.from('changed')]));
   await assert.rejects(delta.verifyBase(tampered,[{path:'resources/app.asar',size:expected.length,sha512:delta.hash(expected)}]),/app\.asar/);
  }
  assert.equal(launches.length,1);raw.writeFileSync(path.join(root,phase+'-selection.json'),JSON.stringify(launches[0]));raw.writeFileSync(path.join(root,'report.json'),JSON.stringify({electron:process.versions.electron}));app.exit(0);
 }catch(e){console.error(e.stack);app.exit(1);}
});
