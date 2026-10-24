'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
function rendererFixture(){
 const nodes=new Map(),calls=[];
 function make(tag){return{tagName:typeof tag==='string'?tag.toUpperCase():'DIV',textContent:'',value:0,children:[],classList:{values:new Set(),toggle(k,v){v?this.values.add(k):this.values.delete(k);},contains(k){return this.values.has(k);}},setAttribute(k,v){this[k]=v;},removeAttribute(k){delete this[k];},append(...x){this.children.push(...x);},after(){},replaceChildren(...x){this.children=x;},addEventListener(){}};}
 const get=id=>{if(!nodes.has(id))nodes.set(id,make());return nodes.get(id);};
 const api={play:async id=>{calls.push(['play',id]);return{playing:true};},pause:async()=>{calls.push(['pause']);return{playing:false};},resume:async()=>{calls.push(['resume']);return{playing:true};},searchPage:async()=>{throw Error('Offline playback must not request search continuation');}};
 const context=vm.createContext({window:{music:api,addEventListener(){}},document:{getElementById:get,createElement:make,createDocumentFragment:make,querySelector:()=>get('main'),querySelectorAll:()=>[],addEventListener(){},body:make()},requestAnimationFrame:()=>1,cancelAnimationFrame(){},setTimeout:()=>1,clearTimeout(){},setInterval(){},Math,Set,Map,Promise,Date});
 vm.runInContext(fs.readFileSync(path.join(__dirname,'../../src/renderer/app.js'),'utf8'),context);
 return{get,calls,context,run:code=>vm.runInContext(code,context)};
}
module.exports={rendererFixture};
