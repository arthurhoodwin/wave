'use strict';
async function quickOwnership(client,command,context,onStage){
 await client.connect();if(context.root!=='/audios'+client.accountId)throw Error('Аккаунт изменился. Повторите действие.');const desired=command.action==='like',track=context.track;let target=track;
 if(!desired){const rows=context.membershipRows||[],exact=rows.find(t=>t.key===track.key),alias=context.membershipAlias&&rows.find(t=>t.key===context.membershipAlias),same=rows.filter(t=>t.title===track.title&&t.artist===track.artist&&t.duration===track.duration);target=exact||alias||(same.length===1?same[0]:null);if(!target){const ref=client.parseIdentity(track.key);if(ref.owner===client.accountId)target=track;else return client.own(command,{...context,quickOwnership:false},onStage);}}
 const ref=client.audioRefs.get(target.key)||client.parseIdentity(target.key);if(!desired&&ref.owner!==client.accountId)throw Error('Выберите запись из «Мне нравится»');onStage('syncing');const result=await client.call(desired?'audio.add':'audio.delete',{owner_id:ref.owner,audio_id:ref.id,access_key:ref.accessKey},{write:true});
 if(!Number.isSafeInteger(result)||(desired?result<=0:result!==1))throw Object.assign(Error('VK не подтвердил запись. Обновите «Мне нравится» перед повтором.'),{uncertain:true});
 const libraryKey=desired?client.accountId+'_'+result:target.key;return{owned:desired,changed:true,acknowledged:true,sourceKey:track.key,libraryKey,likedRow:desired?{...track,key:libraryKey,owned:true,index:0}:undefined,route:'https://vk.ru'+context.root+'?section=all'};
}
module.exports={quickOwnership};
