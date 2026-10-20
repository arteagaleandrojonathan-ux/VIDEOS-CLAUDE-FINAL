console.log("ClipTube versión 2 cargada");
const $=id=>document.getElementById(id), sleep=ms=>new Promise(r=>setTimeout(r,ms));
const vid=$('vid'), cv=$('cv'), ctx=cv.getContext('2d');
const msg=t=>$('msg').textContent=t;
let ytPlayer=null, clipBlob=null, lines=[], allWords=[], recDur=0, asr=null, asrName='';
const st={color:'#ffe600',size:1,pos:.78,caps:true,off:0};

/* ---------- utilidades ---------- */
function parseT(s){s=String(s).trim();return s.includes(':')?s.split(':').reduce((a,b)=>a*60+(parseFloat(b)||0),0):(parseFloat(s)||0)}
function fmt(t){t=Math.max(0,t);const m=Math.floor(t/60),s=Math.floor(t%60);return m+':'+(s<10?'0':'')+s}
const dur=()=>isFinite(vid.duration)?vid.duration:recDur;

/* ---------- YouTube ---------- */
const tag=document.createElement('script');tag.src='https://www.youtube.com/iframe_api';document.head.appendChild(tag);
const ytId=u=>{const m=u.match(/(?:v=|youtu\.be\/|shorts\/|embed\/)([\w-]{11})/);return m&&m[1]};
$('load').onclick=()=>{
  const id=ytId($('url').value);
  if(!id)return msg('El enlace no es válido. Copia la dirección completa del video.');
  if(!window.YT||!YT.Player)return msg('YouTube aún está cargando, inténtalo de nuevo en un momento.');
  msg('');
  if(ytPlayer){ytPlayer.loadVideoById(id);ytPlayer.pauseVideo();return}
  ytPlayer=new YT.Player('player',{videoId:id,width:'100%',height:'100%',playerVars:{playsinline:1,rel:0}});
};
$('m0').onclick=()=>{if(ytPlayer)$('t0').value=fmt(ytPlayer.getCurrentTime())};
$('m1').onclick=()=>{if(ytPlayer)$('t1').value=fmt(ytPlayer.getCurrentTime())};

/* ---------- grabación de pestaña ---------- */
$('rec').onclick=async()=>{
  if(!ytPlayer)return msg('Primero carga un video de YouTube.');
  const s=parseT($('t0').value), e=parseT($('t1').value);
  if(e<=s)return msg('El fin debe ser mayor que el inicio.');
  let stream;
  try{stream=await navigator.mediaDevices.getDisplayMedia({video:{frameRate:30},audio:true,preferCurrentTab:true,selfBrowserSurface:'include'})}
  catch(err){return msg('No se concedió el permiso para grabar la pestaña.')}
  if(!stream.getAudioTracks().length)msg('Atención: no se compartió el audio de la pestaña; el clip saldrá sin sonido.');
  const vt=stream.getVideoTracks()[0];
  try{if(window.CropTarget){await vt.cropTo(await CropTarget.fromElement($('playerBox')))}}catch(_){}
  ytPlayer.seekTo(s,true);ytPlayer.pauseVideo();await sleep(1200);
  const mime=['video/webm;codecs=vp9,opus','video/webm;codecs=vp8,opus','video/webm'].find(m=>MediaRecorder.isTypeSupported(m));
  const chunks=[], mr=new MediaRecorder(stream,{mimeType:mime,videoBitsPerSecond:3e6});
  let stopped=false;
  const t0=performance.now();
  const stop=()=>{if(stopped)return;stopped=true;clearInterval(iv);try{ytPlayer.pauseVideo()}catch(_){}recDur=(performance.now()-t0)/1000;mr.stop()};
  mr.ondataavailable=ev=>ev.data.size&&chunks.push(ev.data);
  mr.onstop=()=>{stream.getTracks().forEach(t=>t.stop());loadClip(new Blob(chunks,{type:'video/webm'}));msg('Clip grabado. Ahora genera los subtítulos.')};
  vt.onended=stop;
  mr.start(1000);ytPlayer.playVideo();
  const iv=setInterval(()=>{
    const cur=ytPlayer.getCurrentTime();
    msg('Grabando… '+fmt(cur-s)+' / '+fmt(e-s));
    if(cur>=e||ytPlayer.getPlayerState()===0)stop();
  },200);
};
$('file').onchange=ev=>{const f=ev.target.files[0];if(f){recDur=0;loadClip(f);msg('Video cargado.')}};

