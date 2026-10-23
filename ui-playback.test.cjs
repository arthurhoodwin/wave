// Actual renderer code, simulated DOM and deferred transport; no network or account.
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const path = require('node:path');
const nodes = new Map();
let rebuilds = 0;
function make(tag) {
  return { tagName: typeof tag==='string'?tag.toUpperCase():'DIV', textContent: '', value: 0, children: [],
    classList: { values: new Set(), toggle(k,v) {v ? this.values.add(k) : this.values.delete(k);}, contains(k) {return this.values.has(k);} },
    setAttribute(k,v) {this[k]=v;}, append(...x) {this.children.push(...x);}, after() {},
    replaceChildren(...x) {this.children=x;if(this===nodes.get('tracks'))rebuilds++;}, addEventListener() {} };
}
function get(id) {if(!nodes.has(id))nodes.set(id,make());return nodes.get(id);}
const calls=[], pending=[];
const context=vm.createContext({window:{music:{play(id){calls.push(id);return new Promise((resolve,reject)=>pending.push({resolve,reject}));}},addEventListener(){}},
  document:{getElementById:get,createElement:make,createDocumentFragment:make,querySelector:()=>get('main'),querySelectorAll:()=>[],addEventListener(){},body:make()},
  requestAnimationFrame:()=>1,cancelAnimationFrame(){},setTimeout:()=>1,clearTimeout(){},setInterval(){},Math,Set,Map,Promise,Date});
