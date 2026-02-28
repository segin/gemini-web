import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

export async function GET() {
  const rootDir = process.env.HOME || "/data/data/com.termux/files/home";
  const detected: string[] = [];

  function scan(dir: string, depth = 0) {
    if (depth > 2) return; // limit depth
    try {
      const files = fs.readdirSync(dir);
      if (files.includes(".gemini")) {
        detected.push(dir);
      }
      files.forEach(f => {
        const full = path.join(dir, f);
        if (fs.statSync(full).isDirectory() && !f.startsWith(".") && f !== "node_modules") {
          scan(full, depth + 1);
        }
      });
    } catch (e) {}
  }

  scan(rootDir);
  return NextResponse.json({ detected });
}
