// node --test scripts/ticket-detail.test.cjs
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const { of, Subject, throwError } = require('rxjs');
const moduleObject = { exports: {} };
vm.runInNewContext(
  ts.transpileModule(
    fs.readFileSync(
      path.resolve(__dirname, '../src/app/tickets/ticket-detail/ticket-detail.component.ts'),
      'utf8',
    ),
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        experimentalDecorators: true,
        useDefineForClassFields: false,
      },
    },
  ).outputText,
  {
    exports: moduleObject.exports,
    module: moduleObject,
    Date,
    URL,
    URLSearchParams,
    document: { getElementById: () => ({ focus() {} }) },
    require: (name) => {
      if (name.endsWith('/attachment-alert')) return { showAttachmentAlert() {} };
      if (name.endsWith('/attachment-policy')) return require('./attachment-policy.fixture.cjs');
      if (name === '@angular/core') return { Component: () => (component) => component };
      if (name === '@angular/common/http') return { HttpEventType: { Response: 4 } };
      if (name === 'rxjs') return require('rxjs');
      if (
        name.startsWith('@angular/') ||
        name.startsWith('../../core/') ||
        name.startsWith('../../shared/')
      )
        return {};
      throw new Error(name);
    },
  },
);
const Detail = moduleObject.exports.TicketDetailComponent;
function fixture(role = 'client', query = {}) {
  const ticket = {
    id: 6,
    comentarioCreadoId: 99,
    clienteId: 8,
    estadoCodigo: 'NUEVO',
    prioridadNombre: 'Baja',
    attachments: [],
    comentarios: [],
  };
  const route = {
    snapshot: {
      data: { role },
      paramMap: { get: () => '6' },
      queryParams: query,
      queryParamMap: { get: (key) => query[key] || null },
    },
  };
  const requests = [],
    navigations = [],
    comments = new Subject(),
    events = new Subject();
  const service = {
    obtenerPorId: (id) => {
      requests.push(id);
      return of({ success: true, data: ticket });
    },
    agregarComentario: (...args) => {
      requests.push(args);
      return comments;
    },
  };
  const attachments = {
    subirAdjunto: () => of({ type: 4 }),
    obtenerArchivoBlob: () => of(new Blob()),
  };
  const http = {
    get: (url) =>
      of({
        success: true,
        data: url.includes('/states')
          ? [
              { codigo: 'NUEVO', nombre: 'Nuevo' },
              { codigo: 'EN_PROCESO', nombre: 'En proceso' },
              { codigo: 'CERRADO', nombre: 'Cerrado' },
            ]
          : { content: [] },
      }),
  };
  const component = new Detail(
    route,
    { navigate: (args) => navigations.push(args), navigateByUrl: (url) => navigations.push(url) },
    service,
    attachments,
    {
      currentUserSignal: () => ({ userId: 8 }),
      hasRole: (roleName) => role === 'admin' && roleName === 'ROLE_ADMIN',
      hasPermission: (permission) => role === 'admin' && permission === 'TICKET_ASSIGN',
    },
    http,
    { events$: events, connect() {} },
    { bypassSecurityTrustResourceUrl: (url) => url },
  );
  component.ngOnInit();
  return { component, ticket, service, requests, navigations, comments, events, http, attachments };
}
test('roles y controles de gestión no cambian', () => {
  for (const mode of ['client', 'technician', 'admin']) {
    const { component } = fixture(mode);
    assert.equal(component.mode, mode);
    assert.equal(component.canAssign, mode === 'admin');
    assert.equal(
      component.responseLabel,
      mode === 'client' ? 'Responder al técnico' : 'Responder al cliente',
    );
    component.ngOnDestroy();
  }
});
test('etiquetas, nombres, iniciales y colores diferencian mensajes y estados', () => {
  const { component } = fixture();
  assert.equal(component.initials(' Carlos  Mendoza '), 'CM');
  assert.equal(component.initials(''), '—');
  for (const [usuarioRol, label, style] of [
    ['ADMIN', 'Administrador', 'thread-admin'],
    ['TECNICO', 'Técnico', 'thread-tech'],
    ['CLIENTE', 'Cliente', 'thread-client'],
  ]) {
    const comment = { usuarioId: 8, usuarioNombre: 'Ana Torres', usuarioRol };
    assert.equal(component.getCommentLabel(comment), label);
    assert.equal(component.getCommentClass(comment), style);
    assert.equal(component.commentAuthor(comment), 'Ana Torres');
  }
  assert.equal(component.commentAuthor({ usuarioId: 8 }), 'Cliente');
  assert.equal(component.statusTone, 'cyan');
  assert.equal(component.priorityTone, 'green');
  component.ticket.prioridadNombre = 'Crítica';
  assert.equal(component.priorityTone, 'red');
  component.ticket.estadoCodigo = 'OTRO';
  assert.equal(component.statusTone, 'neutral');
});
test('respuesta bloquea doble envío y modificaciones de archivos durante la petición', () => {
  const { component, comments, requests, ticket } = fixture();
  component.response = '  Información adicional  ';
  component.responseFiles = [{ name: 'evidencia.pdf', size: 200 }];
  component.sendResponse();
  component.sendResponse();
  assert.equal(requests.filter(Array.isArray).length, 1);
  assert.deepEqual(Array.from(requests.find(Array.isArray)), [6, 'Información adicional', false]);
  component.removeFile(0);
  assert.equal(component.responseFiles.length, 1);
  component.selectFiles({ target: { files: [{ name: 'otra.png' }], value: 'selected' } });
  assert.equal(component.responseFiles.length, 1);
  comments.next({ success: true, data: ticket });
  assert.equal(component.sending, false);
  assert.equal(component.response, '');
  assert.equal(component.responseFiles.length, 0);
  assert.match(component.successMessage, /enviada/);
  assert.equal(requests.filter((request) => request === 6).length, 2);
});
test('ticket cerrado no permite respuesta ni agregar o quitar archivos', () => {
  const { component, requests } = fixture();
  component.ticket.estadoCodigo = 'CERRADO';
  component.response = 'Respuesta';
  component.responseFiles = [{ name: 'archivo.pdf' }];
  component.sendResponse();
  component.removeFile(0);
  component.selectFiles({ target: { files: [{ name: 'nuevo' }] } });
  assert.equal(requests.filter(Array.isArray).length, 0);
  assert.equal(component.responseFiles.length, 1);
});
test('error de envío conserva mensaje y evidencia para reintentar', () => {
  const { component, comments } = fixture();
  component.response = 'Mi respuesta';
  component.responseFiles = [{ name: 'evidencia.pdf' }];
  component.sendResponse();
  comments.error({ error: { message: 'No se pudo enviar.' } });
  assert.equal(component.sending, false);
  assert.equal(component.response, 'Mi respuesta');
  assert.equal(component.responseFiles.length, 1);
  assert.equal(component.errorMessage, 'No se pudo enviar.');
});
test('carga fallida puede reintentarse y los eventos de conversación se conservan', () => {
  const { component, service, events, requests, ticket } = fixture();
  service.obtenerPorId = () => throwError(() => ({ error: { message: 'Sin conexión' } }));
  component.retryLoad();
  assert.equal(component.loading, false);
  assert.equal(component.errorMessage, 'Sin conexión');
  service.obtenerPorId = (id) => {
    requests.push(id);
    return of({ success: true, data: ticket });
  };
  component.retryLoad();
  assert.equal(component.errorMessage, '');
  events.next({ type: 'ticket-comment', ticketId: 6 });
  assert.equal(requests.length, 3);
  component.ngOnDestroy();
  events.next({ type: 'ticket-comment', ticketId: 6 });
  assert.equal(requests.length, 3);
});
test('volver conserva returnTo y parámetros de los filtros', () => {
  const { component, navigations } = fixture('client', {
    returnTo: '/cliente/tickets',
    estado: 'NUEVO',
    page: 2,
  });
  component.goBack();
  assert.equal(navigations[0], '/cliente/tickets?estado=NUEVO&page=2');
  const plain = fixture();
  plain.component.goBack();
  assert.deepEqual(Array.from(plain.navigations[0]), ['/cliente/tickets']);
});

