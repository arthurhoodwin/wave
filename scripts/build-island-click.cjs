'use strict';
const fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process');
function buildIslandClick(){
 if(process.platform!=='win32')return null;
 const root=path.resolve(__dirname,'..'),source=path.join(root,'build/windows/island-click.cs');
 const file=path.join(root,'work/native/island-click.exe');
 if(fs.existsSync(file)&&fs.statSync(file).mtimeMs>=fs.statSync(source).mtimeMs)return file;
 fs.mkdirSync(path.dirname(file),{recursive:true});
 const compiler=path.join(process.env.SystemRoot||'C:/Windows','Microsoft.NET/Framework64/v4.0.30319/csc.exe');
 const run=spawnSync(compiler,['/nologo','/platform:x64','/optimize+','/target:exe','/out:'+file,source],
  {windowsHide:true,encoding:'utf8'});
 if(run.status!==0)throw Error(run.error?.message||run.stdout||run.stderr||'Unable to build the mini-player helper');
 return file;
}
if(require.main===module)buildIslandClick();
module.exports={buildIslandClick};
