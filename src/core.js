'use strict';

const os = require('os');
const net = require('net');

function getBackend() {
  switch (process.platform) {
    case 'linux':
      return require('./platforms/linux');
    case 'darwin':
      return require('./platforms/darwin');
    case 'win32':
      return require('./platforms/win32');
    default:
      throw new Error(`Unsupported platform: ${process.platform}`);
  }
}

/**
 * List ports in use, optionally filtered by protocol and/or exact port number.
 */
function listPorts({ proto, port } = {}) {
  const backend = getBackend();
  let rows = backend.listPorts();

  if (proto) {
    rows = rows.filter((r) => r.proto === proto.toLowerCase());
  }
  if (port !== undefined && port !== null) {
    rows = rows.filter((r) => r.port === Number(port));
  }

  // De-duplicate identical rows (can happen with dual-stack sockets) and sort by port
  const seen = new Set();
  const deduped = [];
  for (const r of rows) {
    const key = `${r.port}-${r.proto}-${r.pid}-${r.status}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(r);
  }
  deduped.sort((a, b) => a.port - b.port);
  return deduped;
}

/** Distinct PIDs bound to a given port. */
function findPidsOnPort(port, proto) {
  const rows = listPorts({ port, proto });
  const pids = new Set();
  for (const r of rows) {
    if (r.pid) pids.add(r.pid);
  }
  return [...pids];
}

function findProcesses({ name, rows = listPorts() } = {}) {
  const lookup = String(name || '').trim().toLowerCase();
  if (!lookup) return rows;
  return rows.filter((row) => {
    const processName = String(row.processName || '').toLowerCase();
    const localAddr = String(row.localAddr || '').toLowerCase();
    const pidText = String(row.pid || '');
    return processName.includes(lookup) || localAddr.includes(lookup) || pidText.includes(lookup);
  });
}

function fixPort(port, { proto, force = false } = {}) {
  const pids = findPidsOnPort(port, proto);
  if (pids.length === 0) {
    return {
      success: false,
      pids: [],
      rows: listPorts({ port, proto }),
      message: `Nothing found listening on port ${port}.`,
    };
  }

  const rows = listPorts({ port, proto });
  const results = [];
  for (const pid of pids) {
    const result = killPid(pid, { force });
    results.push({ pid, ...result });
  }

  return {
    success: results.every((result) => result.success),
    pids,
    rows,
    results,
    message: `Attempted to clear port ${port}.`,
  };
}

function reservePort(port, { host = '127.0.0.1' } = {}) {
  return new Promise((resolve, reject) => {
    const server = net.createServer();

    server.once('error', (error) => {
      reject(error);
    });

    server.listen(port, host, () => {
      const stop = () => new Promise((resolveStop, rejectStop) => {
        server.close((error) => {
          if (error) return rejectStop(error);
          resolveStop();
        });
      });

      resolve({
        port,
        host,
        server,
        stop,
      });
    });
  });
}

/**
 * Kill a process by PID. Returns { success, message }.
 * On POSIX, tries SIGTERM first (unless force), then SIGKILL.
 * On Windows, process.kill() always terminates unconditionally.
 */
function killPid(pid, { force = false } = {}) {
  try {
    process.kill(pid, 0); // check the process exists / we have permission to signal it
  } catch (e) {
    if (e.code === 'ESRCH') return { success: false, message: `No process with PID ${pid}` };
    if (e.code === 'EPERM') return { success: false, message: `Permission denied signaling PID ${pid} (try sudo/admin)` };
    return { success: false, message: `Could not inspect PID ${pid}: ${e.message}` };
  }

  const isWindows = os.platform() === 'win32';
  const signal = force || isWindows ? 'SIGKILL' : 'SIGTERM';

  try {
    process.kill(pid, signal);
  } catch (e) {
    return { success: false, message: `Failed to kill PID ${pid}: ${e.message}` };
  }

  if (isWindows) {
    return { success: true, message: `Killed process (PID ${pid})` };
  }

  // On POSIX, give SIGTERM a moment, then escalate to SIGKILL if it's still alive.
  return waitThenEscalate(pid, force);
}

function waitThenEscalate(pid, alreadyForced) {
  const start = Date.now();
  const timeoutMs = 3000;

  while (Date.now() - start < timeoutMs) {
    try {
      process.kill(pid, 0); // still alive
    } catch (e) {
      return { success: true, message: `Killed process (PID ${pid})` };
    }
    // Busy-wait briefly using a synchronous sleep so we don't need extra deps.
    sleepMs(100);
  }

  if (alreadyForced) {
    return { success: false, message: `PID ${pid} did not exit even after SIGKILL` };
  }

  try {
    process.kill(pid, 'SIGKILL');
    sleepMs(200);
    try {
      process.kill(pid, 0);
      return { success: false, message: `PID ${pid} did not exit even after SIGKILL` };
    } catch (e) {
      return { success: true, message: `Force-killed process (PID ${pid}) after timeout` };
    }
  } catch (e) {
    return { success: false, message: `Failed to force-kill PID ${pid}: ${e.message}` };
  }
}

function sleepMs(ms) {
  const sab = new Int32Array(new SharedArrayBuffer(4));
  Atomics.wait(sab, 0, 0, ms);
}

module.exports = { listPorts, findPidsOnPort, findProcesses, fixPort, reservePort, killPid };