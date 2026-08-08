import React, { useState, useEffect, useRef } from "react";
import { Orb } from "./components/Orb";
import { ControlPill } from "./components/ControlPill";
import { ConfirmDialog } from "./components/ConfirmDialog";
import { DesktopAgent } from "./automation/DesktopAgent";
import { useVoiceRecognition } from "./hooks/useVoiceRecognition";
import { useTTS } from "./hooks/useTTS";
import { useSpeechTranscription } from "./hooks/useSpeechTranscription";

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
  const assistantStateRef = useRef("idle");
  const processMessageRef = useRef(null);
  
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const streamRef = useRef(null);

  // Desktop Agent Hook
  const desktopAgentRef = useRef(null);
  const [wakeWordActive, setWakeWordActive] = useState(false); // Disabled by default due to speech recognition issues
  const [showKeyboard, setShowKeyboard] = useState(true); // Show keyboard by default for testing
  const [typedCommand, setTypedCommand] = useState("");
  const [confirmDialog, setConfirmDialog] = useState({
    isOpen: false,
    title: "",
    message: "",
    onConfirm: null,
  });
  const [actionLog, setActionLog] = useState([]);
  const wakeWordActiveRef = useRef(true);

  // Wake word result handler
  const handleWakeWordResult = (event) => {
    const currentStatus = assistantStateRef.current;
    
    const resultIndex = event.resultIndex;
    const latestResult = event.results[resultIndex];
    if (!latestResult) return;

    const transcript = latestResult[0].transcript.trim().toLowerCase();
    const isFinal = latestResult.isFinal;

    console.log(`[WakeWord] Hearing (${isFinal ? "final" : "interim"}): "${transcript}"`);

    // 1. WAKE WORD MODE: Assistant is idle and wakeWordActive is enabled
    if (currentStatus === "idle" && wakeWordActiveRef.current) {
      if (transcript.includes("nova")) {
        const novaIndex = transcript.indexOf("nova");
        const afterNova = latestResult[0].transcript.slice(novaIndex + 4).trim();

        if (afterNova.length > 3 && isFinal) {
          console.log(`[WakeWord] Direct command captured: "${afterNova}"`);
          if (processMessageRef.current) processMessageRef.current(afterNova);
        } else if (!isFinal && afterNova.length > 3) {
          setLiveTranscript(`"Nova, ${afterNova}"`);
        } else if (isFinal && afterNova.length <= 3) {
          updateAssistantState("thinking");
          speak("Yes, Sir?");
          
          setTimeout(() => {
            updateAssistantState("listening");
            setLiveTranscript("I'm listening, Sir...");
          }, 1000);
        }
      }
    } 
    // 2. ACTIVE COMMAND CAPTURING: Assistant is already in 'listening' state
    else if (currentStatus === "listening") {
      if (isFinal) {
        if (transcript.length > 0) {
          let finalCommand = transcript;
          if (finalCommand.startsWith("nova ")) {
            finalCommand = finalCommand.substring(5).trim();
          }
          if (finalCommand.startsWith("nova, ")) {
            finalCommand = finalCommand.substring(6).trim();
          }
          
          if (finalCommand.length > 0) {
            setLiveTranscript(latestResult[0].transcript);
            if (processMessageRef.current) processMessageRef.current(finalCommand);
          } else {
            updateAssistantState("idle");
            setLiveTranscript("");
          }
        } else {
          updateAssistantState("idle");
          setLiveTranscript("");
        }
      } else {
        setLiveTranscript(latestResult[0].transcript);
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
  const { recognitionRef, speechError, setSpeechError } = useVoiceRecognition(
    wakeWordActive,
    handleWakeWordResult
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
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } 
      });
      streamRef.current = stream;
      
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) audioChunksRef.current.push(event.data);
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        const text = await transcribeAudio(audioBlob);
        if (text && text.length > 0) {
          if (processMessageRef.current) processMessageRef.current(text);
        } else {
          updateAssistantState('idle');
        }
      };

      mediaRecorder.start();
      updateAssistantState('listening');
      setLiveTranscript("Listening...");
    } catch (err) {
      setLiveTranscript("Error: " + err.message);
    }
  };

  const stopListening = async () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
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
      let assistantMessageId = Date.now();

      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "", id: assistantMessageId },
      ]);

      window.electronAPI.aiChatStream(aiMessages, aiModel, {
        onChunk: (chunk) => {
          fullResponse += chunk;
        },
        onDone: async () => {
          // Extract all tasks and sort them by their appearance order in the response
          const extractAll = (regex, type) => {
            return Array.from(fullResponse.matchAll(regex)).map(m => ({
              type,
              value: m[1].trim(),
              index: m.index
            }));
          };

          const allTasks = [
            ...extractAll(/<OPEN_URL>(.*?)<\/OPEN_URL>/gs, "OPEN_URL"),
            ...extractAll(/<OPEN_APP>(.*?)<\/OPEN_APP>/gs, "OPEN_APP"),
            ...extractAll(/<SYSTEM_COMMAND>(.*?)<\/SYSTEM_COMMAND>/gs, "SYSTEM_COMMAND"),
            ...extractAll(/<DESKTOP_TASK>(.*?)<\/DESKTOP_TASK>/gs, "DESKTOP"),
            ...extractAll(/<PYTHON_BROWSER_TASK>(.*?)<\/PYTHON_BROWSER_TASK>/gs, "PYTHON_BROWSER"),
            ...extractAll(/<BROWSER_TASK>(.*?)<\/BROWSER_TASK>/gs, "BROWSER")
          ].sort((a, b) => a.index - b.index);

          if (allTasks.length > 0) {
            updateAssistantState("automating");
            
            for (const task of allTasks) {
              if (task.type === "OPEN_URL") {
                try {
                  await window.electronAPI.openUrl(task.value);
                  setLiveTranscript(`Opened ${task.value}`);
                  // Wait 3 seconds for the browser to open and load before the next step
                  await new Promise(r => setTimeout(r, 3000));
                } catch (err) {
                  setLiveTranscript("Error opening URL.");
                }
              } else if (task.type === "OPEN_APP") {
                try {
                  const res = await window.electronAPI.openApp(task.value);
                  if (res.success) {
                    setLiveTranscript(`Opened ${task.value}`);
                    await new Promise(r => setTimeout(r, 2000)); // Wait for app to open
                  } else {
                    speak(`Sorry, I couldn't open ${task.value}. ${res.message}`);
                  }
                } catch (err) {
                  setLiveTranscript("Error opening app.");
                }
              } else if (task.type === "SYSTEM_COMMAND") {
                try {
                  const res = await window.electronAPI.systemCommand(task.value);
                  if (res.success) {
                    setLiveTranscript(`System command: ${task.value}`);
                  } else {
                    speak(`Sorry, I couldn't execute that system command.`);
                  }
                } catch (err) {
                  setLiveTranscript("Error executing system command.");
                }
              } else if (task.type === "PYTHON_BROWSER") {
                await runPythonBrowserAgent(task.value);
              } else if (task.type === "DESKTOP") {
                if (desktopAgentRef.current) {
                  await desktopAgentRef.current.start(task.value);
                }
              }
            }
            updateAssistantState("idle");
          } else if (fullResponse.trim()) {
            speak(fullResponse);
            setLiveTranscript(fullResponse);
          } else {
            updateAssistantState("idle");
          }

          // Save the assistant's response to the message history so it remembers its past actions
          setMessages((prev) =>
            prev.map((msg) =>
              msg.id === assistantMessageId ? { ...msg, content: fullResponse } : msg
            )
          );
        },
        onError: (error) => {
          console.error("[AI] Stream error:", error);
          speak("Sorry, I encountered an error processing your request, Sir.");
          setLiveTranscript("Error occurred. Please try again.");
          updateAssistantState("idle");
        },
      });
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
      updateAssistantState("idle");
      setLiveTranscript("");
      stopListening();
    } else if (assistantState === "automating") {
       if (desktopAgentRef.current) desktopAgentRef.current.stop();
       updateAssistantState("idle");
    } else {
       const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
       if (SpeechRecognition && !speechError) {
         updateAssistantState("listening");
         setLiveTranscript("I'm listening, Sir...");
         try {
           recognitionRef.current?.start();
         } catch (e) {}
       } else {
         startListening();
       }
    }
  };

  let statusText = transcriberLoaded ? "Awaiting your command..." : "Loading model...";

  if (assistantState === "listening") {
    statusText = liveTranscript
      ? `"${liveTranscript}"`
      : "I'm listening, Sir...\nClick again when done";
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

      {/* Wake Word Status Indicator */}
      <div className="absolute top-4 right-4 no-drag-region flex items-center space-x-2 bg-white/5 border border-white/10 rounded-full px-3 py-1 text-xs text-white/60 hover:text-white hover:bg-white/10 cursor-pointer transition-all duration-300"
           onClick={() => {
             const newVal = !wakeWordActive;
             setWakeWordActive(newVal);
             wakeWordActiveRef.current = newVal;
             setSpeechError(false);
             if (newVal) {
               try {
                 recognitionRef.current?.start();
               } catch(e) {}
             } else {
               recognitionRef.current?.stop();
             }
           }}>
        <div className={`w-2 h-2 rounded-full ${speechError ? "bg-amber-500 animate-pulse" : (wakeWordActive ? "bg-green-400 animate-pulse" : "bg-red-400")}`}></div>
        <span>Wake Word "Nova": {speechError ? "Offline" : (wakeWordActive ? "Active" : "OFF")}</span>
      </div>

      <Orb assistantState={assistantState} onClick={toggleListening} />

      <div className="text-center px-6 min-h-[60px] no-drag-region">
        <h2 className="text-white text-lg font-medium tracking-wide whitespace-pre-line leading-relaxed text-glow">
          {statusText}
        </h2>
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
