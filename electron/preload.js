const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  controlWindow: (command) => ipcRenderer.send("window-control", command),
  getSystemStats: () => ipcRenderer.invoke("get-system-stats"),
  openUrl: (url) => ipcRenderer.invoke("open-url", url),
  openApp: (appName) => ipcRenderer.invoke("open-app", appName),
  ollamaChat: (messages, model) =>
    ipcRenderer.invoke("ollama-chat", messages, model),
  checkOllama: () => ipcRenderer.invoke("check-ollama"),
  edgeTTS: (text) => ipcRenderer.invoke("edge-tts", text),
});
