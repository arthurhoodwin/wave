'use strict';
function createKeyboard({context,search,travel,toggle,help,onError=()=>{}}){
 let keyboardFocus=false;
 const invoke=(event,action)=>{event.preventDefault();event.stopImmediatePropagation();if(event.repeat)return;try{Promise.resolve(action()).catch(onError);}catch(error){onError(error);}};
 return{pointer:()=>keyboardFocus=false,key(event){if(event.defaultPrevented||event.isComposing)return;const code=event.code||event.key,key=event.key||'',plain=!event.ctrlKey&&!event.metaKey&&!event.altKey;
  if(code==='Tab'||['ArrowUp','ArrowDown','Home','End'].includes(code)&&plain)keyboardFocus=true;
  const ctx=context();
  if(typeof help==='function'&&(code==='F1'||key==='F1')&&plain&&!event.shiftKey)return invoke(event,help);
  if((event.ctrlKey||event.metaKey)&&!event.altKey&&!event.shiftKey&&(code==='KeyK'||key.toLowerCase()==='k'||key.toLowerCase()==='л')){if(ctx.canSearch&&typeof search==='function')return invoke(event,search);return;}
  if(event.altKey&&!event.ctrlKey&&!event.metaKey&&!event.shiftKey&&['ArrowLeft','ArrowRight'].includes(code)){if(!ctx.modal&&typeof travel==='function')return invoke(event,()=>travel(code==='ArrowLeft'?-1:1));return;}
  if((code==='Space'||key===' ')&&plain&&!event.shiftKey&&!ctx.editing&&!ctx.scrollText&&(!ctx.modal||ctx.song)&&(!ctx.button||!keyboardFocus))return invoke(event,toggle);
 }};
}
if(typeof module!=='undefined')module.exports={createKeyboard};
if(typeof window!=='undefined'){
 const passive=new Set(['settings-dialog','shortcuts-dialog','song-dialog']);
 const context=()=>{const active=document.activeElement,dialogs=[...document.querySelectorAll('dialog[open]')];return{modal:dialogs.length>0,song:dialogs.length===1&&dialogs[0].id==='song-dialog',canSearch:dialogs.every(dialog=>passive.has(dialog.id)),editing:!!active?.closest('input,textarea,select,[contenteditable]:not([contenteditable="false"]),[role="textbox"]'),scrollText:!!active?.closest('#song-lyrics,#song-synced-lyrics'),button:!!active?.closest('button,[role="button"]')};};
 let searchTicket=0;
 const handler=document.getElementById('search')?createKeyboard({context,search:async()=>{const ticket=++searchTicket;const dialogs=[...document.querySelectorAll('dialog[open]')];await Promise.all(dialogs.map(dialog=>new Promise(resolve=>{dialog.addEventListener('close',resolve,{once:true});dialog.classList.add('hidden');})));if(ticket===searchTicket&&!document.querySelector('dialog[open]')){$('search').focus();$('search').select();}},travel,toggle,help:()=>{++searchTicket;const dialog=$('shortcuts-dialog');dialog.classList.toggle('hidden',dialog.open&&!dialog.classList.contains('hidden'));},onError:fail}):createKeyboard({context:()=>({...context(),canSearch:false}),toggle:async()=>{const result=await window.desktop.action('toggle');if(result?.ok===false)throw Error(result.error.message);},onError:error=>{document.getElementById('error').textContent=error.message;}});
 document.addEventListener('pointerdown',handler.pointer,{capture:true});document.addEventListener('keydown',handler.key,{capture:true});
}
