// node --test scripts/company-management.test.cjs — sin API real
const { test, before } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const rxjs = require('rxjs');
let CompanyManagement, forms;
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
  const file = path.resolve(__dirname, '../src/app/empresas/company-management.component.ts'),
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
  CompanyManagement = mod.exports.CompanyManagementComponent;
});
const company = (id, extra = {}) => ({
  id,
  razonSocial: 'Empresa ' + id,
  ruc: String(20000000000 + id),
  email: '',
  telefono: '',
  direccion: '',
  estado: true,
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
    listarEmpresas: () => {
      const response = new rxjs.Subject();
      lists.push(response);
      return response;
    },
    crearEmpresa: (payload) => mutation(creates, { payload }),
    actualizarEmpresa: (id, payload) => mutation(updates, { id, payload }),
    eliminarEmpresa: (id) => mutation(deletes, { id }),
  };
  const component = new CompanyManagement(new forms.FormBuilder(), service, filterState);
  const dialog = {
    open: false,
    showModal() {
      this.open = true;
    },
    close() {
      this.open = false;
    },
  };
  component.companyEditor = { nativeElement: dialog };
  component.ngOnInit();
  const load = (data = Array.from({ length: 19 }, (_, i) => company(i + 1))) =>
    lists.at(-1).next({ success: true, data });
  if (!options.deferred) load(options.data);
  return { component, lists, creates, updates, deletes, saved, dialog, load };
}

