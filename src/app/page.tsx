"use client";
import React, { useState, useEffect, useRef } from "react";

export default function Home() {
  const [sessions, setSessions] = useState<string[]>([]);
  const [selectedSession, setSelectedSession] = useState<string>("");
  const [output, setOutput] = useState<string>("");
  const [input, setInput] = useState<string>("");
  const [isRecording, setIsRecording] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);

  useEffect(() => {
    fetchSessions();
  }, []);

  const fetchSessions = async () => {
    try {
      const res = await fetch("/api/sessions");
      const data = await res.json();
      setSessions(data.sessions || []);
      if (data.sessions && data.sessions.length > 0 && !selectedSession) {
        setSelectedSession(data.sessions[0]);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleStartRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      const chunks: Blob[] = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(chunks, { type: "audio/webm" });
        const reader = new FileReader();
        reader.readAsDataURL(audioBlob);
        reader.onloadend = async () => {
          const base64Audio = reader.result?.toString() || "";
          await sendAudio(base64Audio);
        };
        stream.getTracks().forEach((track) => track.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
    } catch (err) {
      console.error("Microphone error", err);
    }
  };

  const handleStopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  const sendAudio = async (base64Audio: string) => {
    if (!selectedSession) return;
    setOutput((prev) => prev + "\n[Sending audio...]");
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session: selectedSession, audio: base64Audio }),
      });
      const data = await res.json();
      setOutput((prev) => prev + "\n" + (data.response || data.error));
    } catch (err) {
      console.error(err);
    }
  };

  const sendText = async () => {
    if (!input.trim() || !selectedSession) return;
    const currentInput = input;
    setInput("");
    setOutput((prev) => prev + "\n> " + currentInput);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session: selectedSession, text: currentInput }),
      });
      const data = await res.json();
      setOutput((prev) => prev + "\n" + (data.response || data.error));
    } catch (err) {
      console.error(err);
    }
  };

  const createSession = async () => {
    const dir = prompt("Enter directory path for new session:");
    if (!dir) return;
    try {
      await fetch("/api/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ directory: dir }),
      });
      fetchSessions();
    } catch (e) {
      console.error(e);
    }
  };

  const linkNode = async () => {
    const url = prompt("Enter the URL of another Gemini Web Node:");
    if (!url) return;
    try {
      await fetch("/api/nodes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      fetchSessions();
      alert("Node linked successfully!");
    } catch (e) {
      console.error(e);
      alert("Failed to link node.");
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", padding: "1rem" }}>
      <header style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", marginBottom: "1rem", gap: "1rem" }}>
        <h1 style={{ margin: 0 }}>Gemini Web CLI</h1>
        <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
          <select value={selectedSession} onChange={(e) => setSelectedSession(e.target.value)} style={{ padding: "0.5rem" }}>
            <option value="" disabled>Select session</option>
            {sessions.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
          <button onClick={createSession} style={{ padding: "0.5rem", backgroundColor: "var(--primary)", border: "none", borderRadius: "4px", color: "var(--background)", cursor: "pointer" }}>New Session</button>
          <button onClick={linkNode} style={{ padding: "0.5rem", backgroundColor: "var(--secondary)", border: "1px solid var(--border)", borderRadius: "4px", color: "var(--foreground)", cursor: "pointer" }}>Link Node</button>
        </div>
      </header>

      <main style={{ flex: 1, backgroundColor: "var(--secondary)", borderRadius: "8px", padding: "1rem", overflowY: "auto", whiteSpace: "pre-wrap" }}>
        {output || "No output yet. Start chatting!"}
      </main>

      <footer style={{ display: "flex", marginTop: "1rem", gap: "0.5rem", flexWrap: "wrap" }}>
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && sendText()}
          style={{ flex: 1, minWidth: "200px", padding: "0.5rem", borderRadius: "4px", border: "1px solid var(--border)", backgroundColor: "var(--background)", color: "var(--foreground)" }}
          placeholder="Type a command or message..."
        />
        <button onClick={sendText} style={{ padding: "0.5rem 1rem", backgroundColor: "var(--primary)", color: "var(--background)", border: "none", borderRadius: "4px", cursor: "pointer" }}>
          Send
        </button>
        <button
          onClick={isRecording ? handleStopRecording : handleStartRecording}
          style={{ padding: "0.5rem 1rem", backgroundColor: isRecording ? "var(--accent)" : "var(--secondary)", color: "var(--foreground)", border: "none", borderRadius: "4px", cursor: "pointer" }}
        >
          {isRecording ? "Stop Voice" : "Record Voice"}
        </button>
      </footer>
    </div>
  );
}
