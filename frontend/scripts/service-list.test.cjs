// node --test scripts/service-list.test.cjs — HTTP simulado, sin registros reales.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const rxjs = require('rxjs');
class Params {
  constructor(values = {}) {
    this.values = values;
  }
  set(key, value) {
    return new Params({ ...this.values, [key]: String(value) });
  }
  get(key) {
    return this.values[key];
  }
}
function fixture(options = {}) {
  const lists = [],
    icons = [],
    exports = [],
    navigations = [],
    downloads = [],
    revoked = [];
  const saved = options.saved || new Map();
  const mod = { exports: {} },
    file = path.resolve(__dirname, '../src/app/servicios/service-management.component.ts');
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
      URL: { createObjectURL: () => 'blob:excel', revokeObjectURL: (url) => revoked.push(url) },
      document: {
        createElement: () => {
          const anchor = {
            click() {
              downloads.push({ href: this.href, download: this.download });
            },
          };
          return anchor;
        },
      },
      require: (name) => {
        if (name === 'rxjs') return rxjs;
        if (name === '@angular/common/http') return { HttpParams: Params };
        if (name === '@angular/core') return { Component: () => (component) => component };
        if (name.startsWith('@angular/') || name.startsWith('../core/')) return {};
        throw new Error(name);
      },
    },
  );
  const http = {
    get(url, args) {
      const response = new rxjs.Subject(),
        request = { url, args, response };
      (url.endsWith('/excel') ? exports : url.includes('service-categories') ? icons : lists).push(
        request,
      );
      return response;
    },
  };
  const filterState = {
    load: (key, defaults) => ({ ...defaults, ...saved.get(key) }),
    save: (key, value) => saved.set(key, { ...value }),
  };
  const component = new mod.exports.ServiceManagementComponent(
    http,
    { navigate: (commands) => navigations.push(commands) },
    { isTechnicianUser: () => !!options.technician },
    filterState,
  );
  component.ngOnInit();
  const send = (extra) => lists.at(-1).response.next({ success: true, data: pageData(extra) });
  return { component, lists, icons, exports, navigations, saved, downloads, revoked, send };
}
const service = (extra) => ({
  id: 1,
  nombre: 'Correo corporativo',
  proveedor: 'Google',
  tipo: 'Correo',
  estado: 'ACTIVO',
  fechaInicio: '2026-01-01',
  fechaFin: '2026-09-30',
  costoMensual: 45,
  divisa: 'USD',
  responsable: 'Sistemas',
  correosRecordatorio: [],
  ...extra,
});
const pageData = (extra) => ({
  content: [service()],
  totalElements: 16,
  totalPages: 2,
  number: 0,
  size: 8,
  totalCostoMensual: 3600.83,
  totalesPorDivisa: { PEN: 2816.52, USD: 784.31 },
  ...extra,
});

