// node --test scripts/category-management.test.cjs — sin API real
const { test, before } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const rxjs = require('rxjs');
let CategoryManagement, forms;
const alerts = {
  answer: { isConfirmed: false },
  fire() {
    return Promise.resolve(this.answer);
  },
  close() {},
};
before(async () => {
  await import('@angular/compiler');
  forms = await import('@angular/forms');
  const file = path.resolve(__dirname, '../src/app/categorias/category-management.component.ts'),
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
        if (name === 'sweetalert2') return { default: alerts };
        if (name.startsWith('@angular/') || name.startsWith('../core/')) return {};
        throw new Error(name);
      },
    },
  );
  CategoryManagement = mod.exports.CategoryManagementComponent;
});
const category = (id, extra = {}) => ({
  id,
  nombre: 'Categoría ' + id,
  descripcion: '',
  activa: true,
  ...extra,
});
function fixture(options = {}) {
  const lists = [],
    creates = [],
    updates = [],
    deletes = [],
    saved = options.saved || new Map();
  const filterState = {
    load: (key, defaults) => ({ ...defaults, ...saved.get(key) }),
    save: (key, value) => saved.set(key, { ...value }),
  };
  const mutation = (collection, record) => {
    const response = new rxjs.Subject();
    collection.push({ ...record, response });
    return response;
  };
  const service = {
    listarCategorias: () => {
      const response = new rxjs.Subject();
      lists.push(response);
      return response;
    },
    crearCategoria: (payload) => mutation(creates, { payload }),
    actualizarCategoria: (id, payload) => mutation(updates, { id, payload }),
    eliminarCategoria: (id) => mutation(deletes, { id }),
  };
  const component = new CategoryManagement(new forms.FormBuilder(), service, filterState);
  const dialog = {
    open: false,
    showModal() {
      this.open = true;
    },
    close() {
      this.open = false;
    },
  };
  component.categoryEditor = { nativeElement: dialog };
  component.ngOnInit();
  const load = (data = Array.from({ length: 19 }, (_, i) => category(i + 1))) =>
    lists.at(-1).next({ success: true, data });
  if (!options.deferred) load(options.data);
  return { component, lists, creates, updates, deletes, saved, dialog, load };
}

