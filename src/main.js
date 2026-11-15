import './styles/main.css';
import './styles/components.css';
import './styles/animations.css';
import './styles/performance.css';

import { GeminiEngine } from './ai/GeminiEngine.js';
import { LiveSessionManager } from './ai/LiveSessionManager.js';
import { ModelManager } from './ai/ModelManager.js';
import { InstructionManager } from './ai/InstructionManager.js';
import { AudioEngine, AUDIO_INPUT_RATE } from './audio/AudioEngine.js';
import { AudioPlaybackQueue } from './audio/AudioPlaybackQueue.js';
import { TextSyncEngine } from './audio/TextSyncEngine.js';
import { arrayBufferToBase64, sampleRateFromMimeType, rmsFromPcm16Buffer, rmsFromBase64Pcm16 } from './audio/pcm.js';
import { AppController } from './core/AppController.js';
import { AppState } from './core/AppState.js';
import { ErrorHandler } from './core/ErrorHandler.js';
import { EventBus } from './core/EventBus.js';
import { StateMachine } from './core/StateMachine.js';
import { StorageManager } from './storage/StorageManager.js';
import { SettingsPanel } from './ui/SettingsPanel.js';
import { OrientationManager } from './ui/OrientationManager.js';
import { OrbEngine } from './visual/OrbEngine.js';
import { VideoPlayer } from './video/VideoPlayer.js';
import { VideoManager } from './video/VideoManager.js';
import { CommandEngine } from './commands/CommandEngine.js';
import { VideoCommandScheduler } from './commands/VideoCommandScheduler.js';

const eventBus = new EventBus();
const appState = new AppState();
const stateMachine = new StateMachine({ eventBus });
const errorHandler = new ErrorHandler({ eventBus });
const appController = new AppController({ appState, eventBus, stateMachine, errorHandler });
const storageManager = new StorageManager();
const modelManager = new ModelManager();
const instructionManager = new InstructionManager();
const textSyncEngine = new TextSyncEngine();
const commandTextSyncEngine = new TextSyncEngine();
const commandEngine = new CommandEngine();
const geminiEngine = new GeminiEngine();
const liveSessionManager = new LiveSessionManager({ geminiEngine, eventBus });
const audioEngine = new AudioEngine();
const audioPlaybackQueue = new AudioPlaybackQueue({
  contextProvider: () => audioEngine.ensureContext(),
  onDrained: () => {
    if (appState.get('micActive')) { showOrb(); appController.transitionTo('listening', { source: 'playback-drained' }); }
    else if (stateMachine.current !== 'error') appController.transitionTo('idle', { source: 'playback-drained' });
  },
});

const orbEngine = new OrbEngine({ canvas: document.querySelector('#orb-canvas') });
const videoCommandScheduler = new VideoCommandScheduler({
  execute: (command) => executeLocalCommand(command),
  getLatest: () => commandEngine.recognize(accumulatedInputTranscript, { videoActive: appState.get('videoActive') }),
  onError: (error) => errorHandler.report(error, { source: 'video-command', severity: 'warning' }),
});
let commandSuppressionTimer = null;
let accumulatedInputTranscript = '';
let suppressAssistantTurn = false;
let lastExecutedCommand = { key: '', at: 0, promise: null };
let microphoneRequestEpoch = 0;
let videoOperationEpoch = 0;
let liveReconnectAttempts = 0;
let liveReconnectTimer = null;
let liveReconnectEpoch = 0;
let liveReconnectInFlight = false;
let settingsBackdropHideTimer = null;
const LIVE_RECONNECT_DELAYS = [500, 1000, 2000];
const COMMAND_SUPPRESSION_TTL_MS = 8000;
const cancelledToolCallIds = new Set();
const videoPlayer = new VideoPlayer({
  containerId: 'yt-player',
  onEnded: () => hideVideo(),
  onNotice: (notice) => errorHandler.report(notice, { source: 'youtube-player', severity: 'warning' }),
  onError: (error) => { errorHandler.report(error, { source: 'youtube-player', severity: 'warning' }); hideVideo(); },
});
const videoManager = new VideoManager({
  player: videoPlayer,
  apiKeyProvider: () => storageManager.getYoutubeApiKey(),
});

const stateLabel = document.querySelector('#state-label');
const stateIndicator = document.querySelector('#state-indicator');
const statusBar = document.querySelector('#status-bar');
const stageContent = document.querySelector('#stage-content');
const textContainer = document.querySelector('#text-container');
const textKicker = document.querySelector('#text-kicker');
const textHeading = document.querySelector('#text-heading');
const textBody = document.querySelector('#text-body');
const errorElement = document.querySelector('#app-error');
const settingsPanelRoot = document.querySelector('#settings-panel');
const settingsBackdrop = document.querySelector('#settings-backdrop');
const settingsTrigger = document.querySelector('#btn-settings');
const mirrorButton = document.querySelector('#btn-mirror');
const settingsClose = document.querySelector('#btn-settings-close');
const micButton = document.querySelector('#btn-mic');
const micMuteButton = document.querySelector('#btn-mic-mute');
const aiMuteButton = document.querySelector('#btn-ai-mute');
const stopButton = document.querySelector('#btn-stop');
const orbCanvas = document.querySelector('#orb-canvas');
const orbContainer = document.querySelector('#orb-container');
const videoLayer = document.querySelector('#video-layer');
const videoTitle = document.querySelector('#video-title');
const subtitleText = document.querySelector('#subtitle-text');
const videoPauseButton = document.querySelector('#btn-video-pause');
const videoResumeButton = document.querySelector('#btn-video-resume');
const videoFullscreenButton = document.querySelector('#btn-video-fullscreen');
const videoCloseButton = document.querySelector('#btn-video-close');

