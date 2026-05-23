const fs = require("fs");
const path = require("path");
const os = require("os");
const { spawn, exec } = require("child_process");

/**
 * Diagnostic script to test Chrome launch and debugging port
 */

async function checkChromePath() {
  console.log("\n📋 Checking Chrome installation...");
  const possiblePaths = [
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  ];

  for (const chromePath of possiblePaths) {
    if (fs.existsSync(chromePath)) {
      console.log(`✅ Found Chrome at: ${chromePath}`);
      return chromePath;
    }
  }

  console.log("❌ Chrome not found in standard locations");
  return null;
}

async function checkPort(port = 9222) {
  console.log(`\n🔍 Checking if port ${port} is in use...`);
  return new Promise((resolve) => {
    exec(`netstat -ano | findstr :${port}`, (error, stdout, stderr) => {
      if (stdout.includes(port.toString())) {
        console.log(`⚠️  Port ${port} is already in use:`);
        console.log(stdout);
        resolve(true);
      } else {
        console.log(`✅ Port ${port} is available`);
        resolve(false);
      }
    });
  });
}

async function testChromeWithOutput(chromePath) {
  console.log("\n🧪 Testing Chrome launch with output capture...");

  return new Promise((resolve) => {
    let output = "";
    let errorOutput = "";

    const process = spawn(chromePath, [
      "--remote-debugging-port=9222",
      "--headless",
      "--disable-extensions",
      "--no-first-run",
      "about:blank",
    ], {
      stdio: ["ignore", "pipe", "pipe"],
    });

    // Capture output
    if (process.stdout) {
      process.stdout.on("data", (data) => {
        output += data.toString();
        console.log(`[STDOUT] ${data.toString().trim()}`);
      });
    }

    if (process.stderr) {
      process.stderr.on("data", (data) => {
        errorOutput += data.toString();
        console.log(`[STDERR] ${data.toString().trim()}`);
      });
    }

    process.on("error", (err) => {
      console.log(`❌ Process error: ${err.message}`);
      resolve(false);
    });

    // Give it 5 seconds to start
    setTimeout(() => {
      process.kill();
      console.log("✅ Chrome process spawned (killed after 5s)");
      resolve(true);
    }, 5000);
  });
}

async function testDebugPort(chromePath) {
  console.log("\n🔌 Testing debugging port with Chrome running...");

  // Clean up first
  exec("taskkill /IM chrome.exe /F 2>nul", () => {});
  await new Promise((r) => setTimeout(r, 1000));

  const userDataDir = path.join(
    os.homedir(),
    "AppData",
    "Local",
    "Google",
    "Chrome",
    "User Data"
  );

  // Launch Chrome
  const chromeProcess = spawn(chromePath, [
    "--remote-debugging-port=9222",
    `--user-data-dir=${userDataDir}`,
    "--no-first-run",
    "--disable-extensions",
  ], {
    detached: true,
    stdio: "ignore",
  });

  chromeProcess.unref();

  // Wait and test
  await new Promise((r) => setTimeout(r, 5000));

  console.log("📡 Attempting to connect to debugging port...");
  for (let i = 1; i <= 10; i++) {
    try {
      const response = await fetch("http://127.0.0.1:9222/json/version", { timeout: 2000 });
      if (response.ok) {
        const data = await response.json();
        console.log(`✅ Successfully connected to debugging port!`);
        console.log(`   Browser: ${data.Browser}`);
        exec("taskkill /IM chrome.exe /F 2>nul", () => {});
        return true;
      }
    } catch (error) {
      console.log(`   Attempt ${i}/10: Port not ready yet...`);
      await new Promise((r) => setTimeout(r, 1000));
    }
  }

  console.log("❌ Could not connect to debugging port after 10 attempts");
  exec("taskkill /IM chrome.exe /F 2>nul", () => {});
  return false;
}

async function runDiagnostics() {
  console.log("\n" + "=".repeat(50));
  console.log("   Chrome Launch Diagnostics");
  console.log("=".repeat(50));

  try {
    // Step 1: Check Chrome path
    const chromePath = await checkChromePath();
    if (!chromePath) {
      console.log("\n⚠️  Please install Google Chrome");
      return;
    }

    // Step 2: Check if port is in use
    const portInUse = await checkPort(9222);
    if (portInUse) {
      console.log("\n⚠️  Cleaning up port 9222...");
      exec("taskkill /IM chrome.exe /F 2>nul", () => {});
      await new Promise((r) => setTimeout(r, 2000));
    }

    // Step 3: Test Chrome can launch
    await testChromeWithOutput(chromePath);

    // Step 4: Test debugging port
    const debugPortWorks = await testDebugPort(chromePath);

    // Final recommendations
    console.log("\n" + "=".repeat(50));
    console.log("   Diagnostic Results");
    console.log("=".repeat(50));

    if (debugPortWorks) {
      console.log("✅ All systems operational! Try: npm run test:youtube");
    } else {
      console.log("\n❌ Chrome debugging port is not responding");
      console.log("\n📝 Possible solutions:");
      console.log("   1. Ensure no other processes are using port 9222:");
      console.log("      netstat -ano | findstr :9222");
      console.log("   2. Close all Chrome windows completely");
      console.log("   3. Disable Chrome extensions that might block debugging");
      console.log("   4. Try disabling Windows Defender temporarily");
      console.log("   5. Reinstall Chrome");
    }

    console.log("");
  } catch (error) {
    console.error("\n❌ Diagnostic error:", error.message);
  }
}

runDiagnostics();
