'use strict';
((root,factory)=>{
 const helpers=factory();
 if(typeof module==='object'&&module.exports){module.exports=helpers;return;}
 if(!root.music?.desktop)return;
 const storage='wave-shuffle-v1';
 function records(){
  try{return JSON.parse(localStorage.getItem(storage)||'{}')||{};}catch{return {};}
 }
 function store(key,entry){
  const all=records();delete all[key];all[key]=entry;
  try{localStorage.setItem(storage,JSON.stringify(Object.fromEntries(Object.entries(all).slice(-12))));}catch{}
 }
 function remember(ctx,loop,id){
  if(!ctx?.shuffleScope||!id?.shuffleToken||ctx.mixId)return;
  const order=loop.map(t=>t.shuffleToken).filter(Boolean);
  if(!order.length)return;
  const old=records()[ctx.shuffleScope];
  const played=new Set(helpers.validTokens(old?.played));
  played.add(id.shuffleToken);
  store(ctx.shuffleScope,{order,played:[...played].slice(-20000)});
 }
 async function identify(context,route,filter,sort){
  const result=await call('desktop','shuffle-scope',{type:route.type,id:route.id,filter,sort,ids:context.map(t=>t.id)}).catch(()=>null);
  if(!result?.scope||!Array.isArray(result.keys)||result.keys.length!==context.length||result.keys.some(key=>!helpers.validToken(key)))return null;
  return {scope:result.scope,tracks:context.map((track,i)=>({...track,shuffleToken:result.keys[i]}))};
 }
 async function apply(context,chosen,route,filter,sort,reset=false){
  const identified=await identify(context,route,filter,sort);
  if(!identified)return null;
  const {scope,tracks}=identified;
  const active=tracks.find(track=>track.contextOrder===chosen.contextOrder);
  const prior=reset?null:records()[scope];
  const order=helpers.cycle(tracks,active,prior,mix);
  return {scope,chosen:active,loop:order.loop,entry:order.entry};
 }
 function existing(ctx,tracks,active){
  if(!ctx?.shuffleScope||!active?.shuffleToken||tracks.some(t=>!helpers.validToken(t.shuffleToken)))return null;
  const order=helpers.cycle(tracks,active,null,mix);
  return {scope:ctx.shuffleScope,chosen:active,loop:order.loop,entry:order.entry};
 }
 root.WaveShuffle={apply,identify,existing,remember,store};
 const section=el('section','shuffle-settings');
 const title=el('h3','','Перемешивание');
 const button=el('button','secondary','Новый случайный порядок');
 button.type='button';
 button.onclick=()=>{
  if(!state.current||!state.loop.length){message('Сначала включите песню из списка.');return;}
  if(state.playContext?.mixId){message('VK Микс сам выбирает порядок песен.');return;}
  restartShuffle().then(()=>message('Список перемешан.')).catch(fail);
 };
 section.append(title,button);
 $('settings-dialog').querySelector('.modal-card').append(section);

})(globalThis,()=>{
 const validToken=key=>typeof key==='string'&&/^[a-f0-9]{32}$/.test(key);
 const validTokens=value=>Array.isArray(value)?value.filter(validToken):[];
 function cycle(tracks,chosen,prior,randomize){
  const lookup=new Map(tracks.map(t=>[t.shuffleToken,t]));
  const previous=new Set(validTokens(prior?.played));
  const existing=[];
  for(const key of new Set(validTokens(prior?.order))){
   const track=lookup.get(key);
   if(track&&track!==chosen){existing.push(track);lookup.delete(key);}
  }
  lookup.delete(chosen.shuffleToken);
  const all=existing.concat(randomize([...lookup.values()]));
  let played=all.filter(track=>previous.has(track.shuffleToken));
  let future=all.filter(track=>!previous.has(track.shuffleToken));
  if(!future.length){played=[];future=randomize(all);}
  const loop=[...played,chosen,...future];
  return {loop,entry:{order:loop.map(t=>t.shuffleToken),played:played.map(t=>t.shuffleToken)}};
 }
 return {cycle,validToken,validTokens};
});
