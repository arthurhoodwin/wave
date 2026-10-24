'use strict';
const $=id=>document.getElementById(id),api=window.music;
const state={ready:false,online:false,sessionRevision:0,refreshing:false,stale:false,tracks:[],allTracks:[],visibleLimit:30,cacheId:null,cacheState:null,cacheTotal:undefined,playContext:null,pendingNext:false,pendingNextEnded:true,playlists:[],current:null,history:[],loop:[],shuffle:false,repeat:'off',playing:false,busy:false,request:0,loading:false,wasPlaying:false,duration:0,generation:0,route:{type:typeof window.music?.personal==='function'?'home':'library'},partial:false,volume:1,volumeBusy:false};
const playable=t=>!!t&&t.available!==false&&Number(t.duration)>0;
const has=name=>typeof api?.[name]==='function';
const format=n=>{n=Math.max(0,Math.floor(Number(n)||0));return `${Math.floor(n/60)}:${String(n%60).padStart(2,'0')}`;};
function message(text='',error=false){$('message').textContent=text;$('message').classList.toggle('error',error);}
function fail(e){message(e?.message||String(e)||'Не удалось выполнить действие',true);}
function requireResult(r){if(r&&((r.ok===false)||r.error))throw Object.assign(new Error(typeof r.error==='string'?r.error:r.error?.message||r.message||'Ошибка VK'),{kind:r.error?.kind,unavailableIds:r.error?.unavailableIds});return r;}
async function call(name,...args){if(!has(name))throw new Error('Эта функция пока недоступна. Обновите Wave.');return requireResult(await api[name](...args));}
function el(tag,cls,text){const x=document.createElement(tag);if(cls)x.className=cls;if(text!==undefined)x.textContent=text;return x;}
function mix(items){const a=items.slice();for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;}
function repeatLabel(){return state.repeat==='one'?'Повтор трека':state.repeat==='all'?'Повтор выбранной музыки':'Повтор выключен';}
function setIcon(node,name,fallback){if(window.WaveIcons)window.WaveIcons.set(node,name);else node.textContent=fallback;}
const trackNumberFormat=new Intl.NumberFormat('ru-RU'),trackPlural=new Intl.PluralRules('ru-RU');function countTracks(n){const form=trackPlural.select(n);return trackNumberFormat.format(n)+' '+(form==='one'?'трек':form==='few'?'трека':'треков');}
let controlsSignature;
function controls(){
 window.WaveUI?.ranges();window.WavePersonal?.controls();window.WaveRowActions?.update();
 window.waveDesktop?.publish();window.WaveSong?.controls();window.WaveCollection?.controls();
 const signature=JSON.stringify([state.refreshing,state.online,state.nativePlayback,state.current?.id,playable(state.current),state.playing,state.busy,state.loading,state.ready,state.collectionBusy,state.shuffle,state.repeat,state.duration>0,(state.hasPlayableTracks??state.tracks.some(playable)),hasNextTrack(),!!previousTrack(),!!ownPlaylist(),has('mutate'),has('volume'),has('seek')]);
 if(signature===controlsSignature)return;controlsSignature=signature;
 if(state.refreshing)setText($('list-detail'),'Обновляем…');
 $('toggle').disabled=(!state.online&&!state.nativePlayback)||!playable(state.current)||!has(state.playing||state.busy?'pause':'resume');$('next').disabled=(!state.online&&!state.current?.local)||!state.current||!has('play')||!hasNextTrack();$('previous').disabled=(!state.online&&!state.current?.local)||!has('play')||!previousTrack();
 $('play-all').disabled=(!state.online&&!state.tracks.some(t=>t.local))||state.loading||!has('play')||!(state.hasPlayableTracks??state.tracks.some(playable));setIcon($('toggle'),state.playing||state.busy?'pause':'play',state.playing?'Ⅱ':'▶\uFE0E');$('toggle').setAttribute('aria-label',state.playing||state.busy?'Пауза':'Воспроизвести');setText($('play-state'),state.busy?'ПОДКЛЮЧЕНИЕ…':state.playing?'ВОСПРОИЗВЕДЕНИЕ':'WAVE / VK');
 $('refresh').disabled=state.loading||!state.ready;$('playlist-create').disabled=!state.online||state.collectionBusy||!has('mutate');$('playlist-rename').classList.toggle('hidden',!ownPlaylist());$('playlist-rename').disabled=!state.online||state.collectionBusy;$('sync-open').disabled=!state.ready;for(const menu of document.querySelectorAll('.track-menu'))menu.disabled=!state.online||state.collectionBusy||!has('mutate');
 $('shuffle').disabled=state.busy;$('shuffle').classList.toggle('active',state.shuffle);$('shuffle').setAttribute('aria-pressed',String(state.shuffle));$('repeat').disabled=state.busy;$('repeat').classList.toggle('active',state.repeat!=='off');setIcon($('repeat'),state.repeat==='one'?'repeatOne':'repeat',state.repeat==='one'?'↻¹':'↻');$('repeat').title=repeatLabel();$('repeat').setAttribute('aria-label',repeatLabel());
 for(const link of $('now-artist').querySelectorAll?.('button')||[])link.disabled=!state.online||!state.current;
 $('volume').disabled=(!state.online&&!state.nativePlayback)||!has('volume');$('seek').disabled=(!state.online&&!state.nativePlayback)||state.busy||!state.duration||!has('seek');

}
let renderedSignature=null,renderedRows=[],highlightSignature=null;
const trackNodes=new Map();
function setText(node,text){if(node.textContent!==text)node.textContent=text;}
function updateTrackHighlight(){
 const key=JSON.stringify([state.current?.id,state.playing]);if(key===highlightSignature)return;highlightSignature=key;
 renderedRows.forEach(({row,indexNode,id,index})=>{const current=state.current?.id===id;row.classList.toggle('current',current);if(current&&state.playing)setIcon(indexNode,'equalizer','♫');else{setText(indexNode,String(index+1));indexNode.removeAttribute?.('data-icon-state');}indexNode.setAttribute('aria-label',(current&&state.playing?'Играет: ':'Воспроизвести: ')+(state.tracks[index]?.title||''));});
}
function renderEmpty(){if(window.WavePersonal?.empty?.())return;const filtered=!!state.filter&&state.allTracks.length>0&&!state.viewTracks.length;const empty=state.ready&&!state.loading&&!state.partial&&!state.allTracks.length;const visible=filtered||empty;$('empty-state').classList.toggle('hidden',!visible);if(!visible)return;$('empty-heading').textContent=filtered?'Песни не найдены':state.route.type==='search'?'Ничего не нашлось':'Пока нет песен';$('empty-copy').textContent=filtered?'По запросу «'+state.filter+'» совпадений нет. Попробуйте другое название или исполнителя.':state.route.type==='search'?'Попробуйте другое название песни или имя исполнителя.':'Найдите музыку, чтобы наполнить свою коллекцию.';$('empty-action').textContent=filtered?'Сбросить поиск':'Найти музыку';$('empty-action').onclick=()=>{if(filtered){$('list-filter').value='';$('list-filter').oninput();$('list-filter').focus?.();}else{$('search').focus?.();$('search').select?.();}};}
let viewSource,viewSize=-1,viewFilter,viewSort,viewResult,viewKeys=[];let trackWindow;
function trackList(){
 if(viewSource!==state.allTracks||viewSize!==state.allTracks.length||viewFilter!==state.filter||viewSort!==state.sort){viewSource=state.allTracks;viewSize=viewSource.length;viewFilter=state.filter;viewSort=state.sort;viewResult=selectTracks(viewSource,state.filter,state.sort);state.hasPlayableTracks=viewResult.some(playable);const seen=new Map();viewKeys=viewResult.map(t=>{const n=seen.get(t.id)||0;seen.set(t.id,n+1);return t.id+'#'+n;});}state.viewTracks=viewResult;state.tracks=window.WaveVirtual?state.viewTracks:state.viewTracks.slice(0,state.visibleLimit);
 if(window.WaveVirtual&&!trackWindow){trackWindow=window.WaveVirtual.create({root:$('tracks'),scroll:document.querySelector('main'),onChange:()=>trackList()});window.WaveTracks={anchor:()=>trackWindow.anchor(),restore:a=>trackWindow.restore(a),focus:index=>{trackWindow.scrollTo(index);trackList();requestAnimationFrame(()=>{const row=renderedRows.find(r=>r.index===index);row?.row.querySelector('.track-name:not(:disabled),.track-index:not(:disabled)')?.focus({preventScroll:true});});},stats:()=>trackWindow.stats()};}
 trackWindow?.configure(JSON.stringify([state.route,state.filter,state.sort]),state.tracks.length);const slice=trackWindow?trackWindow.range():{indices:state.tracks.map((_,i)=>i),version:0};setText($('filter-count'),state.filter&&state.route.type!=='search'?'Найдено: '+state.viewTracks.length+(state.cacheState==='loading'?' · поиск продолжается':''):'');
 const signature=JSON.stringify([slice.indices,slice.version,slice.indices.map(i=>state.tracks[i]).map(t=>[t.id,t.title,t.artist,t.duration,t.available,t.cover,t.artistRoute,t.artists,t.owned])]);
 if(signature!==renderedSignature){
  renderedSignature=signature;highlightSignature=null;renderedRows=[];const fragment=document.createDocumentFragment(),alive=new Set(),occurrences=new Map();
  slice.indices.forEach(i=>{const t=state.tracks[i];
   const occurrence=occurrences.get(t.id)||0;occurrences.set(t.id,occurrence+1);const key=viewKeys[i]||t.id+'#'+occurrence;alive.add(key);
   const content=JSON.stringify([t.title,t.artist,t.duration,t.available,t.cover,t.artistRoute,t.artists]);let entry=trackNodes.get(key);
   if(entry?.content===content){if(entry.index!==i)entry.row.setAttribute('aria-label',(i+1)+'. '+(t.title||'')+', '+(t.artist||''));entry.index=i;entry.track=t;renderedRows.push(entry);if(!trackWindow&&$('tracks').insertBefore){if($('tracks').children[i]!==entry.row)$('tracks').insertBefore(entry.row,$('tracks').children[i]||null);}else if(!trackWindow)fragment.append(entry.row);return;}
   entry={index:i,track:t,content};
   const valid=playable(t),row=el('div','track'+(!valid?' unavailable':''));row.tabIndex=-1;row.setAttribute('role','group');row.setAttribute('aria-label',(i+1)+'. '+(t.title||'')+', '+(t.artist||'')+(valid?'':', недоступен'));
   const indexNode=el('button','track-index',String(i+1));indexNode.type='button';indexNode.disabled=!valid;indexNode.setAttribute('aria-label','Воспроизвести: '+t.title);indexNode.onclick=e=>{e.stopPropagation();if(window.WaveCollection?.activate(entry,e))return;playSelection(entry.index);};row.append(indexNode);const title=el('div','track-title');const nameButton=el('button','track-name',t.title||'Без названия');nameButton.type='button';nameButton.disabled=!valid;nameButton.title=(t.title||'')+' — '+(t.artist||'');nameButton.setAttribute('aria-label','Воспроизвести «'+(t.title||'Без названия')+'», '+(t.artist||''));nameButton.onclick=e=>{e.stopPropagation();if(window.WaveCollection?.activate(entry,e))return;playSelection(entry.index);};title.append(nameButton);const subtitle=artistLinks(t,'track-sub artist-links');title.append(subtitle);if(!valid)title.append(el('small','track-unavailable','Недоступен в VK'));const artist=artistLinks(t,'artist-col artist-links');const artwork=coverNode(t.cover,'track-cover');const song=el('div','song-cell');song.append(artwork,title);const menu=el('button','track-menu','⋯');menu.type='button';setIcon(menu,'more','⋯');menu.title='Действия с песней';menu.setAttribute('aria-label','Действия: '+t.title);menu.onclick=e=>{e.stopPropagation();trackActions(entry.track,menu);};menu.disabled=!state.online||state.collectionBusy||!has('mutate');row.append(song,artist,el('span','duration',valid?format(t.duration):'—'),menu);
   if(valid){row.onclick=e=>{if(window.WaveCollection?.activate(entry,e))return;playSelection(entry.index);};row.onkeydown=e=>{if(e.target!==row)return;if(e.key==='Enter'||e.key===' '){e.preventDefault();playSelection(entry.index);}};}
   row.classList.toggle('local',t.local===true);Object.assign(entry,{row,indexNode,id:t.id});const old=trackNodes.get(key);if(!trackWindow&&old?.row&&$('tracks').insertBefore)old.row.replaceWith(row);trackNodes.set(key,entry);
   if(!trackWindow&&$('tracks').insertBefore){if($('tracks').children[i]!==row)$('tracks').insertBefore(row,$('tracks').children[i]||null);}else if(!trackWindow)fragment.append(row);renderedRows.push(entry);
  });for(const [key,entry] of trackNodes)if(!alive.has(key)){entry.row.remove?.();trackNodes.delete(key);}if(trackWindow)trackWindow.commit(renderedRows.map(r=>({node:r.row,index:r.index})));else if(!$('tracks').insertBefore)$('tracks').replaceChildren(fragment);
 }
 window.WaveCollection?.rows(renderedRows);window.WaveRowActions?.rows(renderedRows);updateTrackHighlight();renderEmpty();window.WaveSearch?.render();const total=Number.isSafeInteger(state.cacheTotal)&&state.cacheTotal>=0?state.cacheTotal:null;
 if(state.route.type==='search'){setText($('count'),'');setText($('list-detail'),'');setText($('filter-count'),'');}else{setText($('count'),total!==null?countTracks(total):(state.partial?'Загружено ':'')+countTracks(state.allTracks.length));setText($('list-detail'),total!==null?countTracks(total):(state.partial?'Загружено ':'')+countTracks(state.allTracks.length));}window.WaveSearch?.render();controls();scheduleReveal();
}
function artistLinks(track,cls){const root=el('span',cls);if(!track){root.textContent='';return root;}const artists=track.artists?.length?track.artists:[{name:track.artist||'Неизвестный исполнитель'}];artists.forEach((artist,index)=>{if(index)root.append(el('span','artist-separator',', '));const link=el('button','artist-link',artist.name);link.setAttribute('dir','auto');link.type='button';link.title='Открыть исполнителя: '+artist.name;link.onclick=e=>{e.stopPropagation();openArtist(track,index);};root.append(link);});return root;}
function openArtist(track,index=0){if(!track)return;return navigate({type:'artist',id:track.id,artistIndex:index,title:track.artists?.[index]?.name||track.artist,cover:track.cover}).catch(fail);}
let nowCoverSignature,nowArtistsSignature;
function renderNow(){const t=state.current,cover=t?.cover||'';if(cover!==nowCoverSignature){nowCoverSignature=cover;$('now-art').replaceChildren(coverNode(cover,'now-cover'));}
 setText($('now-title'),t?.title||'Выберите песню');$('now-title').disabled=!t;$('now-title').setAttribute('aria-label',t?'Открыть песню «'+t.title+'»':'Выберите песню');$('now-title').title=t?t.title+' — '+t.artist:'Выберите песню из списка';
 const authors=JSON.stringify([t?.id,t?.artist,t?.artists]);if(authors!==nowArtistsSignature){nowArtistsSignature=authors;$('now-artist').replaceChildren(artistLinks(t,'artist-links'));}window.WaveSong?.update();
}
function applyPlaylists(result){if(!Array.isArray(result?.playlists))return;const revision=Number.isSafeInteger(result.playlistsRevision)?result.playlistsRevision:0;if(revision<(state.sidebarRevision||0))return;state.sidebarRevision=revision;if(JSON.stringify(state.playlists)!==JSON.stringify(result.playlists)){state.playlists=result.playlists;playlists();}}
const playlistNodes=new Map();
function playlists(){
 const root=$('playlists'),alive=new Set();
 state.playlists.forEach((p,index)=>{alive.add(p.id);let entry=playlistNodes.get(p.id);
  if(!entry){const button=el('button','playlist-item'),copy=el('span','playlist-copy'),name=el('strong',''),owner=el('small','');copy.append(name,owner);button.append(coverNode(p.cover,'playlist-icon'),copy);entry={button,copy,name,owner,cover:p.cover};playlistNodes.set(p.id,entry);button.onclick=()=>{const item=entry.data;navigate({type:'playlist',id:item.id,title:item.title||'Плейлист',cover:item.cover});};}
  entry.data=p;const {button,name,owner}=entry;setText(name,p.title||'Плейлист');setText(owner,typeof p.owner==='string'?p.owner:'Плейлист VK');
  if(entry.cover!==p.cover){entry.cover=p.cover;button.firstChild.replaceWith(coverNode(p.cover,'playlist-icon'));}
  const title=(p.title||'Плейлист')+(p.owner?' — '+p.owner:'');if(button.title!==title)button.title=title;
  button.classList.toggle('active',state.route.type==='playlist'&&state.route.id===p.id);button.disabled=!has('playlist');
  if(!window.WaveFolders&&root.children[index]!==button){if(root.insertBefore)root.insertBefore(button,root.children[index]||null);else root.append(button);}
 });for(const [id,entry] of playlistNodes)if(!alive.has(id)){entry.button.remove?.();playlistNodes.delete(id);}
 $('library-nav').classList.toggle('active',state.route.type==='library');window.WaveFolders?.layout([...playlistNodes].map(([id,e])=>({id,button:e.button,title:e.data.title,owner:e.data.owner})));window.WaveImages?.sweep();
}
function markUnavailable(ids){const found=new Set(ids||[]);const update=tracks=>{for(const t of tracks||[])if(found.has(t.id))t.available=false;};update(state.allTracks);update(state.tracks);update(state.loop);for(const e of cacheEntries.values())update(e.tracks);for(const e of navigation.snapshots.values())update(e.allTracks||e.tracks);if(found.has(state.current?.id))state.current.available=false;viewSource=null;renderedSignature=null;trackList();}
async function playTrack(t,{history,loop,playContext}={}){
 if((!state.online&&!t?.local)||!playable(t))return false;window.WaveTransitionsPlayback?.manual();const previous=state.current;state.restoredPosition=null;state.busy=true;state.pendingNext=false;const generation=++state.generation;
 if(state.nativePlayback){state.current=t;state.position=0;state.playing=false;state.wasPlaying=false;state.duration=0;if(loop!==undefined)state.loop=loop;if(playContext!==undefined)state.playContext=playContext;$('elapsed').textContent='0:00';$('duration').textContent='0:00';$('seek').value=0;renderNow();trackList();}controls();
 try{const r=await call('play',t.id);if(generation!==state.generation)return false;if(!r||r.playing!==true)throw Error('Не удалось начать воспроизведение. Попробуйте другой трек.');if(history!==undefined)state.history=history;else if(previous)state.history.push(previous);if(loop!==undefined)state.loop=loop;if(playContext!==undefined)state.playContext=playContext;state.pendingNext=false;state.current=t;state.position=0;state.playing=true;state.wasPlaying=false;state.duration=0;$('elapsed').textContent='0:00';$('duration').textContent='0:00';$('seek').value=0;if(state.playContext?.cacheId){const cached=cacheEntries.get(state.playContext.cacheId);if(cached)updatePlaybackCache(cached);}renderNow();trackList();return true;}
 catch(e){if(e.kind==='unavailable')markUnavailable(e.unavailableIds?.length?e.unavailableIds:[t.id]);if(generation===state.generation){if(state.nativePlayback){state.current=t;state.position=0;state.playing=false;state.wasPlaying=false;renderNow();}fail(e);}return false;}
 finally{if(generation===state.generation){state.busy=false;controls();}}
}
async function playSelection(i){
 if(state.loading)return;const selected=state.tracks[i];if(!state.online&&!selected?.local)return;if(!playable(selected))return;
 const context=selectTracks(state.allTracks,state.filter,state.sort).map((t,index)=>({...t,contextOrder:index})).filter(t=>playable(t)&&(state.online||t.local));
 const chosen=context.find(t=>t.contextOrder===i);if(!chosen)return;
 const loop=state.shuffle?[chosen,...mix(context.filter(t=>t.contextOrder!==chosen.contextOrder))]:context;
 const search=state.route.type==='search'&&(state.route.searchType||'tracks')==='tracks';const playContext={searchContextId:search?state.searchContextId:null,cacheId:state.cacheId,cacheState:search?(state.partial?'loading':'complete'):state.cacheState,refreshing:state.refreshing,routeKey:JSON.stringify(state.route),filter:state.filter,sort:state.sort};
 await playTrack(chosen,{loop,playContext});
}
let indexedLoop,indexedOrder;
function contextIndex(){if(indexedLoop!==state.loop){indexedLoop=state.loop;indexedOrder=new Map();state.loop.forEach((t,i)=>{if(Number.isSafeInteger(t.contextOrder)&&!indexedOrder.has(t.contextOrder))indexedOrder.set(t.contextOrder,i);});}const index=indexedOrder.get(state.current?.contextOrder);return index!==undefined&&state.loop[index]?.id===state.current?.id?index:state.loop.findIndex(t=>t.contextOrder===state.current?.contextOrder);}
function followingTrack(index){for(let i=index+1;i<state.loop.length;i++)if(playable(state.loop[i]))return state.loop[i];}
function hasNextTrack(){const index=contextIndex();return index>=0&&(!!followingTrack(index)||state.playContext?.cacheState==='loading'||(state.repeat==='all'&&contextComplete()&&state.loop.some(playable)));}
function contextComplete(){return(!state.playContext?.cacheId&&!state.playContext?.searchContextId)||state.playContext.cacheState==='complete';}
function previousTrack(){const index=contextIndex();for(let i=index-1;i>=0;i--)if(playable(state.loop[i]))return state.loop[i];}
async function next(ended=false){
 if(!state.current)return;if(!ended)window.WaveTransitionsPlayback?.manual();
 if(ended&&state.suppressEndedGeneration===state.generation)return;
 if(ended&&window.waveDesktop?.shouldStopAtEnd()){state.suppressEndedGeneration=state.generation;state.playing=false;state.wasPlaying=false;state.pendingNext=false;window.waveDesktop.ended();controls();return;}
 if(ended&&window.WaveTransitionsPlayback&&await window.WaveTransitionsPlayback.ended())return;
 if(ended&&state.repeat==='one'){await playTrack(state.current,{history:state.history});return;}
 const index=contextIndex();if(index<0)return;
 let following=followingTrack(index);
 if(!following&&state.playContext?.cacheState==='loading'){state.pendingNext=true;state.pendingNextEnded=ended;controls();if(state.playContext.searchContextId)await advanceSearchContext();return;}
 if(!following&&state.repeat==='all'&&contextComplete())following=state.loop.find(playable);
 state.pendingNext=false;if(following)await playTrack(following);
}
async function advanceSearchContext(){const ctx=state.playContext;if(!ctx?.searchContextId||ctx.advancing)return;ctx.advancing=true;let again=false;try{const r=await call('searchPage',ctx.searchContextId);if(state.playContext!==ctx)return;if(!Array.isArray(r.tracks))throw Error('Не удалось загрузить продолжение поиска. Повторите переключение.');if(r.partial&&r.tracks.length<=state.loop.length)throw Error('VK не вернул новые песни. Повторите переключение.');if(JSON.stringify(state.route)===ctx.routeKey){state.allTracks=r.tracks;state.partial=r.partial;trackList();}updatePlaybackCache({tracks:r.tracks,cacheState:r.partial?'loading':'complete'});again=state.pendingNext&&r.partial;}catch(e){if(state.playContext===ctx){state.pendingNext=false;fail(e);}}finally{ctx.advancing=false;if(again&&state.playContext===ctx)next(state.pendingNextEnded).catch(fail);}}
async function previous(){const t=previousTrack();if(!t)return;const history=state.history.slice();if(history.at(-1)?.contextOrder===t.contextOrder)history.pop();await playTrack(t,{history});}
async function toggle(){if((!state.online&&!state.nativePlayback)||!playable(state.current))return;if(state.busy){const generation=++state.generation;try{await call('pause');}catch(e){fail(e);}finally{if(generation===state.generation){state.playing=false;state.busy=false;controls();}}return;}const wasPlaying=state.playing;state.busy=true;state.pendingNext=false;const generation=++state.generation;controls();try{const restored=!wasPlaying&&Number.isFinite(state.restoredPosition);const r=restored?await call('play',{id:state.current.id,position:state.restoredPosition}):await call(wasPlaying?'pause':'resume');if(restored)state.restoredPosition=null;if(generation!==state.generation)return;if(!wasPlaying&&r?.playing!==true)throw Error('Не удалось продолжить воспроизведение');state.playing=!wasPlaying;state.wasPlaying=false;}catch(e){if(generation===state.generation)fail(e);}finally{if(generation===state.generation){state.busy=false;controls();}}}

