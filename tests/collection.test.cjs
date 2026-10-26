const test=require('node:test'),assert=require('node:assert/strict');
const {VkProvider}=require('../src/main/provider.cjs');const {validateCommand,CollectionEditor}=require('../src/main/collection-editor.cjs');const {trackMeta}=require('../src/main/navigation-meta.cjs');
function fixture(){const p=new VkProvider({});p.root='/audios123';p.online=true;p.playlists.set('p',{vkId:'123_1',title:'Own',owner:'User',index:0,editable:true,route:'https://vk.ru/audios123?section=all'});p.savedPlaylists=[{id:'p',title:'Own',editable:true}];const e=p.cache.create('p','Own');e.total=2;e.cacheState='complete';e.route='https://vk.ru/audios123?z=audio_playlist123_1';p.absorbRows({route:e.route,rows:[{key:'123_10',title:'A',artist:'X',time:'1:00',index:0},{key:'123_11',title:'B',artist:'Y',time:'1:00',index:1}]},e);return{p,e,ids:[...e.items.keys()]};}
test('mutation schema rejects arbitrary methods, routes, names and malformed move targets',()=>{
 for(const cmd of [{action:'execute'},{action:'create',title:''},{action:'create',title:'a',url:'https://evil.test'},{action:'create',title:'a'.repeat(101)},{action:'move',playlistId:'p',trackId:'t'},{action:'remove',playlistId:'p',trackId:123}])assert.throws(()=>validateCommand(cmd));
 assert.deepEqual(validateCommand({action:'create',title:'  Плейлист  '}),{action:'create',title:'Плейлист'});assert.equal(validateCommand({action:'move',playlistId:'p',trackId:'t',beforeTrackId:null}).beforeTrackId,null);
 const editor=new CollectionEditor({});assert.throws(()=>editor.route('/audios123','456_1'),/собственные/);
});
test('foreign playlists and offline mutations fail without reaching VK',async()=>{
 const {p,ids}=fixture();let calls=0;p.editor={edit:async()=>{calls++;}};p.playlists.get('p').editable=false;const r=await p.mutate({action:'remove',playlistId:'p',trackId:ids[0]});assert.equal(r.operation.state,'error');assert.equal(calls,0);p.playlists.get('p').editable=true;p.online=false;assert.equal((await p.mutate({action:'rename',playlistId:'p',title:'New'})).operation.state,'error');assert.equal(calls,0);
});
test('verified mutation replaces the full list and invalidates stale background refreshes',async()=>{
 const {p,e,ids}=fixture();const old=p.cache.create('p','Old');old.refreshTarget=e;old.refreshRevision=0;p.cache.byPlaylist.set('p',e);old.items.set('stale',{id:'stale'});old.total=1;
 p.editor={edit:async()=>({vkId:'123_1',title:'Own',rows:[{key:'123_11',title:'B',artist:'Y',time:'1:00',index:0}],route:e.route,changed:true})};const r=await p.mutate({action:'remove',playlistId:'p',trackId:ids[0]});assert.equal(r.operation.state,'success');assert.equal(r.collection.total,1);assert.equal(r.collection.tracks[0].title,'B');assert.equal(e.revision,1);p.cache.finish(old,true);assert.equal([...e.items.values()][0].title,'B');
});
test('a failed confirmation preserves cache, reports uncertainty and never repeats the write',async()=>{
 const {p,e,ids}=fixture();let calls=0;p.editor={edit:async()=>{calls++;throw Object.assign(Error('Не подтверждено'),{uncertain:true});}};const r=await p.mutate({action:'remove',playlistId:'p',trackId:ids[0]});assert.equal(r.operation.state,'uncertain');assert.equal(calls,1);assert.equal(e.items.size,2);assert.equal(p.operations()[0].message,'Не подтверждено');
});
test('collection writes serialize independently from catalogue reads',async()=>{
 const {p}=fixture();let release;const first=new Promise(r=>{release=r;});let started=0;p.editor={edit:async cmd=>{started++;if(started===1)await first;return{vkId:'123_1',title:cmd.title,route:'https://vk.ru/audios123?z=audio_playlist123_1',rows:[],changed:true};}};
 const a=p.mutate({action:'rename',playlistId:'p',title:'First'}),b=p.mutate({action:'rename',playlistId:'p',title:'Second'});await new Promise(r=>setImmediate(r));assert.equal(started,1);assert.equal(await p.exclusive(async()=>42),42);release();await Promise.all([a,b]);assert.equal(started,2);assert.equal(p.playlists.get('p').title,'Second');
});
test('all artist names survive normalization and the selected artist owns the page title',async()=>{
 const artists=[{name:'Первый',route:'/artist/1'},{name:'Второй',route:'/artist/2'}];const normalized=trackMeta({artists});assert.equal(normalized.artists.length,2);const p=new VkProvider({});p.tracks.set('t',{artist:'Первый, Второй',artists:normalized.artists});let route;p.route=async r=>{route=r;};p.readyRows=async()=>{};p.readRows=async()=>({tracks:[]});p.preparePlayback=()=>{};p.engine.evaluate=async()=>({title:'Целых 3 месяца подписки — 0 ₽',albums:[{title:'Свой',owner:'Второй',index:0,section:'release'},{title:'Фит',owner:'Другой',index:1,section:'contribution'}]});const r=await p.artist({trackId:'t',artistIndex:1});assert.equal(route,'https://vk.ru/artist/2');assert.equal(r.title,'Второй');assert.equal(r.albums.length,1);assert.equal(r.contributions.length,1);
});
test('VK editor waits for the input value and identifies models by identity, not array index',async()=>{
 const vm=require('node:vm');const {openEditor}=require('../src/main/collection-editor.cjs');let shown=false;const input={value:''};const rows=[[10,123,'','A','Artist',60]];
 const base={getType:()=> 'playlist',getOwnerId:()=>123,getPlaylistId:()=>1,hasMore:()=>false,getAudiosCount:()=>1};
 const temp={getType:()=> 'temp',getOwnerId:()=>123,getId:()=> 'temp_123_987',getTitle:()=> 'Own',getAudiosList:()=>rows,getAudiosCount:()=>1};
 const window={vk:{id:123}};const button={click(){shown=true;window.getAudioPlayer=()=>({_playlists:[base,temp]});setTimeout(()=>{input.value='Own';},10);}};
 const context=vm.createContext({window,document:{readyState:'complete',querySelector:s=>s==='#ape_pl_name'?(shown?input:null):button},setTimeout,Promise,Set,Date,String,Object,Error,Array});
 const result=await vm.runInContext(`(${openEditor.toString()})({accountRoot:'/audios123',vkId:'123_1',create:false})`,context);assert.equal(result.title,'Own');assert.equal(result.keys[0],'123_10');
});
test('catalogue extracts every author and classifies collaborations separately',()=>{
 const {collect,artistInfo}=require('../src/main/catalog.cjs');const vm=require('node:vm');const authors=[{textContent:'Первый',getAttribute:()=>'/artist/1'},{textContent:'Второй',getAttribute:()=>'/artist/2'}];
 const row={closest:()=>({getAttribute:()=> '123_1'}),querySelectorAll:()=>authors,querySelector:s=>s.includes('_Title')?{textContent:'Song',matches:()=>false,querySelector:()=>null}:s.includes('_Authors')?authors[0]:s.includes('_Duration')?{textContent:'1:00'}:s.includes('tappable')?{getAttribute:()=>null}:null};
 const root={querySelectorAll:()=>[row],querySelector:()=>null};const context=vm.createContext({document:{querySelector:()=>root,querySelectorAll:()=>[]},location:{href:'https://vk.ru/audio'}});const result=vm.runInContext(`(${collect.toString()})('body')`,context);assert.equal(result.rows[0].artist,'Первый, Второй');assert.equal(result.rows[0].artists.length,2);
 const card=(section,title)=>({closest:()=>({innerText:section}),querySelector:s=>s.includes('_Title')?{textContent:title}:s.includes('_AuthorLink')?{textContent:'Автор'}:null});context.document.querySelectorAll=()=>[card('Релизы\nПоказать все','Свой'),card('Участие в релизах\nПоказать все','Фит'),card('Встречается в плейлистах','Подборка')];const info=vm.runInContext(`(${artistInfo.toString()})()`,context);assert.equal(info.albums.length,2);assert.equal(info.albums[0].section,'release');assert.equal(info.albums[1].section,'contribution');assert.equal(info.title,undefined);
});
test('playback locates a multi-artist song by its exact identity and title',()=>{
 const {findAndPlay}=require('../src/main/catalog.cjs'),vm=require('node:vm');let clicks=0;const tap={getAttribute:()=> 'Начать прослушивание',click:()=>clicks++};const row={closest:()=>({getAttribute:()=> '123_1'}),querySelector:s=>s.includes('_Title')?{textContent:'Song'}:s.includes('tappable')?tap:null};const context=vm.createContext({document:{querySelector:()=>({querySelectorAll:()=>[row]})}});assert.equal(vm.runInContext(`(${findAndPlay.toString()})({scope:'body',key:'123_1',title:'Song',artist:'First, Second'})`,context),true);assert.equal(clicks,1);assert.equal(vm.runInContext(`(${findAndPlay.toString()})({scope:'body',key:'123_2',title:'Song',artist:'First, Second'})`,context),false);assert.equal(clicks,1);
});

