// node --test scripts/service-types.test.cjs — sin datos ni peticiones reales.
const { test, before } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const rxjs = require('rxjs');
let Component,
  forms,
  confirm = async () => ({ isConfirmed: true }),
  confirmations = [];
before(async () => {
  await import('@angular/compiler');
  forms = await import('@angular/forms');
  const mod = { exports: {} };
  vm.runInNewContext(
    ts.transpileModule(
      fs.readFileSync(
        path.resolve(__dirname, '../src/app/servicios/service-category-management.component.ts'),
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
        if (name === '@angular/forms') return forms;
        if (name === '@angular/core')
          return { Component: () => (cls) => cls, ViewChild: () => () => {} };
        if (name === 'sweetalert2' || name.startsWith('sweetalert2/'))
          return {
            default: {
              fire: (options) => {
                confirmations.push(options);
                return confirm(options);
              },
              close: () => {},
            },
          };
        if (name.startsWith('@angular/') || name.startsWith('../core/')) return {};
        throw new Error(name);
      },
    },
  );
  Component = mod.exports.ServiceCategoryManagementComponent;
});
const item = (id, extra = {}) => ({
  id,
  nombre: 'Tipo ' + id,
  descripcion: '',
  icono: 'category',
  activa: true,
  ...extra,
});
const records = () => [
  item(1, { nombre: 'Correo', icono: 'mail' }),
  item(2, { nombre: 'Dominio' }),
  item(3, { nombre: 'Internet Fibra Óptica', icono: 'language' }),
  item(4, { nombre: 'Página Web', descripcion: 'Sitios públicos', icono: 'public', activa: false }),
  item(5, { nombre: 'Servidor', icono: 'dns' }),
  item(6, { nombre: 'Telefonía Móvil', icono: 'miscellaneous_services' }),
];
function fixture(savedData) {
  confirmations = [];
  confirm = async () => ({ isConfirmed: true });
  const requests = [],
    navigations = [],
    saved = new Map(savedData ? [['admin-service-types', savedData]] : []),
    dialog = {
      open: false,
      showModal() {
        this.open = true;
      },
      close() {
        this.open = false;
      },
    };
  const http = Object.fromEntries(
    ['get', 'post', 'put', 'patch'].map((method) => [
      method,
      (url, payload, options) => {
        const response = new rxjs.Subject();
        requests.push({ method, url, payload, options, response });
        return response;
      },
    ]),
  );
  const component = new Component(
    http,
    new forms.FormBuilder(),
    { navigate: (commands) => navigations.push(commands) },
    {
      load: (key, defaults) => ({ ...defaults, ...saved.get(key) }),
      save: (key, value) => saved.set(key, { ...value }),
    },
  );
  component.typeEditor = { nativeElement: dialog };
  component.ngOnInit();
  return {
    component,
    requests,
    navigations,
    saved,
    dialog,
    send(data = records()) {
      requests.findLast((r) => r.method === 'get').response.next({ success: true, data });
    },
  };
}
test('carga todo el catálogo incluyendo inactivos, sin inventar registros ni conteos iniciales', () => {
  const f = fixture();
  assert.equal(f.component.loaded, false);
  assert.equal(f.component.loading, true);
  assert.equal(f.requests[0].url, '/api/v1/service-categories');
  f.send();
  assert.equal(f.component.filteredItems.length, 6);
  assert.equal(f.component.items[3].activa, false);
  f.component.ngOnDestroy();
});
test('búsqueda por nombre y descripción combina palabras e ignora acentos y mayúsculas', () => {
  const f = fixture();
  f.send();
  for (const value of ['PAGINA', 'sitios PUBLICOS', 'web publicos']) {
    f.component.search = value;
    assert.equal(f.component.filteredItems[0].id, 4);
  }
  f.component.search = 'correo fibra';
  assert.equal(f.component.filteredItems.length, 0);
  f.component.ngOnDestroy();
});
test('combina búsqueda con activos/inactivos y Limpiar restaura el catálogo', () => {
  const f = fixture();
  f.send();
  f.component.status = 'active';
  assert.equal(f.component.filteredItems.length, 5);
  f.component.search = 'pagina';
  assert.equal(f.component.filteredItems.length, 0);
  f.component.status = 'inactive';
  assert.equal(f.component.filteredItems.length, 1);
  f.component.clearFilters();
  assert.equal(f.component.filteredItems.length, 6);
  assert.equal(f.component.hasFilters, false);
  f.component.ngOnDestroy();
});
test('restaura filtros válidos y no guarda campos del formulario en sesión', () => {
  const f = fixture({ search: 'Web', status: 'inactive' });
  f.send();
  assert.equal(f.component.filteredItems[0].id, 4);
  f.component.filtersChanged();
  assert.equal(Object.keys(f.saved.get('admin-service-types')).sort().join(','), 'search,status');
  f.component.open();
  f.component.form.get('nombre').setValue('Borrador');
  assert.equal(f.saved.get('admin-service-types').search, 'Web');
  f.component.ngOnDestroy();
});
test('ignora filtros persistidos inválidos y volver usa Ajustes sin escrituras', () => {
  const f = fixture({ search: null, status: 'wrong' });
  f.send();
  assert.equal(f.component.search, '');
  assert.equal(f.component.status, '');
  f.component.back();
  assert.equal(f.navigations[0].join(''), '/ajustes');
  assert.equal(f.requests.length, 1);
  f.component.ngOnDestroy();
});
test('fallo de carga no se convierte en vacío y reintentar conserva los últimos datos', () => {
  const f = fixture();
  f.requests[0].response.error({});
  assert.equal(f.component.loaded, false);
  assert.ok(f.component.loadError);
  f.component.open();
  assert.equal(f.component.showModal, false);
  f.component.load();
  f.send();
  f.component.load();
  f.requests.at(-1).response.error({});
  assert.equal(f.component.items.length, 6);
  assert.match(f.component.loadError, /últimos datos/);
  f.component.ngOnDestroy();
});
test('rechaza respuesta sin datos y cancela la carga anterior al reintentar', () => {
  const f = fixture(),
    old = f.requests[0];
  f.component.load();
  assert.equal(old.response.observed, false);
  f.requests.at(-1).response.next({ success: true });
  assert.ok(f.component.loadError);
  assert.equal(f.component.loaded, false);
  f.component.ngOnDestroy();
});
test('los iconos siguen siendo dinámicos y el original no listado se conserva al editar', () => {
  const f = fixture();
  f.send();
  assert.equal(f.component.iconFor(f.component.items[5]), 'miscellaneous_services');
  assert.equal(f.component.iconFor(item(7, { icono: '  ' })), 'category');
  f.component.edit(f.component.items[3]);
  assert.equal(f.component.hasCustomIcon, true);
  assert.equal(f.component.form.get('icono').value, 'public');
  assert.equal(f.component.iconoLabel('public'), 'public');
  f.component.close();
  f.component.open();
  assert.equal(f.component.hasCustomIcon, false);
  assert.equal(f.component.form.get('icono').value, 'category');
  f.component.ngOnDestroy();
});
test('formulario conserva tres campos y valida nombre vacío, espacios y límites del esquema', () => {
  const f = fixture();
  f.send();
  f.component.open();
  assert.equal(Object.keys(f.component.form.controls).sort().join(','), 'descripcion,icono,nombre');
  f.component.save();
  assert.match(f.component.fieldError('nombre'), /Ingresa/);
  f.component.form.get('nombre').setValue('   ');
  f.component.save();
  assert.equal(f.component.form.invalid, true);
  f.component.form.get('nombre').setValue('a'.repeat(101));
  f.component.save();
  assert.match(f.component.fieldError('nombre'), /100/);
  f.component.form.get('nombre').setValue('Nuevo');
  f.component.form.get('descripcion').setValue('x'.repeat(256));
  f.component.save();
  assert.match(f.component.fieldError('descripcion'), /255/);
  assert.equal(f.requests.length, 1);
  f.component.ngOnDestroy();
});
test('crear envía POST existente una sola vez, bloquea cierre y recarga conservando filtros', () => {
  const f = fixture();
  f.send();
  f.component.search = 'Correo';
  f.component.open();
  f.component.form.patchValue({ nombre: '  Nuevo  ', icono: 'cloud', descripcion: 'Nube' });
  f.component.save();
  f.component.save();
  const req = f.requests.at(-1);
  assert.equal(req.method, 'post');
  assert.equal(req.payload.nombre, 'Nuevo');
  assert.equal(req.payload.icono, 'cloud');
  assert.equal(req.payload.activa, undefined);
  f.component.close();
  assert.equal(f.component.showModal, true);
  f.component.back();
  assert.equal(f.navigations.length, 0);
  req.response.next({ success: true });
  assert.equal(f.component.showModal, false);
  assert.equal(f.dialog.open, false);
  assert.equal(f.component.search, 'Correo');
  assert.equal(f.requests.at(-1).method, 'get');
  f.component.ngOnDestroy();
});
test('editar usa el ID y conserva el estado sin incluir activa en el payload', () => {
  const f = fixture();
  f.send();
  f.component.edit(f.component.items[3]);
  f.component.save();
  const req = f.requests.at(-1);
  assert.equal(req.method, 'put');
  assert.equal(req.url, '/api/v1/service-categories/4');
  assert.equal(req.payload.activa, undefined);
  assert.equal(req.payload.icono, 'public');
  assert.equal(req.payload.id, undefined);
  f.component.ngOnDestroy();
});
test('error de guardado mantiene el formulario y permite reintentar sin perder datos', () => {
  const f = fixture();
  f.send();
  f.component.open();
  f.component.form.get('nombre').setValue('Prueba');
  f.component.save();
  f.requests.at(-1).response.error({ error: { message: 'Duplicado' } });
  assert.equal(f.component.saving, false);
  assert.equal(f.component.showModal, true);
  assert.equal(f.component.form.disabled, false);
  assert.equal(f.component.formError, 'Duplicado');
  assert.equal(f.component.form.get('nombre').value, 'Prueba');
  f.component.save();
  f.requests.at(-1).response.next({ success: false, message: 'Falló' });
  assert.equal(f.component.formError, 'Falló');
  f.component.ngOnDestroy();
});
test('cancelar cambio de estado no escribe ni elimina el tipo', async () => {
  const f = fixture();
  f.send();
  confirm = async () => ({ isConfirmed: false });
  await f.component.toggle(f.component.items[0]);
  assert.equal(f.requests.length, 1);
  assert.equal(f.component.items.length, 6);
  assert.equal(f.component.items[0].activa, true);
  f.component.ngOnDestroy();
});
test('desactivar exige confirmación, envía PATCH una vez y actualiza tras éxito', async () => {
  const f = fixture();
  f.send();
  f.component.status = 'active';
  await f.component.toggle(f.component.items[0]);
  await f.component.toggle(f.component.items[0]);
  const req = f.requests.at(-1);
  assert.equal(confirmations.length, 1);
  assert.equal(req.method, 'patch');
  assert.equal(req.url, '/api/v1/service-categories/1/status');
  assert.equal(req.options.params.activa, false);
  assert.equal(f.component.items[0].activa, true);
  req.response.next({ success: true });
  assert.equal(f.component.items[0].activa, false);
  assert.equal(f.component.filteredItems.length, 4);
  assert.equal(f.component.items.length, 6);
  f.component.ngOnDestroy();
});
test('activar conserva registros e iconos; un fallo no cambia el estado', async () => {
  const f = fixture();
  f.send();
  await f.component.toggle(f.component.items[3]);
  let req = f.requests.at(-1);
  assert.equal(req.options.params.activa, true);
  req.response.error({ error: { message: 'Sin permiso' } });
  assert.equal(f.component.items[3].activa, false);
  assert.equal(f.component.changingId, null);
  assert.equal(f.component.errorMessage, 'Sin permiso');
  await f.component.toggle(f.component.items[3]);
  req = f.requests.at(-1);
  req.response.next({ success: true });
  assert.equal(f.component.items[3].activa, true);
  assert.equal(f.component.items[3].icono, 'public');
  f.component.ngOnDestroy();
});
test('salir durante confirmación no permite una escritura tardía', async () => {
  const f = fixture();
  f.send();
  let resolve;
  confirm = () => new Promise((r) => (resolve = r));
  const pending = f.component.toggle(f.component.items[0]);
  f.component.ngOnDestroy();
  resolve({ isConfirmed: true });
  await pending;
  assert.equal(f.requests.length, 1);
});
test('destruir cancela cargas y guardados pendientes y cierra el diálogo', () => {
  const f = fixture();
  f.send();
  f.component.open();
  f.component.form.get('nombre').setValue('Nuevo');
  f.component.save();
  const req = f.requests.at(-1);
  f.component.ngOnDestroy();
  assert.equal(req.response.observed, false);
  assert.equal(f.requests[0].response.observed, false);
  assert.equal(f.dialog.open, false);
  req.response.next({ success: true });
  assert.equal(f.requests.length, 2);
});