/* ---------- editor ---------- */
function loadClip(blob){
  clipBlob=blob;lines=[];allWords=[];renderList();$('styleBox').classList.add('hide');
  $('editor').classList.remove('hide');
  const url=URL.createObjectURL(blob);
  vid.src=url;$('raw').href=url;
  vid.onloadedmetadata=()=>{
    if(!isFinite(vid.duration)){ // los WebM grabados no traen duración
      vid.currentTime=1e7;
      vid.ontimeupdate=()=>{vid.ontimeupdate=null;recDur=vid.duration;vid.currentTime=0;ready()};
    }else ready();
  };
  vid.load();
}
let loopOn=false;
function ready(){
  const w=vid.videoWidth||1280,h=vid.videoHeight||720,k=Math.min(1,1280/w);
  cv.width=Math.round(w*k);cv.height=Math.round(h*k);
  vid.ontimeupdate=()=>{$('seek').value=dur()?vid.currentTime/dur()*1000:0};
  vid.onended=()=>{$('play').textContent='Reproducir'};
  if(!loopOn){loopOn=true;requestAnimationFrame(frame)}
  if(dur()>300){$('model').value='Xenova/whisper-tiny';msg('Clip largo: se eligió el modelo rápido (tiny) para que termine antes.')}
}
function frame(){
  if(vid.videoWidth){ctx.drawImage(vid,0,0,cv.width,cv.height);drawSub(vid.currentTime-st.off)}
  requestAnimationFrame(frame);
}
$('play').onclick=()=>{if(vid.paused){vid.play();$('play').textContent='Pausar'}else{vid.pause();$('play').textContent='Reproducir'}};
$('seek').oninput=e=>{vid.currentTime=e.target.value/1000*dur()};

/* ---------- subtítulos animados ---------- */
function drawSub(t){
  const i=lines.findIndex((l,n)=>{const nx=lines[n+1];return t>=l.s&&t<(nx?Math.min(l.e+.3,nx.s):l.e+.3)});
  if(i<0)return;
  const L=lines[i],H=cv.height,W=cv.width;
  const txt=w=>st.caps?w.toUpperCase():w;
  const set=f=>ctx.font='900 '+f+'px "Arial Black",Impact,"Segoe UI",sans-serif';
  let fs=H*.07*st.size,sp,ws,total;
  const measure=()=>{set(fs);sp=fs*.28;ws=L.words.map(w=>ctx.measureText(txt(w.w)).width);total=ws.reduce((a,b)=>a+b,0)+sp*(ws.length-1)};
  measure();
  if(total>W*.9){fs*=W*.9/total;measure()}
  let x=(W-total)/2;const y=H*st.pos;
  ctx.textBaseline='middle';ctx.textAlign='center';ctx.lineJoin='round';
  L.words.forEach((w,n)=>{
    const nx=L.words[n+1],active=t>=w.s&&(!nx||t<nx.s);
    const k=active?1+.2*Math.max(0,1-(t-w.s)/.14):1;
    ctx.save();ctx.translate(x+ws[n]/2,y);ctx.scale(k,k);
    ctx.lineWidth=fs*.2;ctx.strokeStyle='#000';ctx.strokeText(txt(w.w),0,0);
    ctx.fillStyle=active?st.color:'#fff';ctx.fillText(txt(w.w),0,0);
    ctx.restore();x+=ws[n]+sp;
  });
}
function build(){
  const max=+$('wpl').value,out=[];let cur=[];
  allWords.forEach((w,i)=>{
    cur.push(w);const nx=allWords[i+1];
    if(cur.length>=max||/[.,!?;:]$/.test(w.w)||(nx&&nx.s-w.e>.7)||!nx){out.push({s:cur[0].s,e:cur[cur.length-1].e,words:cur});cur=[]}
  });
  lines=out;renderList();
}
function renderList(){
  const box=$('list');box.innerHTML='';
  lines.forEach((L,i)=>{
    const d=document.createElement('div');d.className='ln';
    const b=document.createElement('button');b.className='g';b.textContent=fmt(L.s);b.onclick=()=>{vid.currentTime=L.s};
    const inp=document.createElement('input');inp.value=L.words.map(w=>w.w).join(' ');inp.setAttribute('aria-label','Línea '+(i+1));
    inp.onchange=()=>{
      const ws=inp.value.trim().split(/\s+/).filter(Boolean);
      if(!ws.length){lines.splice(i,1);renderList();return}
      const step=(L.e-L.s)/ws.length;
      L.words=ws.map((w,k)=>({w,s:L.s+step*k,e:L.s+step*(k+1)}));
    };
    d.append(b,inp);box.append(d);
  });
}
['color','size','pos','off'].forEach(id=>$(id).oninput=()=>{
  st.color=$('color').value;st.size=$('size').value/100;st.pos=$('pos').value/100;st.off=+$('off').value;
});
$('caps').onchange=()=>st.caps=$('caps').value==='1';
$('wpl').onchange=()=>{if(allWords.length)build()};

