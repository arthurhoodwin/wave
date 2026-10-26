'use strict';
(()=>{
 const provisional=title=>typeof title!=='string'||!title.trim()||/^(unnamed|untitled)$/i.test(title.trim());
 function apply(album,trackId){if(!album||typeof album.id!=='string'||typeof album.title!=='string')return;
  const targets=new Set([state.current,...state.allTracks,...state.tracks,...state.loop,...state.history]);
  for(const snapshot of navigation.snapshots.values())for(const t of snapshot.allTracks||[])targets.add(t);
  let changed=false;for(const t of targets){if(!t||t.id!==trackId&&t.albumId!==album.id)continue;if(t.albumTitleConfirmed&&!album.confirmed)continue;if(t.albumId!==album.id||t.albumTitle!==album.title||album.confirmed&&!t.albumTitleConfirmed)changed=true;t.albumId=album.id;t.albumTitle=album.title;if(album.confirmed)t.albumTitleConfirmed=true;}
  if(changed){state.loop=state.loop.slice();window.waveDesktop?.publish(true);}window.WaveSong?.controls();
 }
 window.WaveAlbumMeta={provisional,apply};
})();
