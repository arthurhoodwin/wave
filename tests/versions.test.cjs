'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {compare}=require('../src/main/update-manager.cjs');
test('release ordering supports installed historical versions, prereleases and invalid inputs',()=>{
  const ordered=[
    '0.8.9','0.8.10','1.0.5','1.0.6','1.0.61','1.0.62','1.0.7','1.0.8',
    '1.0.9','1.0.9.5','1.0.9.9','1.0.9.9.1','1.0.10',
    '1.1.0-alpha.1','1.1.0-alpha.2','1.1.0-beta.1','1.1.0-beta.2','1.1.0-beta.3','1.1.0-rc.1','1.1.0'
  ];
  for(const version of ordered)assert.equal(compare(version,version),0,version+' equals itself');
  for(let i=1;i<ordered.length;i++){
    const newer=ordered[i],older=ordered[i-1];
    assert.equal(compare(newer,older),1,newer+' follows '+older);
    assert.equal(compare(older,newer),-1,older+' precedes '+newer);
  }
  for(const [a,b] of [['1.0.9.0','1.0.9'],['1.0.61','1.0.6.1'],['1.0.62','1.0.6.2']])assert.equal(compare(a,b),0,a+' aliases '+b);
  for(const bad of ['1.0.9.5.1.1','1.0.9-5','1.0.09.5','../1.0.9','1.1.0-alpha','1.1.0-alpha.0','1.1.0-evil.1'])assert.throws(()=>compare(bad,'1.0.9'),bad);
});
