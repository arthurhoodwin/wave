'use strict';
const {randomUUID}=require('node:crypto'),{cover}=require('./navigation-meta.cjs'),{provisional,applyAlbum}=require('./album-metadata.cjs');
async function trackAlbum(provider,id){
 if(typeof id!=='string'||id.length>512)throw Error('Некорректная песня');const track=provider.tracks.get(id);if(!track)throw Error('Откройте список песни снова');if(!provider.root||provider.authTransition)throw Error('Аккаунт изменился');
 const known=provider.playlists.get(track.albumId),cached=known&&provider.cache.byPlaylist.get(track.albumId)?.cacheState==='complete';
 if(known?.kind==='album'&&(known.albumTitleConfirmed||!provisional(known.title)||!provider.online)){
  if(!provider.online&&!cached)throw Error('Этот альбом ещё не сохранён. Подключитесь к VK');applyAlbum(provider,track.albumId,known);return{id:track.albumId,title:known.title,cover:cover(known.cover),cached,confirmed:known.albumTitleConfirmed===true};
 }
 if(!provider.network||!provider.online||provider.authTransition)throw Error('Для поиска альбома подключитесь к VK');
 const root=provider.root,row=await provider.network.albumForTrack(track.key);if(provider.root!==root||provider.authTransition)throw Error('Аккаунт изменился');if(!row)return null;
 const signature=JSON.stringify(['vk',row.vkId]);let albumId=provider.playlistHandles.get(signature);if(!albumId){albumId=randomUUID();provider.playlistHandles.set(signature,albumId);}
 const previous=provider.playlists.get(albumId),meta=previous?.albumTitleConfirmed&&!row.albumTitleConfirmed?{...row,title:previous.title,albumTitleConfirmed:true}:row;
 provider.playlists.set(albumId,{...previous,...meta,kind:'album',editable:false,route:'https://vk.ru'+root+'?section=all'});
 for(const item of provider.tracks.values())if(item.key===track.key)item.albumId=albumId;
 applyAlbum(provider,albumId,meta);await provider.albumMetadataTask;provider.scheduleSave();return{id:albumId,title:meta.title,cover:cover(meta.cover),confirmed:meta.albumTitleConfirmed===true};
}
module.exports={trackAlbum};
