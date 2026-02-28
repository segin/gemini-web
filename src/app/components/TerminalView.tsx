"use client";
import React, { useEffect, useRef } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";
import { io, Socket } from "socket.io-client";

interface TerminalViewProps {
  sessionId: string;
  cwd: string;
  onClose: () => void;
}

const TerminalView: React.FC<TerminalViewProps> = ({ sessionId, cwd, onClose }) => {
  const terminalRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<Terminal | null>(null);
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    if (!terminalRef.current) return;

    const term = new Terminal({
      cursorBlink: true,
      fontSize: 14,
      fontFamily: '"Cascadia Code", "Ubuntu Mono", monospace',
      theme: {
        background: "#1e1e2e",
        foreground: "#cdd6f4",
      },
    });
    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.open(terminalRef.current);
    fitAddon.fit();
    xtermRef.current = term;

    // We use standard HTTP origin for socket.io in this setup
    const socket = io("http://localhost:3046");
    socketRef.current = socket;

    socket.on("connect", () => {
      term.writeln("\x1b[1;32mConnected to Gemini PTY Service\x1b[0m");
      socket.emit("start-session", { sessionId, cwd, prompt: "" });
    });

    socket.on("output", ({ data }) => {
      term.write(data);
    });

    socket.on("session-closed", ({ code }) => {
      term.writeln(`\r\n\x1b[1;31mSession closed (exit code: ${code})\x1b[0m`);
    });

    term.onData((data) => {
      socket.emit("input", { data });
    });

    const resizeListener = () => fitAddon.fit();
    window.addEventListener("resize", resizeListener);

    return () => {
      window.removeEventListener("resize", resizeListener);
      socket.disconnect();
      term.dispose();
    };
  }, [sessionId, cwd]);

  return (
    <div style={{ position: "relative", height: "100%", backgroundColor: "#1e1e2e", borderRadius: "8px", padding: "10px", overflow: "hidden" }}>
      <button
        onClick={onClose}
        style={{
          position: "absolute",
          top: "5px",
          right: "5px",
          zIndex: 10,
          background: "#f38ba8",
          border: "none",
          borderRadius: "4px",
          color: "white",
          cursor: "pointer",
          padding: "2px 8px",
        }}
      >
        Close Terminal
      </button>
      <div ref={terminalRef} style={{ height: "100%" }} />
    </div>
  );
};

export default TerminalView;
