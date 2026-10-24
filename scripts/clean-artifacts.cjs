'use strict';
// Only named, ignored build outputs directly inside dist; never profiles or keys.
const fs=require('node:fs/promises'),path=require('node:path'),pkg=require('../package.json');
async function clean({directory=path.resolve(__dirname,'../dist'),keep=[pkg.releaseVersion||pkg.version],apply=false}={}){
 const root=path.resolve(directory),removed=[];let bytes=0;
 for(const entry of await fs.readdir(root,{withFileTypes:true})){
  if(!entry.isFile()||entry.isSymbolicLink())continue;
  const match=/^(?:Wave-Setup-(.+)\.exe(?:\.blockmap)?|Wave-(.+)\.waveupdate)$/.exec(entry.name);if(!match||keep.includes(match[1]||match[2])||pkg.extraUpdateBase&&keep.some(v=>entry.name==='Wave-'+v+'-from-'+pkg.extraUpdateBase+'.waveupdate'))continue;
  const file=path.resolve(root,entry.name);if(path.dirname(file)!==root)throw Error('Artifact escaped dist');
  bytes+=(await fs.stat(file)).size;removed.push(entry.name);if(apply)await fs.unlink(file);
 }
 return {apply,removed,bytes};
}
if(require.main===module){const args=process.argv.slice(2);if(args.some(a=>a!=='--apply'))throw Error('Usage: node scripts/clean-artifacts.cjs [--apply]');clean({apply:args.includes('--apply')}).then(r=>console.log(JSON.stringify(r,null,2))).catch(e=>{console.error(e.message);process.exitCode=1;});}
module.exports={clean};
