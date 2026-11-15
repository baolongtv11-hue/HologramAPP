/** Dependency-free regression gates for changes that old smoke tests missed. */
import assert from 'node:assert/strict';
import { VideoCommandScheduler } from '../src/commands/VideoCommandScheduler.js';
import { VideoManager } from '../src/video/VideoManager.js';
import { LiveSessionManager } from '../src/ai/LiveSessionManager.js';
import { EventBus } from '../src/core/EventBus.js';
import { StorageManager } from '../src/storage/StorageManager.js';

const calls=[];
const scheduler=new VideoCommandScheduler({
  execute:async (cmd)=>{calls.push(cmd);return true;},
  getLatest:()=>({type:'video.play',query:'hologram day du'}),delay:40,
});
scheduler.schedule({type:'video.play',query:'hologram'});
assert.equal(scheduler.flush(),true); // turnComplete must NOT cancel valid command
await new Promise((r)=>setTimeout(r,60));
assert.deepEqual(calls.map(c=>c.query),['hologram day du']);
scheduler.schedule({type:'video.play',query:'cancelled'});
scheduler.cancel();
await new Promise((r)=>setTimeout(r,60));
assert.equal(calls.length,1);

const events=new EventBus();
let callbacks;
const live=new LiveSessionManager({geminiEngine:{async connectLive({callbacks:c}){
  callbacks=c;callbacks.onopen();return {close(){}};
}},eventBus:events});
let generationCount=0,turnCount=0;
events.on('live:generation-complete',()=>generationCount++);
events.on('live:turn-complete',()=>turnCount++);
await live.connect({apiKey:'a',model:'test'});
callbacks.onmessage({serverContent:{generationComplete:true}});
assert.equal(turnCount,0);
callbacks.onmessage({serverContent:{turnComplete:true}});
assert.equal(generationCount,1);assert.equal(turnCount,1);

let release;
const player={async play(){return new Promise((resolve)=>{release=resolve;});},stop(){},pause(){},resume(){},dispose(){}};
const videos=new VideoManager({player,apiKeyProvider:()=> 'dummy'});
const pending=videos.play({videoId:'abc'});
videos.close();release(true);
assert.equal(await pending,null);

const store=()=>{const data=new Map();return {getItem:key=>data.get(key)??null,setItem:(key,val)=>data.set(key,val),removeItem:key=>data.delete(key)};};
const local=store(),session=store();
let prefs=new StorageManager({localStorage:local,sessionStorage:session});
assert.equal(prefs.getDisableTransitions(),false);
prefs.setDisableTransitions(true);
prefs=new StorageManager({localStorage:local,sessionStorage:session});
assert.equal(prefs.getDisableTransitions(),true);

console.log('STABILITY_REGRESSION_PASS');
