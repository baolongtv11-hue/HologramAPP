const KEYS = Object.freeze({
  geminiApiKey: 'hologram_gemini_key_session',
  selectedModel: 'hologram_selected_model_v3',
  youtubeApiKey: 'hologram_youtube_key_session',
  mirrorMode: 'hologram_mirror_v2',
  personality: 'hologram_personality_v1',
  voiceName: 'hologram_voice_v1',
  aiInstructions: 'hologram_ai_instructions_v1',
  inputDeviceId: 'hologram_input_device_v1',
  outputDeviceId: 'hologram_output_device_v1',
  aiVoiceVolume: 'hologram_voice_volume_v1',
  aiVoiceMuted: 'hologram_voice_muted_v1',
  disableTransitions: 'hologram_disable_transitions_v1',
});

export class StorageManager {
  #session; #local;
  constructor({sessionStorage=globalThis.sessionStorage,localStorage=globalThis.localStorage}={}){this.#session=sessionStorage;this.#local=localStorage;}
  #get(store,key,fallback=''){try{return store?.getItem(key) ?? fallback;}catch{return fallback;}}
  #set(store,key,value){try{const v=String(value??'').trim();if(v)store?.setItem(key,v);else store?.removeItem(key);return true;}catch{return false;}}
  getGeminiApiKey(){return this.#get(this.#session,KEYS.geminiApiKey);} setGeminiApiKey(v){return this.#set(this.#session,KEYS.geminiApiKey,v);}
  getYoutubeApiKey(){return this.#get(this.#session,KEYS.youtubeApiKey);} setYoutubeApiKey(v){return this.#set(this.#session,KEYS.youtubeApiKey,v);}
  getSelectedModel(){return this.#get(this.#local,KEYS.selectedModel);} setSelectedModel(v){return this.#set(this.#local,KEYS.selectedModel,v);}
  getMirrorMode(){const v=this.#get(this.#local,KEYS.mirrorMode,'vertical');return ['none','vertical','horizontal','both'].includes(v)?v:'vertical';} setMirrorMode(v){return this.#set(this.#local,KEYS.mirrorMode,v);}
  getPersonality(){return this.#get(this.#local,KEYS.personality,'teacher');} setPersonality(v){return this.#set(this.#local,KEYS.personality,v);}
  getVoiceName(){return this.#get(this.#local,KEYS.voiceName,'Aoede');} setVoiceName(v){return this.#set(this.#local,KEYS.voiceName,v);}
  getAiInstructions(){return this.#get(this.#local,KEYS.aiInstructions,'');} setAiInstructions(v){return this.#set(this.#local,KEYS.aiInstructions,v);}
  getInputDeviceId(){return this.#get(this.#local,KEYS.inputDeviceId,'');} setInputDeviceId(v){return this.#set(this.#local,KEYS.inputDeviceId,v);}
  getOutputDeviceId(){return this.#get(this.#local,KEYS.outputDeviceId,'');} setOutputDeviceId(v){return this.#set(this.#local,KEYS.outputDeviceId,v);}
  getAiVoiceVolume(){const v=Number(this.#get(this.#local,KEYS.aiVoiceVolume,'1'));return Number.isFinite(v)?Math.min(1,Math.max(0,v)):1;} setAiVoiceVolume(v){return this.#set(this.#local,KEYS.aiVoiceVolume,String(Math.min(1,Math.max(0,Number(v)||0))));}
  getAiVoiceMuted(){return this.#get(this.#local,KEYS.aiVoiceMuted,'false')==='true';} setAiVoiceMuted(v){return this.#set(this.#local,KEYS.aiVoiceMuted,String(Boolean(v)));}
  getDisableTransitions(){return this.#get(this.#local,KEYS.disableTransitions,'false')==='true';} setDisableTransitions(v){return this.#set(this.#local,KEYS.disableTransitions,String(Boolean(v)));}
}
export { KEYS as STORAGE_KEYS };
