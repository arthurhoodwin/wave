'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createLikes}=require('../src/renderer/likes.js');


test('heart responds before transport completes and duplicate clicks do not repeat the write',async()=>{let resolve,calls=0;const track={id:'song',owned:false},copy={id:'song',owned:false},pending=new Promise(r=>resolve=r);const likes=createLikes({send:()=>{calls++;return pending;},targets:()=>[track,copy],draw(){},apply(){}});const task=likes.toggle(track);assert.equal(track.owned,true);assert.equal(copy.owned,true);assert.equal(likes.pending('song'),true);await likes.toggle(track);assert.equal(calls,1);resolve({operation:{state:'success'}});await task;assert.equal(track.owned,true);assert.equal(likes.pending('song'),false);});

test('failed or uncertain writes restore the previous heart and report the failure',async()=>{for(const state of ['error','uncertain']){let error;const track={id:'song',owned:true},likes=createLikes({send:async()=>({operation:{state,message:'Check VK'}}),targets:()=>[track],draw(){},apply(){throw Error('must not apply');},onError:e=>error=e.message});await likes.toggle(track);assert.equal(track.owned,true);assert.equal(error,'Check VK');}});

test('account reset ignores a late result from the previous account',async()=>{let resolve,applied=false;const track={id:'song',owned:false},likes=createLikes({send:()=>new Promise(r=>resolve=r),targets:()=>[track],draw(){},apply:()=>applied=true});const task=likes.toggle(track);likes.reset();resolve({operation:{state:'success'}});await task;assert.equal(applied,false);assert.equal(likes.pending('song'),false);});

test('failed like also restores a row replaced while confirmation was pending',async()=>{let resolve;const old={id:'song',owned:false};let current=old;const likes=createLikes({send:()=>new Promise(r=>resolve=r),targets:()=>[old,current],draw(){},apply(){}});const task=likes.toggle(old);current={id:'song',owned:true};resolve({operation:{state:'uncertain'}});await task;assert.equal(current.owned,false);assert.equal(old.owned,false);});
