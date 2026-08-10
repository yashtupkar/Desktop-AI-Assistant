import React, { useState, useEffect, useRef } from "react";
import { Orb } from "./components/Orb";
import { ControlPill } from "./components/ControlPill";
import { ConfirmDialog } from "./components/ConfirmDialog";
import { DesktopAgent } from "./automation/DesktopAgent";
import { extractActionPlan } from "./automation/commandExecutor.mjs";
import { usePythonSpeechRecognition } from "./hooks/usePythonSpeechRecognition";
import { useTTS } from "./hooks/useTTS";
import { useSpeechTranscription } from "./hooks/useSpeechTranscription";
import { normalizeVoiceCommand } from "./automation/voiceCommandParser";

const getSystemPrompt = () => `You are Nova, a friendly, helpful, and natural-sounding AI assistant.

Current System Time: ${new Date().toLocaleString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' })}

PERSONALITY:
- Speak like a close friend and helpful companion — warm, casual, and intelligent.
- Do NOT use formal titles like "Sir" or "Madam". Just be conversational.
- Be concise — keep responses under 2-3 sentences for casual questions.
- Don't overly explain your thought process. Just provide the answer or do the action.
- If you don't know something, just say "I'm not sure about that."

RESPONSE RULES:
- Never say "I will do X" or "Initializing Y" when automating. Just do it silently and seamlessly by outputting the correct tag.
- Speak in a natural, conversational tone.
- NEVER repeat an automation tag from a previous message. Only output a tag for the CURRENT user request.

AUTOMATION RULES:
If the user asks to control system settings (like setting volume or brightness to a specific percentage, opening wifi/bluetooth, or sleep), return ONLY:
<SYSTEM_COMMAND>
[command]
</SYSTEM_COMMAND>
Valid commands: volume_up, volume_down, volume_mute, volume_set:[0-100], brightness_up, brightness_down, brightness_set:[0-100], wifi_settings, bluetooth_settings, sleep.
Example: For "set volume to 50%", use volume_set:50

If the user asks to OPEN or START a common application (like notepad, calculator, chrome, vscode, spotify, etc.), do not use desktop automation. Instead, return ONLY:
<OPEN_APP>
[app name]
</OPEN_APP>

If the user asks to interact with the desktop, click something, type something, or automate a desktop app (like WhatsApp), you MUST use OPEN_APP followed by DESKTOP_TASK:
Example for WhatsApp:
<OPEN_APP>
whatsapp
</OPEN_APP>
<DESKTOP_TASK>
Find the contact "Airtel" and send the message "Hi"
</DESKTOP_TASK>

If the user asks to browse websites using advanced browser automation (YouTube, Google search, email, maps, shopping, etc.), return ONLY:

<PYTHON_BROWSER_TASK>
[describe the task clearly]
</PYTHON_BROWSER_TASK>

If the user asks to search for something or look up information, construct the search URL and return ONLY:
<OPEN_URL>
[full url, e.g. https://www.google.com/search?q=weather+in+bhopal]
</OPEN_URL>

If the user asks to PLAY a specific song (on YouTube, Spotify, etc.), or asks you to open a page AND interact with it, you MUST combine the tags sequentially. Do NOT use OPEN_APP for this. Use OPEN_URL with the search URL, then DESKTOP_TASK:
<OPEN_URL>
https://www.youtube.com/results?search_query=arijit+singh
</OPEN_URL>
<DESKTOP_TASK>
Click on the video titled "arijit singh"
</DESKTOP_TASK>

If the user asks for simple browser navigation or basic website interaction, return ONLY:

<BROWSER_TASK>
[describe the task clearly]
</BROWSER_TASK>

Note: Only use PYTHON_BROWSER_TASK if the user explicitly wants you to autonomously navigate a complex website (like Gmail or Amazon), click multiple buttons, extract complex data, or read the screen. DO NOT use this for desktop apps like WhatsApp.
Example for Gmail:
<PYTHON_BROWSER_TASK>
Go to Gmail and send an email to John saying "Hello"
</PYTHON_BROWSER_TASK>
- Google searches with result extraction
- Email operations (Gmail)
- Maps and directions
- Shopping searches (Amazon, Flipkart)
- News retrieval
- Weather information
- WhatsApp messaging
- LinkedIn job searches
- Form filling
- Data scraping
`;

