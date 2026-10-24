const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');const {GithubUpdater}=require('../src/main/updates/github-updater.cjs'),{UpdateManager,MAGIC,PRODUCT}=require('../src/main/updates/update-manager.cjs'),{StartupHealth}=require('../src/main/updates/startup-health.cjs');
async function fixture(version="1.0.9"){const directory=await fs.mkdtemp(path.join(os.tmpdir(),'wave-github-')),keys=crypto.generateKeyPairSync('ed25519'),bytes=Buffer.alloc(4096,42),payload=JSON.stringify({product:PRODUCT,version,arch:'x64',bytes:bytes.length,sha512:crypto.createHash('sha512').update(bytes).digest('hex')}),envelope=Buffer.from(JSON.stringify({payload,signature:crypto.sign(null,Buffer.from(payload),keys.privateKey).toString('base64')})),length=Buffer.alloc(4);length.writeUInt32LE(envelope.length);const file=Buffer.concat([MAGIC,length,envelope,bytes]);const manager=new UpdateManager({directory,version:'1.0.8',installed:true,publicKey:keys.publicKey,encrypt:s=>Buffer.from(s),decrypt:b=>b.toString(),launch:async()=>{throw Error('must not auto install');}}),metadata={tag_name:'v'+version,draft:false,prerelease:false,assets:[{name:'Wave-'+version+'.waveupdate',state:'uploaded',size:file.length,browser_download_url:'https://github.com/arthurhoodwin/wave/releases/download/v'+version+'/Wave-'+version+'.waveupdate'}]},fetch=async url=>url.includes('api.github.com')?new Response(JSON.stringify(metadata)):new Response(file),updater=new GithubUpdater({manager,fetch});return{directory,file,metadata,manager,updater,close:()=>fs.rm(directory,{recursive:true,force:true})};}


test('GitHub update is explicitly checked, streamed, signed and staged without running an installer',async()=>{const f=await fixture();try{assert.equal((await f.updater.check()).phase,'available');assert.equal((await f.updater.download()).phase,'ready');assert.equal(f.manager.staged.version,'1.0.9');assert.equal((await fs.readdir(f.directory)).filter(n=>n.startsWith('.github-')).length,0);}finally{await f.close();}});

test('altered downloaded package cannot stage and removes temporary bytes',async()=>{const f=await fixture();try{await f.updater.check();const bad=Buffer.from(f.file);bad[bad.length-1]^=255;f.updater.fetch=async()=>new Response(bad);assert.equal((await f.updater.download()).phase,'error');assert.equal(f.manager.staged,null);assert.deepEqual(await fs.readdir(f.directory),[]);}finally{await f.close();}});

test('foreign GitHub asset and foreign redirect cannot receive update requests',async()=>{const f=await fixture();try{f.metadata.assets[0].browser_download_url='https://github.com/other/app/releases/download/v1.0.9/evil';assert.equal((await f.updater.check()).phase,'error');f.metadata.assets[0].browser_download_url='https://github.com/arthurhoodwin/wave/releases/download/v1.0.9/Wave-1.0.9.waveupdate';await f.updater.check();let requests=0;f.updater.fetch=async()=>{requests++;return new Response(null,{status:302,headers:{location:'https://untrusted.example/update'}});};assert.equal((await f.updater.download()).phase,'error');assert.equal(requests,1);}finally{await f.close();}});

test('cancelled stream stops with no staged installer or temporary package',async()=>{const f=await fixture();try{await f.updater.check();let started;const reading=new Promise(resolve=>started=resolve);f.updater.fetch=async(_url,{signal})=>new Response(new ReadableStream({start(controller){controller.enqueue(f.file.subarray(0,100));signal.addEventListener('abort',()=>controller.error(Error('aborted')),{once:true});started();}}));const work=f.updater.download();await reading;f.updater.cancel();assert.equal((await work).phase,'cancelled');assert.equal(f.manager.staged,null);assert.deepEqual(await fs.readdir(f.directory),[]);}finally{await f.close();}});

test('signed version must equal the advertised GitHub version',async()=>{
 const f=await fixture();try{
  f.metadata.tag_name='v1.1.0';f.metadata.assets[0].name='Wave-1.1.0.waveupdate';
  f.metadata.assets[0].browser_download_url='https://github.com/arthurhoodwin/wave/releases/download/v1.1.0/Wave-1.1.0.waveupdate';
  assert.equal((await f.updater.check()).phase,'available');let downloads=0;
  f.updater.fetch=async request=>{downloads++;assert.equal(request,f.metadata.assets[0].browser_download_url);return new Response(f.file);};
  const result=await f.updater.download();assert.equal(downloads,1);assert.equal(result.phase,'error');
  assert.match(result.error,/Подписанная версия не совпадает/);assert.equal(f.manager.staged,null);
  assert.equal((await fs.readdir(f.directory)).some(name=>name.endsWith('.exe')||name.endsWith('.waveupdate')),false);
 }finally{await f.close();}
});

test('download rejects incomplete content and does not report a ready update',async()=>{const f=await fixture();try{await f.updater.check();f.updater.fetch=async()=>new Response(f.file.subarray(0,100));assert.equal((await f.updater.download()).phase,'error');assert.equal(f.manager.staged,null);assert.deepEqual(await fs.readdir(f.directory),[]);}finally{await f.close();}});

test('four-part hotfix is discovered, signature-checked and staged',async()=>{const f=await fixture('1.0.9.5');try{assert.equal((await f.updater.check()).phase,'available');assert.equal((await f.updater.download()).phase,'ready');assert.equal(f.manager.staged.version,'1.0.9.5');}finally{await f.close();}});

test('five-part hotfix is discovered and signature-checked',async()=>{const f=await fixture('1.0.9.9.1');try{assert.equal((await f.updater.check()).phase,'available');assert.equal((await f.updater.download()).phase,'ready');assert.equal(f.manager.staged.version,'1.0.9.9.1');}finally{await f.close();}});
