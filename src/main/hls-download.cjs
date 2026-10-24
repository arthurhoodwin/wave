'use strict';
// Finite audio HLS (RFC 8216): packed AAC/MP3, AAC in TS, and fMP4.
const {createDecipheriv}=require('node:crypto');
const {mediaUrl}=require('./media-proxy.cjs');
const {retryRead,requestAudio}=require('./download-http.cjs');
const fail=message=>{throw Error('HLS: '+message);};
const attributes=text=>Object.fromEntries([...text.matchAll(/([A-Z0-9-]+)=("[^"]*"|[^,]*)/g)].map(m=>[m[1],m[2].replace(/^"|"$/g,'')]));
function parseManifest(text,base){
 if(text.length>1024*1024||!text.trimStart().startsWith('#EXTM3U'))fail('некорректный плейлист');
 const lines=text.trim().split(/\r?\n/).map(s=>s.trim()),segments=[],variants=[],renditions=[];let sequence=0,key=null,map=null,duration=null,stream=null;
 for(const line of lines){
  if(line.startsWith('#EXT-X-MEDIA:')){const a=attributes(line);if(a.TYPE==='AUDIO'&&a.URI)renditions.push({url:mediaUrl(new URL(a.URI,base).href).href,preferred:a.DEFAULT==='YES',auto:a.AUTOSELECT==='YES'});}
  else if(line.startsWith('#EXT-X-STREAM-INF:'))stream=attributes(line);
  else if(line.startsWith('#EXT-X-MEDIA-SEQUENCE:')){sequence=Number(line.split(':')[1]);if(!Number.isSafeInteger(sequence)||sequence<0)fail('некорректный номер сегмента');}
  else if(line.startsWith('#EXTINF:')){duration=Number(line.slice(8).split(',')[0]);if(!Number.isFinite(duration)||duration<=0)fail('некорректная длительность');}
  else if(/^#EXT-X-(BYTERANGE|DISCONTINUITY|GAP|I-FRAMES-ONLY)(:|$)/.test(line))fail('этот вариант потока пока не поддерживается');
  else if(line.startsWith('#EXT-X-KEY:')){const a=attributes(line);if(a.METHOD==='NONE')key=null;else{if(a.METHOD!=='AES-128'||a.KEYFORMAT&&a.KEYFORMAT!=='identity'||!a.URI)fail('формат защиты не поддерживается');if(a.IV&&!/^0x[a-f\d]{32}$/i.test(a.IV))fail('некорректный IV');key={url:mediaUrl(new URL(a.URI,base).href).href,iv:a.IV?.slice(2)};}}
  else if(line.startsWith('#EXT-X-MAP:')){const a=attributes(line);if(!a.URI||a.BYTERANGE||map)fail('инициализация потока не поддерживается');if(key&&!key.iv)fail('для шифрованной инициализации нужен IV');map={url:mediaUrl(new URL(a.URI,base).href).href,key};}
  else if(line&&!line.startsWith('#')){const url=mediaUrl(new URL(line,base).href).href;if(stream){if(!variants.length)variants.push(url);stream=null;}else{if(duration===null)fail('у сегмента нет длительности');segments.push({url,key,sequence:sequence++,duration});duration=null;if(segments.length>20000)fail('слишком много сегментов');}}
 }
 if(renditions.length)variants.unshift(...renditions.sort((a,b)=>Number(b.preferred)-Number(a.preferred)||Number(b.auto)-Number(a.auto)).map(r=>r.url));
 if(variants.length)return{variants};
 if(!lines.includes('#EXT-X-ENDLIST')||!segments.length)fail('скачивание доступно только для завершённой записи');
 return{segments,map};
}
function stripId3(bytes){while(bytes.length>=10&&bytes.toString('ascii',0,3)==='ID3'){const size=10+((bytes[6]&127)*2097152+(bytes[7]&127)*16384+(bytes[8]&127)*128+(bytes[9]&127));if(size>bytes.length)fail('повреждённый ID3');bytes=bytes.subarray(size);}return bytes;}
function tsAudio(bytes){
 if(bytes.length%188)fail('обрезанный TS-сегмент');let pmt=-1,pid=-1,pes=[],result=[],lastCounter=null;
 const flush=()=>{if(!pes.length)return;const b=Buffer.concat(pes);pes=[];if(b.length<9||b[0]||b[1]||b[2]!==1)fail('некорректный PES');const len=b.readUInt16BE(4),start=9+b[8],end=len?6+len:b.length;if(start>end||end>b.length)fail('неполный PES');result.push(b.subarray(start,end));};
 for(let i=0;i<bytes.length;i+=188){const packet=bytes.subarray(i,i+188);if(packet[0]!==0x47||packet[1]&0x80||packet[3]&0xc0)fail('повреждённый TS');const packetPid=((packet[1]&31)<<8)|packet[2],start=!!(packet[1]&64),mode=(packet[3]>>4)&3;if(!mode)fail('некорректный TS');if(!(mode&1))continue;const at=mode&2?5+packet[4]:4;if(at>188)fail('некорректная адаптация TS');const payload=packet.subarray(at);
  if(packetPid===0||packetPid===pmt){if(!start||!payload.length)continue;const section=payload.subarray(1+payload[0]);if(section.length<12)fail('неполная таблица TS');const end=3+((section[1]&15)<<8)+section[2]-4;if(end>section.length)fail('таблица TS не помещается в пакет');if(packetPid===0){for(let n=8;n+4<=end;n+=4)if(section.readUInt16BE(n)!==0){pmt=((section[n+2]&31)<<8)|section[n+3];break;}}else{let n=12+((section[10]&15)<<8)+section[11];for(;n+5<=end;n+=5+((section[n+3]&15)<<8)+section[n+4])if(section[n]===15){pid=((section[n+1]&31)<<8)|section[n+2];break;}}}
  else if(packetPid===pid){const counter=packet[3]&15;if(lastCounter!==null&&counter!==((lastCounter+1)&15))fail('пропущен пакет TS');lastCounter=counter;if(start)flush();pes.push(payload);}
 }
 flush();if(!result.length)fail('AAC-дорожка в TS не найдена');return Buffer.concat(result);
}
function validateAdts(bytes){let at=0,frames=0;while(at<bytes.length){if(at+7>bytes.length||bytes[at]!==255||(bytes[at+1]&246)!==240)fail('повреждённые AAC-кадры');const size=((bytes[at+3]&3)<<11)|(bytes[at+4]<<3)|(bytes[at+5]>>5);if(size<7||at+size>bytes.length)fail('обрезанный AAC-кадр');at+=size;frames++;}if(!frames)fail('пустое аудио');return bytes;}
async function* hlsAudio(url,{fetch,signal,maxBytes=512*1024**2}){
 let transferred=0;const get=(url,max)=>retryRead(async()=>{const r=await requestAudio(fetch,url,{signal}),parts=[];let count=0;try{for await(const chunk of r.body){count+=chunk.length;transferred+=chunk.length;if(count>max||transferred>3*maxBytes+16*1024**2)throw Object.assign(Error('HLS: превышен лимит размера'),{kind:'download-limit'});parts.push(Buffer.from(chunk));}}catch(e){await r.body.cancel().catch(()=>{});if(signal?.aborted||e.kind==='download-limit')throw e;throw Object.assign(Error('HLS: сегмент загружен не полностью'),{retryable:true});}const expected=r.headers.has('content-encoding')?0:Number(r.headers.get('content-length'))||0;if(expected&&expected!==count)throw Object.assign(Error('HLS: сегмент загружен не полностью'),{retryable:true});return Buffer.concat(parts);},{signal});
 let manifest;for(let level=0;level<4;level++){manifest=parseManifest((await get(url,1024*1024)).toString('utf8'),url);if(!manifest.variants)break;url=manifest.variants[0];}if(!manifest?.segments)fail('слишком много вложенных плейлистов');
 const keys=new Map(),decrypt=async(bytes,item)=>{if(!item.key)return bytes;let key=keys.get(item.key.url);if(!key){key=await get(item.key.url,16);if(key.length!==16)fail('некорректный ключ AES-128');keys.set(item.key.url,key);}const iv=item.key.iv?Buffer.from(item.key.iv,'hex'):Buffer.alloc(16);if(!item.key.iv)iv.writeBigUInt64BE(BigInt(item.sequence),8);try{const d=createDecipheriv('aes-128-cbc',key,iv);return Buffer.concat([d.update(bytes),d.final()]);}catch{fail('не удалось прочитать AES-128 сегмент');}};
 let type=null;if(manifest.map){const init=await decrypt(await get(manifest.map.url,8*1024**2),manifest.map);if(init.length<12||init.toString('ascii',4,8)!=='ftyp'||!init.includes(Buffer.from('moov'))||init.includes(Buffer.from('encv'))||init.includes(Buffer.from('enca')))fail('инициализация fMP4 не поддерживается');type='m4a';yield init;}
 for(const segment of manifest.segments){signal?.throwIfAborted();let bytes=await decrypt(await get(segment.url,32*1024**2),segment);if(type==='m4a'){if(!bytes.includes(Buffer.from('moof'))||!bytes.includes(Buffer.from('mdat')))fail('некорректный fMP4-сегмент');}else{bytes=stripId3(bytes);if(bytes[0]===0x47&&bytes[188]===0x47)bytes=tsAudio(bytes);const next=bytes[0]===255&&(bytes[1]&246)===240?'aac':'mp3';if(type&&type!==next)fail('смена формата потока');type=next;if(type==='aac')validateAdts(bytes);else if(bytes[0]!==255||(bytes[1]&224)!==224)fail('формат сегмента не поддерживается');}yield bytes;}
}
module.exports={parseManifest,tsAudio,validateAdts,hlsAudio};