/* ---------- transcripción en el navegador (Whisper) ---------- */
async function getAudio(blob){
  const ac=new AudioContext({sampleRate:16000});
  const buf=await ac.decodeAudioData(await blob.arrayBuffer());
  const n=buf.numberOfChannels,len=buf.length,out=new Float32Array(len);
  for(let c=0;c<n;c++){const d=buf.getChannelData(c);for(let i=0;i<len;i++)out[i]+=d[i]/n}
  ac.close();return out;
}
let worker=null;
const mmss=s=>{s=Math.max(0,Math.round(s));return Math.floor(s/60)+':'+String(s%60).padStart(2,'0')};
function setBar(p,t){$('prog').classList.remove('hide');$('barFill').style.width=Math.round(p*100)+'%';$('barTxt').textContent=t}
function endGen(){$('gen').disabled=false;if(worker){worker.terminate();worker=null}}
$('cancel').onclick=()=>{endGen();$('prog').classList.add('hide');msg('Transcripción cancelada.')};
$('gen').onclick=async()=>{
  if(!clipBlob)return;
  $('gen').disabled=true;$('styleBox').classList.add('hide');
  try{
    setBar(0,'Leyendo el audio…');msg('Preparando el audio, en clips largos puede tardar unos segundos…');
    await sleep(60);
    const audio=await getAudio(clipBlob);
    worker=new Worker('worker.js?v=2',{type:'module'});
    let tStart=0;
    worker.onmessage=({data:d})=>{
      if(d.type==='model')setBar(d.pct/100,'Descargando modelo… '+Math.round(d.pct)+'% (solo la primera vez)');
      else if(d.type==='start'){tStart=performance.now();setBar(0,'Transcribiendo… 0%');msg('Transcribiendo. Puedes seguir viendo el clip mientras tanto.')}
      else if(d.type==='progress'){
        const p=d.done/d.total,el=(performance.now()-tStart)/1000,eta=p>0.03?el/p-el:null;
        setBar(p,'Transcribiendo… '+Math.round(p*100)+'% · '+mmss(d.done)+' de '+mmss(d.total)+(eta!==null?' · faltan ~'+mmss(eta):''));
      }
      else if(d.type==='done'){
        allWords=d.words.filter(w=>w.w&&!/^[\[(].*[\])]$/.test(w.w));
        endGen();
        if(!allWords.length){setBar(1,'Terminado');msg('No se detectó voz en el clip.');return}
        build();$('styleBox').classList.remove('hide');setBar(1,'Listo');
        msg('Listo: '+lines.length+' líneas. Corrige lo que haga falta y exporta.');vid.currentTime=0;
      }
      else if(d.type==='error'){endGen();$('prog').classList.add('hide');msg('No se pudo transcribir: '+d.message)}
    };
    worker.onerror=e=>{endGen();$('prog').classList.add('hide');msg('Error del procesador de subtítulos: '+(e.message||'revisa que worker.js esté subido junto a index.html'))};
    worker.postMessage({audio,model:$('model').value,lang:$('lang').value},[audio.buffer]);
  }catch(err){console.error(err);endGen();$('prog').classList.add('hide');msg('No se pudo leer el audio: '+(err.message||err))}
};

/* ---------- exportación con subtítulos y audio ---------- */
let ac2=null,gainNode,dest;
$('exp').onclick=async()=>{
  const mime=['video/mp4;codecs=avc1.42E01E,mp4a.40.2','video/webm;codecs=vp9,opus','video/webm'].find(m=>MediaRecorder.isTypeSupported(m));
  const ext=mime.startsWith('video/mp4')?'mp4':'webm';
  const btn=$('exp');btn.disabled=true;
  try{
    if(!ac2){
      ac2=new AudioContext();const src=ac2.createMediaElementSource(vid);
      gainNode=ac2.createGain();dest=ac2.createMediaStreamDestination();
      src.connect(gainNode);gainNode.connect(ac2.destination);src.connect(dest);
    }
    await ac2.resume();gainNode.gain.value=0;vid.pause();
    if(vid.currentTime>0.05){vid.currentTime=0;await new Promise(r=>vid.addEventListener('seeked',r,{once:true}))}
    const cs=cv.captureStream(30);dest.stream.getAudioTracks().forEach(t=>cs.addTrack(t));
    const chunks=[],mr=new MediaRecorder(cs,{mimeType:mime,videoBitsPerSecond:4e6});
    mr.ondataavailable=ev=>ev.data.size&&chunks.push(ev.data);
    const done=new Promise(r=>mr.onstop=r);
    const prev=vid.ontimeupdate;
    vid.ontimeupdate=()=>{msg('Exportando… '+Math.round(vid.currentTime/dur()*100)+'%');prev&&prev()};
    vid.onended=()=>setTimeout(()=>mr.stop(),400);
    mr.start(1000);await vid.play();await done;
    vid.ontimeupdate=prev;vid.onended=()=>{$('play').textContent='Reproducir'};
    gainNode.gain.value=1;
    const a=document.createElement('a');a.href=URL.createObjectURL(new Blob(chunks,{type:mime.split(';')[0]}));
    a.download='cliptube-subtitulado.'+ext;a.click();
    msg('Exportación lista: se descargó el archivo .'+ext);
  }catch(err){console.error(err);msg('Falló la exportación: '+(err.message||err))}
  finally{btn.disabled=false}
};
