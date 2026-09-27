'use strict';

const http = require('http');
const { spawn } = require('child_process');
const core = require('./core');

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderRows(rows) {
  if (!rows.length) {
    return '<tr><td colspan="7" style="padding: 16px; color: #6b7280;">No ports found.</td></tr>';
  }

  return rows
    .map((row) => {
      const pidValue = row.pid ? String(row.pid) : '-';
      const processName = row.processName || '-';
      const userName = row.user || '-';

      return `
        <tr>
          <td>${escapeHtml(String(row.port))}</td>
          <td>${escapeHtml(row.proto || '-')}</td>
          <td>${escapeHtml(row.status || '-')}</td>
          <td>${escapeHtml(row.localAddr || '-')}</td>
          <td>${escapeHtml(pidValue)}</td>
          <td>${escapeHtml(processName)}</td>
          <td>${escapeHtml(userName)}</td>
          <td>
            <button class="kill-btn" data-port="${escapeHtml(String(row.port))}">Kill</button>
          </td>
        </tr>
      `;
    })
    .join('');
}

function renderHtml(rows) {
  const tableRows = renderRows(rows);

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>envy-cli Desktop</title>
    <style>
      :root {
        --bg: #0f172a;
        --panel: #111827;
        --panel-2: #1f2937;
        --card: #111827;
        --border: #374151;
        --text: #e5e7eb;
        --muted: #94a3b8;
        --accent: #22c55e;
        --accent-2: #38bdf8;
        --danger: #ef4444;
      }

      * { box-sizing: border-box; }
      body {
        margin: 0;
        font-family: Segoe UI, Arial, sans-serif;
        background: linear-gradient(135deg, #020817, #111827 35%, #0f172a);
        color: var(--text);
      }
      .app {
        max-width: 1200px;
        margin: 40px auto;
        padding: 24px;
      }
      .topbar {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 12px;
        margin-bottom: 24px;
      }
      h1 {
        margin: 0;
        font-size: 2rem;
      }
      .badge {
        background: rgba(34, 197, 94, 0.12);
        color: #bbf7d0;
        border: 1px solid rgba(34,197,94,0.4);
        border-radius: 999px;
        padding: 8px 12px;
        font-size: 0.9rem;
      }
      .card {
        background: rgba(17, 24, 39, 0.9);
        border: 1px solid var(--border);
        border-radius: 16px;
        padding: 18px;
        box-shadow: 0 18px 45px rgba(0,0,0,0.25);
      }
      table {
        width: 100%;
        border-collapse: collapse;
        margin-top: 8px;
      }
      th, td {
        text-align: left;
        padding: 12px 10px;
        border-bottom: 1px solid var(--border);
      }
      th {
        color: var(--muted);
        font-weight: 600;
        font-size: 0.82rem;
        letter-spacing: 0.08em;
        text-transform: uppercase;
      }
      tbody tr:hover {
        background: rgba(56, 189, 248, 0.04);
      }
      .kill-btn {
        border: 0;
        border-radius: 8px;
        background: rgba(239, 68, 68, 0.12);
        color: #fecaca;
        padding: 8px 12px;
        cursor: pointer;
        font-weight: 600;
      }
      .kill-btn:hover {
        background: rgba(239, 68, 68, 0.2);
      }
      .status {
        display: inline-flex;
        align-items: center;
        gap: 8px;
      }
      .dot {
        width: 10px;
        height: 10px;
        border-radius: 50%;
        background: var(--accent);
        display: inline-block;
      }
      .muted {
        color: var(--muted);
      }
      @media (max-width: 700px) {
        .app { padding: 12px; }
        th:nth-child(n+5), td:nth-child(n+5) { display: none; }
      }
    </style>
  </head>
  <body>
    <div class="app">
      <div class="topbar">
        <h1>envy-cli</h1>
        <div class="badge"><span class="dot"></span> Port dashboard</div>
      </div>

      <div class="card">
        <div class="status">
          <span class="dot"></span>
          <span class="muted">Live port overview</span>
        </div>

        <table>
          <thead>
            <tr>
              <th>Port</th>
              <th>Proto</th>
              <th>Status</th>
              <th>Local Address</th>
              <th>PID</th>
              <th>Process</th>
              <th>User</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            ${tableRows}
          </tbody>
        </table>
      </div>
    </div>

    <script>
      document.querySelectorAll('.kill-btn').forEach((button) => {
        button.addEventListener('click', async () => {
          const port = button.dataset.port;
          button.disabled = true;
          button.textContent = 'Killing...';
          try {
            const response = await fetch('/kill?port=' + encodeURIComponent(port));
            const data = await response.json();
            if (data.success) {
              button.textContent = 'Killed';
              setTimeout(() => window.location.reload(), 400);
            } else {
              button.textContent = 'Failed';
              setTimeout(() => window.location.reload(), 700);
            }
          } catch (error) {
            button.textContent = 'Error';
            setTimeout(() => window.location.reload(), 700);
          }
        });
      });
    </script>
  </body>
</html>`;
}

function openBrowser(url) {
  const command = process.platform === 'win32'
    ? `start "" "${url}"`
    : process.platform === 'darwin'
      ? `open "${url}"`
      : `xdg-open "${url}"`;

  spawn(command, {
    shell: true,
    stdio: 'ignore',
    detached: true,
  }).unref();
}

function createDesktopServer({ getRows = () => core.listPorts() } = {}) {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1');

    if (url.pathname === '/kill') {
      const portValue = url.searchParams.get('port');
      const port = Number.parseInt(portValue, 10);

      if (!Number.isInteger(port)) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, message: 'Invalid port' }));
        return;
      }

      const result = core.fixPort(port, { force: false });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: result.success,
        pids: result.pids,
        rows: result.rows,
        results: result.results,
        message: result.message,
      }));
      return;
    }

    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(renderHtml(getRows()));
  });

  return server;
}

async function startDesktopUi({ port = 3456, openBrowserWindow = true } = {}) {
  const server = createDesktopServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', resolve);
  });

  const url = `http://127.0.0.1:${port}`;
  console.log(`Desktop UI running at ${url}`);

  if (openBrowserWindow) {
    openBrowser(url);
  }

  return { server, url };
}

module.exports = { renderHtml, createDesktopServer, startDesktopUi, openBrowser };
