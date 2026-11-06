// Voyager desktop shell: runs the bundled community/app server on a fixed local port and shows it in a window.
const { app, BrowserWindow, Menu, dialog, screen } = require("electron");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const PORT = 4316; // assigned in C:\Claude\PORTS.md; fixed so the app's saved profile (localStorage) keeps the same origin
process.env.PORT = String(PORT);
process.env.HOST = "127.0.0.1";
process.env.VOYAGER_WWW = path.join(__dirname, "..", "desktop-www");
process.env.VOYAGER_DATA = path.join(app.getPath("userData"), "data");

if (!app.requestSingleInstanceLock()) app.quit();

async function createWindow() {
  const wa = screen.getPrimaryDisplay().workAreaSize;
  const win = new BrowserWindow({
    width: Math.min(650, wa.width), height: Math.min(1100, wa.height), minWidth: 360, minHeight: 640,
    title: "Voyager", backgroundColor: "#000000", autoHideMenuBar: true,
    webPreferences: { autoplayPolicy: "no-user-gesture-required" },
  });
  Menu.setApplicationMenu(null);
  await win.loadURL(`http://127.0.0.1:${PORT}/`);
}

app.whenReady().then(async () => {
  try {
    await import(pathToFileURL(path.join(__dirname, "..", "server", "index.mjs")).href);
    await createWindow();
  } catch (e) {
    dialog.showErrorBox("Voyager", "서버를 시작할 수 없습니다. 다른 프로그램이 포트 " + PORT + "을(를) 쓰고 있을 수 있습니다.\n\n" + e);
    app.quit();
  }
});
app.on("second-instance", () => { const w = BrowserWindow.getAllWindows()[0]; if (w) { if (w.isMinimized()) w.restore(); w.focus(); } });
app.on("window-all-closed", () => app.quit());
