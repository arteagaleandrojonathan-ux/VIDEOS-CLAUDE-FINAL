// Corre la transcripción en segundo plano para que la página no se congele.
import {pipeline,env} from 'https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2';
env.allowLocalModels=false;
let asr=null,name='';
const SR=16000;

// Busca el instante más silencioso cerca del final para no cortar una palabra a la mitad.
function cutPoint(a,from,to){
  const w=1600;let best=to,bv=Infinity;
  for(let i=from;i+w<=to;i+=800){
    let e=0;for(let j=i;j<i+w;j+=8)e+=a[j]*a[j];
    if(e<bv){bv=e;best=i+w/2}
  }
  return Math.round(best);
}
function rms(a){let e=0,n=0;for(let i=0;i<a.length;i+=16){e+=a[i]*a[i];n++}return Math.sqrt(e/Math.max(1,n))}

self.onmessage=async({data})=>{
  try{
    const {audio,model,lang}=data;
    if(!asr||name!==model){
      const files={};
      asr=await pipeline('automatic-speech-recognition',model,{progress_callback:p=>{
        if(p.status==='progress'){
          files[p.file]=p;let l=0,t=0;
          for(const f of Object.values(files)){l+=f.loaded||0;t+=f.total||0}
          self.postMessage({type:'model',pct:t?l/t*100:0});
        }
      }});
      name=model;
    }
    self.postMessage({type:'start'});
    const total=audio.length,words=[];
    let pos=0;
    while(pos<total){
      let end=Math.min(pos+30*SR,total);
      if(end<total)end=cutPoint(audio,end-3*SR,end);
      const seg=audio.subarray(pos,end);
      if(seg.length>SR*0.3&&rms(seg)>0.003){
        const out=await asr(seg,{return_timestamps:'word',...(lang?{language:lang,task:'transcribe'}:{})});
        const off=pos/SR;
        for(const c of out.chunks||[]){
          const s=c.timestamp[0]+off;
          words.push({w:c.text.trim(),s,e:(c.timestamp[1]??c.timestamp[0]+.4)+off});
        }
      }
      pos=end;
      self.postMessage({type:'progress',done:pos/SR,total:total/SR});
    }
    self.postMessage({type:'done',words});
  }catch(err){self.postMessage({type:'error',message:String(err&&err.message||err)})}
};
