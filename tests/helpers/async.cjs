'use strict';
const assert=require('node:assert/strict');
async function waitUntil(predicate,label='condition',{timeout=5000}={}) {
  const deadline=Date.now()+timeout;
  while(!await predicate()) {
    assert(Date.now()<deadline,'Timed out waiting for '+label);
    await new Promise(resolve=>setTimeout(resolve,5));
  }
}
module.exports={waitUntil};
