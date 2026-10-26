'use strict';
(()=>{
 const states=new WeakMap();
 function paint(root,data,{card,retry}){
  let view=states.get(root);if(!view){view={groups:new Map(),status:el('p','muted recommendation-status'),retry:el('button','secondary recommendation-retry','Повторить')};view.status.setAttribute('role','status');view.retry.type='button';states.set(root,view);}
  const feed=data.recommendations||{state:'unavailable',sections:[]},sections=feed.sections||[];
  root.setAttribute('aria-busy',String(feed.state==='loading'||!!feed.refreshing));
  setText(view.status,feed.state==='loading'?'Загружаем подборки VK…':feed.stale?'Не удалось обновить. Показаны сохранённые подборки.':feed.state==='ready'&&feed.partial?'Часть подборок VK сейчас недоступна':feed.state==='unavailable'?(state.online?(feed.reason==='empty'?'Подборки VK пока не найдены.':feed.reason==='schema'?'Не удалось прочитать подборки VK.':'Не удалось загрузить подборки VK.'):'Подключитесь к сети, чтобы загрузить подборки VK'):'');
  view.status.classList.toggle('hidden',!view.status.textContent);view.retry.classList.toggle('hidden',!state.online||!(feed.state==='unavailable'||feed.partial||feed.stale));view.retry.disabled=!!feed.refreshing;view.retry.setAttribute('aria-busy',String(!!feed.refreshing));view.retry.onclick=retry;
  const desired=[view.status,view.retry],alive=new Set(),active=document.activeElement;
  for(const section of sections){if(!section.items?.length)continue;alive.add(section.id);let group=view.groups.get(section.id);
   if(!group){group={node:el('section','recommendation-section'),heading:el('h2'),grid:el('div','home-grid'),cards:new Map(),data:{}};group.node.dataset.feed=section.id;group.node.append(group.heading,group.grid);view.groups.set(section.id,group);}
   Object.assign(group.data,section);setText(group.heading,section.title);const cards=[],items=new Set();
   for(const item of section.items){items.add(item.id);const signature=JSON.stringify([item,state.online]);let entry=group.cards.get(item.id);if(!entry||entry.signature!==signature){entry={node:card(item,group.data),signature};group.cards.set(item.id,entry);}cards.push(entry.node);}
   cards.forEach((node,i)=>{if(group.grid.children[i]!==node)group.grid.insertBefore(node,group.grid.children[i]||null);});for(const [id,entry] of group.cards)if(!items.has(id)){entry.node.remove();group.cards.delete(id);}desired.push(group.node);
  }
  desired.forEach((node,i)=>{if(root.children[i]!==node)root.insertBefore(node,root.children[i]||null);});for(const [id,group] of view.groups)if(!alive.has(id)){group.node.remove();view.groups.delete(id);}for(const child of [...root.children])if(!desired.includes(child))child.remove();
  if(active?.isConnected&&root.contains(active)&&document.activeElement!==active)active.focus({preventScroll:true});
 }
 window.WaveHomeFeed={paint};
})();