const STATE_LABELS = {
  idle: 'Chờ', connecting: 'Đang kết nối', listening: 'Đang nghe',
  thinking: 'Đang xử lý', speaking: 'Đang nói', error: 'Lỗi',
};
const STATE_PROGRESS = { idle: 0, connecting: 24, listening: 38, thinking: 68, speaking: 100, error: 100 };

let micStartPromise = null;
let resetOutputOnNextFragment = true;
function showOrb(){
  orbContainer.classList.remove('hidden');
  textContainer.classList.remove('visible');
  const covered = settingsPanelRoot?.classList.contains('active') || videoLayer?.classList.contains('active');
  orbEngine.setVisible(!covered);
}
function renderPresentationText(body){
  // index.html có placeholder text node. Xóa đúng một lần để nó không bị dính vào transcript streaming.
  if(textBody.dataset.streamingReady!=='true'){textBody.replaceChildren();textBody.dataset.streamingReady='true';}
  const lines=textSyncEngine.formatLines(body,4);
  const visibleLines=lines.slice(-7);
  while(textBody.children.length>visibleLines.length)textBody.lastElementChild.remove();
  visibleLines.forEach((line,index)=>{
    let el=textBody.children[index];
    if(!el){el=document.createElement('span');el.className='speech-line';el.style.setProperty('--i',String(index));textBody.append(el);}
    if(el.textContent!==line)el.textContent=line;
  });
  textBody.className='body';
  if(visibleLines.length<=2)textBody.classList.add('large');
  else if(visibleLines.length>=6)textBody.classList.add('small');
}
function showText(kicker, heading, body){
  orbContainer.classList.add('hidden');
  orbEngine.setVisible(false);
  textKicker.textContent = kicker || 'AI LIVE HOLOGRAM';
  textHeading.textContent = heading || 'Hologram';
  renderPresentationText(body || '');
  textContainer.classList.add('visible');
}
function applyMotionPreference(disabled=storageManager.getDisableTransitions()) {
  document.documentElement.classList.toggle('no-transitions', Boolean(disabled));
}
function applyMirror(mode=storageManager.getMirrorMode()){
  const transforms={none:'none',vertical:'scaleX(-1)',horizontal:'scaleY(-1)',both:'scale(-1,-1)'};
  stageContent.style.transform=transforms[mode]||'none';
}
function buildSystemInstruction(){
  return instructionManager.build({
    personality: storageManager.getPersonality(),
    extra: storageManager.getAiInstructions(),
  });
}

function showVideo(video) {
  videoTitle.textContent = video?.title || '';
  orbEngine.setVisible(false);
  orbContainer.classList.add('render-paused');
  videoLayer.classList.add('active');
  videoLayer.setAttribute('aria-hidden', 'false');
  orbContainer.classList.add('hidden');
  textContainer.classList.remove('visible');
  appState.update({ videoActive: true });
}

function hideVideo() {
  videoOperationEpoch += 1;
  videoManager.close();
  videoLayer.classList.remove('active');
  videoLayer.setAttribute('aria-hidden', 'true');
  videoTitle.textContent = '';
  subtitleText.textContent = '';
  appState.update({ videoActive: false });
  orbContainer.classList.remove('render-paused');
  showOrb();
}

async function searchAndPlayVideo(query) {
  if (!query) return null;
  const epoch = ++videoOperationEpoch;
  videoTitle.textContent = `Đang tìm: ${query}`;
  try {
    // Chỉ lần tìm/phát mới nhất được phép mở DOM; Stop hủy cả search và player đang tải.
    const video = await videoManager.search(query);
    if (epoch !== videoOperationEpoch) return null;
    if (!video) {
      errorHandler.report(new Error('Không tìm thấy video phù hợp có thể phát nhúng.'), { source: 'video-search', severity: 'warning', context: { query } });
      return null;
    }
    showVideo(video);
    const played = await videoManager.play(video);
    if (epoch !== videoOperationEpoch || !played) return null;
    subtitleText.textContent = '';
    return video;
  } catch (error) {
    if (epoch !== videoOperationEpoch) return null; // lỗi cũ không được đóng video mới
    if (error?.name !== 'AbortError') errorHandler.report(error, { source: 'video-search', severity: 'warning', context: { query } });
    if (videoLayer.classList.contains('active')) hideVideo();
    return null;
  }
}

function armLocalCommandSuppression(command) {
  if (!command) return;
  suppressAssistantTurn = true;
  audioPlaybackQueue.cancel();
  orbEngine.setOutputLevel(0);
  window.clearTimeout(commandSuppressionTimer);
  commandSuppressionTimer = window.setTimeout(() => {
    suppressAssistantTurn = false;
  }, COMMAND_SUPPRESSION_TTL_MS);
  if (appState.get('micActive') && stateMachine.current !== 'listening' && stateMachine.canTransition('listening')) {
    appController.transitionTo('listening', { source: 'local-command', command: command.type });
  }
}

function resetCommandTranscriptState() {
  accumulatedInputTranscript = '';
  textSyncEngine.resetInput();
  commandTextSyncEngine.resetInput();
  videoCommandScheduler.cancel();
}

function clearCommandTurnState({ preserveRecentCommand = false } = {}) {
  resetCommandTranscriptState();
  suppressAssistantTurn = false;
  if (!preserveRecentCommand) lastExecutedCommand = { key: '', at: 0, promise: null };
  window.clearTimeout(commandSuppressionTimer);
}

