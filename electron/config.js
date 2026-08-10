require("dotenv").config({ path: require("path").join(__dirname, "../.env") });

module.exports = {
  OPENROUTER_URL: process.env.OPENROUTER_URL || "https://openrouter.ai/api/v1",
  OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY,
  DEFAULT_MODEL: process.env.DEFAULT_MODEL || "google/gemini-2.5-flash-lite",
  STREAM_MODEL: process.env.STREAM_MODEL || "google/gemma-2-9b-it:free",
  APP_REFERER: process.env.APP_REFERER || "https://github.com/yashtupkar/Desktop-AI-Assistant",
  APP_TITLE: process.env.APP_TITLE || "Nova AI Assistant",
  CHROME_DEBUG_PORT: parseInt(process.env.CHROME_DEBUG_PORT || "9222", 10),
  TTS_VOICE: process.env.TTS_VOICE || "en-US-AriaNeural",
  TTS_LANG: process.env.TTS_LANG || "en-US",
  PYTHON_PATH: process.env.PYTHON_PATH || "python",
  DEEPGRAM_API_KEY: process.env.DEEPGRAM_API_KEY,
};