export default function App() {
  const [messages, setMessages] = useState([]);
  const [aiModel] = useState("google/gemini-2.5-flash-lite");
  const [assistantState, setAssistantState] = useState("idle");
  const [liveTranscript, setLiveTranscript] = useState("");
  const [transcriptionStatus, setTranscriptionStatus] = useState("loading");
  const [transcriptionDebug, setTranscriptionDebug] = useState("Waiting for voice...");
  const assistantStateRef = useRef("idle");
  const processMessageRef = useRef(null);
  
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const streamRef = useRef(null);

  // Desktop Agent Hook
  const desktopAgentRef = useRef(null);
  const [showKeyboard, setShowKeyboard] = useState(false);
  const [typedCommand, setTypedCommand] = useState("");
  const autoListenEnabledRef = useRef(true);
  const [confirmDialog, setConfirmDialog] = useState({
    isOpen: false,
    title: "",
    message: "",
    onConfirm: null,
  });
  const [actionLog, setActionLog] = useState([]);
  const handleVoiceCommandResult = (event) => {
    const currentStatus = assistantStateRef.current;
    const resultIndex = event.resultIndex;
    const latestResult = event.results[resultIndex];
    if (!latestResult) return;

    const rawTranscript = latestResult[0].transcript;
    const transcript = rawTranscript.trim();
    const isFinal = latestResult.isFinal !== undefined ? latestResult.isFinal : latestResult[0].isFinal;

    console.log(`[Voice] Hearing (${isFinal ? "final" : "interim"}): "${transcript}"`);
    setTranscriptionDebug(transcript || "Listening for speech...");

    if (currentStatus === "listening") {
      if (isFinal) {
        const command = normalizeVoiceCommand(transcript);
        if (command.length > 0) {
          setLiveTranscript(command);
          if (processMessageRef.current) processMessageRef.current(command);
        } else {
          updateAssistantState("idle");
          setLiveTranscript("");
        }
      } else if (transcript.length > 0) {
        setLiveTranscript(transcript);
      }
    }
  };

  // Custom hooks
  const { speak } = useTTS((isSpeaking) => {
    if (isSpeaking) {
      if (assistantStateRef.current === "thinking" || assistantStateRef.current === "idle") {
        updateAssistantState("speaking");
      }
    } else {
      if (assistantStateRef.current === "speaking") {
        updateAssistantState("idle");
      }
    }
  });
  const { transcriberLoaded, transcribeAudio } = useSpeechTranscription();

  useEffect(() => {
    setTranscriptionStatus(transcriberLoaded ? "ready" : "loading");
  }, [transcriberLoaded]);
  const { speechError, isListening } = usePythonSpeechRecognition(
    true,
    handleVoiceCommandResult
  );

  useEffect(() => {
    desktopAgentRef.current = new DesktopAgent(
      (logMsg) => {
        console.log("[DesktopAgent]", logMsg);
        logAction(logMsg);
      },
      (newState) => {
        updateAssistantState(newState);
      },
      (text) => {
        speak(text);
      },
      async (title, message) => {
        return new Promise((resolve) => {
          setConfirmDialog({
            isOpen: true,
            title,
            message,
            onConfirm: () => {
              setConfirmDialog({ isOpen: false, title: "", message: "", onConfirm: null });
              resolve(true);
            },
          });
        });
      }
    );
  }, []);

  useEffect(() => {
    if (assistantState !== "idle" || !autoListenEnabledRef.current) {
      return;
    }

    // Voice recognition is automatic with the hook, just update state
    if (assistantStateRef.current !== "listening") {
      updateAssistantState("listening");
      setLiveTranscript("Listening for your command...");
    }
  }, [assistantState]);

  const updateAssistantState = (newState) => {
    setAssistantState(newState);
    assistantStateRef.current = newState;
  };

  const logAction = (action) => {
    const timestamp = new Date().toLocaleTimeString();
    setActionLog(prev => [...prev, { timestamp, action }].slice(-20)); // Keep last 20 actions
  };

  useEffect(() => {
    const checkAI = async () => {
      if (window.electronAPI && window.electronAPI.checkAIStatus) {
        await window.electronAPI.checkAIStatus();
      }
    };
    checkAI();
    const interval = setInterval(checkAI, 30000);
    return () => clearInterval(interval);
  }, []);

  const startListening = async () => {
    // Voice recognition is handled by the hook, just update state
    updateAssistantState('listening');
    setLiveTranscript("Listening...");
    setTranscriptionDebug("Microphone active. Speak now...");
  };

  const stopListening = async () => {
    // Voice recognition stops automatically when wakeWordActive is false
    updateAssistantState('idle');
    setLiveTranscript("");
  };

  const runPythonBrowserAgent = async (taskDescription, args = {}) => {
    updateAssistantState("automating");
    setLiveTranscript("Running Python browser automation...");
    logAction(`Python Browser: ${taskDescription.substring(0, 50)}...`);

    try {
      const result = await window.electronAPI.runAutomation(taskDescription, args);
      
      if (result.success) {
        setLiveTranscript("Task completed successfully.");
        logAction("Python Browser: Completed successfully");
        if (result.data && result.data.result) {
          console.log("[PythonAgent] Result:", result.data.result);
          const resultText = String(result.data.result);
          if (resultText.length > 100) {
            setLiveTranscript("Task completed. Check console for details.");
          } else {
            setLiveTranscript(resultText);
          }
        }
      } else {
        setLiveTranscript(`Error: ${result.error || "Unknown error"}`);
        logAction(`Python Browser: Failed - ${result.error || "Unknown error"}`);
        console.error("[PythonAgent] Error:", result.error);
      }
    } catch (error) {
      setLiveTranscript(`Error: ${error.message || "Unknown error"}`);
      logAction(`Python Browser: Error - ${error.message || "Unknown error"}`);
      console.error("[PythonAgent] Exception:", error);
    } finally {
      updateAssistantState("idle");
    }
  };

  const processMessage = async (userText) => {
    if (!userText.trim()) return;
    
    updateAssistantState("thinking");

    setMessages((prev) => [...prev, { role: "user", content: userText }]);

    try {
      const aiMessages = [
        { role: "system", content: getSystemPrompt() },
        ...messages,
        { role: "user", content: userText },
      ];

      let fullResponse = "";
      let processedLength = 0;
      let assistantMessageId = Date.now();
      
      const executedTaskIndexes = new Set();
      
      const runTaskWithRetry = async (task, attempt = 0) => {
        const tryOnce = async () => {
          if (task.type === "OPEN_URL") {
            await window.electronAPI.openUrl(task.value);
            setLiveTranscript(`Opened ${task.value}`);
            await new Promise((resolve) => setTimeout(resolve, 3000));
            return true;
          }

          if (task.type === "OPEN_APP") {
            const res = await window.electronAPI.openApp(task.value);
            if (res.success) {
              setLiveTranscript(`Opened ${task.value}`);
              await new Promise((resolve) => setTimeout(resolve, 2000));
              return true;
            }
            throw new Error(res.message || "Could not open app");
          }

          if (task.type === "SYSTEM_COMMAND") {
            const res = await window.electronAPI.systemCommand(task.value);
            if (res.success) {
              setLiveTranscript(`System command: ${task.value}`);
              return true;
            }
            throw new Error(res.error || "System command failed");
          }

          if (task.type === "PYTHON_BROWSER") {
            await runPythonBrowserAgent(task.value);
            return true;
          }

          if (task.type === "DESKTOP") {
            if (desktopAgentRef.current) {
              await desktopAgentRef.current.start(task.value);
              return true;
            }
            throw new Error("Desktop automation is unavailable");
          }

          return true;
        };

        try {
          return await tryOnce();
        } catch (error) {
          if (attempt < 1) {
            logAction(`Retrying task: ${task.type}`);
            return runTaskWithRetry(task, attempt + 1);
          }
          console.error("[Automation] Task failed", error);
          setLiveTranscript(`Task failed: ${error.message || "Unknown error"}`);
          return false;
        }
      };

      const checkForNewTasks = async () => {
        const allTasks = extractActionPlan(fullResponse);
        for (let i = 0; i < allTasks.length; i++) {
          const task = allTasks[i];
          if (!executedTaskIndexes.has(task.index)) {
            executedTaskIndexes.add(task.index);
            updateAssistantState("automating");
            await runTaskWithRetry(task);
            updateAssistantState("idle");
          }
        }
      };

      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "", id: assistantMessageId },
      ]);

      const processLLMStream = async (retryCount = 0) => {
        return new Promise((resolve, reject) => {
          const cleanup = window.electronAPI.aiChatStream(aiMessages, aiModel, {
            onChunk: async (chunk) => {
              fullResponse += chunk;
              
              setMessages((prev) =>
                prev.map((msg) =>
                  msg.id === assistantMessageId ? { ...msg, content: fullResponse } : msg
                )
              );
              
              await checkForNewTasks();
            },
            onDone: async () => {
              await checkForNewTasks();
              
              const cleanText = fullResponse.replace(/<[^>]+>.*?<\/[^>]+>/gs, '').trim();
              if (cleanText) {
                speak(cleanText);
                setLiveTranscript(cleanText);
              } else if (executedTaskIndexes.size === 0) {
                 updateAssistantState("idle");
              }
              resolve(true);
            },
            onError: (error) => {
              reject(error);
            },
          });
        });
      };
      
      try {
        await processLLMStream();
      } catch (err) {
        console.error("[AI] Stream error:", err);
        // Retry logic
        logAction("Retrying LLM request...");
        try {
          await processLLMStream();
        } catch (retryErr) {
          speak("Sorry, I encountered an error processing your request, Sir.");
          setLiveTranscript("Error occurred. Please try again.");
          updateAssistantState("idle");
        }
      }

    } catch (error) {
      console.error("[AI] Process error:", error);
      speak("Sorry, I encountered an error, Sir.");
      setLiveTranscript("Error occurred. Please try again.");
      updateAssistantState("idle");
    }
  };
  processMessageRef.current = processMessage;

  const toggleListening = () => {
    if (assistantState === "listening") {
      autoListenEnabledRef.current = false;
      updateAssistantState("idle");
      setLiveTranscript("");
    } else if (assistantState === "automating") {
      autoListenEnabledRef.current = false;
      if (desktopAgentRef.current) desktopAgentRef.current.stop();
      updateAssistantState("idle");
    } else {
      autoListenEnabledRef.current = true;
      updateAssistantState("listening");
      setLiveTranscript("Listening for your command...");
    }
  };

  let statusText = "Awaiting your command...";

  if (assistantState === "listening") {
    statusText = isListening
      ? "Listening via Deepgram STT..."
      : liveTranscript
      ? `"${liveTranscript}"`
      : "Listening for your command...";
  } else if (assistantState === "thinking") {
    statusText = "Processing...";
  } else if (assistantState === "speaking") {
    statusText = "Speaking...";
  } else if (assistantState === "automating") {
    statusText = liveTranscript ? `"${liveTranscript}"` : "Executing automation...";
  }

  if (assistantState === "speaking" && liveTranscript) {
    statusText = liveTranscript.length > 50 ? liveTranscript.substring(0, 50) + "..." : liveTranscript;
  }

  return (
    <div className="h-screen w-screen flex flex-col items-center justify-center bg-transparent overflow-hidden text-sm select-none drag-region relative font-sans">
      {/* Confirmation Dialog */}
      <ConfirmDialog
        isOpen={confirmDialog.isOpen}
        title={confirmDialog.title}
        message={confirmDialog.message}
        onConfirm={confirmDialog.onConfirm}
        onCancel={() => setConfirmDialog({ isOpen: false, title: "", message: "", onConfirm: null })}
      />

      {/* Voice status indicator */}
      <div className="absolute top-4 right-4 no-drag-region flex items-center space-x-2 bg-white/5 border border-white/10 rounded-full px-3 py-1 text-xs text-white/60 hover:text-white hover:bg-white/10 cursor-pointer transition-all duration-300"
           onClick={() => {
             setSpeechError(false);
             try {
               recognitionRef.current?.start();
             } catch(e) {}
           }}>
        <div className={`w-2 h-2 rounded-full ${speechError ? "bg-amber-500 animate-pulse" : "bg-green-400 animate-pulse"}`}></div>
        <span>Voice Command Mode: {speechError ? "Offline" : "Listening"}</span>
      </div>

      <Orb assistantState={assistantState} onClick={toggleListening} />

      <div className="text-center px-6 min-h-[60px] no-drag-region">
        <h2 className="text-white text-lg font-medium tracking-wide whitespace-pre-line leading-relaxed text-glow">
          {statusText}
        </h2>
      </div>

      <div className="w-[92%] max-w-md mt-3 rounded-2xl border border-white/10 bg-black/35 backdrop-blur-md px-4 py-3 text-left no-drag-region">
        <div className="text-[10px] uppercase tracking-[0.3em] text-white/40 mb-1">Live transcription</div>
        <div className="text-sm text-white/90 whitespace-pre-wrap break-words min-h-[2.2rem]">
          {transcriptionDebug}
        </div>
      </div>

      {/* Keyboard Input Field */}
      {showKeyboard && (
        <form 
          onSubmit={(e) => {
            e.preventDefault();
            if (typedCommand.trim()) {
              processMessage(typedCommand.trim());
              setTypedCommand("");
              setShowKeyboard(false);
            }
          }}
          className="absolute bottom-24 w-80 no-drag-region flex items-center bg-white/5 border border-white/10 backdrop-blur-md rounded-full px-4 py-2 shadow-lg transition-all duration-300"
        >
          <input 
            type="text"
            value={typedCommand}
            onChange={(e) => setTypedCommand(e.target.value)}
            placeholder="Type your command..."
            className="flex-1 bg-transparent border-none outline-none text-white placeholder-white/40 text-sm py-1 pr-2"
            autoFocus
          />
          <button 
            type="submit" 
            className="text-purple-400 hover:text-purple-300 text-xs font-semibold px-2 py-1 hover:bg-white/5 rounded-full transition-colors"
          >
            Send
          </button>
        </form>
      )}

      {/* Action Log */}
      {actionLog.length > 0 && (
        <div className="absolute bottom-24 left-4 w-64 max-h-40 overflow-y-auto no-drag-region bg-black/40 border border-white/10 backdrop-blur-md rounded-lg p-2 text-xs">
          <div className="text-white/60 font-semibold mb-1 sticky top-0 bg-black/40 pb-1">Recent Actions</div>
          {actionLog.map((log, index) => (
            <div key={index} className="text-white/80 mb-1">
              <span className="text-white/40">[{log.timestamp}]</span> {log.action}
            </div>
          ))}
        </div>
      )}

      <ControlPill 
        assistantState={assistantState} 
        toggleListening={toggleListening} 
        stopAutomation={() => {
          if (desktopAgentRef.current) desktopAgentRef.current.stop();
          updateAssistantState("idle");
        }}
        toggleKeyboard={() => setShowKeyboard(!showKeyboard)}
        showKeyboard={showKeyboard}
      />
    </div>
  );
}
