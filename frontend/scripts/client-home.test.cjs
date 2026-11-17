// node --test scripts/client-home.test.cjs
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const rxjs = require('rxjs');
const timers = new Map();
const moduleObject = { exports: {} };
vm.runInNewContext(
  ts.transpileModule(
    fs.readFileSync(path.resolve(__dirname, '../src/app/cliente/client-home.component.ts'), 'utf8'),
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        experimentalDecorators: true,
        useDefineForClassFields: false,
      },
    },
  ).outputText,
  {
    exports: moduleObject.exports,
    module: moduleObject,
    window: {
      setInterval: (callback) => {
        const id = timers.size + 1;
        timers.set(id, callback);
        return id;
      },
      clearInterval: (id) => timers.delete(id),
    },
    require: (name) => {
      if (name === 'rxjs') return rxjs;
      if (name === '@angular/core') return { Component: () => (component) => component };
      if (name.startsWith('@angular/') || name.startsWith('../core/')) return {};
      throw new Error(name);
    },
  },
);
const Home = moduleObject.exports.ClientHomeComponent;
function fixture(
  deferred = false,
  totals = {
    '': 80,
    NUEVO: 10,
    ASIGNADO: 5,
    EN_PROCESO: 30,
    PENDIENTE_CLIENTE: 2,
    RESUELTO: 10,
    CERRADO: 15,
  },
) {
  const requests = [],
    responses = [],
    navigations = [];
  const service = {
    listarMisTickets: (page, size, search, filters) => {
      requests.push({ page, size, search, filters });
      const result = deferred
        ? new rxjs.Subject()
        : rxjs.of({
            success: true,
            data: {
              totalElements: totals[filters?.estado || ''] || 0,
              content: totals['']
                ? Array.from({ length: size }, (_, i) => ({ id: 6 - i, titulo: `Ticket ${i}` }))
                : [],
            },
          });
      responses.push(result);
      return result;
    },
  };
  const notifications = {
    getUnread: () => rxjs.of({ data: [] }),
    markRead: () => rxjs.of({ success: true }),
  };
  const component = new Home(
    service,
    { currentUserSignal: () => ({ fullName: 'Ana Torres' }), getToken: () => 'test' },
    notifications,
    { navigateByUrl: (url) => navigations.push(url) },
  );
  component.ngOnInit();
  return { component, requests, responses, navigations, service };
}
test('el inicio muestra totales del servidor por encima de 50 y solo cuatro registros recientes', () => {
  const { component, requests } = fixture();
  assert.equal(component.totalTickets, 80);
  assert.equal(component.abiertos, 47);
  assert.equal(component.resueltos, 25);
  assert.equal(component.recentTickets.length, 4);
  assert.equal(requests.length, 7);
  assert.equal(requests[0].page, 0);
  assert.equal(requests[0].size, 4);
  assert.ok(requests.slice(1).every((request) => request.size === 1));
  assert.ok(requests.some((request) => request.filters?.estado === 'PENDIENTE_CLIENTE'));
  assert.ok(!requests.some((request) => request.filters?.estado === 'CANCELADO'));
  component.ngOnDestroy();
});
test('un cliente sin tickets muestra ceros reales y una lista vacía', () => {
  const { component } = fixture(false, {});
  assert.equal(component.totalTickets, 0);
  assert.equal(component.abiertos, 0);
  assert.equal(component.resueltos, 0);
  assert.equal(component.recentTickets.length, 0);
  assert.equal(component.recentError, '');
  assert.equal(component.metricsError, '');
  component.ngOnDestroy();
});
test('el error de recientes no se convierte en cero y no impide mostrar otros contadores', () => {
  const { component, responses } = fixture(true);
  responses[0].error(new Error('Sin conexión'));
  for (const response of responses.slice(1)) {
    response.next({ success: true, data: { totalElements: 2 } });
    response.complete();
  }
  assert.equal(component.totalTickets, null);
  assert.equal(component.abiertos, 8);
  assert.equal(component.resueltos, 4);
  assert.equal(component.loadingRecent, false);
  assert.match(component.recentError, /cargar/);
  component.ngOnDestroy();
});
test('los errores del resumen no borran la lista de tickets recientes', () => {
  const { component, responses } = fixture(true);
  responses[0].next({ success: true, data: { totalElements: 90, content: [{ id: 1 }] } });
  responses[0].complete();
  responses[1].error(new Error('Resumen no disponible'));
  assert.equal(component.recentTickets.length, 1);
  assert.equal(component.totalTickets, 90);
  assert.equal(component.abiertos, null);
  assert.equal(component.resueltos, null);
  assert.match(component.metricsError, /resumen/);
  assert.equal(component.loadingMetrics, false);
  component.ngOnDestroy();
});
test('una respuesta no exitosa o incompleta no inventa conteos válidos', () => {
  const { component, responses } = fixture(true);
  responses[0].next({ success: false });
  responses[0].complete();
  for (let i = 1; i < responses.length; i++) {
    responses[i].next(i === 2 ? { success: false } : { success: true, data: { totalElements: 3 } });
    responses[i].complete();
  }
  assert.equal(component.totalTickets, null);
  assert.equal(component.abiertos, null);
  assert.equal(component.resueltos, 6);
  assert.ok(component.metricsError);
  assert.ok(component.recentError);
  component.ngOnDestroy();
});
test('reintentar cancela peticiones previas y salir cancela peticiones y temporizador', () => {
  const { component, responses } = fixture(true);
  component.refreshMetrics();
  assert.equal(responses[0].observed, false);
  assert.equal(responses[1].observed, false);
  responses[0].next({ success: true, data: { totalElements: 999, content: [] } });
  assert.equal(component.totalTickets, null);
  responses[7].next({ success: true, data: { totalElements: 12, content: [{ id: 2 }] } });
  responses[7].complete();
  assert.equal(component.totalTickets, 12);
  component.ngOnDestroy();
  assert.equal(responses[8].observed, false);
  assert.equal(timers.size, 0);
});
test('conserva navegación de notificaciones y colores semánticos de estado y prioridad', () => {
  const { component, navigations } = fixture();
  component.openNotification(
    { id: 1, urlDestino: '/cliente/tickets?ticketId=6' },
    { stopPropagation() {} },
  );
  assert.equal(navigations[0], '/cliente/tickets/6');
  assert.equal(component.statusTone('PENDIENTE_CLIENTE'), 'amber');
  assert.equal(component.statusTone('CANCELADO'), 'red');
  assert.equal(component.statusTone('DESCONOCIDO'), 'neutral');
  assert.equal(component.priorityTone('Crítica'), 'red');
  assert.equal(component.priorityTone('Baja'), 'green');
  assert.equal(component.trackTicket(0, { id: 6 }), 6);
  component.ngOnDestroy();
});

test('las fechas se presentan en español y las fechas inválidas tienen un valor seguro', () => {
  const { component } = fixture();
  assert.match(component.formatDate('2026-09-29T12:00:00'), /29.*set.*2026/);
  assert.equal(component.formatDate(), '—');
  assert.equal(component.formatDate('no es una fecha'), '—');
  component.ngOnDestroy();
});
