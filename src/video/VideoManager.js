export function extractVideoQuery(transcript){
  const text=String(transcript||'').replace(/[.,!?;:]+$/g,'').trim();
  if(!text)return null;
  const patterns=[
    /(?:cho tôi|cho mình|hãy|vui lòng)?\s*(?:mở|phát|tìm|tìm kiếm|xem)\s+(?:cho tôi\s+)?(?:một\s+)?video\s*(?:về|nói về|liên quan đến)?\s+(.+)$/i,
    /(?:cho tôi|cho mình|hãy|vui lòng)?\s*(?:mở|phát|tìm|tìm kiếm|xem)\s+(?:trên\s+)?youtube\s*(?:về|nói về|liên quan đến)?\s+(.+)$/i,
    /^video\s+(?:về|nói về|liên quan đến)\s+(.+)$/i,
  ];
  for(const pattern of patterns){
    const match=text.match(pattern);
    if(match?.[1]){
      const query=match[1].replace(/^(?:chủ đề|nội dung)\s+/i,'').trim();
      if(query.length>=2)return query;
    }
  }
  return null;
}

function youtubeError(data,status){
  const reason=data?.error?.errors?.[0]?.reason;
  const message=data?.error?.message||`YouTube API lỗi HTTP ${status}.`;
  const error=new Error(reason?`${message} (${reason})`:message);
  error.status=status;error.reason=reason||'';
  return error;
}

/**
 * Giữ luồng video gần bản one-file gốc: một request search.list rồi phát.
 * videoEmbeddable/videoSyndicated lọc phần lớn kết quả không phát nhúng; lỗi policy
 * còn lại do IFrame Player xử lý. Tránh request videos.list thứ hai để giảm latency/quota.
 */
export class VideoManager{
  #player;#apiKeyProvider;#searchController=null;#generation=0;
  constructor({player,apiKeyProvider}){
    if(!player||typeof apiKeyProvider!=='function')throw new Error('VideoManager thiếu dependency.');
    this.#player=player;this.#apiKeyProvider=apiKeyProvider;
  }

  async #fetchJson(url,signal){
    const response=await fetch(url,{cache:'no-store',signal});
    const data=await response.json().catch(()=>({}));
    if(!response.ok)throw youtubeError(data,response.status);
    return data;
  }

  #beginSearch(){
    this.#searchController?.abort();
    this.#searchController=new AbortController();
    return {signal:this.#searchController.signal,generation:++this.#generation};
  }

  async search(query){
    const key=String(this.#apiKeyProvider()||'').trim();
    if(!key)throw new Error('Chưa nhập YouTube Data API Key trong Cài đặt.');
    const cleanQuery=String(query||'').trim();
    if(!cleanQuery)throw new Error('Nội dung tìm video đang trống.');

    const {signal,generation}=this.#beginSearch();
    try{
      const params=new URLSearchParams({
        part:'snippet',type:'video',videoEmbeddable:'true',videoSyndicated:'true',safeSearch:'moderate',maxResults:'5',q:cleanQuery,key,
      });
      const data=await this.#fetchJson(`https://www.googleapis.com/youtube/v3/search?${params}`,signal);
      if(generation!==this.#generation)return null;
      const item=(data.items||[]).find(entry=>entry.id?.videoId);
      return item?{videoId:item.id.videoId,title:item.snippet?.title||cleanQuery}:null;
    }finally{
      if(generation===this.#generation)this.#searchController=null;
    }
  }

  async play(video){
    if(!video?.videoId)throw new Error('Video không hợp lệ.');
    const generation=this.#generation;
    const played=await this.#player.play(video,{isCancelled:()=>generation!==this.#generation});
    return generation===this.#generation&&played!==false?video:null;
  }

  async searchAndPlay(query){
    const video=await this.search(query);
    if(!video)return null;
    await this.play(video);
    return video;
  }

  pause(){this.#player.pause();}
  resume(){this.#player.resume();}
  stop(){
    this.#generation+=1;
    this.#searchController?.abort();
    this.#searchController=null;
    this.#player.stop();
  }
  cancelSearch(){
    this.#generation+=1;
    this.#searchController?.abort();
    this.#searchController=null;
  }
  close(){
    // Đóng lớp video bình thường chỉ stop để tái sử dụng YT.Player ở lần mở sau.
    this.stop();
  }
  fullscreen(element){return this.#player.fullscreen(element);}
  dispose(){this.cancelSearch();this.#player.dispose();}
}
