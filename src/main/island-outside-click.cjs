'use strict';
const path=require('node:path'),{spawn}=require('node:child_process'),{createInterface}=require('node:readline');

function observeOutsideClick(app,window,onOutside){
 if(process.platform!=='win32')return ()=>{};
 const file=app.isPackaged?path.join(process.resourcesPath,'island-click.exe'):
  path.join(__dirname,'../../work/native/island-click.exe');
 const hwnd=window.getNativeWindowHandle().readBigUInt64LE(0);
 const worker=spawn(file,[String(hwnd)],{windowsHide:true,stdio:['pipe','pipe','ignore']});
 worker.on('error',()=>{});
 worker.stdin.on('error',()=>{});
 const lines=createInterface({input:worker.stdout});
 let active=true;
 lines.on('line',message=>{if(active&&message==='outside')onOutside();});
 return ()=>{
  active=false;
  lines.close();
  worker.stdin.end();
 };
}

module.exports={observeOutsideClick};
