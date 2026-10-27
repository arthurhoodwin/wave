'use strict';
const {createHash}=require('node:crypto'),{trackMeta}=require('./navigation-meta.cjs');
class TrackContentCache{
 constructor(limit=20000){this.limit=limit;this.entries=new Map();this.root=null;}
 reset(root){if(this.root===root)return;this.root=root;this.entries.clear();}
 merge(row){const old=this.entries.get(row.key),prior=old?.content||{},fresh=trackMeta(row),content={};if(prior.artists&&fresh.artists?.every(a=>a.name==='Неизвестный исполнитель')){delete fresh.artists;delete fresh.artistRoute;}for(const key of ['cover','artistRoute','artists','albumTitle','albumId','albumTitleConfirmed'])if(fresh[key]!==undefined)content[key]=fresh[key];else if(prior[key]!==undefined)content[key]=prior[key];
  // Confirmed album names may not be replaced by a sparse provisional response.
  const albumChanged=prior.albumTitleConfirmed&&fresh.albumTitle&&!require('./album-metadata.cjs').provisional(fresh.albumTitle)&&fresh.albumTitle!==prior.albumTitle;if(albumChanged){delete content.albumTitleConfirmed;if(!fresh.albumId)delete content.albumId;}if(prior.albumTitleConfirmed&&!fresh.albumTitleConfirmed&&!albumChanged){for(const key of ['albumTitle','albumId','albumTitleConfirmed'])if(prior[key]!==undefined)content[key]=prior[key];}
  const title=typeof row.title==='string'&&row.title&&!['Без названия','Недоступная запись'].includes(row.title)?row.title:old?.title||row.title,artist=typeof row.artist==='string'&&row.artist&&row.artist!=='Неизвестный исполнитель'?row.artist:old?.artist||row.artist;const signature=createHash('sha256').update(JSON.stringify([title,artist,row.time,content])).digest('hex');this.entries.delete(row.key);const value=old?.signature===signature?old:{signature,content,title,artist};this.entries.set(row.key,value);while(this.entries.size>this.limit)this.entries.delete(this.entries.keys().next().value);return value;
 }
}
function contentFor(provider,row){if(provider.trackContent?.root!==provider.root){provider.trackContent=new TrackContentCache();provider.trackContent.reset(provider.root);}return provider.trackContent.merge(row);}
module.exports={TrackContentCache,contentFor};
