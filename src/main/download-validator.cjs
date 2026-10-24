'use strict';
const {LocalMedia}=require('./local-media.cjs');
// Separate, non-persistent sandbox; no VK session, no autoplay and no renderer file paths.
async function validateDownload({file,record,signal},{BrowserWindow}){
 let window;const media=new LocalMedia({locate:async()=>({file,record}),getRoot:()=>'/validation'});const abort=()=>window?.destroy();signal?.addEventListener('abort',abort,{once:true});
 try{if(signal?.aborted)throw Error('Загрузка отменена');const lease=await media.open('fixture');window=new BrowserWindow({show:false,webPreferences:{sandbox:true,contextIsolation:true,nodeIntegration:false,backgroundThrottling:false}});await window.loadURL('data:text/html,'+encodeURIComponent('<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; media-src http://127.0.0.1:*; script-src \'none\'"><title>Wave file validation</title>'));
  const duration=await window.webContents.executeJavaScript(`new Promise((resolve,reject)=>{const audio=new Audio(),finish=(error)=>{clearTimeout(timer);audio.oncanplay=audio.onerror=null;const duration=audio.duration;audio.removeAttribute('src');audio.load();error?reject(Error('invalid audio')):resolve(duration);},timer=setTimeout(()=>finish(true),10000);audio.crossOrigin='anonymous';audio.preload='auto';audio.oncanplay=()=>finish(false);audio.onerror=()=>finish(true);audio.src=${JSON.stringify(lease.url)};})`);
  if(signal?.aborted||!Number.isFinite(duration)||duration<=0||duration>604800)throw Error('Некорректный аудиофайл');const expected=record.track?.duration;if(Number.isFinite(expected)&&expected>0&&Math.abs(duration-expected)>Math.max(3,expected*.03))throw Object.assign(Error('Длительность скачанного файла не совпала с песней. Повторите загрузку или выберите другую запись.'),{kind:'incomplete-download'});return duration;
 }catch(e){if(e.kind==='incomplete-download')throw e;throw Error('Не удалось проверить воспроизведение файла. Повторите загрузку или выберите другую запись.');}finally{signal?.removeEventListener('abort',abort);if(window&&!window.isDestroyed())window.destroy();await media.close();}
}
module.exports={validateDownload};
