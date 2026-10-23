'use strict';
(()=>{const entries=new Set(),metadata=new WeakMap();const limit=96;let trimming=false;
 const release=e=>{e.assigned=false;e.img.removeAttribute('src');};
 function sweep(){for(const e of entries)if(!e.img.isConnected){observer.unobserve(e.img);release(e);entries.delete(e);}const assigned=[...entries].filter(e=>e.assigned);for(const e of assigned.filter(e=>!e.visible).sort((a,b)=>a.last-b.last)){if(assigned.filter(e=>e.assigned).length<=limit)break;release(e);}}
 function trim(){if(trimming)return;trimming=true;requestAnimationFrame(()=>{trimming=false;sweep();});}
 const observer=new IntersectionObserver(items=>{for(const item of items){const e=metadata.get(item.target);if(!e)continue;e.visible=item.isIntersecting;if(e.visible){e.last=performance.now();if(!e.assigned){e.assigned=true;e.img.src=e.url;}}}trim();},{rootMargin:'320px'});
 window.WaveImages={watch(img,url){const e={img,url,assigned:false,visible:false,last:performance.now()};metadata.set(img,e);queueMicrotask(()=>{if(!img.isConnected)return;entries.add(e);observer.observe(img);});},isDormant:img=>metadata.get(img)?.assigned===false,sweep,stats:()=>({observed:entries.size,assigned:[...entries].filter(e=>e.assigned).length,offscreenLimit:limit})};
})();
