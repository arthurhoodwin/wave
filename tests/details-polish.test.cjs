'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{dominant}=require('../src/main/cover-palette.cjs'),eq=require('../src/renderer/equalizer.js');
test('cover palette selects the dominant opaque color while ignoring blank margins',()=>{const pixels=Buffer.from([...Array.from({length:80},()=>[60,80,180,255]).flat(),...Array.from({length:10},()=>[250,250,250,255]).flat(),...Array.from({length:30},()=>[0,0,0,0]).flat()]);assert.deepEqual(dominant(pixels),[180,80,60]);assert.equal(dominant(Buffer.alloc(64)),null);});
test('all15 equalizer presets fit the six bands and safe limits',()=>{assert.equal(Object.keys(eq.presets).length,15);for(const gains of Object.values(eq.presets)){assert.equal(gains.length,eq.frequencies.length);assert(gains.every(v=>Number.isFinite(v)&&v>=-12&&v<=12));assert.deepEqual(eq.normalize({enabled:true,gains}).gains,gains);}assert.equal(eq.normalize({gains:[1.25]}).gains[0],1.25);});

test('old EQ settings map onto six bands while newer settings take precedence',()=>{
 const old={enabled:true,gains:[5,5,5,5,5,5,5,5,5,5]};
 const values={'wave-equalizer-v2':JSON.stringify(old)};
 const storage={getItem:key=>values[key]||null};
 assert.deepEqual(eq.load(storage),{enabled:true,gains:Array(6).fill(5)});
 assert.deepEqual(JSON.parse(values['wave-equalizer-v2']),old);
 values[eq.storageKey]=JSON.stringify({enabled:false,gains:eq.presets.bright});
 assert.deepEqual(eq.load(storage),{enabled:false,gains:eq.presets.bright});
 delete values[eq.storageKey];delete values['wave-equalizer-v2'];
 values['wave-equalizer-v1']=JSON.stringify({enabled:true,gains:[1,2,3,4,5,6]});
 assert.equal(eq.load(storage).gains[3],4);
});
