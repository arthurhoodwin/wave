'use strict';
const {cover,artistRoute}=require('./navigation-meta.cjs');
const TYPES=['tracks','artists','albums','playlists'];
const titles={tracks:/^(Все треки|Треки|All tracks|Songs)$/i,artists:/^(Музыканты|Исполнители|Artists|Musicians)$/i,albums:/^(Альбомы|Albums)$/i,playlists:/^(Все плейлисты|Плейлисты|All playlists|Playlists)$/i};
function image(value){if(typeof value==='string')return cover(value);if(Array.isArray(value))return image(value.at(-1));return cover(value?.url||value?.photo_300||value?.photo_270||value?.photo_135||value?.photo_68);}
function artistEntity(link){const route=artistRoute(link?.url);if(!route?.includes('/artist/')||typeof link.title!=='string'||!link.title.trim())return null;return{nativeId:route.split('/').at(-1),name:link.title.trim(),cover:image(link.image),route};}
function parsePage(data,block,type,helpers){const ids=block?block[type==='tracks'?'audios_ids':type==='artists'?'links_ids':'playlists_ids']:[];if(!Array.isArray(ids))throw Error('VK вернул некорректный раздел поиска. Повторите запрос.');
 if(type==='tracks'){const byId=new Map((data.audios||[]).map(a=>[helpers.keyOf(a),a]));const items=ids.map(id=>byId.get(String(id))).filter(Boolean);if(items.length!==ids.length)throw Error('VK вернул неполный раздел песен. Повторите запрос.');helpers.rememberAudio(items);return{rows:items.map(helpers.audioRow).filter(Boolean),entities:[]};}
 if(type==='artists'){const links=new Map((data.links||[]).map(l=>[String(l.id),l]));if(ids.some(id=>!links.has(String(id))))throw Error('VK вернул неполный раздел исполнителей. Повторите запрос.');return{rows:[],entities:ids.map(id=>artistEntity(links.get(String(id)))).filter(Boolean)};}
 const byId=new Map((data.playlists||[]).map(p=>[helpers.keyOf(p),p]));const items=ids.map(id=>byId.get(String(id))).filter(Boolean);if(items.length!==ids.length)throw Error('VK вернул неполный раздел подборок. Повторите запрос.');helpers.rememberPlaylist(items);return{rows:[],entities:items.filter(p=>type==='albums'?p.type==='album':p.type!=='album').map(helpers.playlistRow).filter(Boolean)};
}
class CatalogSearch{
 constructor(client,helpers){this.client=client;this.helpers=helpers;this.cache=new Map();}
 clear(){this.cache.clear();}
 async read(query,{type='tracks',signal,cursor,refresh=false}={}){if(!TYPES.includes(type))throw Error('Неизвестный раздел поиска');const api=this.client;await api.connect();const epoch=api.accountEpoch;if(signal?.aborted)throw Object.assign(Error('Поиск отменён'),{kind:'cancelled'});let data,block;
  if(cursor){if(cursor.epoch!==epoch)throw Error('Аккаунт изменился. Повторите поиск.');data=await api.call('catalog.getBlockItems',{block_id:cursor.blockId,start_from:cursor.nextFrom,count:50},{signal});block=data?.block;if(!block)throw Error('VK не вернул продолжение поиска. Повторите запрос.');if(block.next_from&&cursor.seen.includes(block.next_from))throw Error('VK повторил страницу поиска. Повторите запрос.');}
  else{if(refresh)this.cache.delete(query);const saved=this.cache.get(query);if(saved&&saved.epoch===epoch&&saved.until>api.now())data=saved.data;else{data=await api.call('catalog.getAudioSearch',{query,need_blocks:1},{signal});if(!Array.isArray(data?.catalog?.sections))throw Error('VK не вернул каталог поиска. Повторите запрос.');if(signal?.aborted||epoch!==api.accountEpoch)throw Object.assign(Error('Поиск отменён'),{kind:'cancelled'});this.cache.set(query,{data,epoch,until:api.now()+60000});while(this.cache.size>4)this.cache.delete(this.cache.keys().next().value);}
   const section=data.catalog.sections.find(s=>String(s.id)===String(data.catalog.default_section))||data.catalog.sections.find(s=>/Результаты поиска|Search results/i.test(s.title||''))||data.catalog.sections[0];block=section?.blocks?.find(b=>titles[type].test(b.title||''));
   if(!block&&section?.blocks?.some(b=>b.data_type==='search_suggestions'))throw Error('VK вернул подсказки вместо результатов. Повторите запрос.');
  }
  const result=parsePage(data,block,type,this.helpers);return{...result,type,partial:!!block?.next_from,cursor:block?.next_from?{epoch,blockId:block.id,nextFrom:block.next_from,seen:[...(cursor?.seen||[]),block.next_from]}:null};
 }
}
module.exports={CatalogSearch,parsePage,artistEntity,TYPES};
