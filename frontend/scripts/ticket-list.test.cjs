// Ejecutar: node --test scripts/ticket-list.test.cjs
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const rxjs = require('rxjs');

function loadComponent() {
  const file = path.resolve(__dirname, '../src/app/tickets/ticket-list/ticket-list.component.ts');
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      experimentalDecorators: true,
    },
  }).outputText;
  const module = { exports: {} };
  class HttpParams {
    constructor(values = {}) {
      this.values = values;
    }
    set(key, value) {
      return new HttpParams({ ...this.values, [key]: value });
    }
    get(key) {
      return this.values[key] ?? null;
    }
  }
  vm.runInNewContext(
    code,
    {
      exports: module.exports,
      module,
      Date,
      URL,
      require: (name) => {
        if (name === 'rxjs') return rxjs;
        if (name === '@angular/core') return { Component: () => (component) => component };
        if (name === '@angular/common/http') return { HttpParams };
        if (name.startsWith('@angular/') || name.startsWith('../../core/')) return {};
        throw new Error(`Dependencia inesperada: ${name}`);
      },
    },
    { filename: file },
  );
  return module.exports.TicketListComponent;
}

const TicketList = loadComponent();

function fixture(role, savedStates = new Map(), queryTicketId = null, options = {}) {
  const listRequests = [];
  const listResponses = [];
  const httpRequests = [];
  const navigations = [];
  const exportResponse = new rxjs.Subject();
  const ticketService = {
    listarTickets: (page, size, search, filters) => {
      listRequests.push({ page, size, search, filters });
      const total = options.totals ? (options.totals[filters.estado || ''] ?? 0) : 40;
      const response = options.deferred
        ? new rxjs.Subject()
        : rxjs.of({
            success: true,
            data: {
              content: [],
              number: page,
              size,
              totalElements: total,
              totalPages: Math.ceil(total / size),
            },
          });
      listResponses.push(response);
      return response;
    },
  };
  const http = {
    get: (url, options) => {
      httpRequests.push({ url, options });
      return url.endsWith('/excel') ? exportResponse : rxjs.of({ success: true, data: [] });
    },
  };
  const filterState = {
    load: (key, defaults) => ({ ...defaults, ...savedStates.get(key) }),
    save: (key, value) => savedStates.set(key, { ...value }),
    clear: (key) => savedStates.delete(key),
  };
  const route = { snapshot: { data: { role }, queryParamMap: { get: () => queryTicketId } } };
  const router = { navigate: (target, options) => navigations.push({ target, options }) };
  const component = new TicketList(ticketService, http, route, router, filterState);
  component.ngOnInit();
  return {
    component,
    listRequests,
    listResponses,
    httpRequests,
    navigations,
    savedStates,
    exportResponse,
  };
}

test('el listado compartido mantiene las rutas del administrador y técnico', () => {
  for (const [role, listRoute, newRoute, detailRoute] of [
    ['admin', '/tickets/list', '/tickets/new', '/tickets/detail'],
    ['technician', '/tecnico', '/tecnico/nuevo-ticket', '/tecnico/tickets'],
  ]) {
    const { component, httpRequests } = fixture(role);
    assert.equal(component.listRoute, listRoute);
    assert.equal(component.newTicketRoute, newRoute);
    assert.equal(component.detailRoute(42).join('/'), `${detailRoute}/42`);
    assert.equal(
      httpRequests.some((r) => r.url.includes('/users')),
      false,
    );
  }
});

test('cada portal recupera sus filtros y paginación al regresar del detalle', () => {
  const states = new Map([
    ['admin-tickets', { busqueda: 'administración', pageIndex: 2 }],
    ['technician-tickets', { busqueda: 'soporte', pageIndex: 3 }],
  ]);
  for (const [role, expectedSearch, expectedPage] of [
    ['admin', 'administración', 2],
    ['technician', 'soporte', 3],
  ]) {
    const { listRequests } = fixture(role, states);
    assert.equal(listRequests[0].search, expectedSearch);
    assert.equal(listRequests[0].page, expectedPage);
  }
});

test('aplicar filtros en un portal no sobrescribe los filtros del otro', () => {
  const states = new Map([['admin-tickets', { busqueda: 'admin', pageIndex: 2 }]]);
  const { component, listRequests } = fixture('technician', states);
  component.estadoSeleccionado = 'EN_PROCESO';
  component.categoriaSeleccionada = 6;
  component.aplicarFiltros();
  assert.equal(states.get('admin-tickets').busqueda, 'admin');
  assert.equal(states.get('technician-tickets').estadoSeleccionado, 'EN_PROCESO');
  assert.equal(listRequests.at(-1).page, 0);
  assert.equal(listRequests.at(-1).filters.categoriaId, 6);
});

test('el estado abierto del panel de filtros se conserva al regresar', () => {
  const states = new Map();
  const first = fixture('technician', states).component;
  first.toggleFilters();
  first.ngOnDestroy();
  assert.equal(fixture('technician', states).component.filtersOpen, true);
});

