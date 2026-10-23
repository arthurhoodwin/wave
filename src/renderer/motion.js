'use strict';
// One animation owner per surface. New intent cancels the old completion callback.
function createMotion({reduced=()=>false,style=node=>getComputedStyle(node)}={}){
 const jobs=new WeakMap();
 function cancel(node){const job=jobs.get(node);if(job){jobs.delete(node);clearTimeout(job.timer);job.animation?.cancel();job.resolve(false);}}
 function run(node,frames,duration,done){const current=style(node),from={opacity:current.opacity,transform:current.transform};cancel(node);
  if(!node.animate){done?.();return Promise.resolve(true);}
  return new Promise(resolve=>{const job={resolve};jobs.set(node,job);const complete=()=>{if(jobs.get(node)!==job)return;jobs.delete(node);clearTimeout(job.timer);done?.();job.animation.cancel();resolve(true);};
   job.animation=node.animate(frames(from),{duration,easing:'cubic-bezier(0.2, 0, 0, 1)',fill:'both'});
   // Chromium can suspend animation frames in an occluded window. Dialog state must still settle.
   job.timer=setTimeout(complete,duration+50);job.animation.finished.then(complete,()=>{if(jobs.get(node)===job)cancel(node);});
  });
 }
 return{cancel,enter(dialog,resuming=false){const node=dialog.querySelector?.('.modal-card,.song-card')||dialog;const quiet=reduced();return run(node,from=>[{opacity:resuming?from.opacity:0,...(!quiet?{transform:resuming?from.transform:'translateY(12px)'}:{})},{opacity:1,...(!quiet?{transform:'none'}:{})}],quiet?100:300);},
  exit(dialog,allowed=()=>true){const node=dialog.querySelector?.('.modal-card,.song-card')||dialog,quiet=reduced();return run(node,from=>[{opacity:from.opacity,...(!quiet?{transform:from.transform}:{})},{opacity:0,...(!quiet?{transform:'translateY(-12px)'}:{})}],quiet?100:150,()=>{if(allowed())dialog.close();});}};
}
if(typeof module!=='undefined')module.exports={createMotion};
if(typeof window!=='undefined'){
 window.WaveMotion=createMotion({reduced:()=>matchMedia('(prefers-reduced-motion: reduce)').matches});
 const watch=dialog=>{new MutationObserver(()=>{if(dialog.open)window.WaveMotion.enter(dialog);}).observe(dialog,{attributes:true,attributeFilter:['open']});
  if(!dialog.classList.contains('modal-overlay'))dialog.addEventListener('cancel',event=>{event.preventDefault();window.WaveMotion.exit(dialog);});};
 for(const dialog of document.querySelectorAll('dialog'))watch(dialog);
 new MutationObserver(records=>{for(const record of records)for(const node of record.addedNodes)if(node.nodeType===1){if(node.matches('dialog'))watch(node);for(const dialog of node.querySelectorAll('dialog'))watch(dialog);}}).observe(document.body,{childList:true});
}
