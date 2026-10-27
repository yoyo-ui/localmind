const { app, BrowserWindow, Menu, shell } = require("electron");
const path = require("path");
app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
  const w = new BrowserWindow({ width: 520, height: 820, backgroundColor: "#0f1226",
    icon: path.join(__dirname, "../build/icon.png") });
  w.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: "deny" }; });
  w.loadFile(path.join(__dirname, "../www/index.html"));
});
app.on("window-all-closed", () => app.quit());
