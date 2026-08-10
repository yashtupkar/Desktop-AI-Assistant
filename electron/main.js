const { app, BrowserWindow, session, ipcMain } = require("electron");
const path = require("path");

// Import modules
const { setMainWindow, registerHandlers } = require("./ipc-handlers");
const { registerBrowserHandlers } = require("./browser-automation");
const { aiChatStream } = require("./ai-stream");

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 350,
    height: 450,
    transparent: false,
    frame: false,
    alwaysOnTop: true,
    hasShadow: true,
    webPreferences: {
      webSecurity: true,
      allowRunningInsecureContent: false,
      preload: path.join(__dirname, "preload.js"),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
    },
  });

  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        "Content-Security-Policy": [
          "default-src 'self' http://localhost:5173 https://fonts.googleapis.com https://fonts.gstatic.com data: blob:; script-src 'self' 'unsafe-inline' 'unsafe-eval' http://localhost:5173; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; img-src 'self' data: blob:; connect-src 'self' http://localhost:5173 ws: wss: https:; media-src 'self' blob: data:; worker-src 'self' blob:",
        ],
      },
    });
  });

  session.defaultSession.setPermissionRequestHandler(
    (webContents, permission, callback) => {
      callback(true);
    },
  );

  session.defaultSession.setPermissionCheckHandler(
    (webContents, permission) => {
      return true;
    },
  );

  const isDev = !app.isPackaged && process.env.NODE_ENV !== "production";

  if (isDev) {
    mainWindow.loadURL("http://localhost:5173");
    mainWindow.webContents.openDevTools({ mode: "detached" });
  } else {
    mainWindow.loadFile(path.join(__dirname, "../dist/index.html"));
  }
}

// Set command line switches before app is ready
if (app && app.commandLine) {
  try {
    app.commandLine.appendSwitch("enable-speech-dispatcher");
    app.commandLine.appendSwitch("disable-features", "AudioServiceOutOfProcess");
    app.commandLine.appendSwitch(
      "enable-features",
      "WebSpeechAPI,AudioServiceAudioStreams",
    );
    app.commandLine.appendSwitch("enable-transparent-visuals");
  } catch (e) {
    console.log("Could not set command line switches:", e.message);
  }
}

if (app) {
  app.whenReady().then(() => {
    createWindow();

    // Set main window reference for IPC handlers
    setMainWindow(mainWindow);

    // Register all IPC handlers
    registerHandlers(ipcMain);
    registerBrowserHandlers(ipcMain);
    aiChatStream(ipcMain);

    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
      }
    });
  });

  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") {
      app.quit();
    }
  });
}
