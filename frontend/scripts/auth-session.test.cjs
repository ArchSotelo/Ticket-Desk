// Pruebas del flujo de sesión con los servicios reales y peticiones HTTP simuladas.
// Ejecutar: node --test scripts/auth-session.test.cjs
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const rxjs = require('rxjs');

function loadSource(relativePath, dependencies, globals) {
  const file = path.resolve(__dirname, '../src/app', relativePath);
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      experimentalDecorators: true,
      esModuleInterop: true,
    },
  }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(
    code,
    {
      module,
      exports: module.exports,
      ...globals,
      require: (name) => {
        if (!(name in dependencies)) throw new Error(`Dependencia inesperada: ${name}`);
        return dependencies[name];
      },
    },
    { filename: file },
  );
  return module.exports;
}

function fixture(options = {}) {
  let storedSession = JSON.stringify({ accessToken: 'old', refreshToken: 'refresh', userId: 7 });
  const globals = {
    localStorage: {
      getItem: () => storedSession,
      setItem: (_, value) => (storedSession = value),
      removeItem: () => (storedSession = null),
    },
    atob,
    Date,
    JSON,
    ...options.globals,
  };
  const angular = {
    Injectable: () => (value) => value,
    signal: (value) => {
      const read = () => value;
      read.set = (next) => (value = next);
      return read;
    },
    computed: (read) => read,
  };
  const { AuthService } = loadSource(
    'core/services/auth.service.ts',
    {
      '@angular/core': angular,
      '@angular/common/http': {},
      '@angular/router': {},
      rxjs,
    },
    globals,
  );
  const httpCalls = [];
  const http = {
    post: (url, body) => {
      const response = new rxjs.Subject();
      httpCalls.push({ url, body, response });
      return response;
    },
  };
  const navigations = [];
  const auth = new AuthService(http, { navigateByUrl: (...args) => navigations.push(args) });
  let alerts = 0;
  const { jwtInterceptor } = loadSource(
    'core/interceptors/jwt.interceptor.ts',
    {
      '@angular/core': { inject: () => auth },
      '@angular/common/http': {},
      '../services/auth.service': { AuthService },
      rxjs,
      sweetalert2: {
        fire: () => {
          alerts++;
          return new Promise(() => {});
        },
      },
    },
    globals,
  );
  return {
    auth,
    httpCalls,
    intercept: jwtInterceptor,
    alertCount: () => alerts,
    navigations,
    globals,
  };
}

function request(headers = {}) {
  return {
    url: '/api/v1/notifications/unread',
    headers,
    clone: ({ setHeaders }) => request({ ...headers, ...setHeaders }),
  };
}

function renew(f) {
  f.httpCalls[0].response.next({
    success: true,
    data: { accessToken: 'new', refreshToken: 'refresh-new', userId: 7 },
  });
  f.httpCalls[0].response.complete();
}

test('varios 401 simultáneos renuevan una vez y repiten todas las consultas', () => {
  const f = fixture();
  const responses = [];
  const errors = [];
  const next = (req) =>
    req.headers.Authorization === 'Bearer old'
      ? rxjs.throwError(() => ({ status: 401 }))
      : rxjs.of('notifications');
  for (let i = 0; i < 3; i++) {
    f.intercept(request(), next).subscribe({
      next: (value) => responses.push(value),
      error: (error) => errors.push(error),
    });
  }
  assert.equal(f.httpCalls.length, 1);
  renew(f);
  assert.equal(responses.length, 3);
  assert.equal(errors.length, 0);
  assert.equal(f.auth.getToken(), 'new');
});

test('un 403 por permisos conserva la sesión y no renueva', () => {
  const f = fixture();
  let failure;
  f.intercept(request(), () => rxjs.throwError(() => ({ status: 403 }))).subscribe({
    error: (error) => (failure = error),
  });
  assert.equal(failure.status, 403);
  assert.equal(f.auth.getToken(), 'old');
  assert.equal(f.httpCalls.length, 0);
  assert.equal(f.alertCount(), 0);
});

test('un 403 después de renovar tampoco cierra la sesión', () => {
  const f = fixture();
  let failure;
  f.intercept(request(), (req) =>
    rxjs.throwError(() => ({ status: req.headers.Authorization === 'Bearer old' ? 401 : 403 })),
  ).subscribe({ error: (error) => (failure = error) });
  renew(f);
  assert.equal(failure.status, 403);
  assert.equal(f.auth.getToken(), 'new');
  assert.equal(f.alertCount(), 0);
});

test('un refresh rechazado limpia la sesión y muestra un solo aviso', () => {
  const f = fixture();
  for (let i = 0; i < 3; i++) {
    f.intercept(request(), () => rxjs.throwError(() => ({ status: 401 }))).subscribe({
      error: () => {},
    });
  }
  f.httpCalls[0].response.error({ status: 401 });
  assert.equal(f.auth.getToken(), null);
  assert.equal(f.alertCount(), 1);
});

