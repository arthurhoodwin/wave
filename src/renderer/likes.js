'use strict';
function createLikes({send,targets,draw,apply,onError=()=>{}}){const pending=new Map();let epoch=0;
 return{pending:id=>pending.has(id),reset:()=>{epoch++;pending.clear();},async toggle(track){if(pending.has(track.id))return;const ticket=epoch,desired=!track.owned,previous=new Map();for(const target of new Set(targets(track))){previous.set(target,target.owned);target.owned=desired;}const initial=previous.get(track),restore=()=>{for(const [target,owned] of previous)target.owned=owned;for(const target of targets(track))if(!previous.has(target))target.owned=initial;};pending.set(track.id,{desired});draw();let committed=false;
  try{const result=await send({action:desired?'like':'unlike',trackId:track.id});if(ticket!==epoch)return;if(result?.ok===false||result?.operation?.state!=='success')throw Error(result?.error?.message||result?.operation?.message||'VK не подтвердил изменение. Повторите действие.');committed=true;apply(result);}
  catch(error){if(ticket===epoch){restore();onError(error);}}
  finally{if(ticket===epoch){pending.delete(track.id);if(!committed)restore();draw();}}
 }};
}
if(typeof module!=='undefined')module.exports={createLikes};
if(typeof window!=='undefined')window.WaveLikes=createLikes({send:command=>call('mutate',command),targets:track=>{const found=new Set([track]);for(const list of [state.allTracks,state.loop,state.history,state.current?[state.current]:[],...Array.from(cacheEntries.values(),e=>e.tracks||[]),...Array.from(navigation.snapshots.values(),e=>e.allTracks||[])])for(const item of list)if(item.id===track.id)found.add(item);return found;},draw:()=>{trackList();window.WaveSong?.controls();window.waveDesktop?.publish(true);},apply:result=>{window.WaveCollection?.apply(result);if(result.operation)state.operations=[...state.operations.filter(op=>op.id!==result.operation.id),result.operation].slice(-50);renderOperations();window.WavePersonal?.refresh();},onError:fail});
