'use strict';
(()=>{
 const labels={tracks:'Треки',albums:'Альбомы',singles:'Синглы',releases:'Релизы',contributions:'Участие в релизах'};
 const section=document.querySelector('.track-section'),hero=document.querySelector('.hero'),main=document.querySelector('main');
 const tabs=el('div','artist-tabs hidden');tabs.id='artist-tabs';tabs.setAttribute('role','tablist');tabs.setAttribute('aria-label','Музыка исполнителя');
 const releases=el('section','artist-releases hidden');releases.id='artist-releases';releases.setAttribute('role','tabpanel');
 const status=el('p','muted artist-section-status'),retry=el('button','secondary hidden','Повторить'),grid=el('div','artist-grid');
 const tools=el('div','artist-release-tools'),sortLabel=el('label','','Порядок релизов'),sort=el('select');sort.setAttribute('aria-label','Порядок релизов');sortLabel.append(sort);tools.append(sortLabel);releases.append(status,retry,tools,grid);section.prepend(tabs,releases);
 const banner=el('img','artist-banner hidden');banner.alt='';banner.referrerPolicy='no-referrer';hero.prepend(banner);
 const trackPanel=$('search-results');let active='tracks',currentKey='',artKey='',imageEpoch=0,cardWindow;let sortMode='original';const sorted=new WeakMap(),mergedCache=new WeakMap(),paints=new Map(),positions=new Map();let lastArtistNotice='';
 for(const [type,label] of Object.entries(labels)){
  const button=el('button','artist-tab',label);button.type='button';button.id='artist-tab-'+type;button.setAttribute('role','tab');
  button.onclick=()=>select(type);
  button.onkeydown=e=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;e.preventDefault();const all=[...tabs.children].filter(b=>!b.classList.contains('hidden')),i=all.indexOf(button),n=e.key==='Home'?0:e.key==='End'?all.length-1:(i+(e.key==='ArrowRight'?1:-1)+all.length)%all.length;all[n].click();all[n].focus({preventScroll:true});};tabs.append(button);
 }
 sort.onchange=()=>{sortMode=sort.value;remember();render();};
 retry.type='button';retry.onclick=()=>navigate({...state.route},true).catch(fail);
 function select(type){if(state.route.type!=='artist'||type===active)return;remember();active=type;sortMode=positions.get(currentKey)?.[type]?.sort||'original';state.route.artistTab=type;render();const saved=positions.get(currentKey)?.[type];main.scrollTop=saved?.scroll||0;if(saved?.anchor&&type!=='tracks')cardWindow?.restore(saved.anchor);saveView();}
 function remember(){if(!currentKey||state.route.type!=='artist'||state.loading||!state.viewLoaded)return;const all=positions.get(currentKey)||{};all[active]={sort:sortMode,scroll:main.scrollTop||0,anchor:active==='tracks'?window.WaveTracks?.anchor():cardWindow?.anchor()};positions.set(currentKey,all);while(positions.size>100)positions.delete(positions.keys().next().value);}
 function applyArt(){
  const art=state.artistArtwork||{},key=JSON.stringify([routeKey(state.route),art]);if(key===artKey)return;artKey=key;const epoch=++imageEpoch;
  const avatar=$('hero-cover');hero.classList.remove('artist-has-banner','artist-has-avatar');banner.classList.add('hidden');banner.removeAttribute('src');
  const showBanner=url=>{if(epoch!==imageEpoch)return;banner.src=url;banner.onload=()=>{if(epoch!==imageEpoch)return;banner.classList.remove('hidden');hero.classList.add('artist-has-banner');};banner.onerror=()=>{if(epoch===imageEpoch){banner.classList.add('hidden');hero.classList.remove('artist-has-banner');}};};
  if(art.banner)showBanner(art.banner);
  heroCover(art.avatar);if(art.avatar){hero.classList.add('artist-has-avatar');avatar.onload=()=>{if(epoch!==imageEpoch)return;if(avatar.naturalWidth/avatar.naturalHeight>1.5){avatar.classList.add('hidden');hero.classList.remove('artist-has-avatar');}};}
  if(!art.avatar&&art.profile){const probe=new Image();probe.referrerPolicy='no-referrer';probe.onload=()=>{if(epoch!==imageEpoch||state.route.type!=='artist')return;const ratio=probe.naturalWidth/probe.naturalHeight;if(ratio>=1.8){if(!art.banner)showBanner(art.profile);}else if(ratio>=.55&&ratio<=1.4){heroCover(art.profile);hero.classList.add('artist-has-avatar');}};probe.src=art.profile;}
 }
 function card(item){const node=el('button','album-card artist-release-card');node.type='button';node.title=item.title+(item.owner?' — '+item.owner:'');node.append(coverNode(item.cover,'album-cover'),el('strong','',item.title),el('small','',[item.owner,item.year].filter(Boolean).join(' · ')||'Релиз'));node.onclick=()=>navigate({type:'album',id:item.id,title:item.title,cover:item.cover}).catch(fail);return node;}
 function paint(items,root=grid,namespace='main'){
  let view=paints.get(root);if(!view){view={window:null,signature:'',columns:0,route:'',nodes:new Map(),rows:new Map()};paints.set(root,view);}
  if(!view.window&&window.WaveVirtual){root.classList.add('virtualized');view.window=window.WaveVirtual.create({root:root,scroll:main,estimate:250,minRows:3,overscan:3,onChange:()=>{if(state.route.type==='artist'&&active!=='tracks')render();}});}
  if(!view.window){const key=JSON.stringify(items);if(view.signature!==key){view.signature=key;root.replaceChildren(...items.map(card));}return;}
  const nextColumns=Math.max(1,Math.floor((root.clientWidth+20)/180)),nextRoute=currentKey+'|'+active+'|'+namespace,anchor=view.route===nextRoute&&view.columns&&view.columns!==nextColumns?view.window.anchor():null;
  if(namespace==='main')cardWindow=view.window;view.window.configure(nextRoute+'|'+nextColumns,Math.ceil(items.length/nextColumns));if(anchor)view.window.restore({index:Math.floor(anchor.index*view.columns/nextColumns),offset:anchor.offset});view.columns=nextColumns;view.route=nextRoute;
  const slice=view.window.range(),focused=document.activeElement?.closest?.('[data-artist-card]');if(focused&&root.contains(focused)){const row=Math.floor(Number(focused.dataset.artistCard)/view.columns);if(!slice.indices.includes(row))slice.indices.push(row);}slice.indices.sort((a,b)=>a-b);
  const key=JSON.stringify([nextRoute,view.columns,slice.indices,slice.version,items.length,slice.indices.flatMap(row=>items.slice(row*view.columns,(row+1)*view.columns))]);if(view.signature===key)return;view.signature=key;const live=new Set(),liveRows=new Set(),mounted=[];
  for(const index of slice.indices){liveRows.add(index);let row=view.rows.get(index);if(!row){row=el('div','virtual-card-row');view.rows.set(index,row);}row.style.gridTemplateColumns='repeat('+view.columns+',minmax(0,1fr))';const desired=[];
   for(let i=index*view.columns;i<Math.min(items.length,(index+1)*view.columns);i++){const item=items[i],metadata=JSON.stringify(item);live.add(item.id);let entry=view.nodes.get(item.id);if(!entry||entry.metadata!==metadata){entry={node:card(item),metadata};view.nodes.set(item.id,entry);}entry.node.dataset.artistCard=String(i);desired.push(entry.node);}desired.forEach((node,i)=>{if(row.children[i]!==node)row.insertBefore(node,row.children[i]||null);});for(const child of [...row.children])if(!desired.includes(child))child.remove();mounted.push({node:row,index});
  }
  view.window.commit(mounted);for(const [id,e] of view.nodes)if(!live.has(id)){e.node.remove();view.nodes.delete(id);}for(const [id,row] of view.rows)if(!liveRows.has(id)){row.remove();view.rows.delete(id);}
 }
 function render(){
  const artist=state.route.type==='artist',pending=artist&&(state.loading||!state.viewLoaded);section.classList.toggle('artist-content-pending',pending);if(artist)section.setAttribute('aria-busy',String(!!state.loading));else section.removeAttribute('aria-busy');hero.classList.toggle('artist-hero',artist);tabs.classList.toggle('hidden',!artist);releases.classList.toggle('hidden',!artist||active==='tracks');
  if(!artist){++imageEpoch;artKey='';banner.classList.add('hidden');hero.classList.remove('artist-has-banner','artist-has-avatar');trackPanel?.classList.remove('artist-track-hidden');return;}
  const key=routeKey(state.route);if(key!==currentKey){currentKey=key;active=navigation.views.get(key)?.artistTab||state.route.artistTab||'tracks';if(!Object.hasOwn(labels,active))active='tracks';sortMode=positions.get(key)?.[active]?.sort||'original';}
  if(pending){applyArt();tabs.classList.add('hidden');releases.classList.add('hidden');trackPanel?.classList.remove('artist-track-hidden');trackPanel?.removeAttribute('role');trackPanel?.removeAttribute('aria-labelledby');trackPanel?.setAttribute('aria-busy',String(!!state.loading));$('play-all').classList.add('hidden');if(state.loading&&(!$('message').textContent||$('message').textContent===lastArtistNotice)){lastArtistNotice='Загружаем музыку…';message(lastArtistNotice);}return;}
  const disc=state.artistDiscography||{},combined=state.artistDiscography?(!disc.albums?.length||!disc.singles?.length||!!disc.unknown?.length):state.loading?active==='releases':true;
  if(!state.loading&&combined&&['albums','singles'].includes(active)){active='releases';state.route.artistTab=active;}else if(!state.loading&&!combined&&active==='releases'){active='albums';state.route.artistTab=active;}
  const tracksTitle=state.artistTrackTitle==='Популярные треки'?'Популярные треки':'Треки';setText($('artist-tab-tracks'),tracksTitle);
  for(const type of ['albums','singles'])$('artist-tab-'+type).classList.toggle('hidden',combined);$('artist-tab-releases').classList.toggle('hidden',!combined);
  let combinedItems=disc.releases;if(!combinedItems){combinedItems=mergedCache.get(disc);if(!combinedItems){const seen=new Set();combinedItems=[...(disc.albums||[]),...(disc.singles||[]),...(disc.unknown||[])].filter(item=>{if(seen.has(item.id))return false;seen.add(item.id);return true;});mergedCache.set(disc,combinedItems);}}
  applyArt();setText($('subtitle'),'');setText($('list-heading'),tracksTitle);$('count').textContent='';
  const emptyTracks=!state.loading&&!state.allTracks.length;document.querySelector('.table-head').classList.toggle('hidden',emptyTracks);document.querySelector('.list-tools').classList.toggle('hidden',emptyTracks);$('play-all').classList.toggle('hidden',emptyTracks);if(emptyTracks)setText($('list-detail'),'');
  $('albums-section').classList.add('hidden');$('contributions-section').classList.add('hidden');
  for(const button of tabs.children){const type=button.id.slice('artist-tab-'.length),selected=type===active;button.setAttribute('aria-selected',String(selected));button.tabIndex=selected?0:-1;button.setAttribute('aria-controls',type==='tracks'?'search-results':'artist-releases');}
  trackPanel?.classList.toggle('artist-track-hidden',active!=='tracks');if(trackPanel){trackPanel.setAttribute('role','tabpanel');trackPanel.setAttribute('aria-labelledby','artist-tab-tracks');trackPanel.setAttribute('aria-busy',String(!!state.loading));}
  releases.classList.toggle('hidden',active==='tracks');releases.setAttribute('aria-labelledby','artist-tab-'+active);releases.setAttribute('aria-busy',String(!!state.loading));
  const meta=state.artistSections?.[active],rawItems=active==='releases'?combinedItems:disc[active]||[];let items=rawItems;const withYear=rawItems.some(item=>Number.isInteger(item.year));const options=[['original','Порядок VK'],...(withYear?[['newest','Сначала новые']]:[]),['title','Название · А–Я']];const optionKey=JSON.stringify(options);if(sort.dataset.options!==optionKey){sort.dataset.options=optionKey;sort.replaceChildren(...options.map(([value,title])=>{const option=el('option','',title);option.value=value;return option;}));}if(sortMode==='newest'&&!withYear)sortMode='original';sort.value=sortMode;tools.classList.toggle('hidden',active==='tracks'||rawItems.length<2);if(sortMode!=='original'){let cache=sorted.get(rawItems);if(!cache){cache={};sorted.set(rawItems,cache);}cache[sortMode]??=rawItems.map((item,index)=>({item,index})).sort((a,b)=>(sortMode==='title'?a.item.title.localeCompare(b.item.title,'ru'):(b.item.year||0)-(a.item.year||0))||a.index-b.index).map(row=>row.item);items=cache[sortMode];}
  const text=state.loading?'Загружаем…':meta?.error||(!meta?.available?'VK не предоставил этот раздел.':items.length||active==='tracks'&&state.allTracks.length?'':'В этом разделе пока нет релизов.');status.textContent=text;status.classList.toggle('error',!!meta?.error);retry.classList.toggle('hidden',state.loading||!meta?.error);
  if(lastArtistNotice&&$('message').textContent===lastArtistNotice)message('');lastArtistNotice='';
  if(active==='tracks'){
   if(!state.loading&&(meta?.error||!state.allTracks.length)){lastArtistNotice=meta?.error||'У исполнителя пока нет доступных треков.';message(lastArtistNotice,!!meta?.error);$('empty-state').classList.add('hidden');}
   return;
  }
  paint(items);
 }
 window.WaveArtistUI={render,remember,tab:()=>active,reset(){currentKey='';artKey='';positions.clear();++imageEpoch;}};
 render();
})();
