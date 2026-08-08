const fetch = require("node-fetch");
const config = require("./config");

// AI chat handler
async function aiChat(event, messages, model = config.DEFAULT_MODEL) {
  try {
    const response = await fetch(`${config.OPENROUTER_URL}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.OPENROUTER_API_KEY}`,
        "HTTP-Referer": config.APP_REFERER,
        "X-Title": config.APP_TITLE,
      },
      body: JSON.stringify({
        model: model,
        messages: messages,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`OpenRouter API Error: ${response.status} - ${errorText}`);
      throw new Error(
        `OpenRouter request failed: ${response.status} - ${errorText}`,
      );
    }

    const data = await response.json();
    return { success: true, message: data.choices[0].message.content };
  } catch (error) {
    console.error("AI chat error:", error);
    return { success: false, error: error.message };
  }
}

module.exports = {
  aiChat,
};