test('carga paginación del servidor y no inventa gastos durante la carga', () => {
  const f = fixture();
  assert.equal(f.component.loading, true);
  assert.equal(f.component.divisasConTotal().length, 0);
  assert.equal(f.lists[0].args.params.get('size'), '8');
  f.send();
  assert.equal(f.component.totalElements, 16);
  assert.equal(f.component.servicios.length, 1);
  assert.equal(f.component.loaded, true);
  f.component.ngOnDestroy();
});
test('muestra una tarjeta por divisa con totales del conjunto filtrado, no de la página', () => {
  const f = fixture();
  f.send({ totalesPorDivisa: { PEN: 2816.52, USD: 784.31, EUR: 0 } });
  assert.equal(f.component.divisasConTotal().join(','), 'EUR,PEN,USD');
  assert.equal(f.component.totalesPorDivisa.PEN, 2816.52);
  assert.equal(f.component.totalesPorDivisa.EUR, 0);
  assert.match(f.component.formatCost(784.31, 'USD'), /^USD /);
  f.component.ngOnDestroy();
});
test('respeta estados calculados por el servidor con su configuración, no los recalcula en el navegador', () => {
  const f = fixture();
  f.send({
    content: [
      service({ estado: 'ACTIVO' }),
      service({ id: 2, estado: 'POR_VENCER' }),
      service({ id: 3, estado: 'VENCIDO' }),
    ],
  });
  assert.equal(
    f.component.servicios.map((item) => item.estado).join(','),
    'ACTIVO,POR_VENCER,VENCIDO',
  );
  f.component.ngOnDestroy();
});
test('iconos dinámicos por ID y nombre, incluso tipos inactivos; fallback seguro', () => {
  const f = fixture();
  f.icons[0].response.next({
    success: true,
    data: [
      { id: 8, nombre: 'Correo', icono: 'mail', activa: false },
      { id: 9, nombre: 'Internet', icono: 'public', activa: true },
    ],
  });
  assert.equal(f.component.iconoServicio(service({ categoriaServicioId: 9 })), 'public');
  assert.equal(f.component.iconoServicio(service()), 'mail');
  assert.equal(f.component.iconoServicio(service({ tipo: 'Otro' })), 'category');
  f.component.ngOnDestroy();
});
test('un error de iconos no impide cargar servicios y permite reintentar', () => {
  const f = fixture();
  f.icons[0].response.error(new Error('offline'));
  f.send();
  assert.equal(f.component.servicios.length, 1);
  assert.ok(f.component.iconsError);
  f.component.loadCategorias();
  f.icons[1].response.next({ success: true, data: [] });
  assert.equal(f.component.iconsError, '');
  f.component.ngOnDestroy();
});
test('Filtrar aplica búsqueda y estado y vuelve a la primera página', () => {
  const f = fixture();
  f.send();
  f.component.busqueda = '  Google  ';
  f.component.estadoFiltro = 'VENCIDO';
  f.component.buscar();
  const params = f.lists[1].args.params;
  assert.equal(params.get('busqueda'), 'Google');
  assert.equal(params.get('estado'), 'VENCIDO');
  assert.equal(params.get('page'), '0');
  f.component.ngOnDestroy();
});
test('paginar o cambiar filas no aplica un filtro todavía en borrador', () => {
  const f = fixture();
  f.send();
  f.component.busqueda = 'Sin aplicar';
  f.component.estadoFiltro = 'VENCIDO';
  f.component.goTo(1);
  assert.equal(f.lists[1].args.params.get('busqueda'), '');
  assert.equal(f.lists[1].args.params.get('estado'), '');
  f.send({ number: 1 });
  f.component.changeSize('5');
  assert.equal(f.lists[2].args.params.get('size'), '5');
  assert.equal(f.lists[2].args.params.get('busqueda'), '');
  f.component.ngOnDestroy();
});
test('limpiar elimina filtros y vuelve a página cero', () => {
  const f = fixture();
  f.send();
  f.component.busqueda = 'Google';
  f.component.estadoFiltro = 'ACTIVO';
  f.component.buscar();
  f.send();
  f.component.clearFilters();
  assert.equal(f.component.hasFilters, false);
  assert.equal(f.lists.at(-1).args.params.get('busqueda'), '');
  assert.equal(f.lists.at(-1).args.params.get('page'), '0');
  f.component.ngOnDestroy();
});
test('persiste los filtros aplicados y página por portal al volver del detalle', () => {
  const saved = new Map();
  let f = fixture({ saved });
  f.send();
  f.component.busqueda = 'Correo';
  f.component.estadoFiltro = 'ACTIVO';
  f.component.buscar();
  f.send();
  f.component.goTo(1);
  f.send({ number: 1 });
  f.component.ngOnDestroy();
  f = fixture({ saved });
  assert.equal(f.component.busqueda, 'Correo');
  assert.equal(f.lists[0].args.params.get('page'), '1');
  f.component.ngOnDestroy();
  const tech = fixture({ saved, technician: true });
  assert.equal(tech.component.busqueda, '');
  tech.component.ngOnDestroy();
});
test('descarta estados, páginas y tamaños guardados inválidos', () => {
  const f = fixture({
    saved: new Map([
      [
        'admin-services',
        { busqueda: null, estadoFiltro: 'FINALIZADO', pageIndex: -2, pageSize: 0 },
      ],
    ]),
  });
  assert.equal(f.lists[0].args.params.get('busqueda'), '');
  assert.equal(f.lists[0].args.params.get('estado'), '');
  assert.equal(f.component.pageSize, 8);
  assert.equal(f.component.pageIndex, 0);
  f.component.ngOnDestroy();
});
test('rechaza paginación inválida y limita los botones a cinco', () => {
  const f = fixture();
  f.send({ totalElements: 100, totalPages: 13 });
  f.component.goTo(-1);
  f.component.goTo(1.5);
  f.component.changeSize(0);
  assert.equal(f.lists.length, 1);
  assert.equal(f.component.visiblePages().length, 5);
  f.component.ngOnDestroy();
});
test('si la página deja de existir vuelve a la última página disponible', () => {
  const f = fixture({ saved: new Map([['admin-services', { pageIndex: 8 }]]) });
  f.send({ number: 8, content: [] });
  assert.equal(f.lists.length, 2);
  assert.equal(f.lists[1].args.params.get('page'), '1');
  f.send({ number: 1 });
  assert.equal(f.component.pageIndex, 1);
  f.component.ngOnDestroy();
});
test('un conjunto vacío real muestra cero resultados sin tarjetas ni páginas ficticias', () => {
  const f = fixture();
  f.send({ content: [], totalElements: 0, totalPages: 0, totalesPorDivisa: {} });
  assert.equal(f.component.loaded, true);
  assert.equal(f.component.firstItem, 0);
  assert.equal(f.component.lastItem, 0);
  assert.equal(f.component.visiblePages().length, 0);
  f.component.ngOnDestroy();
});
test('errores e información incompleta no se presentan como un vacío válido', () => {
  for (const invalid of [
    null,
    { ...pageData(), totalesPorDivisa: null },
    { ...pageData(), content: null },
  ]) {
    const f = fixture();
    f.lists[0].response.next({ success: true, data: invalid });
    assert.equal(f.component.loaded, false);
    assert.ok(f.component.loadError);
    f.component.ngOnDestroy();
  }
  const f = fixture();
  f.lists[0].response.error(new Error('offline'));
  assert.ok(f.component.loadError);
  f.component.load();
  f.send();
  assert.equal(f.component.loadError, '');
  assert.equal(f.component.loaded, true);
  f.component.ngOnDestroy();
});
test('nuevos filtros cancelan la respuesta antigua y sus totales', () => {
  const f = fixture();
  f.component.busqueda = 'Actual';
  f.component.buscar();
  assert.equal(f.lists[0].response.observers.length, 0);
  f.lists[0].response.next({ success: true, data: pageData({ totalesPorDivisa: { OLD: 999 } }) });
  f.send();
  assert.equal(f.component.totalesPorDivisa.OLD, undefined);
  f.component.ngOnDestroy();
});
test('detalle, alta e historial usan el portal correcto sin mutar registros', () => {
  for (const technician of [false, true]) {
    const f = fixture({ technician }),
      base = technician ? '/tecnico/servicios' : '/servicios';
    f.component.openCreate();
    f.component.edit(service());
    assert.equal(f.component.basePath, base);
    assert.equal(f.navigations[0].join('/'), base + '/nuevo');
    assert.equal(f.navigations[1].join('/'), base + '/1');
    f.component.ngOnDestroy();
  }
});
test('Excel conserva endpoint general, evita doble clic y libera su URL temporal', () => {
  const f = fixture();
  f.component.exportar();
  f.component.exportar();
  assert.equal(f.exports.length, 1);
  assert.equal(f.exports[0].url, '/api/v1/services/export/excel');
  assert.equal(f.exports[0].args.responseType, 'blob');
  f.exports[0].response.next({});
  assert.equal(f.component.exporting, false);
  assert.match(f.downloads[0].download, /^servicios_\d{4}-\d{2}-\d{2}\.xlsx$/);
  assert.equal(f.revoked[0], 'blob:excel');
  f.component.ngOnDestroy();
});
test('error de Excel permite reintentar sin borrar el listado', () => {
  const f = fixture();
  f.send();
  f.component.exportar();
  f.exports[0].response.error(new Error('offline'));
  assert.ok(f.component.exportError);
  assert.equal(f.component.servicios.length, 1);
  f.component.exportar();
  assert.equal(f.exports.length, 2);
  f.component.ngOnDestroy();
});
test('fechas no dependen de huso horario y montos muestran explícitamente la divisa', () => {
  const f = fixture();
  assert.equal(f.component.formatDate('2026-09-30'), '30/09/2026');
  assert.equal(f.component.formatDate('invalid'), 'Sin fecha');
  assert.equal(f.component.formatCost(0, 'EUR'), 'EUR 0.00');
  f.component.ngOnDestroy();
});
test('salir cancela listado, iconos y exportación pendientes', () => {
  const f = fixture();
  f.component.exportar();
  f.component.ngOnDestroy();
  assert.equal(f.lists[0].response.observers.length, 0);
  assert.equal(f.icons[0].response.observers.length, 0);
  assert.equal(f.exports[0].response.observers.length, 0);
});
