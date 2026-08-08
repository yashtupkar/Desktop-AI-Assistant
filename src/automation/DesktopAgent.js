import { ActionValidator } from "../security/ActionValidator";

export class DesktopAgent {
  constructor(onLog, onStateChange, speak, onConfirm) {
    this.onLog = onLog;
    this.onStateChange = onStateChange;
    this.speak = speak;
    this.onConfirm = onConfirm;
    this.isRunning = false;
    this.actionHistory = [];
  }

  stop() {
    this.isRunning = false;
    this.onLog("Desktop automation stopped.");
  }

  async start(taskDescription) {
    this.isRunning = true;
    this.actionHistory = [];
    this.onLog(`Starting desktop agent for: ${taskDescription}`);
    if (this.speak) this.speak("Desktop automation active. Please do not touch your mouse or keyboard.");
    
    const MAX_STEPS = 10;
    let stepCount = 0;
    let isDone = false;

    while (this.isRunning && !isDone && stepCount < MAX_STEPS) {
      stepCount++;
      this.onStateChange("thinking");
      this.onLog(`Step ${stepCount}/${MAX_STEPS}: Capturing screen...`);
      
      const screenRes = await window.electronAPI.takeScreenshot();
      if (!screenRes.success) {
        this.onLog(`Failed to capture screen: ${screenRes.error}`);
        break;
      }

      const base64Image = screenRes.imageBase64;

      const prompt = `
You are an autonomous desktop AI agent named Nova.

TASK:
${taskDescription}

PREVIOUS ACTIONS:
${this.actionHistory.join("\n") || "None"}

INSTRUCTIONS:
Examine the provided screenshot of the desktop. 
Return ONLY a valid JSON array of objects representing the sequence of actions to take. This allows you to perform multiple fast actions in a row (like clicking a search bar, typing, and hitting enter) without waiting for new screenshots.
Do not include any explanation or markdown formatting (like \`\`\`json). Just the raw JSON array.

Example of a fast multi-step sequence:
[
  {"action": "click_text", "text": "Search"},
  {"action": "type", "text": "Airtel"},
  {"action": "wait", "ms": 1500},
  {"action": "hotkey", "keys": ["enter"]},
  {"action": "wait", "ms": 1000},
  {"action": "type", "text": "Hi"},
  {"action": "hotkey", "keys": ["enter"]},
  {"action": "done", "message": "Message sent"}
]

If you previously did something, check the screen to see if it actually worked. If the expected result isn't visible, you should try a different approach.

If the task is completed and the expected final state is visible on screen, return: {"action": "done", "message": "Task complete"}

AVAILABLE ACTIONS:
{"action": "click_text", "text": "Search", "reason": "clicking the search bar"}
{"action": "type", "text": "hello", "reason": "entering text"}
{"action": "hotkey", "keys": ["enter"], "reason": "submitting search"}
{"action": "open_app", "app": "chrome", "reason": "need browser"}
{"action": "wait", "ms": 2000, "reason": "waiting for app to load"}
{"action": "done", "message": "Success!"}

IMPORTANT:
- NEVER guess x and y coordinates! Always use "click_text" to click on buttons or search bars.
- BE SMART: If the contact you want to message is ALREADY visible on the screen in the recent chats list, DO NOT search! Just {"action": "click_text", "text": "Contact Name"} directly to open the chat.
- ONLY search if the contact is NOT on the screen.
- WHATSAPP STRICT RULE: If you MUST search, use the exact sequence: click_text "Search", type the name, Wait, hit Enter, Wait, type the message, hit Enter. (Do NOT try to click the message input box, it is already focused automatically!)
- DYNAMIC TEXT: If the user asks you to write a "lovely message", an "apology", a "joke", etc., GENERATE the actual creative text in the "type" action. Do NOT literally type "a lovely message".
- BROWSER AUTOMATION: If your task is to click a video on YouTube or interact with a webpage, you MUST start your array with {"action": "wait", "ms": 4000} to give the browser time to load the webpage before you try to click anything!
- YOUTUBE ADS: If you are instructed to click a video on YouTube, NEVER click on an "Ad" or "Sponsored" video. Always use "click_text" to click on the exact TITLE of the song/video you are looking for (e.g. {"action": "click_text", "text": "Jogi"}).
- YOU MUST ALWAYS END YOUR ARRAY WITH {"action": "done", "message": "..."} if the task is fully completed.

Analyze the screen layout, find the text you need to interact with, and execute the best next steps.`;

      const messages = [
        {
          role: "user",
          content: [
            { type: "text", text: prompt },
            {
              type: "image_url",
              image_url: {
                url: `data:image/png;base64,${base64Image}`
              }
            }
          ]
        }
      ];

      this.onLog("Thinking...");
      const aiRes = await window.electronAPI.aiChat(messages, "google/gemini-2.5-flash-lite");
      
      if (!aiRes.success) {
        this.onLog(`AI Error: ${aiRes.error}`);
        break;
      }

      let actions;
      try {
        let cleanJson = aiRes.message.trim();
        if (cleanJson.startsWith("\`\`\`json")) {
          cleanJson = cleanJson.replace(/^\`\`\`json\n?/, "").replace(/\n?\`\`\`$/, "");
        }
        actions = JSON.parse(cleanJson);
        if (!Array.isArray(actions)) {
          actions = [actions];
        }
      } catch (err) {
        this.onLog(`Failed to parse AI response: ${aiRes.message}`);
        this.actionHistory.push("FAILED: Invalid JSON");
        continue;
      }

      this.onLog(`AI Decision: ${JSON.stringify(actions)}`);

      for (const actionObj of actions) {
        if (actionObj.action === "done") {
          isDone = true;
          this.onLog(actionObj.message || "Task completed by agent.");
          if (this.speak) this.speak(actionObj.message || "Task completed, Sir.");
          break;
        }

        const validation = ActionValidator.validate(actionObj);
        if (!validation.valid) {
          this.onLog(`Security Blocked Action: ${validation.error}`);
          this.actionHistory.push(`BLOCKED: ${actionObj.action} - ${validation.error}`);
          if (this.speak) this.speak("Security warning: This action is restricted, Sir.");
          isDone = true;
          break; // Stop execution on security violation
        }

        // Removed confirmation modal as it blocks automated flows

        this.onStateChange("speaking"); // visual feedback
        this.onLog(`Executing: ${actionObj.action}`);
        if (this.speak && actionObj.reason) {
          this.speak(actionObj.reason);
        }

        let executeRes;
        if (actionObj.action === "open_app") {
           executeRes = await window.electronAPI.openApp(actionObj.app);
        } else {
           executeRes = await window.electronAPI.desktopAction(actionObj);
        }

        if (!executeRes.success) {
          this.onLog(`Action Failed: ${executeRes.error}`);
          this.actionHistory.push(`FAILED: ${actionObj.action}`);
          if (this.speak) this.speak(`Action failed, Sir.`);
          break; // If one step fails, stop the sequence and take a new screenshot
        } else {
          this.actionHistory.push(JSON.stringify(actionObj));
        }
        
        // Very fast delay between array actions so the UI catches up
        await new Promise(r => setTimeout(r, 800));
      }
      
      this.onStateChange("idle");
      // Add delay before the next full screenshot cycle
      await new Promise(r => setTimeout(r, 1500));
    }

    this.isRunning = false;
    this.onStateChange("idle");
    if (!isDone && stepCount >= MAX_STEPS) {
      this.onLog("Max steps reached. Automation stopped.");
    }
  }
}
