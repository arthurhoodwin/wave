'use strict';
const path=require('node:path'),fs=require('node:fs'),{spawnSync}=require('node:child_process');
const output=path.resolve(process.argv[2]||'work/performance'),label=process.argv[3]||'profile',env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
const r=spawnSync(require('electron'),[path.resolve(__dirname,'../tests/electron/performance-ui.cjs'),output,label],{env,windowsHide:true,encoding:'utf8',timeout:180000+Number(env.WAVE_SOAK_SECONDS||0)*1000});
if(r.status!==0||!fs.existsSync(path.join(output,label+'.json'))){console.error(r.stderr||r.stdout||r.error?.message||'Missing performance report');process.exitCode=1;}else console.log(r.stdout);
