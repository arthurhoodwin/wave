'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {publish}=require('../scripts/release.cjs'),{setup,remote}=require('./helpers/release.cjs');
test('release publishing keeps prereleases away from Latest and preserves bootstrap and extra-base assets',t=>{
 for(const [channel,updateMode,extraUpdateBase] of [['alpha','delta'],['beta','delta'],['rc','delta'],['stable','delta'],['beta','bootstrap'],['stable','legacy','1.1.0-rc.1']]){
  const version=channel==='stable'?'1.1.0':'1.1.0-'+channel+'.3',fixture=setup(t,{version,releaseVersion:version,releaseChannel:channel,updateMode,extraUpdateBase}),r=remote();
  publish({...fixture,run:r.run,log(){}});const create=r.calls.find(c=>c.args[1]==='create').args,edit=r.calls.find(c=>c.args[1]==='edit').args,uploads=r.calls.filter(c=>c.args[1]==='upload').map(c=>c.args[3]);
  assert.equal(create.includes('--prerelease'),channel!=='stable');assert.equal(edit.includes('--latest=false'),channel!=='stable');assert.equal(edit.includes('--latest'),channel==='stable');
  assert.equal(uploads.some(p=>p.endsWith('.waveupdate')),updateMode!=='bootstrap');assert.equal(uploads.some(p=>p.endsWith('Wave-'+version+'-from-1.1.0-rc.1.waveupdate')),!!extraUpdateBase);
 }
});
