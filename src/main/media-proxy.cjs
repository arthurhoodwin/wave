'use strict';
const http=require('node:http'),{randomBytes}=require('node:crypto'),{Readable}=require('node:stream');
function mediaUrl(value){let u;try{u=new URL(value);}catch{throw Error('Некорректный адрес аудио');}if(u.protocol!=='https:'||u.username||u.password||u.port||!/(^|\.)(vkuseraudio\.ru|vkuseraudio\.net|userapi\.com|vk-cdn\.net|okcdn\.ru)$/.test(u.hostname))throw Object.assign(Error('Этот аудиосервер VK пока не поддерживается. Обновите Wave или выберите другую запись.'),{kind:'unsupported-host'});return u;}
class MediaProxy{
 constructor({fetch,onExpired=()=>{},onNetworkError=()=>{},timeoutMs=20000,manifestTimeoutMs=5500,hedgeMs=1200}){this.fetch=fetch;this.onExpired=onExpired;this.onNetworkError=onNetworkError;this.onFailure=()=>{};this.timeoutMs=timeoutMs;this.manifestTimeoutMs=manifestTimeoutMs;this.hedgeMs=hedgeMs;this.entries=new Map();this.controllers=new Set();this.server=null;this.lease=null;this.closed=false;}
 async start(){if(this.server)return;this.server=http.createServer((req,res)=>{this.handle(req,res).catch(()=>{if(res.destroyed||res.writableEnded)return;if(!res.headersSent)res.writeHead(502);res.end();});});this.server.maxConnections=32;await new Promise((resolve,reject)=>{this.server.once('error',reject);this.server.listen(0,'127.0.0.1',resolve);});this.origin='http://127.0.0.1:'+this.server.address().port;}
 register(value,lease=this.lease){const u=mediaUrl(value);if(!lease||lease!==this.lease)throw Error('Аудиосеанс завершён');if(this.entries.size>10000)throw Error('Слишком большой поток');const key=randomBytes(24).toString('hex');this.entries.set(key,{url:u.href,lease});return this.origin+'/'+key;}
 async open(value){if(this.closed)throw Error('Плеер закрыт');this.startPending??=this.start();await this.startPending;if(this.closed)throw Error('Плеер закрыт');this.reset();this.lease={id:randomBytes(16).toString('hex'),expired:false};return{url:this.register(value),leaseId:this.lease.id};}
 reset(){for(const c of this.controllers)c.abort();this.entries.clear();this.lease=null;}
 rewrite(text,base,lease){if(text.length>1024*1024||!text.trimStart().startsWith('#EXTM3U'))throw Error('Некорректный HLS-плейлист');if(/METHOD=(?:SAMPLE-AES|CENC)|KEYFORMAT="(?!identity")/.test(text))throw Error('Формат защиты потока не поддерживается');return text.split(/\r?\n/).map(line=>{if(!line.trim())return line;if(!line.startsWith('#'))return this.register(new URL(line.trim(),base).href,lease);return line.replace(/URI="([^"]+)"/g,(_all,path)=>'URI="'+this.register(new URL(path,base).href,lease)+'"');}).join('\n');}
 async manifestResponse(entry,options){
  const controllers=[],errors=[];let hedge,deadline,settled=false,started=0,finished=0;
  return new Promise((resolve,reject)=>{
   const done=(error,value,winner)=>{if(settled)return;settled=true;clearTimeout(hedge);clearTimeout(deadline);for(const c of controllers){this.controllers.delete(c);if(c!==winner)c.abort();}error?reject(error):resolve(value);};
   const start=async()=>{if(settled||started>=2)return;started++;const controller=new AbortController();controllers.push(controller);this.controllers.add(controller);controller.signal.addEventListener('abort',()=>{if(entry.lease!==this.lease||this.closed)done(Error('Поток заменён'));},{once:true});
    try{const response=await this.fetch(entry.url,{...options,signal:controller.signal});if(settled){await response.body?.cancel();return;}if(!response.ok){if([401,403,404,410,451].includes(response.status)){await response.body?.cancel();done(null,{status:response.status,ok:false},controller);return;}await response.body?.cancel();throw Error('Сервер аудио временно недоступен');}
     const reader=response.body?.getReader();let text='',bytes=0;const decoder=new TextDecoder();try{while(reader){const part=await reader.read();if(part.done)break;bytes+=part.value.byteLength;if(bytes>1024*1024)throw Error('Некорректный HLS-плейлист');text+=decoder.decode(part.value,{stream:true});}text+=decoder.decode();}finally{reader?.releaseLock();}done(null,{status:response.status,ok:true,text},controller);
    }catch(error){finished++;errors.push(error);if(settled)return;if(started<2){clearTimeout(hedge);start();}else if(finished>=started)done(errors[0]);}
   };
   hedge=setTimeout(start,this.hedgeMs);deadline=setTimeout(()=>done(Error('Аудиосервер VK не ответил вовремя')),this.manifestTimeoutMs);start();
  });
 }
 async handle(req,res){
  res.setHeader('Access-Control-Allow-Origin',req.headers.origin==='file://'?'file://':'null');res.setHeader('Access-Control-Allow-Methods','GET, HEAD, OPTIONS');res.setHeader('Access-Control-Allow-Headers','Range');res.setHeader('Access-Control-Expose-Headers','Content-Range, Accept-Ranges');res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');
  if(req.method==='OPTIONS'){res.writeHead(204);res.end();return;}if(!['GET','HEAD'].includes(req.method)){res.writeHead(405);res.end();return;}
  const path=req.url?.slice(1);if(!path||!/^[-a-f0-9]{48}$/.test(path)){res.writeHead(404);res.end();return;}const entry=this.entries.get(path);if(!entry||entry.lease!==this.lease){res.writeHead(404);res.end();return;}
  const range=req.headers.range;if(range&&!/^bytes=\d*-\d*$/.test(range)){res.writeHead(416);res.end();return;}
  if(new URL(entry.url).pathname.endsWith('.m3u8')&&req.method==='GET'){
   const result=await this.manifestResponse(entry,{method:'GET',credentials:'include',redirect:'error',headers:{Referer:'https://vk.ru/'}});
   if(entry.lease!==this.lease||res.destroyed)return;
   if(!result.ok){this.onFailure(result.status===451?'access':[401,403,404,410].includes(result.status)?'expired':'network');if([401,403,404,410].includes(result.status)&&!entry.lease.expired){entry.lease.expired=true;this.onExpired(entry.lease.id);}res.writeHead(502);res.end();return;}
   const text=this.rewrite(result.text,entry.url,entry.lease);res.setHeader('Content-Type','application/vnd.apple.mpegurl');res.writeHead(200);res.end(text);return;
  }
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),this.timeoutMs);this.controllers.add(controller);req.on('aborted',()=>controller.abort());res.on('close',()=>controller.abort());
  try{let response;try{response=await this.fetch(entry.url,{method:req.method,credentials:'include',redirect:'error',headers:{Referer:'https://vk.ru/',...(range?{Range:range}:{})},signal:controller.signal});}catch(error){if(!controller.signal.aborted&&!entry.lease.networkReported){entry.lease.networkReported=true;this.onNetworkError();}throw error;}
   if([401,403,410].includes(response.status)){this.onFailure('expired');if(!entry.lease.expired){entry.lease.expired=true;this.onExpired(entry.lease.id);}res.writeHead(502);res.end();return;}
   if(!response.ok){this.onFailure(response.status===451?'access':response.status===404?'expired':'network');res.writeHead(502);res.end();return;}const type=response.headers.get('content-type')||'application/octet-stream';const hls=/mpegurl/i.test(type)||new URL(entry.url).pathname.endsWith('.m3u8');
   if(hls){const text=await response.text();const rewritten=this.rewrite(text,entry.url,entry.lease);res.setHeader('Content-Type','application/vnd.apple.mpegurl');res.writeHead(200);res.end(req.method==='HEAD'?undefined:rewritten);return;}
   res.setHeader('Content-Type',type);for(const name of ['content-range','accept-ranges'])if(response.headers.has(name))res.setHeader(name,response.headers.get(name));
   // Chromium needs the byte length to map an unbuffered time to a Range request.
   // A decoded (compressed HTTP) body no longer has the upstream byte length.
   const length=response.headers.get('content-length');if(length&&/^\d+$/.test(length)&&!response.headers.has('content-encoding'))res.setHeader('Content-Length',length);
   res.writeHead(response.status);if(req.method==='HEAD'||!response.body){res.end();return;}
   await new Promise((resolve,reject)=>{const stream=Readable.fromWeb(response.body);stream.on('error',reject);res.on('error',reject);res.on('finish',resolve);res.on('close',resolve);stream.pipe(res);});
  }finally{clearTimeout(timer);this.controllers.delete(controller);}
 }
 async close(){if(this.closePending)return this.closePending;this.closePending=this.finishClose();return this.closePending;}
 async finishClose(){this.closed=true;for(const c of this.controllers)c.abort();this.entries.clear();this.lease=null;if(this.server){this.server.closeAllConnections?.();await new Promise(r=>this.server.close(r));this.server=null;}}
}
module.exports={MediaProxy,mediaUrl};
