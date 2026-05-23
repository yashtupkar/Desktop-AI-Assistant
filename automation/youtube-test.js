// const { chromium } = require("playwright");

// // ─── Config ──────────────────────────────────────────────────────────────────
// const SEARCH_QUERY      = "bairan";
// const AD_CHECK_ROUNDS   = 60;    // 60 × 1000ms = 60s max coverage
// const AD_CHECK_INTERVAL = 1000;  // ms between each ad check
// const POST_SKIP_WAIT    = 3000;  // ms to wait after clicking skip
// // ─────────────────────────────────────────────────────────────────────────────

// const SKIP_SELECTORS = [
//   ".ytp-skip-ad-button",
//   "button.ytp-skip-ad-button",
//   "button.ytp-ad-skip-button",
//   "button.ytp-ad-skip-button-modern",
//   "button[class*='skip-ad']",
//   "button[class*='ytp-skip']",
//   "button[aria-label*='Skip']",
//   "button[aria-label*='skip']",
// ];

// const AD_PRESENCE_SELECTORS = [
//   ".ytp-ad-player-overlay",
//   ".ytp-ad-module",
//   ".ytp-ad-progress",
//   ".video-ads",
//   ".ytp-ad-text",
//   ".ytp-ad-preview-text",
// ];

// // ─── Helper ───────────────────────────────────────────────────────────────────
// const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// // ─── Debug: print all frames Playwright can see ───────────────────────────────
// async function debugFrames(page) {
//   const frames = page.frames();
//   console.log(`\n[Debug] Total frames: ${frames.length}`);
//   for (const frame of frames) {
//     try {
//       const url = frame.url();
//       let foundSkip = null;
//       for (const sel of SKIP_SELECTORS) {
//         const el = frame.locator(sel).first();
//         if (await el.count() > 0) { foundSkip = sel; break; }
//       }
//       let foundAd = false;
//       for (const sel of AD_PRESENCE_SELECTORS) {
//         if (await frame.locator(sel).count() > 0) { foundAd = true; break; }
//       }
//       console.log(
//         `[Debug]  url: ${url.substring(0, 70)}\n` +
//         `         skipBtn: ${foundSkip || "none"} | adPresent: ${foundAd}`
//       );
//     } catch (_) {}
//   }
//   console.log("");
// }

// // ─── Check ad state across ALL frames ────────────────────────────────────────
// // Playwright makes this clean — no need to manually evaluate() in each frame.
// // Locators work directly on any frame object.
// async function findAdState(page) {
//   const frames = page.frames();

//   for (const frame of frames) {
//     try {
//       // Check if this frame has any ad signal
//       let adPresent = false;
//       for (const sel of AD_PRESENCE_SELECTORS) {
//         if (await frame.locator(sel).count() > 0) {
//           adPresent = true;
//           break;
//         }
//       }

//       // Check for a visible, enabled skip button
//       let canSkip  = false;
//       let skipSel  = null;
//       for (const sel of SKIP_SELECTORS) {
//         const btn = frame.locator(sel).first();
//         if (await btn.count() > 0 && await btn.isVisible().catch(() => false)) {
//           canSkip = true;
//           skipSel = sel;
//           break;
//         }
//       }

//       // Check for countdown text
//       const countdownSels = [
//         ".ytp-ad-text",
//         ".ytp-ad-preview-text",
//         ".ytp-ad-simple-ad-badge",
//       ];
//       let countdown = null;
//       for (const sel of countdownSels) {
//         const el = frame.locator(sel).first();
//         if (await el.count() > 0) {
//           countdown = (await el.textContent().catch(() => "")).trim();
//           break;
//         }
//       }

//       if (adPresent || canSkip) {
//         return { frame, adPresent, canSkip, skipSel, countdown };
//       }
//     } catch (_) {
//       // Frame detached or inaccessible — skip it
//     }
//   }

//   return null; // no ad found in any frame
// }

