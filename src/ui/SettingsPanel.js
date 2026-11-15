function escapeText(value){return String(value??'');}

export class SettingsPanel{
  #root;#onDiscover;#onSelect;#onVerifyLive;#onCloseLive;#onSavePreferences;#onOutputDeviceChange;
  constructor({root,onDiscover,onSelect,onVerifyLive,onCloseLive,onSavePreferences,onOutputDeviceChange}){
    if(!root)throw new Error('SettingsPanel cần root element.');
    this.#root=root;this.#onDiscover=onDiscover;this.#onSelect=onSelect;this.#onVerifyLive=onVerifyLive;this.#onCloseLive=onCloseLive;this.#onSavePreferences=onSavePreferences;this.#onOutputDeviceChange=onOutputDeviceChange;this.#bind();
  }
  setApiKey(v){this.#root.querySelector('[data-gemini-key]').value=v||'';} getApiKey(){return this.#root.querySelector('[data-gemini-key]').value.trim();}
  setYoutubeApiKey(v){this.#root.querySelector('[data-youtube-key]').value=v||'';} getYoutubeApiKey(){return this.#root.querySelector('[data-youtube-key]').value.trim();}
  setPreferences({personality='teacher',voiceName='Aoede',mirrorMode='vertical',aiInstructions='',inputDeviceId='',outputDeviceId='',aiVoiceVolume=1,disableTransitions=false}={}){
    this.#root.querySelector('[data-personality]').value=personality;
    this.#root.querySelector('[data-voice-name]').value=voiceName;
    this.#root.querySelector('[data-mirror-mode]').value=mirrorMode;
    this.#root.querySelector('[data-ai-instructions]').value=aiInstructions;
    this.#root.querySelector('[data-input-device]').value=inputDeviceId;
    this.#root.querySelector('[data-output-device]').value=outputDeviceId;
    this.#root.querySelector('[data-disable-transitions]').checked=Boolean(disableTransitions);
    this.#root.querySelector('[data-ai-volume]').value=String(aiVoiceVolume);
    this.#root.querySelector('[data-volume-value]').textContent=`${Math.round(Number(aiVoiceVolume||0)*100)}%`;
  }
  getPreferences(){return{
    personality:this.#root.querySelector('[data-personality]').value,
    voiceName:this.#root.querySelector('[data-voice-name]').value,
    mirrorMode:this.#root.querySelector('[data-mirror-mode]').value,
    aiInstructions:this.#root.querySelector('[data-ai-instructions]').value.trim(),
    inputDeviceId:this.#root.querySelector('[data-input-device]').value,
    outputDeviceId:this.#root.querySelector('[data-output-device]').value,
    aiVoiceVolume:Number(this.#root.querySelector('[data-ai-volume]').value),
    disableTransitions:this.#root.querySelector('[data-disable-transitions]').checked,
    youtubeApiKey:this.getYoutubeApiKey(),geminiApiKey:this.getApiKey()
  };}
  setDevices({inputs=[],outputs=[]}={},selected={}){
    const input=this.#root.querySelector('[data-input-device]');
    const output=this.#root.querySelector('[data-output-device]');
    const inputOptions=[new Option('Mặc định hệ thống',''),...inputs.map((d,i)=>new Option(d.label||`Microphone ${i+1}`,d.deviceId))];
    const outputOptions=[new Option('Mặc định hệ thống',''),...outputs.map((d,i)=>new Option(d.label||`Loa ${i+1}`,d.deviceId))];
    input.replaceChildren(...inputOptions);output.replaceChildren(...outputOptions);
    input.value=selected.inputDeviceId||'';output.value=selected.outputDeviceId||'';
    if(input.value!==String(selected.inputDeviceId||''))input.value='';
    if(output.value!==String(selected.outputDeviceId||''))output.value='';
  }
  setOutputDeviceSupported(supported){const select=this.#root.querySelector('[data-output-device]');select.disabled=!supported;this.#root.querySelector('[data-output-device-hint]').textContent=supported?'Có thể đổi loa trên trình duyệt này.':'Trình duyệt này chưa hỗ trợ AudioContext.setSinkId(); sẽ dùng loa mặc định.';}
  setAudioStatus({micActive=false,micMuted=false,connected=false,audioMuted=false}={}){
    this.#root.querySelector('[data-mic-status]').textContent=`Micro: ${micActive?(micMuted?'đang mute':'đang thu'):'tắt'}`;
    this.#root.querySelector('[data-live-privacy-status]').textContent=`Gemini Live: ${connected?'đã kết nối':'chưa kết nối'}`;
    this.#root.querySelector('[data-output-status]').textContent=`AI audio: ${audioMuted?'đang mute':'bật'}`;
  }
  setBusy(b){this.#root.querySelector('[data-discover-models]').disabled=Boolean(b);this.#root.dataset.busy=String(Boolean(b));}
  setMessage(message,type='info'){const el=this.#root.querySelector('[data-model-message]');el.textContent=message||'';el.dataset.type=type;}
  renderCatalog(catalog,selectedModelId=''){const live=this.#root.querySelector('[data-live-models]'),text=this.#root.querySelector('[data-text-models]'),other=this.#root.querySelector('[data-other-models]');live.replaceChildren(...catalog.live.map(m=>this.#createModelRow(m,selectedModelId,true)));text.replaceChildren(...catalog.text.map(m=>this.#createModelRow(m,selectedModelId,false)));other.replaceChildren(...catalog.other.map(m=>this.#createModelRow(m,selectedModelId,false)));this.#root.querySelector('[data-live-count]').textContent=String(catalog.live.length);this.#root.querySelector('[data-text-count]').textContent=String(catalog.text.length);this.#root.querySelector('[data-other-count]').textContent=String(catalog.other.length);}
  setLiveConnection({status='idle',message='',connected=false}={}){const verify=this.#root.querySelector('[data-verify-live]'),close=this.#root.querySelector('[data-close-live]'),el=this.#root.querySelector('[data-live-status]');verify.disabled=status==='connecting'||connected;close.disabled=!connected;el.textContent=message||(connected?'Live session đang mở.':'Chưa xác minh runtime.');el.dataset.status=status;}
  setSelectionSummary({model,reason}){const s=this.#root.querySelector('[data-selection-summary]');s.textContent=model?`${model.displayName} · ${model.id} — ${reason}`:(reason||'Chưa có model Live khả dụng.');}
  #createModelRow(model,selectedModelId,selectable){const row=document.createElement('article');row.className='model-row';row.dataset.status=model.live.status;const content=document.createElement('div');content.className='model-row__content';const title=document.createElement('strong');title.textContent=escapeText(model.displayName);const id=document.createElement('code');id.textContent=model.id;const meta=document.createElement('div');meta.className='model-row__meta';const liveLabel=model.live.category==='live'?`Live: ${model.live.status==='verified'?'đã xác minh':model.live.status==='unsupported'?'không hỗ trợ':'chưa xác minh'}`:'Không phải Live candidate';meta.textContent=`${liveLabel} · Text: ${model.text.supported?'có':'không'}`;content.append(title,id,meta);row.append(content);if(selectable&&model.live.status!=='unsupported'){const b=document.createElement('button');b.type='button';b.className='model-select-btn';b.textContent=model.id===selectedModelId?'Đang chọn':'Chọn';b.disabled=model.id===selectedModelId;b.addEventListener('click',()=>this.#onSelect?.(model.id));row.append(b);}row.title=model.live.reason;return row;}
  #bind(){
    this.#root.querySelector('[data-discover-models]').addEventListener('click',()=>this.#onDiscover?.(this.getApiKey()));
    this.#root.querySelector('[data-verify-live]').addEventListener('click',()=>this.#onVerifyLive?.(this.getApiKey()));
    this.#root.querySelector('[data-close-live]').addEventListener('click',()=>this.#onCloseLive?.());
    this.#root.querySelector('[data-save-preferences]').addEventListener('click',()=>this.#onSavePreferences?.(this.getPreferences()));
    this.#root.querySelector('[data-ai-volume]').addEventListener('input',(event)=>{this.#root.querySelector('[data-volume-value]').textContent=`${Math.round(Number(event.target.value)*100)}%`;});
    this.#root.querySelector('[data-output-device]').addEventListener('change',(event)=>this.#onOutputDeviceChange?.(event.target.value));
  }
}
