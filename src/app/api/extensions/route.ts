import { NextResponse } from "next/server";
import { exec } from "child_process";
import util from "util";
import fs from "fs";
import path from "path";

const execPromise = util.promisify(exec);
const AVAILABLE_EXT_FILE = path.join(process.cwd(), "available_extensions.json");

function getAvailableExtensions() {
  if (fs.existsSync(AVAILABLE_EXT_FILE)) {
    return JSON.parse(fs.readFileSync(AVAILABLE_EXT_FILE, "utf-8"));
  }
  return [];
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const type = searchParams.get("type"); // available or installed
  const host = searchParams.get("host");

  if (type === "available") {
    return NextResponse.json({ extensions: getAvailableExtensions() });
  }

  if (type === "installed") {
    if (host && host !== "local") {
      // Forward to remote host
      const res = await fetch(`${host}/api/extensions?type=installed&host=local`);
      const data = await res.json();
      return NextResponse.json(data);
    }

    // Local installed list
    try {
      const { stdout } = await execPromise("gemini extensions list");
      // Basic parsing of output, assuming it's a list
      const installed = stdout.split("
").filter(line => line.trim().length > 0);
      return NextResponse.json({ extensions: installed });
    } catch (err: any) {
      return NextResponse.json({ error: err.message }, { status: 500 });
    }
  }

  return NextResponse.json({ error: "Invalid type" }, { status: 400 });
}

export async function POST(req: Request) {
  const { action, host, extensionUrl, extensionName } = await req.json();

  if (host && host !== "local") {
    // Forward to remote
    const res = await fetch(`${host}/api/extensions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, host: "local", extensionUrl, extensionName }),
    });
    const data = await res.json();
    return NextResponse.json(data);
  }

  try {
    let command = "";
    if (action === "install") {
      command = `gemini extensions install "${extensionUrl}"`;
    } else if (action === "uninstall") {
      command = `gemini extensions uninstall "${extensionName}"`;
    } else {
      return NextResponse.json({ error: "Invalid action" }, { status: 400 });
    }

    const { stdout, stderr } = await execPromise(command);
    return NextResponse.json({ success: true, response: stdout || stderr });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
