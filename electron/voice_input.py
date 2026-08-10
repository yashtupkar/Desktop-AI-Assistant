#!/usr/bin/env python3
"""
Python-based speech recognition for Electron using Deepgram
This provides reliable voice input when Web Speech API fails in Electron
"""

import sys
import json
import os
import asyncio
from deepgram import DeepgramClient, DeepgramClientOptions, LiveTranscriptionEvents, LiveOptions
from speech_recognition import Recognizer, Microphone, UnknownValueError, RequestError, WaitTimeoutError

def listen_for_speech(timeout=5):
    """
    Listen for speech and return the transcribed text using Deepgram
    """
    # Get Deepgram API key from environment variable
    deepgram_api_key = os.environ.get("DEEPGRAM_API_KEY")
    if not deepgram_api_key:
        sys.stderr.write("[Speech] DEEPGRAM_API_KEY not found in environment\n")
        return {"success": False, "error": "Deepgram API key not configured"}
    
    recognizer = Recognizer()
    
    try:
        # Try to use the default microphone
        with Microphone() as source:
            sys.stderr.write("[Speech] Adjusting for ambient noise...\n")
            recognizer.adjust_for_ambient_noise(source, duration=0.5)
            sys.stderr.write("[Speech] Listening...\n")
            
            try:
                # Listen with timeout
                audio = recognizer.listen(source, timeout=timeout, phrase_time_limit=10)
                sys.stderr.write("[Speech] Processing audio with Deepgram...\n")
                
                # Get audio data
                audio_data = audio.get_raw_data()
                
                # Use Deepgram for transcription
                try:
                    deepgram = DeepgramClient(deepgram_api_key)
                    
                    # Use the pre-recorded API
                    payload = {
                        "buffer": audio_data,
                        "mimetype": "audio/wav"
                    }
                    
                    options = {
                        "smart_format": True,
                        "model": "nova-2",
                        "language": "en-US"
                    }
                    
                    response = deepgram.listen.rest.v("1").transcribe_file(payload, options)
                    
                    if response and "results" in response and "channels" in response["results"]:
                        transcript = response["results"]["channels"][0]["alternatives"][0]["transcript"]
                        if transcript.strip():
                            sys.stderr.write(f"[Speech] Deepgram Recognized: {transcript}\n")
                            return {"success": True, "text": transcript}
                        else:
                            sys.stderr.write("[Speech] Empty transcript from Deepgram\n")
                            return {"success": False, "error": "Could not understand audio"}
                    else:
                        sys.stderr.write("[Speech] Invalid response from Deepgram\n")
                        return {"success": False, "error": "Invalid response from Deepgram"}
                        
                except Exception as e:
                    sys.stderr.write(f"[Speech] Deepgram error: {e}\n")
                    # Fallback to Google Speech Recognition
                    try:
                        text = recognizer.recognize_google(audio)
                        sys.stderr.write(f"[Speech] Fallback Google Recognized: {text}\n")
                        return {"success": True, "text": text}
                    except UnknownValueError:
                        sys.stderr.write("[Speech] Could not understand audio\n")
                        return {"success": False, "error": "Could not understand audio"}
                    except RequestError as e:
                        sys.stderr.write(f"[Speech] Speech recognition service error: {e}\n")
                        return {"success": False, "error": "Speech recognition service unavailable"}
                        
            except WaitTimeoutError:
                sys.stderr.write("[Speech] No speech detected within timeout\n")
                return {"success": False, "error": "No speech detected"}
                
    except Exception as e:
        sys.stderr.write(f"[Speech] Error: {e}\n")
        return {"success": False, "error": str(e)}

if __name__ == "__main__":
    # Get timeout from command line argument if provided
    timeout = int(sys.argv[1]) if len(sys.argv) > 1 else 5
    
    result = listen_for_speech(timeout)
    print(json.dumps(result))