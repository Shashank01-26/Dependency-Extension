import { analyze } from './analyzer.js';
import { IpcRequest, IpcResponse } from './types/index.js';
import * as readline from 'readline';

/**
 * Persistent, newline-delimited JSON IPC server.
 *
 * Reads one JSON request per line from stdin, writes one JSON response per
 * line to stdout, then waits for the next request.  The process stays alive
 * until stdin is closed (EOF), which keeps a pre-warmed instance reusable
 * across multiple intercepts.
 *
 * Backwards-compatible: callers that write JSON + close stdin immediately
 * (single-use mode) still work because readline emits the one line before EOF.
 */

async function handleRequest(request: IpcRequest): Promise<IpcResponse> {
  if (request.type === 'ping') {
    return { success: true };
  }
  try {
    const result = await analyze(request);
    return { success: true, result };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

async function main(): Promise<void> {
  const rl = readline.createInterface({
    input: process.stdin,
    crlfDelay: Infinity,
  });

  for await (const line of rl) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    let request: IpcRequest;
    try {
      request = JSON.parse(trimmed);
    } catch {
      const response: IpcResponse = { success: false, error: 'Invalid JSON input' };
      process.stdout.write(JSON.stringify(response) + '\n');
      continue;
    }

    const response = await handleRequest(request);
    process.stdout.write(JSON.stringify(response) + '\n');
  }
}

main().catch(e => {
  const response: IpcResponse = { success: false, error: String(e) };
  process.stdout.write(JSON.stringify(response) + '\n');
  process.exit(1);
});
