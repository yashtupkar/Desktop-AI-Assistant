import React, { useState, useEffect, useRef } from "react";
import { motion } from "framer-motion";
import {
  Mic,
  Terminal,
  Minimize2,
  X,
  Activity,
  HardDrive,
  Settings,
  FolderOpen,
  Box,
  Loader2,
  MessageSquare,
  Send,
} from "lucide-react";
import { pipeline, env } from "@xenova/transformers";

env.allowLocalModels = false;

const SYSTEM_PROMPT = `You are Nova, an advanced AI assistant for Yash Tupkar. 

PERSONALITY:
- Speak like the JARVIS from Iron Man — calm, intelligent, slightly witty
- Always address the user as "Sir" occasionally
- Be concise — never give long paragraphs unless asked
- Sound confident and precise, not uncertain

RESPONSE RULES:
- Keep responses under 3 sentences for casual questions
- Never say "I'm just an AI" or "As an AI language model"
- Never use bullet points unless specifically asked for a list
- Speak in a natural, conversational tone
- If you don't know something, say "I don't have that information, Sir"
- If the user asks you to automate a browser task (e.g. "buy a laptop", "search amazon", "open browser and do x"), you MUST respond EXACTLY with:
<BROWSER_TASK>The task they want to accomplish</BROWSER_TASK>
Do NOT include any other text when returning <BROWSER_TASK>.`;