async function executeLocalCommand(command) {
  if (!command) return false;
  const key = `${command.type}:${command.query || ''}`;
  const now = performance.now();
  // A duplicate tool call must receive the REAL previous result, never an invented success.
  if (key === lastExecutedCommand.key && now - lastExecutedCommand.at < 1400) {
    return lastExecutedCommand.promise;
  }
  const operation = (async () => {
    armLocalCommandSuppression(command);
    switch (command.type) {
      case 'video.stop':
        videoCommandScheduler.cancel();
        hideVideo();
        return true;
      case 'video.pause':
        videoManager.pause();
        return true;
      case 'video.resume':
        videoManager.resume();
        return true;
      case 'video.play': {
        showOrb();
        const video = await searchAndPlayVideo(command.query);
        return Boolean(video);
      }
      default:
        return false;
    }
  })();
  lastExecutedCommand = { key, at: now, promise: operation };
  return operation;
}

function scheduleVideoPlay(command) {
  if (!command || command.type !== 'video.play') return false;
  // Chặn AI ngay khi đã nhận diện intent; chỉ query search mới chờ thêm fragment.
  armLocalCommandSuppression(command);
  return videoCommandScheduler.schedule(command);
}

function commandFromLiveToolCall(functionCall) {
  const name = String(functionCall?.name || '');
  const args = functionCall?.args && typeof functionCall.args === 'object' ? functionCall.args : {};
  if (name === 'open_video') {
    const query = String(args.query || '').trim();
    return query ? { type: 'video.play', query, text: `tool:${name}` } : null;
  }
  if (name === 'stop_video') return { type: 'video.stop', text: `tool:${name}` };
  if (name === 'pause_video') return { type: 'video.pause', text: `tool:${name}` };
  if (name === 'resume_video') return { type: 'video.resume', text: `tool:${name}` };
  return null;
}

async function handleLiveToolCalls(functionCalls) {
  const responses = [];
  for (const functionCall of functionCalls || []) {
    if (cancelledToolCallIds.has(functionCall?.id)) continue;
    const command = commandFromLiveToolCall(functionCall);
    if (!command) {
      responses.push({ id: functionCall?.id, name: functionCall?.name || 'unknown', response: { ok: false, error: 'Unsupported tool call.' } });
      continue;
    }

    // Tool call là đường dự phòng khi transcript đến muộn/không ổn định.
    // Dùng cùng executeLocalCommand để local path và tool path không phân kỳ.
    if (command.type === 'video.play') videoCommandScheduler.cancel();
    armLocalCommandSuppression(command);
    let ok = false;
    try {
      ok = await executeLocalCommand(command);
    } catch (error) {
      errorHandler.report(error, { source: 'live-tool', severity: 'warning', context: { tool: functionCall?.name } });
    }
    if (cancelledToolCallIds.has(functionCall?.id)) continue;
    responses.push({
      id: functionCall?.id,
      name: functionCall?.name,
      response: { ok: Boolean(ok), action: command.type, query: command.query || '' },
    });
  }
  if (responses.length) liveSessionManager.sendToolResponse(responses.filter((item) => !cancelledToolCallIds.has(item.id)));
}

function openSettings() {
  window.clearTimeout(settingsBackdropHideTimer);
  void refreshDevices();
  orbContainer.classList.add('render-paused');
  orbEngine.setVisible(false);
  settingsPanelRoot.classList.add('active');
  settingsPanelRoot.setAttribute('aria-hidden', 'false');
  settingsBackdrop.hidden = false;
  requestAnimationFrame(() => settingsBackdrop.classList.add('active'));
  settingsTrigger.setAttribute('aria-expanded', 'true');
}

function closeSettings() {
  settingsPanelRoot.classList.remove('active');
  settingsPanelRoot.setAttribute('aria-hidden', 'true');
  settingsBackdrop.classList.remove('active');
  window.clearTimeout(settingsBackdropHideTimer);
  if (storageManager.getDisableTransitions()) settingsBackdrop.hidden = true;
  else settingsBackdropHideTimer = window.setTimeout(() => { if (!settingsPanelRoot.classList.contains('active')) settingsBackdrop.hidden = true; }, 220);
  settingsTrigger.setAttribute('aria-expanded', 'false');
  orbContainer.classList.remove('render-paused');
  if (!videoLayer.classList.contains('active') && !textContainer.classList.contains('visible') && !settingsPanelRoot.classList.contains('active')) orbEngine.setVisible(true);
}

async function refreshDevices(){
  try{
    const devices=await audioEngine.listDevices();
    settingsPanel?.setDevices(devices,{inputDeviceId:storageManager.getInputDeviceId(),outputDeviceId:storageManager.getOutputDeviceId()});
    const supportsSink=typeof audioEngine.context?.setSinkId==='function' || typeof (globalThis.AudioContext||globalThis.webkitAudioContext)?.prototype?.setSinkId==='function';
    settingsPanel?.setOutputDeviceSupported(supportsSink);
    return devices;
  }catch(error){
    errorHandler.report(error,{source:'audio-devices',severity:'warning'});
    return {inputs:[],outputs:[]};
  }
}

function selectedLiveModel() {
  const preferred = storageManager.getSelectedModel();
  return modelManager.resolveLiveSelection(preferred);
}

async function ensureLiveConnected() {
  if (liveSessionManager.connected) return true;
  const apiKey = storageManager.getGeminiApiKey();
  if (!apiKey) throw new Error('Chưa nhập Gemini API Key. Mở Cài đặt để nhập key trước.');
  const selection = selectedLiveModel();
  if (!selection.model) throw new Error(selection.reason || 'Chưa chọn model Live phù hợp.');

  if (stateMachine.current === 'error') appController.transitionTo('idle', { source: 'live-retry' });
  if (stateMachine.current !== 'connecting') appController.transitionTo('connecting', { source: 'live-connect', modelId: selection.model.id });
  await liveSessionManager.connect({
    apiKey,
    model: selection.model.id,
    config: geminiEngine.createLiveConfig({ systemInstruction: buildSystemInstruction(), voiceName: storageManager.getVoiceName() }),
  });
  return liveSessionManager.connected;
}