test('las pestañas conservan la respuesta y los archivos; navegación por teclado', () => {
  const { component } = fixture('technician');
  component.response = 'Borrador';
  component.responseFiles = [{ name: 'documento.pdf' }];
  component.selectTab('attachments');
  component.selectTab('history');
  component.selectTab('conversation');
  assert.equal(component.response, 'Borrador');
  assert.equal(component.responseFiles.length, 1);
  let prevented = 0;
  const key = (key) => component.onTabKeydown({ key, preventDefault: () => prevented++ });
  key('ArrowLeft');
  assert.equal(component.activeTab, 'history');
  key('Home');
  assert.equal(component.activeTab, 'conversation');
  key('End');
  assert.equal(component.activeTab, 'history');
  key('ArrowRight');
  assert.equal(component.activeTab, 'conversation');
  key('Enter');
  assert.equal(prevented, 4);
});

test('cambiar estado exige rol, estado del catálogo y cambio real; cerrados solo admin', () => {
  for (const role of ['client', 'technician', 'admin']) {
    const { component, service } = fixture(role);
    const calls = [];
    service.cambiarEstado = (...args) => {
      calls.push(args);
      return of({ success: false });
    };
    component.saveState();
    assert.equal(calls.length, 0);
    component.selectedStateCode = 'INVENTADO';
    component.saveState();
    assert.equal(calls.length, 0);
    component.ticket.estadoCodigo = 'CERRADO';
    component.selectedStateCode = 'EN_PROCESO';
    component.saveState();
    assert.equal(calls.length, role === 'admin' ? 1 : 0);
  }
});

