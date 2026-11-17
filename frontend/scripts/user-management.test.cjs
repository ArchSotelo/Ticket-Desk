// node --test scripts/user-management.test.cjs — API simulada, sin registros reales.
const { test, before } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const rxjs = require('rxjs');
let Users, forms;
const alerts = { answer: { isConfirmed: false }, fire: () => Promise.resolve(alerts.answer) };
const flushConfirmation = () => new Promise((resolve) => setImmediate(resolve));
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
before(async () => {
  await import('@angular/compiler');
  forms = await import('@angular/forms');
  const mod = { exports: {} };
  vm.runInNewContext(
    ts.transpileModule(
      fs.readFileSync(
        path.resolve(__dirname, '../src/app/users/user-management.component.ts'),
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
        if (name === '@angular/core')
          return { Component: () => (cls) => cls, ViewChild: () => () => {} };
        if (name === '@angular/forms') return forms;
        if (name === '@angular/common/http') return { HttpParams: Params };
        if (name === 'sweetalert2') return { default: alerts };
        if (name.startsWith('@angular/') || name.startsWith('../core/')) return {};
        throw new Error(name);
      },
    },
  );
  Users = mod.exports.UserManagementComponent;
});
const user = (extra = {}) => ({
  id: 1,
  username: 'USER1',
  nombres: 'Ana',
  apellidos: 'Torres',
  email: 'ana@example.test',
  empresaId: 1,
  empresaNombre: 'Empresa A',
  areaId: 3,
  areaNombre: 'Sistemas',
  cargo: 'Analista',
  estado: 'ACTIVO',
  roles: ['ROLE_CLIENTE'],
  ...extra,
});
const page = (extra = {}) => ({
  content: [user()],
  totalElements: 20,
  totalPages: 3,
  number: 0,
  size: 8,
  ...extra,
});
function fixture(options = {}) {
  const requests = [],
    companies = [],
    areas = [],
    saved = options.saved || new Map();
  const http = Object.fromEntries(
    ['get', 'post', 'put', 'patch'].map((method) => [
      method,
      (url, body) => {
        const response = new rxjs.Subject();
        requests.push({ method, url, body, response });
        return response;
      },
    ]),
  );
  const org = {
    listarEmpresas() {
      const response = new rxjs.Subject();
      companies.push(response);
      return response;
    },
    listarAreas(id) {
      const response = new rxjs.Subject();
      areas.push({ id, response });
      return response;
    },
  };
  const component = new Users(http, new forms.FormBuilder(), org, {
    load: (key, defaults) => ({ ...defaults, ...saved.get(key) }),
    save: (key, value) => saved.set(key, { ...value }),
  });
  const dialog = {
    open: false,
    showModal() {
      this.open = true;
    },
    close() {
      this.open = false;
    },
  };
  component.userEditor = { nativeElement: dialog };
  component.ngOnInit();
  const send = (extra) =>
    requests
      .filter((r) => r.method === 'get' && r.url === '/api/v1/users')
      .at(-1)
      .response.next({ success: true, data: page(extra) });
  if (!options.deferred) {
    send();
    companies[0].next({
      success: true,
      data: [
        { id: 1, razonSocial: 'Empresa A', estado: false },
        { id: 2, razonSocial: 'Empresa B', estado: true },
      ],
    });
  }
  return { component, requests, companies, areas, saved, dialog, send };
}
function validForm(f) {
  f.component.userForm.patchValue({
    username: 'NEW',
    password: 'Password123',
    nombres: 'Ana',
    apellidos: 'Torres',
    email: 'new@example.test',
    empresaId: 1,
    areaId: null,
    roles: 'ROLE_CLIENTE',
  });
}
function editLoaded(f, extra = {}) {
  f.component.edit(1);
  f.requests.at(-1).response.next({ success: true, data: user(extra) });
  f.areas.at(-1).response.next({
    success: true,
    data: [{ id: 3, empresaId: 1, nombre: 'Sistemas', activo: true }],
  });
}