async function startMicrophone() {
  if (appState.get('micActive')) return true;
  if (micStartPromise) return micStartPromise;
  micStartPromise = (async () => {
    const requestEpoch = ++microphoneRequestEpoch;
    if (!audioEngine.isSupported()) {
      throw new Error('Trình duyệt này thiếu microphone hoặc AudioWorklet. Hãy dùng trình duyệt hiện đại trên HTTPS/localhost.');
    }

    micButton.disabled = true;
    let stream = null;
    try {
      const contextReady = audioEngine.ensureContext();
      const preferredInputDevice = storageManager.getInputDeviceId();
      try {
        stream = await audioEngine.requestMicrophone({ deviceId: preferredInputDevice });
      } catch (deviceError) {
        if (!preferredInputDevice || !/NotFoundError|OverconstrainedError|device/i.test(String(deviceError?.name || deviceError?.message || deviceError))) throw deviceError;
        storageManager.setInputDeviceId('');
        stream = await audioEngine.requestMicrophone();
        errorHandler.report(new Error('Thiết bị microphone đã chọn không còn khả dụng; đã chuyển về microphone mặc định.'), { source: 'microphone-device', severity: 'warning' });
      }
      await contextReady;
      if (requestEpoch !== microphoneRequestEpoch) { stream.getTracks().forEach((track) => track.stop()); stream = null; return false; }
      const preferredOutputDevice = storageManager.getOutputDeviceId();
      if (preferredOutputDevice) { try { await audioEngine.setOutputDevice(preferredOutputDevice); } catch { /* dùng loa mặc định */ } }
      const connected = await ensureLiveConnected();
      if (requestEpoch !== microphoneRequestEpoch) { stream.getTracks().forEach((track) => track.stop()); stream = null; return false; }
      if (!connected) throw new Error('Gemini Live chưa mở kết nối thành công.');

      await audioEngine.startCapture(stream, (pcmBuffer) => {
        orbEngine.setInputLevel(rmsFromPcm16Buffer(pcmBuffer));
        if (!appState.get('micActive') || appState.get('micMuted') || !liveSessionManager.connected) return;
        try {
          liveSessionManager.sendRealtimeInput({
            audio: { data: arrayBufferToBase64(pcmBuffer), mimeType: `audio/pcm;rate=${AUDIO_INPUT_RATE}` },
          });
        } catch (error) {
          errorHandler.report(error, { source: 'audio-send', severity: 'warning' });
        }
      });
      stream = null;
      if (requestEpoch !== microphoneRequestEpoch) { audioEngine.stopCapture(); return false; }
      appState.update({ micActive: true, micMuted: false });
      micButton.setAttribute('aria-pressed', 'true');
      micButton.classList.add('active');
      micButton.setAttribute('aria-label', 'Dừng microphone');
      micMuteButton.disabled = false;
      micMuteButton.setAttribute('aria-pressed', 'false');
      micMuteButton.classList.remove('active');
      appController.transitionTo('listening', { source: 'microphone-started' });
      showOrb();
      await refreshDevices();
      if (requestEpoch !== microphoneRequestEpoch) return false;
      const track = audioEngine.mediaStream?.getAudioTracks?.()[0];
      track?.addEventListener?.('ended', () => {
        if (!appState.get('micActive')) return;
        stopMicrophone({ notifyStreamEnd: true, closeLive: true });
        errorHandler.report(new Error('Microphone đã bị ngắt khỏi thiết bị.'), { source: 'microphone-device', severity: 'warning' });
      }, { once: true });
      void orientationManager.lockLandscape();
      return true;
    } catch (error) {
      if (requestEpoch !== microphoneRequestEpoch) { if (stream) stream.getTracks().forEach((track) => track.stop()); return false; }
      if (stream) stream.getTracks().forEach((track) => track.stop());
      audioEngine.stopCapture();
      appState.update({ micActive: false, micMuted: false });
      micMuteButton.disabled = true;
      if (stateMachine.current !== 'error') appController.transitionTo('error', { source: 'microphone-start-failed' });
      errorHandler.report(error, { source: 'microphone-start', fatal: true });
      return false;
    } finally {
      micButton.disabled = false;
    }
  })();
  try { return await micStartPromise; }
  finally { micStartPromise = null; }
}

function stopMicrophone({ notifyStreamEnd = true, closeLive = false } = {}) {
  microphoneRequestEpoch += 1;
  cancelLiveReconnect();
  clearCommandTurnState();
  audioEngine.stopCapture();
  if (notifyStreamEnd) { try { liveSessionManager.sendAudioStreamEnd(); } catch (error) { errorHandler.report(error, { source: 'audio-stream-end', severity: 'warning' }); } }
  if (closeLive && liveSessionManager.connected) liveSessionManager.close({ reason: 'microphone-stopped' });
  appState.update({ micActive: false, micMuted: false });
  micButton.setAttribute('aria-pressed', 'false');
  micButton.classList.remove('active');
  micButton.setAttribute('aria-label', 'Bắt đầu microphone');
  micMuteButton.disabled = true;
  micMuteButton.setAttribute('aria-pressed', 'false');
  micMuteButton.classList.remove('active');
  if (stateMachine.current !== 'error' && !audioPlaybackQueue.isPlaying) {
    appController.transitionTo('idle', { source: 'microphone-stopped' });
  }
}

function toggleMicrophoneMute() {
  if (!appState.get('micActive')) return false;
  const muted = audioEngine.toggleMuted();
  appState.update({ micMuted: muted });
  micMuteButton.setAttribute('aria-pressed', String(muted));
  micMuteButton.classList.toggle('active', muted);
  micMuteButton.setAttribute('aria-label', muted ? 'Bật lại tiếng microphone' : 'Tạm tắt tiếng microphone');
  return muted;
}

