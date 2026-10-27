const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("native", {
  http: (r) => ipcRenderer.invoke("http", r),
  onUpdate: (cb) => ipcRenderer.on("update", (_e, v) => cb(v)),
  installUpdate: () => ipcRenderer.send("install-update"),
});