// // ─── Launch browser ───────────────────────────────────────────────────────────
// async function launchBrowser() {
//   console.log("[Browser] 🚀 Launching Chromium via Playwright...");
//   const browser = await chromium.launch({
//     headless: false,
//     args: ["--no-sandbox", "--disable-setuid-sandbox"],
//   });
//   const context = await browser.newContext({
//     // Pretend to be a real user — reduces chance of bot detection
//     userAgent:
//       "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
//       "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
//     viewport: null, // use full window size
//   });
//   const page = await context.newPage();
//   console.log("[Browser] ✅ Browser launched");
//   return { browser, context, page };
// }

// // ─── Consent banner ───────────────────────────────────────────────────────────
// async function handleConsentBanner(page) {
//   const selectors = [
//     'button[aria-label="Accept all"]',
//     'button[aria-label="Reject all"]',
//     'tp-yt-paper-button#agree',
//     'ytd-consent-bump-v2-lightbox button:first-of-type',
//   ];
//   for (const sel of selectors) {
//     try {
//       const btn = page.locator(sel).first();
//       if (await btn.isVisible({ timeout: 2000 }).catch(() => false)) {
//         console.log("[Browser] 🍪 Dismissing consent banner...");
//         await btn.click();
//         await sleep(2000);
//         return;
//       }
//     } catch (_) {}
//   }
// }

// // ─── Search YouTube ───────────────────────────────────────────────────────────
// async function searchYouTube(page, query) {
//   console.log("[YouTube] 🔍 Navigating to YouTube...");
//   await page.goto("https://www.youtube.com", { waitUntil: "networkidle" });
//   await sleep(2000);

//   await handleConsentBanner(page);

//   console.log(`[YouTube] 🔍 Searching for "${query}"...`);
//   const searchBox = page.locator('input[name="search_query"]');
//   await searchBox.click();
//   await searchBox.fill(query);
//   await page.keyboard.press("Enter");

//   // Wait for video results to appear
//   await page.waitForSelector("ytd-video-renderer", { timeout: 10000 });
//   await sleep(1000);
//   console.log("[YouTube] ✅ Search results loaded");
// }

// // ─── Find and play a non-Short video ─────────────────────────────────────────
// async function findAndPlayVideo(page) {
//   console.log("[YouTube] 📹 Finding a regular video...");

//   // Collect all video cards
//   const videoCards = page.locator("ytd-video-renderer, ytd-grid-video-renderer");
//   const count = await videoCards.count();
//   console.log(`[YouTube] Found ${count} result(s)`);

//   function parseDuration(str) {
//     const parts = (str || "").trim().split(":").map(Number);
//     if (parts.length === 2) return parts[0] * 60 + parts[1];
//     if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
//     return 0;
//   }

//   for (let i = 0; i < count; i++) {
//     const card     = videoCards.nth(i);
//     const titleEl  = card.locator("#video-title").first();
//     const href     = await titleEl.getAttribute("href").catch(() => "");
//     const duration = await card
//       .locator("span.style-scope.ytd-thumbnail-overlay-time-status-renderer")
//       .first()
//       .textContent()
//       .catch(() => "");

//     const isShort       = (href || "").includes("/shorts/");
//     const durationSecs  = parseDuration(duration);
//     const title         = await titleEl.textContent().catch(() => "Unknown");

//     if (!isShort && durationSecs > 60) {
//       console.log(`[YouTube] ▶️  Playing: "${title.trim()}" (${duration.trim()})`);
//       await titleEl.click();

//       // Wait for the video player
//       await page.waitForSelector("video.html5-main-video", { timeout: 15000 });
//       await sleep(4000); // let the ad start loading
//       console.log("[YouTube] ✅ Video page ready");
//       return;
//     }
//   }

//   throw new Error("No suitable non-Short video found in results");
// }

// // ─── Main ad skip loop ────────────────────────────────────────────────────────
// async function skipAds(page) {
//   console.log("\n[Ads] 🚫 Starting ad skip loop...");
//   await sleep(2000);

//   // Show all frames for debugging
//   await debugFrames(page);