function toggleAiMute() {
  const muted = audioPlaybackQueue.toggleMuted();
  storageManager.setAiVoiceMuted(muted);
  appState.update({ audioMuted: muted });
  aiMuteButton.setAttribute('aria-pressed', String(muted));
  aiMuteButton.classList.toggle('active', muted);
  aiMuteButton.setAttribute('aria-label', muted ? 'Bật lại giọng AI' : 'Tắt tiếng AI');
  return muted;
}

async function emergencyStop() {
  clearCommandTurnState();
  stopMicrophone({ notifyStreamEnd: true });
  audioPlaybackQueue.cancel();
  liveSessionManager.close({ reason: 'emergency-stop' });
  appState.update({ connected: false });
  if (stateMachine.current === 'error') appController.transitionTo('idle', { source: 'emergency-stop' });
  else if (stateMachine.current !== 'idle') appController.transitionTo('idle', { source: 'emergency-stop' });
  hideVideo();
  showOrb();
}

const settingsPanel = new SettingsPanel({
  root: settingsPanelRoot,
  onDiscover: async (apiKey) => {
    settingsPanel.setBusy(true);
    settingsPanel.setMessage('Đang tải catalog Gemini…');
    storageManager.setGeminiApiKey(apiKey);
    storageManager.setYoutubeApiKey(settingsPanel.getYoutubeApiKey());
    try {
      const catalog = await modelManager.discover({ apiKey });
      const preferred = storageManager.getSelectedModel();
      const selection = modelManager.resolveLiveSelection(preferred);
      if (selection.model) {
        storageManager.setSelectedModel(selection.model.id);
        appState.update({ selectedModel: selection.model.id });
      }
      appState.update({
        modelCatalogLoaded: true,
        modelCount: catalog.all.length,
        liveModelCount: catalog.live.length,
      });
      settingsPanel.renderCatalog(catalog, selection.model?.id || '');
      settingsPanel.setSelectionSummary(selection);
      settingsPanel.setMessage(`Đã tải ${catalog.all.length} model; ${catalog.live.length} Live candidate.`, 'success');
    } catch (error) {
      const normalized = errorHandler.report(error, { source: 'model-discovery', severity: 'warning' });
      settingsPanel.setMessage(normalized.message, 'error');
    } finally {
      settingsPanel.setBusy(false);
    }
  },
  onSelect: (modelId) => {
    if (appState.get('micActive') || micStartPromise) stopMicrophone({ notifyStreamEnd: true });
    audioPlaybackQueue.cancel();
    if (liveSessionManager.connected) liveSessionManager.close({ reason: 'model-changed' });
    storageManager.setSelectedModel(modelId);
    appState.update({ selectedModel: modelId, connected: false });
    const catalog = modelManager.getCatalog();
    const selection = modelManager.resolveLiveSelection(modelId);
    settingsPanel.renderCatalog(catalog, modelId);
    settingsPanel.setSelectionSummary(selection);
    settingsPanel.setLiveConnection({ status: 'idle', message: 'Model đã đổi; cần xác minh Live lại.' });
    settingsPanel.setMessage(`Đã chọn ${modelId}.`, 'success');
  },
  onVerifyLive: async (apiKey) => {
    storageManager.setGeminiApiKey(apiKey);
    storageManager.setYoutubeApiKey(settingsPanel.getYoutubeApiKey());
    const selection = selectedLiveModel();
    if (!selection.model) {
      settingsPanel.setLiveConnection({ status: 'error', message: selection.reason });
      return;
    }

    try {
      if (stateMachine.current === 'error') appController.transitionTo('idle', { source: 'live-probe-retry' });
      appController.transitionTo('connecting', { source: 'live-probe', modelId: selection.model.id });
      settingsPanel.setLiveConnection({ status: 'connecting', message: `Đang mở Live session với ${selection.model.id}…` });
      await liveSessionManager.connect({
        apiKey,
        model: selection.model.id,
        config: geminiEngine.createLiveConfig({ systemInstruction: buildSystemInstruction(), voiceName: storageManager.getVoiceName() }),
      });
    } catch (error) {
      const normalized = errorHandler.report(error, { source: 'live-connect', modelId: selection.model.id });
      settingsPanel.setLiveConnection({ status: 'error', message: normalized.message });
    }
  },
  onCloseLive: () => {
    if (appState.get('micActive') || micStartPromise) stopMicrophone({ notifyStreamEnd: true });
    audioPlaybackQueue.cancel();
    liveSessionManager.close({ reason: 'user' });
  },
  onOutputDeviceChange: async (deviceId) => {
    storageManager.setOutputDeviceId(deviceId);
    try {
      const applied = await audioEngine.setOutputDevice(deviceId);
      if (!applied) settingsPanel.setMessage('Trình duyệt chưa hỗ trợ đổi loa; vẫn dùng thiết bị mặc định.', 'info');
    } catch (error) {
      errorHandler.report(error, { source: 'audio-output-device', severity: 'warning' });
    }
  },
  onSavePreferences: (preferences) => {
    const aiConfigChanged = preferences.personality !== storageManager.getPersonality()
      || preferences.voiceName !== storageManager.getVoiceName()
      || preferences.aiInstructions !== storageManager.getAiInstructions();
    storageManager.setGeminiApiKey(preferences.geminiApiKey);
    storageManager.setYoutubeApiKey(preferences.youtubeApiKey);
    storageManager.setPersonality(preferences.personality);
    storageManager.setVoiceName(preferences.voiceName);
    storageManager.setMirrorMode(preferences.mirrorMode);
    storageManager.setAiInstructions(preferences.aiInstructions);
    storageManager.setInputDeviceId(preferences.inputDeviceId);
    storageManager.setOutputDeviceId(preferences.outputDeviceId);
    storageManager.setAiVoiceVolume(preferences.aiVoiceVolume);
    storageManager.setDisableTransitions(preferences.disableTransitions);
    applyMotionPreference(preferences.disableTransitions);
    audioPlaybackQueue.setVolume(preferences.aiVoiceVolume);
    applyMirror(preferences.mirrorMode);
    if (aiConfigChanged) {
      if (appState.get('micActive') || micStartPromise) stopMicrophone({ notifyStreamEnd: true });
      audioPlaybackQueue.cancel();
      if (liveSessionManager.connected) liveSessionManager.close({ reason: 'preferences-changed' });
      settingsPanel.setLiveConnection({ status: 'idle', message: 'Đã lưu. Cấu hình AI mới áp dụng ở kết nối Live tiếp theo.' });
    }
    if (audioEngine.context) void audioEngine.setOutputDevice(preferences.outputDeviceId).catch((error)=>errorHandler.report(error,{source:'audio-output-device',severity:'warning'}));
    settingsPanel.setMessage('Đã lưu cài đặt.', 'success');
  },
});

