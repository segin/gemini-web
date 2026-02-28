import { NextResponse } from "next/server";
import { spawn } from "child_process";
import fs from 'fs';
import path from 'path';

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
      targetNode = parts.slice(0, -1).join(':');
      sessionId = parts[parts.length - 1];
    } else if (isLocal) {
      sessionId = session.replace('local:', '');
    }

    if (targetNode) {
      // Forward request to remote node as stream
      const remoteRes = await fetch(`${targetNode}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session: `local:${sessionId}`, text, audio }),
        // @ts-ignore
        duplex: 'half'
      });
      return new Response(remoteRes.body, {
        headers: { 'Content-Type': 'text/plain' }
      });
    }

    // Local execution
    const sessions = getSessions();
    const cwd = sessions[sessionId] || process.cwd();

    let args = ['-p'];
    const resumeFlag = "--resume";
    const resumeValue = "latest";
    const outputFormatFlag = "-o";
    const outputFormatValue = "stream-json";
    const modelFlag = "-m";
    const modelValue = "auto-gemini-3";

    if (text) {
      args.push(text, resumeFlag, resumeValue, outputFormatFlag, outputFormatValue, modelFlag, modelValue);
    } else if (audio) {
      const audioBuffer = Buffer.from(audio.split(',')[1], 'base64');
      const audioPath = path.join(cwd, `input_${Date.now()}.webm`);
      fs.writeFileSync(audioPath, audioBuffer);
      args.push(`Process the attached audio file: ${audioPath}`, resumeFlag, resumeValue, outputFormatFlag, outputFormatValue, modelFlag, modelValue);
    } else {
      return NextResponse.json({ error: "No input provided" }, { status: 400 });
    }

    const proc = spawn('gemini', args, { cwd, env: { ...process.env } });
    
    const stream = new ReadableStream({
      start(controller) {
        let stdoutData = "";
        let stderrData = "";
        let fallbackTriggered = false;

        proc.stdout.on('data', (chunk) => {
          stdoutData += chunk.toString();
          controller.enqueue(chunk);
        });

        proc.stderr.on('data', (chunk) => {
          stderrData += chunk.toString();
          controller.enqueue(chunk);
        });

        proc.on('close', (code) => {
          if (code !== 0 && (stderrData.includes('latest') || stderrData.includes('No session found') || stderrData.includes('ENOENT'))) {
             // try fallback without --resume latest
             fallbackTriggered = true;
             const fallbackArgs = args.filter(a => a !== resumeFlag && a !== resumeValue);
             const proc2 = spawn('gemini', fallbackArgs, { cwd, env: { ...process.env, FORCE_COLOR: '1' } });
             
             proc2.stdout.on('data', (c) => controller.enqueue(c));
             proc2.stderr.on('data', (c) => controller.enqueue(c));
             proc2.on('close', () => controller.close());
             proc2.on('error', (err) => {
                controller.enqueue(Buffer.from(`\nError: ${err.message}`));
                controller.close();
             });
             
             req.signal.addEventListener('abort', () => proc2.kill());
          } else if (!fallbackTriggered) {
             controller.close();
          }
        });

        proc.on('error', (err) => {
          controller.enqueue(Buffer.from(`\nError: ${err.message}`));
          controller.close();
        });

        req.signal.addEventListener('abort', () => {
          proc.kill();
        });
      },
      cancel() {
        proc.kill();
      }
    });

    return new Response(stream, {
      headers: { 'Content-Type': 'text/plain' }
    });

  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Unknown error" }, { status: 500 });
  }
}
