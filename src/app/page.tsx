"use client";
import React, { useState, useEffect, useRef } from "react";

interface Extension {
  id: string;
  name: string;
  description: string;
  fullName: string;
  installUrl: string;
  avatar?: string;
}

export default function Home() {
  const [sessions, setSessions] = useState<string[]>([]);
  const [selectedSession, setSelectedSession] = useState<string>("");
  const [output, setOutput] = useState<string>("");
  const [input, setInput] = useState<string>("");
  const [isRecording, setIsRecording] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);

  // Extension management state
  const [availableExtensions, setAvailableExtensions] = useState<Extension[]>([]);
  const [installedExtensions, setInstalledExtensions] = useState<string[]>([]);
  const [extensionHost, setExtensionHost] = useState<string>("local");
  const [showExtensions, setShowExtensions] = useState(false);
  const [nodes, setNodes] = useState<string[]>([]);
  const [installingAll, setInstallingAll] = useState(false);

  useEffect(() => {
    fetchSessions();
    fetchNodes();
    fetchAvailableExtensions();
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

  const detectProjects = async () => {
    try {
      const res = await fetch("/api/detect");
      const data = await res.json();
      if (data.detected && data.detected.length > 0) {
        for (const dir of data.detected) {
          await fetch("/api/sessions", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ directory: dir }),
          });
        }
        fetchSessions();
        alert(`Detected and added ${data.detected.length} projects.`);
      } else {
        alert("No existing Gemini projects found in home directory.");
      }
    } catch (e) {
      console.error(e);
      alert("Failed to scan for projects.");
    }
  };

  const fetchNodes = async () => {
    try {
      const res = await fetch("/api/nodes");
      const data = await res.json();
      setNodes(data.nodes || []);
    } catch (e) {
      console.error(e);
    }
  };

  const fetchAvailableExtensions = async () => {
    try {
      const res = await fetch("/api/extensions?type=available");
      const data = await res.json();
      setAvailableExtensions(data.extensions || []);
    } catch (e) {
      console.error(e);
    }
  };

  const fetchInstalledExtensions = async (host: string) => {
    try {
      const res = await fetch(`/api/extensions?type=installed&host=${host}`);
      const data = await res.json();
      setInstalledExtensions(data.extensions || []);
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    if (showExtensions) {
      fetchInstalledExtensions(extensionHost);
    }
  }, [showExtensions, extensionHost]);

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
      fetchNodes();
      fetchSessions();
      alert("Node linked successfully!");
    } catch (e) {
      console.error(e);
      alert("Failed to link node.");
    }
  };

  const installExtension = async (ext: Extension, host: string = extensionHost) => {
    try {
      const res = await fetch("/api/extensions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "install", host, extensionUrl: ext.installUrl }),
      });
      return await res.json();
    } catch (e) {
      console.error(e);
      return { error: String(e) };
    }
  };

  const handleInstallSingle = async (ext: Extension) => {
    if (!confirm(`Install ${ext.name}?`)) return;
    const data = await installExtension(ext);
    if (data.success) {
      alert("Installed successfully!");
      fetchInstalledExtensions(extensionHost);
    } else {
      alert("Failed to install: " + (data.error || "Unknown error"));
    }
  };

  const handleInstallAll = async (ext: Extension) => {
    if (!confirm(`Install ${ext.name} on all nodes (local + ${nodes.length} nodes)?`)) return;
    setInstallingAll(true);
    const results = [];
    
    // Install local
    results.push(await installExtension(ext, "local"));
    
    // Install remotes
    for (const node of nodes) {
      results.push(await installExtension(ext, node));
    }
    
    setInstallingAll(false);
    const successes = results.filter(r => r.success).length;
    alert(`Installed on ${successes}/${results.length} nodes.`);
    fetchInstalledExtensions(extensionHost);
  };

  const uninstallExtension = async (name: string) => {
    if (!confirm(`Uninstall ${name}?`)) return;
    try {
      const res = await fetch("/api/extensions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "uninstall", host: extensionHost, extensionName: name }),
      });
      const data = await res.json();
      if (data.success) {
        alert("Uninstalled successfully!");
        fetchInstalledExtensions(extensionHost);
      } else {
        alert("Failed to uninstall: " + (data.error || "Unknown error"));
      }
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", padding: "1rem" }}>
      <header style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", marginBottom: "1rem", gap: "1rem" }}>
        <h1 style={{ margin: 0 }}>Gemini Web CLI</h1>
        <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
          <button onClick={() => setShowExtensions(!showExtensions)} style={{ padding: "0.5rem", backgroundColor: "var(--secondary)", border: "1px solid var(--border)", borderRadius: "4px", color: "var(--foreground)", cursor: "pointer" }}>
            {showExtensions ? "Back to Chat" : "Extensions"}
          </button>
          {!showExtensions && (
            <>
              <select value={selectedSession} onChange={(e) => setSelectedSession(e.target.value)} style={{ padding: "0.5rem" }}>
                <option value="" disabled>Select session</option>
                {sessions.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
              <button onClick={createSession} style={{ padding: "0.5rem", backgroundColor: "var(--primary)", border: "none", borderRadius: "4px", color: "var(--background)", cursor: "pointer" }}>New Session</button>
              <button onClick={detectProjects} style={{ padding: "0.5rem", backgroundColor: "var(--secondary)", border: "1px solid var(--border)", borderRadius: "4px", color: "var(--foreground)", cursor: "pointer" }}>Detect Projects</button>
            </>
          )}
          <button onClick={linkNode} style={{ padding: "0.5rem", backgroundColor: "var(--secondary)", border: "1px solid var(--border)", borderRadius: "4px", color: "var(--foreground)", cursor: "pointer" }}>Link Node</button>
        </div>
      </header>

      <main style={{ flex: 1, backgroundColor: "var(--secondary)", borderRadius: "8px", padding: "1rem", overflowY: "auto" }}>
        {showExtensions ? (
          <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
            <div style={{ display: "flex", gap: "1rem", alignItems: "center" }}>
              <h2>Manage Extensions</h2>
              <select value={extensionHost} onChange={(e) => setExtensionHost(e.target.value)} style={{ padding: "0.5rem" }}>
                <option value="local">Local Host</option>
                {nodes.map(n => <option key={n} value={n}>{n}</option>)}
              </select>
            </div>

            <section>
              <h3>Installed Extensions</h3>
              <ul style={{ listStyle: "none", padding: 0 }}>
                {installedExtensions.length === 0 ? (
                  <li>No extensions installed on this host.</li>
                ) : (
                  installedExtensions.map((ext, idx) => (
                    <li key={idx} style={{ display: "flex", justifyContent: "space-between", padding: "0.5rem 0", borderBottom: "1px solid var(--border)" }}>
                      <span>{ext}</span>
                      <button onClick={() => uninstallExtension(ext)} style={{ color: "var(--accent)", background: "none", border: "none", cursor: "pointer" }}>Uninstall</button>
                    </li>
                  ))
                )}
              </ul>
            </section>

            <section>
              <h3>Available from geminicli.com</h3>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(250px, 1fr))", gap: "1rem" }}>
                {availableExtensions.map((ext) => (
                  <div key={ext.id} style={{ border: "1px solid var(--border)", borderRadius: "8px", padding: "1rem", display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
                    <div style={{ display: "flex", gap: "0.5rem", marginBottom: "0.5rem" }}>
                      {ext.avatar && <img src={ext.avatar} width="32" height="32" style={{ borderRadius: "4px" }} alt="" />}
                      <div style={{ overflow: "hidden" }}>
                        <div style={{ fontWeight: "bold", textOverflow: "ellipsis", overflow: "hidden", whiteSpace: "nowrap" }}>{ext.name}</div>
                        <div style={{ fontSize: "0.8rem", color: "var(--primary)" }}>{ext.fullName}</div>
                      </div>
                    </div>
                    <p style={{ fontSize: "0.9rem", margin: "0.5rem 0", flex: 1 }}>{ext.description}</p>
                    <div style={{ display: "flex", gap: "0.5rem" }}>
                      <button onClick={() => handleInstallSingle(ext)} style={{ flex: 1, padding: "0.5rem", backgroundColor: "var(--primary)", border: "none", borderRadius: "4px", color: "var(--background)", cursor: "pointer" }}>Install</button>
                      <button onClick={() => handleInstallAll(ext)} style={{ flex: 1, padding: "0.5rem", backgroundColor: "var(--secondary)", border: "1px solid var(--border)", borderRadius: "4px", color: "var(--foreground)", cursor: "pointer", fontSize: "0.8rem" }}>Install All</button>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </div>
        ) : (
          <div style={{ whiteSpace: "pre-wrap" }}>
            {output || "No output yet. Start chatting!"}
          </div>
        )}
      </main>

      {!showExtensions && (
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
      )}
      {installingAll && (
        <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }}>
          <div style={{ padding: "2rem", background: "var(--secondary)", borderRadius: "8px" }}>Installing on all hosts... Please wait.</div>
        </div>
      )}
    </div>
  );
}