test('lista completa y paginación válida con ocho filas por defecto', () => {
  const f = fixture();
  assert.equal(f.component.totalElements, 19);
  assert.equal(f.component.empresas.length, 8);
  f.component.irAPagina(2);
  assert.equal(f.component.firstItemIndex, 17);
  assert.equal(f.component.lastItemIndex, 19);
  f.component.cambiarTamanoPagina('5');
  assert.equal(f.component.pageIndex, 0);
  assert.equal(f.component.empresas.length, 5);
  f.component.cambiarTamanoPagina(0);
  f.component.irAPagina(-1);
  f.component.irAPagina(1.5);
  assert.equal(f.component.pageSize, 5);
  assert.equal(f.component.pageIndex, 0);
  f.component.ngOnDestroy();
});
test('busca por razón social, RUC o correo y combina estado', () => {
  const f = fixture({
    data: [
      company(1, { razonSocial: 'Compañía Álamo', email: 'ventas@alamo.example.test' }),
      company(2, { razonSocial: 'Demo', ruc: 'ABC-2026', estado: false }),
      company(3),
    ],
  });
  f.component.search = '  COMPANIA ALAMO ';
  f.component.applyFilters();
  assert.equal(f.component.empresas[0].id, 1);
  f.component.search = 'VENTAS@ALAMO.EXAMPLE.TEST';
  f.component.applyFilters();
  assert.equal(f.component.empresas[0].id, 1);
  Object.assign(f.component, { search: 'abc-2026', status: 'inactive' });
  f.component.applyFilters();
  assert.equal(f.component.empresas[0].id, 2);
  f.component.status = 'active';
  f.component.applyFilters();
  assert.equal(f.component.totalElements, 0);
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
  f.component.search = 'empresa';
  f.component.status = 'active';
  f.component.applyFilters();
  f.component.irAPagina(2);
  f.component.ngOnDestroy();
  f = fixture({ saved });
  assert.equal(f.component.search, 'empresa');
  assert.equal(f.component.status, 'active');
  assert.equal(f.component.pageSize, 5);
  assert.equal(f.component.pageIndex, 2);
  f.component.ngOnDestroy();
});
test('descarta filtros inválidos y limita la página persistida', () => {
  const f = fixture({
    saved: new Map([
      ['admin-empresas', { search: null, status: 'invalid', pageIndex: 999, pageSize: 0 }],
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
  f.load([company(1)]);
  assert.equal(f.component.pageIndex, 0);
  assert.equal(f.component.status, 'active');
  assert.equal(f.component.empresas[0].id, 1);
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
test('nuevo y editar restauran los campos y no alteran filtros', () => {
  const f = fixture();
  f.component.search = 'Filtrado';
  f.component.openModal();
  assert.equal(f.dialog.open, true);
  assert.equal(f.component.form.get('estado').value, true);
  f.component.closeModal();
  f.component.edit(company(7, { razonSocial: 'Redes', direccion: 'Descripción', estado: false }));
  assert.equal(f.component.editingId, 7);
  assert.equal(f.component.form.get('razonSocial').value, 'Redes');
  assert.equal(f.component.form.get('estado').value, false);
  assert.equal(f.component.search, 'Filtrado');
  f.component.ngOnDestroy();
});
test('razón social obligatoria sin espacios y límites de BD con errores visibles', () => {
  const f = fixture();
  f.component.openModal();
  f.component.form.patchValue({ razonSocial: '   ' });
  f.component.save();
  assert.equal(f.creates.length, 0);
  assert.equal(f.component.fieldError('razonSocial'), 'Ingresa la razón social.');
  assert.equal(f.component.fieldError('ruc'), 'Ingresa el RUC.');
  f.component.form.patchValue({ razonSocial: 'x'.repeat(151), direccion: 'x'.repeat(256) });
  f.component.save();
  assert.match(f.component.fieldError('razonSocial'), /150/);
  assert.match(f.component.fieldError('direccion'), /255/);
  f.component.ngOnDestroy();
});
test('crear conserva contrato API y bloquea envíos repetidos y cierre durante guardado', () => {
  const f = fixture();
  f.component.openModal();
  f.component.form.patchValue({
    razonSocial: ' Nueva empresa ',
    ruc: '20000000002',
    direccion: 'Detalle',
  });
  f.component.save();
  f.component.save();
  f.component.closeModal();
  assert.equal(f.creates.length, 1);
  assert.equal(f.dialog.open, true);
  assert.equal(f.component.form.disabled, true);
  assert.equal(f.creates[0].payload.razonSocial, 'Nueva empresa');
  assert.equal(f.creates[0].payload.estado, true);
  assert.equal(f.creates[0].payload.direccion, 'Detalle');
  assert.equal(Object.keys(f.creates[0].payload).length, 6);
  f.creates[0].response.next({ success: true });
  assert.equal(f.dialog.open, false);
  assert.equal(f.lists.length, 2);
  assert.match(f.component.successMessage, /creada/);
  f.component.ngOnDestroy();
});
test('editar usa ID correcto y permite reactivar; fallos conservan el borrador', () => {
  const f = fixture();
  f.component.edit(company(7, { estado: false }));
  f.component.form.patchValue({ razonSocial: 'Editada', estado: true });
  f.component.save();
  assert.equal(f.updates[0].id, 7);
  assert.equal(f.updates[0].payload.estado, true);
  f.updates[0].response.error({ error: { message: 'Nombre duplicado' } });
  assert.equal(f.component.errorMessage, 'Nombre duplicado');
  assert.equal(f.component.form.enabled, true);
  assert.equal(f.component.form.get('razonSocial').value, 'Editada');
  f.component.save();
  f.updates[1].response.next({ success: false });
  assert.equal(f.dialog.open, true);
  assert.ok(f.component.errorMessage);
  f.component.ngOnDestroy();
});
test('eliminar requiere confirmación y desactiva solo una vez', async () => {
  const f = fixture();
  alerts.answer = { isConfirmed: false };
  await f.component.remove(company(1));
  assert.equal(f.deletes.length, 0);
  alerts.answer = { isConfirmed: true };
  await f.component.remove(company(1));
  await f.component.remove(company(1));
  assert.equal(f.deletes.length, 1);
  f.deletes[0].response.next({ success: true });
  assert.match(f.component.successMessage, /desactivada/);
  assert.equal(f.lists.length, 2);
  f.component.ngOnDestroy();
});
test('inactivas no se desactivan de nuevo y errores permiten reintentar', async () => {
  const f = fixture();
  alerts.answer = { isConfirmed: true };
  await f.component.remove(company(1, { estado: false }));
  assert.equal(f.deletes.length, 0);
  await f.component.remove(company(1));
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
  other.component.form.patchValue({ razonSocial: 'Empresa', ruc: '20000000002' });
  other.component.save();
  other.component.ngOnDestroy();
  assert.equal(other.creates[0].response.observers.length, 0);
  assert.equal(other.dialog.open, false);
  const third = fixture();
  alerts.answer = { isConfirmed: true };
  const pending = third.component.remove(company(1));
  third.component.ngOnDestroy();
  await pending;
  assert.equal(third.deletes.length, 0);
});
test('editar restaura los seis campos y no reutiliza el borrador anterior', () => {
  const f = fixture();
  f.component.edit(
    company(4, {
      razonSocial: 'Empresa completa',
      email: 'info@example.test',
      telefono: '+51 999',
      direccion: 'Calle 1',
      estado: false,
    }),
  );
  assert.equal(f.component.form.get('ruc').value, '20000000004');
  assert.equal(f.component.form.get('email').value, 'info@example.test');
  assert.equal(f.component.form.get('telefono').value, '+51 999');
  assert.equal(f.component.form.get('direccion').value, 'Calle 1');
  f.component.closeModal();
  f.component.openModal();
  assert.equal(f.component.form.get('telefono').value, '');
  assert.equal(f.component.form.get('estado').value, true);
  f.component.ngOnDestroy();
});
test('campos opcionales vacíos permiten guardar sin imponer RUC numérico ni longitud 11', () => {
  const f = fixture();
  f.component.openModal();
  f.component.form.patchValue({ razonSocial: 'Ejemplo', ruc: 'ABC-2026' });
  f.component.save();
  assert.equal(f.creates.length, 1);
  assert.equal(f.creates[0].payload.ruc, 'ABC-2026');
  assert.equal(f.creates[0].payload.email, '');
  f.component.ngOnDestroy();
});
test('valida el correo opcional y los límites reales del contrato API', () => {
  const f = fixture();
  f.component.openModal();
  f.component.form.patchValue({
    razonSocial: 'Ejemplo',
    ruc: 'X'.repeat(21),
    email: 'correo incorrecto',
    telefono: 'X'.repeat(31),
    direccion: 'X'.repeat(256),
  });
  f.component.save();
  assert.match(f.component.fieldError('ruc'), /20/);
  assert.match(f.component.fieldError('email'), /válido/);
  assert.match(f.component.fieldError('telefono'), /30/);
  assert.match(f.component.fieldError('direccion'), /255/);
  assert.equal(f.creates.length, 0);
  f.component.ngOnDestroy();
});
test('guarda todos los campos recortados sin perder el estado inactivo', () => {
  const f = fixture();
  f.component.openModal();
  f.component.form.patchValue({
    razonSocial: ' Ejemplo ',
    ruc: ' ABC ',
    email: ' info@example.test ',
    telefono: ' +51 999 ',
    direccion: ' Calle 1 ',
    estado: false,
  });
  f.component.save();
  const data = f.creates[0].payload;
  assert.equal(data.razonSocial, 'Ejemplo');
  assert.equal(data.ruc, 'ABC');
  assert.equal(data.email, 'info@example.test');
  assert.equal(data.telefono, '+51 999');
  assert.equal(data.direccion, 'Calle 1');
  assert.equal(data.estado, false);
  f.component.ngOnDestroy();
});
