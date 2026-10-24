'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {Heights}=require('../src/renderer/virtual-list.js');


test('height index handles ten thousand variable rows and bounded typed memory',()=>{const h=new Heights(10000,64);assert.equal(h.prefix(10000),640000);h.set(5,100);assert.equal(h.prefix(6),420);assert.equal(h.index(419),5);assert.equal(h.index(420),6);h.resize(12000);assert.equal(h.prefix(6),420);assert(h.values.byteLength+h.tree.byteLength<200000);h.resize(10);assert.equal(h.prefix(10),676);});
