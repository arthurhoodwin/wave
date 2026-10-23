'use strict';
const installed=Symbol.for('wave.stdio-guard');
// A GUI app can outlive the terminal/updater that supplied its output pipes.
// Only that pipe's errors are handled; unrelated exceptions keep their normal path.
function installStdioGuard(streams=[process.stdout,process.stderr]){
 for(const stream of streams){if(!stream?.on||stream[installed])continue;stream[installed]=true;let broken=false;
  stream.on('error',error=>{if(error?.code==='EPIPE'){broken=true;return;}if(broken&&['ERR_STREAM_DESTROYED','ERR_STREAM_WRITE_AFTER_END'].includes(error?.code))return;throw error;});
 }
}
module.exports={installStdioGuard};
