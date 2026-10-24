'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),{StartupHealth}=require('../src/main/updates/startup-health.cjs');


test('startup health records an unclean same-version session and clears it after clean quit',async()=>{const directory=await fs.mkdtemp(path.join(os.tmpdir(),'wave-health-'));try{const a=new StartupHealth(directory,'1.0.9');assert.equal(await a.start(),false);assert.equal(await new StartupHealth(directory,'1.0.9').start(),true);await a.clean();assert.equal(await new StartupHealth(directory,'1.0.9').start(),false);assert.equal(await new StartupHealth(directory,'1.1.0').start(),false);}finally{await fs.rm(directory,{recursive:true,force:true});}});
