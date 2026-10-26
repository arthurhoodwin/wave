'use strict';
(()=>{const caption=document.querySelector('.window-caption');const update=()=>{if(caption&&caption.textContent!==document.title)caption.textContent=document.title;};new MutationObserver(update).observe(document.querySelector('title'),{childList:true,subtree:true,characterData:true});update();})();
