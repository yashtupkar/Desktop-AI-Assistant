import { useState, useEffect, useRef } from "react";

export function useVoiceRecognition(wakeWordActive, transcribeAudio, onResult, onError) {
  const [speechError, setSpeechError] = useState(false);
  const recognitionRef = useRef(null);
  const restartTimeoutRef = useRef(null);
  const isListeningRef = useRef(false);

  const onResultRef = useRef(onResult);
  const transcribeAudioRef = useRef(transcribeAudio);
  const onErrorRef = useRef(onError);

  useEffect(() => {
    onResultRef.current = onResult;
    transcribeAudioRef.current = transcribeAudio;
    onErrorRef.current = onError;
  }, [onResult, transcribeAudio, onError]);

  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      console.warn("[Voice] Speech Recognition API not supported");
      setSpeechError(true);
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = false; // Use one-shot for better reliability
    recognition.interimResults = true;
    recognition.lang = "en-US";
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      console.log("[Voice] Speech recognition started");
      isListeningRef.current = true;
      setSpeechError(false);
    };

    recognition.onresult = (event) => {
      console.log("[Voice] Speech recognition result received");
      isListeningRef.current = false;
      
      const results = Array.from(event.results).map((result) => [
        {
          transcript: result[0]?.transcript || "",
          isFinal: result.isFinal,
        },
      ]);
      const resultIndex = typeof event.resultIndex === "number" ? event.resultIndex : results.length - 1;

      if (onResultRef.current) {
        onResultRef.current({ resultIndex, results });
      }
    };

    recognition.onerror = (event) => {
      console.error("[Voice] Speech recognition error:", event.error);
      isListeningRef.current = false;
      
      // Ignore network errors and just restart
      if (event.error === "network") {
        console.log("[Voice] Network error - will retry");
        setSpeechError(false); // Don't set error on network issues
      } else if (event.error === "not-allowed") {
        console.warn("[Voice] Microphone permission denied");
        setSpeechError(true);
      } else if (event.error === "no-speech") {
        console.log("[Voice] No speech detected - will restart");
      } else {
        console.warn("[Voice] Speech recognition error:", event.error);
      }
    };

    recognition.onend = () => {
      console.log("[Voice] Speech recognition ended. Wake word active:", wakeWordActive);
      isListeningRef.current = false;
      
      // Always restart if active
      if (wakeWordActive) {
        if (restartTimeoutRef.current) {
          clearTimeout(restartTimeoutRef.current);
        }
        restartTimeoutRef.current = setTimeout(() => {
          try {
            recognition.start();
          } catch (err) {
            console.error("[Voice] Failed to restart speech recognition:", err);
          }
        }, 3000); // Even longer delay to prevent rapid restart loops
      }
    };

    recognitionRef.current = recognition;

    if (wakeWordActive) {
      try {
        recognition.start();
      } catch (err) {
        console.error("[Voice] Initial start failed:", err);
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
  }, [wakeWordActive]);

  return { vadRef: recognitionRef, speechError, setSpeechError };
}
