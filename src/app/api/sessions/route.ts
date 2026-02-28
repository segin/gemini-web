import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

const SESSION_FILE = path.join(process.cwd(), 'sessions.json');
const NODES_FILE = path.join(process.cwd(), 'nodes.json');

function getSessions() {
  if (fs.existsSync(SESSION_FILE)) {
    return JSON.parse(fs.readFileSync(SESSION_FILE, 'utf-8'));
  }
  return {};
}

function saveSessions(sessions: any) {
  fs.writeFileSync(SESSION_FILE, JSON.stringify(sessions, null, 2));
}

function getNodes() {
  if (fs.existsSync(NODES_FILE)) {
    return JSON.parse(fs.readFileSync(NODES_FILE, 'utf-8'));
  }
  return [];
}

export async function GET() {
  const localSessions = getSessions();
  const sessions = Object.keys(localSessions).map(id => `local:${id}`);
  
  const nodes = getNodes();
  for (const node of nodes) {
    try {
      // we append ?local=true to avoid infinite loops
      const res = await fetch(`${node}/api/sessions?local=true`);
      if (res.ok) {
        const data = await res.json();
        data.sessions.forEach((id: string) => sessions.push(`${node}:${id}`));
      }
    } catch (e) {
      console.error(`Failed to fetch from node ${node}`);
    }
  }

  return NextResponse.json({ sessions });
}

export async function POST(req: Request) {
  try {
    const { directory } = await req.json();
    if (!directory) {
      return NextResponse.json({ error: "Directory is required" }, { status: 400 });
    }
    const sessionName = directory.split('/').pop() || 'root';
    const id = `${sessionName}-${Date.now()}`;
    const sessions = getSessions();
    sessions[id] = directory;
    saveSessions(sessions);
    return NextResponse.json({ success: true, id, directory });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