test('listado usa paginación del servidor y ocho filas iniciales, sin conteos ficticios', () => {
  const f = fixture({ deferred: true });
  assert.equal(f.component.loaded, false);
  assert.equal(f.component.loadingUsers, true);
  assert.equal(f.component.totalElements, 0);
  f.send();
  assert.equal(f.component.totalElements, 20);
  assert.equal(f.component.totalPages, 3);
  assert.equal(f.component.firstItemIndex, 1);
  assert.equal(f.component.lastItemIndex, 8);
  f.component.ngOnDestroy();
});
test('combina búsqueda, rol, empresa y estado en la API antes de paginar', () => {
  const f = fixture();
  Object.assign(f.component, {
    busqueda: '  ANA  ',
    rolFiltro: 'ROLE_TECNICO',
    empresaFiltro: '2',
    estadoFiltro: 'BLOQUEADO',
  });
  f.component.buscarUsuarios();
  const params = f.requests.at(-1).body.params;
  assert.equal(params.get('busqueda'), 'ANA');
  assert.equal(params.get('rol'), 'ROLE_TECNICO');
  assert.equal(params.get('empresaId'), '2');
  assert.equal(params.get('estado'), 'BLOQUEADO');
  assert.equal(params.get('page'), '0');
  f.component.ngOnDestroy();
});
test('paginar y cambiar filas no aplica filtros en borrador', () => {
  const f = fixture();
  f.component.busqueda = 'Borrador';
  f.component.rolFiltro = 'ROLE_ADMIN';
  f.component.irAPagina(1);
  assert.equal(f.requests.at(-1).body.params.get('busqueda'), '');
  assert.equal(f.requests.at(-1).body.params.get('rol'), undefined);
  f.send({ number: 1 });
  f.component.cambiarTamanoPagina(5);
  assert.equal(f.requests.at(-1).body.params.get('size'), '5');
  f.component.ngOnDestroy();
});
test('guarda los filtros aplicados y página para restaurarlos al regresar', () => {
  const saved = new Map();
  let f = fixture({ saved });
  f.component.busqueda = 'Ana';
  f.component.estadoFiltro = 'ACTIVO';
  f.component.buscarUsuarios();
  f.send();
  f.component.irAPagina(1);
  f.send({ number: 1 });
  f.component.ngOnDestroy();
  f = fixture({ saved, deferred: true });
  assert.equal(f.component.busqueda, 'Ana');
  assert.equal(f.component.estadoFiltro, 'ACTIVO');
  assert.equal(f.requests[0].body.params.get('page'), '1');
  f.component.ngOnDestroy();
});
test('limpiar restablece filtros sin cambiar tamaño, descarta persistencia inválida', () => {
  const f = fixture({
    saved: new Map([
      [
        'admin-users',
        {
          busqueda: null,
          rol: 'BAD',
          empresaId: '../1',
          estado: 'BAD',
          pageIndex: -1,
          pageSize: 0,
        },
      ],
    ]),
  });
  assert.equal(f.component.hasFilters, false);
  assert.equal(f.component.pageSize, 8);
  f.component.estadoFiltro = 'INACTIVO';
  f.component.buscarUsuarios();
  f.send();
  f.component.clearFilters();
  assert.equal(f.component.hasFilters, false);
  assert.equal(f.requests.at(-1).body.params.get('estado'), undefined);
  f.component.ngOnDestroy();
});
test('valida páginas/tamaños y ajusta última página si el filtro reduce resultados', () => {
  const f = fixture();
  f.component.irAPagina(-1);
  f.component.irAPagina(1.5);
  f.component.cambiarTamanoPagina(0);
  assert.equal(f.requests.length, 1);
  f.component.irAPagina(2);
  f.send({ content: [], number: 2, totalElements: 3, totalPages: 1 });
  assert.equal(f.requests.at(-1).body.params.get('page'), '0');
  f.component.ngOnDestroy();
});
test('vacío real y error de carga son distintos; reintentar no inventa cero resultados', () => {
  const f = fixture();
  f.component.loadUsers();
  f.requests.at(-1).response.error(new Error('offline'));
  assert.equal(f.component.loaded, false);
  assert.ok(f.component.loadError);
  f.component.loadUsers();
  f.send({ content: [], totalElements: 0, totalPages: 0 });
  assert.equal(f.component.loaded, true);
  assert.equal(f.component.totalElements, 0);
  assert.equal(f.component.firstItemIndex, 0);
  assert.equal(f.component.visiblePages().length, 0);
  f.component.ngOnDestroy();
});
test('rechaza respuesta sin metadatos y cancela búsquedas antiguas', () => {
  const f = fixture({ deferred: true });
  f.component.buscarUsuarios();
  assert.equal(f.requests[0].response.observers.length, 0);
  f.requests.at(-1).response.next({ success: true, data: {} });
  assert.ok(f.component.loadError);
  f.component.ngOnDestroy();
});
test('presenta identidad y múltiples roles con respaldo y estado bloqueado', () => {
  const f = fixture();
  assert.equal(f.component.fullName(user()), 'Ana Torres');
  assert.equal(f.component.initials(user()), 'AT');
  assert.equal(f.component.formatRole('ROLE_TECNICO'), 'Técnico');
  assert.equal(f.component.roleIcon('ROLE_ADMIN'), 'shield');
  assert.equal(f.component.statusLabel('BLOQUEADO'), 'Bloqueado');
  assert.equal(f.component.formatRole('ROLE_CUSTOM'), 'CUSTOM');
  f.component.ngOnDestroy();
});
test('nuevo formulario conserva todos los campos, muestra errores y no envía incompleto', () => {
  const f = fixture();
  f.component.openCreateModal();
  f.component.save();
  assert.equal(f.requests.filter((r) => r.method === 'post').length, 0);
  assert.equal(f.component.fieldError('nombres'), 'Completa este campo.');
  f.component.userForm.patchValue({ nombres: '   ' });
  f.component.save();
  assert.equal(f.component.fieldError('nombres'), 'Completa este campo.');
  assert.equal(f.dialog.open, true);
  f.component.ngOnDestroy();
});
test('crear conserva contrato, bloquea doble envío y cierre mientras guarda', () => {
  const f = fixture();
  f.component.openCreateModal();
  validForm(f);
  f.component.save();
  f.component.save();
  f.component.closeModal();
  assert.equal(f.requests.filter((r) => r.method === 'post').length, 1);
  assert.equal(f.component.userForm.disabled, true);
  assert.equal(f.dialog.open, true);
  const request = f.requests.at(-1);
  assert.equal(request.body.roles.join(','), 'ROLE_CLIENTE');
  assert.equal(request.body.empresaId, 1);
  assert.equal(request.body.areaId, null);
  request.response.next({ success: true });
  assert.equal(f.dialog.open, false);
  assert.match(f.component.successMessage, /creado/);
  f.component.ngOnDestroy();
});
test('edición conserva contraseña vacía y roles existentes si no se cambia el rol', () => {
  const f = fixture();
  editLoaded(f, { roles: ['ROLE_TECNICO', 'ROLE_ADMIN'] });
  f.component.userForm.patchValue({ nombres: 'Actualizado' });
  f.component.save();
  const request = f.requests.at(-1);
  assert.equal(request.method, 'put');
  assert.equal(request.url, '/api/v1/users/1');
  assert.equal('password' in request.body, false);
  assert.equal('roles' in request.body, false);
  f.component.ngOnDestroy();
});
test('cambiar rol explícitamente envía el seleccionado y contraseña corta se valida', () => {
  const f = fixture();
  editLoaded(f);
  f.component.userForm.patchValue({ password: 'short', roles: 'ROLE_ADMIN' });
  f.component.save();
  assert.match(f.component.fieldError('password'), /8/);
  f.component.userForm.patchValue({ password: 'NewPassword123' });
  f.component.save();
  assert.equal(f.requests.at(-1).body.roles.join(','), 'ROLE_ADMIN');
  assert.equal(f.requests.at(-1).body.password, 'NewPassword123');
  f.component.ngOnDestroy();
});
test('error al guardar conserva datos y permite reintentar', () => {
  const f = fixture();
  f.component.openCreateModal();
  validForm(f);
  f.component.save();
  f.requests.at(-1).response.error({ error: { message: 'Usuario duplicado' } });
  assert.equal(f.component.userForm.enabled, true);
  assert.equal(f.component.userForm.get('username').value, 'NEW');
  assert.equal(f.component.errorMessage, 'Usuario duplicado');
  f.component.save();
  assert.equal(f.requests.filter((r) => r.method === 'post').length, 2);
  f.component.ngOnDestroy();
});
test('carga fallida del detalle no permite guardar valores residuales de otro usuario', () => {
  const f = fixture();
  editLoaded(f);
  f.component.edit(2);
  f.requests.at(-1).response.error(new Error('offline'));
  f.component.save();
  assert.equal(f.component.usuarioEditando, null);
  assert.equal(f.component.userForm.disabled, true);
  assert.equal(f.requests.filter((r) => r.method === 'put').length, 0);
  f.component.ngOnDestroy();
});
test('cambiar empresa limpia área y cancela catálogo anterior', () => {
  const f = fixture();
  editLoaded(f);
  f.component.onEmpresaChange(2);
  const old = f.areas.at(-1);
  f.component.onEmpresaChange(1);
  assert.equal(old.response.observers.length, 0);
  assert.equal(f.component.userForm.get('areaId').value, null);
  f.component.ngOnDestroy();
});
test('catálogos fallidos bloquean guardado y permiten reintentar sin afectar la lista', () => {
  const f = fixture();
  f.component.loadCompanies();
  f.companies.at(-1).error(new Error('offline'));
  f.component.openCreateModal();
  validForm(f);
  f.component.save();
  assert.equal(f.requests.filter((r) => r.method === 'post').length, 0);
  assert.equal(f.component.usuarios.length, 1);
  assert.ok(f.component.companiesError);
  f.component.loadCompanies();
  f.companies.at(-1).next({ success: true, data: [{ id: 1, razonSocial: 'Empresa A' }] });
  f.component.save();
  assert.equal(f.requests.at(-1).method, 'post');
  f.component.ngOnDestroy();
});
test('área original ausente del catálogo puede conservarse solo en la empresa original', () => {
  const f = fixture();
  editLoaded(f);
  f.component.areas = [];
  assert.equal(f.component.originalAreaMissing, true);
  f.component.save();
  assert.equal(f.requests.at(-1).method, 'put');
  f.component.ngOnDestroy();
});
test('activar/desactivar exige una confirmación y evita peticiones duplicadas', async () => {
  const f = fixture();
  alerts.answer = { isConfirmed: false };
  f.component.toggleEstado(user());
  await flushConfirmation();
  assert.equal(f.requests.filter((r) => r.method === 'patch').length, 0);
  alerts.answer = { isConfirmed: true };
  f.component.toggleEstado(user());
  f.component.toggleEstado(user());
  await flushConfirmation();
  const request = f.requests.at(-1);
  assert.equal(request.url, '/api/v1/users/1/estado?estado=INACTIVO');
  assert.equal(f.requests.filter((r) => r.method === 'patch').length, 1);
  request.response.next({ success: true });
  assert.match(f.component.successMessage, /desactivado/);
  f.component.ngOnDestroy();
});
test('reactivar bloqueado o inactivo conserva endpoint y fallos no cambian el estado', async () => {
  const f = fixture();
  alerts.answer = { isConfirmed: true };
  const item = user({ estado: 'BLOQUEADO' });
  f.component.toggleEstado(item);
  await flushConfirmation();
  assert.match(f.requests.at(-1).url, /estado=ACTIVO/);
  f.requests.at(-1).response.error({ error: { message: 'Sin permisos' } });
  assert.equal(item.estado, 'BLOQUEADO');
  assert.equal(f.component.changingId, null);
  assert.equal(f.component.errorMessage, 'Sin permisos');
  f.component.ngOnDestroy();
});
test('salir cancela listado, catálogos, detalle y guardado; confirmación tardía no escribe', async () => {
  const f = fixture();
  f.component.openCreateModal();
  validForm(f);
  f.component.save();
  f.component.ngOnDestroy();
  for (const request of f.requests) assert.equal(request.response.observers.length, 0);
  assert.equal(f.companies[0].observers.length, 0);
  assert.equal(f.dialog.open, false);
  const other = fixture();
  alerts.answer = { isConfirmed: true };
  other.component.toggleEstado(user());
  other.component.ngOnDestroy();
  await flushConfirmation();
  assert.equal(other.requests.filter((r) => r.method === 'patch').length, 0);
});

