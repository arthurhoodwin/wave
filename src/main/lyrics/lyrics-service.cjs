'use strict';
async function lyrics(provider,id,options){
 if(options!==undefined&&(!options||typeof options!=='object'||Object.keys(options).some(k=>k!=='refresh')||typeof options.refresh!=='boolean'))throw Error('Некорректная команда текста');if(typeof id!=='string'||id.length>200)throw Error('Некорректная песня');const track=provider.tracks.get(id);if(!track)throw Error('Откройте список песни снова.');
 provider.lyricsSources??=new (require('./lyrics-sources.cjs').LyricsSources)();const root=provider.root,check=()=>{if(provider.root!==root||provider.authTransition)throw Error('Аккаунт изменился');};check();
 const stored=await provider.offlineLyrics?.read(root,track);check();if(stored&&!options?.refresh)return{...stored.result,offlineSaved:true};
 const persist=async result=>{check();if(!result.text)return result;try{const saved=await provider.offlineLyrics?.save(root,track,result);check();return{...result,...(saved?{offlineSaved:true}:{})};}catch(error){check();return{...result,storageWarning:'Текст открыт, но не сохранён для прослушивания без сети.'};}};
 if(!provider.online||!provider.network){if(stored)return{...stored.result,offlineSaved:true,refreshWarning:true};const cached=provider.lyricsSources.peek(track,root);if(cached)return persist({...cached,cached:true});return{text:'',offlineMissing:true};}
 if(options?.refresh){provider.lyricsSources.invalidate(track);provider.network.lyricsCache?.delete(track.key);}const cached=provider.lyricsSources.peek(track,root);if(cached){if(provider.lyricsSources.job?.key!==provider.lyricsSources.key(track))provider.lyricsSources.cancel();return persist({...cached,cached:true});}
 try{const result=await provider.lyricsSources.get(track,root,()=>provider.network.lyrics(track.key));check();provider.scheduleSave();if(!result.text&&stored)return{...stored.result,offlineSaved:true,refreshWarning:true};return persist(result);}catch(error){check();if(error.kind==='cancelled')throw error;if(stored)return{...stored.result,offlineSaved:true,refreshWarning:true};throw error;}
}
module.exports={lyrics};
