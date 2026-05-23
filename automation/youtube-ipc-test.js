/**
 * YouTube Automation Test Script (Electron IPC Version)
 * 
 * This version is meant to be used WITHIN the Electron app via the preload/renderer
 * process. Use this if you want to leverage the existing IPC handlers in main.js
 * 
 * To use this in your frontend React app:
 * 1. Import this as a module
 * 2. Call runYouTubeAutomation() from your component or button handler
 * 3. The automation will use the existing browser automation IPC handlers
 */

/**
 * Main automation function - Call this from your React component
 */
async function runYouTubeAutomation() {
  try {
    console.log("\n========================================");
    console.log("   YouTube Automation Test (IPC)");
    console.log("========================================\n");

    // Start browser
    console.log("[Automation] Starting browser...");
    const browserResult = await window.ipcRenderer.invoke("browser-start");
    if (!browserResult.success) {
      throw new Error(browserResult.error || "Failed to start browser");
    }
    console.log("[Automation] ✅ Browser started");

    // Navigate to YouTube
    console.log("[Automation] 🔍 Navigating to YouTube...");
    const youtubeResult = await window.ipcRenderer.invoke("browser-goto", "https://www.youtube.com");
    if (!youtubeResult.success) {
      throw new Error(youtubeResult.error || "Failed to navigate to YouTube");
    }
    console.log("[Automation] ✅ YouTube loaded");

    // Wait for page to fully load
    await new Promise(r => setTimeout(r, 3000));

    // Get DOM to find search box
    console.log("[Automation] 📋 Getting page DOM...");
    const domResult = await window.ipcRenderer.invoke("browser-get-dom");
    if (!domResult.success) {
      throw new Error("Failed to get DOM");
    }

    // Find search input
    const searchElement = domResult.dom.elements.find(
      el => el.tag === "input" && el.type === "text" && el.label.includes("search")
    );
    if (!searchElement) {
      throw new Error("Search box not found");
    }

    // Type in search box
    console.log("[Automation] 🔍 Typing 'bairan' in search box...");
    const typeResult = await window.ipcRenderer.invoke("browser-type", searchElement.id, "bairan");
    if (!typeResult.success) {
      throw new Error(typeResult.error || "Failed to type in search");
    }

    // Press Enter to search
    console.log("[Automation] ⏎ Pressing Enter to search...");
    const enterResult = await window.ipcRenderer.invoke("browser-keyboard", "Enter");
    if (!enterResult.success) {
      throw new Error(enterResult.error || "Failed to press Enter");
    }

    // Wait for search results
    await new Promise(r => setTimeout(r, 4000));

    // Get new DOM with search results
    console.log("[Automation] 📹 Getting search results...");
    const resultsDOM = await window.ipcRenderer.invoke("browser-get-dom");
    if (!resultsDOM.success) {
      throw new Error("Failed to get search results DOM");
    }

    // Find video links (filtering out ads and shorts)
    const videoLinks = resultsDOM.dom.elements.filter(
      el => el.tag === "a" && el.label.length > 5 && !el.label.toLowerCase().includes("short")
    );

    if (videoLinks.length === 0) {
      throw new Error("No videos found in search results");
    }

    // Click first video
    console.log(`[Automation] ▶️ Playing: "${videoLinks[0].label}"`);
    const clickResult = await window.ipcRenderer.invoke("browser-click", videoLinks[0].id);
    if (!clickResult.success) {
      throw new Error(clickResult.error || "Failed to click video");
    }

    // Wait for video to load
    await new Promise(r => setTimeout(r, 5000));

    console.log("[Automation] ✅ Video is now playing!");
    console.log("[Automation] ✨ Automation completed successfully!\n");

    return {
      success: true,
      message: "YouTube automation completed successfully",
      videoTitle: videoLinks[0].label,
    };

  } catch (error) {
    console.error("[Automation] ❌ Error:", error.message);
    
    // Close browser on error
    try {
      await window.ipcRenderer.invoke("browser-close");
    } catch (closeError) {
      console.error("Error closing browser:", closeError.message);
    }

    throw error;
  }
}

/**
 * Cleanup function - Call this when you're done with automation
 */
async function stopYouTubeAutomation() {
  try {
    console.log("[Automation] 🛑 Closing browser...");
    const result = await window.ipcRenderer.invoke("browser-close");
    console.log("[Automation] ✅ Browser closed");
    return result;
  } catch (error) {
    console.error("[Automation] Error closing browser:", error.message);
    throw error;
  }
}

// Export for use in React components
if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    runYouTubeAutomation,
    stopYouTubeAutomation,
  };
}
