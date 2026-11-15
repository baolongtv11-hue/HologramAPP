export class VideoPlayer {
  #containerId;#player=null;#apiReady=null;#onEnded;#onError;#onNotice;#host=null;#className='video-player';#playEpoch=0;#playerReady=false;#desiredVideoId=null;#shouldCancel=()=>false;
  constructor({containerId='yt-player',onEnded=()=>{},onError=()=>{},onNotice=()=>{}}={}){
    this.#containerId=containerId;this.#onEnded=onEnded;this.#onError=onError;this.#onNotice=onNotice;
    const container=document.getElementById(containerId);
    this.#host=container?.parentElement||null;
    this.#className=container?.className||'video-player';
  }
  async ensureApi(){
    if(globalThis.YT?.Player)return true;
    if(this.#apiReady)return this.#apiReady;
    this.#apiReady=new Promise((resolve,reject)=>{
      const timeout=window.setTimeout(()=>{this.#apiReady=null;reject(new Error('Không tải được YouTube Player API.'));},15000);
      const previous=window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady=()=>{if(typeof previous==='function')previous();clearTimeout(timeout);resolve(true);};
      if(!document.querySelector('script[data-youtube-iframe-api]')){
        const script=document.createElement('script');script.src='https://www.youtube.com/iframe_api';script.async=true;script.dataset.youtubeIframeApi='true';
        script.onerror=()=>{clearTimeout(timeout);this.#apiReady=null;reject(new Error('Trình duyệt không tải được YouTube Player API.'));};
        document.head.append(script);
      }
    });
    return this.#apiReady;
  }
  #ensureContainer(){
    let container=document.getElementById(this.#containerId);
    if(!container&&this.#host){
      container=document.createElement('div');
      container.id=this.#containerId;
      container.className=this.#className;
      this.#host.prepend(container);
    }
    return container;
  }
  async play({videoId},{isCancelled=()=>false}={}){
    if(!videoId)throw new Error('Video không hợp lệ.');
    const epoch=++this.#playEpoch;
    await this.ensureApi();
    if(epoch!==this.#playEpoch||isCancelled())return false;
    this.#ensureContainer();
    this.#desiredVideoId=videoId;
    this.#shouldCancel=isCancelled;
    // YT.Player exists before its onReady; loadVideoById is not safe until ready.
    if(this.#player){if(this.#playerReady)this.#player.loadVideoById({videoId});return true;}
    const origin=window.location.origin;
    this.#player=new window.YT.Player(this.#containerId,{
      width:'100%',height:'100%',videoId,
      playerVars:{autoplay:1,playsinline:1,controls:1,rel:0,origin,widget_referrer:window.location.href},
      events:{
        onReady:event=>{
          this.#playerReady=true;
          if(!this.#desiredVideoId||this.#shouldCancel())return;
          if(this.#desiredVideoId!==videoId)event.target.loadVideoById({videoId:this.#desiredVideoId});
          else event.target.playVideo();
        },
        onStateChange:event=>{if(event.data===window.YT.PlayerState.ENDED)this.#onEnded();},
        onAutoplayBlocked:()=>this.#onNotice(new Error('Trình duyệt đã chặn tự phát. Hãy nhấn nút phát trên video.')),
        onError:event=>{
          const messages={2:'YouTube nhận video ID/parameter không hợp lệ.',5:'Video không phát được bằng HTML5 player trên trình duyệt này.',100:'Video đã bị xóa hoặc đặt ở chế độ riêng tư.',101:'Chủ sở hữu video không cho phép phát nhúng.',150:'Chủ sở hữu video không cho phép phát nhúng.',153:'YouTube không nhận được HTTP Referer/client identity của trang nhúng.'};
          this.#onError(new Error(messages[event.data]||`YouTube không thể phát video (mã ${event.data}).`));
        },
      },
    });
    return true;
  }
  pause(){try{this.#player?.pauseVideo?.();}catch{}}
  resume(){try{this.#player?.playVideo?.();}catch{}}
  stop(){this.#playEpoch+=1;this.#desiredVideoId=null;try{this.#player?.stopVideo?.();}catch{}}
  close(){this.stop();}
  async fullscreen(element){if(!element?.requestFullscreen)return false;try{await element.requestFullscreen();return true;}catch{return false;}}
  dispose(){
    this.#playEpoch+=1;this.#desiredVideoId=null;this.#playerReady=false;
    try{this.#player?.stopVideo?.();}catch{}
    try{this.#player?.destroy?.();}catch{}
    this.#player=null;
    this.#ensureContainer();
  }
}
