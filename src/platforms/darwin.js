'use strict';
/**
 * macOS backend: shells out to lsof, which ships with macOS by default.
 */
const { execFileSync } = require('child_process');

function listPorts() {
  let output;
  try {
    output = execFileSync(
      'lsof',
      ['-nP', '-iTCP', '-iUDP', '-sTCP:LISTEN', '-a', '+c', '0'],
      { encoding: 'utf8', maxBuffer: 1024 * 1024 * 10 }
    );
  } catch (e) {
    // lsof exits non-zero if there are simply no matches - treat stdout as the result anyway
    output = e.stdout ? e.stdout.toString() : '';
  }

  const lines = output.split('\n').filter(Boolean);
  if (lines.length <= 1) return [];

  const rows = [];
  for (const line of lines.slice(1)) {
    const fields = line.trim().split(/\s+/);
    // COMMAND PID USER FD TYPE DEVICE SIZE/OFF NODE NAME
    if (fields.length < 9) continue;
    const [command, pid, user, , , , , protoNode, name] = fields;

    const proto = protoNode.toLowerCase().includes('udp') ? 'udp' : 'tcp';
    const match = name.match(/:(\d+)(\s|$|->)/) || name.match(/:(\d+)$/);
    if (!match) continue;
    const port = parseInt(match[1], 10);
    const status = name.includes('(LISTEN)') ? 'LISTEN' : '-';

    rows.push({
      port,
      proto,
      status,
      localAddr: name.replace(' (LISTEN)', ''),
      pid: parseInt(pid, 10),
      processName: command,
      user,
    });
  }
  return rows;
}

module.exports = { listPorts };