test('una falla de red durante el refresh conserva la sesión para reintentar', () => {
  const f = fixture();
  f.intercept(request(), () => rxjs.throwError(() => ({ status: 401 }))).subscribe({
    error: () => {},
  });
  f.httpCalls[0].response.error({ status: 0 });
  assert.equal(f.auth.getToken(), 'old');
  assert.equal(f.alertCount(), 0);
});

test('el WebSocket obtiene un token renovado cuando el anterior está vencido', () => {
  const f = fixture();
  const expired = `header.${Buffer.from(JSON.stringify({ exp: 1 })).toString('base64url')}.signature`;
  f.auth.currentUserSignal.set({ accessToken: expired, refreshToken: 'refresh', userId: 7 });
  let received;
  f.auth.getValidToken().subscribe((value) => (received = value));
  assert.equal(f.httpCalls.length, 1);
  renew(f);
  assert.equal(received, 'new');
});

test('una renovación pendiente no restaura una sesión que se cerró', () => {
  const f = fixture();
  let failed = false;
  f.auth.refreshToken().subscribe({ error: () => (failed = true) });
  f.auth.clearSession();
  renew(f);
  assert.equal(f.auth.getToken(), null);
  assert.equal(failed, true);
});

test('cuatro roles conservan sus portales y los roles retirados vuelven al login', () => {
  const f = fixture();
  for (const [role, route] of [
    ['ROLE_CLIENTE', '/cliente'],
    ['ROLE_TECNICO', '/tecnico/dashboard'],
    ['ROLE_SUPERVISOR', '/dashboard'],
    ['ROLE_ADMIN', '/dashboard'],
    ['ROLE_HELPDESK', '/auth/login'],
    ['ROLE_INVITADO', '/auth/login'],
  ]) {
    f.auth.currentUserSignal.set({ accessToken: 'test', roles: [role], permissions: [] });
    assert.equal(f.auth.getLandingRoute(), route);
  }
});

test('la interfaz utiliza permisos de sesión sin deducirlos del nombre del rol', () => {
  const f = fixture();
  f.auth.currentUserSignal.set({ accessToken: 'test', roles: ['ROLE_ADMIN'] });
  assert.equal(f.auth.hasPermission('USER_MANAGE'), false);
  f.auth.currentUserSignal.set({
    accessToken: 'test',
    roles: ['ROLE_SUPERVISOR'],
    permissions: ['AUDIT_VIEW', 'CONTACT_READ', 'TICKET_ASSIGN'],
  });
  assert.equal(f.auth.hasPermission('AUDIT_VIEW'), true);
  assert.equal(f.auth.hasPermission('CONTACT_READ'), true);
  assert.equal(f.auth.hasPermission('USER_MANAGE'), false);
  f.auth.syncProfile({
    nombres: 'Supervisor',
    apellidos: 'Prueba',
    roles: ['ROLE_SUPERVISOR'],
    permissions: ['CONTACT_READ'],
  });
  assert.equal(f.auth.hasPermission('AUDIT_VIEW'), false);
  assert.equal(f.auth.hasPermission('CONTACT_READ'), true);
});

test('los cuatro roles deben cambiar su contraseña antes de entrar al portal', () => {
  const f = fixture();
  for (const role of ['ROLE_CLIENTE', 'ROLE_TECNICO', 'ROLE_SUPERVISOR', 'ROLE_ADMIN']) {
    f.auth.currentUserSignal.set({
      accessToken: 'initial',
      roles: [role],
      requiresPasswordChange: true,
    });
    assert.equal(f.auth.getLandingRoute(), '/auth/change-password');
  }
  f.auth.passwordChanged();
  assert.equal(f.auth.getToken(), null);
  assert.equal(f.globals.localStorage.getItem('user_session'), null);
  assert.equal(f.navigations.at(-1)[0], '/auth/login?passwordChanged=true');
});

test('un 403 de cambio obligatorio redirige sin renovar ni cerrar la sesión', () => {
  const f = fixture();
  f.intercept(request(), () =>
    rxjs.throwError(() => ({ status: 403, error: { errors: ['PASSWORD_CHANGE_REQUIRED'] } })),
  ).subscribe({ error: () => {} });
  assert.equal(f.auth.hasPendingPasswordChange(), true);
  assert.equal(f.navigations.at(-1)[0], '/auth/change-password');
  assert.equal(f.httpCalls.length, 0);
  assert.equal(f.alertCount(), 0);
  assert.equal(f.auth.getToken(), 'old');
});

test('el cambio obligatorio también se reconoce después de renovar', () => {
  const f = fixture();
  f.intercept(request(), (req) =>
    rxjs.throwError(() =>
      req.headers.Authorization === 'Bearer old'
        ? { status: 401 }
        : { status: 403, error: { errors: ['PASSWORD_CHANGE_REQUIRED'] } },
    ),
  ).subscribe({ error: () => {} });
  renew(f);
  assert.equal(f.auth.hasPendingPasswordChange(), true);
  assert.equal(f.auth.getToken(), 'new');
});