export default function App() {
  const [isMinimized, setIsMinimized] = useState(false);
  const [command, setCommand] = useState("");
  const [systemStats, setSystemStats] = useState({ cpu: 0, ram: 0 });
  const [isListening, setIsListening] = useState(false);
  const [isModelLoading, setIsModelLoading] = useState(false);
  const [ollamaStatus, setOllamaStatus] = useState({
    online: false,
    models: [],
  });
  const [isProcessing, setIsProcessing] = useState(false);
  const [messages, setMessages] = useState([]);
  const [ollamaModel, setOllamaModel] = useState("llama3.2");
const speakQueueRef = useRef([]);
const isSpeakingRef = useRef(false);
const audioContextRef = useRef(null);
  const transcriberRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const messagesEndRef = useRef(null);

  const processSpeakQueue = async () => {
    if (isSpeakingRef.current || speakQueueRef.current.length === 0) return;
    isSpeakingRef.current = true;

    const sentence = speakQueueRef.current.shift();

    await new Promise((resolve) => {
      window.electronAPI.edgeTTSStream(sentence, {
        onChunk: (base64Chunk) => {
          // Decode and queue audio chunk
          const binary = atob(base64Chunk);
          const bytes = new Uint8Array(binary.length);
          for (let i = 0; i < binary.length; i++) {
            bytes[i] = binary.charCodeAt(i);
          }
          // Accumulate chunks
          if (!window._ttsChunks) window._ttsChunks = [];
          window._ttsChunks.push(bytes);
        },
        onDone: () => {
          // All chunks received — concat and play
          const chunks = window._ttsChunks || [];
          window._ttsChunks = [];

          const totalLength = chunks.reduce((acc, c) => acc + c.length, 0);
          const merged = new Uint8Array(totalLength);
          let offset = 0;
          for (const chunk of chunks) {
            merged.set(chunk, offset);
            offset += chunk.length;
          }

          const blob = new Blob([merged], { type: "audio/mp3" });
          const url = URL.createObjectURL(blob);
          const audio = new Audio(url);
          audio.onended = () => {
            URL.revokeObjectURL(url);
            isSpeakingRef.current = false;
            processSpeakQueue(); // play next sentence
          };
          audio.onerror = () => {
            isSpeakingRef.current = false;
            processSpeakQueue();
          };
          audio.play();
          resolve();
        },
        onError: (err) => {
          console.error("TTS stream error:", err);
          isSpeakingRef.current = false;
          processSpeakQueue();
          resolve();
        },
      });
    });
  };

  useEffect(() => {
    const interval = setInterval(async () => {
      if (window.electronAPI) {
        const stats = await window.electronAPI.getSystemStats();
        setSystemStats(stats);
      } else {
        setSystemStats({
          cpu: Math.floor(Math.random() * 40) + 10,
          ram: Math.floor(Math.random() * 30) + 40,
        });
      }
    }, 2000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const checkOllama = async () => {
      if (window.electronAPI && window.electronAPI.checkOllama) {
        const status = await window.electronAPI.checkOllama();
        setOllamaStatus(status);
        if (status.models.length > 0) {
          setOllamaModel(status.models[0].name);
        }
      }
    };
    checkOllama();
    const interval = setInterval(checkOllama, 30000);
    return () => clearInterval(interval);
  }, []);

  const speak = async (text) => {
    console.log("Speak called with text:", text);
    console.log("electronAPI:", window.electronAPI);
    console.log("edgeTTS available:", !!window.electronAPI?.edgeTTS);
    try {
      if (window.electronAPI?.edgeTTS) {
        console.log("Calling edgeTTS...");
        const result = await window.electronAPI.edgeTTS(text);
        console.log("edgeTTS result:", result);
        if (result.success) {
          console.log("Playing audio...");
          const audio = new Audio(`data:audio/mp3;base64,${result.audio}`);
          audio.play();
        }
      }
    } catch (error) {
      console.error("Edge TTS error, falling back to Web Speech API:", error);
      const synth = window.speechSynthesis;
      if (synth) {
        try {
          synth.cancel();
          const utterance = new SpeechSynthesisUtterance(text);
          synth.speak(utterance);
        } catch (e) {
          console.error("Web Speech API error:", e);
        }
      }
    }
  };

  const executeCommand = async (text) => {
    const lowerText = text
      .toLowerCase()
      .replace(/[.,!?]/g, "")
      .trim();

    if (lowerText.includes("open ")) {
      const appName = lowerText.split("open ")[1]?.trim();
      if (appName && window.electronAPI?.openApp) {
        const res = await window.electronAPI.openApp(appName);
        if (res.success) {
          return { type: "app", app: appName, success: true };
        }
      }
      return { type: "app", app: appName, success: false };
    }
    return null;
  };

  const runBrowserAgent = async (taskDescription) => {
    setMessages((prev) => [...prev, { role: "assistant", content: "Starting browser automation protocol..." }]);
    speak("Starting browser automation protocol.");
    
    await window.electronAPI.browserStart();
    
    let loopCount = 0;
    let isDone = false;
    let currentTask = taskDescription;
    
    while (loopCount < 10 && !isDone) {
       loopCount++;
       const domRes = await window.electronAPI.browserGetDom();
       if (!domRes.success) {
          setMessages((prev) => [...prev, { role: "assistant", content: "Failed to read browser DOM." }]);
          break;
       }
       
       const prompt = `You are a browser automation agent.
Task: ${currentTask}
Current URL: ${domRes.dom.url}
Page Title: ${domRes.dom.title}
Interactive Elements:
${domRes.dom.elements.map(e => `[${e.id}] ${e.tag} ${e.type ? `(${e.type})` : ''} - ${e.label}`).join('\n')}

Decide the next action to take. Reply strictly with ONE JSON object. No markdown, no extra text.
Actions:
{"action": "goto", "url": "https://..."}
{"action": "click", "id": <element_id>}
{"action": "type", "id": <element_id>, "text": "..."}
{"action": "keyboard", "key": "Enter"}
{"action": "done", "message": "Result of the task"}
`;
       
       setMessages((prev) => [...prev, { role: "assistant", content: `Analyzing page (${loopCount}/10)...` }]);
       
       const res = await window.electronAPI.ollamaChat([{role: "user", content: prompt}], ollamaModel);
       if (!res.success) {
           setMessages((prev) => [...prev, { role: "assistant", content: "Agent encountered an error with LLM." }]);
           break;
       }
       
       let response = res.message;
       
       try {
         const jsonMatch = response.match(/\{[\s\S]*\}/);
         if (!jsonMatch) throw new Error("No JSON found");
         const action = JSON.parse(jsonMatch[0]);
         
         if (action.action === "goto") {
            setMessages((prev) => [...prev, { role: "assistant", content: `Navigating to ${action.url}` }]);
            await window.electronAPI.browserGoto(action.url);
         } else if (action.action === "click") {
            setMessages((prev) => [...prev, { role: "assistant", content: `Clicking element [${action.id}]` }]);
            await window.electronAPI.browserClick(action.id);
         } else if (action.action === "type") {
            setMessages((prev) => [...prev, { role: "assistant", content: `Typing into element [${action.id}]` }]);
            await window.electronAPI.browserType(action.id, action.text);
         } else if (action.action === "keyboard") {
            setMessages((prev) => [...prev, { role: "assistant", content: `Pressing key: ${action.key}` }]);
            await window.electronAPI.browserKeyboard(action.key);
         } else if (action.action === "done") {
            setMessages((prev) => [...prev, { role: "assistant", content: "Task complete: " + action.message }]);
            speak("Task complete: " + action.message);
            isDone = true;
         }
       } catch(e) {
         console.error("Action parsing error:", e, "Response:", response);
         setMessages((prev) => [...prev, { role: "assistant", content: `Failed to parse action. Trying again.` }]);
         currentTask += " (Last action failed, try something else)";
       }
    }
    
    if (!isDone) {
      setMessages((prev) => [...prev, { role: "assistant", content: "Automation stopped (max loops reached or error)." }]);
      speak("Automation stopped due to timeout or error.");
    }
    await window.electronAPI.browserClose();
  };

  const processMessage = async (userText) => {
    setIsProcessing(true);

    setMessages((prev) => [...prev, { role: "user", content: userText }]);

    const cmdResult = await executeCommand(userText);

    if (cmdResult) {
      let responseText = "";
      if (cmdResult.type === "app") {
        if (cmdResult.success) {
          responseText = `Opening ${cmdResult.app}`;
        } else {
          responseText = `Cannot open ${cmdResult.app}`;
        }
      }

      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: responseText },
      ]);
      speak(responseText);
      setIsProcessing(false);
    } else {
      if (ollamaStatus.online) {
        try {
          const ollamaMessages = [
            { role: "system", content: SYSTEM_PROMPT },
            ...messages,
            { role: "user", content: userText },
          ];

          let fullResponse = "";
          let assistantMessageId = Date.now();

          setMessages((prev) => [
            ...prev,
            { role: "assistant", content: "", id: assistantMessageId },
          ]);

          window.electronAPI.ollamaChatStream(ollamaMessages, ollamaModel, {
            onChunk: (chunk) => {
              fullResponse += chunk;
              setMessages((prev) =>
                prev.map((msg) =>
                  msg.id === assistantMessageId
                    ? { ...msg, content: fullResponse }
                    : msg,
                ),
              );
            },
            onDone: async () => {
              setIsProcessing(false);
              const match = fullResponse.match(/<BROWSER_TASK>(.*?)<\/BROWSER_TASK>/s);
              if (match) {
                const task = match[1].trim();
                setMessages((prev) =>
                  prev.map((msg) =>
                    msg.id === assistantMessageId
                      ? { ...msg, content: `Understood, Sir. Initializing browser for task: ${task}` }
                      : msg,
                  ),
                );
                await runBrowserAgent(task);
              } else if (fullResponse.trim()) {
                speak(fullResponse);
              }
            },
            onError: (error) => {
              console.error("Ollama stream error:", error);
              const fallbackMsg = "Sorry, I encountered an error.";
              setMessages((prev) => [
                ...prev,
                { role: "assistant", content: fallbackMsg },
              ]);
              speak(fallbackMsg);
              setIsProcessing(false);
            },
          });
        } catch (error) {
          console.error("Ollama error:", error);
          const fallbackMsg = "Sorry, I encountered an error.";
          setMessages((prev) => [
            ...prev,
            { role: "assistant", content: fallbackMsg },
          ]);
          speak(fallbackMsg);
          setIsProcessing(false);
        }
      } else {
        const fallbackMsg =
          "Ollama is not running. Please start Ollama to use AI features.";
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: fallbackMsg },
        ]);
        speak(fallbackMsg);
        setIsProcessing(false);
      }
    }
  };

  const handleCommandSubmit = async (e) => {
    if (e.key === "Enter" && command.trim() && !isProcessing) {
      const text = command.trim();
      setCommand("");
      await processMessage(text);
    }
  };

  const toggleListening = async () => {
    if (isListening) {
      if (
        mediaRecorderRef.current &&
        mediaRecorderRef.current.state === "recording"
      ) {
        mediaRecorderRef.current.stop();
        setIsListening(false);
      }
      return;
    }

    try {
      if (!transcriberRef.current) {
        setIsModelLoading(true);
        speak("Initializing neural network");
        try {
          transcriberRef.current = await pipeline(
            "automatic-speech-recognition",
            "Xenova/whisper-tiny.en",
          );
        } catch (modelErr) {
          console.error("Error loading model:", modelErr);
          speak("Error loading speech model. You can still type commands.");
          setIsModelLoading(false);
          return;
        }
        setIsModelLoading(false);
      }

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) audioChunksRef.current.push(event.data);
      };

      mediaRecorder.onstop = async () => {
        stream.getTracks().forEach((track) => track.stop());

        try {
          const audioBlob = new Blob(audioChunksRef.current, {
            type: "audio/webm",
          });
          const arrayBuffer = await audioBlob.arrayBuffer();

          const audioContext = new (
            window.AudioContext || window.webkitAudioContext
          )({ sampleRate: 16000 });
          const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
          const audioData = audioBuffer.getChannelData(0);

          const result = await transcriberRef.current(audioData);
          const transcript = result.text.trim();
          if (transcript) {
            setCommand(transcript);
            await processMessage(transcript);
          }
        } catch (e) {
          console.error("Transcription error:", e);
        }
      };

      mediaRecorder.start();
      setIsListening(true);
    } catch (err) {
      console.error("Error accessing microphone or loading model:", err);
      speak("Error accessing microphone. You can still type commands.");
      setIsModelLoading(false);
      setIsListening(false);
    }
  };

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  if (isMinimized) {
    return (
      <div className="h-screen w-screen flex items-end justify-end p-4 pb-10 pr-10 bg-transparent">
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          className="w-24 h-24 rounded-full relative cursor-pointer drag-region"
          onClick={() => setIsMinimized(false)}
        >
          <div className="absolute inset-0 bg-jarvis-blue/20 rounded-full blur-xl animate-pulse"></div>
          <div className="absolute inset-2 bg-jarvis-dark rounded-full border-2 border-jarvis-blue/50 shadow-[0_0_20px_#00f0ff] flex items-center justify-center overflow-hidden">
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ repeat: Infinity, duration: 8, ease: "linear" }}
              className="w-full h-full rounded-full border-t-2 border-l-2 border-jarvis-blue absolute opacity-50"
            />
            <Mic className="text-jarvis-blue w-8 h-8 z-10 text-glow" />
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="h-screen w-screen p-4 flex flex-col bg-transparent overflow-hidden text-sm select-none">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="flex-1 glass-panel rounded-2xl flex flex-col overflow-hidden relative"
      >
        <div className="absolute inset-0 pointer-events-none overflow-hidden opacity-20">
          <div className="w-full h-1 bg-jarvis-blue shadow-[0_0_10px_#00f0ff] animate-scan" />
        </div>

        <div className="h-12 border-b border-jarvis-blue/20 flex items-center justify-between px-4 drag-region bg-jarvis-blue/5">
          <div className="flex items-center space-x-2 text-jarvis-blue font-bold tracking-widest uppercase">
            <Activity className="w-4 h-4" />
            <span className="text-glow">J.A.R.V.I.S. Core</span>
          </div>
          <div className="flex items-center space-x-3 no-drag-region text-jarvis-blue/70">
            <Minimize2
              className="w-4 h-4 cursor-pointer hover:text-jarvis-blue transition-colors"
              onClick={() => setIsMinimized(true)}
            />
            <X
              className="w-5 h-5 cursor-pointer hover:text-red-500 transition-colors"
              onClick={() => window.electronAPI?.controlWindow("close")}
            />
          </div>
        </div>

        <div className="flex-1 flex overflow-hidden">
          <div className="w-16 border-r border-jarvis-blue/20 flex flex-col items-center py-6 space-y-8 bg-jarvis-blue/5">
            {[
              Terminal,
              MessageSquare,
              Box,
              FolderOpen,
              HardDrive,
              Settings,
            ].map((Icon, i) => (
              <div
                key={i}
                className="p-3 rounded-xl hover:bg-jarvis-blue/20 hover:text-jarvis-blue cursor-pointer transition-all duration-300 group relative"
              >
                <Icon className="w-5 h-5 text-jarvis-blue/70 group-hover:text-jarvis-blue" />
              </div>
            ))}
          </div>

          <div className="flex-1 flex flex-col p-6 relative">
            <div className="flex justify-between items-start">
              <div className="space-y-1">
                <div className="text-xs text-jarvis-blue/50 uppercase tracking-wider">
                  System Status
                </div>
                <div className="flex items-center space-x-4">
                  <div className="glass-panel px-3 py-1.5 rounded-lg flex items-center space-x-2">
                    <span className="text-jarvis-blue/70 text-xs">CPU</span>
                    <span className="text-jarvis-blue font-mono text-glow">
                      {systemStats.cpu}%
                    </span>
                  </div>
                  <div className="glass-panel px-3 py-1.5 rounded-lg flex items-center space-x-2">
                    <span className="text-jarvis-blue/70 text-xs">MEM</span>
                    <span className="text-jarvis-blue font-mono text-glow">
                      {systemStats.ram}%
                    </span>
                  </div>
                </div>
              </div>

              <div className="text-right space-y-1">
                <div className="text-xs text-jarvis-blue/50 uppercase tracking-wider">
                  Local Time
                </div>
                <div className="text-2xl font-mono text-jarvis-blue text-glow">
                  {new Date().toLocaleTimeString()}
                </div>
              </div>
            </div>

            <div className="flex-1 flex flex-col mt-6 overflow-hidden">
              <div className="flex-1 overflow-y-auto space-y-4 pr-2">
                {messages.length === 0 && (
                  <div className="flex items-center justify-center h-full text-jarvis-blue/40">
                    <div className="text-center">
                      <MessageSquare className="w-12 h-12 mx-auto mb-2 opacity-50" />
                      <p>Start a conversation with Jarvis</p>
                      <p className="text-xs mt-1">
                        Type a message or click the mic to speak
                      </p>
                    </div>
                  </div>
                )}
                {messages.map((msg, i) => (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, x: msg.role === "user" ? 20 : -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                  >
                    <div
                      className={`max-w-[80%] glass-panel p-3 rounded-xl ${msg.role === "user" ? "bg-jarvis-blue/20" : ""}`}
                    >
                      <p className="text-jarvis-blue font-mono">
                        {msg.content}
                      </p>
                    </div>
                  </motion.div>
                ))}
                {isProcessing && (
                  <div className="flex justify-start">
                    <div className="glass-panel p-3 rounded-xl">
                      <Loader2 className="w-5 h-5 text-jarvis-blue animate-spin" />
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>
            </div>

            <div className="mt-4">
              <div className="glass-panel p-2 rounded-xl flex items-center space-x-3 relative overflow-hidden">
                <button
                  className={`p-3 rounded-lg transition-colors ${isListening ? "bg-jarvis-blue/30 text-white" : "bg-jarvis-blue/10 hover:bg-jarvis-blue/20 text-jarvis-blue"}`}
                  onClick={toggleListening}
                  disabled={isModelLoading || isProcessing}
                >
                  {isModelLoading ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <Mic className="w-5 h-5" />
                  )}
                </button>
                <div className="flex-1 border-l border-jarvis-blue/20 pl-3">
                  <input
                    type="text"
                    value={command}
                    onChange={(e) => setCommand(e.target.value)}
                    onKeyDown={handleCommandSubmit}
                    placeholder="Ask Jarvis anything..."
                    className="w-full bg-transparent border-none outline-none text-jarvis-blue placeholder-jarvis-blue/40 font-mono"
                    disabled={isProcessing}
                  />
                </div>
                <button
                  className="p-3 rounded-lg bg-jarvis-blue/10 hover:bg-jarvis-blue/20 text-jarvis-blue transition-colors disabled:opacity-50"
                  onClick={() => {
                    if (command.trim() && !isProcessing) {
                      const text = command.trim();
                      setCommand("");
                      processMessage(text);
                    }
                  }}
                  disabled={!command.trim() || isProcessing}
                >
                  <Send className="w-5 h-5" />
                </button>
              </div>
            </div>
          </div>

          <div className="w-64 border-l border-jarvis-blue/20 p-4 bg-jarvis-blue/5">
            <h3 className="text-xs text-jarvis-blue/50 uppercase tracking-wider mb-4">
              Quick Commands
            </h3>
            <div className="space-y-2">
              {[
                { label: "Open Calculator", cmd: "open calculator" },
                { label: "Open Notepad", cmd: "open notepad" },
                { label: "Open File Explorer", cmd: "open explorer" },
                { label: "System Settings", cmd: "open settings" },
                { label: "Open Chrome", cmd: "open chrome" },
              ].map((item, i) => (
                <div
                  key={i}
                  onClick={() => {
                    if (!isProcessing) processMessage(item.cmd);
                  }}
                  className="glass-panel p-3 rounded-lg cursor-pointer hover:border-jarvis-blue/50 hover:bg-jarvis-blue/10 transition-all flex items-center justify-between group"
                >
                  <span className="text-sm text-jarvis-blue/80 group-hover:text-jarvis-blue">
                    {item.label}
                  </span>
                  <Activity className="w-3 h-3 text-jarvis-blue/30 group-hover:text-jarvis-blue" />
                </div>
              ))}
            </div>

            <div className="mt-8">
              <h3 className="text-xs text-jarvis-blue/50 uppercase tracking-wider mb-4">
                AI Subsystem
              </h3>
              <div className="glass-panel p-4 rounded-lg text-xs text-jarvis-blue/60 leading-relaxed font-mono">
                Status:{" "}
                {ollamaStatus.online ? (
                  <span className="text-green-400">ONLINE</span>
                ) : (
                  <span className="text-red-400">OFFLINE</span>
                )}
                <br />
                Model: {ollamaModel}
                <br />
                Models:{" "}
                {ollamaStatus.models.map((m) => m.name).join(", ") || "None"}
              </div>
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
