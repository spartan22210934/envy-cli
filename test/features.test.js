const test = require('node:test');
const assert = require('node:assert');
const net = require('node:net');
const core = require('../src/core');

test('findProcesses matches rows by process name', () => {
  const rows = [
    { port: 3000, proto: 'tcp', status: 'LISTEN', localAddr: '0.0.0.0:3000', pid: 1001, processName: 'node', user: 'alice' },
    { port: 3001, proto: 'tcp', status: 'LISTEN', localAddr: '0.0.0.0:3001', pid: 2002, processName: 'python', user: 'alice' },
  ];

  const matches = core.findProcesses({ name: 'node', rows });
  assert.deepStrictEqual(matches, [rows[0]]);
});

test('reservePort binds the port and keeps it locked', async () => {
  const server = net.createServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  await new Promise((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));

  const reservation = await core.reservePort(port, { host: '127.0.0.1' });

  const secondServer = net.createServer();
  const blocked = await new Promise((resolve) => {
    secondServer.once('error', () => resolve(true));
    secondServer.listen(port, '127.0.0.1', () => {
      secondServer.close();
      resolve(false);
    });
  });

  assert.strictEqual(blocked, true);

  await reservation.stop();
});
