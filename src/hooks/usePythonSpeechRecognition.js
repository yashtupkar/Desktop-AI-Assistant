import { useState, useEffect, useRef } from "react";

export function usePythonSpeechRecognition(wakeWordActive, onResult, onError) {
  const [speechError, setSpeechError] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const timeoutRef = useRef(null);
  
  const onResultRef = useRef(onResult);
  const onErrorRef = useRef(onError);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);

  useEffect(() => {
    onResultRef.current = onResult;
    onErrorRef.current = onError;
  }, [onResult, onError]);

  useEffect(() => {
    let isMounted = true;
    let stream = null;

    const startRecording = async () => {
      if (!wakeWordActive || !isMounted) return;
      
      try {
        if (!stream) {
          stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        }
        
        setIsListening(true);
        setSpeechError(false);
        
        const mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
        mediaRecorderRef.current = mediaRecorder;
        audioChunksRef.current = [];
        
        mediaRecorder.ondataavailable = (e) => {
          if (e.data.size > 0) {
            audioChunksRef.current.push(e.data);
          }
        };
        
        mediaRecorder.onstop = async () => {
          setIsListening(false);
          const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
          
          if (audioBlob.size > 1000) {
            try {
              const reader = new FileReader();
              reader.readAsDataURL(audioBlob);
              reader.onloadend = async () => {
                const base64data = reader.result.split(',')[1];
                const result = await window.electronAPI.transcribeAudio(base64data);
                console.log("[JS STT] Transcribe result:", result);
                
                if (isMounted && result.success && result.text) {
                  console.log("[JS STT] Calling onResultRef...");
                  if (onResultRef.current) {
                    onResultRef.current({ 
                      resultIndex: 0, 
                      results: [[{ transcript: result.text, isFinal: true }]] 
                    });
                  } else {
                    console.error("[JS STT] onResultRef.current is null!");
                  }
                } else if (isMounted && result.error) {
                    console.log("[JS STT] Deepgram error:", result.error);
                } else if (!isMounted) {
                    console.log("[JS STT] Component unmounted, skipping result");
                }
              };
            } catch (err) {
              console.error("[JS STT] Error:", err);
            }
          }
          
          // Restart recording loop
          if (wakeWordActive && isMounted) {
            timeoutRef.current = setTimeout(startRecording, 300);
          }
        };
        
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const source = audioContext.createMediaStreamSource(stream);
        const analyser = audioContext.createAnalyser();
        analyser.fftSize = 512;
        source.connect(analyser);

        const bufferLength = analyser.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);
        
        let silenceTimer = null;
        let maxTimer = null;

        const checkSilence = () => {
          if (!isMounted || mediaRecorder.state !== 'recording') return;
          
          analyser.getByteTimeDomainData(dataArray);
          let isSilent = true;
          for (let i = 0; i < bufferLength; i++) {
            const amplitude = Math.abs(dataArray[i] - 128);
            if (amplitude > 5) { // Threshold for silence
              isSilent = false;
              break;
            }
          }

          if (isSilent) {
            if (!silenceTimer) {
              silenceTimer = setTimeout(() => {
                if (mediaRecorder.state === 'recording') {
                  mediaRecorder.stop();
                }
              }, 1500); // 1.5 seconds of silence
            }
          } else {
            if (silenceTimer) {
              clearTimeout(silenceTimer);
              silenceTimer = null;
            }
          }
          
          if (mediaRecorder.state === 'recording') {
            requestAnimationFrame(checkSilence);
          }
        };

        mediaRecorder.start();
        checkSilence();

        // Max recording time 15 seconds to prevent memory issues
        maxTimer = setTimeout(() => {
          if (mediaRecorder.state === 'recording') {
            mediaRecorder.stop();
          }
        }, 15000);
        
      } catch (err) {
        console.error("[JS STT] Mic Error:", err);
        setSpeechError(true);
        if (onErrorRef.current) onErrorRef.current(err.message);
        
        if (wakeWordActive && isMounted) {
          timeoutRef.current = setTimeout(startRecording, 5000);
        }
      }
    };

    if (wakeWordActive) {
      startRecording();
    }

    return () => {
      isMounted = false;
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
        mediaRecorderRef.current.stop();
      }
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }
    };
  }, [wakeWordActive]);

  return { speechError, isListening, setSpeechError };
}
