// node --test scripts/kanban.test.cjs (sin backend ni cambios a tickets reales)
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const rxjs = require('rxjs');
const file = path.resolve(__dirname, '../src/app/tickets/kanban/kanban.component.ts');
const moduleFixture = { exports: {} };
vm.runInNewContext(
  ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      experimentalDecorators: true,
    },
  }).outputText,
  {
    exports: moduleFixture.exports,
    module: moduleFixture,
    require: (name) => {
      if (name === 'rxjs') return rxjs;
      if (name === '@angular/core') return { Component: () => (component) => component };
      if (name === '@angular/cdk/drag-drop')
        return {
          moveItemInArray: (array, from, to) => array.splice(to, 0, array.splice(from, 1)[0]),
          transferArrayItem: (from, to, index, target) =>
            to.splice(target, 0, from.splice(index, 1)[0]),
        };
      if (name.startsWith('@angular/') || name.startsWith('../../core/')) return {};
      throw new Error(name);
    },
  },
);
const Kanban = moduleFixture.exports.KanbanComponent;
const ticket = (id, state = 'NUEVO', extra = {}) => ({
  id,
  estadoCodigo: state,
  codigo: 'TICK-' + id,
  titulo: 'Conexión VPN',
  clienteNombre: 'Ana Torres',
  prioridadNombre: 'Media',
  attachments: [],
  ...extra,
});
function fixture({
  role = 'technician',
  tickets = [ticket(1), ticket(2, 'EN_PROCESO')],
  saved = new Map(),
  deferred = false,
  admin = role === 'admin',
} = {}) {
  const requests = [],
    responses = [],
    patches = [],
    navigations = [],
    connections = [];
  const events$ = new rxjs.Subject();
  const service = {
    listarTickets: (page, size) => {
      requests.push({ page, size });
      const response = deferred
        ? new rxjs.Subject()
        : rxjs.of({
            success: true,
            data: {
              content: tickets.slice(page * size, (page + 1) * size),
              totalElements: tickets.length,
            },
          });
      responses.push(response);
      return response;
    },
    cambiarEstado: (id, state) => {
      const response = new rxjs.Subject();
      patches.push({ id, state, response });
      return response;
    },
  };
  const filterState = {
    load: (key, defaults) => ({ ...defaults, ...saved.get(key) }),
    save: (key, value) => saved.set(key, { ...value }),
  };
  const component = new Kanban(
    service,
    { hasRole: () => admin, currentUserSignal: () => ({ userId: 3 }) },
    { navigate: (target, options) => navigations.push({ target, options }) },
    { events$, connect: (...args) => connections.push(args) },
    { snapshot: { data: { role } } },
    filterState,
  );
  component.ngOnInit();
  return { component, requests, responses, patches, saved, navigations, events$, connections };
}
function drop(component, from = 'colNuevo', to = 'colProceso', state = 'EN_PROCESO') {
  component.drop({
    previousContainer: { data: component[from] },
    container: { data: component[to], id: state },
    previousIndex: 0,
    currentIndex: 0,
  });
}

