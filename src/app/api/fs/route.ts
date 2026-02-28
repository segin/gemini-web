import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  // Default to the user's home directory, or root if not available
  let dirPath = searchParams.get("dir") || process.env.HOME || "/data/data/com.termux/files/home";

  try {
    const items = fs.readdirSync(dirPath, { withFileTypes: true });
    const directories = items
      .filter(item => item.isDirectory())
      .map(item => item.name)
      .sort();

    // Determine parent directory
    const parentDir = path.dirname(dirPath);
    const hasParent = parentDir !== dirPath;

    return NextResponse.json({ path: dirPath, directories, parentDir, hasParent });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
