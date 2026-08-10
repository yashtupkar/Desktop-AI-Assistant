import { useState, useEffect, useRef } from "react";

export function useSpeechTranscription() {
  const [transcriberLoaded, setTranscriberLoaded] = useState(true); // Always ready
  const transcriberRef = useRef(null);

  useEffect(() => {
    transcriberRef.current = { available: true, mode: "native" };
  }, []);

  const transcribeAudio = async (audioInput) => {
    // For the audio blob approach, we'll use Web Speech API directly
    // since the recording-based approach doesn't work well with fallback
    return null; // This will trigger the direct speech recognition
  };

  return { transcriberLoaded, transcribeAudio };
}
