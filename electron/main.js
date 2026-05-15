const { app, BrowserWindow, ipcMain, shell, session } = require("electron");
const path = require("path");
const fetch = require("node-fetch");
const { exec } = require("child_process");
const fs = require("fs");
const os = require("os");
const { EdgeTTS } = require("node-edge-tts");
app.commandLine.appendSwitch("enable-speech-dispatcher");
app.commandLine.appendSwitch("disable-features", "AudioServiceOutOfProcess");
app.commandLine.appendSwitch(
  "enable-features",
  "WebSpeechAPI,AudioServiceAudioStreams",
);
app.commandLine.appendSwitch("no-sandbox");

const OLLAMA_BASE_URL = "http://localhost:11434";

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1000,
    height: 700,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    hasShadow: false,
    webPreferences: {
      webSecurity: false,
      preload: path.join(__dirname, "preload.js"),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        "Content-Security-Policy": [
          "default-src * 'unsafe-inline' 'unsafe-eval' data: blob:",
        ],
      },
    });
  });

  const isDev = !app.isPackaged && process.env.NODE_ENV !== "production";

  if (isDev) {
    mainWindow.loadURL("http://localhost:5173");
    // mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    mainWindow.loadFile(path.join(__dirname, "../dist/index.html"));
  }
}

app.commandLine.appendSwitch("enable-transparent-visuals");

app.whenReady().then(() => {
  createWindow();

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

ipcMain.on("window-control", (event, command) => {
  if (command === "close") mainWindow.close();
  if (command === "minimize") mainWindow.minimize();
});

const ALLOWED_APPS = {
  notepad: "start notepad",
  calculator: "start calc",
  calc: "start calc",
  explorer: "start explorer",
  "file explorer": "start explorer",
  settings: "start ms-settings:",
  "system settings": "start ms-settings:",
  "command prompt": "start cmd",
  cmd: "start cmd",
  powershell: "start powershell",
  terminal: "start powershell",
  "task manager": "start taskmgr",
  chrome: "start chrome",
  edge: "start msedge",
  firefox: "start firefox",
};

ipcMain.handle("open-url", async (event, url) => {
  await shell.openExternal(url);
  return { success: true };
});

ipcMain.handle("open-app", async (event, appName) => {
  const normalizedName = appName.toLowerCase().trim();
  const command = ALLOWED_APPS[normalizedName];

  if (command) {
    exec(command, (error) => {
      if (error) console.error(`Error opening app: ${error}`);
    });
    return { success: true, message: "Opened" };
  } else {
    return { success: false, message: "App not allowed" };
  }
});

ipcMain.handle("get-system-stats", async () => {
  return {
    cpu: Math.floor(Math.random() * 40) + 10,
    ram: Math.floor(Math.random() * 30) + 40,
  };
});

ipcMain.handle("check-ollama", async () => {
  try {
    const response = await fetch(`${OLLAMA_BASE_URL}/api/tags`);
    if (response.ok) {
      const data = await response.json();
      return { online: true, models: data.models || [] };
    }
    return { online: false, models: [] };
  } catch (error) {
    return { online: false, models: [], error: error.message };
  }
});

ipcMain.handle("ollama-chat", async (event, messages, model = "llama3.2") => {
  try {
    const response = await fetch(`${OLLAMA_BASE_URL}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: model,
        messages: messages,
        stream: false,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `Ollama request failed: ${response.status} - ${errorText}`,
      );
    }

    const data = await response.json();
    return { success: true, message: data.message.content };
  } catch (error) {
    console.error("Ollama chat error:", error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle("edge-tts", async (event, text) => {
  console.log("Edge TTS called with text:", text);
  try {
    const tempDir = os.tmpdir();
    const outputFile = path.join(tempDir, `tts-${Date.now()}.mp3`);
    console.log("Output file:", outputFile);

    const tts = new EdgeTTS({
      voice: "en-US-AriaNeural",
      lang: "en-US",
    });

    console.log("Generating audio...");
    await tts.ttsPromise(text, outputFile);
    console.log("Audio generated!");

    const audioBuffer = fs.readFileSync(outputFile);
    const base64Audio = audioBuffer.toString("base64");
    console.log("Base64 length:", base64Audio.length);

    fs.unlinkSync(outputFile);

    return { success: true, audio: base64Audio };
  } catch (error) {
    console.error("Edge TTS error:", error);
    return { success: false, error: error.message };
  }
});
