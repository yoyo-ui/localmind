(()=>{
const GPUS={T4:{v:15,a:75,n:1},L4:{v:22,a:89,n:1},A100:{v:40,a:80,n:1},K2:{v:30,a:75,n:2,k:1}};
function parseHF(s){
  const p=String(s).trim().replace(/^https?:\/\/(www\.)?huggingface\.co\//,"").split(/[?#]/)[0].split("/").filter(Boolean);
  if(p.length<2)return null;
  return{id:p[0]+"/"+p[1],file:(p[2]==="blob"||p[2]==="resolve")&&p.length>4?p.slice(4).join("/"):null};
}
async function inspect(link,gpu){
  const r=parseHF(link);
  if(!r)throw new Error("Paste a Hugging Face model link, like https://huggingface.co/owner/model");
  const res=await fetch("https://huggingface.co/api/models/"+r.id+"?blobs=true");
  if(!res.ok)throw new Error("Can't find that model (error "+res.status+"). Check the link.");
  const m=await res.json(),fs=m.siblings||[],vram=GPUS[gpu].v,bud=vram*(GPUS[gpu].n>1?0.8:0.85),notes=[];
  const tags=(m.tags||[]).join(" ").toLowerCase(),gb=f=>(f.size||0)/1e9;
  const info={id:r.id,gated:!!m.gated,gpu,notes,uncens:/abliterat|uncensor|crack/.test(tags)};
  const gg=fs.filter(f=>/\.gguf$/i.test(f.rfilename)&&!/mmproj/i.test(f.rfilename)&&!/-\d{5}-of-\d{5}/.test(f.rfilename));
  if(gg.length){
    const mm=fs.filter(f=>/mmproj.*\.gguf$/i.test(f.rfilename)).sort((a,b)=>/f16/i.test(b.rfilename)-/f16/i.test(a.rfilename))[0];
    let pick;
    if(r.file){pick=gg.find(f=>f.rfilename===r.file);if(!pick)throw new Error("That file isn't in the repo.")}
    else{
      const fit=gg.filter(f=>gb(f)<=bud-(mm?gb(mm):0)).sort((a,b)=>gb(b)-gb(a));
      pick=fit[0]||gg.slice().sort((a,b)=>gb(a)-gb(b))[0];
    }
    info.kind="gguf";info.file=pick.rfilename;info.size=gb(pick);info.mmproj=mm?mm.rfilename:null;info.vision=!!mm;
    if(info.size>bud)notes.push("This file ("+info.size.toFixed(1)+" GB) is too big for "+gpu+". Pick a bigger GPU or a smaller model."+(gpu!=="K2"&&info.size<=24?" Kaggle (free, 2×T4, 30 GB) fits it.":""));
    else if(/(^|[-_.])(I?Q[123])/i.test(pick.rfilename))notes.push("Low-bit file, so quality drops. A bigger GPU lets you use a better one.");
    return info;
  }
  if(/\bmlx\b|jang/.test(tags)||m.library_name==="mlx"){
    info.kind="apple";
    notes.push("This model is built for Apple Silicon (MLX), so Colab can't run it. Look for a GGUF version of it instead.");
    info.search="https://huggingface.co/models?search="+encodeURIComponent(r.id.split("/")[1].split(/[-_]/).filter(t=>!/^(jang|crack|mlx|\d+m|\d+bit)$/i.test(t)).join(" ")+" gguf");
    return info;
  }
  const st=fs.filter(f=>/\.safetensors$/i.test(f.rfilename));
  if(!st.length)throw new Error("No GGUF or safetensors files in this repo.");
  info.kind="vllm";info.vision=m.pipeline_tag==="image-text-to-text";info.size=st.reduce((a,f)=>a+gb(f),0);
  if(info.size>bud)notes.push("Weights are "+info.size.toFixed(1)+" GB, too big for "+gpu+". Try a GGUF or 4-bit version.");
  return info;
}
async function alternatives(info){
  const q=info.id.split("/")[1].split(/[-_]/).filter(t=>!/^(jang|crack|mlx|\d+m|\d+-?bit)$/i.test(t)).join("-");
  const r=await fetch("https://huggingface.co/api/models?search="+encodeURIComponent(q)+"&filter=gguf&sort=downloads&direction=-1&limit=40");
  if(!r.ok)return[];
  const key=q.toLowerCase().replace(/-it$/,""),un=/abliterat|uncensor|heretic|unfilter/i;
  return(await r.json()).filter(m=>m.id!==info.id&&m.id.toLowerCase().includes(key))
    .sort((a,b)=>(info.uncens?un.test(b.id)-un.test(a.id):0)||(b.downloads||0)-(a.downloads||0)).slice(0,6);
}
function cells(i,ex){
  const g=GPUS[i.gpu],ctx=g.v<20?4096:8192,gguf=i.kind==="gguf",c=[];
  const chk=String.raw`import os, glob, shutil, subprocess
def sh(c):
    r = subprocess.run(c, shell=True, text=True, capture_output=True)
    if r.returncode: raise SystemExit("Failed: " + c + "\n" + (r.stdout + r.stderr)[-1500:])
if subprocess.run("nvidia-smi -L", shell=True, capture_output=True).returncode:
    raise SystemExit("No GPU found. Runtime > Change runtime type > pick a GPU, then run again.")`;
  const cfp='sh("wget -q https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 -O cf && chmod +x cf")';
  c.push(gguf?"# 1) Build llama.cpp for this GPU (about 15 to 25 minutes)\n"+chk+"\n"+String.raw`nv = glob.glob("/usr/local/cuda*/bin/nvcc")
if not shutil.which("nvcc") and nv:
    os.environ["PATH"] = os.path.dirname(sorted(nv)[-1]) + ":" + os.environ["PATH"]
if not shutil.which("nvcc"):
    raise SystemExit("No CUDA compiler (nvcc) on this runtime. Disconnect and delete the runtime, reconnect with a GPU, or use Kaggle.")
try:
    arch = subprocess.check_output("nvidia-smi --query-gpu=compute_cap --format=csv,noheader", shell=True, text=True).split()[0].replace(".", "")
except Exception:
    arch = "${g.a}"
sh("rm -rf llama.cpp && git clone -q --depth 1 https://github.com/ggml-org/llama.cpp")
sh(f"cmake -S llama.cpp -B llama.cpp/build -DGGML_CUDA=ON -DCMAKE_CUDA_ARCHITECTURES={arch} -DLLAMA_CURL=OFF -DCMAKE_BUILD_TYPE=Release")
sh("cmake --build llama.cpp/build -j 2 --target llama-server")
`+cfp+'\nprint("Build done.")'
    :"# 1) Install vLLM\n"+chk+'\nsh("python -m pip -q install vllm")\n'+cfp+'\nprint("Install done.")');
  const dl=gguf?"from huggingface_hub import hf_hub_download\nMODEL = hf_hub_download("+JSON.stringify(i.id)+", "+JSON.stringify(i.file)+")"+(i.mmproj?"\nMMPROJ = hf_hub_download("+JSON.stringify(i.id)+", "+JSON.stringify(i.mmproj)+")":"")
    :"from huggingface_hub import snapshot_download\nsnapshot_download("+JSON.stringify(i.id)+")";
  c.push("# 2) Download the model\n"+(i.gated?"from huggingface_hub import login\nlogin()  # gated model: paste your Hugging Face token\n":"")+dl);
  const ts=gguf?'TS = ["-ts", ",".join(["1"] * ngpu)] if ngpu > 1 else []':'TS = ["--tensor-parallel-size", str(ngpu)] if ngpu > 1 else []';
  const cmd=gguf?`["llama.cpp/build/bin/llama-server","-m",MODEL,${i.mmproj?'"--mmproj",MMPROJ,':""}"-ngl","99"]+TS+["-c","${ctx}","--host","127.0.0.1","--port","8000","--api-key",KEY]`
    :`["vllm","serve",${JSON.stringify(i.id)},"--max-model-len","${ctx}","--dtype","half"]+TS+["--port","8000","--api-key",KEY]`;
  const consts=ex?"CHANNEL = "+JSON.stringify(ex.ch)+"\nSECRET = "+JSON.stringify(ex.sec)+"\n":"";
  const post=ex?String.raw`
if m:
    try:
        from cryptography.hazmat.primitives.ciphers.aead import AESGCM
        n = os.urandom(12)
        ct = AESGCM(base64.urlsafe_b64decode(SECRET + "=" * (-len(SECRET) % 4))).encrypt(n, json.dumps({"url": m.group(0), "key": KEY}).encode(), None)
        urllib.request.urlopen(urllib.request.Request("https://ntfy.sh/" + CHANNEL, data=base64.b64encode(n + ct), method="POST"), timeout=10)
        print("Sent to the app. It connects by itself.")
    except Exception as e:
        print("Auto-connect failed, paste the URL and key by hand:", e)`:"";
  const keep=g.k?'\nprint("Server is running. Keep this notebook running.")\nwhile True:\n    time.sleep(60)':"";
  c.push(String.raw`# 3) Start the server and the public link
import os, subprocess, secrets, re, time, urllib.request, json, base64
`+consts+String.raw`ngpu = len(subprocess.run("nvidia-smi -L", shell=True, capture_output=True, text=True).stdout.strip().splitlines())
${ts}${gguf?String.raw`
vram = sum(int(x) for x in subprocess.check_output("nvidia-smi --query-gpu=memory.total --format=csv,noheader,nounits", shell=True, text=True).split()) / 1024
size = os.path.getsize(MODEL) / 2**30
print(f"GPUs: {ngpu}, GPU memory: {vram:.1f} GB, model file: {size:.1f} GB")
if size > vram * 0.9:
    raise SystemExit(f"This model needs about {size:.1f} GB but the GPU has {vram:.1f} GB. Use a smaller file or a bigger GPU.")`:""}
KEY = secrets.token_urlsafe(16)
subprocess.Popen(${cmd}, stdout=open("server.log","w"), stderr=subprocess.STDOUT)
for _ in range(240):
    try:
        urllib.request.urlopen(urllib.request.Request("http://127.0.0.1:8000/v1/models", headers={"Authorization": "Bearer " + KEY}), timeout=3)
        break
    except Exception:
        time.sleep(5)
else:
    raise SystemExit("Server did not start. Check server.log")
subprocess.Popen(["./cf","tunnel","--url","http://127.0.0.1:8000"], stdout=subprocess.DEVNULL, stderr=open("cf.log","w"))
m = None
for _ in range(60):
    m = re.search(r"https://[a-z0-9-]+\.trycloudflare\.com", open("cf.log").read())
    if m: break
    time.sleep(1)
print("Server URL:", m.group(0) if m else "not ready, run this cell again")
print("API key:   ", KEY)`+post+keep);
  if(g.k)c[0]="# Kaggle: Settings > Accelerator: GPU T4 x2, Internet: On\n"+c[0];
  return c;
}
if(typeof module!=="undefined")module.exports={parseHF,inspect,cells,alternatives};
if(typeof document==="undefined")return;
const $=i=>document.getElementById(i);
function el(t,c,x){const e=document.createElement(t);if(c)e.className=c;if(x!=null)e.textContent=x;return e}
function btn(t,f){const b=el("button",null,t);b.onclick=f;return b}
let runs=0;
function nbJSON(i){return{cells:cells(i,LM.ident()).map(x=>({cell_type:"code",metadata:{},execution_count:null,outputs:[],source:x.split("\n").map((l,k,a)=>k<a.length-1?l+"\n":l)})),
  metadata:{accelerator:"GPU",kernelspec:{name:"python3",display_name:"Python 3"}},nbformat:4,nbformat_minor:0}}
function show(i){
  runs++;LM.listen();
  const r=$("res");r.replaceChildren();
  i.notes.forEach(n=>r.appendChild(el("p","warn",n)));
  if(i.kind==="apple"){
    const box=el("div"),stamp=runs;box.appendChild(el("p","note","Looking for versions that run on free GPUs…"));r.appendChild(box);
    const fb=()=>{box.replaceChildren();const a=el("a",null,"Search Hugging Face for a GGUF version");a.href=i.search;a.target="_blank";a.rel="noopener";box.appendChild(a)};
    alternatives(i).then(list=>{
      if(stamp!==runs)return;box.replaceChildren();
      if(!list.length)return fb();
      box.appendChild(el("p","note","Tap one to build the notebook for it:"));
      list.forEach(m=>{const b=btn(m.id+" · "+(m.downloads||0).toLocaleString()+" downloads",()=>{$("hf").value=m.id;$("gen").click()});b.className="alt";box.appendChild(b)});
    }).catch(fb);
    return}
  r.appendChild(el("p","note",i.id+" · "+(i.kind==="gguf"?i.file+" ("+i.size.toFixed(1)+" GB)":"full weights via vLLM")+" · "+i.gpu+(i.vision?" · photos OK":" · text only")));
  const row=el("div","row"),msg=el("p","note"),k=GPUS[i.gpu].k;
  const say=(t,u)=>{msg.className="note";msg.textContent=t+" ";if(u){const a=el("a",null,"Open");a.href=u;a.target="_blank";a.rel="noopener";msg.append(a)}};
  const go=f=>async()=>{say("Working…");try{await f()}catch(e){msg.className="warn";msg.textContent=e.message}};
  row.appendChild(btn(k?"Launch on Kaggle":"Save to Drive + open Colab",go(async()=>{
    if(k)say("Started on Kaggle. It takes 15 to 25 minutes, then the app connects by itself. Stop it on Kaggle when you're done.",await LM.kaggleLaunch(nbJSON(i)));
    else{const t=await LM.googleToken(say);say("Saved to your Drive. Open it, set a GPU runtime, press Run all.",await LM.drivePush("LocalMind_"+i.id.split("/")[1]+".ipynb",nbJSON(i),t))}
  })));
  row.appendChild(btn("Copy code",async()=>{
    const code=cells(i,LM.ident()).join("\n\n");
    try{await navigator.clipboard.writeText(code)}catch(e){const t=el("textarea");t.value=code;document.body.appendChild(t);t.select();document.execCommand("copy");t.remove()}
    say("Copied. Paste it into one cell of a new notebook and run it.")}));
  if(!(window.Capacitor&&window.Capacitor.isNativePlatform&&window.Capacitor.isNativePlatform()))
    row.appendChild(btn("Download .ipynb",()=>{
      const a=el("a");a.href=URL.createObjectURL(new Blob([JSON.stringify(nbJSON(i))],{type:"application/json"}));
      a.download="LocalMind_"+i.id.split("/")[1]+".ipynb";a.click()}));
  const oc=el("a","btn",k?"Open Kaggle":"Open Colab");oc.href=k?"https://www.kaggle.com/code":"https://colab.new";oc.target="_blank";oc.rel="noopener";row.appendChild(oc);
  r.appendChild(row);r.appendChild(msg);
  r.appendChild(el("p","note",(k?"By hand on Kaggle (needs a phone-verified account): new notebook, Accelerator GPU T4 x2, Internet On, then run. ":"By hand: run it on a GPU runtime. ")+"When the server is ready the app connects by itself. If it doesn't, paste the printed Server URL and API key under Server."));
}
[["kgu","kg_user"],["kgk","kg_key"],["gid","g_id"],["gsec","g_secret"]].forEach(([id,k])=>{const e=$(id);e.value=LM.ls(k);e.oninput=()=>LM.ls(k,e.value)});
$("mdl").onclick=()=>$("md").showModal();
$("mclose").onclick=()=>$("md").close();
$("gen").onclick=async()=>{
  $("res").replaceChildren(el("p","note","Checking the model…"));
  try{show(await inspect($("hf").value,$("gpu").value))}catch(e){$("res").replaceChildren(el("p","warn",e.message))}
};
})();
