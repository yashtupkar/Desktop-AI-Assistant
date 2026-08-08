const { spawn } = require("child_process");
const path = require("path");
const fs = require("fs");

/**
 * Python subprocess bridge for browser automation
 * Spawns the Python agent and communicates via stdout/stderr
 */
class PythonBridge {
  constructor() {
    this.process = null;
    this.isRunning = false;
  }

  /**
   * Run a Python browser automation task
   * @param {string} task - The task description
   * @param {object} args - Additional arguments for the task
   * @returns {Promise<object>} - Result with success status and data/error
   */
  async runTask(task, args = {}) {
    return new Promise((resolve, reject) => {
      const scriptPath = path.join(__dirname, "agent.py");
      
      if (!fs.existsSync(scriptPath)) {
        return reject(new Error(`Python agent script not found: ${scriptPath}`));
      }

      console.log(`[PythonBridge] Starting task: ${task.substring(0, 50)}...`);

      // Prepare environment variables
      const env = {
        ...process.env,
        TASK: task,
        ARGS: JSON.stringify(args),
      };

      // Spawn Python process
      this.process = spawn("python", [scriptPath], {
        env,
        cwd: path.join(__dirname, ".."),
      });

      this.isRunning = true;

      let stdout = "";
      let stderr = "";

      // Collect stdout
      this.process.stdout.on("data", (data) => {
        stdout += data.toString();
      });

      // Collect stderr
      this.process.stderr.on("data", (data) => {
        stderr += data.toString();
        console.error(`[PythonBridge] stderr: ${data}`);
      });

      // Handle process completion
      this.process.on("close", (code) => {
        this.isRunning = false;
        console.log(`[PythonBridge] Process exited with code ${code}`);
        console.log(`[PythonBridge] stdout: ${stdout.substring(0, 500)}`);
        console.log(`[PythonBridge] stderr: ${stderr.substring(0, 500)}`);

        if (code === 0) {
          try {
            // Try to parse JSON output
            const result = JSON.parse(stdout.trim());
            resolve({ success: true, data: result });
          } catch (e) {
            // If not JSON, return raw output
            resolve({ success: true, data: { output: stdout.trim() } });
          }
        } else {
          reject(new Error(`Python process failed with code ${code}: ${stderr}`));
        }
      });

      // Handle process errors
      this.process.on("error", (error) => {
        this.isRunning = false;
        console.error(`[PythonBridge] Process error: ${error.message}`);
        reject(error);
      });

      // Set timeout (5 minutes max)
      const timeout = setTimeout(() => {
        if (this.isRunning) {
          this.kill();
          reject(new Error("Python task timed out after 5 minutes"));
        }
      }, 5 * 60 * 1000);

      this.process.on("close", () => {
        clearTimeout(timeout);
      });
    });
  }

  /**
   * Kill the running Python process
   */
  kill() {
    if (this.process && this.isRunning) {
      console.log("[PythonBridge] Killing process...");
      this.process.kill();
      this.isRunning = false;
    }
  }

  /**
   * Check if a process is currently running
   */
  isActive() {
    return this.isRunning;
  }
}

// Export singleton instance
module.exports = new PythonBridge();
