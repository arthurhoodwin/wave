'use strict';
async function repairLegacyAliases({provider,library,root,rows,signal,attempted}){
 if(!provider.network?.resolveAudio||!provider.online)return;
 const account=await library.account(root),epoch=provider.network.accountEpoch;
 const valid=()=>!signal.aborted&&provider.root===root&&!provider.authTransition&&!provider.closing&&provider.network.accountEpoch===epoch;
 const copies=new Map();for(const d of account.data.downloads){const key=JSON.stringify([d.track.title,d.track.artist]);if(!copies.has(key))copies.set(key,[]);copies.get(key).push(d.track);}
 let budget=3;
 for(const row of rows){
  if(!valid()||!budget)break;if(account.data.downloadAliases[row.key]||account.data.downloads.some(d=>d.track.key===row.key)||attempted.has(root+':'+row.key))continue;
  const candidates=(copies.get(JSON.stringify([row.title,row.artist]))||[]).filter(t=>Math.abs(t.duration-row.duration)<=3);if(candidates.length!==1)continue;
  const source=candidates[0];attempted.add(root+':'+row.key);budget--;
  try{
   // Metadata only narrows candidates. Equality of the actual permitted media
   // resource is required; names/durations never establish identity themselves.
   const a=await provider.network.resolveAudio(source.key,{priority:'background',signal});if(!valid())break;
   const b=await provider.network.resolveAudio(row.key,{priority:'background',signal});if(!valid())break;
   if(a.format!==b.format||!['audio','hls'].includes(a.format))continue;
   const {mediaUrl}=require('../media-proxy.cjs');if(mediaUrl(a.url).href!==mediaUrl(b.url).href)continue;
   account.data.downloadAliases[row.key]=source.key;await library.save(account);if(valid())library.changed(root);
  }catch{if(signal.aborted)break;}
 }
}
function attachDownloadPreferences({provider,library,downloads,notice=()=>{}}){
 const attempted=new Set();provider.preferenceController=new AbortController();
 provider.onLikedOrder=(root,rows,aliases)=>{const snapshot=rows.map(t=>({...t})),links=aliases?{root:aliases.root,keys:new Map(aliases.keys)}:null;provider.likedOrderTask=Promise.resolve(provider.likedOrderTask).then(()=>library.saveLikedOrder(root,snapshot,links)).then(()=>{if(!provider.aliasRepairTask){const signal=AbortSignal.any([provider.preferenceController.signal,AbortSignal.timeout(20000)]);provider.aliasRepairTask=repairLegacyAliases({provider,library,root,rows:snapshot,signal,attempted}).catch(()=>{}).finally(()=>provider.aliasRepairTask=null);}}).catch(()=>{});};
 provider.onConfirmedLike=(root,track,libraryKey)=>{const snapshot={...track};provider.autoLikeTask=Promise.resolve(provider.autoLikeTask).then(async()=>{const account=await library.account(root);if(provider.root!==root||provider.authTransition)return;if(libraryKey&&libraryKey!==snapshot.key){account.data.downloadAliases[libraryKey]=account.data.downloadAliases[snapshot.key]||snapshot.key;await library.save(account);library.changed(root);}if(provider.root===root&&!provider.closing&&!provider.authTransition&&account.data.autoDownloadLikes&&provider.online)await downloads.add(root,[snapshot]);}).catch(()=>{if(provider.root===root)notice('Песня добавлена в «Мне нравится», но загрузку поставить в очередь не удалось.');});};
}
module.exports={attachDownloadPreferences,repairLegacyAliases};
