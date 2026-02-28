"use client";
import React, { useState, useEffect, useRef } from "react";
import dynamic from "next/dynamic";

const TerminalView = dynamic(() => import("./components/TerminalView"), { ssr: false });

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
  const [showTerminal, setShowTerminal] = useState(false);

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
    
    results.push(await installExtension(ext, "local"));
    
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
    <div className="app-container">
      <header className="app-header">
        <h1 className="app-title">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/></svg>
          Gemini Web
        </h1>
        <div className="app-controls">
          <button className="btn btn-secondary" onClick={() => setShowExtensions(!showExtensions)}>
            {showExtensions ? "← Chat" : "Extensions"}
          </button>
          
          {!showExtensions && (
            <>
              {selectedSession && (
                <button className="btn btn-secondary" onClick={() => setShowTerminal(!showTerminal)}>
                  {showTerminal ? "Chat View" : "Terminal View"}
                </button>
              )}
              <select className="input-field" style={{ width: 'auto' }} value={selectedSession} onChange={(e) => setSelectedSession(e.target.value)}>
                <option value="" disabled>Select session...</option>
                {sessions.map((s) => (
                  <option key={s} value={s}>{s.split('/').pop()} ({s})</option>
                ))}
              </select>
              <button className="btn btn-secondary btn-icon" onClick={createSession} title="New Session">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14"/></svg>
              </button>
              <button className="btn btn-secondary btn-icon" onClick={detectProjects} title="Detect Projects">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
              </button>
            </>
          )}
          <button className="btn btn-secondary btn-icon" onClick={linkNode} title="Link Node">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
          </button>
        </div>
      </header>

      <main className="app-main">
        {showExtensions ? (
          <div>
            <div className="ext-header">
              <h2>Extensions</h2>
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                <span style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>Host:</span>
                <select className="input-field" style={{ width: 'auto' }} value={extensionHost} onChange={(e) => setExtensionHost(e.target.value)}>
                  <option value="local">Local Host</option>
                  {nodes.map(n => <option key={n} value={n}>{n}</option>)}
                </select>
              </div>
            </div>

            {installedExtensions.length > 0 && (
              <>
                <h3 className="ext-section-title">Installed</h3>
                <div className="ext-grid" style={{ marginBottom: '2rem' }}>
                  {installedExtensions.map((ext, idx) => (
                    <div key={idx} className="ext-card" style={{ padding: '1rem', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span style={{ fontWeight: 600 }}>{ext}</span>
                      <button className="btn btn-danger" style={{ padding: '0.4rem 0.8rem' }} onClick={() => uninstallExtension(ext)}>Remove</button>
                    </div>
                  ))}
                </div>
              </>
            )}

            <h3 className="ext-section-title">Gallery (geminicli.com)</h3>
            <div className="ext-grid">
              {availableExtensions.map((ext) => (
                <div key={ext.id} className="ext-card">
                  <div className="ext-card-header">
                    {ext.avatar ? (
                      <img src={ext.avatar} width="40" height="40" className="ext-avatar" alt="" />
                    ) : (
                      <div className="ext-avatar" style={{ width: 40, height: 40 }} />
                    )}
                    <div className="ext-info">
                      <div className="ext-name" title={ext.name}>{ext.name}</div>
                      <div className="ext-fullname" title={ext.fullName}>{ext.fullName}</div>
                    </div>
                  </div>
                  <p className="ext-desc">{ext.description}</p>
                  <div className="ext-actions">
                    <button className="btn btn-primary" onClick={() => handleInstallSingle(ext)}>Install</button>
                    {nodes.length > 0 && (
                      <button className="btn btn-secondary" onClick={() => handleInstallAll(ext)}>All Nodes</button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : showTerminal && selectedSession ? (
          <div className="terminal-container">
            <TerminalView
              sessionId={selectedSession}
              cwd={selectedSession.includes(':') ? '' : selectedSession}
              onClose={() => setShowTerminal(false)}
            />
          </div>
        ) : (
          <div className="chat-container">
            {output || "Session ready. Type a command or use voice to interact with Gemini CLI."}
          </div>
        )}
      </main>

      {!showExtensions && !showTerminal && (
        <footer className="app-footer">
          <input
            className="input-field"
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && sendText()}
            placeholder="Message Gemini..."
          />
          <button className="btn btn-primary" onClick={sendText}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/></svg>
            <span className="hidden-mobile">Send</span>
          </button>
          <button
            className={`btn ${isRecording ? "btn-danger recording-active" : "btn-secondary"}`}
            onClick={isRecording ? handleStopRecording : handleStartRecording}
          >
            {isRecording ? (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="6" height="6" x="9" y="9"/></svg>
            ) : (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" x2="12" y1="19" y2="22"/></svg>
            )}
            <span className="hidden-mobile">{isRecording ? "Stop" : "Voice"}</span>
          </button>
        </footer>
      )}

      {installingAll && (
        <div className="overlay">
          <div className="modal">
            <h3 className="modal-title">Installing...</h3>
            <p className="modal-desc">Deploying extension across all linked nodes.</p>
          </div>
        </div>
      )}
      
      <style jsx>{`
        @media (max-width: 600px) {
          .hidden-mobile { display: none; }
        }
      `}</style>
    </div>
  );
}
