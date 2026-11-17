// node --test scripts/service-history.test.cjs — sin API ni registros reales.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const rxjs = require('rxjs');
const service = (id, extra = {}) => ({
  id,
  nombre: 'Correo ' + id,
  proveedor: 'Google',
  tipo: 'Correo',
  categoriaServicioId: 1,
  estado: 'FINALIZADO',
  fechaInicio: '2026-08-01',
  fechaFin: '2026-08-31',
  costoMensual: 8.4,
  divisa: 'USD',
  correosRecordatorio: [],
  ...extra,
});
function fixture(options = {}) {
  const requests = [],
    saved = options.saved || new Map(),
    mod = { exports: {} };
  vm.runInNewContext(
    ts.transpileModule(
      fs.readFileSync(
        path.resolve(__dirname, '../src/app/servicios/service-history.component.ts'),
        'utf8',
      ),
      {
        compilerOptions: {
          module: ts.ModuleKind.CommonJS,
          target: ts.ScriptTarget.ES2022,
          experimentalDecorators: true,
        },
      },
    ).outputText,
    {
      exports: mod.exports,
      module: mod,
      require: (name) => {
        if (name === 'rxjs') return rxjs;
        if (name === '@angular/core') return { Component: () => (component) => component };
        if (name.startsWith('@angular/') || name.startsWith('../core/')) return {};
        throw new Error(name);
      },
    },
  );
  const component = new mod.exports.ServiceHistoryComponent(
    { snapshot: { paramMap: { get: () => options.id || null } } },
    {
      get(url) {
        const response = new rxjs.Subject();
        requests.push({ url, response });
        return response;
      },
    },
    { isTechnicianUser: () => !!options.technician },
    {
      load: (key, defaults) => ({ ...defaults, ...saved.get(key) }),
      save: (key, value) => saved.set(key, { ...value }),
    },
  );
  component.ngOnInit();
  return {
    component,
    requests,
    saved,
    send: (data = Array.from({ length: 18 }, (_, i) => service(i + 1))) =>
      requests.find((r) => r.url.endsWith('/history')).response.next({ success: true, data }),
  };
}
test('carga únicamente historial e iconos, sin consultar el listado actual', () => {
  const f = fixture();
  assert.equal(
    f.requests.map((r) => r.url).join(','),
    '/api/v1/services/history,/api/v1/service-categories',
  );
  assert.equal(f.component.loading, true);
  assert.equal(f.component.loaded, false);
  f.send();
  assert.equal(f.component.totalElements, 18);
  assert.equal(f.component.totalPages, 3);
  assert.equal(f.component.pageItems.length, 8);
  assert.equal(f.component.lastItem, 8);
  f.component.ngOnDestroy();
});
test('filtra todo el conjunto y combina búsqueda, estado y fechas inclusivas de inicio', () => {
  const f = fixture();
  f.send([
    service(1, { estado: 'CANCELADO' }),
    service(2, { estado: 'CANCELADO', fechaInicio: '2026-09-01' }),
    service(3),
    service(4, { proveedor: 'Otro', estado: 'CANCELADO' }),
  ]);
  f.component.busqueda = '  GOOGLE  ';
  f.component.estado = 'CANCELADO';
  f.component.desde = '2026-08-01';
  f.component.hasta = '2026-08-01';
  f.component.buscar();
  assert.equal(f.component.pageItems.length, 1);
  assert.equal(f.component.pageItems[0].id, 1);
  assert.equal(f.component.busqueda, 'GOOGLE');
  f.component.ngOnDestroy();
});
test('búsqueda ignora acentos y permite nombre, proveedor o tipo', () => {
  const f = fixture();
  f.send([service(1, { nombre: 'Página web', proveedor: 'Ñandú', tipo: 'Dominio' })]);
  for (const search of ['pagina', 'nandu', 'dominio']) {
    f.component.busqueda = search;
    f.component.buscar();
    assert.equal(f.component.totalElements, 1);
  }
  f.component.ngOnDestroy();
});
test('filtrar encuentra un registro que estaba en otra página y reinicia la página', () => {
  const f = fixture();
  f.send();
  f.component.goTo(1);
  assert.equal(f.component.pageItems[0].id, 9);
  f.component.busqueda = 'Correo 18';
  f.component.buscar();
  assert.equal(f.component.pageIndex, 0);
  assert.equal(f.component.totalElements, 1);
  assert.equal(f.component.pageItems[0].id, 18);
  f.component.ngOnDestroy();
});
test('rango invertido o fecha imposible no reemplaza los resultados ni filtros aplicados', () => {
  const f = fixture();
  f.send();
  f.component.desde = '2026-09-02';
  f.component.hasta = '2026-09-01';
  f.component.buscar();
  assert.ok(f.component.filterError);
  assert.equal(f.component.totalElements, 18);
  assert.equal(f.saved.get('admin-services-history').desde, '');
  f.component.desde = '2026-02-30';
  f.component.buscar();
  assert.match(f.component.filterError, /válidas/);
  f.component.ngOnDestroy();
});
test('valida fechas sin convertirlas a la zona horaria local ni filtrar por fecha fin', () => {
  const f = fixture();
  f.send([
    service(1, { fechaInicio: '2026-08-01', fechaFin: '2026-09-01' }),
    service(2, { fechaInicio: '2026-09-01' }),
    service(3, { fechaInicio: '2026-02-30' }),
  ]);
  f.component.desde = f.component.hasta = '2026-09-01';
  f.component.buscar();
  assert.equal(f.component.totalElements, 1);
  assert.equal(f.component.filtered[0].id, 2);
  assert.equal(f.component.formatDate('2026-09-01'), '01/09/2026');
  assert.equal(f.component.formatDate('2026-02-30'), 'Sin fecha');
  f.component.ngOnDestroy();
});
test('guarda filtros aplicados, página y tamaño; borradores no se aplican al paginar', () => {
  const saved = new Map();
  let f = fixture({ saved });
  f.send();
  f.component.busqueda = 'Correo';
  f.component.estado = 'FINALIZADO';
  f.component.buscar();
  f.component.changeSize('5');
  f.component.goTo(2);
  f.component.busqueda = 'Borrador';
  f.component.desde = '2027-01-01';
  f.component.goTo(1);
  f.component.ngOnDestroy();
  f = fixture({ saved });
  f.send();
  assert.equal(f.component.busqueda, 'Correo');
  assert.equal(f.component.desde, '');
  assert.equal(f.component.estado, 'FINALIZADO');
  assert.equal(f.component.pageSize, 5);
  assert.equal(f.component.pageIndex, 1);
  assert.equal(f.component.firstItem, 6);
  f.component.ngOnDestroy();
});
test('admin, técnico, historial general y por servicio no comparten filtros', () => {
  const saved = new Map();
  const admin = fixture({ saved });
  admin.send();
  admin.component.busqueda = 'Google';
  admin.component.buscar();
  for (const options of [{ technician: true }, { id: '42' }, { technician: true, id: '42' }]) {
    const f = fixture({ saved, ...options });
    assert.equal(f.component.busqueda, '');
    assert.equal(
      f.requests[0].url,
      options.id ? '/api/v1/services/42/history' : '/api/v1/services/history',
    );
    assert.equal(f.component.basePath, options.technician ? '/tecnico/servicios' : '/servicios');
    assert.equal(f.component.detailQuery.from, 'history');
    assert.equal(f.component.detailQuery.historyId, options.id);
    f.component.ngOnDestroy();
  }
  admin.component.ngOnDestroy();
});
test('descarta estado, fechas, página y tamaño guardados inválidos', () => {
  const f = fixture({
    saved: new Map([
      [
        'admin-services-history',
        {
          busqueda: null,
          estado: 'ACTIVO',
          desde: '2026-02-30',
          hasta: false,
          pageIndex: -2,
          pageSize: 0,
        },
      ],
    ]),
  });
  f.send();
  assert.equal(f.component.busqueda, '');
  assert.equal(f.component.estado, '');
  assert.equal(f.component.desde, '');
  assert.equal(f.component.hasta, '');
  assert.equal(f.component.pageIndex, 0);
  assert.equal(f.component.pageSize, 8);
  f.component.ngOnDestroy();
});
test('restaurar un rango invertido lo limpia y ajusta páginas que ya no existen', () => {
  const f = fixture({
    saved: new Map([
      ['admin-services-history', { desde: '2027-01-01', hasta: '2026-01-01', pageIndex: 10 }],
    ]),
  });
  f.send();
  assert.equal(f.component.desde, '');
  assert.equal(f.component.hasta, '');
  assert.equal(f.component.pageIndex, 2);
  assert.equal(f.component.lastItem, 18);
  f.component.ngOnDestroy();
});
test('limpiar elimina todos los filtros, errores y vuelve a la primera página', () => {
  const f = fixture();
  f.send();
  f.component.busqueda = 'Correo 18';
  f.component.buscar();
  f.component.desde = '2027-01-01';
  f.component.hasta = '2026-01-01';
  f.component.buscar();
  f.component.clearFilters();
  assert.equal(f.component.hasFilters, false);
  assert.equal(f.component.filterError, '');
  assert.equal(f.component.totalElements, 18);
  assert.equal(f.component.pageIndex, 0);
  f.component.ngOnDestroy();
});
test('paginación valida destinos/tamaños y limita la ventana a cinco botones', () => {
  const f = fixture();
  f.send(Array.from({ length: 100 }, (_, i) => service(i + 1)));
  f.component.goTo(-1);
  f.component.goTo(100);
  f.component.goTo(1.5);
  f.component.changeSize(7);
  assert.equal(f.component.pageIndex, 0);
  assert.equal(f.component.pageSize, 8);
  f.component.goTo(8);
  assert.equal(f.component.visiblePages().join(','), '6,7,8,9,10');
  f.component.changeSize(20);
  assert.equal(f.component.pageIndex, 0);
  assert.equal(f.component.pageItems.length, 20);
  f.component.ngOnDestroy();
});
test('vacío real no genera páginas ni datos ficticios', () => {
  const f = fixture();
  f.send([]);
  assert.equal(f.component.loaded, true);
  assert.equal(f.component.totalElements, 0);
  assert.equal(f.component.firstItem, 0);
  assert.equal(f.component.lastItem, 0);
  assert.equal(f.component.visiblePages().length, 0);
  f.component.ngOnDestroy();
});
test('errores e información inválida no se presentan como un historial vacío', () => {
  for (const data of [null, {}, { content: [] }]) {
    const f = fixture();
    f.send(data);
    assert.equal(f.component.loaded, false);
    assert.ok(f.component.loadError);
    f.component.ngOnDestroy();
  }
  const f = fixture();
  f.requests[0].response.error(new Error('offline'));
  assert.ok(f.component.loadError);
  f.component.load();
  f.requests.at(-1).response.next({ success: true, data: [service(1)] });
  assert.equal(f.component.loaded, true);
  assert.equal(f.component.loadError, '');
  f.component.ngOnDestroy();
});
test('icono dinámico por ID o nombre incluso inactivo y respaldo cuando no existe', () => {
  const f = fixture();
  f.requests[1].response.next({
    success: true,
    data: [
      { id: 1, nombre: 'Correo', icono: 'mail', activa: false },
      { id: 2, nombre: 'Web', icono: 'public', activa: true },
    ],
  });
  assert.equal(f.component.iconoServicio(service(1)), 'mail');
  assert.equal(f.component.iconoServicio(service(1, { categoriaServicioId: 2 })), 'public');
  assert.equal(f.component.iconoServicio(service(1, { categoriaServicioId: undefined })), 'mail');
  assert.equal(
    f.component.iconoServicio(service(1, { tipo: 'Otro', categoriaServicioId: undefined })),
    'category',
  );
  f.component.ngOnDestroy();
});
test('fallo de catálogo no impide ver historial y permite reintentar', () => {
  const f = fixture();
  f.requests[1].response.error(new Error('offline'));
  f.send();
  assert.ok(f.component.iconsError);
  assert.equal(f.component.totalElements, 18);
  f.component.loadCategorias();
  f.requests.at(-1).response.next({ success: true, data: [] });
  assert.equal(f.component.iconsError, '');
  assert.equal(f.component.loadingIcons, false);
  f.component.ngOnDestroy();
});
test('costos separan divisas, incluso cero, sin sumar PEN con USD', () => {
  const f = fixture();
  assert.equal(f.component.formatCost(302.4, 'PEN'), 'PEN 302.40');
  assert.equal(f.component.formatCost(8.4, 'USD'), 'USD 8.40');
  assert.equal(f.component.formatCost(0, 'EUR'), 'EUR 0.00');
  f.component.ngOnDestroy();
});
test('reintentar cancela respuestas previas y salir cancela todas las peticiones', () => {
  const f = fixture();
  f.component.load();
  assert.equal(f.requests[0].response.observers.length, 0);
  f.component.ngOnDestroy();
  for (const request of f.requests) assert.equal(request.response.observers.length, 0);
});