test('guardar estado espera confirmación del servidor y bloquea doble envío', () => {
  for (const role of ['technician', 'admin']) {
    const { component, service, ticket } = fixture(role);
    const result = new Subject(),
      calls = [];
    service.cambiarEstado = (...args) => {
      calls.push(args);
      return result;
    };
    component.selectedStateCode = 'EN_PROCESO';
    component.saveState();
    component.saveState();
    assert.equal(calls.length, 1);
    assert.equal(component.ticket.estadoCodigo, 'NUEVO');
    assert.equal(component.savingState, true);
    result.next({ success: true, data: { ...ticket, estadoCodigo: 'EN_PROCESO', tecnicoId: 2 } });
    assert.equal(component.selectedStateCode, 'EN_PROCESO');
    assert.equal(component.ticket.estadoCodigo, 'EN_PROCESO');
    assert.equal(component.selectedTechnicianId, 2);
    assert.equal(component.savingState, false);
    assert.equal(component.stateChanged, false);
  }
});

test('fallo al guardar estado mantiene la selección para reintentar', () => {
  const { component, service } = fixture('admin');
  component.selectedStateCode = 'EN_PROCESO';
  service.cambiarEstado = () => throwError(() => ({ error: { message: 'Sin permisos' } }));
  component.saveState();
  assert.equal(component.ticket.estadoCodigo, 'NUEVO');
  assert.equal(component.selectedStateCode, 'EN_PROCESO');
  assert.equal(component.errorMessage, 'Sin permisos');
  assert.equal(component.savingState, false);
  service.cambiarEstado = () => of({ success: false, message: 'Respuesta no exitosa' });
  component.saveState();
  assert.equal(component.errorMessage, 'Respuesta no exitosa');
});

test('solo administrador asigna y bloquea peticiones repetidas; error restaura técnico', () => {
  for (const role of ['client', 'technician', 'admin']) {
    const { component, service, ticket } = fixture(role);
    const result = new Subject(),
      calls = [];
    service.asignarTecnico = (...args) => {
      calls.push(args);
      return result;
    };
    component.onTechnicianChange(2);
    component.onTechnicianChange(3);
    assert.equal(calls.length, role === 'admin' ? 1 : 0);
    if (role === 'admin') {
      assert.equal(component.assigning, true);
      result.error({ error: { message: 'No disponible' } });
      assert.equal(component.selectedTechnicianId, null);
      assert.equal(component.assigning, false);
      service.asignarTecnico = () => of({ success: true, data: { ...ticket, tecnicoId: 3 } });
      component.onTechnicianChange(3);
      assert.equal(component.selectedTechnicianId, 3);
      assert.match(component.successMessage, /asignado/);
    }
  }
});