let polling=false;
async function poll(){if(state.nativePlayback||polling||state.busy||!state.current||!state.playing||!has('player'))return;polling=true;const generation=state.generation;try{const p=await call('player');if(!p||generation!==state.generation)return;const time=Math.max(0,Number(p.currentTime)||0),duration=Math.max(0,Number(p.duration)||0);state.position=time;state.duration=duration;setText($('elapsed'),format(time));setText($('duration'),format(duration));$('seek').max=String(duration);if(!state.seekDragging)$('seek').value=String(time);if(Number.isFinite(p.volume)&&!state.volumeBusy&&!state.volumeDragging){state.volume=p.volume;$('volume').value=String(p.volume);}const ended=p.ended===true||(state.wasPlaying&&!p.playing&&duration>0&&time>=duration-.8);state.wasPlaying=!!p.playing;state.playing=!!p.playing;if(p.title)$('now-title').textContent=p.title;updateTrackHighlight();controls();if(ended)await next(true);}catch(e){if(generation===state.generation){state.playing=false;state.wasPlaying=false;controls();fail(e);}}finally{polling=false;}}
// Route and playback cache subscriptions are independent; metadata polling never locks transport.
const cacheEntries=new Map(),cacheInflight=new Set();
function trimViewCaches(){const protectedIds=new Set([state.cacheId,state.playContext?.cacheId]);for(const id of cacheEntries.keys()){if(cacheEntries.size<=8)break;if(!protectedIds.has(id))cacheEntries.delete(id);}while(navigation.snapshots.size>8)navigation.snapshots.delete(navigation.snapshots.keys().next().value);}

