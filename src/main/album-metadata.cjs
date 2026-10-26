'use strict';
const provisional=title=>typeof title!=='string'||!title.trim()||/^(unnamed|untitled)$/i.test(title.trim());
function applyAlbum(provider,id,meta){
 if(provider.closing)return;
 if(typeof meta?.title!=='string'||!meta.title.trim())return;
 const title=meta.title.trim(),confirmed=meta.albumTitleConfirmed===true,ids=new Set(),entries=new Set();let changed=false;
 const patch=track=>{
  if(!track||track.albumTitleConfirmed&&!confirmed)return;
  if(track.albumId!==id){
   if(!ids.has(track.id)){const album=provider.network?.audioRefs?.get(track.key)?.album;if(!album||String(album.owner_id)+'_'+album.id!==meta.vkId)return;}
   track.albumId=id;changed=true;
  }
  if(track.albumTitle!==title||confirmed&&!track.albumTitleConfirmed)changed=true;
  track.albumTitle=title;if(confirmed)track.albumTitleConfirmed=true;
 };
 for(const track of provider.tracks.values()){patch(track);if(track.albumId===id)ids.add(track.id);}
 patch(provider.active);patch(provider.nativePlayer?.current);
 for(const entry of [...provider.cache.entries.values(),...(provider.searchEntries?.values()||[])])for(const track of entry.items?.values()||[]){
  const before=JSON.stringify([track.albumId,track.albumTitle,track.albumTitleConfirmed]);patch(track);
  if(before!==JSON.stringify([track.albumId,track.albumTitle,track.albumTitleConfirmed]))entries.add(entry);
 }
 if(changed){provider.metadataRevision=(provider.metadataRevision||0)+1;for(const entry of entries)provider.cache.onChange?.(entry);if(confirmed&&provider.onAlbumMetadata){const change={root:provider.root,keys:[...new Set([...provider.tracks.values()].filter(t=>t.albumId===id&&t.key).map(t=>t.key))],album:{id,title,confirmed:true}};provider.albumMetadataTask=Promise.resolve(provider.albumMetadataTask).then(()=>provider.onAlbumMetadata(change)).catch(()=>{});}}
 return{id,title,confirmed};
}
module.exports={provisional,applyAlbum};
