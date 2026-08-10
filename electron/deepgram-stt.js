const record = require("node-record-lpcm16");
const fs = require("fs");
const path = require("path");
const os = require("os");
const https = require("https");

const config = require("./config");

/**
 * Deepgram-based speech recognition for Electron
 * Uses Node.js audio recording and Deepgram API for transcription
 */

async function transcribeAudio(audioBuffer, mimeType = "audio/wav") {
  return new Promise((resolve, reject) => {
    const apiKey = config.DEEPGRAM_API_KEY;
    
    if (!apiKey) {
      console.error("[Deepgram] API key not configured");
      resolve({ success: false, error: "Deepgram API key not configured" });
      return;
    }

    const options = {
      hostname: "api.deepgram.com",
      port: 443,
      path: "/v1/listen?model=nova-2&language=en-US&smart_format=true",
      method: "POST",
      headers: {
        "Authorization": `Token ${apiKey}`,
        "Content-Type": mimeType,
      },
    };

    const req = https.request(options, (res) => {
      let data = "";

      res.on("data", (chunk) => {
        data += chunk;
      });

      res.on("end", () => {
        try {
          const result = JSON.parse(data);
          
          if (result.results && result.results.channels && result.results.channels[0]) {
            const transcript = result.results.channels[0].alternatives[0].transcript;
            if (transcript && transcript.trim()) {
              console.log("[Deepgram] Transcribed:", transcript);
              resolve({ success: true, text: transcript });
            } else {
              resolve({ success: false, error: "No transcript returned" });
            }
          } else {
            resolve({ success: false, error: "Invalid response format" });
          }
        } catch (error) {
          console.error("[Deepgram] JSON parse error:", error);
          resolve({ success: false, error: "Failed to parse response" });
        }
      });
    });

    req.on("error", (error) => {
      console.error("[Deepgram] Request error:", error);
      resolve({ success: false, error: error.message });
    });

    req.write(audioBuffer);
    req.end();
  });
}

async function listenForSpeech(timeout = 5) {
  return new Promise((resolve) => {
    const tempDir = os.tmpdir();
    const outputFile = path.join(tempDir, `audio-${Date.now()}.wav`);
    
    console.log("[Deepgram] Starting audio recording...");
    
    const recording = record.record({
      sampleRateHertz: 16000,
      threshold: 0.5,
      silence: 1.5,
      channels: 1,
      audioType: "wav",
      endOnSilence: true,
      recorder: "sox", // Use sox for better compatibility
    });

    const fileStream = fs.createWriteStream(outputFile);
    recording.stream().pipe(fileStream);

    // Set timeout to stop recording if no speech detected
    const timeoutId = setTimeout(() => {
      console.log("[Deepgram] Recording timeout reached");
      recording.stop();
    }, timeout * 1000);

    // Handle recording completion
    recording.stream().on("end", async () => {
      clearTimeout(timeoutId);
      fileStream.close();
      
      console.log("[Deepgram] Recording complete, transcribing...");
      
      try {
        // Wait a bit for file to be fully written
        await new Promise(resolve => setTimeout(resolve, 300));
        
        // Check if file has content
        const stats = fs.statSync(outputFile);
        if (stats.size < 1000) {
          console.log("[Deepgram] Recording too small, likely no speech");
          try {
            fs.unlinkSync(outputFile);
          } catch (e) {
            console.warn("[Deepgram] Could not delete temp file:", e);
          }
          resolve({ success: false, error: "No speech detected" });
          return;
        }
        
        // Read the audio file
        const audioBuffer = fs.readFileSync(outputFile);
        
        // Transcribe with Deepgram
        const result = await transcribeAudio(audioBuffer);
        
        // Clean up temp file
        try {
          fs.unlinkSync(outputFile);
        } catch (e) {
          console.warn("[Deepgram] Could not delete temp file:", e);
        }
        
        resolve(result);
      } catch (error) {
        console.error("[Deepgram] Error processing audio:", error);
        
        // Clean up temp file if it exists
        try {
          if (fs.existsSync(outputFile)) {
            fs.unlinkSync(outputFile);
          }
        } catch (e) {
          console.warn("[Deepgram] Could not delete temp file:", e);
        }
        
        resolve({ success: false, error: error.message });
      }
    });

    recording.stream().on("error", (error) => {
      clearTimeout(timeoutId);
      console.error("[Deepgram] Recording error:", error);
      
      // Clean up temp file if it exists
      try {
        if (fs.existsSync(outputFile)) {
          fs.unlinkSync(outputFile);
        }
      } catch (e) {
        console.warn("[Deepgram] Could not delete temp file:", e);
      }
      
      resolve({ success: false, error: error.message });
    });

    // Start recording
    recording.start();
  });
}

module.exports = { listenForSpeech, transcribeAudio };