'use strict';
// Explicit semantic changes only: no observer per row, no animation on progress ticks.
(()=>{
 const keys=new WeakMap(),active=new Set(),quiet=matchMedia('(prefers-reduced-motion: reduce)');
 function fade(node,key,{first=false,duration=150}={}){
  if(!node)return;const previous=keys.get(node);keys.set(node,key);if(previous===key||previous===undefined&&!first||!node.isConnected||!node.getClientRects().length||document.hidden)return;
  const resuming=active.has(node);active.add(node);const task=window.WaveMotion.fade(node,duration,resuming);task.then(()=>{if(node.getAnimations().length===0)active.delete(node);});
 }
 function stop(){for(const node of active)window.WaveMotion.cancel(node);active.clear();}
 document.addEventListener('visibilitychange',()=>{if(document.hidden)stop();});quiet.addEventListener('change',stop);
 let route=null,artistKey='';
 window.WaveTransitions={fade,stop,enter(){this.routeReady();},routeReady(){
  if(state.loading||!state.ready)return;const key=routeKey(state.route);if(key===route)return;const prior=route;route=key;
  // Search category changes affect only results; the header and sidebar stay put.
  const tab=prior&&JSON.parse(prior)[0]==='search'&&state.route.type==='search'&&JSON.parse(prior)[1]===(state.route.query||'');
  if(!tab)fade(document.querySelector('.hero'),key,{first:true});
  fade(state.route.type==='home'?document.getElementById('home-panels'):document.querySelector('.track-section'),key,{first:true,duration:120});
 },track(id){for(const selector of ['.now-copy','#now-art','.mini-window .meta','.mini-window #art'])fade(document.querySelector(selector),id||'empty');},artist(panel,key){if(key===artistKey)return;const old=artistKey;artistKey=key;if(!old||old.slice(0,old.lastIndexOf('|'))!==key.slice(0,key.lastIndexOf('|')))return;fade(panel,Symbol(),{first:true,duration:120});}};
 // Settings groups are native details: opening does not wait for an animation.
 document.addEventListener('toggle',event=>{const details=event.target;if(details.matches?.('details.settings-group')&&details.open)fade(details.querySelector('.settings-group-content'),Symbol(),{first:true,duration:120});},true);
})();
