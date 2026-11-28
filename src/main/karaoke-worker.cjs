'use strict';

const {parentPort,workerData,isMainThread}=require('node:worker_threads');
const fs=require('node:fs/promises');

const MAX_BYTES=24*1024**2;

function inspectWav(input){
 if(input.length<44||input.toString('ascii',0,4)!=='RIFF'||input.toString('ascii',8,12)!=='WAVE'||
    input.readUInt32LE(4)+8!==input.length)throw Error('Нужен обычный файл WAV');
 let format=null,data=null;
 for(let offset=12;offset+8<=input.length;){
  const type=input.toString('ascii',offset,offset+4),size=input.readUInt32LE(offset+4),from=offset+8;
  if(size>input.length-from)throw Error('Файл WAV повреждён');
  if(type==='fmt '&&size>=16){
   format={encoding:input.readUInt16LE(from),channels:input.readUInt16LE(from+2),
    rate:input.readUInt32LE(from+4),alignment:input.readUInt16LE(from+12),bits:input.readUInt16LE(from+14)};
  }
  if(type==='data'&&!data)data={offset:from,size};
  offset=from+size+(size%2);
 }
 if(!format||format.encoding!==1||format.channels!==2||format.bits!==16||format.alignment!==4||format.rate<8000||format.rate>192000)
  throw Error('Выберите стерео WAV с PCM 16 бит');
 if(!data||!data.size||data.size%4)throw Error('В файле нет полной стереозаписи');
 return {...format,...data};
}

function instrumental(input,onProgress=()=>{}){
 const {offset,size,rate}=inspectWav(input);
 const result=Buffer.from(input);
 const cutoff=hz=>1-Math.exp(-2*Math.PI*hz/rate);
 const lowStep=cutoff(140),highStep=cutoff(3400);
 const clipped=value=>Math.round(Math.max(-32768,Math.min(32767,value)));
 let low=0,high=0,last=-1;
 for(let i=0;i<size;i+=4){
  const at=offset+i,left=input.readInt16LE(at),right=input.readInt16LE(at+2);
  const mid=(left+right)/2, side=(left-right)/2;
  low+=lowStep*(mid-low);high+=highStep*(mid-high);
  // Attenuate only the middle band in the center image. Stereo sides
  // and most of the bass remain; vocals away from center remain audible.
  const center=mid-.92*(high-low);
  result.writeInt16LE(clipped(center+side),at);
  result.writeInt16LE(clipped(center-side),at+2);
  if(i%16384===0){
   const percent=Math.floor(i/size*100);
   if(percent!==last){last=percent;onProgress(percent);}
  }
 }
 onProgress(100);
 return result;
}

async function run(source){
 const handle=await fs.open(source,'r');
 let bytes;
 try{
  const stat=await handle.stat();
  if(!stat.isFile()||stat.size>MAX_BYTES)throw Error('Для пробного режима нужен файл WAV до 24 МиБ');
  bytes=Buffer.alloc(stat.size);
  let offset=0;
  while(offset<bytes.length){
   const {bytesRead}=await handle.read(bytes,offset,bytes.length-offset,offset);
   if(!bytesRead)throw Error('Файл изменился во время чтения');
   offset+=bytesRead;
  }
 }finally{await handle.close();}
 const wave=instrumental(bytes,progress=>parentPort.postMessage({progress}));
 parentPort.postMessage({bytes:wave});
}

if(!isMainThread)run(workerData.source).catch(error=>parentPort.postMessage({error:error.code?'Не удалось прочитать WAV':error.message}));

module.exports={instrumental,inspectWav,MAX_BYTES};
