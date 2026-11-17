// Ejecutar: node --test scripts/service-renewal.test.cjs
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const rxjs = require('rxjs');

function load(name, fileName) {
  const file = path.resolve(__dirname, '../src/app/servicios/' + fileName);
  const module = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      experimentalDecorators: true,
    },
  }).outputText;
  vm.runInNewContext(
    code,
    {
      exports: module.exports,
      module,
      Date,
      URL,
      require: (dependency) => {
        if (dependency === 'rxjs')
          return {
            ...rxjs,
            // Normalize VM object literals to the host realm expected by RxJS forkJoin.
            forkJoin: (sources) => rxjs.forkJoin(Object.fromEntries(Object.entries(sources))),
          };
        if (dependency === '@angular/core')
          return { Component: () => (component) => component, ViewChild: () => () => {} };
        if (dependency === '@angular/forms')
          return { Validators: { required: () => null, min: () => () => null } };
        if (dependency === 'sweetalert2' || dependency.startsWith('sweetalert2/')) return { default: { fire: () => Promise.resolve({}) } };
        if (dependency.startsWith('@angular/') || dependency.startsWith('../core/')) return {};
        throw new Error('Dependencia inesperada: ' + dependency);
      },
    },
    { filename: file },
  );
  return module.exports[name];
}
const Create = load('ServiceCreateComponent', 'service-create.component.ts');
const Detail = load('ServiceDetailComponent', 'service-detail.component.ts');
const original = {
  id: 8,
  nombre: 'Correo Google',
  proveedor: 'Google',
  tipo: 'Correo',
  estado: 'ACTIVO',
  fechaInicio: '2026-09-01',
  fechaFin: '2026-09-30',
  costoMensual: 340,
  divisa: 'PEN',
  responsable: 'Sistemas',
  notas: 'Cuenta corporativa',
  correosRecordatorio: ['primero@example.test', 'segundo@example.test'],
};

function fixture({
  id = '8',
  technician = false,
  source = original,
  fail = false,
  inactiveType = false,
} = {}) {
  const posts = [];
  const navigations = [];
  const response = new rxjs.Subject();
  const formBuilder = {
    group: (controls) => ({
      values: Object.fromEntries(Object.entries(controls).map(([key, value]) => [key, value[0]])),
      get invalid() {
        return ['nombre', 'proveedor', 'tipo', 'fechaInicio', 'fechaFin'].some(
          (key) => !this.values[key],
        );
      },
      patchValue(values) {
        Object.assign(this.values, values);
      },
      getRawValue() {
        return { ...this.values };
      },
      markAllAsTouched() {
        this.touched = true;
      },
    }),
  };
  const http = {
    get: (url) => {
      if (fail && url.includes('/services/'))
        return rxjs.throwError(() => ({ error: { message: 'No disponible' } }));
      return rxjs.of({
        success: true,
        data: url.includes('service-categories')
          ? [{ nombre: inactiveType ? 'Hosting' : 'Correo', activa: true }]
          : source,
      });
    },
    post: (url, payload) => {
      posts.push({ url, payload });
      return response;
    },
  };
  const router = { navigate: (target) => navigations.push(Array.from(target)) };
  const auth = { isTechnicianUser: () => technician };
  const route = { snapshot: { paramMap: { get: () => id } } };
  const component = new Create(formBuilder, http, router, auth, route);
  component.ngOnInit();
  return { component, posts, navigations, response, auth, router, http, route };
}

test('renovar carga todos los datos y correos sin reutilizar las fechas anteriores', () => {
  const { component } = fixture();
  const values = component.form.getRawValue();
  for (const field of [
    'nombre',
    'proveedor',
    'tipo',
    'responsable',
    'costoMensual',
    'divisa',
    'notas',
  ]) {
    assert.equal(values[field], original[field]);
  }
  assert.equal(values.fechaInicio, '');
  assert.equal(values.fechaFin, '');
  assert.deepEqual(Array.from(component.correos), original.correosRecordatorio);
  component.correos[0] = 'editado@example.test';
  assert.equal(original.correosRecordatorio[0], 'primero@example.test');
  assert.equal(component.loading, false);
});

