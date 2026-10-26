'use strict';
const {randomUUID}=require('node:crypto');
const {audioRow,keyOf}=require('./vk-http.cjs');
const HOSTS=new Set(['vk.com','vk.ru','www.vk.com','www.vk.ru','m.vk.com','m.vk.ru']);
function identity(value){
 const m=/^(-?[1-9]\d*)_([1-9]\d*)(?:_([a-zA-Z0-9_-]{1,128}))?$/.exec(value||'');
 if(!m||!Number.isSafeInteger(Number(m[1]))||!Number.isSafeInteger(Number(m[2])))throw Error('Некорректная музыкальная ссылка VK');
 return {key:m[1]+'_'+m[2],owner:Number(m[1]),id:Number(m[2]),...(m[3]?{accessKey:m[3]}:{})};
}
function parseMusicLink(input){
 if(typeof input!=='string'||input.length>2048||/[\x00-\x20\\]/.test(input.trim())||/(?:^|\/)(?:\.|%2e){1,2}(?:\/|[?#]|$)/i.test(input))throw Error('Вставьте музыкальную ссылку VK');
 let u;try{u=new URL(input.trim().replace(/^(?=(?:www\.|m\.)?vk\.(?:com|ru)\/)/i,'https://'));}catch{throw Error('Вставьте музыкальную ссылку VK');}
 if(u.protocol!=='https:'||!HOSTS.has(u.hostname)||u.port||u.username||u.password||u.hash)throw Error('Поддерживаются только музыкальные ссылки VK');
 let kind,value,m;
 if((m=/^\/audio(-?\d+_\d+(?:_[\w-]+)?)\/?$/.exec(u.pathname))){kind='track';value=m[1];}
 else if((m=/^\/music\/(album|playlist)\/(-?\d+_\d+(?:_[\w-]+)?)\/?$/.exec(u.pathname))){kind=m[1];value=m[2];}
 else if(/^\/(?:audio|audios-?\d+)\/?$/.test(u.pathname)&&u.searchParams.getAll('z').length===1){m=/^(audio_playlist|audio)(-?\d+_\d+(?:_[\w-]+)?)$/.exec(u.searchParams.get('z'));if(m){kind=m[1]==='audio'?'track':'playlist';value=m[2];}}
 if(!kind)throw Error('Эта ссылка не ведёт на песню, альбом или плейлист VK');
 for(const name of u.searchParams.keys())if(!['z','section','from','ref'].includes(name))throw Error('Неподдерживаемые параметры музыкальной ссылки');
 return {kind,...identity(value)};
}
function canonicalLink(kind,key){if(!['track','album','playlist'].includes(kind))throw Error('Неизвестный тип музыки');const ref=identity(key);return 'https://vk.ru/'+(kind==='track'?'audio':`music/${kind}/`)+ref.key;}
function ready(p){if(!p.root||p.authTransition||!p.online||!p.network)throw Error('Для открытия ссылки подключитесь к VK');}
function resolveMusicLink(p,url){
 ready(p);const ref=parseMusicLink(url),root=p.root;
 if(ref.kind==='track'){
  p.musicLinkRefs??=new Map();const id=randomUUID();p.musicLinkRefs.set(id,{...ref,root});while(p.musicLinkRefs.size>32)p.musicLinkRefs.delete(p.musicLinkRefs.keys().next().value);
  return {route:{type:'musicLink',id,title:'Песня VK'}};
 }
 if(ref.accessKey)p.network.playlistRefs.set(ref.key,{owner:ref.owner,id:ref.id,accessKey:ref.accessKey});
 const signature=JSON.stringify(['vk',ref.key]);let id=p.playlistHandles.get(signature);if(!id){id=randomUUID();p.playlistHandles.set(signature,id);}
 p.playlists.set(id,{...p.playlists.get(id),id,vkId:ref.key,kind:ref.kind,title:p.playlists.get(id)?.title||'Музыка VK',route:'https://vk.ru'+root+'?section=all'});
 return {route:{type:ref.kind,id,title:'Музыка VK'}};
}
async function linkedTrack(p,id){
 ready(p);const ref=p.musicLinkRefs?.get(id);if(!ref||ref.root!==p.root)throw Error('Откройте музыкальную ссылку снова');
 const root=p.root,epoch=p.network.accountEpoch,entry={kind:'musicLink',scope:'body',items:new Map()};p.collection=entry;
 const data=await p.network.call('audio.getById',{audios:ref.key+(ref.accessKey?'_'+ref.accessKey:''),need_more:1});
 if(p.root!==root||p.authTransition||p.network.accountEpoch!==epoch)throw Error('Аккаунт изменился');
 if(p.collection!==entry)return {tracks:[],partial:false,canceled:true};
 const items=Array.isArray(data)?data:data?.items,a=items?.find(a=>keyOf(a)===ref.key),row=a&&audioRow(a,0);
 if(!row)throw Error('Песня удалена или недоступна этому аккаунту VK');
 p.network.rememberAudio([a]);p.absorbRows({rows:[row],route:canonicalLink('track',ref.key)},entry);
 return {tracks:[...entry.items.values()],title:row.title,partial:false,total:1};
}
function copyMusicLink(p,command,write){
 if(!p.root||p.authTransition)throw Error('Сначала откройте музыку своего аккаунта');
 const {kind,id}=command;if(typeof id!=='string'||id.length>100||!['track','album','playlist'].includes(kind))throw Error('Некорректная команда ссылки');
 const item=kind==='track'?p.tracks.get(id):p.playlists.get(id);if(!item)throw Error('Откройте песню или список снова');if(item.generated)throw Error('VK не предоставляет обычную ссылку для этой алгоритмической подборки');
 const link=canonicalLink(kind,kind==='track'?item.key:item.vkId);write(link);return {copied:true};
}
module.exports={parseMusicLink,canonicalLink,resolveMusicLink,linkedTrack,copyMusicLink};
