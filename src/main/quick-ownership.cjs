'use strict';
const uncertain=message=>Object.assign(Error(message),{uncertain:true});
function positiveId(value){if(typeof value==='string'&&/^[1-9]\d*$/.test(value))value=Number(value);return Number.isSafeInteger(value)&&value>0?value:null;}
function addedIdentity(result,accountId){const direct=positiveId(result);if(direct)return accountId+'_'+direct;if(!result||typeof result!=='object'||Array.isArray(result)||result.error||result.success===false||result.success===0)return null;const owner=result.owner_id===undefined?accountId:positiveId(result.owner_id);if(owner!==accountId)return null;const id=positiveId(result.audio_id)??positiveId(result.id);return id?owner+'_'+id:null;}
const text=value=>String(value||'').normalize('NFC').trim().replace(/\s+/g,' ').replace(/\s*,\s*/g,',').toLocaleLowerCase();
function sameRecording(a,b){return text(a.title)===text(b.title)&&text(a.artist)===text(b.artist)&&Number.isFinite(a.duration)&&Number.isFinite(b.duration)&&Math.abs(a.duration-b.duration)<=1;}
async function verifyOwnership(client,desired,track,context,targetKey,{restore=false,epoch}={}){
 const check=()=>{if(context.root!=='/audios'+client.accountId||epoch!==undefined&&client.accountEpoch!==epoch)throw uncertain('Аккаунт изменился. Проверьте коллекцию в VK.');};
 const before=new Set((context.membershipRows||[]).map(t=>t.key));
 for(let attempt=0;attempt<2;attempt++){
  check();let library;try{library=await client.library({fresh:true,priority:'interactive'});}catch{throw uncertain('Не удалось проверить изменение в VK. Проверьте «Мне нравится» перед повтором.');}check();
  if(!Array.isArray(library.rows))throw uncertain('VK не вернул список «Мне нравится». Проверьте его перед повтором.');
  const rows=library.rows,exact=rows.find(row=>row.key===(desired&&!restore?track.key:targetKey));let found=exact;
  if(desired&&!restore&&!found){const same=rows.filter(row=>sameRecording(row,track)),added=same.filter(row=>!before.has(row.key));found=added.length===1?added[0]:same.length===1?same[0]:null;}
  // Removing one known copy does not require deleting every same-titled version.
  if(desired?!!found:!exact)return{...library,owned:desired,changed:true,acknowledged:true,verifiedFromLibrary:true,sourceKey:track.key,libraryKey:desired?found.key:targetKey,likedRow:desired?found:undefined};
  if(attempt===0){await (client.sleep?client.sleep(250):new Promise(resolve=>setTimeout(resolve,250)));check();}
 }
 throw uncertain('VK пока не подтвердил изменение. Проверьте «Мне нравится» перед повтором.');
}
async function quickOwnership(client,command,context,onStage){
 await client.connect();if(context.root!=='/audios'+client.accountId)throw Error('Аккаунт изменился. Повторите действие.');const epoch=client.accountEpoch,desired=command.action==='like',track=context.track;let target=track;
 if(!desired){const rows=context.membershipRows||[],exact=rows.find(t=>t.key===track.key),alias=context.membershipAlias&&rows.find(t=>t.key===context.membershipAlias),same=rows.filter(t=>sameRecording(t,track)&&t.duration===track.duration);target=exact||alias||(same.length===1?same[0]:null);if(!target){const ref=client.parseIdentity(track.key);if(ref.owner===client.accountId)target=track;else return client.own(command,{...context,quickOwnership:false},onStage);}}
 const ref=client.audioRefs.get(target.key)||client.parseIdentity(target.key);if(!desired&&ref.owner!==client.accountId)throw Error('Выберите запись из «Мне нравится»');
 // A self-owned row removed from the library is restored, rather than copied from a deleted source.
 const restore=desired&&ref.owner===client.accountId,method=desired?(restore?'audio.restore':'audio.add'):'audio.delete';onStage('syncing');
 let result;try{result=await client.call(method,{owner_id:ref.owner,audio_id:ref.id,...(!restore?{access_key:ref.accessKey}:{})},{write:true});}catch(error){if(restore&&error.code===202)throw Error('Эту копию уже нельзя восстановить. Найдите песню через поиск и добавьте её заново.');throw error;}
 if(context.root!=='/audios'+client.accountId||epoch!==undefined&&client.accountEpoch!==epoch)throw uncertain('Аккаунт изменился. Проверьте коллекцию в VK.');
 const identity=desired?addedIdentity(result,client.accountId):target.key;
 const libraryKey=restore?(result&&typeof result==='object'&&identity===target.key?target.key:null):identity;
 const deletionAccepted=!desired&&(result===1||result==='1'||result===true||result?.success===1||result?.success===true);
 // Verification may repeat reads; an ambiguous write is never replayed.
 if(desired?!libraryKey:!deletionAccepted){onStage('checking');return verifyOwnership(client,desired,track,context,target.key,{restore,epoch});}
 return{owned:desired,changed:true,acknowledged:true,sourceKey:track.key,libraryKey,likedRow:desired?{...track,key:libraryKey,owned:true,index:0}:undefined,route:'https://vk.ru'+context.root+'?section=all'};
}
module.exports={quickOwnership,addedIdentity,positiveId,sameRecording};