//   let totalSkipped = 0;
//   let noAdStreak   = 0;
//   let lastSkipTime = 0;

//   for (let round = 1; round <= AD_CHECK_ROUNDS; round++) {
//     try {
//       const adInfo = await findAdState(page);

//       // ── No ad in any frame ──────────────────────────────────────────────
//       if (!adInfo) {
//         noAdStreak++;
//         if (noAdStreak >= 4) {
//           console.log("[Ads] ✅ No ad for 4 consecutive checks — done\n");
//           break;
//         }
//         await sleep(AD_CHECK_INTERVAL);
//         continue;
//       }

//       noAdStreak = 0; // reset — ad is present

//       // ── Skip button is visible ──────────────────────────────────────────
//       if (adInfo.canSkip) {
//         const now = Date.now();
//         // Don't re-click within POST_SKIP_WAIT of last skip
//         if (now - lastSkipTime < POST_SKIP_WAIT) {
//           await sleep(AD_CHECK_INTERVAL);
//           continue;
//         }

//         try {
//           const btn = adInfo.frame.locator(adInfo.skipSel).first();
//           await btn.click({ timeout: 3000 });
//           totalSkipped++;
//           lastSkipTime = Date.now();
//           console.log(
//             `[Ads] ⏭️  Ad #${totalSkipped} skipped (selector: ${adInfo.skipSel})`
//           );
//           await sleep(POST_SKIP_WAIT);
//           continue;
//         } catch (clickErr) {
//           console.warn(`[Ads] ⚠️  Click failed: ${clickErr.message}`);
//         }
//       }

//       // ── Ad playing, skip locked ─────────────────────────────────────────
//       if (adInfo.countdown) {
//         console.log(`[Ads] ⏳ "${adInfo.countdown}" — waiting for skip button...`);
//       } else {
//         console.log(`[Ads] 📺 Ad detected — skip not available yet...`);
//       }

//       await sleep(AD_CHECK_INTERVAL);

//     } catch (err) {
//       if (
//         err.message.includes("detached") ||
//         err.message.includes("Frame") ||
//         err.message.includes("closed")
//       ) {
//         console.log("[Ads] 🔄 Frame reloaded — waiting...");
//         await sleep(2000);
//         continue;
//       }
//       console.warn(`[Ads] ⚠️  Round ${round} error: ${err.message}`);
//       await sleep(AD_CHECK_INTERVAL);
//     }
//   }

//   console.log(
//     totalSkipped > 0
//       ? `[Ads] ✅ Total ads skipped: ${totalSkipped}`
//       : "[Ads] ℹ️  No skippable ads found"
//   );
// }

// // ─── Main ─────────────────────────────────────────────────────────────────────
// async function run() {
//   let browser;
//   try {
//     console.log("\n=========================================");
//     console.log("  YouTube Automation — Playwright edition");
//     console.log("=========================================\n");

//     const launched = await launchBrowser();
//     browser        = launched.browser;
//     const page     = launched.page;

//     await searchYouTube(page, SEARCH_QUERY);
//     await findAndPlayVideo(page);
//     await skipAds(page);

//     console.log("\n✨ Done! Video is playing ad-free.");
//     console.log("   Browser stays open for 60 seconds...\n");
//     await sleep(60000);

//   } catch (err) {
//     console.error("\n❌ Fatal error:", err.message);
//     process.exit(1);
//   } finally {
//     if (browser) {
//       console.log("[Browser] 🛑 Closing...");
//       await browser.close();
//     }
//   }
// }

// run();

// const { chromium } = require("playwright");
// const os   = require("os");
// const fs   = require("fs");
// const path = require("path");

// // --- Config ------------------------------------------------------------------
// const SEARCH_QUERY      = "bairan";
// const AD_CHECK_ROUNDS   = 60;
// const AD_CHECK_INTERVAL = 1000;
// const POST_SKIP_WAIT    = 3000;
// // -----------------------------------------------------------------------------

// // Your Chrome executable
// const CHROME_PATH = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";

