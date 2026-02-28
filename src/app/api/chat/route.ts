import { NextResponse } from "next/server";
import { exec } from "child_process";
import util from "util";
import fs from 'fs';
import path from 'path';

const execPromise = util.promisify(exec);
const SESSION_FILE = path.join(process.cwd(), 'sessions.json');

function getSessions() {
  if (fs.existsSync(SESSION_FILE)) {
    return JSON.parse(fs.readFileSync(SESSION_FILE, 'utf-8'));
  }
  return {};
}

export async function POST(req: Request) {
  try {
    const { session, text, audio } = await req.json();
    
    // Parse session
    let isLocal = session.startsWith('local:');
    let targetNode = '';
    let sessionId = session;

    if (session.includes(':') && !isLocal) {
      const parts = session.split(':');
      // Reconstruct URL (e.g., https://example.com:id)
      targetNode = parts.slice(0, -1).join(':');
      sessionId = parts[parts.length - 1];
    } else if (isLocal) {
      sessionId = session.replace('local:', '');
    }

    if (targetNode) {
      // Forward request to remote node
      const remoteRes = await fetch(`${targetNode}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session: `local:${sessionId}`, text, audio })
      });
      const data = await remoteRes.json();
      return NextResponse.json(data);
    }

    // Local execution
    const sessions = getSessions();
    const cwd = sessions[sessionId] || process.cwd();

    let inputCommand = "";
    if (text) {
      inputCommand = `gemini "${text.replace(/"/g, '\\"')}"`;
    } else if (audio) {
      inputCommand = `gemini "Process this audio input"`; 
    }

    if (!inputCommand) {
      return NextResponse.json({ error: "No input provided" }, { status: 400 });
    }

    const { stdout, stderr } = await execPromise(inputCommand, { cwd });
    
    return NextResponse.json({ response: stdout || stderr });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Unknown error" }, { status: 500 });
  }
}
