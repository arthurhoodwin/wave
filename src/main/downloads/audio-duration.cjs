'use strict';
const {createReadStream}=require('node:fs');
const invalid=()=>Object.assign(Error('Структура скачанного аудиофайла повреждена или обрезана. Повторите загрузку.'),{kind:'incomplete-download'});
const rates=[96000,88200,64000,48000,44100,32000,24000,22050,16000,12000,11025,8000,7350];
// Count encoded samples, not bytes/estimated bitrate. Payload decoding remains Chromium's job.
async function frameDuration(file,ext,{signal}={}){
 if(!['aac','mp3'].includes(ext))return null;
 let carry=Buffer.alloc(0),skip=0,start=true,duration=0,frames=0,trailer=false;
 for await(const chunk of createReadStream(file,{signal})){
  if(skip){const n=Math.min(skip,chunk.length);skip-=n;if(n===chunk.length)continue;carry=Buffer.concat([carry,chunk.subarray(n)]);}else carry=Buffer.concat([carry,chunk]);
  let at=0;
  if(start){if(carry.length<10)continue;start=false;
   if(carry.toString('ascii',0,3)==='ID3'){
    if(carry.subarray(6,10).some(b=>b&128))throw invalid();
    const size=10+carry[6]*2097152+carry[7]*16384+carry[8]*128+carry[9]+(carry[3]===4&&(carry[5]&16)?10:0);
    if(size>16*1024*1024)throw invalid();at=Math.min(size,carry.length);skip=size-at;
   }
  }
  while(at<carry.length){
   if(trailer)break;
   if(ext==='mp3'&&carry.length-at>=3&&carry.toString('ascii',at,at+3)==='TAG'){trailer=true;break;}
   if(carry.length-at<7)break;
   const b=carry.subarray(at);let size,seconds;
   if(ext==='aac'){
    if(b[0]!==255||(b[1]&246)!==240)throw invalid();
    const rate=rates[(b[2]>>2)&15],header=b[1]&1?7:9;size=((b[3]&3)<<11)|(b[4]<<3)|(b[5]>>5);
    if(!rate||size<header)throw invalid();seconds=1024*((b[6]&3)+1)/rate;
   }else{
    if(b[0]!==255||(b[1]&224)!==224)throw invalid();const version=(b[1]>>3)&3,layer=(b[1]>>1)&3,bitrateIndex=(b[2]>>4)&15,rateIndex=(b[2]>>2)&3;
    // Free bitrate and non-Layer-III streams use the decoder's duration path.
    if(layer!==1||bitrateIndex===0)return null;
    if(version===1||rateIndex===3||bitrateIndex===15)throw invalid();
    const rate=[44100,48000,32000][rateIndex]/(version===3?1:version===2?2:4),kbps=(version===3?[0,32,40,48,56,64,80,96,112,128,160,192,224,256,320]:[0,8,16,24,32,40,48,56,64,80,96,112,128,144,160])[bitrateIndex];
    size=Math.floor((version===3?144000:72000)*kbps/rate)+((b[2]>>1)&1);seconds=(version===3?1152:576)/rate;
   }
   if(size>carry.length-at)break;
   at+=size;duration+=seconds;frames++;if(duration>604800)throw invalid();
  }
  carry=carry.subarray(at);if(trailer&&carry.length>128)throw invalid();
 }
 if(skip||!frames||(trailer?carry.length!==128:carry.length!==0))throw invalid();
 return duration;
}
module.exports={frameDuration};
