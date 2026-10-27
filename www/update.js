(()=>{
const V=window.LM_VERSION||{version:"0.0.0",repo:""};
const nv=s=>String(s).replace(/^v/,"").split(".").map(n=>parseInt(n)||0);
const newer=(a,b)=>{a=nv(a);b=nv(b);for(let i=0;i<3;i++){if((a[i]||0)!==(b[i]||0))return(a[i]||0)>(b[i]||0)}return false};
const bar=document.getElementById("upd"),txt=document.getElementById("updt"),btn=document.getElementById("updb");
const isApp=!!(window.Capacitor&&window.Capacitor.isNativePlatform&&window.Capacitor.isNativePlatform());
function show(t,label,fn){txt.textContent=t;btn.textContent=label;btn.onclick=fn;bar.hidden=false}
const open=u=>isApp?(location.href=u):window.open(u,"_blank");
async function check(){
  if(!V.repo)return"error";
  try{
    const r=await fetch("https://api.github.com/repos/"+V.repo+"/releases/latest");if(!r.ok)return"error";
    const j=await r.json();if(!newer(j.tag_name,V.version))return"latest";
    const as=j.assets||[],a=as.find(x=>isApp?/\.apk$/i.test(x.name):/setup.*\.exe$/i.test(x.name))||as.find(x=>isApp?/\.apk$/i.test(x.name):/\.exe$/i.test(x.name));
    const url=a?a.browser_download_url:j.html_url;
    show("New version "+j.tag_name+" is out","Download",()=>open(url));return"new";
  }catch(e){return"error"}
}
if(window.native&&window.native.onUpdate)window.native.onUpdate(v=>{if(v==="ready")show("Update downloaded","Restart",()=>window.native.installUpdate())});
window.lmCheck=check;check();
})();
