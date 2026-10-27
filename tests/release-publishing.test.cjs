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

test('preview releases with OTA enabled publish a manual delta without a Stable-only catalog or runtime asset',t=>{const {assets}=require('../scripts/release.cjs');for(const channel of ['alpha','beta','rc']){const version='1.2.0-'+channel+'.1',fixture=setup(t,{version,releaseVersion:version,releaseChannel:channel,updateMode:'files',otaManifest:true,otaBases:['1.1.9.9']}),r=remote();assert.deepEqual(assets(fixture.pkg),['Wave-Setup-'+version+'.exe','Wave-'+version+'.waveupdate','SHA256SUMS.txt']);const result=publish({...fixture,draft:true,run:r.run,log(){}});assert.equal(result.assets,3);assert.equal(r.release.draft,true);}assert(require('../scripts/release.cjs').assets({releaseVersion:'1.2.0',otaManifest:true,releaseChannel:'stable'}).includes('Wave-1.2.0-ota.json'));});
