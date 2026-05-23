require("dotenv").config({ path: require("path").join(__dirname, "../.env") });

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

const OPENROUTER_URL = process.env.OPENROUTER_URL || "https://openrouter.ai/api/v1";
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const DEFAULT_MODEL = process.env.DEFAULT_MODEL || "google/gemini-2.5-flash-lite";
const STREAM_MODEL = process.env.STREAM_MODEL || "google/gemma-2-9b-it:free";
const APP_REFERER = process.env.APP_REFERER || "https://github.com/yashtupkar/Desktop-AI-Assistant";
const APP_TITLE = process.env.APP_TITLE || "Nova AI Assistant";
const CHROME_DEBUG_PORT = parseInt(process.env.CHROME_DEBUG_PORT || "9222", 10);
const TTS_VOICE = process.env.TTS_VOICE || "en-US-AriaNeural";
const TTS_LANG = process.env.TTS_LANG || "en-US";

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

ipcMain.handle("check-ai-status", async () => {
  try {
    const response = await fetch(`${OPENROUTER_URL}/models`, {
      headers: {
        "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
      },
    });
    if (response.ok) {
      const data = await response.json();
      return { online: true, models: data.data || [] };
    }
    return { online: false, models: [] };
  } catch (error) {
    return { online: false, models: [], error: error.message };
  }
});

ipcMain.handle("ai-chat", async (event, messages, model = DEFAULT_MODEL) => {
  try {
    const response = await fetch(`${OPENROUTER_URL}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
        "HTTP-Referer": APP_REFERER,
        "X-Title": APP_TITLE,
      },
      body: JSON.stringify({
        model: model,
        messages: messages,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`OpenRouter API Error: ${response.status} - ${errorText}`);
      throw new Error(
        `OpenRouter request failed: ${response.status} - ${errorText}`,
      );
    }

    const data = await response.json();
    return { success: true, message: data.choices[0].message.content };
  } catch (error) {
    console.error("AI chat error:", error);
    return { success: false, error: error.message };
  }
});

ipcMain.on(
  "ai-chat-stream",
  async (event, messages, model = STREAM_MODEL) => {
    try {
      const response = await fetch(`${OPENROUTER_URL}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
          "HTTP-Referer": APP_REFERER,
          "X-Title": APP_TITLE,
        },
        body: JSON.stringify({
          model: model,
          messages: messages,
          stream: true,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`OpenRouter Stream API Error: ${response.status} - ${errorText}`);
        event.reply("ai-chat-stream-error", errorText);
        return;
      }

      let buffer = "";
      response.body.on("data", (chunk) => {
        buffer += chunk.toString();
        const lines = buffer.split("\n");

        for (let i = 0; i < lines.length - 1; i++) {
          const line = lines[i].trim();
          if (!line || !line.startsWith("data: ")) continue;

          const dataStr = line.replace("data: ", "");
          if (dataStr === "[DONE]") {
            event.reply("ai-chat-stream-done");
            continue;
          }

          try {
            const data = JSON.parse(dataStr);
            if (data.choices && data.choices[0].delta && data.choices[0].delta.content) {
              event.reply("ai-chat-stream-chunk", data.choices[0].delta.content);
            }
          } catch (e) {
            console.error("Error parsing AI stream chunk:", e);
          }
        }

        buffer = lines[lines.length - 1] || "";
      });

      response.body.on("end", () => {
        event.reply("ai-chat-stream-done");
      });

      response.body.on("error", (error) => {
        console.error("AI stream error:", error);
        event.reply("ai-chat-stream-error", error.message);
      });
    } catch (error) {
      console.error("AI chat stream error:", error);
      event.reply("ai-chat-stream-error", error.message);
    }
  },
);

