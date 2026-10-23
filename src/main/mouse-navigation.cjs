'use strict';
function attachMouseNavigation(window){window.on('app-command',(event,command)=>{if(['browser-backward','browser-forward'].includes(command)){event.preventDefault?.();window.webContents.send('navigation:action',command==='browser-backward'?-1:1);}});}
module.exports={attachMouseNavigation};
