const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  controlWindow: (command) => ipcRenderer.send("window-control", command),
  getSystemStats: () => ipcRenderer.invoke("get-system-stats"),
  openUrl: (url) => ipcRenderer.invoke("open-url", url),
  openApp: (appName) => ipcRenderer.invoke("open-app", appName),
  ollamaChat: (messages, model) =>
    ipcRenderer.invoke("ollama-chat", messages, model),
  ollamaChatStream: (messages, model, callbacks) => {
    const { onChunk, onDone, onError } = callbacks;

    ipcRenderer.send("ollama-chat-stream", messages, model);

    const chunkHandler = (event, content) => onChunk(content);
    const doneHandler = () => {
      onDone();
      cleanup();
    };
    const errorHandler = (event, error) => {
      onError(error);
      cleanup();
    };

    ipcRenderer.on("ollama-chat-stream-chunk", chunkHandler);
    ipcRenderer.on("ollama-chat-stream-done", doneHandler);
    ipcRenderer.on("ollama-chat-stream-error", errorHandler);

    const cleanup = () => {
      ipcRenderer.removeListener("ollama-chat-stream-chunk", chunkHandler);
      ipcRenderer.removeListener("ollama-chat-stream-done", doneHandler);
      ipcRenderer.removeListener("ollama-chat-stream-error", errorHandler);
    };

    return cleanup;
  },
  checkOllama: () => ipcRenderer.invoke("check-ollama"),
  edgeTTS: (text) => ipcRenderer.invoke("edge-tts", text),
  edgeTTSStream: (text, callbacks) => {
    const { onChunk, onDone, onError } = callbacks;

    ipcRenderer.send("edge-tts-stream", text);

    const chunkHandler = (event, base64Chunk) => onChunk(base64Chunk);
    const doneHandler = () => {
      onDone();
      cleanup();
    };
    const errorHandler = (event, error) => {
      onError(error);
      cleanup();
    };

    ipcRenderer.on("edge-tts-stream-chunk", chunkHandler);
    ipcRenderer.on("edge-tts-stream-done", doneHandler);
    ipcRenderer.on("edge-tts-stream-error", errorHandler);

    const cleanup = () => {
      ipcRenderer.removeListener("edge-tts-stream-chunk", chunkHandler);
      ipcRenderer.removeListener("edge-tts-stream-done", doneHandler);
      ipcRenderer.removeListener("edge-tts-stream-error", errorHandler);
    };

    return cleanup;
  },
  browserStart: () => ipcRenderer.invoke("browser-start"),
  browserGoto: (url) => ipcRenderer.invoke("browser-goto", url),
  browserGetDom: () => ipcRenderer.invoke("browser-get-dom"),
  browserClick: (id) => ipcRenderer.invoke("browser-click", id),
  browserType: (id, text) => ipcRenderer.invoke("browser-type", id, text),
  browserKeyboard: (key) => ipcRenderer.invoke("browser-keyboard", key),
  browserClose: () => ipcRenderer.invoke("browser-close"),
});
