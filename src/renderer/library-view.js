'use strict';
(()=>{if(!has('personal'))return;let density='comfortable',pins=new Set(),pending=false;
 const box=el('section','library-view-tools');box.setAttribute('aria-label','Вид медиатеки');box.innerHTML='<label>Вид<select id="library-density"><option value="comfortable">Обычный</option><option value="compact">Компактный</option></select></label><p id="library-view-status" role="status"></p>';
 document.querySelector('.library .section-head').after(box);const repaint=()=>{document.querySelector('.library').classList.toggle('library-compact',density==='compact');window.WaveFolders?.repaint();};
 async function save(){if(pending)return;const before=density;density=$('library-density').value;pending=true;$('library-density').disabled=true;repaint();try{const result=await call('personal',{action:'library-view',sort:'original',density});receive(result);setText($('library-view-status'),'');}catch(e){density=before;$('library-density').value=density;repaint();setText($('library-view-status'),e.message);}finally{pending=false;$('library-density').disabled=false;}}
 function receive(data){const next=new Set((data.pins||[]).map(p=>p.id)),nextDensity=data.libraryView?.density||density,changed=JSON.stringify([...next])!==JSON.stringify([...pins])||!pending&&density!==nextDensity;pins=next;if(!pending){density=nextDensity;$('library-density').value=density;}if(changed)repaint();}
 $('library-density').onchange=save;
 window.WaveLibraryView={receive,pinned:id=>pins.has(id),sort:items=>items.slice().sort((a,b)=>Number(pins.has(b.id))-Number(pins.has(a.id))),reset:()=>{density='comfortable';pins.clear();$('library-density').value=density;repaint();}};
})();