test('catálogos fallidos permiten reintentar sin borrar ticket ni inventar opciones', () => {
  const { component, http } = fixture('admin');
  http.get = () => throwError(() => new Error('offline'));
  component.loadStates();
  component.loadTechnicians();
  assert.equal(component.statesLoading, false);
  assert.ok(component.statesError);
  assert.equal(component.techniciansLoading, false);
  assert.ok(component.techniciansError);
  assert.equal(component.ticket.id, 6);
  http.get = () => of({ success: false });
  component.loadStates();
  component.loadTechnicians();
  assert.ok(component.statesError);
  assert.ok(component.techniciansError);
  http.get = (url) =>
    of({
      success: true,
      data: url.includes('/states')
        ? [{ codigo: 'NUEVO', nombre: 'Nuevo' }]
        : {
            content: [
              { id: 2, estado: 'ACTIVO', roles: ['ROLE_TECNICO'] },
              { id: 3, estado: 'INACTIVO', roles: ['ROLE_TECNICO'] },
              { id: 4, estado: 'ACTIVO', roles: ['ROLE_CLIENTE'] },
            ],
          },
    });
  component.loadStates();
  component.loadTechnicians();
  assert.equal(component.statesError, '');
  assert.equal(component.techniciansError, '');
  assert.equal(component.technicians.length, 1);
  assert.equal(component.technicians[0].id, 2);
});

test('actualización realtime no borra borrador, pestaña ni selección pendiente de estado', () => {
  const { component, service, events, ticket } = fixture('technician');
  component.response = 'Todavía escribiendo';
  component.selectedStateCode = 'CERRADO';
  component.selectTab('history');
  service.obtenerPorId = () =>
    of({ success: true, data: { ...ticket, estadoCodigo: 'EN_PROCESO' } });
  events.next({ type: 'ticket-comment', ticketId: 6 });
  assert.equal(component.ticket.estadoCodigo, 'EN_PROCESO');
  assert.equal(component.response, 'Todavía escribiendo');
  assert.equal(component.selectedStateCode, 'CERRADO');
  assert.equal(component.activeTab, 'history');
});

test('cerrar visor cancela descarga pendiente; una respuesta antigua no abre otro archivo', () => {
  const { component, attachments } = fixture();
  const first = new Subject(),
    second = new Subject();
  let requests = 0;
  attachments.obtenerArchivoBlob = () => (++requests === 1 ? first : second);
  const file = {
    id: 1,
    nombreOriginal: 'primero.pdf',
    mimeType: 'application/pdf',
    previewUrl: '/primero',
  };
  component.openAttachment(file);
  assert.equal(first.observers.length, 1);
  component.openAttachment({ ...file, id: 2, nombreOriginal: 'segundo.pdf' });
  assert.equal(first.observers.length, 0);
  first.next(new Blob());
  assert.equal(component.attachmentViewerUrl, '');
  component.closeAttachmentViewer();
  assert.equal(second.observers.length, 0);
  assert.equal(component.attachmentViewer, null);
});

test('salir cancela guardado y respuesta, y no modifica la vista desde peticiones antiguas', () => {
  const staff = fixture('admin'),
    state = new Subject();
  staff.service.cambiarEstado = () => state;
  staff.component.selectedStateCode = 'EN_PROCESO';
  staff.component.saveState();
  assert.equal(state.observers.length, 1);
  staff.component.ngOnDestroy();
  assert.equal(state.observers.length, 0);
  const client = fixture();
  client.component.response = 'Pendiente';
  client.component.sendResponse();
  assert.equal(client.comments.observers.length, 1);
  client.component.ngOnDestroy();
  assert.equal(client.comments.observers.length, 0);
});

