'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const {wav}=require('./helpers/downloads.cjs');

test('duration validation rejects implausible reported duration and accepts metadata rounding',async()=>{const {validateDownload}=require('../src/main/downloads/download-validator.cjs'),directory=await fs.mkdtemp(path.join(os.tmpdir(),'wave-duration-beta2-'));let decoded=6;class Window{constructor(){this.dead=false;}async loadURL(){}async executeJavaScript(){}get webContents(){return{executeJavaScript:async()=>decoded};}isDestroyed(){return this.dead;}destroy(){this.dead=true;}}
 try{const file=path.join(directory,'file.wav');await fs.writeFile(file,wav());await assert.rejects(validateDownload({file,record:{bytes:4096,ext:'wav',track:{duration:100}}},{BrowserWindow:Window}),/Длительность/);decoded=99.3;assert.equal(await validateDownload({file,record:{bytes:4096,ext:'wav',track:{duration:100}}},{BrowserWindow:Window}),99.3);}finally{await fs.rm(directory,{recursive:true,force:true});}});
