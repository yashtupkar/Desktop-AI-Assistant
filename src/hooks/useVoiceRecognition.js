import { useState, useEffect, useRef } from "react";

export function useVoiceRecognition(wakeWordActive, onResult, onError) {
  const recognitionRef = useRef(null);
  const [speechError, setSpeechError] = useState(false);
  const restartTimeoutRef = useRef(null);

  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      console.warn("Speech Recognition API not supported in this browser/environment.");
      setSpeechError(true);
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      console.log("[WakeWord] Background speech recognition started");
      setSpeechError(false);
    };

    recognition.onresult = (event) => {
      console.log("[WakeWord] Speech recognition result received");
      if (onResult) onResult(event);
    };

    recognition.onerror = (event) => {
      console.error("[WakeWord] Speech recognition error:", event.error);
      if (event.error === "network") {
        console.warn("[WakeWord] Network speech recognition failed. Disabling background continuous ASR loop.");
        setSpeechError(true);
        try {
          recognition.stop();
        } catch (e) {}
      } else if (event.error === "not-allowed") {
        console.warn("[WakeWord] Microphone permission denied");
        setSpeechError(true);
      } else if (event.error === "no-speech") {
        console.warn("[WakeWord] No speech detected - this is normal in silent environments");
      } else {
        console.warn("[WakeWord] Speech recognition error:", event.error);
      }
    };

    recognition.onend = () => {
      console.log("[WakeWord] Speech recognition ended. Wake word active:", wakeWordActive);
      
      // Add a small delay before restarting to prevent rapid restart loops
      if (wakeWordActive && !speechError) {
        if (restartTimeoutRef.current) {
          clearTimeout(restartTimeoutRef.current);
        }
        restartTimeoutRef.current = setTimeout(() => {
          try {
            recognition.start();
          } catch (err) {
            console.error("[WakeWord] Failed to restart speech recognition:", err);
          }
        }, 500);
      }
    };

    recognitionRef.current = recognition;

    if (wakeWordActive) {
      try {
        recognition.start();
      } catch (err) {
        console.error("[WakeWord] Initial start failed:", err);
        setSpeechError(true);
      }
    }

    return () => {
      if (restartTimeoutRef.current) {
        clearTimeout(restartTimeoutRef.current);
      }
      try {
        recognition.abort();
      } catch (err) {}
    };
  }, [wakeWordActive, onResult, speechError]);

  return { recognitionRef, speechError, setSpeechError };
}
