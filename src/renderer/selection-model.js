'use strict';
((root,factory)=>{const api=factory();if(typeof module!=='undefined')module.exports=api;if(root)root.WaveSelection=api;})(typeof window!=='undefined'?window:null,()=>{
 function create(){
  const selected=new Set();let context='';
  return {selected,sync(key,items){if(context!==key){context=key;selected.clear();return;}if(selected.size){const visible=new Set(items.map(t=>t.id));for(const id of selected)if(!visible.has(id))selected.delete(id);}},
   toggle(id,items){if(selected.has(id))selected.delete(id);else if(items.some(t=>t.id===id))selected.add(id);},
   all(items){selected.clear();for(const t of items)selected.add(t.id);},
   bottom(items){if(!selected.size)return null;for(let i=items.length-1;i>=0;i--)if(selected.has(items[i].id))return items[i].id;return null;},
   ids(items){return [...new Set(items.filter(t=>selected.has(t.id)).map(t=>t.id))];}};
 }
 return {create};
});
