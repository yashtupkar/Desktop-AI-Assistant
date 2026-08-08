import React from "react";
import { motion } from "framer-motion";

export function Orb({ assistantState, onClick }) {
  let stateColor = "border-blue-500/30";
  let stateGlow = "bg-blue-500/10";
  let orbCenter = "bg-gradient-to-br from-blue-800 to-cyan-600";

  if (assistantState === "listening") {
    stateColor = "border-cyan-400";
    stateGlow = "bg-cyan-400/40";
    orbCenter = "bg-gradient-to-br from-blue-500 to-cyan-300";
  } else if (assistantState === "thinking") {
    stateColor = "border-yellow-400";
    stateGlow = "bg-yellow-400/30";
    orbCenter = "bg-gradient-to-br from-yellow-500 to-orange-400";
  } else if (assistantState === "speaking") {
    stateColor = "border-pink-500";
    stateGlow = "bg-pink-500/40";
    orbCenter = "bg-gradient-to-br from-pink-500 to-purple-500";
  } else if (assistantState === "automating") {
    stateColor = "border-green-400";
    stateGlow = "bg-green-400/40";
    orbCenter = "bg-gradient-to-br from-emerald-500 to-green-300";
  }

  return (
    <motion.div
      className="relative cursor-pointer no-drag-region mb-12"
      onClick={onClick}
      animate={{ scale: (assistantState === "speaking" || assistantState === "automating") ? [1, 1.05, 1] : 1 }}
      transition={{
        repeat: (assistantState === "speaking" || assistantState === "automating") ? Infinity : 0,
        duration: 1.5,
      }}
    >
      <div
        className={`absolute inset-0 ${stateGlow} rounded-full blur-2xl transition-all duration-700 ${assistantState !== "idle" ? "animate-pulse" : ""}`}
      ></div>

      <div
        className={`relative w-48 h-48 rounded-full shadow-[0_0_40px_rgba(0,0,0,0.5)] overflow-hidden transition-all duration-700 ${orbCenter} flex items-center justify-center`}
      >
        <div className="absolute inset-0 bg-white/10 rounded-full blur-md mix-blend-overlay"></div>
        <div className="absolute -inset-4 bg-gradient-to-t from-transparent to-white/20 rounded-full transform rotate-45 blur-lg"></div>

        <motion.div
          animate={{ rotate: 360 }}
          transition={{
            repeat: Infinity,
            duration: assistantState === "thinking" ? 2 : 12,
            ease: "linear",
          }}
          className={`w-full h-full rounded-full border-t-2 border-l-2 ${stateColor} absolute opacity-30 transition-colors duration-700`}
        />
      </div>
    </motion.div>
  );
}