// // Your REAL Chrome User Data directory (contains Default, Profile 1, etc.)
// const REAL_USER_DATA = `C:\\Users\\${os.userInfo().username}\\AppData\\Local\\Google\\Chrome\\User Data`;

// // Which profile folder inside User Data holds your YouTube login
// // Check chrome://version -> "Profile Path" -> last folder name
// // Usually "Default", sometimes "Profile 1", "Profile 2", etc.
// const PROFILE_NAME = "Default";

// // Where we'll copy the profile for Playwright to use
// // Must be a DIFFERENT location from REAL_USER_DATA
// const PLAYWRIGHT_USER_DATA = path.join(__dirname, "pw-chrome-data");

// // -----------------------------------------------------------------------------

// const SKIP_SELECTORS = [
//   ".ytp-skip-ad-button",
//   "button.ytp-skip-ad-button",
//   "button.ytp-ad-skip-button",
//   "button.ytp-ad-skip-button-modern",
//   "button[class*='skip-ad']",
//   "button[class*='ytp-skip']",
//   "button[aria-label*='Skip']",
//   "button[aria-label*='skip']",
// ];

// const AD_PRESENCE_SELECTORS = [
//   ".ytp-ad-player-overlay",
//   ".ytp-ad-module",
//   ".ytp-ad-progress",
//   ".video-ads",
//   ".ytp-ad-text",
//   ".ytp-ad-preview-text",
// ];

// const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// const FORCE_RESYNC = false;
// // --- Copy Chrome profile into the Playwright user data dir -------------------
// // Chrome requires the profile to live at <userDataDir>/<profileName>/
// // So we copy your Default profile to pw-chrome-data/Default/
// function syncProfile() {
//   const src  = path.join(REAL_USER_DATA, PROFILE_NAME);
//   const dest = path.join(PLAYWRIGHT_USER_DATA, PROFILE_NAME);

//   if (!fs.existsSync(PLAYWRIGHT_USER_DATA)) {
//     fs.mkdirSync(PLAYWRIGHT_USER_DATA, { recursive: true });
//   }
//   if (!fs.existsSync(dest)) {
//     fs.mkdirSync(dest, { recursive: true });
//   }

//   // ✅ If Cookies already exist in pw-chrome-data, skip syncing
// const destCookies = path.join(dest, "Cookies");
// if (fs.existsSync(destCookies) && !FORCE_RESYNC) {
//   console.log("[Profile] Existing session found — skipping sync to preserve login");
//   return;
// }

//   console.log("[Profile] First run — copying Chrome profile...");

//   // Also copy the top-level Local State file
//   const localStateSrc  = path.join(REAL_USER_DATA, "Local State");
//   const localStateDest = path.join(PLAYWRIGHT_USER_DATA, "Local State");
//   if (fs.existsSync(localStateSrc)) {
//     try { fs.copyFileSync(localStateSrc, localStateDest); } catch (_) {}
//   }

//   const essentialFiles = [
//     "Cookies",
//     "Cookies-journal",
//     "Login Data",
//     "Login Data For Account",
//     "Web Data",
//     "Preferences",
//     "Secure Preferences",
//     "Network Persistent State",
//     "TransportSecurity",
//   ];

//   const essentialDirs = [
//     "Local Storage",
//     "Session Storage",
//     "IndexedDB",
//     "Extension Cookies",
//     "Storage",
//   ];

//   let copied = 0;

//   for (const name of essentialFiles) {
//     const s = path.join(src, name);
//     const d = path.join(dest, name);
//     try {
//       if (fs.existsSync(s)) { fs.copyFileSync(s, d); copied++; }
//     } catch (e) {
//       console.warn(`[Profile] Skipped "${name}" (${e.message})`);
//     }
//   }

//   for (const name of essentialDirs) {
//     const s = path.join(src, name);
//     const d = path.join(dest, name);
//     try {
//       if (fs.existsSync(s)) { copyDirSync(s, d); copied++; }
//     } catch (e) {
//       console.warn(`[Profile] Skipped dir "${name}" (${e.message})`);
//     }
//   }

