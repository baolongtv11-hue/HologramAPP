const VERTEX_SHADER = `#version 300 es
in vec2 a_position;
out vec2 v_uv;
void main(){
  v_uv = a_position * .5 + .5;
  gl_Position = vec4(a_position, 0.0, 1.0);
}`;

const FRAGMENT_SHADER = `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 outColor;
uniform float u_time;
uniform float u_level;
uniform vec3 u_tint;
uniform float u_quality;

float hash21(vec2 p){
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float noise(vec2 p){
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f*f*(3.0-2.0*f);
  return mix(mix(hash21(i),hash21(i+vec2(1,0)),f.x),
             mix(hash21(i+vec2(0,1)),hash21(i+vec2(1,1)),f.x),f.y);
}

float fbm(vec2 p){
  float v=0.0;
  float a=.5;
  mat2 r=mat2(.80,.60,-.60,.80);
  for(int i=0;i<4;i++){
    if(float(i)>=u_quality) break;
    v += a*noise(p);
    p = r*p*2.05 + 13.7;
    a *= .5;
  }
  return v;
}

void main(){
  vec2 p = v_uv - .5;
  p.x *= 1.0;
  float d = length(p);
  float level = clamp(u_level,0.0,1.0);
  float energy = pow(level, .46);
  float breath = sin(u_time*1.35)*.007;
  float baseR = .235 + breath + energy*.072;

  float ang = atan(p.y,p.x);
  float turbulence = (fbm(vec2(ang*1.55 + u_time*.14, d*8.0-u_time*.18))-.5);
  float detailNoise = fbm(p*8.0 + vec2(u_time*.05,-u_time*.04));
  float membraneR = baseR + turbulence*(.010 + energy*.025);

  float core = 1.0-smoothstep(membraneR, membraneR+.095, d);
  float inner = 1.0-smoothstep(membraneR*.67, membraneR*.94, d);
  float rim = 1.0-smoothstep(.006+.012*energy,.020+.020*energy,abs(d-membraneR));
  float ring2 = 1.0-smoothstep(.004,.016,abs(d-(membraneR*.72 + sin(ang*5.0+u_time*1.2)*.006)));
  float ring3 = 1.0-smoothstep(.004,.014,abs(d-(membraneR*1.20 + sin(ang*3.0-u_time*.8)*.007)));

  float halo = exp(-10.0*max(0.0,d-membraneR))*(.34+energy*.92);
  float outerHalo = exp(-6.2*max(0.0,d-membraneR*1.15))*(.055+energy*.25);
  float shimmer = .72 + .28*sin(u_time*3.4 + ang*4.0 + detailNoise*5.0);

  vec3 gold = vec3(.851,.722,.451);
  vec3 ivory = vec3(.965,.906,.741);
  vec3 color = mix(u_tint,gold,.22+energy*.30);
  color = mix(color,ivory,inner*(.12+energy*.15));

  float alpha = core*(.18+energy*.30) + rim*(.42+energy*.40) + ring2*.15 + ring3*.10 + halo*shimmer + outerHalo;
  vec3 rgb = color*(core*.25 + rim*.78 + ring2*.34 + ring3*.22 + halo*.92 + outerHalo*.38);

  // subtle deterministic light filaments; audio controls their visibility
  float filaments = pow(max(0.0, sin(ang*9.0 + u_time*1.8 + detailNoise*4.0)), 8.0)
                  * smoothstep(membraneR*.35,membraneR*.95,d)
                  * (1.0-smoothstep(membraneR*.98,membraneR*1.08,d));
  rgb += mix(gold,ivory,.45)*filaments*(.03+energy*.34);
  alpha += filaments*(.03+energy*.22);

  outColor = vec4(rgb, clamp(alpha,0.0,.98));
}`;

const STATE_TINTS={
  idle:[.063,.725,.506],
  connecting:[.851,.722,.451],
  listening:[.31,.66,.98],
  thinking:[.851,.722,.451],
  speaking:[.98,.64,.12],
  error:[.957,.247,.369],
};

export class OrbEngine{
  #canvas;#gl=null;#ctx=null;#program=null;#buffer=null;#uniforms=null;#frameId=0;#resizeHandler;
  #startedAt=performance.now();#state='idle';#inputLevel=0;#outputLevel=0;#smoothedLevel=0;#disposed=false;
  #visible=true;#running=false;#lastFrameTs=0;#lowPower=false;

