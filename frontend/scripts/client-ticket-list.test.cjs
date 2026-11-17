// Ejecutar: node --test scripts/client-ticket-list.test.cjs
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const rxjs = require('rxjs');
const file = path.resolve(__dirname, '../src/app/cliente/client-ticket-list.component.ts');
const moduleObject = { exports: {} };
vm.runInNewContext(
  ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      experimentalDecorators: true,
      useDefineForClassFields: false,
    },
  }).outputText,
  {
    exports: moduleObject.exports,
    module: moduleObject,
    Date,
    URL,
    require: (name) => {
      if (name.endsWith('/attachment-alert')) return { showAttachmentAlert() {} };
      if (name.endsWith('/attachment-policy')) return require('./attachment-policy.fixture.cjs');
      if (name === 'rxjs') return rxjs;
      if (name === '@angular/core') return { Component: () => (component) => component };
      if (
        name.startsWith('@angular/') ||
        name.startsWith('../core/') ||
        name.startsWith('../shared/')
      )
        return {};
      throw new Error(name);
    },
  },
);
const List = moduleObject.exports.ClientTicketListComponent;
function fixture(states = new Map(), deferred = false) {
  const requests = [];
  const responses = [];
  const totals = { '': 50, NUEVO: 8, EN_PROCESO: 30, RESUELTO: 7, CERRADO: 5 };
  const service = {
    listarMisTickets: (page, size, search, filters) => {
      requests.push({ page, size, search, filters });
      const response = deferred
        ? new rxjs.Subject()
        : rxjs.of({
            success: true,
            data: {
              content: [{ id: 1, titulo: 'Ticket visible' }],
              number: page,
              size,
              totalElements: totals[filters?.estado || ''] || 0,
              totalPages: 7,
            },
          });
      responses.push(response);
      return response;
    },
  };
  const state = {
    load: (key, defaults) => ({ ...defaults, ...states.get(key) }),
    save: (key, value) => states.set(key, { ...value }),
    clear: (key) => states.delete(key),
  };
  const component = new List(
    service,
    {},
    { currentUserSignal: () => ({ userId: 8 }) },
    { get: () => rxjs.of({ success: true, data: [] }) },
    { snapshot: { queryParamMap: { get: () => null } } },
    { navigate() {} },
    state,
  );
  component.ngOnInit();
  return { component, requests, responses, states };
}
test('contadores totales del servidor, no de la página visible, usan solo mis tickets', () => {
  const { component, requests } = fixture();
  assert.equal(component.tickets.length, 1);
  assert.equal(component.statusCounts[''], 50);
  assert.equal(component.statusCounts.EN_PROCESO, 30);
  assert.equal(requests.filter((r) => r.size === 1).length, 5);
  assert.equal(requests.at(-1).size, 8);
  assert.deepEqual(Array.from(component.displayedColumns), [
    'titulo',
    'prioridad',
    'estado',
    'fecha',
    'acciones',
  ]);
});
test('paginación y pestañas de estado reutilizan los contadores, conservando otros filtros', () => {
  const { component, requests } = fixture();
  component.irAPagina(2);
  assert.equal(requests.length, 7);
  assert.equal(requests.at(-1).page, 2);
  component.seleccionarEstado('EN_PROCESO');
  assert.equal(requests.length, 8);
  assert.equal(requests.at(-1).filters.estado, 'EN_PROCESO');
  assert.equal(requests.at(-1).page, 0);
  assert.equal(component.statusCounts[''], 50);
});
test('todos los filtros se envían al listado y a contadores sin limitar por estado seleccionado', () => {
  const { component, requests } = fixture();
  Object.assign(component, {
    busqueda: ' correo ',
    prioridadSeleccionada: 'Alta',
    estadoSeleccionado: 'RESUELTO',
    categoriaSeleccionada: 3,
    fechaDesde: '2026-09-01',
    fechaHasta: '2026-09-30',
  });
  component.aplicarFiltros();
  const latest = requests.slice(-6);
  assert.equal(latest.length, 6);
  for (const request of latest) {
    assert.equal(request.search, 'correo');
    assert.equal(request.filters.prioridad, 'Alta');
    assert.equal(request.filters.categoriaId, 3);
    assert.equal(request.filters.fechaHasta, '2026-09-30');
  }
  assert.equal(latest[0].filters.estado, undefined);
  assert.equal(latest.at(-1).filters.estado, 'RESUELTO');
});
test('volver del detalle restaura filtros, página, tamaño y panel avanzado', () => {
  const states = new Map();
  const first = fixture(states).component;
  first.busqueda = 'vpn';
  first.estadoSeleccionado = 'ASIGNADO';
  first.categoriaSeleccionada = 2;
  first.toggleFilters();
  first.cambiarTamanoPagina(12);
  first.irAPagina(2);
  first.ngOnDestroy();
  const { component, requests } = fixture(states);
  assert.equal(component.filtersOpen, true);
  assert.equal(component.categoriaSeleccionada, 2);
  assert.equal(requests.at(-1).search, 'vpn');
  assert.equal(requests.at(-1).size, 12);
  assert.equal(requests.at(-1).page, 2);
  assert.equal(requests.at(-1).filters.estado, 'ASIGNADO');
});
test('limpiar restaura todos los filtros sin perder tamaño de página ni visibilidad del panel', () => {
  const { component, requests } = fixture();
  Object.assign(component, {
    busqueda: 'vpn',
    estadoSeleccionado: 'NUEVO',
    prioridadSeleccionada: 'Alta',
    categoriaSeleccionada: 3,
    fechaDesde: '2026-09-01',
    fechaHasta: '2026-09-30',
    filtersOpen: true,
    pageSize: 12,
  });
  component.limpiarFiltros();
  assert.equal(component.hasActiveFilters, false);
  assert.equal(component.filtersOpen, true);
  assert.equal(requests.at(-1).size, 12);
  assert.equal(requests.at(-1).page, 0);
});
test('un rango de fechas inválido no consulta la API', () => {
  const { component, requests } = fixture();
  component.fechaDesde = '2026-10-10';
  component.fechaHasta = '2026-10-01';
  component.aplicarFiltros();
  assert.equal(requests.length, 6);
  assert.match(component.filterError, /posterior/);
  assert.equal(component.filtersOpen, true);
});
test('cancelar consultas anteriores evita resultados viejos y se cancela al salir', () => {
  const { component, responses, requests } = fixture(new Map(), true);
  const previous = responses.at(-1);
  component.busqueda = 'nuevo filtro';
  component.aplicarFiltros();
  previous.next({ success: true, data: { content: [{ id: 99 }], totalElements: 99 } });
  assert.equal(component.tickets.length, 0);
  const current = responses.at(-1);
  current.next({ success: true, data: { content: [{ id: 3 }], totalElements: 1 } });
  assert.equal(component.tickets[0].id, 3);
  component.cargarTickets();
  const afterExit = responses.at(-1);
  component.ngOnDestroy();
  afterExit.next({ success: true, data: { content: [{ id: 999 }] } });
  assert.equal(component.tickets[0].id, 3);
  assert.ok(requests.length > 6);
});
test('errores de carga no se confunden con un listado vacío ni con contadores cero', () => {
  const { component, responses } = fixture(new Map(), true);
  responses[0].error(new Error('network'));
  assert.equal(component.statusCounts[''], undefined);
  assert.equal(component.countsLoading, false);
  responses.at(-1).error(new Error('network'));
  assert.match(component.listError, /cargar tus tickets/);
  assert.equal(component.loadingTickets, false);
});
test('estilos distinguen prioridades y todos los estados disponibles', () => {
  const { component } = fixture();
  assert.equal(component.priorityTone('MEDIA'), 'medium');
  assert.equal(component.priorityTone('Crítica'), 'critical');
  assert.equal(component.statusTone('PENDIENTE_CLIENTE'), 'waiting');
  assert.equal(component.statusTone('ASIGNADO'), 'assigned');
  assert.equal(component.statusTone('DESCONOCIDO'), 'neutral');
});

test('una respuesta fallida de contadores permite reintentarlos sin cambiar los filtros', () => {
  const { component, responses, requests } = fixture(new Map(), true);
  for (const response of responses.slice(0, 5)) {
    response.next({ success: false });
    response.complete();
  }
  assert.equal(component.statusCounts[''], null);
  component.cargarTickets();
  assert.equal(requests.filter((request) => request.size === 1).length, 10);
});
