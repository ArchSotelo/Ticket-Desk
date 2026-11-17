// Ejecutar: node --test scripts/ticket-create-validation.test.cjs
const { test, before } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const rxjs = require('rxjs');
let Create;
let FormBuilder;

before(async () => {
  // Use Angular's real forms and validators, including minlength and touched state.
  await import('@angular/compiler');
  const forms = await import('@angular/forms');
  FormBuilder = forms.FormBuilder;
  const file = path.resolve(__dirname, '../src/app/cliente/client-ticket-create.component.ts');
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      experimentalDecorators: true,
    },
  }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(
    code,
    {
      exports: module.exports,
      module,
      Date,
      Math,
      crypto: { randomUUID: () => 'test-idempotency-key' },
      setTimeout: (callback) => callback(),
      require: (name) => {
        if (name.endsWith('/attachment-alert')) return { showAttachmentAlert() {} };
        if (name.endsWith('/attachment-policy')) return require('./attachment-policy.fixture.cjs');
        if (name === 'rxjs') return rxjs;
        if (name === '@angular/forms') return forms;
        if (name === '@angular/core')
          return { Component: () => (component) => component, ViewChild: () => () => {} };
        if (name === 'sweetalert2' || name.startsWith('sweetalert2/')) return { default: { fire: () => Promise.resolve({}) } };
        if (name.startsWith('@angular/') || name.startsWith('../core/')) return {};
        throw new Error('Dependencia inesperada: ' + name);
      },
    },
    { filename: file },
  );
  Create = module.exports.ClientTicketCreateComponent;
});

function fixture(role = 'client', empresaId = 1) {
  const requests = [];
  const uploads = [];
  const navigations = [];
  const focused = [];
  const response = new rxjs.Subject();
  const userService = { getProfile: () => rxjs.of({ data: { empresaId, areaId: 1 } }) };
  const http = {
    get: (url) =>
      rxjs.of({
        success: true,
        data: url.includes('/users') ? { content: [] } : [],
      }),
  };
  const ticketService = {
    crearTicket: (payload, key) => {
      requests.push({ payload, key });
      return response;
    },
  };
  const attachmentService = {
    subirAdjunto: (id, file) => {
      uploads.push({ id, file });
      return rxjs.of({ success: true });
    },
  };
  const router = {
    navigate: (target) => {
      navigations.push(Array.from(target));
      return Promise.resolve(true);
    },
  };
  const route = { snapshot: { data: { role } } };
  const component = new Create(
    new FormBuilder(),
    ticketService,
    attachmentService,
    userService,
    http,
    router,
    route,
  );
  component.ngOnInit();
  component.formElement = {
    nativeElement: {
      querySelector: (selector) =>
        selector.includes('empresaId')
          ? null
          : {
              focus: () => focused.push(selector),
              scrollIntoView: () => {},
            },
    },
  };
  component.validationSummary = {
    nativeElement: {
      focus: () => focused.push('summary'),
      scrollIntoView: () => {},
    },
  };
  return { component, requests, uploads, navigations, focused, response };
}

test('un envío incompleto muestra los campos obligatorios sin llamar a la API', async () => {
  const { component, requests, focused } = fixture();
  await component.onSubmit();
  assert.equal(component.submitAttempted, true);
  assert.equal(component.ticketForm.get('titulo').touched, true);
  assert.equal(component.ticketForm.get('descripcion').touched, true);
  assert.deepEqual(
    Array.from(component.validationIssues, (issue) => issue.control),
    ['titulo', 'prioridadId', 'categoriaId', 'subcategoriaId', 'descripcion'],
  );
  assert.equal(requests.length, 0);
  assert.match(focused[0], /titulo/);
});

test('indica el mínimo de caracteres y conserva los datos y adjuntos', async () => {
  const { component, requests } = fixture();
  component.ticketForm.patchValue({
    titulo: 'aa',
    descripcion: 'corto',
    categoriaId: 2,
    prioridadId: 1,
  });
  const file = { name: 'evidencia.png' };
  component.adjuntosPendientes = [file];
  await component.onSubmit();
  assert.match(component.fieldError('titulo'), /al menos 5 caracteres/);
  assert.match(component.fieldError('descripcion'), /al menos 10 caracteres/);
  assert.equal(component.ticketForm.get('titulo').value, 'aa');
  assert.equal(component.adjuntosPendientes[0], file);
  assert.equal(requests.length, 0);
});

