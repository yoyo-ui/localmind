(()=>{
const root=typeof window!=="undefined"?window:globalThis;
const ls=(k,v)=>{try{if(v===undefined)return localStorage.getItem(k)||"";localStorage.setItem(k,v)}catch(e){return ""}};
const b64u=a=>btoa(String.fromCharCode(...a)).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");
const unb64u=s=>Uint8Array.from(atob(s.replace(/-/g,"+").replace(/_/g,"/")+"=".repeat((4-s.length%4)%4)),c=>c.charCodeAt(0));
const rnd=n=>crypto.getRandomValues(new Uint8Array(n));
const sleep=ms=>new Promise(r=>setTimeout(r,ms));

// secret channel + AES key, made once per install; the notebook gets a copy
function ident(){
  let c=ls("lm_ch"),s=ls("lm_sec");
  if(!c||!s){c="lm-"+[...rnd(16)].map(b=>b.toString(16).padStart(2,"0")).join("");s=b64u(rnd(32));ls("lm_ch",c);ls("lm_sec",s)}
  return{ch:c,sec:s};
}

// HTTP that avoids CORS: Electron main process, Capacitor native HTTP, or plain fetch
async function nfetch(url,o={}){
  const m=o.method||"GET",h=Object.assign({},o.headers||{});let body=o.body||null;
  if(o.json){h["Content-Type"]="application/json";body=JSON.stringify(o.json)}
  if(o.form){h["Content-Type"]="application/x-www-form-urlencoded";body=new URLSearchParams(o.form).toString()}
  if(root.native)return root.native.http({url,method:m,headers:h,body});
  const C=root.Capacitor;
  if(C&&C.isNativePlatform&&C.isNativePlatform()&&C.Plugins&&C.Plugins.CapacitorHttp){
    const r=await C.Plugins.CapacitorHttp.request({url,method:m,headers:h,data:o.json||o.form||body,responseType:"text"});
    return{ok:r.status<400,status:r.status,text:typeof r.data==="string"?r.data:JSON.stringify(r.data)};
  }
  const r=await fetch(url,{method:m,headers:h,body});
  return{ok:r.ok,status:r.status,text:await r.text()};
}

// auto-connect: the notebook posts the encrypted URL+key to a private ntfy channel
let es,esCh;
function listen(){
  const{ch,sec}=ident();if(es&&esCh===ch)return;if(es)es.close();esCh=ch;
  es=new EventSource("https://ntfy.sh/"+ch+"/sse?since=6h");
  es.onmessage=async ev=>{try{
    const d=JSON.parse(ev.data);if(d.event!=="message"||!d.message)return;
    const raw=unb64u(d.message),k=await crypto.subtle.importKey("raw",unb64u(sec),"AES-GCM",false,["decrypt"]);
    const pt=await crypto.subtle.decrypt({name:"AES-GCM",iv:raw.slice(0,12)},k,raw.slice(12));
    const j=JSON.parse(new TextDecoder().decode(pt));
    if(root.lmConnect)root.lmConnect(j.url,j.key);
  }catch(e){}};
}

// Kaggle: push + run the notebook with GPU and Internet on
async function kaggleLaunch(nb){
  const u=ls("kg_user").trim(),k=ls("kg_key").trim();
  if(!u||!k)throw new Error("Add your Kaggle username and API key under Accounts first.");
  const r=await nfetch("https://www.kaggle.com/api/v1/kernels/push",{method:"POST",
    headers:{Authorization:k.startsWith("KGAT_")?"Bearer "+k:"Basic "+btoa(u+":"+k)},
    json:{slug:u+"/localmind-server",newTitle:"LocalMind Server",text:JSON.stringify(nb),language:"python",kernelType:"notebook",
      isPrivate:true,enableGpu:true,enableInternet:true,enableTpu:false,datasetDataSources:[],competitionDataSources:[],
      kernelDataSources:[],modelDataSources:[],categoryIds:[]}});
  let j={};try{j=JSON.parse(r.text)}catch(_){}
  const err=j.error||j.errorNullable||(!r.ok&&(j.message||"Kaggle answered "+r.status));
  if(err)throw new Error(err);
  return j.url||"https://www.kaggle.com/code/"+u+"/localmind-server";
}

// Google: device-code sign-in (works in any app), then save the notebook to Drive
async function gform(url,form){
  const r=await nfetch(url,{method:"POST",form});
  try{return JSON.parse(r.text)}catch(_){return{error:"bad_response",error_description:"Google answered "+r.status}}
}
async function googleToken(say){
  const id=ls("g_id").trim(),sec=ls("g_secret").trim();
  if(!id||!sec)throw new Error("Add your Google client ID and secret under Accounts first.");
  const rt=ls("g_refresh");
  if(rt){const t=await gform("https://oauth2.googleapis.com/token",{client_id:id,client_secret:sec,refresh_token:rt,grant_type:"refresh_token"});if(t.access_token)return t.access_token}
  const d=await gform("https://oauth2.googleapis.com/device/code",{client_id:id,scope:"https://www.googleapis.com/auth/drive.file"});
  if(!d.device_code)throw new Error(d.error_description||"Google refused the sign-in. Check the client ID.");
  const vu=d.verification_url||d.verification_uri;
  say("Open the link and enter this code: "+d.user_code,vu);
  const end=Date.now()+(d.expires_in||300)*1000;let wait=(d.interval||5)*1000;
  while(Date.now()<end){
    await sleep(wait);
    const t=await gform("https://oauth2.googleapis.com/token",{client_id:id,client_secret:sec,device_code:d.device_code,grant_type:"urn:ietf:params:oauth:grant-type:device_code"});
    if(t.access_token){if(t.refresh_token)ls("g_refresh",t.refresh_token);return t.access_token}
    if(t.error==="slow_down")wait+=5000;
    else if(t.error&&t.error!=="authorization_pending")throw new Error(t.error_description||t.error);
  }
  throw new Error("Sign-in timed out. Try again.");
}
async function drivePush(name,nb,tok){
  const b="lmb"+Date.now();
  const body="--"+b+"\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n"+JSON.stringify({name,mimeType:"application/vnd.google.colaboratory"})
    +"\r\n--"+b+"\r\nContent-Type: application/json\r\n\r\n"+JSON.stringify(nb)+"\r\n--"+b+"--";
  const r=await nfetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id",
    {method:"POST",headers:{Authorization:"Bearer "+tok,"Content-Type":"multipart/related; boundary="+b},body});
  let j={};try{j=JSON.parse(r.text)}catch(_){}
  if(!j.id)throw new Error((j.error&&j.error.message)||"Drive refused the file ("+r.status+").");
  return "https://colab.research.google.com/drive/"+j.id;
}
root.LM={ls,ident,nfetch,listen,kaggleLaunch,googleToken,drivePush};
if(typeof module!=="undefined")module.exports=root.LM;
})();