ipcMain.handle("edge-tts", async (event, text) => {
  try {
    const tempDir = os.tmpdir();
    const outputFile = path.join(tempDir, `tts-${Date.now()}.mp3`);

    const tts = new EdgeTTS({
      voice: TTS_VOICE,
      lang: TTS_LANG,
    });

    await tts.ttsPromise(text, outputFile);

    const audioBuffer = fs.readFileSync(outputFile);
    const base64Audio = audioBuffer.toString("base64");

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

// Utility function to wait for Chrome debugging port to be ready
async function waitForPortReady(port = 9222, maxAttempts = 60, delayMs = 500, initialDelayMs = 2000) {
  // Give Chrome initial time to start and enable debugging port
  console.log(`[Browser] Giving Chrome ${initialDelayMs}ms to initialize...`);
  await new Promise((r) => setTimeout(r, initialDelayMs));
  
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/version`);
      if (response.ok) {
        console.log(`[Browser] Debugging port ${port} is ready (attempt ${attempt})`);
        return true;
      }
    } catch (error) {
      // Port not ready yet, continue polling
      if (attempt === maxAttempts) {
        console.error(`[Browser] Port ${port} never became available after ${maxAttempts} attempts (${maxAttempts * delayMs}ms)`);
        throw new Error(`Chrome debugging port ${port} never responded. Chrome may have failed to start or port 9222 is in use by another process.`);
      }
      // Wait before next attempt
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
  return false;
}

ipcMain.handle("browser-start", async () => {
  try {
    if (!browserInstance) {
      const puppeteerModule = await import("puppeteer-core");
      const puppeteer = puppeteerModule.default;

      const fs = require("fs");
      const path = require("path");
      const os = require("os");
      const { exec } = require("child_process");

      // Detect Chrome automatically
      const possibleChromePaths = [
        "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
        "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
      ];

      const chromePath = possibleChromePaths.find((p) =>
        fs.existsSync(p)
      );

      if (!chromePath) {
        throw new Error("Chrome not found at any standard location");
      }

      console.log(`[Browser] Found Chrome at: ${chromePath}`);

      // Use a dedicated automation profile inside the Electron app data folder.
      // This avoids direct reuse of the user's main Chrome profile.
      const userDataDir = path.join(app.getPath("userData"), "chrome-automation-profile");
      if (!fs.existsSync(userDataDir)) {
        fs.mkdirSync(userDataDir, { recursive: true });
      }

      // Launch Chrome with debugging using spawn for better process control
      const { spawn } = require("child_process");
      console.log(`[Browser] Launching Chrome with remote debugging on port ${CHROME_DEBUG_PORT}...`);
      console.log(`[Browser] Command: "${chromePath}" --remote-debugging-port=${CHROME_DEBUG_PORT} --user-data-dir="${userDataDir}"`);
      
      const chromeProcess = spawn(chromePath, [
        `--remote-debugging-port=${CHROME_DEBUG_PORT}`,
        `--user-data-dir=${userDataDir}`,
        "--no-first-run",
        "--no-default-browser-check"
      ], {
        detached: true,
        stdio: "ignore"
      });

      let chromeExited = false;
      chromeProcess.on("error", (error) => {
        chromeExited = true;
        console.error(`[Browser] Chrome spawn failed: ${error.message}`);
      });

      chromeProcess.on("exit", (code) => {
        if (!chromeExited) {
          chromeExited = true;
          console.error(`[Browser] Chrome process exited with code ${code}`);
        }
      });

      // Unref to allow process to run independently
      chromeProcess.unref();

      // Wait for Chrome debugging port to be ready
      console.log(`[Browser] Waiting for debugging port ${CHROME_DEBUG_PORT} to be available...`);
      try {
        await waitForPortReady(CHROME_DEBUG_PORT, 60, 500, 2000);
      } catch (error) {
        if (chromeExited) {
          throw new Error("Chrome process failed to start or exited immediately. Check if Chrome is properly installed.");
        }
        throw error;
      }

      // Connect Puppeteer
      console.log(`[Browser] Connecting Puppeteer to Chrome...`);
      browserInstance = await puppeteer.connect({
        browserURL: `http://127.0.0.1:${CHROME_DEBUG_PORT}`,
        defaultViewport: null,
      });
      console.log(`[Browser] Puppeteer connected successfully`);

      const pages = await browserInstance.pages();

      pageInstance = pages[0] || await browserInstance.newPage();
    }

    return { success: true };
  } catch (error) {
    console.error(`[Browser] Start failed: ${error.message}`, error);
    // Improve error message for common failures
    let userFriendlyError = error.message;
    if (error.message.includes("Chrome not found")) {
      userFriendlyError = "Chrome browser not found. Please install Google Chrome.";
    } else if (error.message.includes("never became available")) {
      userFriendlyError = "Chrome started but debugging port didn't respond. Try closing existing Chrome windows and try again.";
    } else if (error.message.includes("ECONNREFUSED")) {
      userFriendlyError = "Unable to connect to Chrome debugging port. Ensure no other Chrome instances are using port 9222.";
    }
    return {
      success: false,
      error: userFriendlyError,
    };
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
    if (!pageInstance) {
      throw new Error("Browser not started");
    }

    const domInfo = await pageInstance.evaluate(() => {
      const elements = document.querySelectorAll(
        "a, button, input, select, textarea, [role='button'], [tabindex]"
      );

      const interactiveElements = [];

      elements.forEach((el, index) => {
        const style = window.getComputedStyle(el);

        if (
          style.display === "none" ||
          style.visibility === "hidden" ||
          el.offsetWidth === 0
        ) {
          return;
        }

        // Invisible ID for automation
        el.setAttribute("data-jarvis-id", index);

        let label =
          el.innerText ||
          el.value ||
          el.placeholder ||
          el.getAttribute("aria-label") ||
          el.alt ||
          "";

        label = label
          .toString()
          .trim()
          .replace(/\n/g, " ")
          .substring(0, 100);

        interactiveElements.push({
          id: index,
          tag: el.tagName.toLowerCase(),
          type: el.type || "",
          label,
        });
      });

      return {
        url: window.location.href,
        title: document.title,
        elements: interactiveElements,
      };
    });

    return {
      success: true,
      dom: domInfo,
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
    };
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
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Generic automation runner for simple test tasks
ipcMain.handle("run-automation", async (event, task, args = []) => {
  try {
    if (!pageInstance) throw new Error("Browser not started");
    switch (task) {
      case "youtube_search_and_play": {
        const query = args[0] || "";
        await pageInstance.goto("https://www.youtube.com", { waitUntil: "networkidle2" });
        await pageInstance.waitForTimeout(1000);
        await pageInstance.evaluate((q) => {
          const s = document.querySelector('input#search');
          if (s) { s.value = q; s.dispatchEvent(new Event('input', { bubbles: true })); }
        }, query);
        await pageInstance.keyboard.press("Enter");
        await pageInstance.waitForSelector("ytd-video-renderer", { timeout: 10000 });
        await pageInstance.waitForTimeout(1000);
        const title = await pageInstance.evaluate(() => {
          const el = document.querySelector('ytd-video-renderer a#video-title');
          return el ? el.textContent.trim() : null;
        });
        return { success: true, result: title };
      }
      case "google_search": {
        const q = args[0] || "";
        await pageInstance.goto(`https://www.google.com/search?q=${encodeURIComponent(q)}`, { waitUntil: "networkidle2" });
        const snippet = await pageInstance.evaluate(() => {
          const el = document.querySelector('div.g') || document.querySelector('div[jsname="Z0LcW"]');
          return el ? el.innerText.trim().slice(0, 1000) : "";
        });
        return { success: true, result: snippet };
      }
      case "get_weather": {
        const city = args[0] || "";
        const q = `weather ${city}`;
        await pageInstance.goto(`https://www.google.com/search?q=${encodeURIComponent(q)}`, { waitUntil: "networkidle2" });
        const weather = await pageInstance.evaluate(() => {
          const el = document.querySelector('#wob_tm') || document.querySelector('.wob_t');
          const cond = document.querySelector('#wob_dc') || document.querySelector('.wob_dcp');
          return { temp: el ? el.innerText : null, condition: cond ? cond.innerText : null };
        });
        return { success: true, result: weather };
      }
      case "get_latest_news": {
        const q = args[0] || "";
        await pageInstance.goto(`https://news.google.com/search?q=${encodeURIComponent(q)}`, { waitUntil: "networkidle2" });
        const headlines = await pageInstance.evaluate(() => {
          return Array.from(document.querySelectorAll('article h3')).slice(0,5).map(n => n.innerText.trim());
        });
        return { success: true, result: headlines };
      }
      case "amazon_search": {
        const q = args[0] || "";
        await pageInstance.goto(`https://www.amazon.in/s?k=${encodeURIComponent(q)}`, { waitUntil: "networkidle2" });
        const items = await pageInstance.evaluate(() => {
          return Array.from(document.querySelectorAll('div[data-component-type="s-search-result"] h2 a')).slice(0,5).map(a => a.innerText.trim());
        });
        return { success: true, result: items };
      }
      case "maps_directions": {
        const from = args[0] || "";
        const to = args[1] || "";
        const mode = args[2] || "driving";
        const url = `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(from)}&destination=${encodeURIComponent(to)}&travelmode=${encodeURIComponent(mode)}`;
        await pageInstance.goto(url, { waitUntil: "networkidle2" });
        return { success: true, result: url };
      }
      case "custom_task": {
        const script = args[0] || "";
        const res = await pageInstance.evaluate(new Function(`return (async () => { ${script} })()`));
        return { success: true, result: res };
      }
      default:
        return { success: false, error: "Unknown task" };
    }
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle("browser-close", async () => {
  try {
    browserInstance = null;
    pageInstance = null;

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error.message,
    };
  }
});

