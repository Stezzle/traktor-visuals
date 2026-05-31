/**
 * TRAKTOR YOUTUBE VISUALS
 * Run:  node server.js
 * Open: http://localhost:3000
 */

const net      = require('net');
const http     = require('http');
const https    = require('https');
const crypto   = require('crypto');
const readline = require('readline');
const fs       = require('fs');
const path     = require('path');

const ICECAST_PORT = 8000;
const SERVER_PORT  = 3000;
const CONFIG_FILE  = path.join(__dirname, 'config.json');
const FALLBACKS    = ['tDexBj46oNI','AbcEKomfI0s','5qap5aO4i9A','jfKfPfyJRdk','p3OuU2fS2pA'];

const R='\x1b[0m',B='\x1b[1m',G='\x1b[32m',Y='\x1b[33m',C='\x1b[36m',D='\x1b[2m',RE='\x1b[31m';
const log=(col,lbl,msg)=>console.log(`${D}[${new Date().toLocaleTimeString()}]${R} ${col}${B}${lbl}${R}  ${msg}`);

// ─── API key ──────────────────────────────────────────────────
async function loadApiKey() {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      const cfg = JSON.parse(fs.readFileSync(CONFIG_FILE,'utf8'));
      if (cfg.youtubeApiKey?.length > 10) { log(G,'KEY  ','Loaded from config.json'); return cfg.youtubeApiKey; }
    }
  } catch(_){}
  console.log(`\n${Y}${B} No YouTube API key found.${R}\n`);
  console.log(` How to get one (free, 5 min):`);
  console.log(`   1. ${C}https://console.cloud.google.com${R} — sign in`);
  console.log(`   2. New Project → name anything → Create`);
  console.log(`   3. APIs & Services → Enable APIs → ${B}YouTube Data API v3${R} → Enable`);
  console.log(`   4. APIs & Services → Credentials → ${B}+ Create Credentials${R} → API Key\n`);
  const rl = readline.createInterface({ input:process.stdin, output:process.stdout });
  return new Promise(resolve => {
    rl.question(` ${B}Paste your API key: ${R}`, key => {
      rl.close(); const k=key.trim();
      try { fs.writeFileSync(CONFIG_FILE, JSON.stringify({youtubeApiKey:k},null,2)); log(G,'KEY  ',"Saved to config.json"); }
      catch(e) { log(Y,'WARN ','Could not save: '+e.message); }
      resolve(k);
    });
  });
}