test('la renovación conserva el tipo original aunque ya no esté activo en el catálogo', () => {
  const { component } = fixture({ inactiveType: true });
  assert.ok(component.tipos.includes('Correo'));
  assert.equal(component.form.getRawValue().tipo, 'Correo');
});

test('ambos portales envían los campos modificados y vuelven a su listado', () => {
  for (const technician of [false, true]) {
    const { component, posts, navigations, response } = fixture({ technician });
    component.form.patchValue({
      nombre: 'Correo renovado',
      proveedor: 'Proveedor nuevo',
      tipo: 'Licencia',
      responsable: 'Compras',
      costoMensual: 150,
      divisa: 'USD',
      notas: 'Nuevo periodo',
      fechaInicio: new Date(2027, 0, 1),
      fechaFin: new Date(2027, 0, 31),
    });
    component.correos = ['nuevo@example.test', ''];
    component.save();
    component.save();
    assert.equal(posts.length, 1);
    assert.equal(posts[0].url, '/api/v1/services/8/renew');
    const payload = posts[0].payload;
    assert.equal(payload.nombre, 'Correo renovado');
    assert.equal(payload.proveedor, 'Proveedor nuevo');
    assert.equal(payload.divisa, 'USD');
    assert.equal(payload.costoMensual, 150);
    assert.equal(payload.fechaInicio, '2027-01-01');
    assert.equal(payload.fechaFin, '2027-01-31');
    assert.deepEqual(Array.from(payload.correosRecordatorio), ['nuevo@example.test']);
    response.next({ success: true, message: 'Renovado' });
    response.complete();
    assert.equal(component.saving, false);
    assert.deepEqual(navigations, [[technician ? '/tecnico/servicios' : '/servicios']]);
  }
});

test('fallas de carga y servicios cerrados bloquean el guardado', () => {
  for (const options of [
    { fail: true },
    { source: { ...original, estado: 'FINALIZADO' } },
    { source: { ...original, estado: 'CANCELADO' } },
  ]) {
    const { component, posts } = fixture(options);
    assert.equal(component.loadFailed, true);
    component.save();
    assert.equal(posts.length, 0);
  }
});

test('fechas invertidas o correos inválidos no generan una renovación', () => {
  const { component, posts } = fixture();
  component.form.patchValue({ fechaInicio: '2027-02-01', fechaFin: '2027-01-01' });
  component.save();
  assert.match(component.error, /fecha de fin/);
  component.form.patchValue({ fechaFin: '2027-02-28' });
  component.correos = ['correo inválido'];
  component.save();
  assert.match(component.error, /correos/);
  assert.equal(posts.length, 0);
});

test('el formulario nuevo continúa creando servicios y no llama al endpoint de renovación', () => {
  const { component, posts } = fixture({ id: null });
  assert.equal(component.isRenewal, false);
  assert.equal(component.originalService, null);
  component.form.patchValue({
    nombre: 'Hosting',
    proveedor: 'AWS',
    tipo: 'Correo',
    fechaInicio: '2027-01-01',
    fechaFin: '2027-12-31',
  });
  component.save();
  assert.equal(posts[0].url, '/api/v1/services');
});

test('el botón renovar abre la pantalla completa del portal correspondiente', () => {
  for (const technician of [false, true]) {
    const f = fixture({ technician });
    const detail = new Detail(f.route, f.http, f.router, f.auth, {});
    detail.servicio = { ...original };
    detail.abrirRenovacion();
    assert.deepEqual(f.navigations, [
      [technician ? '/tecnico/servicios' : '/servicios', 8, 'renovar'],
    ]);
  }
});
