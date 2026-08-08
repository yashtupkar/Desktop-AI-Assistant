import React from "react";
import { Mic, X, ShieldAlert, Keyboard } from "lucide-react";

export function ControlPill({ assistantState, toggleListening, stopAutomation, toggleKeyboard, showKeyboard }) {
  return (
    <div className="absolute bottom-6 flex items-center space-x-2 bg-white/5 border border-white/10 backdrop-blur-md rounded-full p-1.5 no-drag-region shadow-lg">
      <button
        onClick={() => window.electronAPI?.controlWindow("close")}
        className="p-3 rounded-full hover:bg-white/10 text-white/50 hover:text-white transition-colors group relative"
        title="Close App"
      >
        <X className="w-5 h-5" />
      </button>

      {assistantState === "automating" && (
        <button
          onClick={stopAutomation}
          className="p-3 rounded-full hover:bg-red-500/20 text-red-400 hover:text-red-300 transition-colors group relative"
          title="Emergency Stop"
        >
          <ShieldAlert className="w-5 h-5" />
        </button>
      )}

      <button
        onClick={toggleKeyboard}
        className={`p-3 rounded-full transition-colors ${showKeyboard ? "bg-purple-500/20 text-purple-400" : "hover:bg-white/10 text-white/50 hover:text-white"}`}
        title="Type Command"
      >
        <Keyboard className="w-5 h-5" />
      </button>

      <button
        onClick={toggleListening}
        className={`p-3 rounded-full transition-colors ${assistantState === "listening" ? "bg-cyan-500/20 text-cyan-400" : "hover:bg-white/10 text-white/50 hover:text-white"}`}
        title="Toggle Microphone"
      >
        <Mic className="w-5 h-5" />
      </button>
    </div>
  );
}
