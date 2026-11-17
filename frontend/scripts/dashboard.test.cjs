// node --test scripts/dashboard.test.cjs -- sin backend ni registros reales
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const rxjs = require('rxjs');
function load(storage) {
  const file = path.resolve(__dirname, '../src/app/dashboard/dashboard.component.ts');
  const mod = { exports: {} };
  vm.runInNewContext(
    ts.transpileModule(fs.readFileSync(file, 'utf8'), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        experimentalDecorators: true,
      },
    }).outputText,
    {
      exports: mod.exports,
      module: mod,
      localStorage: storage,
      require: (name) => {
        if (name === 'rxjs') return rxjs;
        if (name === '@angular/core') return { Component: () => (component) => component };
        if (name === '@angular/cdk/drag-drop')
          return {
            moveItemInArray: (list, from, to) => list.splice(to, 0, list.splice(from, 1)[0]),
          };
        if (name.startsWith('@angular/') || name.startsWith('../core/')) return {};
        throw new Error(name);
      },
    },
  );
  return mod.exports.DashboardComponent;
}
const stats = (extra) => ({
  totalTickets: 104,
  ticketsAbiertos: 0,
  ticketsEnProceso: 0,
  ticketsResueltos: 0,
  ticketsCerrados: 104,
  ticketsVencidosSla: 8,
  porcentajeCumplimientoSla: 90.38,
  ticketsPorEstado: { Cerrado: 104 },
  ticketsPorPrioridad: { Baja: 3, Media: 30, Alta: 65, Crítica: 6 },
  ticketsPorCategoria: {
    'Accesos & Seguridad': 4,
    Sistema: 86,
    Software: 10,
    Redes: 3,
    Capacitaciones: 1,
  },
  ticketsPorTecnico: { 'Carlos Campos': 104 },
  ticketsSlaCumplidos: 94,
  ticketsSlaIncumplidos: 10,
  ticketsSlaPendientes: 0,
  fechasTendencia: ['08/10', '09/10', '10/10', '11/10', '12/10', '13/10', '14/10'],
  ticketsCreadosPorFecha: [0, 1, 2, 0, 0, 0, 0],
  ticketsResueltosPorFecha: [0, 0, 1, 0, 0, 0, 0],
  ...extra,
});
function fixture(options = {}) {
  const values = new Map(
    options.saved ? [['dashboard-chart-order', JSON.stringify(options.saved)]] : [],
  );
  const storage = {
    getItem: (key) => values.get(key) || null,
    setItem: (key, value) => {
      if (options.storageFails) throw new Error('blocked');
      values.set(key, value);
    },
  };
  const Component = load(storage),
    metrics = [],
    recent = [],
    requests = [],
    metricRequests = [];
  const savedFilters = options.savedFilters || new Map();
  const filterState = {
    load: (key, defaults) => ({ ...defaults, ...savedFilters.get(key) }),
    save: (key, value) => savedFilters.set(key, { ...value }),
  };
  const service = {
    obtenerMetricas: (params) => {
      metricRequests.push(params);
      const response = new rxjs.Subject();
      metrics.push(response);
      return response;
    },
  };
  const tickets = {
    listarTickets: (...args) => {
      requests.push(args);
      const response = new rxjs.Subject();
      recent.push(response);
      return response;
    },
  };
  const component = new Component(
    service,
    tickets,
    { snapshot: { data: { role: options.role || 'admin' } } },
    filterState,
  );
  component.ngOnInit();
  const send = (data) => metrics.at(-1).next({ success: true, data });
  return { component, metrics, recent, requests, values, send, metricRequests, savedFilters };
}
test('ambos portales navegan a su listado y detalle con retorno al dashboard', () => {
  for (const role of ['admin', 'technician']) {
    const f = fixture({ role });
    assert.equal(f.component.listRoute, role === 'admin' ? '/tickets/list' : '/tecnico');
    assert.equal(
      f.component.detailRoute({ id: 104 })[0],
      role === 'admin' ? '/tickets/detail' : '/tecnico/tickets',
    );
    assert.equal(
      f.component.dashboardRoute,
      role === 'admin' ? '/dashboard' : '/tecnico/dashboard',
    );
    f.component.ngOnDestroy();
  }
});
test('mientras carga no inventa ceros ni gráficos de ejemplo', () => {
  const f = fixture();
  assert.equal(
    f.component.metrics.every((metric) => metric.value === '—'),
    true,
  );
  assert.equal(f.component.stateEntries.length, 0);
  assert.equal(f.component.trendAvailable, false);
  f.component.ngOnDestroy();
});
test('usa métricas globales del servidor y no cuenta cinco tickets como todo el historial', () => {
  const f = fixture();
  f.send(stats());
  f.recent[0].next({
    success: true,
    data: {
      content: Array.from({ length: 5 }, (_, id) => ({ id, tecnicoNombre: 'Otro técnico' })),
    },
  });
  assert.equal(f.component.metrics[0].value, '104');
  assert.equal(f.component.technicianEntries[0].value, 104);
  assert.equal(f.component.technicianEntries.length, 1);
  assert.equal(f.component.categoryEntries[0].value, 86);
  f.component.ngOnDestroy();
});
test('solicita solo los cinco recientes con orden explícito por creación descendente', () => {
  const f = fixture();
  const [page, size, search, filters] = f.requests[0];
  assert.equal(page, 0);
  assert.equal(size, 5);
  assert.equal(search, '');
  assert.equal(filters.sortBy, 'fechaCreacion');
  assert.equal(filters.sortDir, 'DESC');
  f.component.ngOnDestroy();
});
test('0% de cumplimiento permanece 0% y no se reemplaza por 100%', () => {
  const f = fixture();
  f.send(stats({ porcentajeCumplimientoSla: 0 }));
  assert.equal(f.component.metrics[5].value, '0.00%');
  f.component.ngOnDestroy();
});
test('Incumplidos SLA usa el resultado real, no tickets con plazo vencido', () => {
  const f = fixture();
  f.send(stats());
  assert.equal(f.component.metrics[4].value, '10');
  assert.equal(f.component.slaTotal, 104);
  f.component.ngOnDestroy();
});
test('sin resultados SLA no deduce cumplidos ni pendientes a partir del total de tickets', () => {
  const f = fixture();
  f.send(
    stats({
      ticketsSlaCumplidos: undefined,
      ticketsSlaIncumplidos: undefined,
      ticketsSlaPendientes: undefined,
    }),
  );
  assert.equal(f.component.slaEntries.length, 0);
  assert.equal(f.component.metrics[4].value, '—');
  f.component.ngOnDestroy();
});
test('la distribución SLA incluye pendientes y su porcentaje central coincide con el anillo', () => {
  const f = fixture();
  f.send(stats({ ticketsSlaCumplidos: 40, ticketsSlaIncumplidos: 10, ticketsSlaPendientes: 50 }));
  assert.equal(f.component.slaTotal, 100);
  assert.equal(f.component.slaPercent, 40);
  assert.match(f.component.slaBackground, /40%/);
  f.component.ngOnDestroy();
});
test('tendencia íntegramente en cero sigue siendo válida y no se inventan resoluciones', () => {
  const f = fixture();
  f.send(
    stats({
      ticketsCreadosPorFecha: [0, 0, 0, 0, 0, 0, 0],
      ticketsResueltosPorFecha: [0, 0, 0, 0, 0, 0, 0],
    }),
  );
  f.recent[0].next({
    success: true,
    data: { content: [{ estadoCodigo: 'CERRADO', fechaCreacion: new Date().toISOString() }] },
  });
  assert.equal(f.component.trendAvailable, true);
  assert.equal(f.component.trendTotal(f.component.trendResolved), 0);
  assert.equal(
    f.component.trendTicks.every((tick) => Number.isInteger(tick.value)),
    true,
  );
  f.component.ngOnDestroy();
});
test('si faltan fechas o hay series incompletas, no presenta una tendencia parcial', () => {
  for (const extra of [
    { fechasTendencia: [] },
    { ticketsCreadosPorFecha: [1] },
    { ticketsResueltosPorFecha: [NaN, 0, 0, 0, 0, 0, 0] },
  ]) {
    const f = fixture();
    f.send(stats(extra));
    assert.equal(f.component.trendAvailable, false);
    f.component.ngOnDestroy();
  }
});
test('sin desgloses no usa los recientes como reemplazo de los agregados', () => {
  const f = fixture();
  f.send(
    stats({
      ticketsPorCategoria: undefined,
      ticketsPorTecnico: undefined,
      ticketsPorEstado: undefined,
    }),
  );
  f.recent[0].next({
    success: true,
    data: {
      content: [{ categoriaNombre: 'Software', tecnicoNombre: 'Carlos', estadoCodigo: 'NUEVO' }],
    },
  });
  assert.equal(f.component.categoryEntries.length, 0);
  assert.equal(f.component.technicianEntries.length, 0);
  assert.equal(f.component.stateEntries.length, 0);
  f.component.ngOnDestroy();
});
test('ordena categorías por volumen y reconoce prioridades con acentos y estados dinámicos', () => {
  const f = fixture();
  f.send(stats({ ticketsPorEstado: { CANCELADO: 3, CERRADO: 101 } }));
  assert.equal(f.component.categoryEntries[0].name, 'Sistema');
  assert.equal(f.component.priorityEntries[3].name, 'Crítica');
  assert.equal(
    f.component.stateEntries.filter((e) => f.component.stateTone(e.name) === 'slate').length,
    1,
  );
  assert.equal(f.component.priorityTone('CRÍTICA'), 'red');
  assert.equal(f.component.stateTone('EN_PROCESO'), 'blue');
  f.component.ngOnDestroy();
});
test('historial vacío tiene valores reales en cero y anillos neutros sin divisiones inválidas', () => {
  const f = fixture();
  f.send(
    stats({
      totalTickets: 0,
      ticketsPorEstado: {},
      ticketsSlaCumplidos: 0,
      ticketsSlaIncumplidos: 0,
      ticketsSlaPendientes: 0,
    }),
  );
  assert.equal(f.component.metrics[0].value, '0');
  assert.equal(f.component.stateTotal, 0);
  assert.equal(f.component.stateBackground, 'var(--db-track)');
  assert.equal(f.component.slaPercent, undefined);
  assert.equal(f.component.barWidth(0, 0), 0);
  f.component.ngOnDestroy();
});
test('errores de métricas no borran recientes y reintentar conserva los últimos agregados', () => {
  const f = fixture();
  f.send(stats());
  f.recent[0].next({ success: true, data: { content: [{ id: 104 }] } });
  f.component.reloadMetrics();
  f.metrics[1].error(new Error('offline'));
  assert.equal(f.component.stats.totalTickets, 104);
  assert.match(f.component.metricsError, /últimos datos/);
  assert.equal(f.component.latestTickets.length, 1);
  f.component.reloadMetrics();
  f.send(stats({ totalTickets: 105 }));
  assert.equal(f.component.metricsError, '');
  assert.equal(f.component.metrics[0].value, '105');
  f.component.ngOnDestroy();
});
test('errores de recientes no borran métricas ni aparecen como lista vacía válida', () => {
  const f = fixture();
  f.send(stats());
  f.recent[0].error(new Error('offline'));
  assert.ok(f.component.latestError);
  assert.equal(f.component.stats.totalTickets, 104);
  assert.equal(f.component.loadingLatest, false);
  f.component.ngOnDestroy();
});
test('success:false y respuestas incompletas se muestran como errores', () => {
  const f = fixture();
  f.metrics[0].next({ success: false, data: stats() });
  f.recent[0].next({ success: true, data: {} });
  assert.equal(f.component.stats, null);
  assert.ok(f.component.metricsError);
  assert.ok(f.component.latestError);
  f.component.ngOnDestroy();
});
test('recargar cancela respuestas antiguas y salir cancela ambas solicitudes', () => {
  const f = fixture();
  f.component.refresh();
  assert.equal(f.metrics[0].observers.length, 0);
  assert.equal(f.recent[0].observers.length, 0);
  f.component.ngOnDestroy();
  assert.equal(f.metrics[1].observers.length, 0);
  assert.equal(f.recent[1].observers.length, 0);
});
test('el orden inicial coincide con el boceto y conserva un orden válido guardado', () => {
  const f = fixture();
  assert.equal(
    f.component.chartOrder.join(','),
    'tendencia,estado,categoria,prioridad,sla,tecnico',
  );
  f.component.ngOnDestroy();
  const saved = ['sla', 'tecnico', 'categoria', 'estado', 'prioridad', 'tendencia'];
  const other = fixture({ saved });
  assert.equal(other.component.chartOrder.join(','), saved.join(','));
  other.component.ngOnDestroy();
});
test('rechaza paneles duplicados o desconocidos y persiste cambios accesibles de orden', () => {
  const f = fixture({ saved: ['sla', 'sla', 'sla', 'sla', 'sla', 'sla'] });
  assert.equal(f.component.chartOrder[0], 'tendencia');
  f.component.moveChart(1, 0);
  assert.equal(f.component.chartOrder[0], 'estado');
  assert.equal(JSON.parse(f.values.get('dashboard-chart-order'))[0], 'estado');
  f.component.moveChart(0, -1);
  assert.equal(f.component.chartOrder[0], 'estado');
  f.component.ngOnDestroy();
});
test('reordenar funciona aunque localStorage esté bloqueado', () => {
  const f = fixture({ storageFails: true });
  assert.doesNotThrow(() => f.component.onChartDrop({ previousIndex: 0, currentIndex: 2 }));
  assert.equal(f.component.chartOrder[2], 'tendencia');
  f.component.ngOnDestroy();
});
test('formateadores no muestran NaN, fechas inválidas o identidades vacías', () => {
  const f = fixture();
  assert.equal(f.component.formatDate('invalid'), '—');
  assert.equal(f.component.formatCount(NaN), '—');
  assert.equal(f.component.formatPercent(undefined), '—');
  assert.equal(f.component.initials('Carlos Campos'), 'CC');
  assert.equal(f.component.initials(''), '?');
  f.component.ngOnDestroy();
});
test('cada preset envía el mismo rango inclusivo a métricas y a recientes', () => {
  const f = fixture();
  for (const preset of ['today', 'last7', 'last30', 'month', 'all']) {
    f.component.selectPeriod(preset);
    const params = f.metricRequests.at(-1),
      list = f.requests.at(-1)[3];
    assert.equal(list.fechaDesde, params.fechaDesde);
    assert.equal(list.fechaHasta, params.fechaHasta);
    if (preset === 'all') {
      assert.equal(params.fechaDesde, undefined);
      continue;
    }
    const days = (new Date(params.fechaHasta) - new Date(params.fechaDesde)) / 86400000 + 1;
    if (preset === 'today') assert.equal(days, 1);
    if (preset === 'last7') assert.equal(days, 7);
    if (preset === 'last30') assert.equal(days, 30);
    if (preset === 'month') assert.ok(params.fechaDesde.endsWith('-01'));
  }
  f.component.ngOnDestroy();
});
test('personalizado se aplica únicamente al confirmar y rechaza rangos invertidos o imposibles', () => {
  const f = fixture();
  f.component.selectPeriod('custom');
  assert.equal(f.metricRequests.length, 1);
  Object.assign(f.component, { dateFrom: '2026-10-15', dateTo: '2026-10-14' });
  f.component.applyCustomPeriod();
  assert.ok(f.component.periodError);
  assert.equal(f.metricRequests.length, 1);
  f.component.dateFrom = '2026-02-30';
  f.component.applyCustomPeriod();
  assert.equal(f.metricRequests.length, 1);
  f.component.dateFrom = '';
  f.component.applyCustomPeriod();
  assert.equal(f.metricRequests.length, 1);
  Object.assign(f.component, { dateFrom: '2026-10-01', dateTo: '2026-10-14' });
  f.component.applyCustomPeriod();
  assert.equal(f.metricRequests.length, 2);
  assert.equal(f.metricRequests[1].fechaDesde, '2026-10-01');
  assert.equal(f.component.periodError, '');
  f.component.ngOnDestroy();
});
test('cambiar periodo cancela respuestas antiguas y no conserva datos de otro rango', () => {
  const f = fixture();
  f.send(stats());
  f.recent[0].next({ success: true, data: { content: [{ id: 104 }] } });
  f.component.selectPeriod('last7');
  assert.equal(f.component.stats, null);
  assert.equal(f.component.latestTickets.length, 0);
  assert.equal(f.metrics[0].observers.length, 0);
  assert.equal(f.recent[0].observers.length, 0);
  f.component.selectPeriod('today');
  assert.equal(f.metrics[1].observers.length, 0);
  f.metrics[1].next({ success: true, data: stats() });
  assert.equal(f.component.stats, null);
  const bounds = f.metricRequests.at(-1);
  f.send(stats({ ...bounds, totalTickets: 1 }));
  assert.equal(f.component.stats.totalTickets, 1);
  f.component.ngOnDestroy();
});
test('rechaza un backend antiguo que ignore los parámetros en vez de mostrar totales sin filtrar', () => {
  const f = fixture();
  f.component.selectPeriod('last30');
  f.send(stats());
  assert.equal(f.component.stats, null);
  assert.match(f.component.metricsError, /backend no confirmó/);
  f.component.ngOnDestroy();
});
test('conserva el rango personalizado al regresar y separa las preferencias de cada portal', () => {
  const savedFilters = new Map([
    ['technician-dashboard-period', { preset: 'today', from: '', to: '' }],
  ]);
  let f = fixture({ savedFilters });
  f.component.selectPeriod('custom');
  Object.assign(f.component, { dateFrom: '2026-09-01', dateTo: '2026-09-30' });
  f.component.applyCustomPeriod();
  f.component.ngOnDestroy();
  f = fixture({ savedFilters });
  assert.equal(f.component.selectedPeriod, 'custom');
  assert.equal(f.metricRequests[0].fechaDesde, '2026-09-01');
  assert.equal(savedFilters.get('technician-dashboard-period').preset, 'today');
  f.component.ngOnDestroy();
  f = fixture({ savedFilters, role: 'technician' });
  assert.equal(f.component.selectedPeriod, 'today');
  f.component.ngOnDestroy();
});
test('un rango guardado inválido se descarta y no se envía a la API', () => {
  const savedFilters = new Map([
    ['admin-dashboard-period', { preset: 'custom', from: '2026-02-31', to: '2026-01-01' }],
  ]);
  const f = fixture({ savedFilters });
  assert.equal(f.component.appliedPeriod.preset, 'all');
  assert.equal(f.metricRequests[0].fechaDesde, undefined);
  f.component.ngOnDestroy();
});
test('actualizar Hoy recalcula el día de Lima si cambió la fecha, sin congelar el rango', () => {
  const f = fixture();
  f.component.todayIso = () => '2026-10-14';
  f.component.selectPeriod('today');
  assert.equal(f.metricRequests.at(-1).fechaHasta, '2026-10-14');
  f.component.todayIso = () => '2026-10-15';
  f.component.refresh();
  assert.equal(f.metricRequests.at(-1).fechaDesde, '2026-10-15');
  assert.equal(f.requests.at(-1)[3].fechaHasta, '2026-10-15');
  f.component.ngOnDestroy();
});