test('ambos portales exportan todos los filtros sin limitar el Excel a una página', () => {
  for (const role of ['admin', 'technician']) {
    const { component, httpRequests, exportResponse } = fixture(role);
    Object.assign(component, {
      busqueda: '  correo  ',
      estadoSeleccionado: 'RESUELTO',
      prioridadSeleccionada: 'Alta',
      categoriaSeleccionada: 9,
      fechaDesde: '2026-09-01',
      fechaHasta: '2026-09-30',
      pageIndex: 3,
    });
    component.exportarExcel();
    component.exportarExcel();
    const exports = httpRequests.filter((r) => r.url.endsWith('/excel'));
    assert.equal(exports.length, 1);
    const params = exports[0].options.params;
    for (const [key, value] of Object.entries({
      busqueda: 'correo',
      estado: 'RESUELTO',
      prioridad: 'Alta',
      categoriaId: '9',
      fechaDesde: '2026-09-01',
      fechaHasta: '2026-09-30',
    }))
      assert.equal(params.get(key), value);
    assert.equal(params.get('page'), null);
    exportResponse.error({ status: 500 });
    assert.equal(component.exporting, false);
    assert.match(component.errorMessage, /exportar/);
  }
});

test('las notificaciones antiguas abren el detalle del portal correcto', () => {
  for (const [role, expected] of [
    ['admin', '/tickets/detail'],
    ['technician', '/tecnico/tickets'],
  ]) {
    const { component, navigations } = fixture(role, new Map(), '42');
    assert.equal(navigations[0].target[0], expected);
    assert.equal(navigations[0].target[1], 42);
    assert.equal(navigations[0].options.queryParams.returnTo, component.listRoute);
  }
});

test('contadores por estado utilizan los totales del servidor y no la página visible', () => {
  for (const role of ['admin', 'technician']) {
    const f = fixture(role, new Map(), null, {
      totals: { '': 120, NUEVO: 20, EN_PROCESO: 65, RESUELTO: 10, CERRADO: 5 },
    });
    assert.equal(f.component.totalElements, 120);
    assert.equal(f.component.counts[''], 120);
    assert.equal(f.component.counts.EN_PROCESO, 65);
    assert.equal(f.listRequests.length, 6);
    assert.ok(f.listRequests.slice(1).every((r) => r.size === 1 && r.page === 0));
    f.component.seleccionarEstado('NUEVO');
    assert.equal(f.component.totalElements, 20);
    assert.equal(f.component.counts[''], 120);
    assert.equal(f.listRequests.length, 7);
    f.component.ngOnDestroy();
  }
});

test('todos los filtros acompañan los contadores, excepto el estado, y paginar no los vuelve a consultar', () => {
  const f = fixture('technician');
  Object.assign(f.component, {
    busqueda: '  correo ',
    prioridadSeleccionada: 'Alta',
    categoriaSeleccionada: 6,
    fechaDesde: '2026-09-01',
    fechaHasta: '2026-09-30',
    estadoSeleccionado: 'CERRADO',
  });
  f.component.aplicarFiltros();
  const requests = f.listRequests.slice(-6);
  assert.equal(requests[0].filters.estado, 'CERRADO');
  assert.equal(requests[1].filters.estado, undefined);
  for (const req of requests) {
    assert.equal(req.search, 'correo');
    assert.equal(req.filters.prioridad, 'Alta');
    assert.equal(req.filters.categoriaId, 6);
    assert.equal(req.filters.fechaDesde, '2026-09-01');
    assert.equal(req.filters.fechaHasta, '2026-09-30');
    assert.equal(req.filters.sortBy, 'fechaCreacion');
    assert.equal(req.filters.sortDir, 'DESC');
  }
  const count = f.listRequests.length;
  f.component.irAPagina(1);
  assert.equal(f.listRequests.length, count + 1);
  f.component.cambiarTamanoPagina(12);
  assert.equal(f.listRequests.length, count + 2);
  assert.equal(f.component.pageIndex, 0);
  f.component.ngOnDestroy();
});

test('fechas invertidas no consultan listado ni exportación y abren los filtros avanzados', () => {
  const f = fixture('admin'),
    initial = f.listRequests.length;
  f.component.fechaDesde = '2026-10-08';
  f.component.fechaHasta = '2026-09-30';
  f.component.aplicarFiltros();
  f.component.exportarExcel();
  f.component.cargarContadores(true);
  assert.equal(f.listRequests.length, initial);
  assert.equal(f.httpRequests.filter((r) => r.url.endsWith('/excel')).length, 0);
  assert.equal(f.component.filtersOpen, true);
  assert.match(f.component.filterError, /posterior/);
  f.component.fechaHasta = '2026-10-10';
  f.component.aplicarFiltros();
  assert.equal(f.component.filterError, '');
  f.component.ngOnDestroy();
});

