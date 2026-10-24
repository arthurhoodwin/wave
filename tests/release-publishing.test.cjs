'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
test('release publishing keeps all prerelease channels away from stable Latest',()=>{
 const source=fs.readFileSync(require.resolve('../scripts/release.cjs'),'utf8');
 for(const [channel,updateMode,extraUpdateBase] of [['alpha','delta'],['beta','delta'],['rc','delta'],['stable','delta'],['beta','bootstrap'],['stable','legacy','1.1.0-rc.1']]){
  const version=channel==='stable'?'1.1.0':'1.1.0-'+channel+'.3',pkg={version,releaseVersion:version,releaseChannel:channel,updateMode,extraUpdateBase};let command;
  const context={require:name=>name==='node:fs'?{readFileSync:()=> '# Wave '+version+'\n',existsSync:()=>true}:name==='node:child_process'?{spawnSync:(cmd,args,options)=>{command={cmd,args,options};return{status:0};}}:name==='../package.json'?pkg:require(name),__dirname:path.join(__dirname,'../scripts'),process:{argv:['node','release'],exit:()=>{}},console:{log:()=>{}}};
  vm.runInNewContext(source,context);assert.equal(command.cmd,'gh');assert(command.args.includes('v'+version));
  assert.equal(command.args.includes('--prerelease'),channel!=='stable',channel);
  assert.equal(command.args.includes('--latest=false'),channel!=='stable',channel);
  assert.equal(command.options.shell,false);assert.equal(command.args.some(a=>a.endsWith('.waveupdate')),updateMode!=='bootstrap');
  assert.equal(command.args.some(a=>a.endsWith('Wave-'+version+'-from-1.1.0-rc.1.waveupdate')),!!extraUpdateBase);
 }
});
