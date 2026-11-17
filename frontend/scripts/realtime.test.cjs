const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const rxjs = require('rxjs');
function fixture() {
  const sockets = [],
    timers = new Map();
  let nextTimer = 0,
    effect,
    token = 'test-old-token',
    renew = false,
    validCalls = 0;
  let user = { userId: 1 };
  class Socket {
    static OPEN = 1;
    static CONNECTING = 0;
    constructor(url) {
      this.url = url;
      this.readyState = 0;
      this.sent = [];
      sockets.push(this);
    }
    send(data) {
      this.sent.push(JSON.parse(data));
    }
    open() {
      this.readyState = 1;
      this.onopen?.();
    }
    close() {
      this.readyState = 3;
      this.onclose?.({ code: 1000, reason: '' });
    }
    serverClose(code, reason = '') {
      this.readyState = 3;
      this.onclose?.({ code, reason });
    }
  }
  const auth = {
    currentUserSignal: () => user,
    getToken: () => token,
    getValidToken: () => {
      validCalls++;
      if (renew) token = 'test-renewed-token';
      return rxjs.of(token);
    },
    refreshToken: () => rxjs.throwError(() => ({ status: 401 })),
    logout: () => {
      user = null;
      token = null;
    },
  };
  const module = { exports: {} };
  const code = ts.transpileModule(
    fs.readFileSync(
      path.resolve(__dirname, '../src/app/core/services/realtime.service.ts'),
      'utf8',
    ),
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        experimentalDecorators: true,
      },
    },
  ).outputText;
  vm.runInNewContext(code, {
    module,
    exports: module.exports,
    WebSocket: Socket,
    window: {
      location: { protocol: 'http:', host: 'localhost:4205' },
      setTimeout: (cb) => {
        timers.set(++nextTimer, cb);
        return nextTimer;
      },
      clearTimeout: (id) => timers.delete(id),
    },
    require: (name) =>
      name === 'rxjs'
        ? rxjs
        : name === '@angular/core'
          ? {
              Injectable: () => (x) => x,
              effect: (cb) => {
                effect = cb;
                cb();
              },
            }
          : {},
  });
  const service = new module.exports.RealtimeService({ run: (cb) => cb() }, auth);
  return {
    service,
    sockets,
    timers,
    get calls() {
      return validCalls;
    },
    renew: () => (renew = true),
    switchUser: (id) => {
      user = { userId: id };
      effect();
    },
    logout: () => {
      user = null;
      token = null;
      effect();
    },
    runTimer: () => {
      const [id, cb] = timers.entries().next().value;
      timers.delete(id);
      cb();
    },
  };
}
test('la suscripción omite userId y mantiene los canales explícitos', () => {
  const f = fixture();
  f.service.connect(1, 11);
  f.sockets[0].open();
  assert.deepEqual(f.sockets[0].sent[0], { type: 'subscribe', ticketId: 11 });
  f.service.connect(1, undefined, 'KANBAN');
  assert.deepEqual(f.sockets[0].sent[1], { type: 'subscribe', scope: 'KANBAN' });
  f.service.disconnect();
});
test('una denegación abandona el canal rechazado y recupera solo las notificaciones propias', () => {
  const f = fixture();
  f.service.connect(1, 11);
  f.sockets[0].open();
  f.sockets[0].serverClose(1008);
  f.runTimer();
  f.sockets[1].open();
  assert.deepEqual(f.sockets[1].sent[0], { type: 'subscribe' });
  f.service.disconnect();
});
test('al caducar el JWT renueva la sesión y conserva el ticket autorizado', () => {
  const f = fixture();
  f.service.connect(1, 11);
  f.sockets[0].open();
  f.renew();
  f.sockets[0].serverClose(1008, 'SESSION_EXPIRED');
  f.runTimer();
  f.sockets[1].open();
  assert.equal(f.calls, 2);
  assert.match(f.sockets[1].url, /test-renewed-token/);
  assert.deepEqual(f.sockets[1].sent[0], { type: 'subscribe', ticketId: 11 });
  f.service.disconnect();
});
test('una desconexión de red conserva el canal al reconectar', () => {
  const f = fixture();
  f.service.connect(1, undefined, 'KANBAN');
  f.sockets[0].open();
  f.sockets[0].serverClose(1006);
  f.runTimer();
  f.sockets[1].open();
  assert.deepEqual(f.sockets[1].sent[0], { type: 'subscribe', scope: 'KANBAN' });
  f.service.disconnect();
});
test('cambio de cuenta y cierre de sesión descartan mensajes de sockets anteriores', () => {
  const f = fixture(),
    events = [];
  f.service.events$.subscribe((event) => events.push(event));
  f.service.connect(1, 11);
  f.sockets[0].open();
  const old = f.sockets[0];
  f.switchUser(2);
  f.service.connect(2);
  f.sockets[1].open();
  old.onmessage({ data: JSON.stringify({ type: 'notification', userId: 1 }) });
  assert.deepEqual(events, []);
  f.sockets[1].onmessage({ data: JSON.stringify({ type: 'notification', userId: 2 }) });
  assert.equal(events.length, 1);
  f.logout();
  f.sockets[1].onmessage({ data: JSON.stringify({ type: 'notification', userId: 2 }) });
  assert.equal(events.length, 1);
  assert.equal(f.timers.size, 0);
});

test('una sesión revocada por el servidor fuerza renovación y cierra sesión al ser rechazada', () => {
  const f = fixture();
  f.service.connect(1, 10);
  f.sockets[0].open();
  f.sockets[0].serverClose(1008, 'SESSION_REVOKED');
  f.runTimer();
  assert.equal(f.sockets.length, 1);
  assert.equal(f.timers.size, 0);
});
