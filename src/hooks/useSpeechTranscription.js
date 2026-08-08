import { useState, useEffect, useRef } from "react";
import { pipeline, env } from "@xenova/transformers";

// Disable local model checks to force fetching from Hugging Face
env.allowLocalModels = false;

export function useSpeechTranscription(onTranscript) {
  const [transcriberLoaded, setTranscriberLoaded] = useState(false);
  const transcriberRef = useRef(null);

  useEffect(() => {
    const loadTranscriber = async () => {
      try {
        transcriberRef.current = await pipeline(
          'automatic-speech-recognition',
          'Xenova/whisper-tiny.en',
          { quantized: true }
        );
        setTranscriberLoaded(true);
      } catch (err) {
        console.error("Error loading transcriber:", err);
      }
    };
    loadTranscriber();
  }, []);

  const transcribeAudio = async (audioBlob) => {
    if (!transcriberRef.current) {
      return null;
    }

    try {
      const audioContext = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 16000 });
      const arrayBuffer = await audioBlob.arrayBuffer();
      let channelData;

      if (audioContext.decodeAudioData) {
        const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
        channelData = audioBuffer.getChannelData(0);
        
        // Resample to 16kHz if needed
        if (audioBuffer.sampleRate !== 16000) {
          const offlineContext = new OfflineAudioContext(1, channelData.length * (16000 / audioBuffer.sampleRate), 16000);
          const source = offlineContext.createBufferSource();
          source.buffer = audioBuffer;
          source.connect(offlineContext.destination);
          source.start();
          const resampledBuffer = await offlineContext.startRendering();
          channelData = resampledBuffer.getChannelData(0);
        }
      } else {
        channelData = new Float32Array(arrayBuffer);
      }

      const result = await transcriberRef.current(channelData);
      return result.text.trim();
    } catch (err) {
      console.error("Transcription error:", err);
      return null;
    }
  };

  return { transcriberLoaded, transcribeAudio };
}