test('admin y técnico deben seleccionar cliente y subcategoría, sin exigir área', async () => {
  for (const role of ['admin', 'technician']) {
    const { component, requests } = fixture(role);
    await component.onSubmit();
    assert.equal(component.validationIssues[0].control, 'clienteId');
    assert.equal(component.fieldError('clienteId'), 'Selecciona un cliente.');
    assert.equal(component.fieldError('subcategoriaId'), 'Selecciona una subcategoría.');
    assert.equal(component.fieldError('areaId'), '');
    assert.ok(!component.validationIssues.some((issue) => issue.control === 'empresaId'));
    assert.equal(requests.length, 0);
  }
});

test('una empresa faltante se explica aunque no sea un campo editable', async () => {
  const { component, focused } = fixture('client', null);
  component.ticketForm.patchValue({
    titulo: 'Problema de correo',
    descripcion: 'No puedo acceder a mi cuenta.',
    categoriaId: 2,
    subcategoriaId: 4,
    prioridadId: 1,
  });
  await component.onSubmit();
  assert.equal(component.validationIssues.length, 1);
  assert.match(component.validationIssues[0].message, /Contacta al administrador/);
  assert.deepEqual(focused, ['summary']);
  const staff = fixture('admin').component;
  staff.ticketForm.patchValue({ clienteId: 2 });
  assert.match(staff.fieldError('empresaId'), /cliente seleccionado/);
});

test('el resumen se actualiza al corregir los campos sin borrar el formulario', async () => {
  const { component } = fixture();
  await component.onSubmit();
  component.ticketForm.patchValue({
    titulo: 'Problema de correo',
    descripcion: 'No puedo acceder a mi cuenta.',
    categoriaId: 2,
    subcategoriaId: 4,
    prioridadId: 1,
  });
  assert.equal(component.validationIssues.length, 0);
  assert.equal(component.ticketForm.valid, true);
});

test('los enlaces del resumen dirigen el foco al campo correspondiente', () => {
  const { component, focused } = fixture();
  component.focusField('prioridadId');
  assert.match(focused[0], /prioridadId/);
});

test('el envío válido mantiene el bloqueo de duplicados y la idempotencia en los tres portales', async () => {
  for (const role of ['client', 'admin', 'technician']) {
    const { component, requests, navigations, response } = fixture(role);
    component.ticketForm.patchValue({
      titulo: 'Problema de correo',
      descripcion: 'No puedo acceder a mi cuenta.',
      categoriaId: 2,
      subcategoriaId: 4,
      prioridadId: 1,
      empresaId: 1,
      clienteId: role === 'client' ? null : 3,
    });
    const pending = component.onSubmit();
    assert.equal(component.loading, true);
    await component.onSubmit();
    assert.equal(requests.length, 1);
    assert.equal(requests[0].key, 'test-idempotency-key');
    response.next({ success: true, data: { id: 99 } });
    response.complete();
    await pending;
    assert.equal(component.loading, false);
    assert.equal(component.submitAttempted, false);
    assert.deepEqual(navigations, [
      [
        role === 'admin'
          ? '/tickets/list'
          : role === 'technician'
            ? '/tecnico'
            : '/cliente/tickets',
      ],
    ]);
  }
});

test('cambiar de categoría vuelve a exigir la subcategoría en los tres portales', async () => {
  for (const role of ['client', 'admin', 'technician']) {
    const { component, requests } = fixture(role);
    component.ticketForm.patchValue({
      titulo: 'Problema de correo',
      descripcion: 'No puedo acceder a mi cuenta.',
      categoriaId: 2,
      subcategoriaId: 4,
      prioridadId: 1,
      empresaId: 1,
      clienteId: role === 'client' ? null : 3,
    });
    component.categorias = [
      { id: 3, nombre: 'Software', subcategorias: [{ id: 5, nombre: 'Correo' }] },
    ];
    component.ticketForm.patchValue({ categoriaId: 3 });
    component.onCategoriaChange(3);
    assert.equal(component.ticketForm.get('subcategoriaId').value, null);
    await component.onSubmit();
    assert.deepEqual(
      Array.from(component.validationIssues, (issue) => issue.control),
      ['subcategoriaId'],
    );
    assert.equal(requests.length, 0);
    component.ticketForm.patchValue({ subcategoriaId: 5 });
    assert.equal(component.ticketForm.valid, true);
  }
});