function updatePlaybackCache(entry){
 const ctx=state.playContext;if(!ctx)return;
 ctx.cacheState=entry.cacheState;ctx.refreshing=entry.refreshing===true;
 // Reconcile occurrences by stable ID, never merge a different song at the same index.
 const keyed=(tracks)=>{const counts=new Map();return tracks.map(t=>{const occurrence=counts.get(t.id)||0;counts.set(t.id,occurrence+1);return {...t,contextKey:String(t.id)+'#'+occurrence};});};
 const original=keyed(state.loop.slice().sort((a,b)=>a.contextOrder-b.contextOrder));
 const oldLoop=state.loop.map(t=>({...t,contextKey:t.contextKey||original.find(x=>x.contextOrder===t.contextOrder)?.contextKey}));
 const oldIndex=oldLoop.findIndex(t=>t.contextOrder===state.current?.contextOrder&&t.id===state.current?.id);
 const oldCurrent=oldLoop[oldIndex];
 const incoming=keyed(selectTracks(entry.tracks,ctx.filter,ctx.sort).map((t,index)=>({...t,contextOrder:index}))).filter(playable);
 const currentKey=oldCurrent?.contextKey;let retained=incoming.find(t=>t.contextKey===currentKey);
 if(!retained&&state.current){
  retained={...state.current,contextOrder:-1,contextKey:currentKey||String(state.current.id)+'#removed'};
  const survivingNext=oldLoop.slice(oldIndex+1).map(t=>incoming.find(x=>x.contextKey===t.contextKey)).find(Boolean);
  const insertAt=survivingNext?incoming.indexOf(survivingNext):incoming.length;incoming.splice(insertAt,0,retained);
 }
 if(state.shuffle){
  const lookup=new Map(incoming.map(t=>[t.contextKey,t]));const kept=oldLoop.map(t=>lookup.get(t.contextKey)).filter(Boolean);const keys=new Set(kept.map(t=>t.contextKey));
  state.loop=kept.concat(mix(incoming.filter(t=>!keys.has(t.contextKey))));
 }else state.loop=incoming;
 // Metadata reconciliation never calls play/pause and never changes playback generation.
 if(retained&&state.current){state.current={...state.current,contextOrder:retained.contextOrder,contextKey:retained.contextKey};}
 if(state.online&&state.pendingNext&&!state.busy){if(entry.cacheState==='error'){state.pendingNext=false;message('Не удалось загрузить продолжение списка. Обновите список.',true);}else next(state.pendingNextEnded);}
 controls();
}
function applyRouteCache(entry,ticket,id){
 if(ticket!==state.request||state.cacheId!==id)return;
 state.cacheVersion=entry.version;state.allTracks=entry.tracks;state.tracks=state.allTracks.slice(0,state.visibleLimit);state.partial=entry.partial===true;state.cacheState=entry.cacheState;state.cacheTotal=entry.total;state.refreshing=entry.refreshing===true;state.stale=entry.stale===true;
 if(state.route.type==='library')applyPlaylists(entry);
 if(entry.title&&state.route.type==='playlist'){state.route.title=entry.title;$('heading').textContent=entry.title;}
 trackList();scheduleReveal();if(entry.refreshError)message('Не удалось обновить. Показан сохранённый список.',true);else if(entry.cacheState==='error')message('Не удалось загрузить весь список. Обновите список.',true);else if(!entry.tracks.length&&!$('message').classList.contains('error'))message(entry.cacheState==='loading'?'Загружаем треки…':route.type==='home'?'':'В этом списке пока нет песен.');else if(['Загружаем треки…','Не удалось обновить список. Повторяем…','Не удалось обновить. Показан сохранённый список.'].includes($('message').textContent))message();
}
async function cachePoll(){
 if(!state.ready||!has('playlistCache'))return;
 const ids=new Set();if(state.cacheId&&(state.cacheState==='loading'||state.refreshing))ids.add(state.cacheId);if(state.playContext?.cacheId&&(state.playContext.cacheState==='loading'||state.playContext.refreshing))ids.add(state.playContext.cacheId);
 await Promise.all([...ids].map(async id=>{
  if(cacheInflight.has(id))return;cacheInflight.add(id);const ticket=state.request;
  try{
   const entry=await api.playlistCache({id,version:cacheEntries.get(id)?.version});if(entry?.unchanged)return;if(!Array.isArray(entry?.tracks))throw new Error('Не удалось обновить список.');
   cacheEntries.set(id,entry);trimViewCaches();applyRouteCache(entry,ticket,id);
   if(state.playContext?.cacheId===id)updatePlaybackCache(entry);
  }catch(e){
   // Transport failures retain cached tracks and may recover on the next interval.
   if(ticket===state.request&&state.cacheId===id)message('Не удалось обновить список. Повторяем…',true);
  }finally{cacheInflight.delete(id);}
 }));
}
let revealFrame=null;
const scrollMain=document.querySelector('main');
const revealSentinel=el('div','reveal-sentinel');revealSentinel.setAttribute('aria-hidden','true');$('tracks').after(revealSentinel);
function nearBottom(){return scrollMain.clientHeight>0&&scrollMain.scrollHeight-scrollMain.scrollTop-scrollMain.clientHeight<=180;}
function scheduleReveal(){
 if(revealFrame!==null)return;const ticket=state.request;
 const scheduled={frame:null,timer:null};revealFrame=scheduled;
 const run=()=>{if(revealFrame!==scheduled)return;clearTimeout(scheduled.timer);if(scheduled.frame!==null)cancelAnimationFrame(scheduled.frame);revealFrame=null;if(ticket!==state.request){scheduleReveal();return;}revealOnScroll();};
 scheduled.frame=requestAnimationFrame(run);
 // Chromium can suspend animation frames for an occluded window. Do not let
 // one suspended frame block every subsequent scroll/cache arrival forever.
 scheduled.timer=setTimeout(run,100);
}
function revealOnScroll(){
 if(state.loading||!nearBottom())return;if(window.WaveSearch?.reveal())return;
 if(!trackWindow&&state.visibleLimit<(state.viewTracks||state.allTracks).length){
  state.visibleLimit=Math.min((state.viewTracks||state.allTracks).length,state.visibleLimit+30);state.tracks=state.allTracks.slice(0,state.visibleLimit);trackList();
  // Check actual post-render geometry; stop as soon as the viewport has enough rows.
  scheduleReveal();
 }else if(!state.cacheId&&state.route.type!=='playlist'&&state.partial&&autoLoadAttempts<=4&&Date.now()>=autoLoadRetryAt)more();
}
scrollMain.addEventListener('scroll',scheduleReveal,{passive:true});
window.addEventListener('resize',scheduleReveal);
if(typeof ResizeObserver==='function'){const resizeObserver=new ResizeObserver(scheduleReveal);resizeObserver.observe(scrollMain);resizeObserver.observe($('tracks'));}
if(typeof IntersectionObserver==='function'){const intersectionObserver=new IntersectionObserver(entries=>{if(entries.some(e=>e.isIntersecting))scheduleReveal();},{root:scrollMain,rootMargin:'0px 0px 180px 0px'});intersectionObserver.observe(revealSentinel);}
setInterval(cachePoll,700);
function selectTracks(items,query='',sort='original'){
 const q=String(query||'').trim().toLocaleLowerCase('ru');const words=q.split(/\s+/).filter(Boolean);
 const result=items.filter(t=>words.every(w=>((t.title||'')+' '+(t.artist||'')).toLocaleLowerCase('ru').includes(w)));
 const cmp=(a,b)=>String(a||'').localeCompare(String(b||''),'ru',{numeric:true,sensitivity:'base'});
 if(sort==='reverse')result.reverse();else if(sort==='title'||sort==='artist')result.sort((a,b)=>cmp(a[sort],b[sort]));else if(sort==='duration')result.sort((a,b)=>(a.duration||0)-(b.duration||0));return result;
}
function coverNode(url,cls){const box=el('span',cls);setIcon(box,'music','♫');if(typeof url==='string'&&(/^https:\/\/(?:[\w-]+\.)*(?:vkuserphoto\.ru|userapi\.com|vk\.me)\//.test(url)||/^http:\/\/127\.0\.0\.1:\d+\/wave-art\/[a-f0-9]{48}\/[a-f0-9]{20}\/[a-f0-9-]{36}$/.test(url))){const img=el('img');if(window.WaveImages)window.WaveImages.watch(img,url);else img.src=url;img.alt='';img.loading='lazy';img.referrerPolicy='no-referrer';img.onerror=()=>{if(window.WaveImages?.isDormant(img))return;img.hidden=true;box.removeAttribute?.('data-icon-state');setIcon(box,'music','♫');};box.textContent='';box.append(img);}return box;}
function heroCover(url){const img=$('hero-cover');const valid=typeof url==='string'&&/^https:\/\/(?:[\w-]+\.)*(?:vkuserphoto\.ru|userapi\.com|vk\.me)\//.test(url);img.classList.toggle('hidden',!valid);if(valid){if(img.src!==url)img.src=url;img.onerror=()=>img.classList.toggle('hidden',true);}}
const albumSignatures=new Map();
function renderAlbums(){const artist=state.route.type==='artist';$('albums-section').classList.toggle('hidden',!artist);$('album-empty').classList.toggle('hidden',!artist||!!state.albums?.length||state.loading);$('contributions-section').classList.toggle('hidden',!artist||!state.contributions?.length);if(!artist&&state.ready)return;for(const [id,items] of [['albums',state.albums],['contributions',state.contributions]]){const root=$(id),signature=JSON.stringify(artist?items||[]:[]);if(albumSignatures.get(id)===signature)continue;albumSignatures.set(id,signature);root.replaceChildren();if(artist)for(const album of items||[]){const card=el('button','album-card');card.title=album.title+(album.owner?' — '+album.owner:'');card.append(coverNode(album.cover,'album-cover'),el('strong','',album.title),el('small','',album.owner||'Альбом VK'));card.onclick=()=>navigate({type:'album',id:album.id,title:album.title,cover:album.cover});root.append(card);}}}

const routeKey=r=>JSON.stringify([r.type,r.id||r.query||'',...(r.type==='search'?[r.searchType||'tracks']:[]),...(r.type==='artist'&&r.artistIndex?[r.artistIndex]:[])]);
const navigation={entries:[],index:-1,views:new Map(),snapshots:new Map()};
try{if(typeof localStorage!=='undefined'){const saved=JSON.parse(localStorage.getItem('wave-navigation-v1')||'[]');if(Array.isArray(saved))for(const [key,v] of saved.slice(-100)){if(typeof key==='string'&&v&&Number.isFinite(v.scroll)&&Number.isFinite(v.limit))navigation.views.set(key,{scroll:Math.max(0,v.scroll),limit:Math.max(30,Math.min(100000,v.limit)),filter:typeof v.filter==='string'?v.filter.slice(0,200):'',sort:['original','title','artist','duration','reverse'].includes(v.sort)?v.sort:'original',anchor:v.anchor&&Number.isSafeInteger(v.anchor.index)&&v.anchor.index>=0&&Number.isFinite(v.anchor.offset)?v.anchor:undefined,anchorKind:v.anchorKind==='entities'?'entities':'tracks'});}}}catch{}
function persistViews(){try{if(typeof localStorage!=='undefined')localStorage.setItem('wave-navigation-v1',JSON.stringify([...navigation.views].slice(-100)));}catch{}}
function saveView(){if(!state.ready||state.loading||!state.viewLoaded)return;const key=routeKey(state.route);navigation.views.set(key,{scroll:scrollMain.scrollTop||0,limit:state.visibleLimit,filter:state.filter||'',sort:state.sort||'original',anchor:window.WaveSearch?.entityMode()?window.WaveSearch.anchor?.():window.WaveTracks?.anchor(),anchorKind:window.WaveSearch?.entityMode()?'entities':'tracks'});navigation.snapshots.delete(key);navigation.snapshots.set(key,{allTracks:state.allTracks,cacheId:state.cacheId,cacheState:state.cacheState,cacheTotal:state.cacheTotal,cacheVersion:state.cacheVersion,partial:state.partial,refreshing:state.refreshing,stale:state.stale,albums:state.albums||[],contributions:state.contributions||[],searchEntities:state.searchEntities||[],searchContextId:state.searchContextId});while(navigation.views.size>100){const old=navigation.views.keys().next().value;navigation.views.delete(old);navigation.snapshots.delete(old);}trimViewCaches();persistViews();}
function navigationButtons(){$('nav-back').disabled=navigation.index<=0;$('nav-forward').disabled=navigation.index<0||navigation.index>=navigation.entries.length-1;}
function navigationReset(){navigation.entries=[];navigation.index=-1;navigation.views.clear();navigation.snapshots.clear();persistViews();state.filter='';state.sort='original';state.albums=[];state.contributions=[];navigationButtons();}
async function navigate(route,refresh=false,preserve=false,traveling=false){
 if(!state.ready)return loadRoute(route,refresh,preserve);
 saveView();const key=routeKey(route),saved=navigation.views.get(key),snapshot=navigation.snapshots.get(key);
 if(!traveling&&(!navigation.entries.length||routeKey(navigation.entries[navigation.index])!==key)){navigation.entries.splice(navigation.index+1);navigation.entries.push({...route});navigation.index=navigation.entries.length-1;if(navigation.entries.length>100){navigation.entries.shift();navigation.index--;}}
 navigationButtons();state.viewLoaded=false;state.filter=saved?.filter||'';state.sort=saved?.sort||'original';$('list-filter').value=state.filter;$('list-sort').value=state.sort;
 if(snapshot){Object.assign(state,snapshot);state.viewLoaded=true;state.visibleLimit=saved?.limit||30;state.route={...route};trackList();routeHeader();}
 if(snapshot&&!state.online&&['artist','search'].includes(route.type)){++state.request;state.loading=false;message('Показан ранее открытый список. Подключитесь к VK для обновления.');}
 else await loadRoute({...route},refresh,!!snapshot||preserve);
 if(routeKey(state.route)!==key)return;
 const title=($('heading').textContent||'Музыка')+' · Wave';if(document.title!==title)document.title=title;if(traveling||!preserve)$('heading').focus?.({preventScroll:true});window.WaveTransitions?.enter();window.WavePersonal?.visit(state.route);
 state.visibleLimit=saved?.limit||30;trackList();scrollMain.scrollTop=saved?.scroll||0;if(saved?.anchor){if(saved.anchorKind==='entities')window.WaveSearch?.restore?.(saved.anchor);else window.WaveTracks?.restore(saved.anchor);}if(navigation.index>=0)navigation.entries[navigation.index]={...state.route};saveView();
}
function travel(delta){const target=navigation.index+delta;if(target<0||target>=navigation.entries.length)return;saveView();navigation.index=target;const route={...navigation.entries[target]};return navigate(route,false,false,true).catch(fail);}
$('nav-back').onclick=()=>travel(-1);$('nav-forward').onclick=()=>travel(1);
$('list-filter').oninput=()=>{state.filter=$('list-filter').value.slice(0,200);state.visibleLimit=30;trackList();saveView();};
$('list-sort').onchange=()=>{state.sort=$('list-sort').value;state.visibleLimit=30;trackList();saveView();};
let viewTimer;scrollMain.addEventListener('scroll',()=>{clearTimeout(viewTimer);viewTimer=setTimeout(saveView,180);},{passive:true});
window.addEventListener('beforeunload',saveView);

// Serialize provider navigation: more() depends on the last provider route.
let dataTail=Promise.resolve();
function dataTask(fn){if(state.nativePlayback)return Promise.resolve().then(fn);const task=dataTail.then(fn);dataTail=task.catch(()=>{});return task;}
function routeHeader(){window.WaveSearch?.render();if(window.WavePersonal?.header())return;const r=state.route;if(['artist','album'].includes(r.type)){setText($('heading'),r.title||'Музыка');setText($('eyebrow'),r.type==='artist'?'ИСПОЛНИТЕЛЬ':'АЛЬБОМ');setText($('subtitle'),r.type==='artist'?'Музыка и релизы исполнителя':'Альбом ВКонтакте');setText($('list-heading'),r.type==='artist'?'Треки исполнителя':'Треки');heroCover(r.cover);renderAlbums();playlists();return;}heroCover(r.cover);renderAlbums();setText($('heading'),r.type==='library'?'Мне нравится':r.type==='playlist'?r.title:r.query);setText($('eyebrow'),r.type==='library'?'ВАША ЛИЧНАЯ КОЛЛЕКЦИЯ':r.type==='playlist'?'ПЛЕЙЛИСТ ВКОНТАКТЕ':'ПОИСК ВКОНТАКТЕ');setText($('subtitle'),r.type==='search'?'':'');setText($('list-heading'),r.type==='search'?'Результаты поиска':'Треки');playlists();}
async function loadRoute(route,refresh=false,preserve=false){if(['home','listenHistory','downloads'].includes(route.type)&&!window.WavePersonal&&document.readyState==='loading')await new Promise(resolve=>document.addEventListener('DOMContentLoaded',resolve,{once:true}));if(!state.ready){message('Войдите через VK, чтобы слушать свою музыку.');return;}if(['search','artist'].includes(route.type)&&!state.online){message('Для поиска подключитесь к VK.');return;}window.WaveSearch?.hideHistory();if(route.type!=='search'&&has('cancelSearch'))call('cancelSearch').catch(()=>{});state.searchError=false;const reuseCache=!refresh&&preserve&&state.cacheId&&state.cacheState==='complete'&&routeKey(state.route)===routeKey(route),priorCacheId=state.cacheId,priorVersion=state.cacheVersion;const savedScroll=document.querySelector('main').scrollTop,savedLimit=state.visibleLimit;const ticket=++state.request;resetAutoLoad();state.route=route;state.loading=true;state.partial=false;state.cacheId=null;state.cacheState=null;if(!preserve)state.cacheTotal=undefined;if(!preserve){state.allTracks=[];state.searchEntities=[];state.visibleLimit=30;state.tracks=[];document.querySelector('main').scrollTop=0;}else state.visibleLimit=savedLimit;routeHeader();trackList();if(!preserve)message('Загружаем музыку…');try{await dataTask(async()=>{if(ticket!==state.request)return;const r=window.WavePersonal?.isRoute(route.type)?await window.WavePersonal.view(route.type):reuseCache?await call('playlistCache',{id:priorCacheId,version:priorVersion,activate:true}):await call(route.type==='library'?'library':['playlist','album'].includes(route.type)?'playlist':route.type==='artist'?'artist':'search',...(route.type==='library'?[refresh]:['playlist','album'].includes(route.type)?[route.id,refresh]:route.type==='artist'?[route.artistEntity?{entityId:route.id}:{trackId:route.id,artistIndex:route.artistIndex||0}]:[{query:route.query,type:route.searchType||'tracks',refresh}]));if(ticket!==state.request)return;if(r?.unchanged){state.viewLoaded=true;state.cacheId=priorCacheId;state.cacheVersion=r.version;state.cacheState='complete';state.loading=false;trackList();message('');return;}if(!Array.isArray(r?.tracks))throw new Error('Не удалось прочитать список музыки.');state.viewLoaded=true;state.searchEntities=r.entities||[];state.searchContextId=r.searchContextId;state.cacheVersion=r.version;state.allTracks=r.tracks;state.tracks=state.allTracks.slice(0,state.visibleLimit);state.partial=r.partial===true;if(route.type==='library')applyPlaylists(r);state.albums=r.albums||[];state.contributions=r.contributions||[];if(r.cover)state.route.cover=r.cover;renderAlbums();if(r.title&&route.type==='artist')state.route.title=r.title;if(route.type!=='search'){if(['playlist','album'].includes(route.type)&&r.title)state.route.title=r.title;state.cacheId=r.cacheId||null;state.cacheState=r.cacheState||null;state.cacheTotal=r.total;state.refreshing=r.refreshing===true;state.stale=r.stale===true;if(r.cacheId){cacheEntries.set(r.cacheId,{...r});trimViewCaches();}}routeHeader();trackList();message(r.refreshError?'Не удалось обновить. Показан сохранённый список.':r.cacheState==='error'?'Не удалось загрузить весь список. Обновите список.':r.tracks.length||r.entities?.length?'':state.partial?'Загружаем треки…':route.type==='search'?'Ничего не найдено. Попробуйте другой запрос.':route.type==='home'?'':'В этом списке пока нет песен.');});}catch(e){if(ticket===state.request){state.searchError=route.type==='search';fail(e);}}finally{if(ticket===state.request){state.loading=false;renderAlbums();window.WaveSearch?.render();if(preserve)document.querySelector('main').scrollTop=savedScroll;controls();scheduleReveal();}}}
let autoLoadAttempts=0,autoLoadRetryAt=0,autoLoadTimer=null;
function resetAutoLoad(){autoLoadAttempts=0;autoLoadRetryAt=0;clearTimeout(autoLoadTimer);autoLoadTimer=null;}
function retryAutoLoad(){
 autoLoadAttempts++;autoLoadRetryAt=Date.now()+Math.min(8000,700*2**(autoLoadAttempts-1));
 if(autoLoadAttempts<=4){clearTimeout(autoLoadTimer);const ticket=state.request;autoLoadTimer=setTimeout(()=>{if(ticket===state.request)scheduleReveal();},autoLoadRetryAt-Date.now());}
 else message('Продолжение пока недоступно. Обновите список.',true);
}
async function more(){if(state.loading||!state.ready||!state.partial||!has('more'))return;const ticket=state.request,route=state.route;state.loading=true;controls();message('Загружаем ещё…');try{await dataTask(async()=>{if(ticket!==state.request)return;const r=await call('more');if(ticket!==state.request||route!==state.route)return;if(!Array.isArray(r?.tracks))throw new Error('Не удалось загрузить продолжение списка.');const entity=window.WaveSearch?.entityMode(),before=entity?(state.searchEntities||[]).length:state.allTracks.length;state.searchEntities=r.entities||[];if((entity?state.searchEntities.length:r.tracks.length)<=before&&r.partial)retryAutoLoad();else resetAutoLoad();state.allTracks=r.tracks;state.visibleLimit=Math.max(state.visibleLimit,before+30);state.tracks=state.allTracks.slice(0,state.visibleLimit);state.partial=r.partial===true;if(state.playContext?.searchContextId&&state.playContext.searchContextId===r.searchContextId)updatePlaybackCache({tracks:r.tracks,cacheState:r.partial?'loading':'complete'});trackList();if(autoLoadAttempts<=4)message('');});}catch(e){if(ticket===state.request){retryAutoLoad();fail(e);}}finally{if(ticket===state.request){state.loading=false;controls();scheduleReveal();}}}
async function applySession(s,startup=false){if(s.accountChanged){window.WaveLikes?.reset();window.WavePersonal?.reset();window.WaveSong?.reset();window.WaveSearch?.reset();window.WaveFolders?.reset();}
 const priorReady=state.ready,priorOnline=state.online;if(s.nativePlayback!==undefined)state.nativePlayback=s.nativePlayback;if(Number.isFinite(s.volume)){state.volume=s.volume;$('volume').value=String(s.volume);}
 state.online=s.state==='ready';state.ready=state.online||s.state==='cached'||(s.state==='error'&&priorReady);
 document.body.classList.toggle('connected',state.online);
 $('connection').textContent=state.online?'VK подключён':s.reason==='auth'?'Нужно войти в VK':s.reason==='offline'?'Нет сети · сохранённые списки':state.ready?(s.verifying?'Проверяем VK…':'Сохранённая медиатека'):'Нет подключения';
 $('login').textContent=state.online?'VK подключён ✓':'Войти через VK ↗';$('login').disabled=state.online||!has('login');window.WaveAccount?.session(s);
 if(s.reason==='auth'){++state.generation;state.busy=false;state.current=null;state.playContext=null;state.loop=[];state.playing=false;state.wasPlaying=false;renderNow();}
 if(!state.online&&!state.nativePlayback){state.pendingNext=false;state.playing=false;state.wasPlaying=false;++state.generation;state.busy=false;}
 if(s.state==='signedOut'){window.WaveLikes?.reset();window.WavePersonal?.reset();window.WaveTransitionsPlayback?.reset();window.WaveSong?.reset();window.WaveCollection?.reset();window.WaveFolders?.reset();window.WaveSearch?.reset();window.waveDesktop?.reset();state.restoredPosition=null;++state.generation;state.busy=false;state.playing=false;state.wasPlaying=false;state.duration=0;navigationReset();state.operations=[];renderOperations();closeCollectionDialog();
  ++state.request;resetAutoLoad();cacheEntries.clear();state.allTracks=[];state.tracks=[];state.playlists=[];state.sidebarRevision=0;state.cacheId=null;state.cacheState=null;state.cacheTotal=undefined;state.refreshing=false;state.current=null;state.loop=[];state.history=[];state.playContext=null;state.route={type:'library'};state.viewLoaded=false;state.loading=false;state.partial=false;renderNow();routeHeader();trackList();message(s.message||'Войдите через VK, чтобы слушать свою музыку.');
  if(has('pause'))call('pause').catch(()=>{});
 }else if(state.ready){
  if(s.state==='error')message('Нет подключения к VK. Сохранённая медиатека доступна.',true);
  if(startup||!priorReady)await navigate(state.route.type==='search'?{type:'library'}:{...state.route},false,priorReady);
  else if(state.online&&!priorOnline&&!state.playing)await navigate(state.route.type==='search'?{type:'library'}:{...state.route},false,true);
 }else if(s.state==='pending'){$('connection').textContent='Подключаем VK…';message('Подключаем VK…');}else message(s.message||'Не удалось подключиться к VK.',true);
 controls();if(s.reason==='auth')message(s.message||'Войдите через VK, чтобы продолжить.',true);
}
async function status(){
 if(!has('status')){message('Не удалось подключиться к Wave.',true);controls();return;}
 const revision=state.sessionRevision;
 try{const s=await call('status');if(revision!==state.sessionRevision)return;await applySession(s,true);}catch(e){if(revision===state.sessionRevision)fail(e);}
}
if(has('onPlayerState'))api.onPlayerState(p=>{if(!state.current||p.currentId!==state.current.id)return;state.playing=p.playing===true;state.wasPlaying=p.playing===true;if(Number.isFinite(p.duration)){state.duration=p.duration;setText($('duration'),format(p.duration));$('seek').max=String(p.duration);}if(Number.isFinite(p.currentTime)){state.position=Math.max(0,p.currentTime);if(!state.seekDragging){setText($('elapsed'),format(p.currentTime));$('seek').value=String(p.currentTime);}}if(Number.isFinite(p.volume)&&!state.volumeBusy&&!state.volumeDragging){state.volume=p.volume;$('volume').value=String(p.volume);}updateTrackHighlight();controls();if(p.error&&!state.busy)message(p.error,true);if(p.ended&&(state.online||state.current?.local)&&!state.busy)next(true).catch(fail);});
if(has('onSession'))api.onSession(s=>{++state.sessionRevision;applySession(s).catch(fail);});
$('login').onclick=async()=>{$('login').disabled=true;$('login').textContent='Ожидаем вход…';message('Завершите вход в окне VK.');try{await call('login');await status();}catch(e){fail(e);}finally{if(!state.ready){$('login').disabled=!has('login');$('login').textContent='Войти через VK ↗';}}};
$('home').onclick=$('library-nav').onclick=()=>{$('search').value='';navigate({type:'library'});};$('refresh').onclick=()=>{window.WaveFolders?.reload();return navigate({...state.route},true);};$('search-form').onsubmit=e=>{e.preventDefault();const query=$('search').value.trim();navigate(query?{type:'search',query}:{type:'library'});};$('play-all').onclick=()=>playSelection(state.tracks.findIndex(playable));$('toggle').onclick=toggle;$('next').onclick=()=>next();$('previous').onclick=previous;
for(const event of ['pointercancel','blur'])$('seek').addEventListener?.(event,()=>{state.seekDragging=false;$('seek').value=String(state.position||0);setText($('elapsed'),format(state.position));});
$('seek').oninput=()=>{if(!state.seekDragging)state.seekTrackId=state.current?.id;state.seekDragging=true;setText($('elapsed'),format(Number($('seek').value)));};
$('seek').onchange=async()=>{const value=Number($('seek').value),stale=state.seekDragging&&state.seekTrackId!==state.current?.id;state.seekDragging=false;if(stale)return;window.WaveTransitionsPlayback?.manual();if((!state.online&&!state.nativePlayback)||state.busy)return;state.pendingNext=false;state.busy=true;const generation=++state.generation;controls();try{await call('seek',value);if(generation===state.generation)state.position=value;}catch(e){if(generation===state.generation)fail(e);}finally{if(generation===state.generation){state.busy=false;controls();}}};
$('shuffle').onclick=()=>{if(state.busy)return;state.shuffle=!state.shuffle;if(state.current&&state.loop.length)state.loop=state.shuffle?[state.current,...mix(state.loop.filter(t=>t.contextOrder!==state.current.contextOrder))]:state.loop.slice().sort((a,b)=>a.contextOrder-b.contextOrder);controls();};$('repeat').onclick=()=>{if(state.busy)return;state.repeat=state.repeat==='off'?'all':state.repeat==='all'?'one':'off';controls();};
const volumeWriter=window.VolumeWriter?new window.VolumeWriter({send:value=>call('volume',value),onUpdate:(value,pending)=>{state.volume=value;state.volumeBusy=pending;$('volume').value=String(value);$('volume').setAttribute('aria-valuetext',Math.round(value*100)+'%');const label=$('volume-value');if(label)label.textContent=Math.round(value*100)+'%';controls();},onError:fail}):null;
function changeVolume(){if(!state.online&&!state.nativePlayback)return;const value=Number($('volume').value);if(volumeWriter){volumeWriter.set(value);return volumeWriter.idle();}return call('volume',value).then(r=>{state.volume=r.volume;}).catch(fail);}
$('volume').oninput=changeVolume;$('volume').onchange=changeVolume;
$('volume').addEventListener('pointerdown',()=>{state.volumeDragging=true;});window.addEventListener('pointerup',()=>{state.volumeDragging=false;});window.addEventListener('pointercancel',()=>{state.volumeDragging=false;});window.addEventListener('blur',()=>{state.volumeDragging=false;});$('volume').addEventListener('blur',()=>{state.volumeDragging=false;});
function ownPlaylist(){return state.route.type==='playlist'&&state.playlists.find(p=>p.id===state.route.id)?.editable===true;}
function closeCollectionDialog(){$('collection-dialog').classList.toggle('hidden',true);$('collection-confirm').onclick=null;}
function collectionDialog(title){window.WaveDialogs?.focus($('collection-dialog'));$('collection-dialog-title').textContent=title;$('collection-dialog').classList.toggle('hidden',false);$('collection-confirm').classList.toggle('danger-action',false);$('collection-options').replaceChildren();$('collection-input').classList.toggle('hidden',true);$('collection-select').classList.toggle('hidden',true);$('collection-confirm').classList.toggle('hidden',true);$('collection-help').classList.remove?.('song-info');$('collection-help').textContent='';}
function collectionForm(title,label,value,submit,{number=false,max=100}={}){
 collectionDialog(title);const input=$('collection-input');input.classList.toggle('hidden',false);input.type=number?'number':'text';input.value=value;input.maxLength=100;input.min='1';input.max=String(max);input.setAttribute('aria-label',label);$('collection-help').textContent=label;$('collection-confirm').classList.toggle('hidden',false);$('collection-confirm').textContent='Сохранить';$('collection-confirm').onclick=()=>submit(input.value);input.focus?.();input.select?.();
}
function operationLabel(op){const action={create:'Создание плейлиста',rename:'Название плейлиста',add:'Добавление в плейлист',remove:'Удаление из плейлиста',move:'Порядок песен',like:'Добавление в «Мне нравится»',unlike:'Удаление из «Мне нравится»',batch:'Групповая операция'}[op.action]||'Коллекция';return action+' · '+op.title;}
function renderOperations(){
 const operations=state.operations||[],active=operations.filter(o=>['pending','running','syncing'].includes(o.state)).length,failed=operations.filter(o=>['error','uncertain','partial'].includes(o.state)).length;
 $('sync-open').textContent=active?'Синхронизация…':failed?'Синхронизация · '+failed+' ошибок':'Синхронизация';const root=$('sync-list');root.replaceChildren();if(!operations.length)root.append(el('p','muted','Изменений в этом сеансе пока нет.'));
 const labels={pending:'Ожидает',running:'Подготавливаем',syncing:'Проверяем результат в VK',success:'Синхронизировано с VK',partial:'Часть действий не подтверждена — откройте результаты',cancelled:'Остановлено',error:'Не выполнено',uncertain:'Результат не подтверждён — проверьте VK перед повтором'};
 for(const op of operations.slice().reverse()){const item=el('div','sync-operation '+op.state),duration=op.finishedAt?' · '+((op.finishedAt-op.createdAt)/1000).toFixed(1)+' с':'';item.append(el('strong','',operationLabel(op)),el('small','',(labels[op.state]||op.state)+duration));if(op.message)item.append(el('p','',op.message));if(op.results?.length&&window.WaveCollection){const details=el('button','secondary','Результаты по песням');details.onclick=()=>{$('sync-dialog').classList.add('hidden');window.WaveCollection.results(op);};item.append(details);}root.append(item);}
}

async function synchronise(command){
 if(!state.online||state.collectionBusy)return;closeCollectionDialog();state.collectionBusy=true;controls();const ticket=state.request;
 try{const r=await call('mutate',command);state.operations=await call('operations');renderOperations();const op=r.operation;if(op?.state!=='success'){message(op?.message||'Не удалось подтвердить изменение в VK. Откройте журнал синхронизации.',true);return;}
  if(r.ownership)window.WaveCollection?.apply(r);applyPlaylists(r);if(typeof r.owned==='boolean'){for(const list of [state.allTracks,state.loop,state.history,state.current?[state.current]:[]])for(const t of list)if(t.id===command.trackId)t.owned=r.owned;for(const entry of cacheEntries.values())for(const t of entry.tracks||[])if(t.id===command.trackId)t.owned=r.owned;trackList();}
  if(r.collection){cacheEntries.set(r.collection.cacheId,r.collection);if(state.cacheId===r.collection.cacheId)applyRouteCache(r.collection,state.request,state.cacheId);if(state.playContext?.cacheId===r.collection.cacheId)updatePlaybackCache(r.collection);}
  // Invalidate route snapshots affected by the edit, keeping their scroll preferences.
  for(const [key,snapshot] of navigation.snapshots)if(snapshot.cacheId===r.collection?.cacheId)navigation.snapshots.delete(key);
  if(command.action==='create'&&ticket===state.request)await navigate({type:'playlist',id:r.playlistId,title:command.title});
  if(command.action==='rename'&&state.route.type==='playlist'&&state.route.id===command.playlistId){state.route.title=command.title;routeHeader();}
  window.WaveSong?.update();message('Изменение синхронизировано с VK.');return r;
 }catch(e){fail(e);}finally{state.collectionBusy=false;controls();}
}
function addToPlaylist(track){collectionDialog('Добавить «'+track.title+'» в плейлист');const lists=state.playlists.filter(p=>p.editable);const select=$('collection-select');select.replaceChildren();for(const p of lists){const option=el('option','',p.title);option.value=p.id;select.append(option);}select.classList.toggle('hidden',false);$('collection-help').textContent=lists.length?'Выберите свой плейлист.':'Сначала создайте свой плейлист кнопкой «+» в медиатеке.';if(lists.length){$('collection-confirm').classList.toggle('hidden',false);$('collection-confirm').textContent='Добавить';$('collection-confirm').onclick=()=>synchronise({action:'add',playlistId:select.value,trackId:track.id});}}
function trackActions(track,anchor){
 const root=window.WaveRowMenu?window.WaveRowMenu.open(track,anchor):(collectionDialog(track.title),$('collection-options'));const action=(label,fn)=>{const b=el('button','collection-action',label);b.type='button';b.setAttribute('role','menuitem');b.onclick=()=>{window.WaveRowMenu?.close();fn();};root.append(b);};
 const remove=(title,help,action,command)=>{collectionDialog(title);$('collection-help').textContent=help;$('collection-confirm').classList.toggle('hidden',false);$('collection-confirm').classList.toggle('danger-action',true);$('collection-confirm').textContent=action;$('collection-confirm').onclick=()=>synchronise(command);};
 action('Добавить в плейлист…',()=>addToPlaylist(track));
 if(ownPlaylist()){action('Удалить из этого плейлиста',()=>remove('Удалить песню из плейлиста?','«'+track.title+'» будет удалена только из этого плейлиста.','Удалить из плейлиста',{action:'remove',playlistId:state.route.id,trackId:track.id}));
  if(state.cacheState==='complete'&&!state.filter&&(!state.sort||state.sort==='original'))action('Переместить на позицию…',()=>{const tracks=state.allTracks.slice(),id=state.route.id;collectionForm('Порядок песен','Позиция от 1 до '+tracks.length,String(tracks.findIndex(t=>t.id===track.id)+1),value=>{const index=Number(value)-1;if(!Number.isInteger(index)||index<0||index>=tracks.length){$('collection-help').textContent='Введите целую позицию от 1 до '+tracks.length;return;}const others=tracks.filter(t=>t.id!==track.id);synchronise({action:'move',playlistId:id,trackId:track.id,beforeTrackId:others[index]?.id||null});},{number:true,max:tracks.length});});
  else $('collection-help').textContent='Для смены порядка дождитесь полной загрузки, очистите поиск и выберите «Порядок VK».';
 }
}
$('now-title').onclick=()=>window.WaveSong?.open();
$('playlist-create').onclick=()=>collectionForm('Новый плейлист','Название плейлиста','',title=>synchronise({action:'create',title}));
$('playlist-rename').onclick=()=>{const id=state.route.id;collectionForm('Переименовать плейлист','Название плейлиста',state.route.title,title=>synchronise({action:'rename',playlistId:id,title}));};
$('collection-cancel').onclick=closeCollectionDialog;$('collection-form').onsubmit=e=>{e.preventDefault();$('collection-confirm').onclick?.();};
$('sync-open').onclick=async()=>{$('sync-dialog').classList.toggle('hidden',false);try{state.operations=await call('operations');}catch(e){fail(e);}renderOperations();};$('sync-close').onclick=()=>{$('sync-dialog').classList.toggle('hidden',true);};
document.addEventListener('keydown',e=>{if(e.key==='Escape'){closeCollectionDialog();$('sync-dialog').classList.toggle('hidden',true);}});
if(has('onOperations'))api.onOperations(operations=>{const previous=new Map((state.operations||[]).map(o=>[o.id,o]));state.operations=operations.map(o=>({...o,...(o.detailsAvailable&&previous.get(o.id)?.results?{results:previous.get(o.id).results}:{})}));renderOperations();});
if(has('operations'))call('operations').then(operations=>{state.operations=operations;renderOperations();}).catch(()=>{});

renderNow();controls();status();setInterval(poll,1000);



