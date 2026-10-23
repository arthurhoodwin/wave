'use strict';
const {PlaylistCache}=require('./playlist-cache.cjs');
async function logout(p){
 if(!p.network)throw Error('Выход доступен в обычном режиме Wave');
 if(p.logoutJob)return p.logoutJob;
 p.logoutJob=(async()=>{p.authTransition=true;p.loginAttempt=(p.loginAttempt||0)+1;p.online=false;clearTimeout(p.reconnectTimer);p.reconnectTimer=null;clearTimeout(p.saveTimer);p.saveTimer=null;++p.playRequest;++p.warmRequest;
  try{const marked=await Promise.allSettled([p.beforeLogout?.()]);p.engine.cancelNavigation?.();await Promise.allSettled([p.network.suspend(),p.nativePlayer?.stop(),p.cache.close()]);await p.loginJob?.catch(()=>{});await p.mutationSerial;
   const cleared=await Promise.allSettled([p.clearSession?.(),p.store?.clear()]);p.logoutFailed=[...marked,...cleared].some(r=>r.status==='rejected');p.root=null;p.active=null;p.collection=null;p.operationLog=[];p.operationChanged();p.tracks.clear();p.searchArtists?.clear();p.searchEntries?.clear();p.searchController?.abort();p.handles.clear();p.playlists.clear();p.playlistHandles.clear();p.savedPlaylists=[];p.sidebarRevision=0;p.cache=new PlaylistCache(p.engine,(raw,context)=>p.absorbRows(raw,context),()=>p.scheduleSave());
   return p.setSession({state:'signedOut',cached:false,verifying:false,nativePlayback:true,...(p.logoutFailed?{cleanupFailed:true,message:'Не удалось полностью очистить локальный сеанс. Повторите выход перед сменой аккаунта.'}:{message:'Вы вышли из VK. Локальный сеанс и сохранённая коллекция удалены.'})});}
  finally{p.authTransition=false;}
 })();try{return await p.logoutJob;}finally{p.logoutJob=null;}
}
module.exports={logout};
