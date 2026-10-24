'use strict';
function positiveId(value){if(typeof value==='string'&&/^[1-9]\d*$/.test(value))value=Number(value);return Number.isSafeInteger(value)&&value>0?value:null;}
function addedIdentity(result,accountId){const direct=positiveId(result);if(direct)return accountId+'_'+direct;if(!result||typeof result!=='object'||Array.isArray(result)||result.error||result.success===false||result.success===0)return null;const owner=result.owner_id===undefined?accountId:positiveId(result.owner_id);if(owner!==accountId)return null;const id=positiveId(result.audio_id)??positiveId(result.id);return id?owner+'_'+id:null;}
async function verifyOnce(client,desired,track,root,targetKey){
 let library;try{library=await client.library({fresh:true,priority:'interactive'});}catch{throw Object.assign(Error('Не удалось проверить изменение в VK. Откройте «Мне нравится», прежде чем повторять действие.'),{uncertain:true});}
 if(root!=='/audios'+client.accountId)throw Object.assign(Error('Аккаунт изменился. Проверьте коллекцию в VK.'),{uncertain:true});
 const rows=library.rows||[],exact=rows.find(row=>row.key===(desired?track.key:targetKey)),same=rows.filter(row=>row.title===track.title&&row.artist===track.artist&&row.duration===track.duration),found=exact||(same.length===1?same[0]:null);
 if(desired?!found:!!exact||same.length>0)throw Object.assign(Error('Не удалось однозначно проверить изменение в VK. Откройте «Мне нравится», прежде чем повторять действие.'),{uncertain:true});
 return{...library,owned:desired,changed:true,acknowledged:true,verifiedFromLibrary:true,sourceKey:track.key,libraryKey:desired?found.key:targetKey,likedRow:desired?found:undefined};
}
async function quickOwnership(client,command,context,onStage){
 await client.connect();if(context.root!=='/audios'+client.accountId)throw Error('Аккаунт изменился. Повторите действие.');const desired=command.action==='like',track=context.track;let target=track;
 if(!desired){const rows=context.membershipRows||[],exact=rows.find(t=>t.key===track.key),alias=context.membershipAlias&&rows.find(t=>t.key===context.membershipAlias),same=rows.filter(t=>t.title===track.title&&t.artist===track.artist&&t.duration===track.duration);target=exact||alias||(same.length===1?same[0]:null);if(!target){const ref=client.parseIdentity(track.key);if(ref.owner===client.accountId)target=track;else return client.own(command,{...context,quickOwnership:false},onStage);}}
 const ref=client.audioRefs.get(target.key)||client.parseIdentity(target.key);if(!desired&&ref.owner!==client.accountId)throw Error('Выберите запись из «Мне нравится»');onStage('syncing');const result=await client.call(desired?'audio.add':'audio.delete',{owner_id:ref.owner,audio_id:ref.id,access_key:ref.accessKey},{write:true});
 const libraryKey=desired?addedIdentity(result,client.accountId):target.key,deletionAccepted=!desired&&(result===1||result==='1'||result===true||result?.success===1||result?.success===true);
 // A response shape is not proof of failure. Never repeat a write just to learn its result.
 if(desired?!libraryKey:!deletionAccepted){onStage('checking');return verifyOnce(client,desired,track,context.root,target.key);}
 return{owned:desired,changed:true,acknowledged:true,sourceKey:track.key,libraryKey,likedRow:desired?{...track,key:libraryKey,owned:true,index:0}:undefined,route:'https://vk.ru'+context.root+'?section=all'};
}
module.exports={quickOwnership,addedIdentity,positiveId};
