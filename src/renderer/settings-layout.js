'use strict';
// Move the existing controls once. Their nodes, listeners and values survive.
document.addEventListener('DOMContentLoaded',()=>{
 const dialog=document.getElementById('settings-dialog'),card=dialog?.querySelector('.modal-card');
 if(!card)return;
 const about=card.querySelector('.settings-about');
 const groups=[
  ['playback','Воспроизведение',['#settings-equalizer','.transition-settings']],
  ['library','Библиотека и скачивание',['.history-settings']],
  ['application','Приложение',['.update-settings','.windows-settings','.interface-settings','.diagnostic-settings','.shortcut-settings']]
 ];
 for(const [id,label,selectors] of groups){
  const details=document.createElement('details');details.className='settings-group';details.id='settings-group-'+id;
  const summary=document.createElement('summary');summary.textContent=label;details.append(summary);
  const content=document.createElement('div');content.className='settings-group-content';details.append(content);
  for(const selector of selectors)for(const node of card.querySelectorAll(selector))content.append(node);
  if(!content.children.length)continue;
  card.insertBefore(details,about);
 }
 // Account controls remain visible, application version stays last.
 if(about)card.append(about);
});
