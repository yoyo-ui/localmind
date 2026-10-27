const { app, BrowserWindow, Menu, shell, ipcMain } = require("electron");
const path = require("path");
let autoUpdater;
try { ({ autoUpdater } = require("electron-updater")); } catch (e) {}
ipcMain.on("install-update", () => autoUpdater && autoUpdater.quitAndInstall());
const ALLOWED = ["kaggle.com", "googleapis.com"];
ipcMain.handle("http", async (_e, { url, method, headers, body }) => {
  try {
    const u = new URL(url);
    if (u.protocol !== "https:" || !ALLOWED.some((h) => u.hostname === h || u.hostname.endsWith("." + h)))
      return { ok: false, status: 0, text: "Blocked host" };
    const r = await fetch(url, { method, headers, body: body || undefined });
    return { ok: r.ok, status: r.status, text: await r.text() };
  } catch (e) { return { ok: false, status: 0, text: String(e.message) }; }
});
app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
  const w = new BrowserWindow({ width: 520, height: 820, backgroundColor: "#0f1226",
    icon: path.join(__dirname, "../build/icon.png"),
    webPreferences: { preload: path.join(__dirname, "preload.js"), contextIsolation: true } });
  w.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: "deny" }; });
  w.loadFile(path.join(__dirname, "../www/index.html"));
  if (app.isPackaged && autoUpdater) {
    autoUpdater.on("update-downloaded", () => w.webContents.send("update", "ready"));
    autoUpdater.on("error", () => {});
    autoUpdater.checkForUpdates().catch(() => {});
  }
});
app.on("window-all-closed", () => app.quit());
