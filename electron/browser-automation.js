const path = require("path");
const os = require("os");

let browserInstance = null;
let pageInstance = null;

// Utility function to wait for Chrome debugging port to be ready
async function waitForPortReady(
  port = 9222,
  maxAttempts = 60,
  delayMs = 500,
  initialDelayMs = 2000,
) {
  const fetch = require("node-fetch");
  
  console.log(`[Browser] Giving Chrome ${initialDelayMs}ms to initialize...`);
  await new Promise((r) => setTimeout(r, initialDelayMs));

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/version`);
      if (response.ok) {
        console.log(
          `[Browser] Debugging port ${port} is ready (attempt ${attempt})`,
        );
        return true;
      }
    } catch (error) {
      if (attempt === maxAttempts) {
        console.error(
          `[Browser] Port ${port} never became available after ${maxAttempts} attempts (${maxAttempts * delayMs}ms)`,
        );
        throw new Error(
          `Chrome debugging port ${port} never responded. Chrome may have failed to start or port 9222 is in use by another process.`,
        );
      }
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
  return false;
}

// Start browser
async function browserStart() {
  try {
    if (!browserInstance) {
      const puppeteerModule = await import("puppeteer-core");
      const puppeteer = puppeteerModule.default;

      const fs = require("fs");
      const { exec } = require("child_process");

      // Detect Chrome automatically
      const possibleChromePaths = [
        "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
        "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
        path.join(os.homedir(), "AppData\\Local\\Google\\Chrome\\Application\\chrome.exe"),
      ];

      const chromePath = possibleChromePaths.find((p) => fs.existsSync(p));

      if (!chromePath) {
        throw new Error("Chrome not found at any standard location");
      }

      console.log(`[Browser] Found Chrome at: ${chromePath}`);

      // Use a dedicated automation profile inside the Electron app data folder.
      const userDataDir = path.join(
        os.homedir(),
        "AppData",
        "Local",
        "jarvis-desktop-automation",
      );

      // Launch Chrome with remote debugging
      const chromeArgs = [
        `--remote-debugging-port=9222`,
        `--user-data-dir=${userDataDir}`,
        "--no-first-run",
        "--no-default-browser-check",
        "--disable-popup-blocking",
      ];

      exec(`"${chromePath}" ${chromeArgs.join(" ")}`, (error) => {
        if (error) console.error(`Error launching Chrome: ${error}`);
      });

      // Wait for Chrome to be ready
      await waitForPortReady();

      // Connect to Chrome via CDP
      browserInstance = await puppeteer.connect({
        browserURL: "http://127.0.0.1:9222",
      });

      const pages = await browserInstance.pages();
      pageInstance = pages[0] || await browserInstance.newPage();

      console.log("[Browser] Connected to Chrome via CDP");
      return { success: true };
    }
    return { success: true, message: "Browser already running" };
  } catch (error) {
    console.error("[Browser] Start error:", error);
    return { success: false, error: error.message };
  }
}

// Navigate to URL
async function browserGoto(url) {
  try {
    if (!pageInstance) {
      const startResult = await browserStart();
      if (!startResult.success) return startResult;
    }
    await pageInstance.goto(url, { waitUntil: "networkidle2" });
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// Get DOM elements
async function browserGetDom() {
  try {
    if (!pageInstance) {
      return { success: false, error: "Browser not started" };
    }

    const dom = await pageInstance.evaluate(() => {
      const elements = Array.from(document.querySelectorAll("*"))
        .filter((el) => {
          const rect = el.getBoundingClientRect();
          return rect.width > 0 && rect.height > 0;
        })
        .slice(0, 100)
        .map((el, index) => ({
          id: index,
          tag: el.tagName.toLowerCase(),
          type: el.type || "",
          label: el.getAttribute("aria-label") || el.getAttribute("placeholder") || el.textContent?.slice(0, 50) || "",
          text: el.textContent?.slice(0, 50) || "",
        }));

      return {
        url: window.location.href,
        title: document.title,
        elements,
      };
    });

    return { success: true, dom };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// Click element
async function browserClick(id) {
  try {
    if (!pageInstance) return { success: false, error: "Browser not started" };
    
    await pageInstance.evaluate((elId) => {
      const el = document.querySelector(`[data-jarvis-id="${elId}"]`);
      if (el) el.click();
    }, id);
    
    await new Promise((r) => setTimeout(r, 2000));
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// Type text
async function browserType(id, text) {
  try {
    if (!pageInstance) return { success: false, error: "Browser not started" };
    
    await pageInstance.evaluate((elId) => {
      const el = document.querySelector(`[data-jarvis-id="${elId}"]`);
      if (el) {
        el.focus();
        el.value = "";
      }
    }, id);
    
    await pageInstance.type(`[data-jarvis-id="${id}"]`, text, { delay: 50 });
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// Keyboard action
async function browserKeyboard(key) {
  try {
    if (!pageInstance) return { success: false, error: "Browser not started" };
    await pageInstance.keyboard.press(key);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// Close browser
async function browserClose() {
  try {
    if (browserInstance) {
      await browserInstance.disconnect();
      browserInstance = null;
      pageInstance = null;
      console.log("[Browser] Disconnected from Chrome");
    }
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// Browser action handler
async function browserAct(action) {
  try {
    if (!pageInstance) throw new Error("Browser not started");

    switch (action.action) {
      case "goto":
        await pageInstance.goto(action.url, { waitUntil: "networkidle2" });
        break;
      case "click":
        await pageInstance.evaluate((elId) => {
          const el = document.querySelector(`[data-jarvis-id="${elId}"]`);
          if (el) el.click();
        }, action.id);
        await new Promise((r) => setTimeout(r, 2000));
        break;
      case "type":
        await pageInstance.evaluate((elId) => {
          const el = document.querySelector(`[data-jarvis-id="${elId}"]`);
          if (el) {
            el.focus();
            el.value = "";
          }
        }, action.id);
        await pageInstance.type(
          `[data-jarvis-id="${action.id}"]`,
          action.text,
          { delay: 50 },
        );
        break;
      case "keyboard":
        await pageInstance.keyboard.press(action.key);
        break;
      case "wait":
        await new Promise((r) => setTimeout(r, 2000));
        break;
      case "done":
        break;
      default:
        throw new Error("Unknown browser action");
    }
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// Register browser IPC handlers
function registerBrowserHandlers(ipcMain) {
  ipcMain.handle("browser-start", browserStart);
  ipcMain.handle("browser-goto", browserGoto);
  ipcMain.handle("browser-get-dom", browserGetDom);
  ipcMain.handle("browser-click", browserClick);
  ipcMain.handle("browser-type", browserType);
  ipcMain.handle("browser-keyboard", browserKeyboard);
  ipcMain.handle("browser-close", browserClose);
  ipcMain.handle("browser-act", browserAct);
}

module.exports = {
  registerBrowserHandlers,
};
