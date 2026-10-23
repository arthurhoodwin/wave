'use strict';
const fs=require('node:fs/promises'),path=require('node:path'),{randomUUID}=require('node:crypto'),{spawn}=require('node:child_process');
async function launchInstaller({file,sha512,installDirectory,helper,pid=process.pid}){
 const job=path.join(path.dirname(file),'.install-'+randomUUID()+'.json');await fs.writeFile(job,JSON.stringify({pid,installer:file,sha512,directory:installDirectory}),{mode:0o600});
 try{await new Promise((resolve,reject)=>{const child=spawn(path.join(process.env.SystemRoot||'C:\\Windows','System32','WindowsPowerShell','v1.0','powershell.exe'),['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',helper,'-JobFile',job,'-Bootstrap'],{stdio:'pipe',windowsHide:true});child.stdout.resume();child.stderr.resume();child.once('error',reject);child.once('exit',code=>{child.stdin.destroy();code===0?resolve():reject(Error('Не удалось запустить установку Wave. Повторите действие.'));});});}catch(e){await fs.rm(job,{force:true}).catch(()=>{});throw e;}
}
module.exports={launchInstaller};