test('lista completa y paginación válida con ocho filas por defecto', () => {
  const f = fixture();
  assert.equal(f.component.totalElements, 19);
  assert.equal(f.component.categorias.length, 8);
  f.component.irAPagina(2);
  assert.equal(f.component.firstItemIndex, 17);
  assert.equal(f.component.lastItemIndex, 19);
  f.component.cambiarTamanoPagina('5');
  assert.equal(f.component.pageIndex, 0);
  assert.equal(f.component.categorias.length, 5);
  f.component.cambiarTamanoPagina(0);
  f.component.irAPagina(-1);
  f.component.irAPagina(1.5);
  assert.equal(f.component.pageSize, 5);
  assert.equal(f.component.pageIndex, 0);
  f.component.ngOnDestroy();
});
test('busca por nombre y descripción sin acentos y combina estado', () => {
  const f = fixture({
    data: [
      category(1, { nombre: 'Capacitaciones', descripcion: 'Formación' }),
      category(2, { nombre: 'Administración', activa: false }),
      category(3, { nombre: 'Redes', descripcion: 'Administración de routers' }),
    ],
  });
  Object.assign(f.component, { search: '  ADMINISTRACION  ', status: 'inactive' });
  f.component.applyFilters();
  assert.equal(f.component.totalElements, 1);
  assert.equal(f.component.categorias[0].id, 2);
  f.component.status = 'active';
  f.component.applyFilters();
  assert.equal(f.component.categorias[0].id, 3);
  f.component.search = 'formacion';
  f.component.applyFilters();
  assert.equal(f.component.categorias[0].id, 1);
  assert.equal(f.lists.length, 1);
  f.component.clearFilters();
  assert.equal(f.component.totalElements, 3);
  f.component.ngOnDestroy();
});
test('sin coincidencias reinicia página y contadores sin paginación ficticia', () => {
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
test('persiste búsqueda, estado, página y tamaño al volver', () => {
  const saved = new Map();
  let f = fixture({ saved });
  f.component.cambiarTamanoPagina(5);
  f.component.search = 'categoria';
  f.component.status = 'active';
  f.component.applyFilters();
  f.component.irAPagina(2);
  f.component.ngOnDestroy();
  f = fixture({ saved });
  assert.equal(f.component.search, 'categoria');
  assert.equal(f.component.status, 'active');
  assert.equal(f.component.pageSize, 5);
  assert.equal(f.component.pageIndex, 2);
  f.component.ngOnDestroy();
});
test('descarta filtros inválidos y limita la página persistida', () => {
  const f = fixture({
    saved: new Map([
      ['admin-categorias', { search: null, status: 'invalid', pageIndex: 999, pageSize: 0 }],
    ]),
  });
  assert.equal(f.component.pageSize, 8);
  assert.equal(f.component.pageIndex, 2);
  assert.equal(f.component.hasFilters, false);
  f.component.ngOnDestroy();
});
test('editar/desactivar ajusta la página sin borrar los filtros', () => {
  const f = fixture();
  f.component.status = 'active';
  f.component.applyFilters();
  f.component.irAPagina(2);
  f.component.load();
  f.load([category(1)]);
  assert.equal(f.component.pageIndex, 0);
  assert.equal(f.component.status, 'active');
  assert.equal(f.component.categorias[0].id, 1);
  f.component.ngOnDestroy();
});
test('errores de carga conservan datos previos y admiten reintentar', () => {
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
test('nuevo y editar restauran los tres campos y no alteran filtros', () => {
  const f = fixture();
  f.component.search = 'Filtrado';
  f.component.openModal();
  assert.equal(f.dialog.open, true);
  assert.equal(f.component.form.get('activa').value, true);
  f.component.closeModal();
  f.component.edit(category(7, { nombre: 'Redes', descripcion: 'Descripción', activa: false }));
  assert.equal(f.component.editingId, 7);
  assert.equal(f.component.form.get('nombre').value, 'Redes');
  assert.equal(f.component.form.get('activa').value, false);
  assert.equal(f.component.search, 'Filtrado');
  f.component.ngOnDestroy();
});
test('nombre obligatorio sin espacios y límites de BD con errores visibles', () => {
  const f = fixture();
  f.component.openModal();
  f.component.form.patchValue({ nombre: '   ' });
  f.component.save();
  assert.equal(f.creates.length, 0);
  assert.equal(f.component.fieldError('nombre'), 'Ingresa el nombre de la categoría.');
  f.component.form.patchValue({ nombre: 'x'.repeat(101), descripcion: 'x'.repeat(256) });
  f.component.save();
  assert.match(f.component.fieldError('nombre'), /100/);
  assert.match(f.component.fieldError('descripcion'), /255/);
  f.component.ngOnDestroy();
});
test('crear conserva contrato API y bloquea envíos repetidos y cierre durante guardado', () => {
  const f = fixture();
  f.component.openModal();
  f.component.form.patchValue({ nombre: ' Nueva categoría ', descripcion: 'Detalle' });
  f.component.save();
  f.component.save();
  f.component.closeModal();
  assert.equal(f.creates.length, 1);
  assert.equal(f.dialog.open, true);
  assert.equal(f.component.form.disabled, true);
  assert.equal(f.creates[0].payload.nombre, 'Nueva categoría');
  assert.equal(f.creates[0].payload.activa, true);
  assert.equal(f.creates[0].payload.descripcion, 'Detalle');
  assert.equal(Object.keys(f.creates[0].payload).length, 3);
  f.creates[0].response.next({ success: true });
  assert.equal(f.dialog.open, false);
  assert.equal(f.lists.length, 2);
  assert.match(f.component.successMessage, /creada/);
  f.component.ngOnDestroy();
});
test('editar usa ID correcto y permite reactivar; fallos conservan el borrador', () => {
  const f = fixture();
  f.component.edit(category(7, { activa: false }));
  f.component.form.patchValue({ nombre: 'Editada', activa: true });
  f.component.save();
  assert.equal(f.updates[0].id, 7);
  assert.equal(f.updates[0].payload.activa, true);
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
test('eliminar requiere confirmación y desactiva solo una vez', async () => {
  const f = fixture();
  alerts.answer = { isConfirmed: false };
  await f.component.remove(category(1));
  assert.equal(f.deletes.length, 0);
  alerts.answer = { isConfirmed: true };
  await f.component.remove(category(1));
  await f.component.remove(category(1));
  assert.equal(f.deletes.length, 1);
  f.deletes[0].response.next({ success: true });
  assert.match(f.component.successMessage, /desactivada/);
  assert.equal(f.lists.length, 2);
  f.component.ngOnDestroy();
});
test('inactivas no se desactivan de nuevo y errores permiten reintentar', async () => {
  const f = fixture();
  alerts.answer = { isConfirmed: true };
  await f.component.remove(category(1, { activa: false }));
  assert.equal(f.deletes.length, 0);
  await f.component.remove(category(1));
  f.deletes[0].response.error({ error: { message: 'Sin permisos' } });
  assert.equal(f.component.errorMessage, 'Sin permisos');
  assert.equal(f.component.deletingId, null);
  f.component.ngOnDestroy();
});
test('salir cancela las solicitudes y evita efectos tardíos', async () => {
  const f = fixture({ deferred: true });
  f.component.ngOnDestroy();
  assert.equal(f.lists[0].observers.length, 0);
  const other = fixture();
  other.component.openModal();
  other.component.form.patchValue({ nombre: 'Categoría' });
  other.component.save();
  other.component.ngOnDestroy();
  assert.equal(other.creates[0].response.observers.length, 0);
  assert.equal(other.dialog.open, false);
  const third = fixture();
  alerts.answer = { isConfirmed: true };
  const pending = third.component.remove(category(1));
  third.component.ngOnDestroy();
  await pending;
  assert.equal(third.deletes.length, 0);
});
