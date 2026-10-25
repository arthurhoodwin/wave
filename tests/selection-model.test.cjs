'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {create}=require('../src/renderer/selection-model.js');
test('selection toggles independent songs and bottom follows displayed order rather than click order',()=>{
 const s=create(),list=[{id:'a'},{id:'b'},{id:'c'}];s.sync('playlist',list);s.toggle('c',list);s.toggle('a',list);assert.equal(s.bottom(list),'c');assert.deepEqual(s.ids(list),['a','c']);assert.equal(s.bottom([...list].reverse()),'a');s.toggle('c',list);assert.equal(s.bottom(list),'a');s.toggle('missing',list);assert.deepEqual(s.ids(list),['a']);
});
test('select all includes offscreen loaded songs but not songs arriving later',()=>{
 const s=create(),list=Array.from({length:5000},(_,i)=>({id:String(i)}));s.sync('playlist',list);s.all(list);assert.equal(s.selected.size,5000);assert.equal(s.bottom(list),'4999');const next=[...list,{id:'later'}];s.sync('playlist',next);assert.equal(s.selected.has('later'),false);assert.equal(s.bottom(next),'4999');
});
test('filtering removes hidden selections and navigation clears previous context even for shared track ids',()=>{
 const s=create(),list=[{id:'same'},{id:'other'}];s.sync('one',list);s.all(list);s.sync('one',[list[0]]);assert.deepEqual(s.ids(list),['same']);s.sync('two',list);assert.equal(s.selected.size,0);assert.equal(s.bottom(list),null);
});
test('bulk identity is unique even if the same id appears twice in a view',()=>{const s=create(),list=[{id:'x'},{id:'x'},{id:'y'}];s.sync('p',list);s.all(list);assert.deepEqual(s.ids(list),['x','y']);s.selected.clear();assert.equal(s.bottom(list),null);});
