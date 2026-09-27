'use strict';
/**
 * Linux backend: reads directly from /proc, so it works even on minimal
 * systems that don't have lsof/ss/netstat installed.
 */
const fs = require('fs');

const TCP_STATES = {
  '01': 'ESTABLISHED',
  '02': 'SYN_SENT',
  '03': 'SYN_RECV',
  '04': 'FIN_WAIT1',
  '05': 'FIN_WAIT2',
  '06': 'TIME_WAIT',
  '07': 'CLOSE',
  '08': 'CLOSE_WAIT',
  '09': 'LAST_ACK',
  '0A': 'LISTEN',
  '0B': 'CLOSING',
};

function hexToPort(hexPort) {
  return parseInt(hexPort, 16);
}

function hexIpToString(hexIp) {
  // /proc/net/tcp stores IPv4 addresses as little-endian hex, e.g. "0100007F" -> 127.0.0.1
  if (hexIp.length === 8) {
    const bytes = [];
    for (let i = 6; i >= 0; i -= 2) {
      bytes.push(parseInt(hexIp.substr(i, 2), 16));
    }
    return bytes.join('.');
  }
  // IPv6 (32 hex chars) - just mark it, detailed formatting isn't needed for our table
  return '[ipv6]';
}

function readProcNetFile(path, proto) {
  if (!fs.existsSync(path)) return [];
  const lines = fs.readFileSync(path, 'utf8').split('\n').slice(1); // skip header
  const rows = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const fields = trimmed.split(/\s+/);
    // fields[1] = local_address (IP:PORT hex), fields[3] = state, fields[9] = inode
    const [localIpHex, localPortHex] = fields[1].split(':');
    const stateHex = fields[3];
    const inode = fields[9];

    if (inode === '0') continue; // unused socket slot

    rows.push({
      proto,
      localIp: hexIpToString(localIpHex),
      port: hexToPort(localPortHex),
      status: proto === 'tcp' ? (TCP_STATES[stateHex] || stateHex) : '-',
      inode,
    });
  }
  return rows;
}

/** Build a map of socket inode -> pid by scanning /proc/[pid]/fd symlinks. */
function buildInodeToPidMap() {
  const map = new Map();
  let pids;
  try {
    pids = fs.readdirSync('/proc').filter((p) => /^\d+$/.test(p));
  } catch (e) {
    return map;
  }

  for (const pid of pids) {
    let fds;
    try {
      fds = fs.readdirSync(`/proc/${pid}/fd`);
    } catch (e) {
      continue; // no permission (not our process) or process exited - skip silently
    }
    for (const fd of fds) {
      let link;
      try {
        link = fs.readlinkSync(`/proc/${pid}/fd/${fd}`);
      } catch (e) {
        continue;
      }
      const match = link.match(/^socket:\[(\d+)\]$/);
      if (match) {
        map.set(match[1], parseInt(pid, 10));
      }
    }
  }
  return map;
}

/** Parse /etc/passwd once to resolve uid -> username without shelling out. */
let passwdCache = null;
function uidToUsername(uid) {
  if (passwdCache === null) {
    passwdCache = new Map();
    try {
      const content = fs.readFileSync('/etc/passwd', 'utf8');
      for (const line of content.split('\n')) {
        const parts = line.split(':');
        if (parts.length >= 3) {
          passwdCache.set(parts[2], parts[0]);
        }
      }
    } catch (e) {
      // ignore, will fall back to raw uid
    }
  }
  return passwdCache.get(String(uid)) || String(uid);
}

function getProcessInfo(pid) {
  try {
    const name = fs.readFileSync(`/proc/${pid}/comm`, 'utf8').trim();
    const status = fs.readFileSync(`/proc/${pid}/status`, 'utf8');
    const uidLine = status.split('\n').find((l) => l.startsWith('Uid:'));
    const uid = uidLine ? uidLine.split(/\s+/)[1] : null;
    return { name, user: uid !== null ? uidToUsername(uid) : '?' };
  } catch (e) {
    return { name: '?', user: '?' };
  }
}

/**
 * Returns an array of { port, proto, status, localAddr, pid, processName, user }
 */
function listPorts() {
  const inodeToPid = buildInodeToPidMap();
  const raw = [
    ...readProcNetFile('/proc/net/tcp', 'tcp'),
    ...readProcNetFile('/proc/net/tcp6', 'tcp'),
    ...readProcNetFile('/proc/net/udp', 'udp'),
    ...readProcNetFile('/proc/net/udp6', 'udp'),
  ];

  return raw.map((row) => {
    const pid = inodeToPid.get(row.inode) || null;
    const { name, user } = pid ? getProcessInfo(pid) : { name: '-', user: '-' };
    return {
      port: row.port,
      proto: row.proto,
      status: row.status,
      localAddr: `${row.localIp}:${row.port}`,
      pid,
      processName: name,
      user,
    };
  });
}

module.exports = { listPorts };