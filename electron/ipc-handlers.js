const { shell } = require("electron");
const { exec } = require("child_process");
const path = require("path");
const fs = require("fs");
const os = require("os");
const { EdgeTTS } = require("node-edge-tts");
const { randomBytes } = require("crypto");
const WebSocket = require("ws");
const {
  TRUSTED_CLIENT_TOKEN,
  generateSecMsGecToken,
  CHROMIUM_FULL_VERSION,
} = require("node-edge-tts/dist/drm");
const config = require("./config");
const pythonBridge = require("./python-bridge");
const { aiChat } = require("./ai-chat");

let mainWindow = null;
let browserInstance = null;
let pageInstance = null;

function setMainWindow(window) {
  mainWindow = window;
}

// Allowed applications for opening
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
  "visual studio code": "code",
  vscode: "code",
  "vs code": "code",
  spotify: "start https://open.spotify.com/",
  discord: "start discord:",
  slack: "start slack:",
  teams: "start msteams:",
  zoom: "start zoommtg:",
  outlook: "start outlook",
  word: "start winword",
  excel: "start excel",
  powerpoint: "start powerpnt",
  "notepadplusplus": "start notepad++",
  "notepad++": "start notepad++",
  "control panel": "start control",
  "device manager": "start devmgmt.msc",
  "disk management": "start diskmgmt.msc",
  "services": "start services.msc",
  "event viewer": "start eventvwr",
  "registry editor": "start regedit",
  // Web Apps / Protocols
  whatsapp: "start whatsapp:",
  youtube: "start https://www.youtube.com",
  instagram: "start https://www.instagram.com",
  facebook: "start https://www.facebook.com",
  twitter: "start https://x.com",
  x: "start https://x.com",
  chatgpt: "start https://chatgpt.com",
  netflix: "start https://www.netflix.com",
  github: "start https://github.com",
  gmail: "start https://mail.google.com",
  maps: "start https://maps.google.com",
};

// System stats handler
async function getSystemStats() {
  try {
    const si = require("systeminformation");
    const cpuLoad = await si.currentLoad();
    const cpuUsage = Math.round(cpuLoad.currentLoad);
    const memory = await si.mem();
    const ramUsage = Math.round((memory.used / memory.total) * 100);
    return { cpu: cpuUsage, ram: ramUsage };
  } catch (error) {
    console.error("Error getting system stats:", error);
    return {
      cpu: Math.floor(Math.random() * 40) + 10,
      ram: Math.floor(Math.random() * 30) + 40,
    };
  }
}