//   console.log(`[Profile] Synced ${copied} item(s) from your Chrome profile`);
// }

// function copyDirSync(src, dest) {
//   if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
//   for (const entry of fs.readdirSync(src)) {
//     const s = path.join(src, entry);
//     const d = path.join(dest, entry);
//     try {
//       if (fs.statSync(s).isDirectory()) copyDirSync(s, d);
//       else fs.copyFileSync(s, d);
//     } catch (_) {}
//   }
// }

// // --- Debug: print all frames -------------------------------------------------
// async function debugFrames(page) {
//   const frames = page.frames();
//   console.log(`\n[Debug] Total frames: ${frames.length}`);
//   for (const frame of frames) {
//     try {
//       const url = frame.url();
//       let foundSkip = null;
//       for (const sel of SKIP_SELECTORS) {
//         if ((await frame.locator(sel).count()) > 0) { foundSkip = sel; break; }
//       }
//       let foundAd = false;
//       for (const sel of AD_PRESENCE_SELECTORS) {
//         if ((await frame.locator(sel).count()) > 0) { foundAd = true; break; }
//       }
//       console.log(
//         `[Debug]  url: ${url.substring(0, 80)}\n` +
//         `         skipBtn: ${foundSkip || "none"} | adPresent: ${foundAd}`
//       );
//     } catch (_) {}
//   }
//   console.log("");
// }

// // --- Search all frames for ad state ------------------------------------------
// async function findAdState(page) {
//   for (const frame of page.frames()) {
//     try {
//       let adPresent = false;
//       for (const sel of AD_PRESENCE_SELECTORS) {
//         if ((await frame.locator(sel).count()) > 0) { adPresent = true; break; }
//       }

//       let canSkip = false;
//       let skipSel = null;
//       for (const sel of SKIP_SELECTORS) {
//         const btn = frame.locator(sel).first();
//         if ((await btn.count()) > 0 && (await btn.isVisible().catch(() => false))) {
//           canSkip = true; skipSel = sel; break;
//         }
//       }

//       let countdown = null;
//       for (const sel of [".ytp-ad-text", ".ytp-ad-preview-text", ".ytp-ad-simple-ad-badge"]) {
//         const el = frame.locator(sel).first();
//         if ((await el.count()) > 0) {
//           countdown = (await el.textContent().catch(() => "")).trim();
//           break;
//         }
//       }

//       if (adPresent || canSkip) return { frame, adPresent, canSkip, skipSel, countdown };
//     } catch (_) {}
//   }
//   return null;
// }

// // --- Launch browser ----------------------------------------------------------
// async function launchBrowser() {
//   console.log("[Browser] Syncing your Chrome login profile...");
//   console.log("[Browser] Make sure Chrome is fully closed before continuing!\n");
//   syncProfile();

//   console.log("\n[Browser] Launching Chrome with your profile...");

//   const context = await chromium.launchPersistentContext(PLAYWRIGHT_USER_DATA, {
//     executablePath: CHROME_PATH,
//     headless: false,
//     channel: "chrome",
// args: [
//   `--profile-directory=${PROFILE_NAME}`,
//   "--disable-blink-features=AutomationControlled",
//   "--disable-infobars",          // ✅ hides ALL info bars including this one
//   "--no-first-run",
//   "--no-default-browser-check",
//   "--password-store=basic",
//   "--log-level=3",               // ✅ suppresses console warnings too
// ],
// ignoreDefaultArgs: ["--disable-extensions", "--no-sandbox", "--enable-automation"],    viewport: null,
   
//   });
//     // ✅ ADD IT HERE — before any page navigation
//   await context.addInitScript(() => {
//     Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
//   });

//   const page = context.pages()[0] || (await context.newPage());
//   console.log("[Browser] Chrome launched with your profile — you should be logged in");
//   return { context, page };
// }

