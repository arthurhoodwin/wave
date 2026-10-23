'use strict';
// Runs only in the isolated VK content window; no authorization data is returned.
function collect(scope){
 const root=document.querySelector(scope);if(!root)return{route:location.href,rows:[],playlists:[]};
 const artwork=node=>{if(!node)return;const image=node.querySelector('img');if(image)return image.src;const bg=node.querySelector('[style*="background-image"]')?.style.backgroundImage;return bg?.startsWith('url(')?bg.slice(4,-1).replace(/^["']|["']$/g,''):undefined;};
 const rows=Array.from(root.querySelectorAll('[data-testid="MusicTrackRow"]')).map((row,index)=>{
  const authors=[...row.querySelectorAll('[data-testid="MusicTrackRow_Authors"]')].map(n=>({name:n.textContent?.trim(),route:n.getAttribute('href')})).filter(a=>a.name);const title=row.querySelector('[data-testid="MusicTrackRow_Title"]');const tap=row.querySelector('[data-testid="audiorow-tappable"]');
  return{index,key:row.closest('[data-audio-id]')?.getAttribute('data-audio-id'),title:title?.textContent?.trim(),artist:authors.map(a=>a.name).join(', '),artists:authors,artistRoute:row.querySelector('[data-testid="MusicTrackRow_Authors"]')?.getAttribute('href'),cover:row.querySelector('[data-testid="MusicTrackRow_PlaybackControls"] img')?.src,time:row.querySelector('[data-testid="MusicTrackRow_Duration"]')?.textContent?.trim(),available:!!tap&&tap.getAttribute('aria-disabled')!=='true'&&!title?.matches('[disabled],[aria-disabled="true"]')&&!title?.querySelector('[disabled],[aria-disabled="true"]')};
 });
 const playlists=Array.from(document.querySelectorAll('[data-testid="AudioCatalog_SectionPlaylists"] [data-testid="MusicPlaylistItem_Cell"]')).map((row,index)=>({index,vkId:row.getAttribute('data-id'),editable:!!row.querySelector('[data-testid="MusicPlaylist_OpenEditing"]'),title:row.querySelector('[data-testid="MusicPlaylistItem_Title"]')?.textContent?.trim(),owner:row.querySelector('[data-testid="MusicPlaylistItem_AuthorLink"]')?.textContent?.trim()||'',cover:artwork(row.querySelector('[data-testid="MusicPlaylistItem_PreviewImage"]'))})).filter(p=>p.title);
 const count=root.querySelector('[data-testid="musicplayliststatistics-count"]')?.textContent?.trim()||'';
 let total=/^\d[\d\s]*$/.test(count)?Number(count.replace(/\s/g,'')):null;
 if(scope==='[data-testid="AudioCatalog_SectionTracks"]'){
  const fiberKey=Object.keys(root).find(k=>k.startsWith('__reactFiber'));const fiber=fiberKey?root[fiberKey]:null;const counts=[];const seen=new Set();
  const scan=(node,depth)=>{if(!node||typeof node!=='object'||depth>7||seen.has(node))return;seen.add(node);
   const actions=node.props?.model?.raw?.data?.actions;if(Array.isArray(actions))for(const action of actions)if(Number.isSafeInteger(action.ref_items_count)&&action.ref_items_count>=0)counts.push(action.ref_items_count);
   if(Array.isArray(node))for(const child of node)scan(child,depth+1);else{scan(node.children,depth+1);scan(node.props?.children,depth+1);}
  };scan(fiber?.memoizedProps?.children,0);
  if(counts.length&&counts.every(n=>n===counts[0]))total=counts[0];
 }
 return{route:location.href,rows,playlists,total,cover:artwork(root.querySelector('[data-testid="audiolistboxheader-cover"]'))};
}
function artistInfo(){
 const artwork=node=>{if(!node)return;const image=node.querySelector('img');if(image)return image.src;const bg=node.querySelector('[style*="background-image"]')?.style.backgroundImage;return bg?.startsWith('url(')?bg.slice(4,-1).replace(/^["']|["']$/g,''):undefined;};
 return{albums:[...document.querySelectorAll('[data-testid="MusicPlaylistItem_Cell"]')].map((row,index)=>({index,section:/^Участие в\s*релизах/i.test(row.closest('[data-testid="AudioCatalog_Section"]')?.innerText?.trim()||'')?'contribution':/^(Релизы|Альбомы|Синглы)/i.test(row.closest('[data-testid="AudioCatalog_Section"]')?.innerText?.trim()||'')?'release':null,title:row.querySelector('[data-testid="MusicPlaylistItem_Title"]')?.textContent?.trim(),owner:row.querySelector('[data-testid="MusicPlaylistItem_AuthorLink"]')?.textContent?.trim()||'',cover:artwork(row.querySelector('[data-testid="MusicPlaylistItem_PreviewImage"]'))})).filter(row=>row.section)};
}
async function scrollScope(scope,reset=false){
 const root=document.querySelector(scope);if(!root)return false;
 const expand=root.querySelector('[data-testid="audiolistitems-expandbutton"]');
 if(!reset&&expand){expand.click();return true;}
 let scroll=root;while(scroll&&!(scroll.scrollHeight>scroll.clientHeight+5&&/auto|scroll/.test(getComputedStyle(scroll).overflowY)))scroll=scroll.parentElement;
 scroll=scroll||document.scrollingElement;
 if(reset){if(scroll===document.scrollingElement)root.scrollIntoView({block:'start'});else scroll.scrollTop=0;}
 else {
  // VK reuses its pagination sentinel. Leave its viewport before re-entering,
  // otherwise repeated assignments to an unchanged scrollTop produce no event.
  const bottom=Math.max(0,scroll.scrollHeight-scroll.clientHeight);
  if(scroll.scrollTop>=bottom-10){scroll.scrollTop=Math.max(0,bottom-Math.max(500,scroll.clientHeight));await new Promise(r=>setTimeout(r,120));}
  scroll.scrollTop=scroll.scrollHeight;
 }
 return true;
}
function findAndPlay(track){
 const root=document.querySelector(track.scope);if(!root)return false;
 const row=Array.from(root.querySelectorAll('[data-testid="MusicTrackRow"]')).find(x=>x.closest('[data-audio-id]')?.getAttribute('data-audio-id')===track.key&&x.querySelector('[data-testid="MusicTrackRow_Title"]')?.textContent?.trim()===track.title);
 const tap=row?.querySelector('[data-testid="audiorow-tappable"]');if(!tap)return false;
 if(!tap.getAttribute('aria-label')?.toLowerCase().includes('пауз'))tap.click();return true;
}
function waitForRows(scope,previousCount,timeoutMs){
 const root=document.querySelector(scope);if(!root)return Promise.resolve(false);
 if(root.querySelectorAll('[data-testid="MusicTrackRow"]').length!==previousCount)return Promise.resolve(true);
 return new Promise(resolve=>{let timer;const finish=value=>{observer.disconnect();clearTimeout(timer);resolve(value);};const observer=new MutationObserver(()=>{if(root.querySelectorAll('[data-testid="MusicTrackRow"]').length!==previousCount)finish(true);});observer.observe(root,{childList:true,subtree:true});timer=setTimeout(()=>finish(false),timeoutMs);});
}
const call=(fn,...args)=>`(${fn.toString()})(${args.map(a=>JSON.stringify(a)).join(',')})`;
module.exports={collect,artistInfo,scrollScope,findAndPlay,waitForRows,call};
