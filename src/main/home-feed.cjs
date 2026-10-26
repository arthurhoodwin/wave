'use strict';
const {createHash}=require('node:crypto');
const definitions=[
 {id:'genres',match:/жанр|genres?/i},{id:'moods',match:/настроен|заняти|moods?|activities/i},
 {id:'for-you',match:/для вас|рекомендации|for you|recommendations|собрано алгоритмами/i},
 {id:'daily',match:/плейлист.{0,8}дня|daily|day.?s playlists/i},
 {id:'new-releases',match:/новые релизы|новые альбомы|new releases|new albums/i},
 {id:'editorial',match:/выбор редакции|собрано редакцией|editorial|editor.?s picks/i},
 {id:'trending',match:/оставаться в тренде|trending/i},{id:'similar',match:/^похоже на|^similar to/i},
 {id:'community',match:/слушайте друг друга|community playlists/i}
];
const list=x=>Array.isArray(x)?x:[],title=x=>typeof x==='string'?x.replace(/\s+/g,' ').trim():'',supported=new Set(['music_playlists','music_recommended_playlists','music_audios']);
const ownSection=s=>/^(моя музыка|my music|my library|радио|radio|обновления|updates)$/i.test(title(s?.title));
const ownHeading=t=>/^(мои |моя |недавно |история|my |recently |recent |друзья|музыка друзей)/i.test(t);
function blocks(section){let heading=title(section?.title);return list(section?.blocks).filter(b=>b&&typeof b==='object').map(block=>{
 heading=title(block.title)||title(block.layout?.title)||heading;
 const type=block.data_type;if(!supported.has(type)||ownSection(section)||ownHeading(heading)||!heading)return{block};
 const role=definitions.find(d=>d.match.test(heading)),key=role?.id||'vk-'+createHash('sha256').update(String(block.id||heading+'|'+type)).digest('hex').slice(0,16),tracks=type==='music_audios';
 return{block,target:{id:key+(tracks&&key!=='similar'?'-tracks':''),title:heading,type:tracks?'tracks':'playlists'}};
});}
function collectFeed(data,helpers){
 const playlists=new Map(list(data.playlists).map(p=>[helpers.keyOf(p),p])),audios=new Map(list(data.audios).map(a=>[String(a.owner_id)+'_'+a.id,a])),groups=new Map();
 helpers.rememberPlaylist(list(data.playlists));helpers.rememberAudio?.(list(data.audios));
 for(const section of [...list(data.catalog?.sections),...(data.section?[data.section]:[])])for(const {block,target} of blocks(section)){
  if(!target||target.type==='tracks'&&!helpers.audioRow)continue;const field=target.type==='tracks'?'audios_ids':'playlists_ids';if(!Array.isArray(block[field]))continue;
  let group=groups.get(target.id);if(!group){group={...target,items:[],partial:false};groups.set(target.id,group);}const limit=target.type==='tracks'?10:30;
  for(const key of block[field]){if(group.items.length>=limit)break;let item;if(target.type==='tracks'){const raw=audios.get(String(key));item=raw&&helpers.audioRow(raw,group.items.length);}else{const raw=playlists.get(String(key));item=raw&&helpers.playlistRow(raw,group.items.length);if(item)item={...item,kind:item.kind==='album'||raw.type==='album'?'album':'playlist'};}
   if(!item){group.partial=true;continue;}const identity=target.type==='tracks'?'key':'vkId';if(!group.items.some(p=>p[identity]===item[identity]))group.items.push(item);
  }
 }
 return [...groups.values()].filter(g=>g.items.length);
}
async function readFeed(client,helpers,{fresh=false}={}){
 await client.connect();const epoch=client.accountEpoch,check=()=>{if(epoch!==client.accountEpoch)throw Object.assign(Error('Аккаунт изменился'),{kind:'account-changed'});};
 const initial=await client.call('catalog.getAudio',{url:'https://vk.ru/audio',need_blocks:1},{priority:'background',fresh});check();
 if(!Array.isArray(initial?.catalog?.sections))throw Object.assign(Error('VK не вернул структуру подборок'),{kind:'protocol'});
 const all={playlists:[...list(initial.playlists)],audios:[...list(initial.audios)],catalog:{sections:[...initial.catalog.sections]}},failed=new Set();let partial=false,budget=10;
 const merge=page=>{all.playlists.push(...list(page.playlists));all.audios.push(...list(page.audios));};
 const read=async(method,params,target)=>{check();try{const page=await client.call(method,params,{priority:'background',fresh});check();return page;}catch(e){check();if(['auth','cancelled','account-changed','closed'].includes(e.kind))throw e;partial=true;if(target)failed.add(target.id);return null;}};
 const deferred=initial.catalog.sections.filter(s=>s&&typeof s.id==='string'&&!ownSection(s)&&(/^(обзор|browse|explore)$/i.test(title(s.title))||definitions.some(d=>d.match.test(title(s.title)))&&!list(s.blocks).some(b=>supported.has(b?.data_type))));
 for(const section of deferred.slice(0,3)){if(section.id.length>4096||budget<=0)continue;budget--;const page=await read('catalog.getSection',{section_id:section.id});if(!page?.section){partial=true;continue;}merge(page);const index=all.catalog.sections.findIndex(s=>s.id===section.id);all.catalog.sections[index]={...page.section,title:title(page.section.title)||title(section.title)};}
 for(const section of [...all.catalog.sections])for(const {block,target} of blocks(section)){
  if(!target||!block.next_from)continue;const field=target.type==='tracks'?'audios_ids':'playlists_ids',limit=target.type==='tracks'?10:30;let cursor=block.next_from,blockId=block.id,pages=0;const seen=new Set();
  while(cursor&&budget>0&&pages++<3){
   if((collectFeed(all,helpers).find(s=>s.id===target.id)?.items.length||0)>=limit)break;
   if(typeof cursor!=='string'||cursor.length>4096||typeof blockId!=='string'||blockId.length>4096||seen.has(cursor)){partial=true;failed.add(target.id);break;}seen.add(cursor);budget--;
   const page=await read('catalog.getBlockItems',{block_id:blockId,start_from:cursor,count:30},target);
   if(!page?.block||!Array.isArray(page.block[field])||page.block.data_type&&page.block.data_type!==block.data_type){partial=true;failed.add(target.id);break;}
   merge(page);all.catalog.sections.push({title:target.title,blocks:[{...page.block,id:block.id,title:target.title,data_type:block.data_type}]});cursor=page.block.next_from;blockId=page.block.id||blockId;
  }
 }
 check();const sections=collectFeed(all,helpers);for(const section of sections)if(section.partial)failed.add(section.id);
 return{state:sections.length?'ready':'unavailable',reason:sections.length?undefined:'empty',sections,partial:partial||sections.some(s=>s.partial),failedSectionIds:[...failed]};
}
module.exports={collectFeed,readFeed,blocks};
