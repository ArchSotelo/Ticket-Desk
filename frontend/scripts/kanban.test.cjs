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
const codes = ['NUEVO', 'EN_PROCESO', 'RESUELTO', 'CERRADO'];
function board(tickets) {
  const groups = {
    NUEVO: tickets.filter((item) => ['NUEVO', 'ASIGNADO'].includes(item.estadoCodigo)),
    EN_PROCESO: tickets.filter((item) => ['EN_PROCESO', 'PENDIENTE_CLIENTE'].includes(item.estadoCodigo)),
    RESUELTO: tickets.filter((item) => item.estadoCodigo === 'RESUELTO'),
    CERRADO: tickets.filter((item) => item.estadoCodigo === 'CERRADO'),
  };
  return {
    columnas: codes.map((codigo) => ({
      codigo,
      tickets: groups[codigo].slice(0, 50),
      total: groups[codigo].length,
      pagina: 0,
      tamano: 50,
      hayMas: groups[codigo].length > 50,
    })),
    prioridades: [...new Set(tickets.map((item) => item.prioridadNombre))],
    tecnicos: [{ id: 4, nombre: 'Carlos Mendoza' }],
  };
}
function fixture({ role = 'technician', tickets = [ticket(1), ticket(2, 'EN_PROCESO')], saved = new Map(), deferred = false, admin = role === 'admin' } = {}) {
  const requests = [], responses = [], columnRequests = [], columnResponses = [], patches = [], navigations = [], connections = [];
  const events$ = new rxjs.Subject();
  const service = {
    obtenerKanban: (filters) => {
      const response = deferred ? new rxjs.Subject() : rxjs.of({ success: true, data: board(tickets) });
      requests.push({ filters, response });
      responses.push(response);
      return response;
    },
    cargarColumnaKanban: (code, page, size, filters) => {
      const response = new rxjs.Subject();
      columnRequests.push({ code, page, size, filters, response });
      columnResponses.push(response);
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
  return { component, requests, responses, columnRequests, columnResponses, patches, saved, navigations, events$, connections };
}
function drop(component, from = 'colNuevo', to = 'colProceso', state = 'EN_PROCESO') {
  component.drop({
    previousContainer: { data: component[from] },
    container: { data: component[to], id: state },
    previousIndex: 0,
    currentIndex: 0,
  });
}

test('cada portal conserva sus rutas aunque el usuario tenga ambos roles', () => {
  for (const role of ['admin', 'technician']) {
    const f = fixture({ role, admin: true });
    f.component.abrirDetalle(ticket(9));
    assert.equal(f.component.boardRoute, role === 'admin' ? '/tickets/kanban' : '/tecnico/kanban');
    assert.equal(f.navigations[0].target[0], role === 'admin' ? '/tickets/detail' : '/tecnico/tickets');
    assert.equal(f.navigations[0].options.queryParams.returnTo, f.component.boardRoute);
    assert.equal(f.component.newTicketRoute, role === 'admin' ? '/tickets/new' : '/tecnico/nuevo-ticket');
    f.component.ngOnDestroy();
  }
});

test('carga el tablero por columnas y conserva los contadores del servidor', () => {
  const f = fixture({ tickets: Array.from({ length: 215 }, (_, i) => ticket(i + 1)) });
  assert.equal(f.requests.length, 1);
  assert.equal(f.component.colNuevo.length, 50);
  assert.equal(f.component.totalVisible, 215);
  assert.equal(f.component.columns.find((column) => column.code === 'NUEVO').hasMore, true);
  f.component.ngOnDestroy();
});

test('agrupa asignados y pendientes sin incluir cancelados', () => {
  const f = fixture({ tickets: ['NUEVO', 'ASIGNADO', 'EN_PROCESO', 'PENDIENTE_CLIENTE', 'RESUELTO', 'CERRADO', 'CANCELADO'].map((state, i) => ticket(i, state)) });
  assert.equal(f.component.colNuevo.length, 2);
  assert.equal(f.component.colProceso.length, 2);
  assert.equal(f.component.colResuelto.length, 1);
  assert.equal(f.component.colCerrado.length, 1);
  assert.equal(f.component.totalVisible, 6);
  f.component.ngOnDestroy();
});

test('envía filtros al servidor y conserva el estado de filtros por portal', async () => {
  const saved = new Map([['admin-kanban', { search: 'admin' }], ['technician-kanban', { search: 'VPN' }]]);
  const f = fixture({ saved });
  assert.equal(f.component.filters.search, 'VPN');
  Object.assign(f.component.filters, { search: ' conexion ', priority: 'Alta', technician: '4' });
  f.component.applyFilters();
  assert.equal(saved.get('technician-kanban').search, ' conexion ');
  assert.equal(saved.get('admin-kanban').search, 'admin');
  await new Promise((resolve) => setTimeout(resolve, 300));
  assert.equal(f.requests[1].filters.busqueda, 'conexion');
  assert.equal(f.requests[1].filters.prioridad, 'Alta');
  assert.equal(f.requests[1].filters.tecnico, '4');
  f.component.ngOnDestroy();
});

test('ignora filtros antiguos con tipos inválidos', () => {
  const f = fixture({ saved: new Map([['technician-kanban', { search: null, priority: 1, technician: false }]]) });
  assert.equal(f.component.hasFilters, false);
  f.component.ngOnDestroy();
});

test('no publica el tablero hasta recibir la respuesta inicial', () => {
  const f = fixture({ deferred: true });
  assert.equal(f.component.loading, true);
  f.responses[0].next({ success: true, data: board([ticket(1)]) });
  assert.equal(f.component.totalVisible, 1);
  assert.equal(f.component.loading, false);
  f.component.ngOnDestroy();
});

test('error de recarga conserva datos anteriores y deshabilita movimientos', () => {
  const f = fixture({ deferred: true });
  f.responses[0].next({ success: true, data: board([ticket(1)]) });
  f.component.cargarTickets();
  assert.equal(f.requests.length, 2);
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

test('actualiza tarjeta desde respuesta del servidor al cambiar el estado', () => {
  const f = fixture();
  drop(f.component);
  f.patches[0].response.next({ success: true });
  assert.equal(f.component.colProceso[0].estadoCodigo, 'EN_PROCESO');
  assert.match(f.component.moveMessage, /actualizado/);
  f.component.ngOnDestroy();
});

test('técnico no reabre cerrados; administrador sí', () => {
  for (const role of ['technician', 'admin']) {
    const f = fixture({ role, tickets: [ticket(1, 'CERRADO')] });
    drop(f.component, 'colCerrado', 'colNuevo', 'NUEVO');
    assert.equal(f.patches.length, role === 'admin' ? 1 : 0);
    f.component.ngOnDestroy();
  }
});

test('resuelto no puede moverse a nuevo', () => {
  const f = fixture({ tickets: [ticket(1, 'RESUELTO')] });
  drop(f.component, 'colResuelto', 'colNuevo', 'NUEVO');
  assert.equal(f.patches.length, 0);
  f.component.ngOnDestroy();
});

test('realtime se aplaza al arrastrar y recarga el tablero al terminar', async () => {
  const f = fixture();
  f.component.dragStarted();
  f.events$.next({ type: 'kanban-updated', scope: 'KANBAN' });
  await new Promise((resolve) => setTimeout(resolve, 300));
  assert.equal(f.requests.length, 1);
  f.component.dragEnded();
  await new Promise((resolve) => setTimeout(resolve, 300));
  assert.equal(f.requests.length, 2);
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

test('carga más tarjetas solo para la columna que lo solicita', () => {
  const f = fixture({ tickets: Array.from({ length: 60 }, (_, i) => ticket(i + 1)) });
  f.component.loadMore('NUEVO');
  assert.equal(f.columnRequests.length, 1);
  assert.equal(f.columnRequests[0].code, 'NUEVO');
  assert.equal(f.columnRequests[0].page, 1);
  assert.equal(f.columnRequests[0].size, 50);
  f.columnResponses[0].next({
    success: true,
    data: { codigo: 'NUEVO', tickets: [ticket(51)], total: 60, pagina: 1, tamano: 50, hayMas: false },
  });
  assert.equal(f.component.colNuevo.length, 51);
  assert.equal(f.component.totalVisible, 60);
  f.component.ngOnDestroy();
});
