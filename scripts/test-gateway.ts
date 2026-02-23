/**
 * Quick test: connect to OpenClaw Gateway and send a chat message.
 *
 * Usage:  npx tsx scripts/test-gateway.ts [message]
 *
 * Reads OPENCLAW_GATEWAY_WS_URL (default ws://localhost:18789)
 * and OPENCLAW_GATEWAY_TOKEN from .env
 */
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

import WebSocket from 'ws';
import crypto from 'crypto';

const WS_URL = process.env.OPENCLAW_GATEWAY_WS_URL ?? 'ws://localhost:18789';
const TOKEN = process.env.OPENCLAW_GATEWAY_TOKEN ?? '';
const MESSAGE = process.argv.slice(2).join(' ') || 'Hello from test script';
const SESSION_KEY = `test:${Date.now()}`;
const TIMEOUT_MS = 30_000;

if (!TOKEN) {
  console.error('ERROR: OPENCLAW_GATEWAY_TOKEN not set in .env');
  process.exit(1);
}

console.log(`Connecting to ${WS_URL} ...`);

const ws = new WebSocket(WS_URL);
let connectId: string | null = null;
let chatId: string | null = null;
let done = false;

const timer = setTimeout(() => {
  console.error('TIMEOUT: no response within 30s');
  ws.close();
  process.exit(1);
}, TIMEOUT_MS);

ws.on('open', () => {
  console.log('WebSocket opened, waiting for connect.challenge...');
});

ws.on('message', (raw: Buffer) => {
  const frame = JSON.parse(raw.toString());

  // --- Handshake ---
  if (frame.type === 'event' && frame.event === 'connect.challenge') {
    connectId = crypto.randomUUID();
    console.log('Got connect.challenge, sending connect request...');
    ws.send(JSON.stringify({
      type: 'req',
      id: connectId,
      method: 'connect',
      params: {
        minProtocol: 3,
        maxProtocol: 3,
        client: { id: 'gateway-client', version: '1.0.0', platform: 'linux', mode: 'backend' },
        role: 'operator',
        scopes: ['operator.read', 'operator.write'],
        auth: { token: TOKEN },
      },
    }));
    return;
  }

  // --- Connect response ---
  if (frame.type === 'res' && frame.id === connectId) {
    if (!frame.ok) {
      console.error('Connect FAILED:', frame.error);
      clearTimeout(timer);
      ws.close();
      process.exit(1);
    }
    console.log('Connected! Protocol:', frame.payload?.protocol);
    console.log(`Sending chat.send: "${MESSAGE}" (session: ${SESSION_KEY})`);

    chatId = crypto.randomUUID();
    ws.send(JSON.stringify({
      type: 'req',
      id: chatId,
      method: 'chat.send',
      params: {
        sessionKey: SESSION_KEY,
        message: MESSAGE,
        idempotencyKey: crypto.randomUUID(),
      },
    }));
    return;
  }

  // --- Chat.send RPC response ---
  if (frame.type === 'res' && frame.id === chatId) {
    if (!frame.ok) {
      console.error('chat.send FAILED:', frame.error);
    } else {
      console.log('chat.send accepted by gateway');
    }
    return;
  }

  // --- Chat events (streaming response) ---
  if (frame.type === 'event' && frame.event === 'chat') {
    const ev = frame.payload;
    if (ev?.sessionKey !== SESSION_KEY) return;

    if (ev.state === 'delta') {
      // Extract text from Anthropic-format content blocks
      const msg = ev.message;
      let text = '';
      if (typeof msg === 'string') text = msg;
      else if (msg && Array.isArray(msg.content)) {
        text = msg.content
          .filter((b: { type?: string; text?: string }) => b.type === 'text')
          .map((b: { text?: string }) => b.text)
          .join('');
      }
      if (text) {
        process.stdout.write('\r\x1b[K');  // clear line
        // Show last 120 chars to keep it readable
        const display = text.length > 120 ? '...' + text.slice(-120) : text;
        process.stdout.write(`Assistant: ${display}`);
      }
    }

    if (ev.state === 'final' || ev.state === 'error' || ev.state === 'aborted') {
      console.log(`\n\n--- ${ev.state.toUpperCase()} ---`);
      if (ev.state === 'error') console.error('Error:', ev.errorMessage);
      if (ev.usage) console.log('Usage:', ev.usage);
      if (ev.model) console.log('Model:', ev.model);
      done = true;
      clearTimeout(timer);
      ws.close();
    }
    return;
  }

  // Log other events (tick, shutdown, etc.)
  if (frame.type === 'event') {
    console.log(`[event: ${frame.event}]`);
  }
});

ws.on('error', (err) => {
  console.error('WebSocket error:', err.message);
  clearTimeout(timer);
  process.exit(1);
});

ws.on('close', (code, reason) => {
  if (!done) {
    console.log(`\nWebSocket closed: ${code} ${reason.toString()}`);
  }
  clearTimeout(timer);
  process.exit(done ? 0 : 1);
});