settingsPanel.setApiKey(storageManager.getGeminiApiKey());
settingsPanel.setYoutubeApiKey(storageManager.getYoutubeApiKey());
settingsPanel.setPreferences({
  personality: storageManager.getPersonality(), voiceName: storageManager.getVoiceName(), mirrorMode: storageManager.getMirrorMode(),
  aiInstructions: storageManager.getAiInstructions(), inputDeviceId: storageManager.getInputDeviceId(), outputDeviceId: storageManager.getOutputDeviceId(),
  aiVoiceVolume: storageManager.getAiVoiceVolume(), disableTransitions: storageManager.getDisableTransitions(),
});
audioPlaybackQueue.setVolume(storageManager.getAiVoiceVolume());
audioPlaybackQueue.setMuted(storageManager.getAiVoiceMuted());
aiMuteButton.setAttribute('aria-pressed', String(storageManager.getAiVoiceMuted()));
aiMuteButton.classList.toggle('active', storageManager.getAiVoiceMuted());
applyMirror();
applyMotionPreference();
settingsPanel.setLiveConnection();
appState.update({ selectedModel: storageManager.getSelectedModel() || null, mirrorMode: storageManager.getMirrorMode(), audioMuted: storageManager.getAiVoiceMuted() });

settingsTrigger.addEventListener('click', openSettings);
mirrorButton.addEventListener('click', () => { const modes=['none','vertical','horizontal','both']; const next=modes[(modes.indexOf(storageManager.getMirrorMode())+1)%modes.length]; storageManager.setMirrorMode(next); settingsPanel.setPreferences({personality:storageManager.getPersonality(),voiceName:storageManager.getVoiceName(),mirrorMode:next,aiInstructions:storageManager.getAiInstructions(),inputDeviceId:storageManager.getInputDeviceId(),outputDeviceId:storageManager.getOutputDeviceId(),aiVoiceVolume:storageManager.getAiVoiceVolume(),disableTransitions:storageManager.getDisableTransitions()}); applyMirror(next); });
settingsClose.addEventListener('click', () => { storageManager.setYoutubeApiKey(settingsPanel.getYoutubeApiKey()); closeSettings(); });
settingsBackdrop.addEventListener('click', () => { storageManager.setYoutubeApiKey(settingsPanel.getYoutubeApiKey()); closeSettings(); });
micButton.addEventListener('click', () => {
  if (appState.get('micActive')) stopMicrophone({ notifyStreamEnd: true, closeLive: true });
  else void startMicrophone();
});
micMuteButton.addEventListener('click', toggleMicrophoneMute);
aiMuteButton.addEventListener('click', toggleAiMute);
stopButton.addEventListener('click', () => void emergencyStop());
videoPauseButton.addEventListener('click', () => videoManager.pause());
videoResumeButton.addEventListener('click', () => videoManager.resume());
videoFullscreenButton.addEventListener('click', () => void videoManager.fullscreen(videoLayer));
videoCloseButton.addEventListener('click', hideVideo);
window.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    if (settingsPanelRoot.classList.contains('active')) closeSettings();
    else if (videoLayer.classList.contains('active')) hideVideo();
    else void emergencyStop();
  }
  if (event.code === 'Space' && !['INPUT','TEXTAREA','SELECT','BUTTON'].includes(document.activeElement?.tagName)) {
    event.preventDefault();
    if (appState.get('micActive')) stopMicrophone({ notifyStreamEnd: true, closeLive: true }); else void startMicrophone();
  }
});

let lastDisplayedErrorTimestamp = '';
let errorHideTimer = null;
appState.subscribe((state) => {
  stateLabel.textContent = STATE_LABELS[state.status] ?? state.status;
  stateIndicator.dataset.state = state.status;
  orbContainer.dataset.state = state.status;
  statusBar.style.width = `${STATE_PROGRESS[state.status] ?? 0}%`;
  orbEngine.setState(state.status);
  settingsPanel.setAudioStatus({ micActive: state.micActive, micMuted: state.micMuted, connected: state.connected, audioMuted: state.audioMuted });
  // lastError remains useful for diagnostics, but a toast must be shown once only.
  if (state.lastError?.timestamp && state.lastError.timestamp !== lastDisplayedErrorTimestamp) {
    lastDisplayedErrorTimestamp = state.lastError.timestamp;
    errorElement.textContent = state.lastError.message;
    errorElement.dataset.severity = state.lastError.severity || 'error';
    errorElement.classList.add('visible');
    window.clearTimeout(errorHideTimer);
    errorHideTimer = window.setTimeout(() => errorElement.classList.remove('visible'), state.lastError.severity === 'warning' ? 4200 : 5600);
  }
});

