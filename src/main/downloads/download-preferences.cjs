'use strict';
function attachDownloadPreferences({provider,library,downloads,notice=()=>{}}){
 provider.onLikedOrder=(root,rows,aliases)=>{const snapshot=rows.map(t=>({key:t.key})),links=aliases?{root:aliases.root,keys:new Map(aliases.keys)}:null;provider.likedOrderTask=Promise.resolve(provider.likedOrderTask).then(()=>library.saveLikedOrder(root,snapshot,links)).catch(()=>{});};
 provider.onConfirmedLike=(root,track)=>{const snapshot={...track};provider.autoLikeTask=Promise.resolve(provider.autoLikeTask).then(async()=>{const account=await library.account(root);if(provider.root===root&&!provider.closing&&!provider.authTransition&&account.data.autoDownloadLikes&&provider.online)await downloads.add(root,[snapshot]);}).catch(()=>{if(provider.root===root)notice('Песня добавлена в «Мне нравится», но загрузку поставить в очередь не удалось.');});};
}
module.exports={attachDownloadPreferences};
