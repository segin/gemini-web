const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { spawn } = require('cross-spawn');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

const activeProcesses = new Map();

io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);

  socket.on('start-session', ({ sessionId, cwd, prompt }) => {
    if (activeProcesses.has(sessionId)) {
      activeProcesses.get(sessionId).kill();
    }

    const args = [];
    if (prompt) {
      args.push('-i', prompt);
    }
    // We use --output-format stream-json if supported, 
    // but standard interactive mode is better for "same experience as terminal"
    // Let's use standard for now and parse text.
    
    const proc = spawn('gemini', args, {
      cwd: cwd || process.cwd(),
      env: { ...process.env, FORCE_COLOR: '1' },
      stdio: ['pipe', 'pipe', 'pipe']
    });

    activeProcesses.set(sessionId, proc);

    proc.stdout.on('data', (data) => {
      socket.emit('output', { sessionId, data: data.toString() });
    });

    proc.stderr.on('data', (data) => {
      socket.emit('output', { sessionId, data: data.toString(), type: 'stderr' });
    });

    proc.on('close', (code) => {
      socket.emit('session-closed', { sessionId, code });
      activeProcesses.delete(sessionId);
    });

    socket.on('input', ({ data }) => {
      if (activeProcesses.has(sessionId)) {
        activeProcesses.get(sessionId).stdin.write(data);
      }
    });

    socket.on('kill-session', () => {
      if (activeProcesses.has(sessionId)) {
        activeProcesses.get(sessionId).kill();
        activeProcesses.delete(sessionId);
      }
    });
  });

  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
  });
});

const PORT = 3046;
server.listen(PORT, () => {
  console.log(`Gemini PTY Service running on port ${PORT}`);
});
