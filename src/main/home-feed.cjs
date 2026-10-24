'use strict';
const definitions=[{id:'for-you',title:'Для вас',match:/для вас|рекомендации|for you|recommendations/i},{id:'daily',title:'Плейлисты дня',match:/плейлист.{0,8}дня|сегодня|daily|day.?s playlists/i},{id:'new-releases',title:'Новые релизы',match:/новые релизы|новинки|new releases/i}];
const list=value=>Array.isArray(value)?value:[];
const title=value=>typeof value==='string'?value:'';
function blocks(section){let heading=title(section?.title);return list(section?.blocks).filter(b=>b&&typeof b==='object').map(block=>{heading=title(block.title)||title(block.layout?.title)||heading;return{block,target:definitions.find(d=>d.match.test(heading))};});}
function collectFeed(data,helpers){
 const playlists=new Map(list(data.playlists).map(p=>[helpers.keyOf(p),p])),groups=new Map();helpers.rememberPlaylist(list(data.playlists));
 for(const section of [...list(data.catalog?.sections),...(data.section?[data.section]:[])])for(const {block,target} of blocks(section)){
  if(!target||block.data_type!=='music_playlists'||!Array.isArray(block.playlists_ids))continue;const items=groups.get(target.id)||[];
  for(const key of block.playlists_ids){if(items.length>=30)break;const raw=playlists.get(String(key)),item=raw&&helpers.playlistRow(raw,items.length);if(item&&!items.some(p=>p.vkId===item.vkId))items.push({...item,kind:raw.type==='album'?'album':'playlist'});}groups.set(target.id,items);
 }
 return definitions.flatMap(d=>groups.get(d.id)?.length?[{id:d.id,title:d.title,items:groups.get(d.id)}]:[]);
}
async function readFeed(client,helpers){
 await client.connect();const epoch=client.accountEpoch,check=()=>{if(epoch!==client.accountEpoch)throw Error('Аккаунт изменился');};
 const data=await client.call('catalog.getAudio',{need_blocks:1},{priority:'background'});check();if(!Array.isArray(data?.catalog?.sections))throw Error('VK не вернул подборки');
 const all={playlists:[...list(data.playlists)],catalog:{sections:[...data.catalog.sections]}};let partial=false,budget=8;
 const read=async(method,params)=>{check();try{const page=await client.call(method,params,{priority:'background'});check();return page;}catch(e){check();if(['auth','cancelled','account-changed'].includes(e.kind))throw e;partial=true;return null;}};
 for(const section of data.catalog.sections.filter(s=>s&&definitions.some(d=>d.match.test(title(s.title)))&&!list(s.blocks).some(b=>b?.data_type==='music_playlists')).slice(0,3)){
  if(typeof section.id!=='string'||section.id.length>4096)continue;const part=await read('catalog.getSection',{section_id:section.id});if(part?.section){all.playlists.push(...list(part.playlists));all.catalog.sections.push({...part.section,title:title(part.section.title)||title(section.title)});}
 }
 for(const section of [...all.catalog.sections])for(const {block,target} of blocks(section)){
  if(!target||block.data_type!=='music_playlists'||!block.next_from)continue;let cursor=block.next_from,blockId=block.id,pages=0;const seen=new Set();
  while(cursor&&budget>0&&pages++<3){if(typeof cursor!=='string'||cursor.length>4096||typeof blockId!=='string'||blockId.length>4096||seen.has(cursor)){partial=true;break;}if((collectFeed(all,helpers).find(s=>s.id===target.id)?.items.length||0)>=30)break;seen.add(cursor);budget--;const part=await read('catalog.getBlockItems',{block_id:blockId,start_from:cursor,count:30});if(!part?.block||!Array.isArray(part.block.playlists_ids)){partial=true;break;}
   all.playlists.push(...list(part.playlists));all.catalog.sections.push({title:target.title,blocks:[{...part.block,title:target.title,data_type:'music_playlists'}]});cursor=part.block.next_from;blockId=part.block.id||blockId;
  }
 }
 check();const sections=collectFeed(all,helpers);return{state:sections.length?'ready':'unavailable',sections,partial};
}
module.exports={collectFeed,readFeed};
