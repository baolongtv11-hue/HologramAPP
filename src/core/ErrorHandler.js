const COMMON_ERRORS = [
  { pattern:/Permission denied|NotAllowedError|denied/i, code:'MIC_PERMISSION_DENIED', message:'Bạn chưa cấp quyền microphone. Hãy cho phép microphone trong trình duyệt rồi thử lại.' },
  { pattern:/NotFoundError|Requested device not found/i, code:'MIC_NOT_FOUND', message:'Không tìm thấy microphone trên thiết bị.' },
  { pattern:/secure context|navigator\.mediaDevices/i, code:'SECURE_CONTEXT_REQUIRED', message:'Microphone cần HTTPS hoặc localhost. Không mở ứng dụng trực tiếp bằng file://.' },
];

function sourceSpecificError(rawMessage,source){
  if(source.startsWith('video')||source.startsWith('youtube')){
    if(/API key|API_KEY|unauthorized|401|403|forbidden/i.test(rawMessage)){
      return {code:'YOUTUBE_AUTH_ERROR',message:'YouTube Data API từ chối yêu cầu. Kiểm tra YouTube API key, API restriction và HTTP referrer của GitHub Pages.'};
    }
    if(/quota|dailyLimitExceeded|rateLimitExceeded/i.test(rawMessage)){
      return {code:'YOUTUBE_QUOTA_ERROR',message:'YouTube Data API đã chạm hạn mức/quota của project.'};
    }
  }
  if(source.startsWith('live')||source.startsWith('model')||source.startsWith('gemini')||source==='microphone-start'||source==='audio-send'){
    if(/API key|API_KEY|unauthorized|401|403/i.test(rawMessage)){
      return {code:'GEMINI_AUTH_ERROR',message:'Gemini từ chối xác thực. Kiểm tra Gemini API key, quyền API và hạn mức trong Google AI Studio.'};
    }
    if(/model|not found|404/i.test(rawMessage)){
      return {code:'MODEL_UNAVAILABLE',message:'Model Gemini được chọn không khả dụng hoặc không tương thích với yêu cầu hiện tại.'};
    }
  }
  return null;
}

export class ErrorHandler {
  #eventBus;#logger;
  constructor({eventBus=null,logger=console}={}){this.#eventBus=eventBus;this.#logger=logger;}
  report(error,details={}){
    const normalized=this.normalize(error,details);
    const logMethod=normalized.severity==='warning'?'warn':'error';
    this.#logger?.[logMethod]?.(`[${normalized.source}] ${normalized.message}`,normalized.cause);
    try{this.#eventBus?.emit('app:error',normalized);}catch(listenerError){this.#logger?.error?.('[ErrorHandler] app:error listener failed',listenerError);}
    return normalized;
  }
  normalize(error,details={}){
    const rawMessage=error instanceof Error?error.message:typeof error==='string'?error:'Đã xảy ra lỗi không xác định.';
    const source=details.source??'application';
    const known=sourceSpecificError(rawMessage,source)??COMMON_ERRORS.find(({pattern})=>pattern.test(rawMessage));
    return Object.freeze({
      code:known?.code??'APP_ERROR',message:known?.message??rawMessage,rawMessage,source,
      severity:details.severity??'error',fatal:Boolean(details.fatal),context:details.context??null,cause:error,timestamp:new Date().toISOString(),
    });
  }
}
