import { useRef, useCallback } from "react";

export function useTTS(onStateChange) {
  const speakQueueRef = useRef([]);
  const isSpeakingRef = useRef(false);

  const setSpeakingState = (state) => {
    isSpeakingRef.current = state;
    if (onStateChange) onStateChange(state);
  };

  const processSpeakQueue = async () => {
    if (speakQueueRef.current.length === 0) {
      return;
    }
    if (isSpeakingRef.current) return;

    setSpeakingState(true);

    const sentence = speakQueueRef.current.shift();

    await new Promise((resolve) => {
      window.electronAPI.edgeTTSStream(sentence, {
        onChunk: (base64Chunk) => {
          const binary = atob(base64Chunk);
          const bytes = new Uint8Array(binary.length);
          for (let i = 0; i < binary.length; i++) {
            bytes[i] = binary.charCodeAt(i);
          }
          if (!window._ttsChunks) window._ttsChunks = [];
          window._ttsChunks.push(bytes);
        },
        onDone: () => {
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
            setSpeakingState(false);
            processSpeakQueue();
          };
          audio.onerror = () => {
            setSpeakingState(false);
            processSpeakQueue();
          };
          audio.play();
          resolve();
        },
        onError: (err) => {
          console.error("TTS stream error:", err);
          setSpeakingState(false);
          processSpeakQueue();
          resolve();
        },
      });
    });
  };

  const speak = useCallback((text) => {
    if (text.trim()) {
      speakQueueRef.current.push(text.trim());
    }
    processSpeakQueue();
  }, []);

  return { speak };
}
