// node --test scripts/subcategory-management.test.cjs — sin API real
const { test, before } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const rxjs = require('rxjs');
let SubcategoryManagement, forms;
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
  const file = path.resolve(
      __dirname,
      '../src/app/subcategorias/subcategory-management.component.ts',
    ),
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
  SubcategoryManagement = mod.exports.SubcategoryManagementComponent;
});
const category = { id: 1, nombre: 'Redes & Conectividad', activa: true };
const subcategory = (id, extra = {}) => ({
  id,
  nombre: 'Subcategoría ' + id,
  categoriaId: 1,
  categoriaNombre: category.nombre,
  descripcion: '',
  activa: true,
  ...extra,
});
function fixture(options = {}) {
  const lists = [],
    categories = [],
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
    listarSubcategorias: (...args) => {
      assert.equal(args.length, 0);
      return subject(lists);
    },
    listarCategorias: () => subject(categories),
    crearSubcategoria: (payload) => {
      const response = new rxjs.Subject();
      creates.push({ payload, response });
      return response;
    },
    actualizarSubcategoria: (id, payload) => {
      const response = new rxjs.Subject();
      updates.push({ id, payload, response });
      return response;
    },
    eliminarSubcategoria: (id) => {
      const response = new rxjs.Subject();
      deletes.push({ id, response });
      return response;
    },
  };
  const component = new SubcategoryManagement(new forms.FormBuilder(), service, filterState);
  const dialog = {
    open: false,
    showModal() {
      this.open = true;
    },
    close() {
      this.open = false;
    },
  };
  component.subcategoryEditor = { nativeElement: dialog };
  component.ngOnInit();
  const load = (data = Array.from({ length: 19 }, (_, i) => subcategory(i + 1))) =>
    lists.at(-1).next({ success: true, data });
  const loadCategories = () =>
    categories.at(-1).next({
      success: true,
      data: [category, { id: 2, nombre: 'Otra categoría', activa: false }],
    });
  if (!options.deferred) {
    loadCategories();
    load(options.data);
  }
  return {
    component,
    lists,
    categories,
    creates,
    updates,
    deletes,
    saved,
    dialog,
    load,
    loadCategories,
  };
}

