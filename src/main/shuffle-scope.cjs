'use strict';

const {createHash}=require('node:crypto');
const hash=value=>createHash('sha256').update(value).digest('hex').slice(0,32);

function shuffleScope(provider,input){
 if(!input||!['library','downloads','listenHistory','playlist','album'].includes(input.type)||
    !Array.isArray(input.ids)||input.ids.length>20000||input.ids.some(id=>typeof id!=='string'||id.length>512)||
    typeof input.filter!=='string'||input.filter.length>512||typeof input.sort!=='string'||input.sort.length>32||
    !provider.root||provider.authTransition)return null;
 const item=['playlist','album'].includes(input.type)?provider.playlists.get(input.id):null;
 if(['playlist','album'].includes(input.type)&&!item?.vkId)return null;
 const scope=hash(JSON.stringify([provider.root,input.type,item?.vkId||'',input.filter,input.sort]));
 const occurrences=new Map();
 const keys=input.ids.map(id=>{
  const key=provider.tracks.get(id)?.key;
  if(!key)return null;
  const index=occurrences.get(key)||0;
  occurrences.set(key,index+1);
  return hash(scope+'|'+key+'|'+index);
 });
 return {scope,keys};
}

module.exports={shuffleScope};
