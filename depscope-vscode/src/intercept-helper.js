#!/usr/bin/env node
/**
 * DepScope Intercept Helper
 *
 * Called by depscope-wrapper.sh when the user runs a package-manager install command.
 * Connects to the VS Code extension's TCP server, sends an intercept request, and
 * exits with 0 (proceed) or 1 (cancel) based on the extension's response.
 *
 * Usage:
 *   node intercept-helper.js <port> <package-name> <ecosystem>
 *
 * Environment:
 *   DEPSCOPE_PORT must match the <port> argument (set by InstallInterceptor).
 */

'use strict';

const net  = require('net');

const port      = parseInt(process.argv[2], 10);
const pkgName   = process.argv[3] || '';
const ecosystem = process.argv[4] || 'npm';

// Bail out without blocking if invocation is malformed
if (!port || !pkgName) process.exit(0);

const payload = JSON.stringify({ cmd: 'intercept', package: pkgName, ecosystem }) + '\n';

const client = net.createConnection({ port, host: '127.0.0.1' }, () => {
    client.write(payload);
    // Half-close our write side so the server's 'end' event fires immediately.
    // The connection stays open for reading — server can still send the response.
    client.end();
});

let data = '';

client.on('data', chunk => { data += chunk.toString(); });

client.on('end', () => {
    try {
        const res = JSON.parse(data.trim());
        process.exit(res.proceed === false ? 1 : 0);
    } catch {
        process.exit(0); // Parse error — don't block
    }
});

client.on('error', () => {
    // Extension not reachable — don't block the install
    process.exit(0);
});

// Hard safety timeout: never block a terminal indefinitely
setTimeout(() => process.exit(0), 30_000).unref();
