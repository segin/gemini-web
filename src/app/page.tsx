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
  const [isProcessing, setIsProcessing] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);

  // Extension management state
  const [availableExtensions, setAvailableExtensions] = useState<Extension[]>([]);
  const [installedExtensions, setInstalledExtensions] = useState<string[]>([]);
  const [extensionHost, setExtensionHost] = useState<string>("local");
  const [showExtensions, setShowExtensions] = useState(false);
  const [nodes, setNodes] = useState<string[]>([]);
  const [installingAll, setInstallingAll] = useState(false);
  const [showTerminal, setShowTerminal] = useState(false);

  // UI State: Toasts & Modals
  const [toasts, setToasts] = useState<{id: number, message: string, type: 'success' | 'error' | 'info'}[]>([]);
  const [confirmDialog, setConfirmDialog] = useState<{message: string, onConfirm: () => void, onCancel: () => void} | null>(null);
  const [promptDialog, setPromptDialog] = useState<{message: string, placeholder: string, onSubmit: (val: string) => void, onCancel: () => void} | null>(null);
  const [promptInput, setPromptInput] = useState("");

  // Directory Browser State
  const [showDirBrowser, setShowDirBrowser] = useState(false);
  const [dirData, setDirData] = useState<{path: string, directories: string[], parentDir: string, hasParent: boolean} | null>(null);

  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'info') => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 3000);
  };

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
        showToast(`Detected and added ${data.detected.length} projects.`, 'success');
      } else {
        showToast("No existing Gemini projects found in home directory.", 'info');
      }
    } catch (e) {
      console.error(e);
      showToast("Failed to scan for projects.", 'error');
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
      showToast("Microphone access denied or failed.", 'error');
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
    setIsProcessing(true);
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
      showToast("Failed to process audio", 'error');
    } finally {
      setIsProcessing(false);
    }
  };

  const sendText = async () => {
    if (!input.trim() || !selectedSession || isProcessing) return;
    const currentInput = input;
    setInput("");
    setOutput((prev) => prev + "\n> " + currentInput);
    setIsProcessing(true);
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
      showToast("Failed to send message", 'error');
    } finally {
      setIsProcessing(false);
    }
  };

  const fetchDir = async (path?: string) => {
    try {
      const url = path ? `/api/fs?dir=${encodeURIComponent(path)}` : "/api/fs";
      const res = await fetch(url);
      const data = await res.json();
      if (data.error) {
        showToast(data.error, 'error');
      } else {
        setDirData(data);
      }
    } catch (e) {
      showToast("Failed to fetch directory contents.", 'error');
    }
  };

  const createSession = () => {
    fetchDir();
    setShowDirBrowser(true);
  };

  const handleSelectDirectory = async (dir: string) => {
    setShowDirBrowser(false);
    if (!dir) return;
    try {
      await fetch("/api/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ directory: dir }),
      });
      fetchSessions();
      showToast(`Session created for ${dir}`, 'success');
    } catch (e) {
      console.error(e);
      showToast("Failed to create session", 'error');
    }
  };

  const linkNode = () => {
    setPromptDialog({
      message: "Enter the URL of another Gemini Web Node:",
      placeholder: "http://192.168.1.10:3045",
      onSubmit: async (url) => {
        setPromptDialog(null);
        if (!url) return;
        try {
          await fetch("/api/nodes", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ url }),
          });
          fetchNodes();
          fetchSessions();
          showToast("Node linked successfully!", 'success');
        } catch (e) {
          console.error(e);
          showToast("Failed to link node.", 'error');
        }
      },
      onCancel: () => setPromptDialog(null)
    });
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

  const handleInstallSingle = (ext: Extension) => {
    setConfirmDialog({
      message: `Are you sure you want to install ${ext.name}?`,
      onConfirm: async () => {
        setConfirmDialog(null);
        const data = await installExtension(ext);
        if (data.success) {
          showToast(`${ext.name} installed successfully!`, 'success');
          fetchInstalledExtensions(extensionHost);
        } else {
          showToast(`Failed to install: ${data.error || "Unknown error"}`, 'error');
        }
      },
      onCancel: () => setConfirmDialog(null)
    });
  };

  const handleInstallAll = (ext: Extension) => {
    setConfirmDialog({
      message: `Install ${ext.name} on all nodes (local + ${nodes.length} nodes)?`,
      onConfirm: async () => {
        setConfirmDialog(null);
        setInstallingAll(true);
        const results = [];
        
        results.push(await installExtension(ext, "local"));
        
        for (const node of nodes) {
          results.push(await installExtension(ext, node));
        }
        
        setInstallingAll(false);
        const successes = results.filter(r => r.success).length;
        showToast(`Installed on ${successes}/${results.length} nodes.`, 'success');
        fetchInstalledExtensions(extensionHost);
      },
      onCancel: () => setConfirmDialog(null)
    });
  };

  const uninstallExtension = (name: string) => {
    setConfirmDialog({
      message: `Are you sure you want to uninstall ${name}?`,
      onConfirm: async () => {
        setConfirmDialog(null);
        try {
          const res = await fetch("/api/extensions", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "uninstall", host: extensionHost, extensionName: name }),
          });
          const data = await res.json();
          if (data.success) {
            showToast(`${name} uninstalled successfully!`, 'success');
            fetchInstalledExtensions(extensionHost);
          } else {
            showToast(`Failed to uninstall: ${data.error || "Unknown error"}`, 'error');
          }
        } catch (e) {
          console.error(e);
          showToast("Network error during uninstall.", 'error');
        }
      },
      onCancel: () => setConfirmDialog(null)
    });
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
              {availableExtensions.map((ext, index) => (
                <div key={`${ext.id}-${index}`} className="ext-card">
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
            {isProcessing && (
              <div className="loading-indicator">
                <div className="spinner"></div>
                Gemini is processing...
              </div>
            )}
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
            placeholder={isProcessing ? "Wait for response..." : "Message Gemini..."}
            disabled={isProcessing}
          />
          <button className="btn btn-primary" onClick={sendText} disabled={isProcessing}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/></svg>
            <span className="hidden-mobile">Send</span>
          </button>
          <button
            className={`btn ${isRecording ? "btn-danger recording-active" : "btn-secondary"}`}
            onClick={isRecording ? handleStopRecording : handleStartRecording}
            disabled={isProcessing}
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

      {/* Custom Confirmation Modal */}
      {confirmDialog && (
        <div className="overlay" style={{ zIndex: 60 }}>
          <div className="modal">
            <h3 className="modal-title">Confirm Action</h3>
            <p className="modal-desc">{confirmDialog.message}</p>
            <div className="modal-actions">
              <button className="btn btn-secondary" onClick={confirmDialog.onCancel}>Cancel</button>
              <button className="btn btn-primary" onClick={confirmDialog.onConfirm}>Confirm</button>
            </div>
          </div>
        </div>
      )}

      {/* Custom Prompt Modal */}
      {promptDialog && (
        <div className="overlay" style={{ zIndex: 60 }}>
          <div className="modal">
            <h3 className="modal-title">Input Required</h3>
            <p className="modal-desc" style={{ marginBottom: '1rem' }}>{promptDialog.message}</p>
            <input 
              type="text" 
              className="input-field" 
              style={{ marginBottom: '1.5rem', textAlign: 'center' }}
              placeholder={promptDialog.placeholder}
              value={promptInput}
              onChange={(e) => setPromptInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && promptDialog.onSubmit(promptInput)}
              autoFocus
            />
            <div className="modal-actions">
              <button className="btn btn-secondary" onClick={() => { setPromptInput(""); promptDialog.onCancel(); }}>Cancel</button>
              <button className="btn btn-primary" onClick={() => { promptDialog.onSubmit(promptInput); setPromptInput(""); }}>Submit</button>
            </div>
          </div>
        </div>
      )}

      {/* Directory Browser Modal */}
      {showDirBrowser && dirData && (
        <div className="overlay" style={{ zIndex: 60 }}>
          <div className="modal" style={{ maxWidth: '500px', display: 'flex', flexDirection: 'column', height: '80vh' }}>
            <h3 className="modal-title" style={{ textAlign: 'left' }}>Select Project Directory</h3>
            <div className="dir-current-path">{dirData.path}</div>
            
            <div className="dir-list">
              {dirData.hasParent && (
                <div className="dir-item" onClick={() => fetchDir(dirData.parentDir)}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>
                  <span>.. (Up one level)</span>
                </div>
              )}
              {dirData.directories.map((dir) => (
                <div key={dir} className="dir-item" onClick={() => fetchDir(`${dirData.path}/${dir}`.replace('//', '/'))}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/></svg>
                  <span>{dir}</span>
                </div>
              ))}
              {dirData.directories.length === 0 && (
                <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-secondary)' }}>No subdirectories found.</div>
              )}
            </div>

            <div className="modal-actions" style={{ marginTop: '1.5rem', justifyContent: 'flex-end' }}>
              <button className="btn btn-secondary" onClick={() => setShowDirBrowser(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={() => handleSelectDirectory(dirData.path)}>Select This Directory</button>
            </div>
          </div>
        </div>
      )}

      {/* Toast Container */}
      <div className="toast-container">
        {toasts.map(toast => (
          <div key={toast.id} className={`toast ${toast.type}`}>
            {toast.type === 'success' && <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>}
            {toast.type === 'error' && <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>}
            {toast.type === 'info' && <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>}
            {toast.message}
          </div>
        ))}
      </div>
      
      <style jsx>{`
        @media (max-width: 600px) {
          .hidden-mobile { display: none; }
        }
      `}</style>
    </div>
  );
}
