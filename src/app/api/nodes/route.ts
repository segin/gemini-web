import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

const NODES_FILE = path.join(process.cwd(), 'nodes.json');

function getNodes() {
  if (fs.existsSync(NODES_FILE)) {
    return JSON.parse(fs.readFileSync(NODES_FILE, 'utf-8'));
  }
  return [];
}

function saveNodes(nodes: string[]) {
  fs.writeFileSync(NODES_FILE, JSON.stringify(nodes, null, 2));
}

export async function GET() {
  const nodes = getNodes();
  return NextResponse.json({ nodes });
}

export async function POST(req: Request) {
  try {
    const { url } = await req.json();
    if (!url) {
      return NextResponse.json({ error: "URL is required" }, { status: 400 });
    }
    const nodes = getNodes();
    if (!nodes.includes(url)) {
      nodes.push(url);
      saveNodes(nodes);
    }
    return NextResponse.json({ success: true, nodes });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
