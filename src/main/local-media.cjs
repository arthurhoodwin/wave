'use strict';
const http=require('node:http'),{createReadStream}=require('node:fs'),{randomBytes}=require('node:crypto');const {MediaProxy}=require('./media-proxy.cjs');
class LocalMedia{
 constructor({locate,getRoot}){Object.assign(this,{locate,getRoot});this.streams=new Set();}
 async open(key){this.reset();const root=this.getRoot(),media=await this.locate(root,key);if(root!==this.getRoot()||!media)throw Error('Локальная копия не найдена');this.media={...media,root,token:randomBytes(24).toString('hex')};if(!this.server){this.server=http.createServer((req,res)=>this.handle(req,res));await new Promise((resolve,reject)=>{this.server.once('error',reject);this.server.listen(0,'127.0.0.1',resolve);});}return{url:'http://127.0.0.1:'+this.server.address().port+'/'+this.media.token,leaseId:this.media.token};}
 handle(req,res){res.setHeader('Access-Control-Allow-Origin','null');res.setHeader('Access-Control-Allow-Headers','Range');res.setHeader('Access-Control-Allow-Methods','GET,HEAD,OPTIONS');res.setHeader('Access-Control-Expose-Headers','Content-Range,Accept-Ranges,Content-Length');res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');if(req.method==='OPTIONS'){res.writeHead(204);res.end();return;}const media=this.media;if(!media||media.root!==this.getRoot()||req.url!=='/'+media.token){res.writeHead(404);res.end();return;}if(!['GET','HEAD'].includes(req.method)){res.writeHead(405);res.end();return;}const size=media.record.bytes;let start=0,end=size-1;const range=req.headers.range;if(range){const match=/^bytes=(\d*)-(\d*)$/.exec(range);if(!match||!match[1]&&!match[2]){res.writeHead(416,{'Content-Range':'bytes */'+size});res.end();return;}if(match[1]){start=Number(match[1]);if(match[2])end=Math.min(end,Number(match[2]));}else start=Math.max(0,size-Number(match[2]));if(!Number.isSafeInteger(start)||start<0||start>=size||end<start){res.writeHead(416,{'Content-Range':'bytes */'+size});res.end();return;}res.setHeader('Content-Range',`bytes ${start}-${end}/${size}`);}
  res.setHeader('Accept-Ranges','bytes');res.setHeader('Content-Length',end-start+1);res.setHeader('Content-Type',{mp3:'audio/mpeg',m4a:'audio/mp4',wav:'audio/wav'}[media.record.ext]);res.writeHead(range?206:200);if(req.method==='HEAD'){res.end();return;}const stream=createReadStream(media.file,{start,end});this.streams.add(stream);stream.on('error',()=>res.destroy());stream.on('close',()=>this.streams.delete(stream));res.on('close',()=>stream.destroy());stream.pipe(res);
 }
 reset(){this.media=null;for(const stream of this.streams)stream.destroy();this.streams.clear();}
 async close(){this.reset();if(this.server){this.server.closeAllConnections();await new Promise(r=>this.server.close(r));this.server=null;}}
}
class HybridProxy extends MediaProxy{
 constructor(options){super(options);this.local=new LocalMedia(options);}
 async open(url){if(typeof url==='string'&&url.startsWith('wave-local:')){super.reset();return this.local.open(url.slice(11));}this.local.reset();return super.open(url);}
 reset(){super.reset();this.local?.reset();}
 async close(){await Promise.all([super.close(),this.local.close()]);}
}
module.exports={LocalMedia,HybridProxy};
