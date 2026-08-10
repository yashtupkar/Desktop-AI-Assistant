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
                
                if (isMounted && result.success && result.text) {
                  if (onResultRef.current) {
                    onResultRef.current({ 
                      resultIndex: 0, 
                      results: [[{ transcript: result.text, isFinal: true }]] 
                    });
                  }
                } else if (isMounted && result.error) {
                    console.log("[JS STT] Deepgram error:", result.error);
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
        
        mediaRecorder.start();
        
        // Stop recording after 4 seconds to process chunks
        setTimeout(() => {
          if (mediaRecorder.state === 'recording') {
            mediaRecorder.stop();
          }
        }, 4000);
        
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
