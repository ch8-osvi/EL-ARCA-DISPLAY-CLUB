const test = require("node:test"),
  assert = require("node:assert/strict");
const {
  transientConnectionError,
  reconnectScheduler,
} = require("../../whatsapp-bridge/reconnect");
test("cierre 1006 reconecta sin ocultar errores de código, disco o credenciales", () => {
  assert.equal(transientConnectionError(1006), true);
  for (const e of [
    401,
    new Error("1006"),
    new TypeError("session is undefined"),
    Object.assign(new Error("Disk"), { code: "EACCES" }),
  ])
    assert.equal(transientConnectionError(e), false);
  const e = Object.assign(new Error("WebSocket Error"), { data: 1006 });
  e.stack =
    "at socket (file:///app/node_modules/@whiskeysockets/baileys/lib/Socket/socket.js:1:1)";
  assert.equal(transientConnectionError(e), true);
});
test("reconexión única, espera progresiva y cancelación al conectar o apagar", async () => {
  const jobs = [],
    cancelled = [];
  let calls = 0,
    stopping = false;
  const scheduler = reconnectScheduler({
    connect: async () => {
      calls++;
    },
    stopped: () => stopping,
    onError: () => {},
    setTimer: (run, delay) => {
      const job = { run, delay };
      jobs.push(job);
      return job;
    },
    clearTimer: (job) => cancelled.push(job),
  });
  scheduler.schedule();
  scheduler.schedule();
  assert.equal(jobs.length, 1);
  assert.equal(jobs[0].delay, 2000);
  jobs[0].run();
  assert.equal(calls, 1);
  scheduler.schedule();
  assert.equal(jobs[1].delay, 4000);
  scheduler.reset();
  assert.equal(cancelled.length, 1);
  scheduler.schedule();
  assert.equal(jobs[2].delay, 2000);
  stopping = true;
  jobs[2].run();
  scheduler.schedule();
  assert.equal(calls, 1);
  assert.equal(jobs.length, 3);
});