test('un error de renovación atrasado no cierra una sesión iniciada después', () => {
  const f = fixture();
  f.intercept(request(), () => rxjs.throwError(() => ({ status: 401 }))).subscribe({
    error: () => {},
  });
  f.auth.login({ username: 'other', password: 'test-password' }).subscribe();
  f.httpCalls[1].response.next({
    success: true,
    data: { accessToken: 'another-login', refreshToken: 'another-refresh', userId: 8 },
  });
  f.httpCalls[1].response.complete();
  f.httpCalls[0].response.error({ status: 401 });
  assert.equal(f.auth.getToken(), 'another-login');
  assert.equal(f.alertCount(), 0);
});

function jwt(version, id = 'example') {
  return `e30.${Buffer.from(JSON.stringify({ sv: version, sub: 'example', jti: id, exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url')}.test`;
}
function browserTabs() {
  let stored = JSON.stringify({ accessToken: jwt(1), refreshToken: 'initial-refresh', userId: 7 });
  const localStorage = {
    getItem: () => stored,
    setItem: (_, value) => {
      stored = value;
    },
    removeItem: () => {
      stored = null;
    },
  };
  let tail = Promise.resolve();
  const navigator = {
    locks: {
      request: (_, callback) => {
        const result = tail.then(callback);
        tail = result.catch(() => {});
        return result;
      },
    },
  };
  const globals = { localStorage, navigator };
  return { first: fixture({ globals }), second: fixture({ globals }) };
}

test('dos pestañas renuevan una sola vez y comparten el refresh rotado', async () => {
  const { first, second } = browserTabs();
  const a = rxjs.firstValueFrom(first.auth.refreshToken());
  const b = rxjs.firstValueFrom(second.auth.refreshToken());
  await new Promise(setImmediate);
  assert.equal(first.httpCalls.length, 1);
  assert.equal(second.httpCalls.length, 0);
  first.httpCalls[0].response.next({
    success: true,
    data: { accessToken: jwt(1, 'rotated'), refreshToken: 'rotated-refresh', userId: 7 },
  });
  first.httpCalls[0].response.complete();
  await Promise.all([a, b]);
  assert.equal(second.httpCalls.length, 0);
  assert.equal(second.auth.currentUserSignal().refreshToken, 'rotated-refresh');
});

test('una pestaña con otra versión de sesión no reutiliza el token de un login nuevo', async () => {
  const { first, second } = browserTabs();
  first.auth.login({ username: 'example', password: 'test-password' }).subscribe();
  first.httpCalls[0].response.next({
    success: true,
    data: { accessToken: jwt(2), refreshToken: 'new-login-refresh', userId: 7 },
  });
  first.httpCalls[0].response.complete();
  await assert.rejects(rxjs.firstValueFrom(second.auth.refreshToken()), /sesión cambió/);
  assert.equal(second.httpCalls.length, 0);
  assert.equal(first.auth.currentUserSignal().refreshToken, 'new-login-refresh');
});

test('otra pestaña comunica cierre de sesión y cambio obligatorio mediante storage', () => {
  let listener;
  const f = fixture({
    globals: {
      window: {
        addEventListener: (_, callback) => {
          listener = callback;
        },
      },
    },
  });
  f.globals.localStorage.setItem(
    'user_session',
    JSON.stringify({ accessToken: 'initial', requiresPasswordChange: true }),
  );
  listener({ key: 'user_session' });
  assert.equal(f.auth.hasPendingPasswordChange(), true);
  assert.equal(f.navigations.at(-1)[0], '/auth/change-password');
  f.globals.localStorage.removeItem('user_session');
  listener({ key: 'user_session' });
  assert.equal(f.auth.getToken(), null);
  assert.equal(f.navigations.at(-1)[0], '/auth/login');
});

test('un 401 atrasado repite con el token rotado solo si conserva la misma sesión', () => {
  const f = fixture(),
    pending = new rxjs.Subject(),
    sent = [];
  const old = jwt(1, 'old'),
    current = jwt(1, 'new');
  f.auth.currentUserSignal.set({ accessToken: old });
  let result;
  f.intercept(request(), (req) => {
    sent.push(req.headers.Authorization);
    return sent.length === 1 ? pending : rxjs.of('ok');
  }).subscribe({
    next: (value) => {
      result = value;
    },
  });
  f.auth.currentUserSignal.set({ accessToken: current });
  pending.error({ status: 401 });
  assert.equal(result, 'ok');
  assert.deepEqual(sent, [`Bearer ${old}`, `Bearer ${current}`]);
  assert.equal(f.httpCalls.length, 0);
});

test('una operación pendiente no se repite bajo la sesión de un login posterior', () => {
  const f = fixture(),
    pending = new rxjs.Subject(),
    sent = [];
  const old = jwt(1),
    current = jwt(2);
  f.auth.currentUserSignal.set({ accessToken: old });
  f.intercept(request(), (req) => {
    sent.push(req.headers.Authorization);
    return pending;
  }).subscribe({ error: () => {} });
  f.auth.currentUserSignal.set({ accessToken: current });
  pending.error({ status: 401 });
  assert.equal(sent.length, 1);
  assert.equal(f.auth.getToken(), current);
  assert.equal(f.httpCalls.length, 0);
  assert.equal(f.alertCount(), 0);
});
