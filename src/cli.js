#!/usr/bin/env node
'use strict';

const { Command } = require('commander');
const readline = require('readline');
const core = require('./core');

function parsePort(value) {
  const port = parseInt(value, 10);
  if (Number.isNaN(port) || port < 1 || port > 65535) {
    throw new Error(`Invalid port: ${value}`);
  }
  return port;
}

const program = new Command();

function printTable(rows) {
  const headers = ['PORT', 'PROTO', 'STATUS', 'LOCAL ADDRESS', 'PID', 'PROCESS', 'USER'];

  if (rows.length === 0) {
    console.log('No matching ports found. (Try running with sudo/admin for full visibility.)');
    return;
  }

  const dataRows = rows.map((r) => [
    String(r.port),
    r.proto,
    r.status,
    r.localAddr,
    r.pid ? String(r.pid) : '-',
    r.processName || '-',
    r.user || '-',
  ]);

  const all = [headers, ...dataRows];
  const widths = headers.map((_, i) => Math.max(...all.map((row) => row[i].length)));

  const formatRow = (row) => row.map((cell, i) => cell.padEnd(widths[i])).join('  ');

  console.log(formatRow(headers));
  console.log(widths.map((w) => '-'.repeat(w)).join('  '));
  for (const row of dataRows) {
    console.log(formatRow(row));
  }
}

function confirm(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(`${question} [y/N] `, (answer) => {
      rl.close();
      resolve(/^y(es)?$/i.test(answer.trim()));
    });
  });
}

program.name('portcli').description("See what's running on your ports, and kill it if needed.").version('1.0.0');

program
  .command('list')
  .description('List all ports currently in use and the process bound to each')
  .option('-p, --port <number>', 'show only this port', (v) => parseInt(v, 10))
  .option('--proto <proto>', 'filter by protocol: tcp or udp')
  .action((opts) => {
    if (opts.proto && !['tcp', 'udp'].includes(opts.proto.toLowerCase())) {
      console.error('--proto must be "tcp" or "udp"');
      process.exit(1);
    }
    const rows = core.listPorts({ proto: opts.proto, port: opts.port });
    printTable(rows);
  });

program
  .command('find <name>')
  .description('Find processes by name, PID, or local address')
  .action((name) => {
    const rows = core.findProcesses({ name, rows: core.listPorts() });
    printTable(rows);
  });

program
  .command('fix <port>')
  .description('Clear a port conflict by terminating the process using it')
  .option('-f, --force', 'force kill (SIGKILL) instead of a graceful terminate', false)
  .option('--proto <proto>', 'filter by protocol: tcp or udp')
  .option('-y, --yes', 'skip confirmation prompt', false)
  .action(async (portArg, opts) => {
    try {
      const port = parsePort(portArg);
      const pids = core.findPidsOnPort(port, opts.proto);
      if (pids.length === 0) {
        console.log(`Nothing found listening on port ${port}.`);
        process.exit(1);
      }

      const rows = core.listPorts({ port, proto: opts.proto });
      console.log(`Found ${pids.length} process(es) on port ${port}:`);
      printTable(rows);

      if (!opts.yes) {
        const ok = await confirm(`\nClear this port conflict?`);
        if (!ok) {
          console.log('Aborted.');
          process.exit(0);
        }
      }

      const result = core.fixPort(port, { proto: opts.proto, force: opts.force });
      if (result.results && result.results.length) {
        for (const entry of result.results) {
          console.log(entry.message);
        }
      }

      process.exit(result.success ? 0 : 1);
    } catch (error) {
      console.error(error.message);
      process.exit(1);
    }
  });