test('solo el personal puede enviar notas internas y los archivos no se publican desde una nota', () => {
  const client = fixture('client');
  client.component.setResponseMode('internal');
  assert.equal(client.component.responseMode, 'public');
  client.component.responseMode = 'internal';
  client.component.response = 'No autorizado';
  client.component.sendResponse();
  assert.equal(client.requests.filter(Array.isArray).length, 0);
  client.component.ngOnDestroy();
  const staff = fixture('technician');
  staff.component.setResponseMode('internal');
  staff.component.response = 'Validar complementos';
  staff.component.responseFiles = [{ name: 'privado.txt', size: 10 }];
  staff.component.sendResponse();
  assert.equal(staff.requests.filter(Array.isArray).length, 0);
  staff.component.responseFiles = [];
  staff.component.sendResponse();
  assert.deepEqual(Array.from(staff.requests.find(Array.isArray)), [
    6,
    'Validar complementos',
    true,
  ]);
  staff.comments.next({ success: true, data: staff.ticket });
  assert.match(staff.component.successMessage, /Nota interna/);
  staff.component.ngOnDestroy();
});
test('guardar gestión confirma estado antes de asignar y explica los fallos parciales', () => {
  const f = fixture('admin'),
    states = new Subject(),
    assignment = new Subject(),
    calls = [];
  f.component.ticket = { ...f.component.ticket, tecnicoId: 1 };
  f.component.selectedTechnicianId = 2;
  f.component.technicians = [{ id: 2, nombres: 'Carlos', apellidos: 'Mendoza' }];
  f.component.selectedStateCode = 'EN_PROCESO';
  f.service.cambiarEstado = (...args) => {
    calls.push(['state', ...args]);
    return states;
  };
  f.service.asignarTecnico = (...args) => {
    calls.push(['assignment', ...args]);
    return assignment;
  };
  assert.equal(calls.length, 0);
  assert.equal(f.component.canSaveManagement, true);
  f.component.saveManagement();
  f.component.saveManagement();
  assert.equal(calls.length, 1);
  states.next({ success: true, data: { ...f.component.ticket, estadoCodigo: 'EN_PROCESO' } });
  assert.equal(calls.length, 2);
  assert.equal(calls[1][0], 'assignment');
  assignment.error({ error: { message: 'No disponible' } });
  assert.equal(f.component.ticket.estadoCodigo, 'EN_PROCESO');
  assert.equal(f.component.selectedTechnicianId, 1);
  assert.match(f.component.errorMessage, /El estado se guardó/);
  f.component.ngOnDestroy();
});
test('el cliente no recibe notas internas incluso ante una respuesta mal filtrada', () => {
  const f = fixture('client');
  f.component.acceptTicket({
    ...f.ticket,
    comentarios: [
      { id: 1, esInterno: true },
      { id: 2, esInterno: false },
    ],
  });
  assert.equal(f.component.ticket.comentarios.length, 1);
  assert.equal(f.component.ticket.comentarios[0].id, 2);
  f.component.ngOnDestroy();
});
test('el seguimiento refleja estados finales y el SLA utiliza los datos reales sin inventar plazos', () => {
  const f = fixture('client');
  assert.equal(f.component.sla, null);
  assert.equal(f.component.trackingStep, 0);
  f.component.ticket.estadoCodigo = 'RESUELTO';
  assert.equal(f.component.trackingStep, 2);
  assert.match(f.component.trackingMessage, /resuelto/);
  f.component.ticket = {
    ...f.component.ticket,
    fechaCreacion: new Date(Date.now() - 3600000).toISOString(),
    fechaLimiteResolucion: new Date(Date.now() + 3 * 3600000).toISOString(),
    tiempoEstimadoMinutos: 240,
    fechaResolucion: new Date().toISOString(),
    cumplioSlaResolucion: true,
  };
  assert.equal(f.component.sla.target, '4 h');
  assert.equal(f.component.sla.label, 'SLA cumplido');
  f.component.ticket.estadoCodigo = 'CANCELADO';
  assert.equal(f.component.sla.tone, 'neutral');
  assert.match(f.component.trackingMessage, /cancelada/);
  f.component.ngOnDestroy();
});
test('el portal administrativo no concede reapertura a quien no tenga ROLE_ADMIN', () => {
  const f = fixture('admin');
  f.component.ticket.estadoCodigo = 'CERRADO';
  f.component.authService.hasRole = () => false;
  assert.equal(f.component.canChangeState, false);
  f.component.ngOnDestroy();
});

