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
    <div style={{ position: "relative", height: "100%", overflow: "hidden" }}>
      <button className="btn btn-secondary terminal-header-btn" onClick={onClose}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '4px' }}><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        Close Terminal
      </button>
      <div ref={terminalRef} style={{ height: "100%", width: "100%", padding: "12px 12px 12px 16px" }} />
    </div>
  );
};

export default TerminalView;