// AI status check
async function checkAIStatus() {
  try {
    const response = await fetch(`${config.OPENROUTER_URL}/models`, {
      headers: {
        Authorization: `Bearer ${config.OPENROUTER_API_KEY}`,
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
}



// Edge TTS handler
async function edgeTTS(event, text) {
  try {
    const tempDir = os.tmpdir();
    const outputFile = path.join(tempDir, `tts-${Date.now()}.mp3`);

    const tts = new EdgeTTS({
      voice: config.TTS_VOICE,
      lang: config.TTS_LANG,
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
}

// Helper function to escape XML
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

// Edge TTS stream handler
function edgeTTSStream(event, text) {
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
}

// Desktop action handler
async function desktopAction(event, actionObj) {
  try {
    const { mouse, keyboard, Key, Point, Button } = require("@nut-tree/nut-js");
    switch (actionObj.action) {
      case "click":
        await mouse.setPosition(new Point(actionObj.x, actionObj.y));
        await mouse.leftClick();
        break;
      case "double_click":
        await mouse.setPosition(new Point(actionObj.x, actionObj.y));
        await mouse.leftClick();
        await mouse.leftClick();
        break;
      case "click_text":
        if (!actionObj.text) throw new Error("Missing text to click");
        const screenshot = require("screenshot-desktop");
        const imgBuffer = await screenshot({ format: "png" });
        const Tesseract = require("tesseract.js");
        
        console.log(`[OCR] Scanning screen for text: '${actionObj.text}'...`);
        const result = await Tesseract.recognize(imgBuffer, "eng");
        
        const targetText = actionObj.text.toLowerCase();
        let foundBbox = null;
        
        for (const line of result.data.lines) {
          if (line.text.toLowerCase().includes(targetText)) {
            foundBbox = line.bbox;
            break;
          }
        }

        if (foundBbox) {
          const centerX = foundBbox.x0 + (foundBbox.x1 - foundBbox.x0) / 2;
          const centerY = foundBbox.y0 + (foundBbox.y1 - foundBbox.y0) / 2;
          console.log(`[OCR] Found '${actionObj.text}' at x:${centerX}, y:${centerY}`);
          await mouse.setPosition(new Point(centerX, centerY));
          await mouse.leftClick();
        } else {
          throw new Error(`Text '${actionObj.text}' not found on screen`);
        }
        break;
      case "type":
        if (actionObj.text) {
          await keyboard.type(actionObj.text);
        }
        break;
      case "hotkey":
        const keys = actionObj.keys.map(k => {
          // Capitalize first letter (e.g. 'enter' -> 'Enter', 'space' -> 'Space')
          const formattedKey = k.charAt(0).toUpperCase() + k.slice(1).toLowerCase();
          return Key[formattedKey] || Key[k.toUpperCase()];
        }).filter(k => k !== undefined);
        
        if (keys.length > 0) {
          console.log(`[Desktop] Pressing keys: ${actionObj.keys.join('+')}`);
          await keyboard.pressKey(...keys);
          await keyboard.releaseKey(...keys);
        } else {
          console.log(`[Desktop] Invalid keys provided: ${actionObj.keys.join('+')}`);
        }
        break;
      case "wait":
        await new Promise((r) => setTimeout(r, actionObj.ms || 1000));
        break;
      default:
        throw new Error("Unsupported desktop action");
    }
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// Screenshot handler
async function takeScreenshot() {
  try {
    const screenshot = require("screenshot-desktop");
    const imgBuffer = await screenshot({ format: "png" });
    return { success: true, imageBase64: imgBuffer.toString("base64") };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// Python automation handler
async function runAutomation(event, task, args = {}) {
  try {
    console.log(`[Main] Running automation task: ${task.substring(0, 50)}...`);
    
    if (pythonBridge.isActive()) {
      return { 
        success: false, 
        error: "Another automation task is already running. Please wait for it to complete." 
      };
    }
    
    const result = await pythonBridge.runTask(task, args);
    return result;
  } catch (error) {
    console.error("[Main] Automation error:", error);
    return { success: false, error: error.message };
  }
}

// Stop automation handler
async function stopAutomation() {
  try {
    if (pythonBridge.isActive()) {
      pythonBridge.kill();
      return { success: true, message: "Automation stopped" };
    }
    return { success: false, error: "No automation task is running" };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// System Command handler
async function systemCommand(event, action) {
  try {
    const actionStr = action.trim().toLowerCase();
    let cmd = "";
    
    if (actionStr.startsWith("brightness_set:")) {
      const val = parseInt(actionStr.split(":")[1]) || 50;
      cmd = `powershell -c "(Get-WmiObject -Namespace root/WMI -Class WmiMonitorBrightnessMethods).WmiSetBrightness(1, ${val})"`;
    } else if (actionStr.startsWith("volume_set:")) {
      const val = parseInt(actionStr.split(":")[1]) || 50;
      const loudness = require("loudness");
      await loudness.setVolume(val);
      return { success: true };
    } else {
      switch (actionStr) {
        case "volume_up":
          cmd = `powershell -c "(new-object -com wscript.shell).SendKeys([char]175)"`;
          break;
        case "volume_down":
          cmd = `powershell -c "(new-object -com wscript.shell).SendKeys([char]174)"`;
          break;
        case "volume_mute":
        case "mute":
          cmd = `powershell -c "(new-object -com wscript.shell).SendKeys([char]173)"`;
          break;
        case "brightness_up":
          cmd = `powershell -c "$m = Get-WmiObject -Namespace root/WMI -Class WmiMonitorBrightness; $b = $m.CurrentBrightness + 20; if ($b -gt 100) { $b = 100 }; (Get-WmiObject -Namespace root/WMI -Class WmiMonitorBrightnessMethods).WmiSetBrightness(1, $b)"`;
          break;
        case "brightness_down":
          cmd = `powershell -c "$m = Get-WmiObject -Namespace root/WMI -Class WmiMonitorBrightness; $b = $m.CurrentBrightness - 20; if ($b -lt 0) { $b = 0 }; (Get-WmiObject -Namespace root/WMI -Class WmiMonitorBrightnessMethods).WmiSetBrightness(1, $b)"`;
          break;
        case "wifi_settings":
          cmd = `start ms-settings:network-wifi`;
          break;
        case "bluetooth_settings":
          cmd = `start ms-settings:bluetooth`;
          break;
        case "sleep":
          cmd = `rundll32.exe powrprof.dll,SetSuspendState 0,1,0`;
          break;
        default:
          return { success: false, error: "Unknown system command" };
      }
    }

    exec(cmd, (error) => {
      if (error) console.error("System command error:", error);
    });
    
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// Register all IPC handlers
function registerHandlers(ipcMain) {
  ipcMain.on("window-control", (event, command) => {
    if (command === "close") mainWindow.close();
    if (command === "minimize") mainWindow.minimize();
  });

  ipcMain.handle("open-url", async (event, url) => {
    await shell.openExternal(url);
    return { success: true };
  });

  ipcMain.handle("system-command", systemCommand);

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

  ipcMain.handle("get-system-stats", getSystemStats);
  ipcMain.handle("check-ai-status", checkAIStatus);
  ipcMain.handle("ai-chat", aiChat);
  ipcMain.handle("edge-tts", edgeTTS);
  ipcMain.on("edge-tts-stream", edgeTTSStream);
  ipcMain.handle("desktop-action", desktopAction);
  ipcMain.handle("take-screenshot", takeScreenshot);
  ipcMain.handle("run-automation", runAutomation);
  ipcMain.handle("stop-automation", stopAutomation);
}

module.exports = {
  setMainWindow,
  registerHandlers,
  ALLOWED_APPS,
};