test('los tres portales descartan recargas antiguas y muestran tres envíos consecutivos sin refrescar', () => {
  for (const role of ['client', 'technician', 'admin']) {
    const f = fixture(role),
      reads = [],
      posts = [];
    f.service.obtenerPorId = () => {
      const stream = new Subject();
      reads.push(stream);
      return stream;
    };
    f.service.agregarComentario = () => {
      const stream = new Subject();
      posts.push(stream);
      return stream;
    };
    let messages = [];
    for (let i = 1; i <= 3; i++) {
      f.events.next({ type: 'ticket-comment', ticketId: 6 });
      const stale = reads.at(-1);
      f.component.response = `Mensaje ${i}`;
      f.component.sendResponse();
      assert.equal(stale.observers.length, 0, 'La lectura anterior debe cancelarse al enviar');
      const before = reads.length;
      f.events.next({ type: 'ticket-comment', ticketId: 6 });
      assert.equal(reads.length, before, 'El aviso propio espera a que termine el POST');
      messages = [
        ...messages,
        { id: i, contenido: `Mensaje ${i}`, usuarioId: 8, esInterno: false },
      ];
      const saved = { ...f.ticket, comentarios: [...messages] };
      posts.at(-1).next({ success: true, data: saved });
      posts.at(-1).complete();
      assert.equal(
        f.component.ticket.comentarios.at(-1).contenido,
        `Mensaje ${i}`,
        'El emisor ve la confirmación de su mensaje',
      );
      stale.next({ success: true, data: { ...f.ticket, comentarios: [] } });
      assert.equal(
        f.component.ticket.comentarios.length,
        i,
        'Una respuesta antigua no puede borrar el mensaje',
      );
      reads.at(-1).next({ success: true, data: saved });
      reads.at(-1).complete();
      assert.equal(f.component.ticket.comentarios.length, i);
    }
    f.component.ngOnDestroy();
  }
});
test('el receptor conserva el resultado más reciente cuando dos eventos disparan recargas', () => {
  for (const role of ['client', 'technician', 'admin']) {
    const f = fixture(role),
      reads = [];
    f.service.obtenerPorId = () => {
      const stream = new Subject();
      reads.push(stream);
      return stream;
    };
    f.events.next({ type: 'ticket-comment', ticketId: 6 });
    f.events.next({ type: 'ticket-updated', ticketId: 6 });
    reads[1].next({
      success: true,
      data: {
        ...f.ticket,
        comentarios: [
          { id: 1, contenido: 'Primero' },
          { id: 2, contenido: 'Segundo' },
        ],
      },
    });
    reads[0].next({
      success: true,
      data: { ...f.ticket, comentarios: [{ id: 1, contenido: 'Primero' }] },
    });
    assert.equal(f.component.ticket.comentarios.length, 2);
    f.component.ngOnDestroy();
  }
});

test('los archivos se vinculan al ID devuelto y un fallo se reintenta sin crear otro mensaje', () => {
  for (const role of ['client', 'technician', 'admin']) {
    const { component, attachments, ticket, comments, requests } = fixture(role);
    let attempts = 0;
    const uploads = [];
    attachments.subirAdjunto = (...args) => {
      uploads.push(args);
      return ++attempts === 1 ? throwError(() => new Error('fallo')) : of({ type: 4 });
    };
    component.response = 'Respuesta';
    component.responseFiles = [{ name: 'evidencia.pdf', size: 20 }];
    component.sendResponse();
    comments.next({ success: true, data: ticket });
    assert.equal(component.pendingAttachmentCommentId, 99);
    assert.equal(component.responseFiles.length, 1);
    assert.equal(uploads[0][3], 99);
    assert.match(component.errorMessage, /reintentar/);
    component.retryAttachments();
    assert.equal(uploads[1][3], 99);
    assert.equal(requests.filter(Array.isArray).length, 1);
    assert.equal(component.responseFiles.length, 0);
    assert.equal(component.pendingAttachmentCommentId, null);
  }
});
test('cada adjunto aparece solo en su mensaje; los históricos sin vínculo no se asignan por texto', () => {
  const { component, ticket } = fixture();
  component.acceptTicket({
    ...ticket,
    descripcion: 'Inicial',
    attachments: [
      { id: 1 },
      { id: 2, comentario: 'Inicial' },
      { id: 3, comentario: 'Respuesta del técnico' },
      { id: 4, comentarioId: 10 },
      { id: 5, comentarioId: 11 },
    ],
  });
  assert.deepEqual(
    Array.from(component.initialAttachments, (f) => f.id),
    [1, 2],
  );
  assert.deepEqual(
    Array.from(component.messageAttachments.get(10), (f) => f.id),
    [4],
  );
  assert.deepEqual(
    Array.from(component.messageAttachments.get(11), (f) => f.id),
    [5],
  );
});