eventBus.on('live:connected', ({ modelId }) => {
  cancelledToolCallIds.clear();
  cancelLiveReconnect();
  modelManager.setLiveVerification(modelId, 'verified', 'Đã mở Gemini Live session thành công trong runtime.');
  appState.update({ connected: true, selectedModel: modelId });
  if (appState.get('micActive') && stateMachine.canTransition('listening')) {
    appController.transitionTo('listening', { source: 'live-reconnected' });
  } else if (stateMachine.current === 'connecting') {
    appController.transitionTo('idle', { source: 'live-connected' });
  }
  const catalog = modelManager.getCatalog();
  settingsPanel.renderCatalog(catalog, modelId);
  settingsPanel.setSelectionSummary(modelManager.resolveLiveSelection(modelId));
  settingsPanel.setLiveConnection({ status: 'connected', connected: true, message: `Đã xác minh Live: ${modelId}.` });
});

eventBus.on('live:connect-failed', ({ modelId, error }) => {
  clearCommandTurnState();
  appState.update({ connected: false });
  const message = String(error?.message || error || 'Không thể kết nối Gemini Live.');
  const definitelyUnsupported = /model.*(?:not found|not supported|unsupported)|(?:not found|unsupported).*model|404/i.test(message);
  modelManager.setLiveVerification(modelId, definitelyUnsupported ? 'unsupported' : 'unverified', message);
  const catalog = modelManager.getCatalog();
  settingsPanel.renderCatalog(catalog, storageManager.getSelectedModel());
  settingsPanel.setSelectionSummary(modelManager.resolveLiveSelection(storageManager.getSelectedModel()));
});

eventBus.on('live:error', ({ error }) => {
  errorHandler.report(error, { source: 'live-websocket', severity: 'warning' });
});

function cancelLiveReconnect({ resetAttempts = true } = {}) {
  liveReconnectEpoch += 1;
  window.clearTimeout(liveReconnectTimer);
  liveReconnectTimer = null;
  liveReconnectInFlight = false;
  if (resetAttempts) liveReconnectAttempts = 0;
}

function scheduleLiveReconnect() {
  if (!appState.get('micActive') || liveReconnectTimer !== null || liveReconnectInFlight) return;
  if (liveReconnectAttempts >= LIVE_RECONNECT_DELAYS.length) {
    stopMicrophone({ notifyStreamEnd: false, closeLive: true });
    settingsPanel.setLiveConnection({ status: 'error', connected: false, message: 'Không thể nối lại Live sau 3 lần. Nhấn Microphone để thử lại.' });
    return;
  }
  const delay = LIVE_RECONNECT_DELAYS[liveReconnectAttempts];
  const attempt = ++liveReconnectAttempts;
  const epoch = liveReconnectEpoch;
  if (stateMachine.current !== 'connecting' && stateMachine.canTransition('connecting'))
    appController.transitionTo('connecting', { source: 'live-reconnect', attempt });
  settingsPanel.setLiveConnection({ status: 'connecting', connected: false, message: `Live bị ngắt; đang nối lại (${attempt}/${LIVE_RECONNECT_DELAYS.length})…` });
  liveReconnectTimer = window.setTimeout(() => {
    liveReconnectTimer = null;
    if (epoch !== liveReconnectEpoch || !appState.get('micActive')) return;
    liveReconnectInFlight = true;
    void ensureLiveConnected().then((ok) => {
      if (epoch !== liveReconnectEpoch || !appState.get('micActive')) return;
      if (ok) {
        if (stateMachine.current !== 'listening' && stateMachine.canTransition('listening'))
          appController.transitionTo('listening', { source: 'live-reconnected' });
      } else scheduleLiveReconnect();
    }).catch((error) => {
      if (epoch !== liveReconnectEpoch || !appState.get('micActive')) return;
      errorHandler.report(error, { source: 'live-reconnect', severity: 'warning' });
    }).finally(() => {
      if (epoch !== liveReconnectEpoch) return;
      liveReconnectInFlight = false;
      if (appState.get('micActive') && !liveSessionManager.connected) scheduleLiveReconnect();
    });
  }, delay);
}

eventBus.on('live:closed', ({ modelId, manual, code, reason }) => {
  cancelledToolCallIds.clear();
  audioPlaybackQueue.cancel();
  clearCommandTurnState();
  appState.update({ connected: false });
  const detail = reason || (code ? `mã ${code}` : 'đã đóng');

  // Failed connect() must also be retried (not only WebSocket onclose).
  if (!manual && appState.get('micActive')) {
    scheduleLiveReconnect();
    return;
  }
  if (manual) cancelLiveReconnect();

  if (appState.get('micActive')) stopMicrophone({ notifyStreamEnd: false });
  if (stateMachine.current === 'connecting') appController.transitionTo('idle', { source: 'live-closed' });
  settingsPanel.setLiveConnection({
    status: manual ? 'idle' : 'error', connected: false,
    message: `${modelId || 'Live session'}: ${manual ? 'đã đóng' : 'kết nối đã đóng'} (${detail}).`,
  });
});

eventBus.on('live:interrupted', () => {
  audioPlaybackQueue.cancel();
  textSyncEngine.resetOutput();
  if (!suppressAssistantTurn) resetCommandTranscriptState();
  resetOutputOnNextFragment = true;
  orbEngine.setOutputLevel(0);
  if (appState.get('micActive')) appController.transitionTo('listening', { source: 'live-interrupted' });
});

