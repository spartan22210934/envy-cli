'use strict';
/**
 * Windows backend: shells out to netstat (port -> pid) and tasklist (pid -> name).
 */
const { execFileSync } = require('child_process');

function getPidNameMap() {
  const map = new Map();
  try {
    const output = execFileSync('tasklist', ['/FO', 'CSV', '/NH'], { encoding: 'utf8' });
    for (const line of output.split('\n')) {
      if (!line.trim()) continue;
      // CSV format: "name","pid","session","session#","mem"
      const fields = line.split('","').map((f) => f.replace(/(^"|"$)/g, ''));
      if (fields.length >= 2) {
        map.set(fields[1], fields[0]);
      }
    }
  } catch (e) {
    // tasklist failing shouldn't block port listing - names just show as unknown
  }
  return map;
}

function listPorts() {
  let output;
  try {
    output = execFileSync('netstat', ['-ano'], { encoding: 'utf8', maxBuffer: 1024 * 1024 * 10 });
  } catch (e) {
    output = e.stdout ? e.stdout.toString() : '';
  }

  const pidNameMap = getPidNameMap();
  const lines = output.split('\n');
  const rows = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || (!trimmed.startsWith('TCP') && !trimmed.startsWith('UDP'))) continue;

    const fields = trimmed.split(/\s+/);
    // TCP  local_addr  foreign_addr  state  pid   (UDP has no state column)
    const proto = fields[0].toLowerCase();
    const localAddr = fields[1];
    let state, pid;
    if (proto === 'tcp') {
      state = fields[3];
      pid = fields[4];
    } else {
      state = '-';
      pid = fields[3];
    }

    const portMatch = localAddr.match(/:(\d+)$/);
    if (!portMatch) continue;
    const port = parseInt(portMatch[1], 10);
    const pidNum = parseInt(pid, 10) || null;

    rows.push({
      port,
      proto,
      status: state,
      localAddr,
      pid: pidNum,
      processName: pidNum ? pidNameMap.get(String(pidNum)) || '?' : '-',
      user: '-', // tasklist doesn't expose owner without extra WMI calls
    });
  }
  return rows;
}

module.exports = { listPorts };