test('lista completa, ocho filas iniciales y paginación con valores válidos', () => {
  const f = fixture();
  assert.equal(f.component.totalElements, 19);
  assert.equal(f.component.subcategorias.length, 8);
  assert.equal(f.component.totalPages, 3);
  f.component.irAPagina(2);
  assert.equal(f.component.firstItemIndex, 17);
  assert.equal(f.component.lastItemIndex, 19);
  f.component.cambiarTamanoPagina(5);
  assert.equal(f.component.pageIndex, 0);
  assert.equal(f.component.subcategorias.length, 5);
  f.component.cambiarTamanoPagina(0);
  assert.equal(f.component.pageSize, 5);
  f.component.irAPagina(-1);
  assert.equal(f.component.pageIndex, 0);
  f.component.ngOnDestroy();
});
test('combina nombre sin acentos, categoría y estado incluyendo subcategorías inactivas', () => {
  const f = fixture({
    data: [
      subcategory(1, { nombre: 'Administración' }),
      subcategory(2, { nombre: 'Administración', categoriaId: 2, activa: false }),
      subcategory(3, { nombre: 'Sistemas' }),
    ],
  });
  Object.assign(f.component, {
    search: '  ADMINISTRACION  ',
    categoryFilter: '2',
    status: 'inactive',
  });
  f.component.applyFilters();
  assert.equal(f.component.totalElements, 1);
  assert.equal(f.component.subcategorias[0].id, 2);
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
        'admin-subcategorias',
        { search: null, categoryFilter: {}, status: 'invalid', pageIndex: 999, pageSize: 0 },
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
  f.load([subcategory(1)]);
  assert.equal(f.component.pageIndex, 0);
  assert.equal(f.component.status, 'active');
  assert.equal(f.component.subcategorias[0].id, 1);
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
test('las categorías de la tabla siguen disponibles para filtrar aunque falle el catálogo', () => {
  const f = fixture();
  f.component.loadCategories();
  f.categories.at(-1).error(new Error('offline'));
  assert.ok(f.component.categoriesError);
  assert.ok(f.component.filterCategories.some((entry) => entry.id === 2));
  assert.ok(f.component.filterCategories.some((entry) => entry.id === 1));
  f.component.ngOnDestroy();
});
test('el modal nuevo y edición conservan todos los campos y son independientes de los filtros', () => {
  const f = fixture();
  f.component.search = 'Filtrado';
  f.component.openModal();
  assert.equal(f.dialog.open, true);
  assert.equal(f.component.form.get('activa').value, true);
  f.component.closeModal();
  assert.equal(f.dialog.open, false);
  f.component.edit(
    subcategory(7, { nombre: 'Finanzas', descripcion: 'Descripción', activa: false }),
  );
  assert.equal(f.component.editingId, 7);
  assert.equal(f.component.form.get('nombre').value, 'Finanzas');
  assert.equal(f.component.form.get('activa').value, false);
  assert.equal(f.component.search, 'Filtrado');
  f.component.ngOnDestroy();
});
test('validación visible: nombre obligatorio sin espacios, categoría y límites de longitud', () => {
  const f = fixture();
  f.component.openModal();
  f.component.form.patchValue({ nombre: '   ' });
  f.component.save();
  assert.equal(f.creates.length, 0);
  assert.equal(f.component.fieldError('nombre'), 'Ingresa el nombre de la subcategoría.');
  assert.equal(f.component.fieldError('categoriaId'), 'Selecciona una categoría.');
  f.component.form.patchValue({ nombre: 'x'.repeat(101), descripcion: 'x'.repeat(256) });
  f.component.save();
  assert.match(f.component.fieldError('nombre'), /100/);
  assert.match(f.component.fieldError('descripcion'), /255/);
  f.component.ngOnDestroy();
});
test('crear envía el payload existente, bloquea doble envío y evita cerrar mientras guarda', () => {
  const f = fixture();
  f.component.openModal();
  f.component.form.patchValue({
    nombre: ' Nueva subcategoría ',
    categoriaId: 1,
    descripcion: 'Detalle',
  });
  f.component.save();
  f.component.save();
  f.component.closeModal();
  assert.equal(f.creates.length, 1);
  assert.equal(f.dialog.open, true);
  assert.equal(f.component.form.disabled, true);
  assert.equal(f.creates[0].payload.nombre, 'Nueva subcategoría');
  assert.equal(f.creates[0].payload.categoriaId, 1);
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
  f.component.edit(subcategory(7, { descripcion: 'Original' }));
  f.component.form.patchValue({ nombre: 'Editada', activa: false });
  f.component.save();
  assert.equal(f.updates[0].id, 7);
  assert.equal(f.updates[0].payload.activa, false);
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
test('no guarda con categoría ajena al catálogo ni con el catálogo fallido', () => {
  const f = fixture();
  f.component.openModal();
  f.component.form.patchValue({ categoriaId: 99, nombre: 'Subcategoría' });
  f.component.save();
  assert.equal(f.creates.length, 0);
  f.component.form.patchValue({ categoriaId: 1 });
  f.component.categoriesError = 'Error';
  f.component.save();
  assert.equal(f.creates.length, 0);
  f.component.ngOnDestroy();
});
test('eliminar requiere confirmación y desactiva solo una vez', async () => {
  const f = fixture();
  alerts.answer = { isConfirmed: false };
  await f.component.remove(subcategory(1));
  assert.equal(f.deletes.length, 0);
  alerts.answer = { isConfirmed: true };
  await f.component.remove(subcategory(1));
  await f.component.remove(subcategory(1));
  assert.equal(f.deletes.length, 1);
  assert.equal(f.deletes[0].id, 1);
  f.deletes[0].response.next({ success: true });
  assert.match(f.component.successMessage, /desactivada/);
  assert.equal(f.lists.length, 2);
  f.component.ngOnDestroy();
});
test('subcategorías ya inactivas no se desactivan de nuevo y errores permiten reintentar', async () => {
  const f = fixture();
  alerts.answer = { isConfirmed: true };
  await f.component.remove(subcategory(1, { activa: false }));
  assert.equal(f.deletes.length, 0);
  await f.component.remove(subcategory(1));
  f.deletes[0].response.error({ error: { message: 'Sin permisos' } });
  assert.equal(f.component.errorMessage, 'Sin permisos');
  assert.equal(f.component.deletingId, null);
  f.component.ngOnDestroy();
});
test('salir cancela carga, catálogos y guardado sin efectos tardíos', () => {
  const f = fixture({ deferred: true });
  f.component.ngOnDestroy();
  assert.equal(f.lists[0].observers.length, 0);
  assert.equal(f.categories[0].observers.length, 0);
  const other = fixture();
  other.component.openModal();
  other.component.form.patchValue({ nombre: 'Subcategoría', categoriaId: 1 });
  other.component.save();
  other.component.ngOnDestroy();
  assert.equal(other.creates[0].response.observers.length, 0);
  assert.equal(other.dialog.open, false);
});
test('busca también en la descripción sin acentos', () => {
  const f = fixture({
    data: [subcategory(1, { nombre: 'VPN', descripcion: 'Conexión remota' }), subcategory(2)],
  });
  f.component.search = 'conexion';
  f.component.applyFilters();
  assert.equal(f.component.totalElements, 1);
  assert.equal(f.component.subcategorias[0].id, 1);
  f.component.ngOnDestroy();
});
test('categorías inactivas solo se conservan si ya estaban asignadas al editar', () => {
  const f = fixture();
  f.component.openModal();
  assert.equal(f.component.editorCategories.length, 1);
  f.component.form.patchValue({ nombre: 'Nueva', categoriaId: 2 });
  f.component.save();
  assert.equal(f.creates.length, 0);
  f.component.closeModal();
  f.component.edit(subcategory(1, { categoriaId: 2 }));
  assert.equal(f.component.editorCategories.length, 2);
  f.component.form.patchValue({ nombre: 'Conservar' });
  f.component.save();
  assert.equal(f.updates[0].payload.categoriaId, 2);
  f.component.ngOnDestroy();
});
test('carga tardía o recarga de categorías no pierde selección ni descripción', () => {
  const f = fixture({ deferred: true });
  f.load([subcategory(1)]);
  f.component.edit(subcategory(1, { descripcion: 'Original' }));
  assert.equal(f.component.form.get('categoriaId').value, 1);
  f.loadCategories();
  assert.equal(f.component.form.get('categoriaId').value, 1);
  assert.equal(f.component.form.get('descripcion').value, 'Original');
  f.component.ngOnDestroy();
});
test('salir durante confirmación no envía la desactivación', async () => {
  const f = fixture();
  alerts.answer = { isConfirmed: true };
  const request = f.component.remove(subcategory(1));
  f.component.ngOnDestroy();
  await request;
  assert.equal(f.deletes.length, 0);
});
