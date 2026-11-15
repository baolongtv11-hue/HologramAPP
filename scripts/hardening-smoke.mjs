import assert from 'node:assert/strict';
import { EventBus } from '../src/core/EventBus.js';
import { LiveSessionManager } from '../src/ai/LiveSessionManager.js';
import { AudioPlaybackQueue } from '../src/audio/AudioPlaybackQueue.js';
import { TextSyncEngine } from '../src/audio/TextSyncEngine.js';
import { VideoManager, extractVideoQuery } from '../src/video/VideoManager.js';
import { CommandEngine } from '../src/commands/CommandEngine.js';

const sync = new TextSyncEngine();
assert.equal(sync.mergeOutput('xin chào'), 'xin chào');
assert.equal(sync.mergeOutput('xin chào bạn'), 'xin chào bạn');
const overlapSync = new TextSyncEngine();
assert.equal(overlapSync.mergeInput('cho tôi xem'), 'cho tôi xem');
assert.equal(overlapSync.mergeInput('xem video hologram'), 'cho tôi xem video hologram');
assert.deepEqual(sync.formatLines('một hai ba bốn năm sáu', 4), ['một hai ba bốn','năm sáu']);

const eventBus = new EventBus();
let resolveLive;
const session = { close(){}, sendRealtimeInput(){} };
const engine = { connectLive(){ return new Promise((resolve)=>{resolveLive=resolve;}); } };
const live = new LiveSessionManager({ geminiEngine: engine, eventBus });
const c1 = live.connect({ apiKey:'k', model:'m' });
const c2 = live.connect({ apiKey:'k', model:'m' });
resolveLive(session);
assert.equal(await c1, session);
assert.equal(await c2, session);

const sources=[];
const context={currentTime:1,destination:{},createGain(){return {context,gain:{value:1},connect(){},disconnect(){}};},createBuffer(_c,n,r){return {duration:n/r,getChannelData(){return new Float32Array(n);}};},createBufferSource(){const source={connect(){},disconnect(){},start(t){source.started=t;},stop(){source.stopped=true;},onended:null};sources.push(source);return source;}};
const queue = new AudioPlaybackQueue({contextProvider:async()=>context});
queue.setVolume(.5);
await queue.enqueueBase64Pcm(btoa(String.fromCharCode(0,0)),{sampleRate:1});
queue.setMuted(true);
assert.equal(queue.muted,true);
queue.cancel();
assert.equal(queue.activeSourceCount,0);

assert.equal(extractVideoQuery('mở youtube về hệ mặt trời'),'hệ mặt trời');

const commandEngine=new CommandEngine();
assert.deepEqual(commandEngine.recognize('tắt video'),{type:'video.stop',text:'tắt video'});
assert.equal(commandEngine.recognize('mở youtube về hệ mặt trời').type,'video.play');
assert.equal(commandEngine.recognize('tìm kiếm video hologram').query,'hologram');
assert.equal(commandEngine.recognize('phat video hologram').query,'hologram');
assert.equal(commandEngine.recognize('mo youtube ve tri tue nhan tao').type,'video.play');
assert.equal(commandEngine.recognize('tắt nó đi',{videoActive:true}).type,'video.stop');

const originalFetch=globalThis.fetch;
globalThis.fetch=async (url)=>{
  const u=String(url);
  if(u.includes('/search?')) return {ok:true,json:async()=>({items:[{id:{videoId:'abc'}}]})};
  return {ok:true,json:async()=>({items:[{id:'abc',status:{embeddable:true},snippet:{title:'Demo'}}]})};
};
let played='';
const manager=new VideoManager({player:{async play(v){played=v.videoId;},pause(){},resume(){},stop(){},fullscreen(){},dispose(){}},apiKeyProvider:()=> 'youtube-key'});
const video=await manager.searchAndPlay('demo');
assert.equal(video.videoId,'abc');
assert.equal(played,'abc');
globalThis.fetch=originalFetch;


// Local commands must execute without depending on Gemini output.
assert.equal(commandEngine.recognize('dừng video ngay').type,'video.stop');
assert.equal(commandEngine.recognize('tạm dừng video').type,'video.pause');
assert.equal(commandEngine.recognize('tiếp tục video').type,'video.resume');

// Stopping video aborts an in-flight search so stale results cannot reopen playback.
let stopCalled=false;
const abortManager=new VideoManager({
  player:{async play(){throw new Error('stale video must not play');},pause(){},resume(){},stop(){stopCalled=true;},fullscreen(){},dispose(){}},
  apiKeyProvider:()=> 'youtube-key',
});
const savedFetch=globalThis.fetch;
globalThis.fetch=(_url,{signal}={})=>new Promise((_resolve,reject)=>{
  signal?.addEventListener('abort',()=>{const e=new Error('aborted');e.name='AbortError';reject(e);},{once:true});
});
const pendingSearch=abortManager.searchAndPlay('demo').catch((error)=>error.name);
await Promise.resolve();
abortManager.close();
assert.equal(await pendingSearch,'AbortError');
assert.equal(stopCalled,true);
globalThis.fetch=savedFetch;

console.log('HARDENING_SMOKE_PASS');