test('nuevos filtros cancelan respuestas antiguas del listado y del resumen', () => {
  const f = fixture('technician', new Map(), null, { deferred: true });
  f.component.busqueda = 'nuevo filtro';
  f.component.aplicarFiltros();
  assert.equal(f.listResponses[0].observed, false);
  assert.equal(f.listResponses[1].observed, false);
  f.listResponses[0].next({ success: true, data: { totalElements: 999, content: [{ id: 99 }] } });
  assert.equal(f.component.tickets.length, 0);
  f.listResponses[6].next({
    success: true,
    data: { totalElements: 12, number: 0, size: 8, content: [{ id: 6 }] },
  });
  f.listResponses[6].complete();
  assert.equal(f.component.tickets[0].id, 6);
  assert.equal(f.component.totalElements, 12);
  f.component.ngOnDestroy();
  assert.equal(f.listResponses[7].observed, false);
});

test('errores del resumen no son ceros ni borran el listado, y se pueden reintentar', () => {
  const f = fixture('admin', new Map(), null, { deferred: true });
  f.listResponses[0].next({
    success: true,
    data: { totalElements: 80, number: 0, size: 8, content: [{ id: 1 }] },
  });
  f.listResponses[0].complete();
  f.listResponses[1].error(new Error('Resumen no disponible'));
  assert.equal(f.component.counts[''], null);
  assert.equal(f.component.loadingCounts, false);
  assert.match(f.component.countsError, /resumen/);
  assert.equal(f.component.tickets.length, 1);
  assert.equal(f.component.totalElements, 80);
  f.component.cargarContadores(true);
  f.listResponses.slice(6).forEach((response) => {
    response.next({ success: true, data: { totalElements: 10 } });
    response.complete();
  });
  assert.equal(f.component.counts[''], 10);
  assert.equal(f.component.countsError, '');
  f.component.ngOnDestroy();
});

test('respuestas incompletas y errores de listado no aparentan una lista vacía válida', () => {
  const f = fixture('technician', new Map(), null, { deferred: true });
  f.listResponses[0].next({ success: true });
  f.listResponses[0].complete();
  assert.match(f.component.listError, /cargar/);
  assert.equal(f.component.loadingTickets, false);
  for (let i = 1; i <= 5; i++) {
    f.listResponses[i].next({ success: i !== 2, data: { totalElements: 6 } });
    f.listResponses[i].complete();
  }
  assert.equal(f.component.counts.NUEVO, null);
  assert.equal(f.component.counts[''], 6);
  assert.ok(f.component.countsError);
  f.component.cargarTickets();
  f.listResponses[6].error(new Error('Error de red'));
  assert.match(f.component.listError, /Intenta/);
  f.component.ngOnDestroy();
});

test('limpiar conserva el tamaño de página y el panel, sin afectar al otro portal', () => {
  const states = new Map([['admin-tickets', { busqueda: 'administración' }]]);
  const f = fixture('technician', states);
  Object.assign(f.component, {
    busqueda: 'soporte',
    estadoSeleccionado: 'ASIGNADO',
    prioridadSeleccionada: 'Alta',
    categoriaSeleccionada: 8,
    fechaDesde: '2026-09-01',
    filtersOpen: true,
    pageSize: 12,
  });
  f.component.limpiarFiltros();
  assert.equal(f.component.hasFilters, false);
  assert.equal(f.component.pageSize, 12);
  assert.equal(f.component.filtersOpen, true);
  assert.equal(states.get('admin-tickets').busqueda, 'administración');
  assert.equal(states.get('technician-tickets').pageIndex, 0);
  f.component.ngOnDestroy();
});

test('nombres, prioridades, estados, fechas e identificadores se presentan de forma segura', () => {
  const f = fixture('admin');
  assert.equal(f.component.initials('  Ana María Torres  '), 'AT');
  assert.equal(f.component.initials('Carlos'), 'C');
  assert.equal(f.component.initials(), '?');
  assert.equal(f.component.avatarTone('Ana Torres'), f.component.avatarTone('Ana Torres'));
  assert.equal(f.component.priorityTone('Crítica'), 'red');
  assert.equal(f.component.priorityTone('Alta'), 'orange');
  assert.equal(f.component.statusTone('ASIGNADO'), 'violet');
  assert.equal(f.component.statusTone('PENDIENTE_CLIENTE'), 'amber');
  assert.equal(f.component.statusTone('CANCELADO'), 'red');
  assert.equal(f.component.statusTone('OTRO'), 'neutral');
  assert.equal(f.component.formatDate('fecha inválida'), '—');
  assert.equal(f.component.formatDate(), '—');
  assert.match(f.component.formatDate('2026-09-29T12:00:00'), /29.*set.*2026/);
  assert.equal(f.component.trackTicket(0, { id: 6 }), 6);
  f.component.ngOnDestroy();
});
