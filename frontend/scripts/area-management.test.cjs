// node --test scripts/area-management.test.cjs — sin API real
const { test, before } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const rxjs = require('rxjs');
let AreaManagement, forms;
const alerts = {
  calls: [],
  closeCalls: 0,
  answer: { isConfirmed: false },
  fire(options) {
    this.calls.push(options);
    return Promise.resolve(this.answer);
  },
  close() {
    this.closeCalls++;
  },
};
before(async () => {
  await import('@angular/compiler');
  forms = await import('@angular/forms');
  const file = path.resolve(__dirname, '../src/app/areas/area-management.component.ts'),
    mod = { exports: {} };
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
      exports: mod.exports,
      module: mod,
      require: (name) => {
        if (name === 'rxjs') return rxjs;
        if (name === '@angular/forms') return forms;
        if (name === '@angular/core')
          return { Component: () => (value) => value, ViewChild: () => () => {} };
        if (name === 'sweetalert2' || name.startsWith('sweetalert2/')) return { default: alerts };
        if (name.startsWith('@angular/') || name.startsWith('../core/')) return {};
        throw new Error(name);
      },
    },
  );
  AreaManagement = mod.exports.AreaManagementComponent;
});
const company = { id: 1, razonSocial: 'EMPRESA DEMO S.A.C.', estado: true };
const area = (id, extra = {}) => ({
  id,
  nombre: 'Área ' + id,
  empresaId: 1,
  empresaNombre: company.razonSocial,
  descripcion: '',
  activo: true,
  ...extra,
});
function fixture(options = {}) {
  const lists = [],
    companies = [],
    creates = [],
    updates = [],
    deletes = [];
  const saved = options.saved || new Map();
  const filterState = {
    load: (key, defaults) => ({ ...defaults, ...saved.get(key) }),
    save: (key, value) => saved.set(key, { ...value }),
  };
  const subject = (array) => {
    const response = new rxjs.Subject();
    array.push(response);
    return response;
  };
  const service = {
    listarAreas: (...args) => {
      assert.equal(args.length, 0);
      return subject(lists);
    },
    listarEmpresas: () => subject(companies),
    crearArea: (payload) => {
      const response = new rxjs.Subject();
      creates.push({ payload, response });
      return response;
    },
    actualizarArea: (id, payload) => {
      const response = new rxjs.Subject();
      updates.push({ id, payload, response });
      return response;
    },
    eliminarArea: (id) => {
      const response = new rxjs.Subject();
      deletes.push({ id, response });
      return response;
    },
  };
  const component = new AreaManagement(new forms.FormBuilder(), service, filterState);
  const dialog = {
    open: false,
    showModal() {
      this.open = true;
    },
    close() {
      this.open = false;
    },
  };
  component.areaEditor = { nativeElement: dialog };
  component.ngOnInit();
  const load = (data = Array.from({ length: 19 }, (_, i) => area(i + 1))) =>
    lists.at(-1).next({ success: true, data });
  const loadCompanies = () =>
    companies.at(-1).next({
      success: true,
      data: [company, { id: 2, razonSocial: 'Otra empresa', estado: false }],
    });
  if (!options.deferred) {
    loadCompanies();
    load(options.data);
  }
  return {
    component,
    lists,
    companies,
    creates,
    updates,
    deletes,
    saved,
    dialog,
    load,
    loadCompanies,
  };
}

