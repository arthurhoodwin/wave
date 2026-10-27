'use strict';
(()=>{
 const states=new WeakMap();
 function paint(root,data,{card,retry}){
  let view=states.get(root);if(!view){view={groups:new Map(),status:el('p','muted recommendation-status'),retry:el('button','secondary recommendation-retry','Повторить')};view.status.setAttribute('role','status');view.retry.type='button';states.set(root,view);}
  const feed=data.recommendations||{state:'unavailable',sections:[]},sections=feed.sections||[];
  root.setAttribute('aria-busy',String(feed.state==='loading'||!!feed.refreshing));
  setText(view.status,feed.state==='loading'?'Загружаем подборки VK…':feed.stale?'Не удалось обновить. Показаны сохранённые подборки.':feed.state==='ready'&&feed.partial?'Часть подборок VK сейчас недоступна':feed.state==='unavailable'?(state.online?(feed.reason==='empty'?'Подборки VK пока не найдены.':feed.reason==='schema'?'Не удалось прочитать подборки VK.':'Не удалось загрузить подборки VK.'):'Подключитесь к сети, чтобы загрузить подборки VK'):'');
  view.status.classList.toggle('hidden',!view.status.textContent);view.retry.classList.toggle('hidden',!state.online||!(feed.state==='unavailable'||feed.partial||feed.stale));view.retry.disabled=!!feed.refreshing;view.retry.setAttribute('aria-busy',String(!!feed.refreshing));view.retry.onclick=retry;
  const desired=[...(window.WaveMix?.homeNode?[WaveMix.homeNode]:[]),view.status,view.retry],alive=new Set(),active=document.activeElement;
  for(const section of sections){if(!section.items?.length)continue;alive.add(section.id);let group=view.groups.get(section.id);
   if(!group){group={node:el('section','recommendation-section'),heading:el('h2'),grid:el('div','home-grid'),cards:new Map(),data:{},fresh:true};group.node.dataset.feed=section.id;group.node.append(group.heading,group.grid);view.groups.set(section.id,group);}
   Object.assign(group.data,section);setText(group.heading,section.title);const cards=[],items=new Set();
   for(const item of section.items){if(items.has(item.id))continue;items.add(item.id);const signature=JSON.stringify([item,state.online]);let entry=group.cards.get(item.id);if(!entry||entry.signature!==signature){const previous=entry?.node;entry={node:card(item,group.data),signature};group.cards.set(item.id,entry);if(previous?.contains(active))group.restoreFocus=entry.node;previous?.replaceWith(entry.node);}cards.push(entry.node);}
   for(const child of [...group.grid.children])if(!cards.includes(child))child.remove();cards.forEach((node,i)=>{if(group.grid.children[i]!==node)group.grid.insertBefore(node,group.grid.children[i]||null);});for(const [id,entry] of group.cards)if(!items.has(id)){entry.node.remove();group.cards.delete(id);}if(group.restoreFocus){group.restoreFocus.querySelector('button')?.focus({preventScroll:true});group.restoreFocus=null;}desired.push(group.node);
  }
  desired.forEach((node,i)=>{if(root.children[i]!==node)root.insertBefore(node,root.children[i]||null);});for(const [id,group] of view.groups)if(!alive.has(id)){group.node.remove();view.groups.delete(id);}for(const child of [...root.children])if(!desired.includes(child))child.remove();
  for(const group of view.groups.values())if(group.fresh){group.fresh=false;window.WaveTransitions?.fade(group.node,group.node.dataset.feed,{first:true});}
  if(active?.isConnected&&root.contains(active)&&document.activeElement!==active)active.focus({preventScroll:true});
 }
 window.WaveHomeFeed={paint};
})();