const {normalizePayload}=require('../src/main/metadata-store.cjs');
const route='https://vk.ru/audios123?section=all&z=audio_playlist123_2';


test('a partial or stale carousel cannot remove a confirmed new playlist or revert its name',()=>{
 const p=new VkProvider({});p.root='/audios123';p.absorbPlaylists([{vkId:'123_1',title:'Old',owner:'User',index:0,editable:true}],'https://vk.ru/audios123?section=all');
 const r=p.applyCollectionMutation({action:'create'},{vkId:'123_2',title:'New',owner:'User',rows:[],route,playlists:[]},{});const id=r.playlistId;assert(p.savedPlaylists.some(x=>x.id===id));
 p.absorbPlaylists([{vkId:'123_1',title:'Old',owner:'User',index:0,editable:true}],'https://vk.ru/audios123?section=all',{revision:0});assert(p.savedPlaylists.some(x=>x.id===id));
 p.applyCollectionMutation({action:'rename',playlistId:id},{vkId:'123_2',title:'Renamed',rows:[],route},{});p.absorbPlaylists([{vkId:'123_2',title:'New',owner:'User',index:0,editable:true}],'https://vk.ru/audios123?section=all',{revision:0});assert.equal(p.playlists.get(id).title,'Renamed');
 p.absorbPlaylists([],'https://vk.ru/audios123?section=all');assert(p.savedPlaylists.some(x=>x.id===id));const payload=normalizePayload(p.exportMetadata());assert(payload);assert(payload.playlists.some(x=>x.id===id&&x.title==='Renamed'));
});

test('new playlists stay first through late catalogue updates and metadata restore',async()=>{const p=new VkProvider({});p.root='/audios123';p.scheduleSave=()=>{};const route='https://vk.ru/audios123?section=all',row=(id,title)=>({vkId:'123_'+id,title,owner:'User',index:id,editable:true});p.absorbPlaylists([row(1,'Old'),row(2,'Older')],route);const made=p.applyCollectionMutation({action:'create'},{vkId:'123_3',title:'New',rows:[],route},{});p.absorbPlaylists([row(1,'Old'),row(2,'Older'),row(3,'New')],route);assert.equal(p.savedPlaylists[0].id,made.playlistId);p.absorbPlaylists([row(1,'Old')],route,{revision:0});assert.equal(p.savedPlaylists[0].id,made.playlistId);const payload=normalizePayload(p.exportMetadata());const restored=new VkProvider({},{},{store:{load:async()=>payload}});await restored.restore();assert.deepEqual(restored.savedPlaylists.map(p=>p.title),['New','Old','Older']);restored.absorbPlaylists([row(1,'Old'),row(2,'Older'),row(3,'New'),row(4,'Newest')],route);assert.deepEqual(restored.savedPlaylists.map(p=>p.title),['Newest','New','Old','Older']);});
