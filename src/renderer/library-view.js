'use strict';
(()=>{if(!has('personal'))return;let density='comfortable',pins=new Set(),pending=false;
 const status=el('p','folder-status');status.id='library-view-status';status.setAttribute('role','status');document.querySelector('.library .section-head').after(status);
 const button=el('button','icon small');button.id='library-view-menu';button.type='button';button.title='Вид медиатеки';button.setAttribute('aria-label',button.title);setIcon(button,'view');$('refresh').before(button);
 const repaint=()=>{document.querySelector('.library').classList.toggle('library-compact',density==='compact');window.WaveFolders?.repaint();};
 async function save(value){if(pending)return;const before=density;density=value;pending=true;button.disabled=true;repaint();try{receive(await call('personal',{action:'library-view',sort:'original',density}));setText(status,'');}catch(e){density=before;repaint();setText(status,e.message);}finally{pending=false;button.disabled=false;}}
 function receive(data){const next=new Set((data.pins||[]).map(p=>p.id)),nextDensity=data.libraryView?.density||density,changed=JSON.stringify([...next])!==JSON.stringify([...pins])||!pending&&density!==nextDensity;pins=next;if(!pending)density=nextDensity;if(changed)repaint();}
 button.onclick=()=>window.WaveMenus.open(button,[{label:'Обычный',checked:density==='comfortable',run:()=>save('comfortable')},{label:'Компактный',checked:density==='compact',run:()=>save('compact')},{label:'Свернуть в колонку',run:()=>window.WaveLibraryPanel?.collapse(true)},{label:'Сбросить ширину',run:()=>window.WaveLibraryPanel?.reset()}]);
 window.WaveLibraryView={receive,pinned:id=>pins.has(id),sort:items=>items.slice().sort((a,b)=>Number(pins.has(b.id))-Number(pins.has(a.id))),reset:()=>{density='comfortable';pins.clear();repaint();}};
})();