test('cada portal conserva sus rutas incluso si el usuario tiene ambos roles', () => {
  for (const role of ['admin', 'technician']) {
    const f = fixture({ role, admin: true });
    f.component.abrirDetalle(ticket(9));
    assert.equal(f.component.boardRoute, role === 'admin' ? '/tickets/kanban' : '/tecnico/kanban');
    assert.equal(
      f.navigations[0].target[0],
      role === 'admin' ? '/tickets/detail' : '/tecnico/tickets',
    );
    assert.equal(f.navigations[0].options.queryParams.returnTo, f.component.boardRoute);
    assert.equal(
      f.component.newTicketRoute,
      role === 'admin' ? '/tickets/new' : '/tecnico/nuevo-ticket',
    );
    f.component.ngOnDestroy();
  }
});
test('carga todas las páginas, no solo los primeros 50 tickets', () => {
  const f = fixture({ tickets: Array.from({ length: 215 }, (_, i) => ticket(i + 1)) });
  assert.equal(f.requests.length, 3);
  assert.equal(f.requests[2].page, 2);
  assert.equal(f.component.totalVisible, 215);
  f.component.ngOnDestroy();
});
test('agrupa asignados y pendientes sin incluir cancelados', () => {
  const f = fixture({
    tickets: [
      'NUEVO',
      'ASIGNADO',
      'EN_PROCESO',
      'PENDIENTE_CLIENTE',
      'RESUELTO',
      'CERRADO',
      'CANCELADO',
    ].map((s, i) => ticket(i, s)),
  });
  assert.equal(f.component.colNuevo.length, 2);
  assert.equal(f.component.colProceso.length, 2);
  assert.equal(f.component.colResuelto.length, 1);
  assert.equal(f.component.colCerrado.length, 1);
  assert.equal(f.component.totalVisible, 6);
  f.component.ngOnDestroy();
});
test('combina búsqueda sin acentos, prioridad y técnico; limpiar no recarga API', () => {
  const f = fixture({
    tickets: [
      ticket(1),
      ticket(2, 'EN_PROCESO', { tecnicoId: 4, tecnicoNombre: 'Carlos Mendoza' }),
    ],
  });
  Object.assign(f.component.filters, { search: 'conexion', priority: 'Media', technician: '4' });
  f.component.applyFilters();
  assert.equal(f.component.totalVisible, 1);
  assert.equal(f.component.colProceso[0].id, 2);
  f.component.clearFilters();
  assert.equal(f.component.totalVisible, 2);
  assert.equal(f.requests.length, 1);
  f.component.ngOnDestroy();
});
test('Sin asignar filtra por falta de técnico y mantiene las opciones sin resultados', () => {
  const f = fixture();
  f.component.filters.technician = 'unassigned';
  f.component.applyFilters();
  assert.equal(f.component.totalVisible, 2);
  f.component.filters.search = 'ninguna coincidencia';
  f.component.applyFilters();
  assert.equal(f.component.totalVisible, 0);
  assert.equal(f.component.priorities[0], 'Media');
  f.component.ngOnDestroy();
});
test('recupera los filtros sin sobrescribir los del otro portal', () => {
  const saved = new Map([
    ['admin-kanban', { search: 'admin' }],
    ['technician-kanban', { search: 'VPN' }],
  ]);
  const f = fixture({ saved });
  assert.equal(f.component.filters.search, 'VPN');
  f.component.filters.priority = 'Media';
  f.component.applyFilters();
  assert.equal(saved.get('admin-kanban').search, 'admin');
  f.component.ngOnDestroy();
  const reopened = fixture({ saved });
  assert.equal(reopened.component.filters.priority, 'Media');
  reopened.component.ngOnDestroy();
});
test('ignora filtros antiguos con tipos inválidos', () => {
  const f = fixture({
    saved: new Map([['technician-kanban', { search: null, priority: 1, technician: false }]]),
  });
  assert.equal(f.component.hasFilters, false);
  f.component.ngOnDestroy();
});
test('no publica resultados parciales mientras carga páginas', () => {
  const f = fixture({ deferred: true });
  f.responses[0].next({
    success: true,
    data: { content: Array.from({ length: 100 }, (_, i) => ticket(i)), totalElements: 101 },
  });
  f.responses[0].complete();
  assert.equal(f.component.totalVisible, 0);
  assert.equal(f.component.loading, true);
  f.responses[1].next({ success: true, data: { content: [ticket(101)], totalElements: 101 } });
  f.responses[1].complete();
  assert.equal(f.component.totalVisible, 101);
  assert.equal(f.component.loading, false);
  f.component.ngOnDestroy();
});
test('error de carga conserva datos anteriores y evita mover tarjetas obsoletas', () => {
  const f = fixture({ deferred: true });
  f.responses[0].next({ success: true, data: { content: [ticket(1)], totalElements: 1 } });
  f.responses[0].complete();
  f.component.cargarTickets();
  f.responses[1].error(new Error('offline'));
  assert.equal(f.component.totalVisible, 1);
  assert.match(f.component.loadError, /últimos datos/);
  drop(f.component);
  assert.equal(f.patches.length, 0);
  f.component.ngOnDestroy();
});
test('mover envía un solo PATCH y revierte ante error HTTP', () => {
  const f = fixture();
  drop(f.component);
  drop(f.component);
  assert.equal(f.patches.length, 1);
  assert.equal(f.component.colNuevo.length, 0);
  f.patches[0].response.error(new Error('403'));
  assert.equal(f.component.colNuevo.length, 1);
  assert.equal(f.component.colProceso.length, 1);
  assert.match(f.component.moveError, /volvió/);
  assert.equal(f.component.savingTicketId, undefined);
  f.component.ngOnDestroy();
});
test('respuesta success:false también revierte la tarjeta', () => {
  const f = fixture();
  drop(f.component);
  f.patches[0].response.next({ success: false });
  assert.equal(f.component.colNuevo[0].id, 1);
  assert.ok(f.component.moveError);
  f.component.ngOnDestroy();
});
test('actualiza tarjeta desde respuesta servidor incluyendo técnico autoasignado', () => {
  const f = fixture();
  drop(f.component);
  f.patches[0].response.next({
    success: true,
    data: ticket(1, 'EN_PROCESO', { tecnicoId: 3, tecnicoNombre: 'Carlos Mendoza' }),
  });
  assert.equal(f.component.colProceso[0].tecnicoNombre, 'Carlos Mendoza');
  assert.match(f.component.moveMessage, /actualizado/);
  f.component.ngOnDestroy();
});
test('técnico no reabre cerrado; administrador sí', () => {
  for (const role of ['technician', 'admin']) {
    const f = fixture({ role, tickets: [ticket(1, 'CERRADO')] });
    drop(f.component, 'colCerrado', 'colNuevo', 'NUEVO');
    assert.equal(f.patches.length, role === 'admin' ? 1 : 0);
    f.component.ngOnDestroy();
  }
});
test('resuelto no puede moverse a nuevo, conserva las transiciones existentes', () => {
  const f = fixture({ tickets: [ticket(1, 'RESUELTO')] });
  drop(f.component, 'colResuelto', 'colNuevo', 'NUEVO');
  assert.equal(f.patches.length, 0);
  f.component.ngOnDestroy();
});
test('realtime se aplaza al arrastrar y no cambia los filtros', async () => {
  const f = fixture();
  f.component.filters.search = 'VPN';
  f.component.applyFilters();
  f.component.dragStarted();
  f.events$.next({ type: 'kanban-updated', scope: 'KANBAN' });
  await new Promise((r) => setTimeout(r, 300));
  assert.equal(f.requests.length, 1);
  f.component.dragEnded();
  await new Promise((r) => setTimeout(r, 300));
  assert.equal(f.requests.length, 2);
  assert.equal(f.component.filters.search, 'VPN');
  f.component.ngOnDestroy();
});
test('al salir cancela solicitudes y restaura el socket del topbar', () => {
  const f = fixture({ deferred: true });
  f.component.ngOnDestroy();
  assert.equal(f.responses[0].observers.length, 0);
  assert.equal(f.events$.observers.length, 0);
  assert.equal(f.connections.at(-1)[0], 3);
  assert.equal(f.connections.at(-1).length, 1);
});

test('carga páginas con concurrencia limitada y conserva el orden aunque respondan desordenadas', () => {
  const f = fixture({ deferred: true });
  const all = Array.from({ length: 450 }, (_, i) => ticket(i + 1));
  const resolve = (page) => {
    const index = f.requests.findIndex((request) => request.page === page);
    assert.ok(index >= 0, `La página ${page} debe estar solicitada`);
    f.responses[index].next({
      success: true,
      data: {
        content: all.slice(page * 100, (page + 1) * 100),
        totalElements: all.length,
      },
    });
    f.responses[index].complete();
  };
  resolve(0);
  assert.deepEqual(
    f.requests.map((request) => request.page),
    [0, 1, 2, 3],
  );
  assert.equal(f.component.loading, true);
  resolve(3);
  assert.equal(f.requests[4].page, 4);
  resolve(4);
  resolve(2);
  assert.equal(f.component.totalVisible, 0, 'No publicar un tablero parcialmente cargado');
  resolve(1);
  assert.equal(f.component.loading, false);
  assert.deepEqual(
    Array.from(f.component.colNuevo, (item) => item.id),
    all.map((item) => item.id),
  );
  f.component.ngOnDestroy();
});