test('el área permanece deshabilitada sin empresa y mientras carga su catálogo', () => {
  const f = fixture();
  f.component.openCreateModal();
  assert.equal(f.component.userForm.get('areaId').disabled, true);
  assert.equal(f.component.areaPlaceholder, 'Selecciona primero una empresa');
  f.component.userForm.patchValue({ empresaId: 1 });
  f.component.onEmpresaChange(1);
  assert.equal(f.component.userForm.get('areaId').disabled, true);
  assert.equal(f.component.areaPlaceholder, 'Cargando áreas…');
  f.areas
    .at(-1)
    .response.next({ success: true, data: [{ id: 3, empresaId: 1, nombre: 'Sistemas' }] });
  assert.equal(f.component.userForm.get('areaId').enabled, true);
  assert.equal(f.component.areaPlaceholder, 'Sin área');
  f.component.userForm.patchValue({ areaId: 3, empresaId: null });
  f.component.onEmpresaChange(null);
  assert.equal(f.component.userForm.get('areaId').value, null);
  assert.equal(f.component.userForm.get('areaId').disabled, true);
  f.component.ngOnDestroy();
});
test('fallo de áreas bloquea su selección y reintentar recupera el catálogo sin perder empresa', () => {
  const f = fixture();
  f.component.openCreateModal();
  f.component.userForm.patchValue({ empresaId: 1 });
  f.component.onEmpresaChange(1);
  f.areas.at(-1).response.error(new Error('offline'));
  assert.equal(f.component.userForm.get('areaId').disabled, true);
  assert.equal(f.component.areaPlaceholder, 'Áreas no disponibles');
  f.component.loadAreas(1);
  f.areas.at(-1).response.next({ success: true, data: [] });
  assert.equal(f.component.userForm.get('areaId').enabled, true);
  assert.equal(f.component.userForm.get('empresaId').value, 1);
  f.component.ngOnDestroy();
});
test('mostrar contraseña no modifica su valor y se restablece al cerrar o cambiar de usuario', () => {
  const f = fixture();
  f.component.openCreateModal();
  f.component.userForm.patchValue({ password: 'Password123' });
  f.component.togglePasswordVisibility();
  assert.equal(f.component.showPassword, true);
  assert.equal(f.component.userForm.get('password').value, 'Password123');
  f.component.togglePasswordVisibility();
  assert.equal(f.component.showPassword, false);
  f.component.togglePasswordVisibility();
  f.component.closeModal();
  assert.equal(f.component.showPassword, false);
  f.component.openCreateModal();
  assert.equal(f.component.showPassword, false);
  assert.equal(f.component.userForm.get('password').value, '');
  f.component.togglePasswordVisibility();
  editLoaded(f);
  assert.equal(f.component.showPassword, false);
  f.component.ngOnDestroy();
});
test('no revela contraseña cuando el detalle está cargando o el formulario se está guardando', () => {
  const f = fixture();
  f.component.edit(1);
  f.component.togglePasswordVisibility();
  assert.equal(f.component.showPassword, false);
  f.component.closeModal();
  f.component.openCreateModal();
  validForm(f);
  f.component.save();
  f.component.togglePasswordVisibility();
  assert.equal(f.component.showPassword, false);
  f.component.ngOnDestroy();
});
