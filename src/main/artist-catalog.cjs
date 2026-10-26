'use strict';
const {cover}=require('./navigation-meta.cjs');
const heading=value=>String(value||'').normalize('NFC').replace(/\s+/g,' ').trim();
const fail=message=>Object.assign(Error(message),{kind:'protocol'});
function images(value){
 if(typeof value==='string')return cover(value)?[{url:cover(value)}]:[];
 if(Array.isArray(value))return value.flatMap(images);
 if(!value||typeof value!=='object')return[];
 if(value.url)return cover(value.url)?[{url:cover(value.url),width:Number(value.width)||0,height:Number(value.height)||0}]:[];
 return Object.entries(value).filter(([key])=>/^photo_\d+$/.test(key)).flatMap(([,url])=>images(url));
}
function artistArtwork(artist){
 if(!artist)return{};
 const choose=items=>items.sort((a,b)=>(b.width||0)*(b.height||0)-(a.width||0)*(a.height||0))[0]?.url;
 const photos=images(artist.photo),wide=photos.filter(p=>p.width>0&&p.height>0&&p.width/p.height>=1.8),square=photos.filter(p=>p.width>0&&p.height>0&&p.width/p.height>=.7&&p.width/p.height<=1.4);
 // Named image roles take precedence. Generic artist photos need dimensions;
 // unknown-size photos are checked once on image load, never cropped blindly.
 const banner=choose(images(artist.cover))||choose(images(artist.banner))||choose(wide);
 const avatar=choose(images(artist.avatar))||choose(square);
 return{banner,avatar,profile:!avatar?choose(photos.filter(p=>!wide.includes(p)&&!p.width&&!p.height)):undefined};
}
function releaseKind(p,section){
 if(section==='contributions')return section;
 const type=heading(p.release_type||p.album_type).toLocaleLowerCase();
 if(['single','сингл','ep','мини-альбом'].includes(type)||p.is_single===true||p.is_single===1)return'singles';
 if(['album','альбом'].includes(type))return'albums';
 if(section==='singles'||section==='albums')return section;
 // Counts and type=1 (a music release versus a user playlist) do not identify singles.
 return'unknown';
}
function blockKind(title,type,block={}){
 const text=heading(title);
 if(['music_audios','audios'].includes(type)||Array.isArray(block.audios_ids)){if(/^(Популярн(?:ые(?: треки| песни)?|ое)|Popular(?: tracks| songs)?|Top (?:tracks|songs))$/i.test(text))return'tracks';if(/^(Все треки|Треки|Песни|All tracks|Tracks|Songs)$/i.test(text))return'artistTracks';}
 if(type!=='music_playlists')return;
 if(/^(Участие в релизах|Appears on|Contributions)$/i.test(text))return'contributions';
 if(/^(Синглы(?: и EP)?|Singles(?: and EPs)?)$/i.test(text))return'singles';
 if(/^(Альбомы|Albums)$/i.test(text))return'albums';
 if(/^(Релизы|Releases)$/i.test(text))return'releases';
}
async function readArtist(api,id,name,{keyOf,audioRow,playlistRow},options={}){
 const {signal}=options,request=(method,params)=>api.call(method,params,{signal});
 const data=await request('catalog.getAudioArtist',{url:'https://vk.ru/artist/'+id,artist_id:id,need_blocks:1});
 if(!Array.isArray(data?.catalog?.sections))throw fail('VK не вернул страницу исполнителя. Повторите открытие.');
 const exact=(data.artists||[]).filter(a=>heading(a.name).toLocaleLowerCase()===heading(name).toLocaleLowerCase()),person=data.artists?.find(a=>String(a.id)===String(id))||(exact.length===1?exact[0]:undefined),authorId=person?.id||id;
 const groups={tracks:[],albums:[],singles:[],contributions:[],unknown:[]},sections={},allReleases=[];
 const audios=new Map((data.audios||[]).map(a=>[keyOf(a),a])),playlists=new Map((data.playlists||[]).map(p=>[keyOf(p),p]));
 api.rememberAudio(data.audios);api.rememberPlaylist(data.playlists);
 const blocks=[];
 for(const section of data.catalog.sections){let title=section.title;for(const block of section.blocks||[]){if(block.title)title=block.title;const kind=blockKind(title,block.data_type,block);if(kind)blocks.push({block,kind});}}
 const popular=blocks.some(b=>b.kind==='tracks');
 for(const {block,kind:sourceKind} of blocks){
  if(sourceKind==='artistTracks'&&popular)continue;const kind=sourceKind==='artistTracks'?'tracks':sourceKind;
  const targets=kind==='releases'?['albums','singles','unknown']:[kind];for(const t of targets)sections[t]??={available:true,error:null};
  const idsKey=kind==='tracks'?'audios_ids':'playlists_ids',keys=Array.isArray(block[idsKey])?[...block[idsKey]]:[];
  let error=null,cursor=block.next_from,blockId=block.id,pages=0;const seen=new Set();
  try{
   if(!Array.isArray(block[idsKey]))throw fail('VK вернул некорректный раздел исполнителя.');
   while(cursor){
    if(typeof blockId!=='string'||typeof cursor!=='string'||seen.has(cursor)||pages++>=50)throw fail('VK не завершил список. Повторите открытие исполнителя.');seen.add(cursor);
    const page=await request('catalog.getBlockItems',{block_id:blockId,start_from:cursor,count:100});
    if(!page?.block||!Array.isArray(page.block[idsKey]))throw fail('Не удалось прочитать продолжение раздела VK.');
    api.rememberAudio(page.audios);api.rememberPlaylist(page.playlists);
    for(const a of page.audios||[])audios.set(keyOf(a),a);for(const p of page.playlists||[])playlists.set(keyOf(p),p);
    keys.push(...page.block[idsKey]);blockId=page.block.id||blockId;cursor=page.block.next_from;
   }
  }catch(e){if(signal?.aborted||['auth','account-changed','closed','cancelled'].includes(e.kind))throw e;error=e.kind==='protocol'?e.message:'Не удалось загрузить раздел. Повторите открытие исполнителя.';for(const t of targets)sections[t].error=error;}
  const seenKeys=new Set();
  for(const key of keys){if(seenKeys.has(String(key)))continue;seenKeys.add(String(key));
   if(kind==='tracks'){const raw=audios.get(String(key)),row=raw&&audioRow(raw,groups.tracks.length);if(row&&!groups.tracks.some(t=>t.key===row.key))groups.tracks.push(row);else if(!raw)sections.tracks.error='VK вернул неполный список треков.';continue;}
   const p=playlists.get(String(key));if(!p){for(const t of targets)sections[t].error='VK вернул неполный список релизов.';continue;}
   const row=playlistRow(p,0);if(!row)continue;if(Number.isInteger(p.year)&&p.year>=1000&&p.year<=9999)row.year=p.year;
   const creators=p.main_artists||[],own=creators.some(a=>a.id?String(a.id)===String(authorId):heading(a.name).toLocaleLowerCase()===heading(name).toLocaleLowerCase());
   const target=kind!=='contributions'&&creators.length&&!own?'contributions':releaseKind(p,kind);
   sections[target]??={available:true,error:null};if(!groups[target].some(a=>a.vkId===row.vkId))groups[target].push(row);if(target!=='contributions'&&!allReleases.some(a=>a.vkId===row.vkId))allReleases.push(row);
  }
 }
 // Unlabelled pools are not popularity evidence. Recover only records whose
 // author identity matches this page, and label this fallback simply Tracks.
 if(!sections.tracks){
  const own=(data.audios||[]).filter(a=>{const authors=[...(a.main_artists||[]),...(a.featured_artists||[])];return authors.length?authors.some(person=>person.id?String(person.id)===String(authorId):heading(person.name).toLocaleLowerCase()===heading(name).toLocaleLowerCase()):heading(a.artist).toLocaleLowerCase()===heading(name).toLocaleLowerCase();});
  for(const a of own){const row=audioRow(a,groups.tracks.length);if(row&&!groups.tracks.some(t=>t.key===row.key))groups.tracks.push(row);}
  if(groups.tracks.length)sections.tracks={available:true,error:null};
 }
 for(const key of Object.keys(groups))sections[key]??={available:false,error:null};
 const releaseSections=['albums','singles','unknown'].map(key=>sections[key]);sections.releases={available:releaseSections.some(s=>s.available),error:[...new Set(releaseSections.map(s=>s.error).filter(Boolean))].join(' ')||null};
 return{subscription:person&&typeof person.is_followed==='boolean'?{nativeId:String(person.id),routeId:String(id),title:String(person.name||name),followed:person.is_followed,canFollow:person.can_follow===true}:undefined,title:person?.name||name,rows:groups.tracks,total:groups.tracks.length,partial:false,albums:allReleases,contributions:groups.contributions,discography:{...groups,releases:allReleases},artistSections:sections,trackSectionTitle:popular?'Популярные треки':'Треки',artwork:artistArtwork(person)};
}
module.exports={readArtist,artistArtwork,releaseKind,blockKind,images};
