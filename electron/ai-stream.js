const fetch = require("node-fetch");
const config = require("./config");

// AI chat stream handler
function aiChatStream(ipcMain) {
  ipcMain.on("ai-chat-stream", async (event, messages, model = config.STREAM_MODEL) => {
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
          stream: true,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(
          `OpenRouter Stream API Error: ${response.status} - ${errorText}`,
        );
        event.reply("ai-chat-stream-error", errorText);
        return;
      }

      let buffer = "";
      response.body.on("data", (chunk) => {
        buffer += chunk.toString();
        const lines = buffer.split("\n");

        for (let i = 0; i < lines.length - 1; i++) {
          const line = lines[i].trim();
          if (!line || !line.startsWith("data: ")) continue;

          const dataStr = line.replace("data: ", "");
          if (dataStr === "[DONE]") {
            event.reply("ai-chat-stream-done");
            continue;
          }

          try {
            const data = JSON.parse(dataStr);
            if (
              data.choices &&
              data.choices[0].delta &&
              data.choices[0].delta.content
            ) {
              event.reply("ai-chat-stream-chunk", data.choices[0].delta.content);
            }
          } catch (e) {
            console.error("Error parsing AI stream chunk:", e);
          }
        }

        buffer = lines[lines.length - 1] || "";
      });

      response.body.on("end", () => {
        event.reply("ai-chat-stream-done");
      });

      response.body.on("error", (error) => {
        console.error("AI stream error:", error);
        event.reply("ai-chat-stream-error", error.message);
      });
    } catch (error) {
      console.error("AI chat stream error:", error);
      event.reply("ai-chat-stream-error", error.message);
    }
  });
}

module.exports = {
  aiChatStream,
};