// // --- Consent banner ----------------------------------------------------------
// async function handleConsentBanner(page) {
//   const selectors = [
//     'button[aria-label="Accept all"]',
//     'button[aria-label="Reject all"]',
//     "tp-yt-paper-button#agree",
//     "ytd-consent-bump-v2-lightbox button:first-of-type",
//   ];
//   for (const sel of selectors) {
//     try {
//       const btn = page.locator(sel).first();
//       if (await btn.isVisible({ timeout: 2000 }).catch(() => false)) {
//         console.log("[Browser] Dismissing consent banner...");
//         await btn.click();
//         await sleep(2000);
//         return;
//       }
//     } catch (_) {}
//   }
// }

// // --- Search YouTube ----------------------------------------------------------
// async function searchYouTube(page, query) {
//   console.log("[YouTube] Navigating to YouTube...");
//   await page.goto("https://www.youtube.com", { waitUntil: "networkidle" });
//   await sleep(2000);
//   await handleConsentBanner(page);

//   console.log(`[YouTube] Searching for "${query}"...`);
//   const searchBox = page.locator('input[name="search_query"]');
//   await searchBox.click();
//   await searchBox.fill(query);
//   await page.keyboard.press("Enter");

//   await page.waitForSelector("ytd-video-renderer", { timeout: 10000 });
//   await sleep(1000);
//   console.log("[YouTube] Search results loaded");
// }

// // --- Find and play a non-Short video -----------------------------------------
// async function findAndPlayVideo(page) {
//   console.log("[YouTube] Finding a regular video...");

//   const videoCards = page.locator("ytd-video-renderer, ytd-grid-video-renderer");
//   const count = await videoCards.count();
//   console.log(`[YouTube] Found ${count} result(s)`);

//   function parseDuration(str) {
//     const parts = (str || "").trim().split(":").map(Number);
//     if (parts.length === 2) return parts[0] * 60 + parts[1];
//     if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
//     return 0;
//   }

//   for (let i = 0; i < count; i++) {
//     const card     = videoCards.nth(i);
//     const titleEl  = card.locator("#video-title").first();
//     const href     = (await titleEl.getAttribute("href").catch(() => "")) || "";
//     const duration = await card
//       .locator("span.style-scope.ytd-thumbnail-overlay-time-status-renderer")
//       .first()
//       .textContent()
//       .catch(() => "");

//     const isShort      = href.includes("/shorts/");
//     const durationSecs = parseDuration(duration);
//     const title        = (await titleEl.textContent().catch(() => "Unknown")).trim();

//     if (!isShort && durationSecs > 60) {
//       console.log(`[YouTube] Playing: "${title}" (${duration.trim()})`);
//       await titleEl.click();
//       await page.waitForSelector("video.html5-main-video", { timeout: 15000 });
//       await sleep(4000);
//       console.log("[YouTube] Video page ready");
//       return;
//     }
//   }

//   throw new Error("No suitable non-Short video found in results");
// }

// // --- Main ad skip loop -------------------------------------------------------
// async function skipAds(page) {
//   console.log("\n[Ads] Starting ad skip loop...");
//   await sleep(2000);
//   await debugFrames(page);

//   let totalSkipped = 0;
//   let noAdStreak   = 0;
//   let lastSkipTime = 0;

//   for (let round = 1; round <= AD_CHECK_ROUNDS; round++) {
//     try {
//       const adInfo = await findAdState(page);

//       if (!adInfo) {
//         noAdStreak++;
//         if (noAdStreak >= 4) {
//           console.log("[Ads] No ad for 4 consecutive checks — done\n");
//           break;
//         }
//         await sleep(AD_CHECK_INTERVAL);
//         continue;
//       }

//       noAdStreak = 0;

//       if (adInfo.canSkip) {
//         const now = Date.now();
//         if (now - lastSkipTime < POST_SKIP_WAIT) {
//           await sleep(AD_CHECK_INTERVAL);
//           continue;
//         }
//         try {
//           const btn = adInfo.frame.locator(adInfo.skipSel).first();
//           await btn.click({ timeout: 3000 });
//           totalSkipped++;
//           lastSkipTime = Date.now();
//           console.log(`[Ads] Ad #${totalSkipped} skipped (${adInfo.skipSel})`);
//           await sleep(POST_SKIP_WAIT);
//           continue;
//         } catch (clickErr) {
//           console.warn(`[Ads] Click failed: ${clickErr.message}`);
//         }
//       }