// ─── WebSocket ────────────────────────────────────────────────
const wsClients = new Set();
function wsFrame(msg) {
  const p=Buffer.from(msg,'utf8'),l=p.length;
  const h=l<126?Buffer.from([0x81,l]):Buffer.from([0x81,126,(l>>8)&0xff,l&0xff]);
  return Buffer.concat([h,p]);
}
function broadcast(data){ const f=wsFrame(JSON.stringify(data)); wsClients.forEach(s=>{try{s.write(f);}catch(_){}}); }
function wsHandshake(req,socket){
  const accept=crypto.createHash('sha1')
    .update(req.headers['sec-websocket-key']+'258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
  socket.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: '+accept+'\r\n\r\n');
  wsClients.add(socket); socket.on('close',()=>wsClients.delete(socket)); socket.on('error',()=>wsClients.delete(socket));
}

// ─── Ogg parser ───────────────────────────────────────────────
function parseVorbis(buf) {
  const m=Buffer.from([0x03,0x76,0x6f,0x72,0x62,0x69,0x73]);
  let p=buf.indexOf(m); if(p===-1) return null;
  p+=m.length; if(p+4>buf.length) return null;
  p+=4+buf.readUInt32LE(p); if(p+4>buf.length) return null;
  const n=buf.readUInt32LE(p); p+=4; const c={};
  for(let i=0;i<n;i++){
    if(p+4>buf.length) break;
    const l=buf.readUInt32LE(p); p+=4; if(p+l>buf.length) break;
    const line=buf.slice(p,p+l).toString('utf8'); p+=l;
    const eq=line.indexOf('='); if(eq!==-1) c[line.slice(0,eq).toUpperCase()]=line.slice(eq+1);
  }
  return Object.keys(c).length?c:null;
}

// ─── YouTube search ───────────────────────────────────────────
const ytCache=new Map(); let API_KEY='';
function ytSearch(q){
  return new Promise((res,rej)=>{
    https.get('https://www.googleapis.com/youtube/v3/search?part=snippet&q='+encodeURIComponent(q)+'&type=video&videoCategoryId=10&maxResults=5&key='+API_KEY,
      r=>{let b='';r.on('data',d=>b+=d);r.on('end',()=>{try{res(JSON.parse(b));}catch(e){rej(e);}});}).on('error',rej);
  });
}
function rankItems(items,artist,title){
  if(!items?.length) return [];
  return items.map(item=>{
    const vt=(item.snippet.title||'').toLowerCase(),ch=(item.snippet.channelTitle||'').toLowerCase();
    let sc=0;
    if(title&&vt.includes(title.toLowerCase())) sc+=3;
    if(artist&&vt.includes(artist.toLowerCase())) sc+=2;
    if(artist&&ch.includes(artist.toLowerCase())) sc+=2;
    if(vt.includes('official')) sc+=2; if(vt.includes('video')) sc+=1;
    if(vt.includes('cover')) sc-=2; if(vt.includes('reaction')) sc-=3; if(vt.includes('karaoke')) sc-=5;
    return {item,sc};
  }).sort((a,b)=>b.sc-a.sc).filter(x=>x.sc>=0).slice(0,3).map(x=>x.item.id.videoId);
}
async function findVideo(artist,title){
  const key=`${artist}||${title}`.toLowerCase();
  if(ytCache.has(key)){log(D,'CACHE',`"${artist} - ${title}"`);return ytCache.get(key);}
  const candidates=[];
  for(const q of [`${artist} ${title}`,title].filter(Boolean)){
    log(C,'SRCH ',`"${q}"`);
    try{
      const data=await ytSearch(q);
      if(data.error){log(RE,'YTERR',data.error.message);break;}
      const ids=rankItems(data.items,artist,title);
      ids.forEach(id=>{ if(!candidates.includes(id)) candidates.push(id); });
      if(candidates.length>=3) break;
    }catch(e){log(RE,'ERR  ',e.message);}
  }
  if(candidates.length){
    log(G,'FOUND',`${candidates.length} candidates: ${candidates.join(', ')}`);
    const r={videoId:candidates[0],channel:'',candidates};
    ytCache.set(key,r); return r;
  }
  const id=FALLBACKS[Math.floor(Math.random()*FALLBACKS.length)];
  log(Y,'FALLB','No match — fallback visual');
  return {videoId:id,channel:'',candidates:[id,...FALLBACKS],isFallback:true};
}

// ─── View state ───────────────────────────────────────────────
// pos values: 'hidden' | 'full' | 'left' | 'right'
// mode: 'idle' | 'full' | 'split'
const vs={mode:'idle',a:{videoId:null,pos:'hidden'},b:{videoId:null,pos:'hidden'}};
let splitTimer=null,searchTimer=null,autoFullTimer=null,lastArtist='',lastTitle='';
const other=l=>l==='a'?'b':'a';

function sendState(newTrack=null){
  broadcast({type:'state',mode:vs.mode,
    layers:{
      a:{videoId:vs.a.videoId,position:vs.a.pos,candidates:vs.a.candidates||[]},
      b:{videoId:vs.b.videoId,position:vs.b.pos,candidates:vs.b.candidates||[]}
    },
    newTrack});
}

function startAutoFull(){
  clearTimeout(autoFullTimer);
  const delay=30000+Math.random()*30000;
  log(C,'VIS  ',`Auto-full in ${Math.round(delay/1000)}s`);
  autoFullTimer=setTimeout(()=>{
    if(vs.mode!=='split') return;
    const r=vs.a.pos==='right'?'a':'b', l=vs.a.pos==='left'?'a':'b';
    vs[r].pos='full'; vs[l].pos='hidden'; vs.mode='full';
    sendState(null); log(C,'VIS  ','Auto: newest → full screen');
  },delay);
}

async function onNewVideo(data){
  clearTimeout(splitTimer); clearTimeout(autoFullTimer);

  if(vs.mode==='idle'){
    // First track — full screen
    vs.a.videoId=data.videoId; vs.a.candidates=data.candidates||[];
    vs.a.pos='full'; vs.mode='full';
    sendState(data);
    log(C,'VIS  ','Track 1 → full');

  } else if(vs.mode==='full'){
    // New track while full — load quietly into empty layer, split after 2s
    const full=vs.a.pos==='full'?'a':'b';
    const empty=other(full);
    vs[empty].videoId=data.videoId; vs[empty].candidates=data.candidates||[];
    sendState(null);
    splitTimer=setTimeout(()=>{
      vs[full].pos='left'; vs[empty].pos='right'; vs.mode='split';
      sendState(data);
      log(C,'VIS  ',`Split: ${full}=left ${empty}=right`);
      startAutoFull();
    },2000);

  } else if(vs.mode==='split'){
    // New track while in split — swap right side, restart auto-full timer
    const right=vs.a.pos==='right'?'a':'b';
    vs[right].videoId=data.videoId; vs[right].candidates=data.candidates||[];
    sendState(data);
    log(C,'VIS  ','Split right → new track');
    startAutoFull();
  }
}

function handleTrack(artist,title){
  if(artist===lastArtist&&title===lastTitle) return;
  lastArtist=artist; lastTitle=title;
  log(G,'TRACK',`${B}${artist}${R} — ${title}`);
  clearTimeout(searchTimer);
  searchTimer=setTimeout(async()=>{
    const r=await findVideo(artist,title);
    onNewVideo({...r,artist,title});
  },2000);
}

// ─── Icecast ──────────────────────────────────────────────────
const icecast=net.createServer(socket=>{
  log(G,'CONN ','Traktor connected');
  let htext='',hdone=false,buf=Buffer.alloc(0),metaDone=false;
  socket.on('data',chunk=>{
    if(!hdone){
      htext+=chunk.toString('binary');
      if(htext.includes('\r\n\r\n')){
        hdone=true; socket.write('HTTP/1.0 200 OK\r\n\r\n');
        log(G,'ICE  ','Handshake OK');
        const raw=Buffer.from(htext,'binary'),end=raw.indexOf(Buffer.from('\r\n\r\n'));
        if(end!==-1) buf=Buffer.concat([buf,chunk.slice(end+4)]);
      }
      return;
    }
    buf=Buffer.concat([buf,chunk]);
    if(buf.length>131072) buf=buf.slice(buf.length-65536);
    if(!metaDone||buf.length%4096===0){
      const c=parseVorbis(buf);
      if(c?.ARTIST||c?.TITLE){metaDone=true;handleTrack(c.ARTIST||'',c.TITLE||'');}
    }
  });
  socket.on('end',()=>log(Y,'DISC ','Traktor disconnected'));
  socket.on('error',e=>log(RE,'ERR  ',e.message));
});
icecast.on('error',e=>{
  log(RE,'ERR  ',`Icecast: ${e.message}`);
  if(e.code==='EADDRINUSE') log(RE,'ERR  ','Port busy — close other traktor_nowplaying.exe if running');
  process.exit(1);
});

// ─── HTML ─────────────────────────────────────────────────────
const HTML=`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"><title>Traktor Visuals</title>
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{background:#000;overflow:hidden;width:100vw;height:100vh;font-family:'Helvetica Neue',Arial,sans-serif}
  #stage{position:relative;width:100vw;height:100vh}

  /* Layers — oversized iframe crops YouTube chrome */
  .layer{position:absolute;top:0;bottom:0;overflow:hidden;
    transition:left .85s cubic-bezier(.16,1,.3,1),width .85s cubic-bezier(.16,1,.3,1),opacity .7s ease}
  .iframe-wrap{position:absolute;top:-50px;left:-50px;right:-50px;bottom:-50px}
  .iframe-wrap iframe{width:100%;height:100%;border:none;pointer-events:none}

  .pos-hidden{opacity:0;left:0;width:100%;pointer-events:none}
  .pos-full  {opacity:1;left:0;width:100%}
  .pos-left  {opacity:1;left:0;width:50%}
  .pos-right {opacity:1;left:50%;width:50%}

  /* Visualiser canvas — sits at split centre */
  #viz{
    position:fixed;top:0;left:50%;transform:translateX(-50%);
    width:160px;height:100vh;z-index:16;pointer-events:none;
    opacity:0;transition:opacity .8s ease;
  }

  /* Overlay text */
  #overlay{position:fixed;bottom:0;left:0;right:0;z-index:20;padding:0 48px 44px;pointer-events:none}
  #line{height:2px;background:linear-gradient(90deg,#e84393,#a855f7,#3b82f6);width:0;margin-bottom:14px;
    box-shadow:0 0 12px #e84393,0 0 28px #a855f780;transition:width 0s}
  #line.sweep{transition:width .7s cubic-bezier(.16,1,.3,1);width:100%}
  #tblock{transform:translateY(26px);opacity:0;transition:transform .6s cubic-bezier(.16,1,.3,1),opacity .5s ease}
  #tblock.show{transform:translateY(0);opacity:1}
  #t-artist{font-size:12px;font-weight:700;letter-spacing:4px;text-transform:uppercase;color:#e84393;
    text-shadow:0 0 20px #e84393;margin-bottom:5px;display:flex;align-items:center;gap:10px}
  #t-artist::before{content:'';display:inline-block;width:18px;height:2px;background:#e84393;box-shadow:0 0 8px #e84393;flex-shrink:0}
  #t-title{font-size:clamp(26px,5vw,54px);font-weight:900;color:#fff;line-height:1.05;
    text-shadow:0 0 40px rgba(255,255,255,.1)}
  #t-title.glitch{animation:glitch .5s steps(2) forwards}
  @keyframes glitch{
    0%  {text-shadow:2px 0 #e84393,-2px 0 #3b82f6;transform:translate(2px,0)}
    25% {text-shadow:-3px 0 #a855f7,3px 0 #e84393;transform:translate(-2px,1px)}
    50% {text-shadow:3px 0 #3b82f6,-1px 0 #e84393;transform:translate(1px,-1px)}
    75% {text-shadow:-2px 0 #e84393,2px 0 #a855f7;transform:translate(-1px,0)}
    100%{text-shadow:0 0 40px rgba(255,255,255,.1);transform:translate(0,0)}
  }
  #t-meta{font-size:11px;color:#555;margin-top:7px;letter-spacing:1px;text-transform:uppercase}

  /* Scanlines + vignette */
  #scanlines{position:fixed;inset:0;z-index:5;pointer-events:none;
    background:repeating-linear-gradient(0deg,transparent,transparent 2px,rgba(0,0,0,.03) 2px,rgba(0,0,0,.03) 4px)}
  #vignette{position:fixed;inset:0;z-index:6;pointer-events:none;
    background:radial-gradient(ellipse at center,transparent 50%,rgba(0,0,0,.5) 100%)}

  /* Status + splash */
  #badge{position:fixed;top:18px;right:18px;z-index:30;display:flex;align-items:center;gap:7px;
    font-size:11px;color:#333;letter-spacing:1px;text-transform:uppercase}
  #dot{width:6px;height:6px;border-radius:50%;background:#333;transition:background .3s}
  #dot.live{background:#2ecc71;box-shadow:0 0 8px #2ecc71}
  #dot.wait{background:#f39c12;animation:pu 1s infinite}
  @keyframes pu{0%,100%{opacity:1}50%{opacity:.2}}
  #splash{position:fixed;inset:0;z-index:40;display:flex;flex-direction:column;align-items:center;
    justify-content:center;background:#050505;gap:16px;transition:opacity .8s}
  #splash.gone{opacity:0;pointer-events:none}
  .spin{width:36px;height:36px;border:2px solid #1a1a1a;border-top-color:#e84393;border-radius:50%;animation:sp .8s linear infinite}
  @keyframes sp{to{transform:rotate(360deg)}}
  #splash p{font-size:12px;color:#333;letter-spacing:3px;text-transform:uppercase}
  #splash em{color:#e84393;font-style:normal}

  /* ── Full-screen announcement ── */
  #announce{
    position:fixed;inset:0;z-index:25;pointer-events:none;
    display:flex;flex-direction:column;align-items:center;justify-content:center;
    padding:8vw;opacity:0;
  }
  #ann-bg{position:absolute;inset:0;opacity:0;transition:opacity .4s}
  #ann-content{position:relative;z-index:1;text-align:center;max-width:90vw;word-break:break-word}
  #ann-artist-big{
    font-size:clamp(12px,2.2vw,22px);font-weight:700;letter-spacing:6px;
    text-transform:uppercase;margin-bottom:16px;opacity:0;
  }
  #ann-title-big{
    font-size:clamp(38px,9.5vw,115px);font-weight:900;line-height:1;
    letter-spacing:-2px;opacity:0;
  }

  /* EXIT — same for all styles */
  #announce.ann-exit #ann-content{animation:ann-out .5s ease forwards}
  #announce.ann-exit #ann-bg    {animation:ann-out .5s ease forwards}
  @keyframes ann-out{to{opacity:0;transform:scale(.97)}}

  /* ── SLAM — drops from above with bounce ── */
  .ann-slam #ann-bg{background:radial-gradient(ellipse at 50% 20%,rgba(232,67,147,.45),rgba(0,0,0,.88) 65%);opacity:1}
  .ann-slam #ann-artist-big{color:#e84393;text-shadow:0 0 30px #e84393;
    animation:slam-a .55s cubic-bezier(.16,1,.3,1) .05s both}
  .ann-slam #ann-title-big{color:#fff;text-shadow:0 0 70px rgba(232,67,147,.45);
    animation:slam-t .55s cubic-bezier(.16,1,.3,1) .15s both}
  @keyframes slam-a{0%{opacity:0;transform:translateY(-130%) scale(1.2)}65%{opacity:1;transform:translateY(5%) scale(.98)}85%{transform:translateY(-2%)}100%{opacity:1;transform:none}}
  @keyframes slam-t{0%{opacity:0;transform:translateY(-90%) scale(1.1)}65%{opacity:1;transform:translateY(4%) scale(.99)}85%{transform:translateY(-1%)}100%{opacity:1;transform:none}}

  /* ── RUSH — blasts in from right with blur trail ── */
  .ann-rush #ann-bg{background:linear-gradient(105deg,rgba(0,0,0,.95) 35%,rgba(59,130,246,.25));opacity:1}
  .ann-rush #ann-artist-big{color:#60a5fa;letter-spacing:10px;
    animation:rush-a .5s cubic-bezier(.16,1,.3,1) both}
  .ann-rush #ann-title-big{color:#fff;text-shadow:-6px 0 40px rgba(59,130,246,.5);
    animation:rush-t .55s cubic-bezier(.16,1,.3,1) .08s both}
  @keyframes rush-a{0%{opacity:0;transform:translateX(120%) skewX(-10deg);filter:blur(18px)}70%{opacity:1;filter:blur(0)}100%{opacity:1;transform:none}}
  @keyframes rush-t{0%{opacity:0;transform:translateX(100%) skewX(-6deg);filter:blur(12px)}70%{opacity:1;filter:blur(0)}100%{opacity:1;transform:none}}

  /* ── RISE — sweeps up from below, majestic ── */
  .ann-rise #ann-bg{background:linear-gradient(to top,rgba(168,85,247,.4),rgba(0,0,0,.88) 55%);opacity:1}
  .ann-rise #ann-artist-big{color:#c084fc;letter-spacing:5px;
    animation:rise-a .85s cubic-bezier(.16,1,.3,1) .1s both}
  .ann-rise #ann-title-big{color:#fff;text-shadow:0 6px 50px rgba(168,85,247,.45);
    animation:rise-t .9s cubic-bezier(.16,1,.3,1) both}
  @keyframes rise-a{0%{opacity:0;transform:translateY(60%)}100%{opacity:1;transform:none}}
  @keyframes rise-t{0%{opacity:0;transform:translateY(80%)}100%{opacity:1;transform:none}}

  /* ── ZOOM — title rushes toward viewer from infinity ── */
  .ann-zoom #ann-bg{background:radial-gradient(circle at center,rgba(255,255,255,.14),rgba(0,0,0,.92) 60%);opacity:1}
  .ann-zoom #ann-artist-big{color:#9ca3af;letter-spacing:8px;
    animation:zoom-a .6s cubic-bezier(.16,1,.3,1) both}
  .ann-zoom #ann-title-big{color:#fff;text-shadow:0 0 90px rgba(255,255,255,.25);
    animation:zoom-t .65s cubic-bezier(.16,1,.3,1) .08s both}
  @keyframes zoom-a{0%{opacity:0;transform:scale(3);filter:blur(12px)}100%{opacity:1;transform:none;filter:blur(0)}}
  @keyframes zoom-t{0%{opacity:0;transform:scale(4.5);filter:blur(20px)}100%{opacity:1;transform:none;filter:blur(0)}}

  /* ── FLICKER — neon sign powering on ── */
  .ann-flicker #ann-bg{background:rgba(0,0,0,.88);opacity:1}
  .ann-flicker #ann-artist-big{color:#e84393;
    animation:flicker-a 1.1s forwards}
  .ann-flicker #ann-title-big{
    color:#ff1493;text-shadow:0 0 30px #ff1493,0 0 70px #e84393,0 0 120px #c026d3;
    animation:flicker-t 1.2s forwards}
  @keyframes flicker-a{0%{opacity:0}8%{opacity:.9}11%{opacity:.1}15%{opacity:1}19%{opacity:.2}24%{opacity:1}29%{opacity:.7}38%{opacity:1}100%{opacity:1}}
  @keyframes flicker-t{0%{opacity:0}6%{opacity:.8}9%{opacity:0}13%{opacity:1}17%{opacity:.3}22%{opacity:1}27%{opacity:.6}35%{opacity:1}100%{opacity:1}}

  /* ── STROBE — staccato hard-cut flashes ── */
  .ann-strobe #ann-bg{background:rgba(0,0,0,.92);opacity:1}
  .ann-strobe #ann-artist-big{color:#fff;letter-spacing:10px;
    animation:strobe-in .5s steps(1) both}
  .ann-strobe #ann-title-big{color:#fff;letter-spacing:3px;
    animation:strobe-in .5s steps(1) .05s both}
  @keyframes strobe-in{0%{opacity:0}18%{opacity:1}28%{opacity:0}46%{opacity:1}56%{opacity:0}72%{opacity:1}82%{opacity:0}100%{opacity:1}}

  /* ── SPLIT — artist from left, title from right ── */
  .ann-split #ann-bg{background:rgba(0,0,0,.85);opacity:1}
  .ann-split #ann-artist-big{color:#e84393;text-shadow:0 0 25px #e84393;
    animation:split-l .6s cubic-bezier(.16,1,.3,1) both}
  .ann-split #ann-title-big{color:#fff;
    animation:split-r .6s cubic-bezier(.16,1,.3,1) .1s both}
  @keyframes split-l{0%{opacity:0;transform:translateX(-55%)}100%{opacity:1;transform:none}}
  @keyframes split-r{0%{opacity:0;transform:translateX(55%)}100%{opacity:1;transform:none}}

  /* ── SHATTER — scale-crush with orange tint ── */
  .ann-shatter #ann-bg{background:radial-gradient(ellipse at center,rgba(251,146,60,.18),rgba(0,0,0,.9) 65%);opacity:1}
  .ann-shatter #ann-artist-big{color:#fb923c;letter-spacing:5px;
    animation:shatter-a .7s cubic-bezier(.16,1,.3,1) both}
  .ann-shatter #ann-title-big{color:#fff;text-shadow:0 0 60px rgba(251,146,60,.4);
    animation:shatter-t .75s cubic-bezier(.16,1,.3,1) .06s both}
  @keyframes shatter-a{0%{opacity:0;transform:scale(2.8) rotate(-4deg);filter:blur(8px)}65%{opacity:1;transform:scale(.97) rotate(.3deg);filter:blur(0)}85%{transform:scale(1.02)}100%{opacity:1;transform:none}}
  @keyframes shatter-t{0%{opacity:0;transform:scale(3.2) rotate(3deg);filter:blur(10px)}65%{opacity:1;transform:scale(.98) rotate(-.2deg);filter:blur(0)}85%{transform:scale(1.01)}100%{opacity:1;transform:none}}
</style>
</head>
<body>

<div id="splash"><div class="spin"></div><p>Waiting for <em>Traktor</em></p></div>

<div id="announce">
  <div id="ann-bg"></div>
  <div id="ann-content">
    <div id="ann-artist-big"></div>
    <div id="ann-title-big"></div>
  </div>
</div>

<div id="stage">
  <div class="layer pos-hidden" id="la"><div class="iframe-wrap"><iframe id="ia" src="" allow="autoplay;fullscreen" allowfullscreen></iframe></div></div>
  <div class="layer pos-hidden" id="lb"><div class="iframe-wrap"><iframe id="ib" src="" allow="autoplay;fullscreen" allowfullscreen></iframe></div></div>
</div>

<canvas id="viz"></canvas>
<div id="scanlines"></div>
<div id="vignette"></div>

<div id="overlay">
  <div id="line"></div>
  <div id="tblock">
    <div id="t-artist"></div>
    <div id="t-title"></div>
    <div id="t-meta"></div>
  </div>
</div>
<div id="badge"><div id="dot" class="wait"></div><span id="btext">Connecting</span></div>

<script>
  // ── Layer management ────────────────────────────────────────
  const la=document.getElementById('la'),lb=document.getElementById('lb');
  const ia=document.getElementById('ia'),ib=document.getElementById('ib');
  const splash=document.getElementById('splash');
  const vids={a:null,b:null};

  function setLayer(id,pos,videoId,candidates){
    const el=id==='a'?la:lb, iframe=id==='a'?ia:ib;
    if(candidates&&candidates.length){ layerCands[id]=candidates; layerCandIdx[id]=0; }
    if(videoId&&videoId!==vids[id]){ iframe.src=ytUrl(videoId); vids[id]=videoId; }
    el.className='layer pos-'+pos;
  }

  const FALLBACK_IDS=['tDexBj46oNI','AbcEKomfI0s','5qap5aO4i9A','jfKfPfyJRdk'];
  const layerCands={a:[],b:[]}, layerCandIdx={a:0,b:0};

  function ytUrl(id){
    return 'https://www.youtube.com/embed/'+id
      +'?autoplay=1&mute=1&controls=0&loop=1&playlist='+id
      +'&modestbranding=1&rel=0&iv_load_policy=3&disablekb=1&fs=0&playsinline=1&enablejsapi=1';
  }

  function tryNextCandidate(layerId){
    layerCandIdx[layerId]++;
    const pool=[...layerCands[layerId],...FALLBACK_IDS];
    const nextId=pool[layerCandIdx[layerId]%pool.length];
    const iframe=layerId==='a'?ia:ib;
    console.log('Video unavailable on layer '+layerId+', trying: '+nextId);
    iframe.src=ytUrl(nextId); vids[layerId]=nextId;
  }

  // YouTube sends error events via postMessage when embedding is blocked/unavailable
  // Error codes: 100=not found/private, 101/150=embedding disabled
  window.addEventListener('message',function(e){
    if(e.origin!=='https://www.youtube.com') return;
    try{
      const d=JSON.parse(e.data);
      if(d.event==='onError'){
        const layerId=ia.contentWindow===e.source?'a':ib.contentWindow===e.source?'b':null;
        if(layerId){ console.log('YT error '+d.info+' on layer '+layerId); tryNextCandidate(layerId); }
      }
    }catch(_){}
  });

  // ── Visualiser — multi-mode ──────────────────────────────────
  const viz=document.getElementById('viz');
  let vizActive=false, vizAlpha=0;
  function resizeViz(){ viz.width=160; viz.height=window.innerHeight; }
  window.addEventListener('resize',resizeViz); resizeViz();

  // Mode cycling — changes every 18-32s
  const VIZ_MODES=['bars','wave','static','sparkles','rings','helix'];
  let vMode=0, vFade=false, vModeAlpha=1;
  function nextVizMode(){ vFade=true; setTimeout(()=>{ vMode=(vMode+1)%VIZ_MODES.length; vFade=false; scheduleMode(); },600); }
  function scheduleMode(){ setTimeout(nextVizMode,18000+Math.random()*14000); }
  scheduleMode();

  // ── Bars (spring physics) ──────────────────────
  const NUM_BARS=32;
  const bars=Array.from({length:NUM_BARS},()=>({h:.1+Math.random()*.2,vel:0,target:.3,rt:0}));
  function drawBars(ctx,t,w,h){
    const cy=h/2, bw=Math.max(1,Math.floor((w-(NUM_BARS-1)*2)/NUM_BARS));
    bars.forEach((b,i)=>{
      if(t>b.rt){b.target=.04+Math.random()*.96;b.rt=t+150+Math.random()*550;}
      b.vel+=(b.target-b.h)*.1; b.vel*=.76; b.h+=b.vel; b.h=Math.max(.02,Math.min(1,b.h));
      const x=i*(bw+2), hh=b.h*cy*.85;
      const g=ctx.createLinearGradient(0,cy-hh,0,cy+hh);
      g.addColorStop(0,'rgba(232,67,147,0)'); g.addColorStop(.1,'rgba(232,67,147,.9)');
      g.addColorStop(.45,'rgba(168,85,247,1)'); g.addColorStop(.55,'rgba(168,85,247,1)');
      g.addColorStop(.9,'rgba(59,130,246,.9)'); g.addColorStop(1,'rgba(59,130,246,0)');
      ctx.fillStyle=g; ctx.fillRect(x,cy-hh,bw,hh*2);
    });
  }

  // ── Wave (animated sine) ───────────────────────
  function drawWave(ctx,t,w,h){
    const cx=w/2, pts=200;
    ctx.beginPath();
    for(let i=0;i<pts;i++){
      const y=(i/pts)*h, edge=Math.sin(y/h*Math.PI);
      const amp=edge*(14+Math.sin(t*.0015)*8);
      const x=cx+Math.sin(y*(.018+Math.sin(t*.0007)*.004)+t*.0025)*amp;
      i===0?ctx.moveTo(x,y):ctx.lineTo(x,y);
    }
    const g=ctx.createLinearGradient(0,0,0,h);
    g.addColorStop(0,'rgba(232,67,147,0)'); g.addColorStop(.15,'#e84393');
    g.addColorStop(.5,'#a855f7'); g.addColorStop(.85,'#3b82f6'); g.addColorStop(1,'rgba(59,130,246,0)');
    ctx.strokeStyle=g; ctx.lineWidth=3; ctx.shadowColor='#e84393'; ctx.shadowBlur=14;
    ctx.stroke(); ctx.shadowBlur=0;
  }

  // ── Static / noise ─────────────────────────────
  function drawStatic(ctx,t,w,h){
    const sc=3, sw=Math.ceil(w/sc), sh=Math.ceil(h/sc);
    const tmp=document.createElement('canvas'); tmp.width=sw; tmp.height=sh;
    const tc=tmp.getContext('2d'), img=tc.createImageData(sw,sh), d=img.data;
    const cols=[[232,67,147],[168,85,247],[59,130,246],[255,255,255]];
    for(let y=0;y<sh;y++){
      const ey=Math.sin(y/sh*Math.PI);
      for(let x=0;x<sw;x++){
        const fade=ey*(1-Math.abs(x-sw/2)/(sw/2)*.8);
        if(Math.random()<.35*fade){
          const c=cols[Math.floor(Math.random()*cols.length)];
          const idx=(y*sw+x)*4;
          d[idx]=c[0];d[idx+1]=c[1];d[idx+2]=c[2];d[idx+3]=Math.random()*180*fade;
        }
      }
    }
    tc.putImageData(img,0,0); ctx.drawImage(tmp,0,0,w,h);
  }

  // ── Sparkles / particles ───────────────────────
  const sparks=Array.from({length:80},()=>({life:0}));
  function emitSpark(cx,h){
    const s=sparks.find(p=>p.life<=0); if(!s) return;
    const sd=Math.random()<.5?1:-1;
    Object.assign(s,{x:cx,y:Math.random()*h,vx:(0.8+Math.random()*2.5)*sd,
      vy:(Math.random()-.5)*1.5,life:1,decay:1/(40+Math.random()*60),
      size:1+Math.random()*3,col:['#e84393','#a855f7','#3b82f6','#fff'][Math.floor(Math.random()*4)]});
  }
  function drawSparkles(ctx,t,w,h){
    const cx=w/2;
    if(Math.random()<.5) emitSpark(cx,h);
    sparks.forEach(s=>{
      if(s.life<=0) return;
      s.x+=s.vx; s.y+=s.vy; s.life-=s.decay;
      const a=s.life*(1-Math.abs(s.x-cx)/(w*1.5));
      if(a<=0){s.life=0;return;}
      ctx.globalAlpha=a; ctx.fillStyle=s.col;
      ctx.beginPath(); ctx.arc(s.x,s.y,s.size,0,Math.PI*2); ctx.fill();
      ctx.globalAlpha=a*.25; ctx.fillRect(s.x-s.vx,s.y-s.vy,s.size*.6,s.size*.6);
    });
    ctx.globalAlpha=1;
  }

  // ── Rings ──────────────────────────────────────
  const rings=[];
  function drawRings(ctx,t,w,h){
    const cx=w/2;
    if(Math.random()<.06) rings.push({x:cx+(Math.random()-.5)*15,y:Math.random()*h,r:0,
      maxR:50+Math.random()*50,a:.85,col:['#e84393','#a855f7','#3b82f6'][Math.floor(Math.random()*3)]});
    for(let i=rings.length-1;i>=0;i--){
      const rg=rings[i]; rg.r+=1.8; rg.a-=.018;
      if(rg.a<=0){rings.splice(i,1);continue;}
      ctx.globalAlpha=rg.a*Math.sin(rg.r/rg.maxR*Math.PI);
      ctx.beginPath(); ctx.arc(rg.x,rg.y,rg.r,0,Math.PI*2);
      ctx.strokeStyle=rg.col; ctx.lineWidth=1.5; ctx.stroke();
    }
    ctx.globalAlpha=1;
  }

  // ── Helix / DNA ────────────────────────────────
  function drawHelix(ctx,t,w,h){
    const cx=w/2, segs=160;
    for(let wave=0;wave<2;wave++){
      const phase=wave*Math.PI;
      ctx.beginPath();
      for(let i=0;i<segs;i++){
        const y=(i/segs)*h, edge=Math.sin(y/h*Math.PI);
        const x=cx+Math.sin(y*.02+t*.002+phase)*edge*18;
        i===0?ctx.moveTo(x,y):ctx.lineTo(x,y);
      }
      const g=ctx.createLinearGradient(0,0,0,h);
      if(wave===0){g.addColorStop(0,'rgba(232,67,147,0)');g.addColorStop(.25,'#e84393');g.addColorStop(.75,'#a855f7');g.addColorStop(1,'rgba(168,85,247,0)');}
      else{g.addColorStop(0,'rgba(59,130,246,0)');g.addColorStop(.25,'#3b82f6');g.addColorStop(.75,'#a855f7');g.addColorStop(1,'rgba(168,85,247,0)');}
      ctx.strokeStyle=g; ctx.lineWidth=2.5;
      ctx.shadowColor=wave?'#3b82f6':'#e84393'; ctx.shadowBlur=12;
      ctx.stroke();
    }
    ctx.shadowBlur=0;
  }

  // ── Main loop ──────────────────────────────────
  function vizLoop(t){
    vizAlpha=Math.max(0,Math.min(1,vizAlpha+(vizActive?.022:-.022)));
    vModeAlpha=Math.max(0,Math.min(1,vModeAlpha+(vFade?-.05:.05)));
    viz.style.opacity=vizAlpha;
    if(vizAlpha>0.01){
      const ctx=viz.getContext('2d'), w=viz.width, h=viz.height;
      ctx.clearRect(0,0,w,h);
      // Dark bg strip
      const bg=ctx.createLinearGradient(0,0,w,0);
      bg.addColorStop(0,'rgba(0,0,0,0)'); bg.addColorStop(.3,'rgba(0,0,0,.55)');
      bg.addColorStop(.5,'rgba(0,0,0,.7)'); bg.addColorStop(.7,'rgba(0,0,0,.55)'); bg.addColorStop(1,'rgba(0,0,0,0)');
      ctx.fillStyle=bg; ctx.fillRect(0,0,w,h);
      // Mode draw
      ctx.globalAlpha=vModeAlpha;
      const m=VIZ_MODES[vMode];
      if(m==='bars') drawBars(ctx,t,w,h);
      else if(m==='wave') drawWave(ctx,t,w,h);
      else if(m==='static') drawStatic(ctx,t,w,h);
      else if(m==='sparkles') drawSparkles(ctx,t,w,h);
      else if(m==='rings') drawRings(ctx,t,w,h);
      else if(m==='helix') drawHelix(ctx,t,w,h);
      ctx.globalAlpha=1;
      // Permanent centre glow line
      const cl=ctx.createLinearGradient(0,0,0,h);
      cl.addColorStop(0,'rgba(232,67,147,0)'); cl.addColorStop(.2,'rgba(232,67,147,.7)');
      cl.addColorStop(.5,'rgba(255,100,180,1)'); cl.addColorStop(.8,'rgba(232,67,147,.7)'); cl.addColorStop(1,'rgba(232,67,147,0)');
      ctx.fillStyle=cl; ctx.fillRect(Math.floor(w/2)-1,0,2,h);
    }
    requestAnimationFrame(vizLoop);
  }
  requestAnimationFrame(vizLoop);

  // ── Full-screen announcements ──────────────────────────────
  const ann      = document.getElementById('announce');
  const annBg    = document.getElementById('ann-bg');
  const annArtist= document.getElementById('ann-artist-big');
  const annTitle = document.getElementById('ann-title-big');
  const ANN_STYLES = ['slam','rush','rise','zoom','flicker','strobe','split','shatter'];
  let lastAnnStyle = '';
  let annExitTimer, annHideTimer;

  function announceTrack(track){
    // Pick a style that wasn't used last time
    let style;
    do { style = ANN_STYLES[Math.floor(Math.random()*ANN_STYLES.length)]; }
    while(style===lastAnnStyle);
    lastAnnStyle=style;

    clearTimeout(annExitTimer); clearTimeout(annHideTimer);

    // Reset
    ann.className=''; ann.style.opacity='1';
    annArtist.textContent=track.artist||'';
    annTitle.textContent=track.title||'';

    // Apply style (triggers CSS animations)
    ann.classList.add('ann-'+style);

    // Exit after 3.8s
    annExitTimer=setTimeout(()=>{
      ann.classList.add('ann-exit');
      annHideTimer=setTimeout(()=>{ ann.style.opacity='0'; ann.className=''; },600);
    },3800);
  }

  // ── Track overlay animation ─────────────────────────────────
  const line=document.getElementById('line'),block=document.getElementById('tblock');
  let hideTimer,glitchTimer;

  function animateOverlay(track){
    clearTimeout(hideTimer); clearTimeout(glitchTimer);
    line.classList.remove('sweep'); block.classList.remove('show');
    document.getElementById('t-title').classList.remove('glitch');
    document.getElementById('t-artist').textContent=track.artist||'';
    document.getElementById('t-title').textContent=track.title||'';
    document.getElementById('t-meta').textContent=track.isFallback
      ?'Visual only':(track.channel||'').toUpperCase();
    requestAnimationFrame(()=>requestAnimationFrame(()=>{
      line.classList.add('sweep');
      setTimeout(()=>block.classList.add('show'),300);
      glitchTimer=setTimeout(()=>document.getElementById('t-title').classList.add('glitch'),420);
      hideTimer=setTimeout(hideOverlay,9000);
    }));
  }

  function hideOverlay(){
    block.style.cssText='transition:transform .5s ease,opacity .5s ease;transform:translateY(16px);opacity:0';
    setTimeout(()=>{
      line.style.cssText='transition:width .4s ease;width:0';
      setTimeout(()=>{ line.style.cssText=''; block.style.cssText=''; block.classList.remove('show'); line.classList.remove('sweep'); },400);
    },260);
  }

  // ── State handler ───────────────────────────────────────────
  function applyState(msg){
    splash.classList.add('gone');
    setLayer('a', msg.layers.a.position, msg.layers.a.videoId, msg.layers.a.candidates);
    setLayer('b', msg.layers.b.position, msg.layers.b.videoId, msg.layers.b.candidates);
    // Visualiser on only during split
    vizActive = (msg.mode==='split');
    if(msg.newTrack){
      announceTrack(msg.newTrack);
      setTimeout(()=>animateOverlay(msg.newTrack),4600);
    }
  }

  // ── WebSocket ───────────────────────────────────────────────
  const dot=document.getElementById('dot'),btext=document.getElementById('btext');
  function connect(){
    const ws=new WebSocket('ws://localhost:${SERVER_PORT}');
    ws.onopen=()=>{dot.className='live';btext.textContent='Live'};
    ws.onmessage=e=>{try{const m=JSON.parse(e.data);if(m.type==='state')applyState(m);}catch(_){}};
    ws.onclose=()=>{dot.className='wait';btext.textContent='Reconnecting';setTimeout(connect,2000)};
    ws.onerror=()=>ws.close();
  }
  connect();
</script>
</body>
</html>`;

// ─── HTTP + WebSocket ─────────────────────────────────────────
const webServer=http.createServer((req,res)=>{res.writeHead(200,{'Content-Type':'text/html'});res.end(HTML);});
webServer.on('upgrade',(req,socket)=>{
  if(req.headers.upgrade?.toLowerCase()==='websocket'){
    wsHandshake(req,socket);
    setTimeout(()=>{
      try{ socket.write(wsFrame(JSON.stringify({type:'state',mode:vs.mode,
        layers:{a:{videoId:vs.a.videoId,position:vs.a.pos},b:{videoId:vs.b.videoId,position:vs.b.pos}},
        newTrack:null}))); }catch(_){}
    },300);
  }
});

// ─── Boot ─────────────────────────────────────────────────────
async function main(){
  console.log(`\n${C}${B}╔══════════════════════════════════════════════════╗`);
  console.log(`║        TRAKTOR YOUTUBE VISUALS                   ║`);
  console.log(`╚══════════════════════════════════════════════════╝${R}\n`);
  API_KEY=await loadApiKey();
  icecast.listen(ICECAST_PORT,'127.0.0.1',()=>log(G,'ICE  ',`Listening for Traktor on port ${ICECAST_PORT}`));
  webServer.listen(SERVER_PORT,()=>{
    // Print local IP so user knows what to type into Android app
    const os=require('os');
    const localIp=Object.values(os.networkInterfaces())
      .flat().find(i=>i.family==='IPv4'&&!i.internal)?.address||'localhost';
    log(G,'HTTP ',`Browser at http://localhost:${SERVER_PORT}`);
    log(G,'NET  ',`On your network: http://${localIp}:${SERVER_PORT}`);
    console.log(`\n  ${B}→ Browser: http://localhost:${SERVER_PORT}${R}`);
    console.log(`  ${B}→ Android TV: http://${localIp}:${SERVER_PORT}${R}\n`);
    // Advertise on local network via mDNS so Android app can auto-discover
    try {
      const bonjour=require('bonjour')();
      bonjour.publish({name:'TraktorVisuals',type:'http',port:SERVER_PORT});
      log(G,'MDNS ','Advertised on local network (Android Scan will find this)');
    } catch(_){
      log(Y,'MDNS ','bonjour not installed — Scan button won\'t work');
      log(Y,'MDNS ','Run: npm install bonjour  to enable auto-discovery');
    }
  });
}
main();
process.on('SIGINT',()=>{ console.log('\nStopped.\n'); process.exit(0); });
