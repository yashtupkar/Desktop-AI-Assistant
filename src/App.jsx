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
- If you don't know something, say "I don't have that information, Sir" — don't make things up
- For greetings, respond warmly but briefly

EXAMPLES:
User: "What time is it?"
You: "I don't have direct clock access, Sir, but your system clock should have that covered."

User: "How are you?"  
You: "Running at full capacity, Sir. How can I assist you today?"

User: "Tell me about black holes"
You: "Black holes are regions where gravity is so intense that nothing — not even light — can escape. They form when massive stars collapse. Quite fascinating, Sir — shall I go deeper?"`;

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

  const transcriberRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const messagesEndRef = useRef(null);

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

    if (lowerText.includes("youtube")) {
      const hasSearchTerm = !lowerText.match(/^(open|start|launch) youtube$/);
      let query = "";

      if (hasSearchTerm) {
        query = lowerText
          .replace("play", "")
          .replace("on youtube", "")
          .replace("in youtube", "")
          .replace("youtube", "")
          .replace("search for", "")
          .replace("search", "")
          .trim();
      }

      if (window.electronAPI?.openUrl) {
        if (query) {
          await window.electronAPI.openUrl(
            `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`,
          );
        } else {
          await window.electronAPI.openUrl("https://www.youtube.com");
        }
      }
      return { type: "youtube", query: query };
    } else if (lowerText.includes("search") || lowerText.includes("google")) {
      const hasSearchTerm = !lowerText.match(
        /^(open|start|launch) (google|chrome)$/,
      );
      let query = "";

      if (hasSearchTerm) {
        query = lowerText
          .replace("search for", "")
          .replace("search", "")
          .replace("on google", "")
          .replace("google", "")
          .trim();
      }

      if (window.electronAPI?.openUrl) {
        if (query) {
          await window.electronAPI.openUrl(
            `https://www.google.com/search?q=${encodeURIComponent(query)}`,
          );
        } else {
          await window.electronAPI.openUrl("https://www.google.com");
        }
      }
      return { type: "search", query: query };
    } else if (lowerText.includes("open ")) {
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

  const processMessage = async (userText) => {
    setIsProcessing(true);

    setMessages((prev) => [...prev, { role: "user", content: userText }]);

    const cmdResult = await executeCommand(userText);

    if (cmdResult) {
      let responseText = "";
      if (cmdResult.type === "youtube") {
        responseText = cmdResult.query
          ? `Searching for "${cmdResult.query}" on YouTube`
          : "Opening YouTube";
      } else if (cmdResult.type === "search") {
        responseText = cmdResult.query
          ? `Searching for "${cmdResult.query}"`
          : "Opening Google";
      } else if (cmdResult.type === "app") {
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
    } else {
      if (ollamaStatus.online) {
        try {
          const ollamaMessages = [
            { role: "system", content: SYSTEM_PROMPT },
            ...messages,
            { role: "user", content: userText },
          ];

          const response = await window.electronAPI.ollamaChat(
            ollamaMessages,
            ollamaModel,
          );

          if (response.success) {
            setMessages((prev) => [
              ...prev,
              { role: "assistant", content: response.message },
            ]);
            speak(response.message);
          } else {
            const fallbackMsg = "Sorry, I encountered an error.";
            setMessages((prev) => [
              ...prev,
              { role: "assistant", content: fallbackMsg },
            ]);
            speak(fallbackMsg);
          }
        } catch (error) {
          console.error("Ollama error:", error);
          const fallbackMsg = "Sorry, I encountered an error.";
          setMessages((prev) => [
            ...prev,
            { role: "assistant", content: fallbackMsg },
          ]);
          speak(fallbackMsg);
        }
      } else {
        const fallbackMsg =
          "Ollama is not running. Please start Ollama to use AI features.";
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: fallbackMsg },
        ]);
        speak(fallbackMsg);
      }
    }

    setIsProcessing(false);
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