//       if (adInfo.countdown) {
//         console.log(`[Ads] "${adInfo.countdown}" — waiting for skip button...`);
//       } else {
//         console.log("[Ads] Ad detected — skip not available yet...");
//       }

//       await sleep(AD_CHECK_INTERVAL);

//     } catch (err) {
//       if (err.message.includes("detached") || err.message.includes("Frame") || err.message.includes("closed")) {
//         console.log("[Ads] Frame reloaded — waiting...");
//         await sleep(2000);
//         continue;
//       }
//       console.warn(`[Ads] Round ${round} error: ${err.message}`);
//       await sleep(AD_CHECK_INTERVAL);
//     }
//   }

//   console.log(
//     totalSkipped > 0
//       ? `[Ads] Total ads skipped: ${totalSkipped}`
//       : "[Ads] No skippable ads found"
//   );
// }

// // --- Main --------------------------------------------------------------------
// async function run() {
//   let context;
//   try {
//     console.log("\n=====================================================");
//     console.log("  YouTube Automation — Playwright + your Chrome login");
//     console.log("=====================================================\n");

//     const launched = await launchBrowser();
//     context        = launched.context;
//     const page     = launched.page;

//     await searchYouTube(page, SEARCH_QUERY);
//     await findAndPlayVideo(page);
//     await skipAds(page);

//     console.log("\nDone! Video is playing ad-free.");
//     console.log("Browser stays open for 60 seconds...\n");
//     await sleep(60000);

//   } catch (err) {
//     console.error("\nFatal error:", err.message);
//     process.exit(1);
//   } finally {
//     if (context) {
//       console.log("[Browser] Closing...");
//       await context.close();
//     }
//   }
// }

// run();

const { chromium } = require("playwright");

const SEARCH_QUERY = "bairan";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function run() {
  console.log("Connecting to your running Chrome...");
  
  // Connect to your already-open Chrome (no profile copying needed!)
  const browser = await chromium.connectOverCDP("http://localhost:9222");
  const context = browser.contexts()[0];
  const page = context.pages()[0] || await context.newPage();

  console.log("Connected! Navigating to YouTube...");
  await page.goto("https://www.youtube.com", { waitUntil: "domcontentloaded" });
  await sleep(2000);

  // Search
  console.log(`Searching for "${SEARCH_QUERY}"...`);
  const searchBox = page.locator('input[name="search_query"]');
  await searchBox.click();
  await searchBox.type(SEARCH_QUERY, { delay: 80 });
  await page.keyboard.press("Enter");
  await page.waitForSelector("ytd-video-renderer", { timeout: 10000 });
  await sleep(1000);

  // Click first non-short video
  const videoCards = page.locator("ytd-video-renderer");
  const count = await videoCards.count();
  for (let i = 0; i < count; i++) {
    const card = videoCards.nth(i);
    const titleEl = card.locator("#video-title").first();
    const href = (await titleEl.getAttribute("href").catch(() => "")) || "";
    if (!href.includes("/shorts/")) {
      const title = (await titleEl.textContent().catch(() => "Unknown")).trim();
      console.log(`Playing: "${title}"`);
      await titleEl.click();
      await page.waitForSelector("video.html5-main-video", { timeout: 15000 });
      await sleep(4000);
      break;
    }
  }

  // Skip ads
  console.log("Watching for ads...");
  for (let i = 0; i < 60; i++) {
    const skipBtn = page.locator("button.ytp-ad-skip-button, button.ytp-skip-ad-button").first();
    if (await skipBtn.isVisible({ timeout: 500 }).catch(() => false)) {
      await skipBtn.click();
      console.log("Ad skipped!");
      await sleep(2000);
    }
    await sleep(1000);
  }

  console.log("Done!");
}

run().catch(console.error);