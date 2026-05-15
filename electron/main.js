const { app, BrowserWindow, ipcMain, shell, session } = require("electron");
const path = require("path");
const fetch = require("node-fetch");
const { exec } = require("child_process");
const fs = require("fs");
const os = require("os");
const { EdgeTTS } = require("node-edge-tts");
const { TextDecoder } = require("util");
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

ipcMain.on(
  "ollama-chat-stream",
  async (event, messages, model = "llama3.2") => {
    try {
      const response = await fetch(`${OLLAMA_BASE_URL}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: model,
          messages: messages,
          stream: true,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        event.reply("ollama-chat-stream-error", errorText);
        return;
      }

      let buffer = "";
      let doneSent = false;
      response.body.on("data", (chunk) => {
        buffer += chunk.toString();
        const lines = buffer.split("\n");

        for (let i = 0; i < lines.length - 1; i++) {
          const line = lines[i].trim();
          if (!line) continue;

          try {
            const data = JSON.parse(line);
            if (data.message && data.message.content) {
              event.reply("ollama-chat-stream-chunk", data.message.content);
            }
            if (data.done && !doneSent) {
              doneSent = true;
              event.reply("ollama-chat-stream-done");
            }
          } catch (e) {
            console.error("Error parsing Ollama stream chunk:", e);
          }
        }

        buffer = lines[lines.length - 1] || "";
      });

      response.body.on("end", () => {
        if (!doneSent) {
          event.reply("ollama-chat-stream-done");
        }
      });

      response.body.on("error", (error) => {
        console.error("Ollama stream error:", error);
        event.reply("ollama-chat-stream-error", error.message);
      });
    } catch (error) {
      console.error("Ollama chat stream error:", error);
      event.reply("ollama-chat-stream-error", error.message);
    }
  },
);

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

const { randomBytes } = require("crypto");
const WebSocket = require("ws");
const { HttpsProxyAgent } = require("https-proxy-agent");
const { TRUSTED_CLIENT_TOKEN, generateSecMsGecToken, CHROMIUM_FULL_VERSION } = require("node-edge-tts/dist/drm");

function escapeXml(unsafe) {
  return unsafe.replace(/[<>&"']/g, (c) => {
    switch (c) {
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case "&":
        return "&amp;";
      case '"':
        return "&quot;";
      case "'":
        return "&apos;";
      default:
        return c;
    }
  });
}

ipcMain.on("edge-tts-stream", async (event, text) => {
  console.log("Edge TTS stream called with text:", text);
  try {
    const ws = new WebSocket(
      `wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1?TrustedClientToken=${TRUSTED_CLIENT_TOKEN}&Sec-MS-GEC=${generateSecMsGecToken()}&Sec-MS-GEC-Version=1-${CHROMIUM_FULL_VERSION}`,
      {
        host: "speech.platform.bing.com",
        origin: "chrome-extension://jdiccldimpdaibmpdkjnbmckianbfold",
        headers: {
          Pragma: "no-cache",
          "Cache-Control": "no-cache",
          "User-Agent": `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${CHROMIUM_FULL_VERSION.split(".")[0]}.0.0.0 Safari/537.36 Edg/${CHROMIUM_FULL_VERSION.split(".")[0]}.0.0.0`,
          "Accept-Encoding": "gzip, deflate, br, zstd",
          "Accept-Language": "en-US,en;q=0.9",
        },
      },
    );

    ws.on("open", () => {
      ws.send(`Content-Type:application/json; charset=utf-8\r\nPath:speech.config\r\n\r\n
        {
          "context": {
            "synthesis": {
              "audio": {
                "metadataoptions": {
                  "sentenceBoundaryEnabled": "false",
                  "wordBoundaryEnabled": "false"
                },
                "outputFormat": "audio-24khz-48kbitrate-mono-mp3"
              }
            }
          }
        }
      `);

      const requestId = randomBytes(16).toString("hex");
      ws.send(`X-RequestId:${requestId}\r\nContent-Type:application/ssml+xml\r\nPath:ssml\r\n\r\n
        <speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xmlns:mstts="https://www.w3.org/2001/mstts" xml:lang="en-US">
          <voice name="en-US-AriaNeural">
            <prosody rate="default" pitch="default" volume="default">
              ${escapeXml(text)}
            </prosody>
          </voice>
        </speak>`);
    });

    ws.on("message", (data, isBinary) => {
      if (isBinary) {
        const separator = "Path:audio\r\n";
        const index = data.indexOf(separator) + separator.length;
        const audioData = data.subarray(index);
        event.reply("edge-tts-stream-chunk", audioData.toString("base64"));
      } else {
        const message = data.toString();
        if (message.includes("Path:turn.end")) {
          event.reply("edge-tts-stream-done");
          ws.close();
        }
      }
    });

    ws.on("error", (error) => {
      console.error("Edge TTS stream error:", error);
      event.reply("edge-tts-stream-error", error.message);
      ws.close();
    });
  } catch (error) {
    console.error("Edge TTS stream error:", error);
    event.reply("edge-tts-stream-error", error.message);
  }
});

let browserInstance = null;
let pageInstance = null;

ipcMain.handle("browser-start", async () => {
  try {
    if (!browserInstance) {
      const puppeteerModule = await import("puppeteer");
      const puppeteer = puppeteerModule.default || puppeteerModule;
      browserInstance = await puppeteer.launch({
        headless: false,
        defaultViewport: null,
      });
      const pages = await browserInstance.pages();
      pageInstance = pages[0];
    }
    return { success: true };
  } catch (error) {
    console.error("Browser start error:", error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle("browser-goto", async (event, url) => {
  try {
    if (!pageInstance) throw new Error("Browser not started");
    await pageInstance.goto(url, { waitUntil: "networkidle2" });
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle("browser-get-dom", async () => {
  try {
    if (!pageInstance) throw new Error("Browser not started");
    
    // Inject script to label interactive elements
    const domInfo = await pageInstance.evaluate(() => {
      let elements = document.querySelectorAll("a, button, input, select, textarea, [role='button'], [tabindex]");
      let interactiveElements = [];
      
      // Clean up previous overlays
      document.querySelectorAll(".jarvis-overlay-label").forEach(o => o.remove());

      elements.forEach((el, index) => {
        // Skip hidden elements
        const style = window.getComputedStyle(el);
        if (style.display === "none" || style.visibility === "hidden" || el.offsetWidth === 0) return;
        
        el.setAttribute("data-jarvis-id", index);
        
        let label = el.innerText || el.value || el.placeholder || el.getAttribute("aria-label") || el.alt || "";
        label = label.toString().trim().replace(/\n/g, " ").substring(0, 100);
        
        if (label || el.tagName.toLowerCase() === "input") {
          interactiveElements.push({
            id: index,
            tag: el.tagName.toLowerCase(),
            type: el.type || undefined,
            label: label,
          });
          
          let overlay = document.createElement("div");
          overlay.className = "jarvis-overlay-label";
          overlay.style.position = "absolute";
          let rect = el.getBoundingClientRect();
          overlay.style.top = (rect.top + window.scrollY) + "px";
          overlay.style.left = (rect.left + window.scrollX) + "px";
          overlay.style.backgroundColor = "rgba(255, 0, 0, 0.8)";
          overlay.style.color = "white";
          overlay.style.fontSize = "12px";
          overlay.style.fontWeight = "bold";
          overlay.style.padding = "2px 4px";
          overlay.style.borderRadius = "3px";
          overlay.style.zIndex = "999999";
          overlay.style.pointerEvents = "none";
          overlay.innerText = index;
          document.body.appendChild(overlay);
        }
      });
      
      return {
        url: window.location.href,
        title: document.title,
        elements: interactiveElements
      };
    });
    
    return { success: true, dom: domInfo };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle("browser-click", async (event, id) => {
  try {
    if (!pageInstance) throw new Error("Browser not started");
    await pageInstance.evaluate((elId) => {
      const el = document.querySelector(`[data-jarvis-id="${elId}"]`);
      if (el) el.click();
    }, id);
    // Wait a bit for navigation or JS to run
    await new Promise(r => setTimeout(r, 2000));
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle("browser-type", async (event, id, text) => {
  try {
    if (!pageInstance) throw new Error("Browser not started");
    
    await pageInstance.evaluate((elId) => {
      const el = document.querySelector(`[data-jarvis-id="${elId}"]`);
      if (el) {
        el.focus();
        el.value = ''; 
      }
    }, id);
    
    await pageInstance.type(`[data-jarvis-id="${id}"]`, text, { delay: 50 });
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle("browser-keyboard", async (event, key) => {
  try {
     if (!pageInstance) throw new Error("Browser not started");
     await pageInstance.keyboard.press(key);
     await new Promise(r => setTimeout(r, 2000));
     return { success: true };
  } catch(error) {
     return { success: false, error: error.message };
  }
});

ipcMain.handle("browser-close", async () => {
  try {
    if (browserInstance) {
      await browserInstance.close();
      browserInstance = null;
      pageInstance = null;
    }
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