test('la tarjeta de solicitante usa el perfil del cliente en su portal', () => {
  const { component } = fixture();
  component.profile = {
    id: 7,
    nombres: 'Ana',
    apellidos: 'Torres',
    email: 'ana@example.com',
    empresaNombre: 'Empresa cliente',
  };
  assert.equal(component.solicitante, component.profile);
  assert.equal(component.nombreSolicitante, 'Ana Torres');
  assert.equal(component.inicialesSolicitante, 'AT');
  assert.equal(component.nombrePortal, 'Portal cliente');
});

test('admin y técnico muestran la empresa del cliente seleccionado, nunca la de su perfil', () => {
  for (const role of ['admin', 'technician']) {
    const { component } = fixture(role);
    component.profile = {
      nombres: 'Operador',
      apellidos: 'Interno',
      empresaNombre: 'Empresa del operador',
    };
    component.clientesActivos = [
      {
        id: 8,
        nombres: 'Ana',
        apellidos: 'Torres',
        email: 'ana@example.com',
        empresaId: 3,
        empresaNombre: 'Empresa cliente',
        areaId: 4,
      },
      {
        id: 9,
        nombres: 'Luis',
        apellidos: 'Ruiz',
        email: 'luis@example.com',
        empresaId: 5,
        empresaNombre: 'Otra empresa',
        areaId: 6,
      },
    ];
    assert.equal(component.solicitante, null);
    assert.equal(component.nombreSolicitante, 'Selecciona un cliente');
    component.ticketForm.patchValue({ clienteId: 8 });
    component.onClienteChange(8);
    assert.equal(component.solicitante.empresaNombre, 'Empresa cliente');
    assert.equal(component.ticketForm.get('empresaId').value, 3);
    assert.equal(component.inicialesSolicitante, 'AT');
    component.ticketForm.patchValue({ clienteId: 9 });
    component.onClienteChange(9);
    assert.equal(component.nombreSolicitante, 'Luis Ruiz');
    assert.equal(component.ticketForm.get('areaId').value, 6);
    component.ticketForm.patchValue({ clienteId: null });
    component.onClienteChange(null);
    assert.equal(component.solicitante, null);
    assert.equal(component.ticketForm.get('empresaId').value, null);
    assert.equal(
      component.nombrePortal,
      role === 'admin' ? 'Portal administrador' : 'Portal técnico',
    );
  }
});

test('el supervisor usa el formulario administrativo con su propia etiqueta de portal', () => {
  const { component } = fixture('admin');
  component.profile = { ...component.profile, roles: ['ROLE_SUPERVISOR'] };
  assert.equal(component.esPersonal, true);
  assert.equal(component.nombrePortal, 'Portal supervisor');
  component.profile.roles = ['ROLE_SUPERVISOR', 'ROLE_ADMIN'];
  assert.equal(component.nombrePortal, 'Portal administrador');
});

test('los adjuntos conservan selección múltiple y arrastre, bloqueados durante el envío', () => {
  const { component } = fixture();
  const input = { files: [{ name: 'foto.png' }, { name: 'informe.pdf' }], value: 'seleccion' };
  component.onFilesSelected({ target: input });
  assert.equal(component.adjuntosPendientes.length, 2);
  assert.equal(input.value, '');
  const drop = { preventDefault() {}, dataTransfer: { files: [{ name: 'otro.pdf' }] } };
  component.onDrop(drop);
  assert.equal(component.adjuntosPendientes.length, 3);
  component.removeFile(1);
  assert.equal(component.adjuntosPendientes.length, 2);
  component.loading = true;
  component.onDrop(drop);
  component.onFilesSelected({ target: input });
  component.removeFile(0);
  assert.equal(component.adjuntosPendientes.length, 2);
});