  constructor({canvas}){
    if(!canvas)throw new Error('OrbEngine cần canvas.');
    this.#canvas=canvas;
    this.#resizeHandler=()=>this.resize();
    this.#lowPower=Boolean(globalThis.matchMedia?.('(pointer: coarse)').matches && Math.min(globalThis.innerWidth||9999,globalThis.innerHeight||9999)<1000);
  }

  init(){
    if(this.#disposed)return false;
    // Mobile/coarse pointer ưu tiên Canvas2D: ổn định hơn shader FBM trên GPU tầm trung.
    // Desktop vẫn dùng WebGL2 khi khả dụng.
    this.#gl=this.#lowPower?null:this.#canvas.getContext('webgl2',{alpha:true,antialias:true,premultipliedAlpha:true,powerPreference:'high-performance'});
    if(this.#gl){
      try{this.#initWebGL();}
      catch(error){console.warn('WebGL2 orb fallback to Canvas2D:',error);this.#gl=null;}
    }
    if(!this.#gl)this.#ctx=this.#canvas.getContext('2d',{alpha:true});
    this.resize();
    window.addEventListener('resize',this.#resizeHandler,{passive:true});
    this.#startLoop();
    return true;
  }

  get renderer(){return this.#gl?'webgl2':'canvas2d';}
  setState(state){this.#state=STATE_TINTS[state]?state:'idle';if(this.#visible)this.#startLoop();}
  setInputLevel(value){this.#inputLevel=this.#normalizeAudio(value);if(this.#visible)this.#startLoop();}
  setOutputLevel(value){this.#outputLevel=this.#normalizeAudio(value);if(this.#visible)this.#startLoop();}
  setVisible(visible){
    this.#visible=Boolean(visible);
    if(this.#visible)this.#startLoop();
    else this.#stopLoop();
  }

  resize(){
    const rect=this.#canvas.getBoundingClientRect();
    const cssW=Math.max(1,rect.width||560),cssH=Math.max(1,rect.height||560);
    // Giới hạn DPR để shader không render hàng triệu pixel không cần thiết trên mobile/4K.
    const dpr=Math.min(window.devicePixelRatio||1,this.#lowPower?1.3:1.7);
    const width=Math.round(cssW*dpr),height=Math.round(cssH*dpr);
    if(this.#canvas.width!==width)this.#canvas.width=width;
    if(this.#canvas.height!==height)this.#canvas.height=height;
    if(this.#gl)this.#gl.viewport(0,0,width,height);
    if(this.#ctx)this.#ctx.setTransform(dpr,0,0,dpr,0,0);
  }

  dispose(){
    this.#disposed=true;this.#stopLoop();
    window.removeEventListener('resize',this.#resizeHandler);
    if(this.#gl&&this.#buffer)this.#gl.deleteBuffer(this.#buffer);
    if(this.#gl&&this.#program)this.#gl.deleteProgram(this.#program);
    this.#buffer=null;this.#program=null;this.#uniforms=null;this.#gl=null;this.#ctx=null;
  }

  #startLoop(){
    if(this.#disposed||!this.#visible||this.#running)return;
    this.#running=true;
    this.#frameId=requestAnimationFrame(this.#loop);
  }
  #stopLoop(){
    if(this.#frameId)cancelAnimationFrame(this.#frameId);
    this.#frameId=0;this.#running=false;this.#lastFrameTs=0;
  }

  #loop=(timestamp)=>{
    if(this.#disposed||!this.#visible||document.hidden){this.#running=false;this.#frameId=0;return;}
    const target=Math.max(this.#inputLevel,this.#outputLevel);
    const attack=target>this.#smoothedLevel?.52:.14;
    this.#smoothedLevel+=(target-this.#smoothedLevel)*attack;
    this.#inputLevel*=.82;this.#outputLevel*=.86;

    // Idle chỉ cần ~30 FPS; trạng thái hoạt động/audio giữ 60 FPS.
    const active=this.#state!=='idle'||this.#smoothedLevel>.02;
    const activeFps=this.#lowPower?45:60;
    const idleFps=this.#lowPower?20:30;
    const frameInterval=1000/(active?activeFps:idleFps);
    if(!this.#lastFrameTs||timestamp-this.#lastFrameTs>=frameInterval){
      this.#lastFrameTs=timestamp;
      const time=(performance.now()-this.#startedAt)/1000;
      if(this.#gl)this.#drawWebGL(time);else this.#drawCanvas(time);
    }
    this.#frameId=requestAnimationFrame(this.#loop);
  };

  #normalizeAudio(value){
    const rms=Number(value);
    if(!Number.isFinite(rms)||rms<=.003)return 0;
    const normalized=Math.min(1,Math.max(0,(rms-.003)/.16));
    return Math.pow(normalized,.48);
  }

  #initWebGL(){
    const gl=this.#gl;
    const compile=(type,source)=>{
      const shader=gl.createShader(type);gl.shaderSource(shader,source);gl.compileShader(shader);
      if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS))throw new Error(gl.getShaderInfoLog(shader)||'Shader compile failed');
      return shader;
    };
    const vs=compile(gl.VERTEX_SHADER,VERTEX_SHADER),fs=compile(gl.FRAGMENT_SHADER,FRAGMENT_SHADER),program=gl.createProgram();
    gl.attachShader(program,vs);gl.attachShader(program,fs);gl.linkProgram(program);gl.deleteShader(vs);gl.deleteShader(fs);
    if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw new Error(gl.getProgramInfoLog(program)||'Program link failed');
    this.#program=program;gl.useProgram(program);
    const location=gl.getAttribLocation(program,'a_position');
    this.#buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,this.#buffer);
    gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]),gl.STATIC_DRAW);
    gl.enableVertexAttribArray(location);gl.vertexAttribPointer(location,2,gl.FLOAT,false,0,0);
    this.#uniforms={
      time:gl.getUniformLocation(program,'u_time'),
      level:gl.getUniformLocation(program,'u_level'),
      tint:gl.getUniformLocation(program,'u_tint'),
      quality:gl.getUniformLocation(program,'u_quality'),
    };
    gl.enable(gl.BLEND);gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);
  }

  #drawWebGL(time){
    const gl=this.#gl,program=this.#program,u=this.#uniforms;
    gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT);gl.useProgram(program);
    gl.uniform1f(u.time,time);gl.uniform1f(u.level,this.#smoothedLevel);gl.uniform3fv(u.tint,STATE_TINTS[this.#state]);gl.uniform1f(u.quality,3.0);
    gl.drawArrays(gl.TRIANGLES,0,6);
  }

  #drawCanvas(time){
    const ctx=this.#ctx;if(!ctx)return;
    const rect=this.#canvas.getBoundingClientRect(),w=rect.width||560,h=rect.height||560,cx=w/2,cy=h/2;
    const energy=Math.pow(this.#smoothedLevel,.65),breath=Math.sin(time*1.35)*.012;
    const radius=Math.min(w,h)*(.255+breath+energy*.075);
    const tint=STATE_TINTS[this.#state].map(v=>Math.round(v*255));
    ctx.clearRect(0,0,w,h);
    const glowLayers=this.#lowPower?2:4;
    for(let i=glowLayers;i>=0;i--){
      const rr=radius*(1.05+i*.13),glow=ctx.createRadialGradient(cx,cy,radius*.45,cx,cy,rr);
      glow.addColorStop(0,`rgba(${tint[0]},${tint[1]},${tint[2]},${.04+energy*.05})`);
      glow.addColorStop(.72,`rgba(${tint[0]},${tint[1]},${tint[2]},${.045+energy*.065})`);glow.addColorStop(1,'rgba(0,0,0,0)');
      ctx.beginPath();ctx.arc(cx,cy,rr,0,Math.PI*2);ctx.fillStyle=glow;ctx.fill();
    }
    const core=ctx.createRadialGradient(cx-radius*.18,cy-radius*.2,radius*.08,cx,cy,radius*1.08);
    core.addColorStop(0,`rgba(246,231,189,${.18+energy*.28})`);
    core.addColorStop(.42,`rgba(${tint[0]},${tint[1]},${tint[2]},${.18+energy*.26})`);core.addColorStop(1,`rgba(${tint[0]},${tint[1]},${tint[2]},.015)`);
    ctx.beginPath();ctx.arc(cx,cy,radius,0,Math.PI*2);ctx.fillStyle=core;ctx.fill();
    for(let i=0;i<4;i++){
      const wave=Math.sin(time*(1.0+i*.18)+i*1.7)*(.008+energy*.014);
      ctx.beginPath();ctx.arc(cx,cy,radius*(.69+i*.13+wave),0,Math.PI*2);
      ctx.strokeStyle=`rgba(246,231,189,${.12+i*.025+energy*.20})`;ctx.lineWidth=1.15+energy*3.2;ctx.stroke();
    }
  }
}