function handleCommandTranscript(text) {
  const merged = commandTextSyncEngine.mergeInput(text);
  accumulatedInputTranscript = merged;
  const context = { videoActive: appState.get('videoActive') };
  const command = commandEngine.recognize(merged, context);
  if (!command) {
    // Interim có thể mới chỉ tới "mở video..."; chặn conversational fallback ngay khi intent media đã rõ.
    if (commandEngine.hasMediaIntent(merged, context)) armLocalCommandSuppression({ type: 'video.intent' });
    return null;
  }
  if (command.type === 'video.play') scheduleVideoPlay(command);
  else void executeLocalCommand(command);
  return command;
}

// Transcript tạm thời chỉ phục vụ command path để giảm latency; không đưa lên presentation.
eventBus.on('live:interim-input-transcript', ({ text }) => {
  handleCommandTranscript(text);
});

eventBus.on('live:input-transcript', ({ text }) => {
  const mergedInput = textSyncEngine.mergeInput(text);
  const command = handleCommandTranscript(text);
  resetOutputOnNextFragment = true;

  if (command) return;
  if (suppressAssistantTurn) return;

  showText('BẠN ĐANG NÓI', 'Nghe', mergedInput);
  if (appState.get('micActive') && stateMachine.current !== 'speaking') {
    appController.transitionTo('thinking', { source: 'input-transcript' });
  }
});

eventBus.on('live:tool-call', ({ functionCalls }) => {
  void handleLiveToolCalls(functionCalls);
});

eventBus.on('live:tool-call-cancelled', ({ ids = [] }) => {
  for (const id of ids) cancelledToolCallIds.add(id);
  videoManager.cancelSearch();
});

eventBus.on('live:output-transcript', ({ text }) => {
  if (suppressAssistantTurn) return;
  if (resetOutputOnNextFragment) {
    textSyncEngine.resetOutput();
    resetOutputOnNextFragment = false;
  }
  const spokenText = textSyncEngine.mergeOutput(text);
  if (!videoLayer.classList.contains('active')) showText('AI HOLOGRAM', 'Hologram', spokenText);
  else subtitleText.textContent = spokenText;
  if (stateMachine.current !== 'speaking') appController.transitionTo('speaking', { source: 'output-transcript' });
});

// Với responseModalities=AUDIO, phần hiển thị phải bám outputAudioTranscription.
// live:text vẫn được giữ trong EventBus cho diagnostics nhưng không đưa lên màn hình,
// tránh lộ metadata/chỉ dẫn phụ không phải nội dung đã nói.
eventBus.on('live:text', () => {});

eventBus.on('live:audio', ({ data, mimeType }) => {
  if (suppressAssistantTurn) return;
  orbEngine.setOutputLevel(rmsFromBase64Pcm16(data));
  if (stateMachine.current !== 'speaking') appController.transitionTo('speaking', { source: 'live-audio' });
  void audioPlaybackQueue.enqueueBase64Pcm(data, { sampleRate: sampleRateFromMimeType(mimeType) })
    .catch((error) => errorHandler.report(error, { source: 'audio-playback', severity: 'warning' }));
});

eventBus.on('live:turn-complete', () => {
  // P0: flush pending local media intent BEFORE clearing its debounce timer/transcript.
  // Keep the recent result for duplicate Gemini function-tool fallback.
  videoCommandScheduler.flush();
  if (!suppressAssistantTurn) audioPlaybackQueue.markTurnFinished();
  clearCommandTurnState({ preserveRecentCommand: true });
  resetOutputOnNextFragment = true;
});

eventBus.on('app:initialized', () => {
  // Startup chỉ dựng visual cốt lõi. AudioContext, AudioWorklet, Gemini SDK,
  // model discovery, device enumeration và YouTube đều lazy-load theo thao tác người dùng.
  orbEngine.init();
  showOrb();
});

const mediaDevices = globalThis.navigator?.mediaDevices;
const handleDeviceChange = () => { if (settingsPanelRoot.classList.contains('active') || appState.get('micActive')) void refreshDevices(); };
mediaDevices?.addEventListener?.('devicechange', handleDeviceChange);

const handleVisibilityChange = () => {
  if (document.hidden) {
    orbEngine.setVisible(false);
    return;
  }
  if (!videoLayer.classList.contains('active') && !textContainer.classList.contains('visible') && !settingsPanelRoot.classList.contains('active')) orbEngine.setVisible(true);
  if (appState.get('micActive')) {
    void audioEngine.resume().then(async () => {
      if (!liveSessionManager.connected) await ensureLiveConnected();
    }).catch((error) => errorHandler.report(error, { source: 'resume', severity: 'warning' }));
  }
};
document.addEventListener('visibilitychange', handleVisibilityChange);

const orientationManager = new OrientationManager({
  overlay: document.querySelector('#orientation-overlay'),
  onPortrait: () => { if (appState.get('micActive')) stopMicrophone({ notifyStreamEnd: true, closeLive: true }); },
});
orientationManager.init();

try { appController.init(); }
catch (error) { errorHandler.report(error, { source: 'bootstrap' }); }

window.addEventListener('pagehide', () => {
  videoCommandScheduler.cancel();
  clearTimeout(commandSuppressionTimer);
  cancelLiveReconnect();
  clearTimeout(settingsBackdropHideTimer);
  clearTimeout(errorHideTimer);
  hideVideo();
  videoManager.dispose();
  orbEngine.dispose();
  orientationManager.dispose();
  mediaDevices?.removeEventListener?.('devicechange', handleDeviceChange);
  document.removeEventListener('visibilitychange', handleVisibilityChange);
  audioPlaybackQueue.dispose();
  void audioEngine.dispose();
  liveSessionManager.dispose();
  appController.dispose();
}, { once: true });

if (import.meta.env.DEV) {
  window.__AI_HOLOGRAM_DEV__ = {
    appState, eventBus, stateMachine, errorHandler, appController,
    modelManager, storageManager, geminiEngine, liveSessionManager,
    audioEngine, audioPlaybackQueue, orbEngine, videoManager,
  };
}
