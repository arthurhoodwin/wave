'use strict';
(()=>{
 const observed=new Set();
 const observer=typeof IntersectionObserver==='function'?new IntersectionObserver(entries=>{for(const e of entries)e.target.classList.toggle('wave-visible',e.isIntersecting);},{root:document.querySelector('main')}):null;
 let mainVisible=true;
 const visibility=()=>document.body.classList.toggle('wave-window-visible',mainVisible&&!document.hidden);
 const receive=data=>{if(typeof data?.mainVisible==='boolean'){mainVisible=data.mainVisible;visibility();}};
 window.music?.onDesktopState?.(receive);window.music?.desktop?.('status').then(receive).catch(()=>{});
 document.addEventListener('visibilitychange',visibility);visibility();
 function update(node,{current,playing,busy,index,title}){
  const mode=!current?'number':busy?'loading':playing?'playing':'paused';
  if(node.dataset.waveMode!==mode){
   node.dataset.waveMode=mode;node.removeAttribute('data-icon-state');
   if(mode==='playing'||mode==='paused'){
    if(!node.querySelector('.track-wave')){const wave=document.createElement('span');wave.className='track-wave';wave.setAttribute('aria-hidden','true');for(let i=0;i<4;i++)wave.append(document.createElement('i'));node.replaceChildren(wave);}
    if(!observed.has(node)){observed.add(node);observer?.observe(node);if(!observer)node.classList.add('wave-visible');}
   }else{observer?.unobserve(node);observed.delete(node);node.classList.remove('wave-visible');node.textContent=mode==='loading'?'…':String(index+1);}
  }else if(mode==='number'&&node.textContent!==String(index+1))node.textContent=String(index+1);
  node.setAttribute('aria-label',(mode==='playing'?'Играет: ':mode==='paused'?'На паузе: ':mode==='loading'?'Подключение: ':'Воспроизвести: ')+(title||''));
 }
 function sweep(){for(const node of observed)if(!node.isConnected){observer?.unobserve(node);observed.delete(node);}}
 window.WaveTrackWave={update,sweep};
})();
