'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{spawnSync}=require('node:child_process');
const REPO='arthurhoodwin/wave';
const digest=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
function assets(pkg){const v=pkg.releaseVersion||pkg.version;return['Wave-Setup-'+v+'.exe',...(pkg.updateMode==='bootstrap'?[]:['Wave-'+v+'.waveupdate']),...(pkg.extraUpdateBase?['Wave-'+v+'-from-'+pkg.extraUpdateBase+'.waveupdate']:[]),...(pkg.otaManifest?['Wave-'+v+'-ota.json','Wave-'+v+'-runtime.waveupdate',...(pkg.otaBases||[]).filter(base=>base!==(pkg.otaBases||[]).at(-1)).map(base=>'Wave-'+v+'-from-'+base+'.waveupdate')]:[]),'SHA256SUMS.txt'];}
function preflight(root,pkg){const v=pkg.releaseVersion||pkg.version,text=fs.readFileSync(path.join(root,'releases/LATEST.md'),'utf8');if(!text.startsWith('# Wave '+v+'\n')&&!text.startsWith('# Wave '+v+'\r\n'))throw Error('Release notes version mismatch');
 const rows=assets(pkg).map(name=>{const file=path.join(root,'dist',name);if(!fs.existsSync(file))throw Error('Missing artifact: '+name);return{name,file,size:fs.statSync(file).size,digest:'sha256:'+digest(file)};});
 const sums=fs.readFileSync(path.join(root,'dist/SHA256SUMS.txt'),'utf8');for(const a of rows.filter(a=>a.name!=='SHA256SUMS.txt'))if(!sums.split(/\r?\n/).some(line=>line===a.digest.slice(7)+'  '+a.name))throw Error('Checksum mismatch: '+a.name);return rows;
}
function gh(args,{timeout=60000}={}){const debug=(process.env.GODEBUG||'').split(',').filter(s=>s&&!s.startsWith('http2client='));debug.push('http2client=0');const result=spawnSync('gh',args,{encoding:'utf8',stdio:['ignore','pipe','pipe'],shell:false,windowsHide:true,timeout,env:{...process.env,GODEBUG:debug.join(',')}});if(result.error)throw Error(result.error.code==='ETIMEDOUT'?'GitHub operation timed out; draft retained. Rerun to resume.':result.error.message);if(result.status!==0)throw Error(result.stderr||'GitHub operation failed');return result.stdout;}
function publish({root,pkg,draft=false,run=gh,log=console.log}){const version=pkg.releaseVersion||pkg.version,tag='v'+version,rows=preflight(root,pkg),list=()=>JSON.parse(run(['api','repos/'+REPO+'/releases?per_page=100&wave_request='+Date.now()])),find=()=>{const matches=list().filter(r=>r.tag_name===tag);if(matches.length>1)throw Error('Multiple drafts for '+tag+'; resolve duplicates before upload');return matches[0];};let release=find();if(release&&!release.draft)throw Error('Refusing to modify a published release');
 if(!release){run(['release','create',tag,'--repo',REPO,'--verify-tag','--draft','--title','Wave '+version,'--notes-file',path.join(root,'releases/LATEST.md'),...(['alpha','beta','rc'].includes(pkg.releaseChannel)?['--prerelease']:[])]);release=find();if(!release?.draft)throw Error('Draft not found');}
 // Small artifacts first; interrupted uploads resume without rebuilding or resending valid files.
 const ordered=[...rows].sort((a,b)=>Number(a.name.endsWith('.exe'))-Number(b.name.endsWith('.exe')));
 const timeout=Number(process.env.WAVE_RELEASE_UPLOAD_TIMEOUT_MS)||300000;
 if(timeout<10000||timeout>1800000)throw Error('Upload timeout must be 10000..1800000 ms');
 for(const asset of ordered){release=find();if(!release?.draft)throw Error('Release is no longer a draft');const existing=release.assets?.find(a=>a.name===asset.name);
  if(existing?.state==='uploaded'){if(existing.size!==asset.size||existing.digest!==asset.digest)throw Error('Existing asset differs; refusing overwrite: '+asset.name);log('Verified, skipped: '+asset.name);continue;}
  if(existing)run(['release','delete-asset',tag,asset.name,'--repo',REPO,'--yes']);
  log('Uploading: '+asset.name+' ('+(asset.size/1024**2).toFixed(2)+' MiB, timeout '+Math.round(timeout/1000)+'s)');const start=Date.now();
  run(['release','upload',tag,asset.file,'--repo',REPO],{timeout});const uploaded=find().assets?.find(a=>a.name===asset.name);
  if(uploaded?.state!=='uploaded'||uploaded.size!==asset.size||uploaded.digest!==asset.digest)throw Error('Uploaded asset verification failed: '+asset.name);
  log('Verified in '+((Date.now()-start)/1000).toFixed(1)+'s: '+asset.name);
 }
 if(!draft)run(['release','edit',tag,'--repo',REPO,'--draft=false',...(['alpha','beta','rc'].includes(pkg.releaseChannel)?['--prerelease=true','--latest=false']:['--prerelease=false','--latest'])]);
 return{version,draft,assets:rows.length};
}
if(require.main===module){try{const args=process.argv.slice(2);if(args.some(a=>!['--check','--draft'].includes(a)))throw Error('Usage: npm run release -- [--check | --draft]');const root=path.resolve(__dirname,'..'),pkg=require('../package.json');if(args.includes('--check')){for(const a of preflight(root,pkg))console.log('Verified: '+a.name);}else console.log(JSON.stringify(publish({root,pkg,draft:args.includes('--draft')})));}catch(error){console.error(error.message);process.exitCode=1;}}
module.exports={assets,preflight,publish};