vm.runInContext(fs.readFileSync(path.join(__dirname,'ui/app.js'),'utf8'),context);
const run=code=>vm.runInContext(code,context);
async function accept(promise) {pending.at(-1).resolve({playing:true});await promise;}
async function test() {
  run("state.ready=true;state.online=true;state.allTracks=[{id:'zero',duration:0},{id:'a',duration:90},{id:'b',duration:120}];state.tracks=state.allTracks;trackList()");
  const row=run('renderedRows[0].row');assert.equal(row.tabIndex,-1);assert.equal(row.onclick,undefined);assert.equal(row.onkeydown,undefined);
  await run('playSelection(0)');assert.equal(calls.length,0);
  const a=run('playSelection(1)'),b=run('playSelection(2)');assert.deepEqual(calls,['a','b']);
  pending[0].resolve({playing:true});await a;assert.equal(run('state.busy'),true);assert.equal(run('state.current'),null);
  await accept(b);assert.equal(run('state.current.id'),'b');assert.equal(run('state.busy'),false);assert.equal(run('state.loop.length'),2);
  const before=rebuilds;for(let i=0;i<100;i++)run('trackList()');assert.equal(rebuilds,before);
  // Repeat one restarts through the transport, without polluting history.
  run("state.repeat='one'");const history=run('state.history.length');await accept(run('next(true)'));assert.equal(calls.at(-1),'b');assert.equal(run('state.history.length'),history);
  // Incomplete caches wait even with repeat all; cache arrival resumes after natural end.
  run("state.repeat='all';state.playContext={cacheId:'c',cacheState:'loading'};state.playing=false;");await run('next(true)');assert.equal(run('state.pendingNext'),true);
  run("updatePlaybackCache({cacheState:'complete',tracks:[{id:'zero',duration:0},{id:'a',duration:90},{id:'b',duration:120},{id:'bad',duration:0},{id:'c',duration:80}]})");
  pending.at(-1).resolve({playing:true});await new Promise(r=>setImmediate(r));assert.equal(calls.at(-1),'c');assert.equal(run('state.playing'),true);
  await accept(run('next(true)'));assert.equal(calls.at(-1),'a');
  // Cache error is not completion and must not wrap. Previous stays in active context.
  run("state.current=state.loop.at(-1);state.playContext.cacheState='error';state.playing=false;");const count=calls.length;await run('next(true)');assert.equal(calls.length,count);
  run("state.current=state.loop[0];state.history=[{id:'foreign',duration:90,contextOrder:44}]");await run('previous()');assert.equal(calls.length,count);
  const old=run("playTrack({id:'old',duration:90})"),latest=run("playTrack({id:'latest',duration:90})");await accept(latest);run("message('new error',true)");pending.at(-2).reject(new Error('stale error'));await old;assert.equal(get('message').textContent,'new error');assert.equal(run('state.current.id'),'latest');
  // Atomic metadata replacement may insert, remove or reorder entries before current.
  run("state.pendingNext=false;state.repeat='off';state.shuffle=false;state.loop=[{id:'a',duration:90,contextOrder:0},{id:'b',duration:90,contextOrder:1},{id:'c',duration:90,contextOrder:2}];state.current=state.loop[1];state.playContext={cacheId:'atomic',cacheState:'complete'};state.playing=true");
  const generation=run('state.generation'),playCount=calls.length;
  run("updatePlaybackCache({cacheState:'complete',tracks:[{id:'insert',duration:90},{id:'a',duration:90},{id:'b',duration:90},{id:'c',duration:90}]})");
  assert.equal(run('state.current.id'),'b');assert.equal(run('state.current.contextOrder'),2);assert.equal(run('state.loop[state.loop.findIndex(t=>t.id===state.current.id)+1].id'),'c');
  run("updatePlaybackCache({cacheState:'complete',tracks:[{id:'insert',duration:90},{id:'a',duration:90},{id:'c',duration:90}]})");
  assert.equal(run('state.current.id'),'b');assert.equal(run('state.loop[state.loop.findIndex(t=>t.id===state.current.id)+1].id'),'c');assert.equal(run('state.playing'),true);assert.equal(run('state.generation'),generation);assert.equal(calls.length,playCount);
  await accept(run('next(true)'));assert.equal(calls.at(-1),'c');
  await run("applySession({state:'pending',verifying:true})");assert.equal(get('connection').textContent,'Подключаем VK…');assert.equal(get('message').textContent,'Подключаем VK…');
  context.window.music.volume=async()=>{throw new Error('offline volume must not call transport');};
  await get('volume').onchange();assert.equal(get('volume').disabled,true);
  const source=[{id:'a',title:'Я',artist:'Б',duration:90},{id:'b',title:'А 2',artist:'А',duration:120},{id:'c',title:'А 10',artist:'Б',duration:60}];
  context.navigationFixture=source;
  assert.equal(run("selectTracks(navigationFixture,'б','duration').map(t=>t.id).join(',')"),'c,a');
  assert.equal(run("selectTracks(navigationFixture,'','title').map(t=>t.id).join(',')"),'b,c,a');assert.equal(source[0].id,'a');
  run("state.online=true;state.ready=true;state.allTracks=navigationFixture;state.filter='б';state.sort='duration';state.loading=false;state.visibleLimit=30;trackList()");
  await accept(run('playSelection(0)'));assert.equal(calls.at(-1),'c');assert.equal(run("state.loop.map(t=>t.id).join(',')"),'c,a');
  // Changing the visible filter must not rewrite an already selected playback context.
  run("state.filter='а';trackList()");assert.equal(run("state.loop.map(t=>t.id).join(',')"),'c,a');
  run("state.viewLoaded=true;state.route={type:'library'};state.filter='б';state.sort='duration';state.visibleLimit=60;scrollMain.scrollTop=450;saveView()");
  assert.equal(run("navigation.views.get(routeKey({type:'library'})).scroll"),450);
  run("navigation.entries=[{type:'library'},{type:'playlist',id:'p'}];navigation.index=0;navigationButtons()");assert.equal(get('nav-back').disabled,true);assert.equal(get('nav-forward').disabled,false);
  run("applyPlaylists({playlists:[{id:'new',title:'New'}],playlistsRevision:5});applyPlaylists({playlists:[],playlistsRevision:4})");assert.equal(run('state.playlists[0].id'),'new');assert.equal(run('state.sidebarRevision'),5);
  // Native selection is visible while loading and never falls back after failure.
  run("state.filter='';state.sort='original';state.nativePlayback=true;state.online=true;state.current={id:'previous',duration:90};state.playing=true;state.allTracks=[{id:'selected',title:'Selected',duration:90}];state.tracks=state.allTracks;state.loop=state.allTracks");
  const failed=run("playTrack(state.allTracks[0])");assert.equal(run('state.current.id'),'selected');assert.equal(run('state.playing'),false);assert.equal(run('state.busy'),true);
  pending.at(-1).reject(Error('Temporary CDN timeout'));await failed;assert.equal(run('state.current.id'),'selected');assert.equal(run('state.playing'),false);assert.equal(run('state.busy'),false);assert.equal(run('playable(state.current)'),true);
  const unavailable=run("playTrack(state.allTracks[0])");pending.at(-1).reject(Object.assign(Error('VK unavailable'),{kind:'unavailable',unavailableIds:['selected']}));await unavailable;
  assert.equal(run('state.current.id'),'selected');assert.equal(run('playable(state.current)'),false);assert.equal(run('state.allTracks[0].available'),false);assert.equal(get('toggle').disabled,true);assert.equal(run('renderedRows[0].row.tabIndex'),-1);
  // Sleep at the end must suppress duplicate ended events, including repeat-one.
  let sleepEnds=0;context.window.waveDesktop={publish(){},shouldStopAtEnd:()=>true,ended:()=>sleepEnds++};run("state.current={id:'sleep',duration:90};state.busy=false;state.playing=true;state.repeat='one';state.generation++");const beforeSleepCalls=calls.length;await run('next(true)');await run('next(true)');assert.equal(sleepEnds,1);assert.equal(calls.length,beforeSleepCalls);assert.equal(run('state.playing'),false);
  // Resume after restart must load the selected track at its saved position.
  context.window.waveDesktop.shouldStopAtEnd=()=>false;run("state.online=true;state.current={id:'restored',duration:120};state.restoredPosition=42;state.playing=false;state.busy=false");const resumed=run('toggle()');assert.equal(calls.at(-1).id,'restored');assert.equal(calls.at(-1).position,42);await accept(resumed);assert.equal(run('state.restoredPosition'),null);assert.equal(run('state.playing'),true);
  // The redesign's nested actions must not activate the row's playback handler.
  run("state.allTracks=[{id:'clickable',title:'A song',artist:'An artist',duration:120,owned:true}];state.filter='';state.sort='original';state.loading=false;state.route={type:'library'};trackList()");
  const redesigned=run('renderedRows[0].row'),titleButton=redesigned.children[1].children[1].children[0];assert.equal(redesigned.role,'group');assert.equal(titleButton.tagName,'BUTTON');let stopped=false;const beforeMenu=calls.length;redesigned.children.at(-1).onclick({stopPropagation(){stopped=true;}});assert.equal(stopped,true);assert.equal(calls.length,beforeMenu);assert.equal(get('collection-dialog').classList.contains('hidden'),false);
  titleButton.onclick({stopPropagation(){}});await new Promise(r=>setImmediate(r));assert.equal(calls.at(-1),'clickable');pending.at(-1).resolve({playing:true});await new Promise(r=>setImmediate(r));assert.equal(run('state.current.id'),'clickable');
  console.log('PASS: playback/regressions; filtered and sorted playback order; route positions; stale sidebar rejected; failed selection retained; availability updated; sleep end; restored position; native song buttons; isolated row menu; unchanged renders = 0 DOM rebuilds');
}
test().catch(error=>{console.error(error);process.exitCode=1;});
