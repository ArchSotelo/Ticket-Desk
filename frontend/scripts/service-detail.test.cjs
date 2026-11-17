// node --test scripts/service-detail.test.cjs — API y confirmaciones simuladas.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const rxjs = require('rxjs');
const service = (extra) => ({
  id: 8,
  nombre: 'Correo Corporativo DEMO A',
  proveedor: 'Google',
  categoriaServicioId: 1,
  tipo: 'Correo',
  estado: 'VENCIDO',
  fechaInicio: '2026-09-01',
  fechaFin: '2026-09-30',
  costoMensual: 302.4,
  divisa: 'PEN',
  responsable: 'Sistemas',
  notas: '',
  correosRecordatorio: [],
  adjuntos: [],
  ...extra,
});
const attachment = (extra) => ({
  id: 2,
  nombreOriginal: 'informe.pdf',
  mimeType: 'application/pdf',
  tamanoBytes: 1024,
  fechaCreacion: '2026-09-01',
  downloadUrl: '/download/2',
  previewUrl: '/preview/2',
  ...extra,
});
function fixture(options = {}) {
  const mod = { exports: {} },
    requests = [],
    alerts = [],
    navigations = [],
    urls = [],
    revoked = [],
    downloads = [];
  let confirmation = { isConfirmed: true, value: 'Motivo de prueba' };
  vm.runInNewContext(
    ts.transpileModule(
      fs.readFileSync(
        path.resolve(__dirname, '../src/app/servicios/service-detail.component.ts'),
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
      Blob,
      FormData,
      Date,
      URL: {
        createObjectURL(blob) {
          urls.push(blob);
          return 'blob:test-' + urls.length;
        },
        revokeObjectURL(url) {
          revoked.push(url);
        },
      },
      document: {
        createElement: () => ({
          click() {
            downloads.push({ href: this.href, download: this.download });
          },
        }),
      },
      require: (name) => {
        if (name.endsWith('/attachment-policy')) return require('./attachment-policy.fixture.cjs');
        if (name.endsWith('/attachment-alert'))
          return {
            showAttachmentAlert(message, title) {
              alerts.push({ text: message, title });
            },
          };
        if (name === 'rxjs') return rxjs;
        if (name === '@angular/core')
          return { Component: () => (cls) => cls, ViewChild: () => () => {} };
        if (name === 'sweetalert2' || name.startsWith('sweetalert2/'))
          return {
            default: {
              fire(args) {
                alerts.push(args);
                return Promise.resolve(args.showCancelButton ? confirmation : {});
              },
            },
          };
        if (name.startsWith('@angular/') || name.startsWith('../core/')) return {};
        throw new Error(name);
      },
    },
  );
  const http = Object.fromEntries(
    ['get', 'post', 'patch', 'delete'].map((method) => [
      method,
      (url, body, args) => {
        const response = new rxjs.Subject();
        requests.push({ method, url, body, args, response });
        return response;
      },
    ]),
  );
  const route = {
    snapshot: {
      paramMap: { get: () => (options.id === null ? null : '8') },
      queryParamMap: { get: (key) => (options.query || {})[key] || null },
    },
  };
  const component = new mod.exports.ServiceDetailComponent(
    route,
    http,
    { navigate: (commands) => navigations.push(commands) },
    { isTechnicianUser: () => !!options.technician },
    { bypassSecurityTrustResourceUrl: (value) => value },
  );
  const dialog = {
    shown: 0,
    closed: 0,
    showModal() {
      this.shown++;
    },
    close() {
      this.closed++;
    },
  };
  component.attachmentDialog = { nativeElement: dialog };
  component.ngOnInit();
  const send = (extra = {}) => requests[0].response.next({ success: true, data: service(extra) });
  return {
    component,
    requests,
    alerts,
    navigations,
    urls,
    revoked,
    downloads,
    dialog,
    send,
    confirm: (value) => (confirmation = value),
  };
}
test('carga detalle, conserva estado del servidor y muestra icono por ID incluso si el tipo cambia de nombre', () => {
  const f = fixture();
  assert.equal(f.component.loading, true);
  f.send();
  f.requests[1].response.next({
    success: true,
    data: [{ id: 1, nombre: 'Correo renombrado', activa: false, icono: 'mail' }],
  });
  assert.equal(f.component.iconoTipo('Correo'), 'mail');
  assert.equal(f.component.servicio.estado, 'VENCIDO');
  assert.equal(f.component.loading, false);
  f.component.ngOnDestroy();
});
test('tipo por nombre y respaldo no dependen de que la categoría esté activa', () => {
  const f = fixture();
  f.send({ categoriaServicioId: undefined });
  f.component.categorias = [{ id: 2, nombre: 'Correo', icono: 'email', activa: false }];
  assert.equal(f.component.iconoTipo('Correo'), 'email');
  assert.equal(f.component.iconoTipo('Otro'), 'category');
  f.component.ngOnDestroy();
});
test('fallo de detalle o catálogo muestra aviso y permite reintentar por separado', () => {
  const f = fixture();
  f.requests[0].response.error(new Error('offline'));
  assert.ok(f.component.loadError);
  f.requests[1].response.error(new Error('offline'));
  assert.ok(f.component.iconsError);
  f.component.load();
  f.requests.at(-1).response.next({ success: true, data: service() });
  assert.equal(f.component.loadError, '');
  f.component.loadCategorias();
  f.requests.at(-1).response.next({ success: true, data: [] });
  assert.equal(f.component.iconsError, '');
  f.component.ngOnDestroy();
});
test('periodo vencido se muestra completo y no confunde vencido con finalizado', () => {
  const f = fixture();
  f.send();
  assert.equal(f.component.diasVigencia(), 30);
  assert.equal(f.component.progresoVigencia(), 100);
  assert.match(f.component.periodMessage(), /vigencia.*terminado/);
  assert.equal(f.component.puedeEditarObservaciones, true);
  assert.equal(f.component.puedeGestionarArchivos, true);
  f.component.ngOnDestroy();
});
test('avisos distinguen próximo a vencer, finalizado y cancelado; montos mantienen divisa', () => {
  const f = fixture();
  for (const [estado, message] of [
    ['POR_VENCER', /próxima/],
    ['FINALIZADO', /finalizado/],
    ['CANCELADO', /cancelado/],
  ]) {
    f.send({ estado });
    assert.match(f.component.periodMessage(), message);
  }
  f.send();
  assert.equal(f.component.formatCost(), 'PEN 302.40');
  f.send({ divisa: 'USD', costoMensual: 8.4 });
  assert.equal(f.component.formatCost(), 'USD 8.40');
  f.component.ngOnDestroy();
});
test('admin y técnico vuelven al listado, historial general o cadena de origen', () => {
  for (const technician of [false, true])
    for (const query of [
      {},
      { from: 'history' },
      { from: 'history', historyId: '42' },
      { from: 'history', historyId: '../bad' },
    ]) {
      const f = fixture({ technician, query }),
        base = technician ? '/tecnico/servicios' : '/servicios';
      assert.equal(
        f.component.returnPath,
        query.from ? base + (query.historyId === '42' ? '/42' : '') + '/historial' : base,
      );
      f.component.ngOnDestroy();
    }
});
test('guardar observaciones bloquea duplicados y otras operaciones mientras espera', () => {
  const f = fixture();
  f.send({ notas: 'Mi nota' });
  f.component.guardarObservaciones();
  f.component.guardarObservaciones();
  f.component.cancelar();
  f.component.abrirRenovacion();
  assert.equal(f.requests.filter((r) => r.method === 'patch').length, 1);
  assert.equal(f.alerts.length, 0);
  assert.equal(f.navigations.length, 0);
  const request = f.requests.at(-1);
  assert.equal(request.url, '/api/v1/services/8/notes');
  assert.equal(request.body.observaciones, 'Mi nota');
  request.response.next({ success: true, data: service({ notas: 'Mi nota' }) });
  assert.equal(f.component.busy, false);
  f.component.ngOnDestroy();
});
test('error al guardar conserva las observaciones y permite reintentar', () => {
  const f = fixture();
  f.send({ notas: 'No perder' });
  f.component.guardarObservaciones();
  f.requests.at(-1).response.error({ error: { message: 'Prueba' } });
  assert.equal(f.component.servicio.notas, 'No perder');
  assert.equal(f.component.busy, false);
  f.component.guardarObservaciones();
  assert.equal(f.requests.filter((r) => r.method === 'patch').length, 2);
  f.component.ngOnDestroy();
});
test('cancelado o finalizado bloquea por código notas, carga, borrado, cancelación y renovación', () => {
  for (const estado of ['CANCELADO', 'FINALIZADO']) {
    const f = fixture();
    f.send({ estado, facturaNombre: 'old.pdf', adjuntos: [attachment()] });
    f.component.guardarObservaciones();
    f.component.subirFacturas({ target: { files: [new Blob(['x'])] } });
    f.component.eliminarFactura();
    f.component.eliminarAdjunto(attachment());
    f.component.finalizar();
    f.component.cancelar();
    f.component.abrirRenovacion();
    assert.equal(f.requests.length, 2);
    assert.equal(f.alerts.length, 0);
    assert.equal(f.navigations.length, 0);
    f.component.ngOnDestroy();
  }
});
test('adjuntar varios archivos conserva endpoint/payload y bloquea doble envío', () => {
  const f = fixture();
  f.send();
  const event = {
    target: {
      files: [
        Object.assign(new Blob(['a']), { name: 'a.pdf' }),
        Object.assign(new Blob(['b']), { name: 'b.png' }),
      ],
      value: 'files',
    },
  };
  f.component.subirFacturas(event);
  f.component.subirFacturas(event);
  const request = f.requests.at(-1);
  assert.equal(request.method, 'post');
  assert.equal(request.url, '/api/v1/services/8/attachments');
  assert.equal(request.body.getAll('files').length, 2);
  assert.equal(f.requests.length, 3);
  request.response.next({ success: true, data: service({ adjuntos: [attachment()] }) });
  assert.equal(f.component.attachmentCount, 1);
  assert.equal(event.target.value, '');
  assert.equal(f.component.busy, false);
  f.component.ngOnDestroy();
});
test('cuenta factura antigua y adjuntos, sin inventar archivos', () => {
  const f = fixture();
  f.send();
  assert.equal(f.component.attachmentCount, 0);
  f.send({ facturaNombre: 'old.pdf', adjuntos: [attachment(), attachment({ id: 3 })] });
  assert.equal(f.component.attachmentCount, 3);
  f.component.ngOnDestroy();
});
test('PDF usa previewUrl y el MIME canónico validado del servidor', () => {
  const f = fixture();
  f.send();
  f.component.abrirAdjunto(attachment());
  const request = f.requests.at(-1);
  assert.equal(request.url, '/preview/2');
  assert.equal(request.body.responseType, 'blob');
  request.response.next(new Blob(['%PDF'], { type: 'application/pdf' }));
  assert.equal(f.urls[0].type, 'application/pdf');
  assert.equal(f.component.facturaViewerKind, 'pdf');
  assert.equal(f.dialog.shown, 1);
  assert.equal(f.downloads.length, 0);
  f.component.descargarFactura();
  assert.equal(f.downloads[0].download, 'informe.pdf');
  f.component.ngOnDestroy();
});
test('imágenes y tipos sin visor mantienen previsualización o mensaje de descarga explícito', () => {
  const f = fixture();
  f.send();
  for (const [name, mime, kind] of [
    ['foto.png', 'image/png', 'image'],
    ['datos.xlsx', 'application/octet-stream', 'file'],
  ]) {
    f.component.abrirAdjunto(attachment({ nombreOriginal: name, mimeType: mime, previewUrl: '' }));
    assert.equal(f.requests.at(-1).url, '/download/2');
    f.requests.at(-1).response.next(new Blob(['x'], { type: mime }));
    assert.equal(f.component.facturaViewerKind, kind);
  }
  assert.equal(f.revoked.length, 1);
  f.component.ngOnDestroy();
});
test('factura antigua también se previsualiza y sigue disponible en servicios cerrados', () => {
  const f = fixture();
  f.send({
    estado: 'FINALIZADO',
    facturaNombre: 'anterior.pdf',
    facturaMime: 'application/pdf',
    facturaUrl: '/invoice/8',
  });
  f.component.abrirFactura();
  assert.equal(f.requests.at(-1).url, '/invoice/8');
  f.requests.at(-1).response.next(new Blob(['pdf'], { type: 'application/pdf' }));
  assert.equal(f.component.facturaViewerKind, 'pdf');
  f.component.ngOnDestroy();
});
test('cerrar y cambiar de archivo cancelan la petición antigua, revocan URLs y evitan reaperturas tardías', () => {
  const f = fixture();
  f.send();
  f.component.abrirAdjunto(attachment());
  const old = f.requests.at(-1);
  f.component.cerrarFactura();
  assert.equal(old.response.observers.length, 0);
  old.response.next(new Blob(['late']));
  assert.equal(f.component.facturaViewerUrl, '');
  f.component.abrirAdjunto(attachment());
  f.requests.at(-1).response.next(new Blob(['pdf']));
  f.component.cerrarFactura();
  assert.equal(f.revoked.length, 1);
  assert.equal(f.component.facturaViewer, false);
  f.component.ngOnDestroy();
});
test('fallo del visor lo cierra y no dispara descarga automática', () => {
  const f = fixture();
  f.send();
  f.component.abrirAdjunto(attachment());
  f.requests.at(-1).response.error(new Error('offline'));
  assert.equal(f.component.facturaViewer, false);
  assert.equal(f.downloads.length, 0);
  assert.match(f.alerts.at(-1).title, /No se pudo abrir/);
  f.component.ngOnDestroy();
});
test('cancelar exige motivo, impide doble confirmación y envía solo el cambio autorizado', async () => {
  const f = fixture();
  f.send();
  f.confirm({ isConfirmed: true, value: '  Ya no se utiliza  ' });
  f.component.cancelar();
  f.component.cancelar();
  assert.equal(f.alerts.length, 1);
  assert.ok(f.alerts[0].inputValidator('   '));
  await Promise.resolve();
  const request = f.requests.at(-1);
  assert.equal(request.url, '/api/v1/services/8/cancel');
  assert.equal(request.body.observacionCancelacion, 'Ya no se utiliza');
  request.response.next({ success: true });
  assert.equal(f.component.servicio.estado, 'CANCELADO');
  assert.equal(f.component.servicio.observacionCancelacion, 'Ya no se utiliza');
  f.component.ngOnDestroy();
});
test('confirmación rechazada no finaliza ni elimina archivos; salir antes de confirmar tampoco escribe', async () => {
  const f = fixture();
  f.send({ adjuntos: [attachment()] });
  f.confirm({ isConfirmed: false });
  f.component.finalizar();
  await Promise.resolve();
  assert.equal(f.component.busy, false);
  f.component.eliminarAdjunto(attachment());
  await Promise.resolve();
  assert.equal(f.requests.length, 2);
  f.confirm({ isConfirmed: true });
  f.component.finalizar();
  f.component.ngOnDestroy();
  await Promise.resolve();
  assert.equal(f.requests.length, 2);
});
test('finalizar actualiza estado solo con respuesta y bloquea futuros cambios', async () => {
  const f = fixture();
  f.send();
  f.component.finalizar();
  await Promise.resolve();
  const request = f.requests.at(-1);
  assert.equal(request.url, '/api/v1/services/8/status');
  assert.equal(request.args.params.estado, 'FINALIZADO');
  assert.equal(f.component.servicio.estado, 'VENCIDO');
  request.response.next({ success: true });
  assert.equal(f.component.servicio.estado, 'FINALIZADO');
  assert.equal(f.component.puedeGestionarArchivos, false);
  f.component.ngOnDestroy();
});
test('eliminar adjunto y factura conserva endpoints y requiere confirmación', async () => {
  const f = fixture();
  f.send({ facturaNombre: 'old.pdf', adjuntos: [attachment()] });
  f.component.eliminarAdjunto(attachment());
  await Promise.resolve();
  assert.equal(f.requests.at(-1).url, '/api/v1/services/8/attachments/2');
  f.requests.at(-1).response.next({ success: true });
  assert.equal(f.component.attachmentCount, 1);
  f.component.eliminarFactura();
  await Promise.resolve();
  assert.equal(f.requests.at(-1).url, '/api/v1/services/8/invoice');
  f.requests.at(-1).response.next({ success: true });
  assert.equal(f.component.attachmentCount, 0);
  f.component.ngOnDestroy();
});
test('salir cancela carga, guardado y visor pendientes', () => {
  const f = fixture();
  f.send();
  f.component.guardarObservaciones();
  f.component.abrirAdjunto(attachment());
  f.component.ngOnDestroy();
  for (const request of f.requests) assert.equal(request.response.observers.length, 0);
});

test('Servicios rechaza archivos activos con alerta y no envía ni pierde el estado del formulario', () => {
  const f = fixture();
  f.send();
  const count = f.requests.length;
  const input = { files: [{ name: 'x.svg', size: 20 }], value: 'x' };
  f.component.subirFacturas({ target: input });
  assert.equal(f.requests.length, count);
  assert.equal(input.value, '');
  assert.match(f.alerts.at(-1).text, /no permitido/);
  f.component.ngOnDestroy();
});
test('SVG/HTML y blobs con MIME discordante son descarga sin incrustación', () => {
  const f = fixture();
  f.send();
  for (const [name, mime, blobMime] of [
    ['x.svg', 'image/svg+xml', 'image/svg+xml'],
    ['x.html', 'text/html', 'text/html'],
    ['x.pdf', 'application/pdf', 'text/html'],
    ['x.pdf', 'application/pdf', 'application/octet-stream'],
  ]) {
    f.component.abrirAdjunto(attachment({ nombreOriginal: name, mimeType: mime }));
    f.requests.at(-1).response.next(new Blob(['<script>test</script>'], { type: blobMime }));
    assert.equal(f.component.facturaViewerKind, 'file');
    assert.equal(f.urls.at(-1).type, 'application/octet-stream');
  }
  f.send({ facturaNombre: 'x.svg', facturaMime: 'image/svg+xml', facturaUrl: '/invoice/8' });
  f.component.abrirFactura();
  assert.equal(f.requests.at(-1).url, '/invoice/8/download');
  f.component.ngOnDestroy();
});

test('un archivo ausente cierra el visor y muestra una alerta de disponibilidad', () => {
  const f = fixture();
  f.send();
  f.component.abrirAdjunto(attachment());
  f.requests.at(-1).response.error({ status: 404 });
  assert.equal(f.component.facturaViewer, false);
  assert.equal(f.component.facturaViewerLoading, false);
  assert.equal(f.alerts.at(-1).title, 'Archivo no disponible');
  assert.match(f.alerts.at(-1).text, /almacenamiento/);
  assert.equal(f.downloads.length, 0);
  f.component.ngOnDestroy();
});
