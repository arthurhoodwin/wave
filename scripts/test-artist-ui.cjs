'use strict';
const fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process');
const scratch=path.resolve(__dirname,'../work');fs.mkdirSync(scratch,{recursive:true});
const root=fs.mkdtempSync(path.join(scratch,'artist-ui-')),env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
try{
 const result=spawnSync(require('electron'),[path.resolve(__dirname,'../tests/electron/artist-ui.cjs'),root],{env,windowsHide:true,encoding:'utf8',timeout:45000});
 if(result.status!==0)throw Error(result.stderr||result.stdout||result.error?.message||'Artist UI test failed');
 const report=JSON.parse(fs.readFileSync(path.join(root,'report.json'),'utf8'));
 fs.writeFileSync(path.join(scratch,'artist-ui-report.json'),JSON.stringify(report,null,2));
 fs.copyFileSync(path.join(root,'artist-ui.png'),path.join(scratch,'artist-ui.png'));
 console.log('Artist UI integration passed:',JSON.stringify(report));
}catch(e){if(fs.existsSync(path.join(root,'error.json')))console.error(fs.readFileSync(path.join(root,'error.json'),'utf8'));console.error(e.message);process.exitCode=1;}
finally{if(path.dirname(root)!==scratch||!path.basename(root).startsWith('artist-ui-'))throw Error('Unsafe fixture cleanup path');fs.rmSync(root,{recursive:true,force:true,maxRetries:3,retryDelay:150});}
