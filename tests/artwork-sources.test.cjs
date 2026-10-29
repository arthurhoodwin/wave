const test=require('node:test'),assert=require('node:assert/strict'),{best,candidates}=require('../src/main/artwork-sources.cjs'),{audioRow,playlistRow}=require('../src/main/vk-http.cjs');const url=n=>'https://sun1.userapi.com/'+n+'.jpg';
test('artwork selection prefers a useful high resolution over earlier 135/270 variants without rewriting URLs',()=>{assert.equal(best({photo_135:url(135),photo_270:url(270),photo_600:url(600),photo_1200:url(1200)}),url(1200));assert.equal(best({photo_600:url(600),photo_1200:url(1200),photo_4096:url(4096)}),url(1200));assert.equal(best({photo_4096:url(4096),photo_2400:url(2400)}),url(2400));assert.equal(best({photo_1200:'https://evil.test/a',photo_270:url(270)}),url(270));});
test('array order does not select a thumbnail and artist aspect metadata is retained',()=>{const list=[{url:url(1200),width:1200,height:400},{url:url(135),width:135,height:135}];assert.equal(best(list),url(1200));assert.equal(candidates(list)[0].height,400);assert.equal(candidates({photo_600:url(600)})[0].height,0);});
test('tracks, albums and playlists use high resolution artwork when supplied by VK',()=>{const photo={photo_270:url(270),photo_1200:url(1200)},a=audioRow({owner_id:1,id:2,title:'Song',artist:'Artist',duration:180,thumb:photo},0),p=playlistRow({owner_id:1,id:3,title:'List',photo},0);assert.equal(a.cover,url(1200));assert.equal(p.cover,url(1200));});

test('track thumbnail does not hide a larger album cover in the expanded player',()=>{
 const row=audioRow({owner_id:1,id:2,title:'Song',artist:'Artist',duration:180,thumb:{photo_135:url(135),photo_270:url(270)},album:{thumb:{photo_600:url(600),photo_1200:url(1200)}}},0);
 assert.equal(row.cover,url(1200));
 const own=audioRow({owner_id:1,id:3,title:'Song',artist:'Artist',duration:180,thumb:{photo_1200:url(1200)},album:{thumb:{photo_270:url(270)}}},0);
 assert.equal(own.cover,url(1200));
 const invalid=audioRow({owner_id:1,id:4,title:'Song',artist:'Artist',duration:180,thumb:{photo_1200:'https://evil.test/a'},album:{thumb:{photo_600:url(600)}}},0);
 assert.equal(invalid.cover,url(600));
});

test('opening downloads online does not replace the known large cover with an old offline thumbnail',()=>{
 const {PersonalService}=require('../src/main/personal-service.cjs'),known={id:'track',key:'1_2',title:'Song',artist:'Artist',duration:180,cover:url(1200)},offline='http://127.0.0.1:1234/wave-art/local';
 const provider={online:true,tracks:new Map([['track',known]])},service=new PersonalService({provider,downloads:{artwork:{url:()=>offline}}});
 service.currentCopies=new Map([['1_2',{artwork:{ext:'jpg'}}]]);
 const stored={...known,cover:url(270)};
 assert.equal(service.track(stored,'/audios1').cover,url(1200));assert.equal(known.cover,url(1200));
 provider.online=false;assert.equal(service.track(stored,'/audios1').cover,offline);
 provider.online=true;assert.equal(service.track({...stored,cover:url(1200)},'/audios1').cover,url(1200));
});
