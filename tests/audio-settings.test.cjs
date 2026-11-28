'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const EQ=require('../src/renderer/equalizer.js'),{Diagnostics}=require('../src/main/diagnostics.cjs');


test('unsupported CDN is a distinct error and cancellation does not fill diagnostic history',()=>{const {mediaUrl}=require('../src/main/media-proxy.cjs');assert.throws(()=>mediaUrl('https://unsupported.example/a'),e=>e.kind==='unsupported-host');const d=new Diagnostics();for(let i=0;i<40;i++)d.record({kind:'cancelled'});d.record({kind:'expired'});assert.deepEqual(d.report().events.map(e=>e.kind),['expired']);});

test('equalizer limits preset makeup without attenuating bypass or a flat preset',()=>{
 assert.equal(EQ.makeup({enabled:false,gains:EQ.presets.bass}),0);
 assert.equal(EQ.makeup({enabled:true,gains:EQ.presets.flat}),0);
 for(const gains of Object.values(EQ.presets))assert(Math.abs(EQ.makeup({enabled:true,gains}))<=3);
 assert(EQ.makeup({enabled:true,gains:EQ.presets.bass})>-3);
 assert(EQ.makeup({enabled:true,gains:Array(6).fill(-6)})>0);
});

test('diagnostic output never serializes arbitrary account, track, URL or error strings',()=>{const d=new Diagnostics();d.record({kind:'network',message:'https://private.test/?token=secret',track:'Private song'});d.record({kind:'https://private.test/token'});const report=d.report({version:'1.0.4',electron:'45.0.0',stats:{requests:7,refreshes:1,retries:0,token:'secret'},player:{current:{title:'Private song',key:'123_1'},last:{playing:true},loading:false},equalizer:{enabled:true,cookie:'secret'}});const text=JSON.stringify(report);for(const secret of ['secret','Private song','https:','123_1','cookie','token'])assert(!text.includes(secret));assert.deepEqual(report.events.map(e=>e.kind),['network','unknown']);assert.equal(report.network.requests,7);});