program
  .command('watch <port>')
  .description('Poll a port and show when it changes')
  .option('--proto <proto>', 'filter by protocol: tcp or udp')
  .option('-i, --interval <ms>', 'poll interval in milliseconds', (v) => parseInt(v, 10), 1000)
  .action((portArg, opts) => {
    try {
      const port = parsePort(portArg);
      if (!Number.isInteger(opts.interval) || opts.interval < 250) {
        throw new Error('Interval must be at least 250ms');
      }

      console.log(`Watching port ${port} every ${opts.interval}ms. Press Ctrl+C to stop.`);
      const tick = () => {
        const rows = core.listPorts({ port, proto: opts.proto });
        console.clear();
        console.log(`Port watch: ${port} (${opts.proto || 'all'})`);
        printTable(rows);
      };

      tick();
      const timer = setInterval(tick, opts.interval);
      process.on('SIGINT', () => {
        clearInterval(timer);
        console.log('\nStopped watching port.');
        process.exit(0);
      });
    } catch (error) {
      console.error(error.message);
      process.exit(1);
    }
  });

program
  .command('desktop')
  .description('Launch a simple desktop browser UI for monitoring and killing ports')
  .option('-p, --port <number>', 'port for the local desktop UI', (v) => parseInt(v, 10), 3456)
  .action(async (opts) => {
    try {
      const { startDesktopUi } = require('./desktop');
      const uiPort = parsePort(String(opts.port));
      await startDesktopUi({ port: uiPort, openBrowserWindow: true });
    } catch (error) {
      console.error(error.message);
      process.exit(1);
    }
  });

program
  .command('reserve <port>')
  .description('Reserve a port so other apps cannot bind to it')
  .option('-h, --host <host>', 'bind host, e.g. 127.0.0.1', '127.0.0.1')
  .action(async (portArg, opts) => {
    try {
      const port = parsePort(portArg);
      const reservation = await core.reservePort(port, { host: opts.host });
      console.log(`Reserved port ${port} on ${opts.host}. Press Ctrl+C to release.`);

      const stopAndExit = async () => {
        try {
          await reservation.stop();
          console.log(`Released port ${port}.`);
        } catch (error) {
          console.error(`Failed to release port ${port}: ${error.message}`);
        }
        process.exit(0);
      };

      process.on('SIGINT', stopAndExit);
      process.on('SIGTERM', stopAndExit);
    } catch (error) {
      console.error(error.message);
      process.exit(1);
    }
  });

program
  .command('kill <port>')
  .description('Kill whatever process is listening on <port>')
  .option('-f, --force', 'force kill (SIGKILL) instead of a graceful terminate', false)
  .option('--proto <proto>', 'filter by protocol: tcp or udp')
  .option('-y, --yes', 'skip confirmation prompt', false)
  .action(async (portArg, opts) => {
    try {
      const port = parsePort(portArg);
      const pids = core.findPidsOnPort(port, opts.proto);
      if (pids.length === 0) {
        console.log(`Nothing found listening on port ${port}.`);
        process.exit(1);
      }

      const rows = core.listPorts({ port, proto: opts.proto });
      console.log(`Found ${pids.length} process(es) on port ${port}:`);
      printTable(rows);

      if (!opts.yes) {
        const ok = await confirm(`\nKill ${pids.length > 1 ? 'these processes' : 'this process'}?`);
        if (!ok) {
          console.log('Aborted.');
          process.exit(0);
        }
      }

      let exitCode = 0;
      for (const pid of pids) {
        const { success, message } = core.killPid(pid, { force: opts.force });
        console.log(message);
        if (!success) exitCode = 1;
      }
      process.exit(exitCode);
    } catch (error) {
      console.error(error.message);
      process.exit(1);
    }
  });

program
  .command('kill-pid <pid>')
  .description('Kill a process directly by PID')
  .option('-f, --force', 'force kill (SIGKILL) instead of a graceful terminate', false)
  .option('-y, --yes', 'skip confirmation prompt', false)
  .action(async (pidArg, opts) => {
    try {
      const pid = parseInt(pidArg, 10);
      if (Number.isNaN(pid)) {
        console.error(`Invalid PID: ${pidArg}`);
        process.exit(1);
      }

      if (!opts.yes) {
        const ok = await confirm(`Kill process with PID ${pid}?`);
        if (!ok) {
          console.log('Aborted.');
          process.exit(0);
        }
      }

      const { success, message } = core.killPid(pid, { force: opts.force });
      console.log(message);
      process.exit(success ? 0 : 1);
    } catch (error) {
      console.error(error.message);
      process.exit(1);
    }
  });

program.parse(process.argv);