test('lista completa, ocho filas iniciales y paginación con valores válidos', () => {
  const f = fixture();
  assert.equal(f.component.totalElements, 19);
  assert.equal(f.component.areas.length, 8);
  assert.equal(f.component.totalPages, 3);
  f.component.irAPagina(2);
  assert.equal(f.component.firstItemIndex, 17);
  assert.equal(f.component.lastItemIndex, 19);
  f.component.cambiarTamanoPagina(5);
  assert.equal(f.component.pageIndex, 0);
  assert.equal(f.component.areas.length, 5);
  f.component.cambiarTamanoPagina(0);
  assert.equal(f.component.pageSize, 5);
  f.component.irAPagina(-1);
  assert.equal(f.component.pageIndex, 0);
  f.component.ngOnDestroy();
});
test('combina nombre sin acentos, empresa y estado incluyendo áreas inactivas', () => {
  const f = fixture({
    data: [
      area(1, { nombre: 'Administración' }),
      area(2, { nombre: 'Administración', empresaId: 2, activo: false }),
      area(3, { nombre: 'Sistemas' }),
    ],
  });
  Object.assign(f.component, { search: '  ADMINISTRACION  ', company: '2', status: 'inactive' });
  f.component.applyFilters();
  assert.equal(f.component.totalElements, 1);
  assert.equal(f.component.areas[0].id, 2);
  assert.equal(f.lists.length, 1);
  f.component.clearFilters();
  assert.equal(f.component.totalElements, 3);
  f.component.ngOnDestroy();
});
test('un filtro nuevo vuelve a la primera página y muestra contadores reales sin coincidencias', () => {
  const f = fixture();
  f.component.irAPagina(2);
  f.component.search = 'ninguna';
  f.component.applyFilters();
  assert.equal(f.component.pageIndex, 0);
  assert.equal(f.component.totalElements, 0);
  assert.equal(f.component.firstItemIndex, 0);
  assert.equal(f.component.lastItemIndex, 0);
  assert.equal(f.component.visiblePages().length, 0);
  f.component.ngOnDestroy();
});
test('persiste filtros, página y tamaño al salir y volver', () => {
  const saved = new Map();
  let f = fixture({ saved });
  f.component.cambiarTamanoPagina(5);
  f.component.status = 'active';
  f.component.applyFilters();
  f.component.irAPagina(2);
  f.component.ngOnDestroy();
  f = fixture({ saved });
  assert.equal(f.component.status, 'active');
  assert.equal(f.component.pageSize, 5);
  assert.equal(f.component.pageIndex, 2);
  f.component.ngOnDestroy();
});
test('descarta filtros o tamaños guardados inválidos y limita páginas fuera de rango', () => {
  const f = fixture({
    saved: new Map([
      [
        'admin-areas',
        { search: null, company: {}, status: 'invalid', pageIndex: 999, pageSize: 0 },
      ],
    ]),
  });
  assert.equal(f.component.pageSize, 8);
  assert.equal(f.component.pageIndex, 2);
  assert.equal(f.component.hasFilters, false);
  f.component.ngOnDestroy();
});
test('si disminuye el conjunto tras editar/desactivar, ajusta la página conservando filtros', () => {
  const f = fixture();
  f.component.status = 'active';
  f.component.applyFilters();
  f.component.irAPagina(2);
  f.component.load();
  f.load([area(1)]);
  assert.equal(f.component.pageIndex, 0);
  assert.equal(f.component.status, 'active');
  assert.equal(f.component.areas[0].id, 1);
  f.component.ngOnDestroy();
});
test('errores de carga no se presentan como directorio vacío ni borran la última lista', () => {
  const f = fixture();
  f.component.load();
  f.lists.at(-1).error(new Error('offline'));
  assert.equal(f.component.totalElements, 19);
  assert.match(f.component.loadError, /últimos datos/);
  f.component.load();
  f.load();
  assert.equal(f.component.loadError, '');
  f.component.ngOnDestroy();
  const empty = fixture({ deferred: true });
  empty.lists[0].next({ success: false });
  assert.ok(empty.component.loadError);
  assert.equal(empty.component.loaded, false);
  empty.component.ngOnDestroy();
});
test('las empresas de la tabla siguen disponibles para filtrar aunque falle el catálogo', () => {
  const f = fixture();
  f.component.loadCompanies();
  f.companies.at(-1).error(new Error('offline'));
  assert.ok(f.component.companiesError);
  assert.equal(f.component.filterCompanies[0].id, 1);
  assert.ok(f.component.filterCompanies.some((entry) => entry.id === 2));
  f.component.ngOnDestroy();
});
test('el modal nuevo y edición conservan todos los campos y son independientes de los filtros', () => {
  const f = fixture();
  f.component.search = 'Filtrado';
  f.component.openModal();
  assert.equal(f.dialog.open, true);
  assert.equal(f.component.form.get('activo').value, true);
  f.component.closeModal();
  assert.equal(f.dialog.open, false);
  f.component.edit(area(7, { nombre: 'Finanzas', descripcion: 'Descripción', activo: false }));
  assert.equal(f.component.editingId, 7);
  assert.equal(f.component.form.get('nombre').value, 'Finanzas');
  assert.equal(f.component.form.get('activo').value, false);
  assert.equal(f.component.search, 'Filtrado');
  f.component.ngOnDestroy();
});
test('validación visible: nombre obligatorio sin espacios, empresa y límites de longitud', () => {
  const f = fixture();
  f.component.openModal();
  f.component.form.patchValue({ nombre: '   ' });
  f.component.save();
  assert.equal(f.creates.length, 0);
  assert.equal(f.component.fieldError('nombre'), 'Ingresa el nombre del área.');
  assert.equal(f.component.fieldError('empresaId'), 'Selecciona una empresa.');
  f.component.form.patchValue({ nombre: 'x'.repeat(101), descripcion: 'x'.repeat(256) });
  f.component.save();
  assert.match(f.component.fieldError('nombre'), /100/);
  assert.match(f.component.fieldError('descripcion'), /255/);
  f.component.ngOnDestroy();
});
test('crear envía el payload existente, bloquea doble envío y evita cerrar mientras guarda', () => {
  const f = fixture();
  f.component.openModal();
  f.component.form.patchValue({ nombre: ' Nueva área ', empresaId: 1, descripcion: 'Detalle' });
  f.component.save();
  f.component.save();
  f.component.closeModal();
  assert.equal(f.creates.length, 1);
  assert.equal(f.dialog.open, true);
  assert.equal(f.component.form.disabled, true);
  assert.equal(f.creates[0].payload.nombre, 'Nueva área');
  assert.equal(f.creates[0].payload.empresaId, 1);
  assert.equal(f.creates[0].payload.descripcion, 'Detalle');
  f.creates[0].response.next({ success: true });
  assert.equal(f.dialog.open, false);
  assert.equal(f.component.saving, false);
  assert.equal(f.lists.length, 2);
  assert.match(f.component.successMessage, /creada/);
  f.component.ngOnDestroy();
});
test('editar usa PUT con el ID correcto; un fallo conserva los datos y permite reintentar', () => {
  const f = fixture();
  f.component.edit(area(7, { descripcion: 'Original' }));
  f.component.form.patchValue({ nombre: 'Editada', activo: false });
  f.component.save();
  assert.equal(f.updates[0].id, 7);
  assert.equal(f.updates[0].payload.activo, false);
  f.updates[0].response.error({ error: { message: 'Nombre duplicado' } });
  assert.equal(f.component.errorMessage, 'Nombre duplicado');
  assert.equal(f.component.form.enabled, true);
  assert.equal(f.component.form.get('nombre').value, 'Editada');
  f.component.save();
  f.updates[1].response.next({ success: false });
  assert.equal(f.dialog.open, true);
  assert.ok(f.component.errorMessage);
  f.component.ngOnDestroy();
});
test('no guarda con empresa ajena al catálogo ni con el catálogo fallido', () => {
  const f = fixture();
  f.component.openModal();
  f.component.form.patchValue({ empresaId: 99, nombre: 'Área' });
  f.component.save();
  assert.equal(f.creates.length, 0);
  f.component.form.patchValue({ empresaId: 1 });
  f.component.companiesError = 'Error';
  f.component.save();
  assert.equal(f.creates.length, 0);
  f.component.ngOnDestroy();
});
test('eliminar requiere confirmación y desactiva solo una vez', async () => {
  const f = fixture();
  alerts.answer = { isConfirmed: false };
  await f.component.remove(area(1));
  assert.equal(f.deletes.length, 0);
  alerts.answer = { isConfirmed: true };
  await f.component.remove(area(1));
  await f.component.remove(area(1));
  assert.equal(f.deletes.length, 1);
  assert.equal(f.deletes[0].id, 1);
  f.deletes[0].response.next({ success: true });
  assert.match(f.component.successMessage, /desactivada/);
  assert.equal(f.lists.length, 2);
  f.component.ngOnDestroy();
});
test('áreas ya inactivas no se desactivan de nuevo y errores permiten reintentar', async () => {
  const f = fixture();
  alerts.answer = { isConfirmed: true };
  await f.component.remove(area(1, { activo: false }));
  assert.equal(f.deletes.length, 0);
  await f.component.remove(area(1));
  f.deletes[0].response.error({ error: { message: 'Sin permisos' } });
  assert.equal(f.component.errorMessage, 'Sin permisos');
  assert.equal(f.component.deletingId, null);
  f.component.ngOnDestroy();
});
test('salir cancela carga, catálogos y guardado sin efectos tardíos', () => {
  const f = fixture({ deferred: true });
  f.component.ngOnDestroy();
  assert.equal(f.lists[0].observers.length, 0);
  assert.equal(f.companies[0].observers.length, 0);
  const other = fixture();
  other.component.openModal();
  other.component.form.patchValue({ nombre: 'Área', empresaId: 1 });
  other.component.save();
  other.component.ngOnDestroy();
  assert.equal(other.creates[0].response.observers.length, 0);
  assert.equal(other.dialog.open, false);
});
