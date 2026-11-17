// node --test scripts/settings-hub.test.cjs — no API ni envío de correo real.
const { test, before } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const rxjs = require('rxjs');
let Settings, forms;
before(async () => {
  await import('@angular/compiler');
  forms = await import('@angular/forms');
  const mod = { exports: {} };
  vm.runInNewContext(
    ts.transpileModule(
      fs.readFileSync(path.resolve(__dirname, '../src/app/ajustes/settings.component.ts'), 'utf8'),
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
        if (name === '@angular/core') return { Component: () => (cls) => cls };
        if (name === 'sweetalert2' || name.startsWith('sweetalert2/')) return { default: { fire: async () => ({ isConfirmed: true }) } };
        if (name.startsWith('@angular/') || name.startsWith('../core/')) return {};
        throw new Error(name);
      },
    },
  );
  Settings = mod.exports.SettingsComponent;
});
function fixture(options = {}) {
  const calls = [],
    navigations = [],
    httpCalls = [],
    saved = options.saved || new Map();
  const service = Object.fromEntries(
    [
      'getSettings',
      'getEmailStatus',
      'getServiceSettings',
      'updateSettings',
      'updateServiceSettings',
      'testEmail',
    ].map((method) => [
      method,
      (payload) => {
        const response = new rxjs.Subject();
        calls.push({ method, payload, response });
        return response;
      },
    ]),
  );
  const component = new Settings(
    new forms.FormBuilder(),
    service,
    { navigate: (commands) => navigations.push(commands) },
    {
      load: (key, defaults) => ({ ...defaults, ...saved.get(key) }),
      save: (key, state) => saved.set(key, { ...state }),
    },
    {
      get: (url) => { const response = new rxjs.Subject(); httpCalls.push({ method: 'GET', url, response }); return response; },
      put: (url, payload) => { const response = new rxjs.Subject(); httpCalls.push({ method: 'PUT', url, payload, response }); return response; },
      post: (url, payload) => { const response = new rxjs.Subject(); httpCalls.push({ method: 'POST', url, payload, response }); return response; },
    },
    { hasRole: (role) => (options.roles || ['ROLE_ADMIN']).includes(role) },
  );
  component.ngOnInit();
  calls[0].response.next({ success: true, data: component.emailForm.getRawValue() });
  calls[0].response.complete();
  return { component, calls, httpCalls, navigations, saved };
}
test('General muestra las opciones disponibles de configuración, seguridad y API', () => {
  const f = fixture();
  assert.equal(f.component.visibleCards.length, 5);
  assert.equal(f.component.communicationCards.length, 1);
  assert.equal(f.component.serviceCards.length, 2);
  assert.equal(f.component.securityCards.length, 1);
  assert.equal(f.component.documentationCards.length, 1);
  assert.equal(
    f.component.cards
      .filter((c) => c.available)
      .map((c) => c.id)
      .join(','),
    'email,services,service-types,api-documentation,security',
  );
  f.component.ngOnDestroy();
});
test('Servicios filtra solo sus dos opciones y no navega ni carga configuraciones', () => {
  const f = fixture();
  f.component.selectCategory('services');
  assert.equal(f.component.selected, 'home');
  assert.equal(f.component.visibleCards.map((c) => c.id).join(','), 'services,service-types');
  assert.equal(f.component.communicationCards.length, 0);
  assert.equal(f.navigations.length, 0);
  assert.equal(f.calls.length, 1);
  f.component.ngOnDestroy();
});
test('Seguridad y Notificaciones filtran dentro de la misma vista', () => {
  const f = fixture();
  f.component.selectCategory('security');
  assert.equal(f.component.visibleCards.map((c) => c.id).join(','), 'security');
  assert.equal(f.component.securityCards.length, 1);
  f.component.selectCategory('notifications');
  assert.equal(f.component.visibleCards.map((c) => c.id).join(','), 'email');
  assert.equal(f.component.communicationCards.length, 1);
  assert.equal(f.component.serviceCards.length, 0);
  assert.equal(f.component.selected, 'home');
  assert.equal(f.navigations.length, 0);
  f.component.ngOnDestroy();
});
test('búsqueda real combina palabras, ignora mayúsculas y acentos y busca descripciones', () => {
  const f = fixture();
  f.component.searchControl.setValue('  CONFIGURACION CORREO  ');
  assert.equal(f.component.visibleCards.map((c) => c.id).join(','), 'email');
  f.component.searchControl.setValue('iconos');
  assert.equal(f.component.visibleCards[0].id, 'service-types');
  f.component.searchControl.setValue('bloqueadas');
  assert.equal(f.component.visibleCards[0].id, 'security');
  f.component.ngOnDestroy();
});
test('búsqueda y categoría se intersectan sin dejar tarjetas ocultas en otras secciones', () => {
  const f = fixture();
  f.component.searchControl.setValue('correo');
  f.component.selectCategory('services');
  assert.equal(f.component.visibleCards.length, 0);
  f.component.clearSearch();
  assert.equal(f.component.settingsFilter, 'services');
  assert.equal(f.component.visibleCards.length, 2);
  f.component.ngOnDestroy();
});
test('restablecer filtros recupera el directorio completo y General seleccionado', () => {
  const f = fixture();
  f.component.selectCategory('security');
  f.component.searchControl.setValue('sin coincidencias');
  f.component.resetHubFilters();
  assert.equal(f.component.settingsFilter, 'all');
  assert.equal(f.component.searchControl.value, '');
  assert.equal(f.component.visibleCards.length, 5);
  f.component.ngOnDestroy();
});
test('opciones próximas o desconocidas no abren editores, rutas ni peticiones', () => {
  const f = fixture();
  for (const card of ['notifications', 'whatsapp', 'workflow', 'unknown'])
    f.component.open(card);
  assert.equal(f.component.selected, 'home');
  assert.equal(f.calls.length, 1);
  assert.equal(f.navigations.length, 0);
  f.component.ngOnDestroy();
});
test('seguridad carga cuentas bloqueadas y política solo para administrador', () => {
  const f = fixture();
  f.component.open('security');
  assert.equal(f.component.selected, 'security');
  assert.equal(f.httpCalls.length, 2);
  assert.equal(f.httpCalls[0].url, '/api/v1/admin/security/login-policy');
  assert.equal(f.httpCalls[1].url, '/api/v1/admin/security/blocked-accounts');
  f.httpCalls[0].response.next({ success: true, data: { maxIntentos: 7, duracionBloqueoMinutos: 30, limiteLoginPorMinuto: 50 } });
  f.httpCalls[1].response.next({ success: true, data: { content: [], totalPages: 0, totalElements: 0, number: 0 } });
  assert.equal(f.component.loginPolicyForm.get('maxIntentos').value, 7);
  const supervisor = fixture({ roles: ['ROLE_SUPERVISOR'] });
  assert.equal(supervisor.component.securityCards.length, 0);
  supervisor.component.open('security');
  assert.equal(supervisor.component.selected, 'home');
  assert.equal(supervisor.httpCalls.length, 0);
  f.component.ngOnDestroy();
  supervisor.component.ngOnDestroy();
});
test('correo abre su editor existente y consulta el estado SMTP', () => {
  const f = fixture();
  f.component.open('email');
  assert.equal(f.component.selected, 'email');
  assert.equal(f.calls.at(-1).method, 'getEmailStatus');
  f.calls.at(-1).response.next({ success: true, data: { enabled: true, configured: true } });
  assert.equal(f.component.smtpEnabled, true);
  assert.equal(f.component.smtpConfigured, true);
  f.component.ngOnDestroy();
});
test('servicios abre el formulario y tipos mantiene la ruta del catálogo', () => {
  const f = fixture();
  f.component.open('services');
  assert.equal(f.component.selected, 'services');
  assert.equal(f.calls.at(-1).method, 'getServiceSettings');
  f.component.back();
  f.component.open('service-types');
  assert.equal(f.navigations[0].join(','), '/categorias-servicio');
  f.component.ngOnDestroy();
});
test('volver de correo o servicios mantiene categoría y búsqueda', () => {
  const f = fixture();
  f.component.selectCategory('services');
  f.component.searchControl.setValue('recordatorios');
  f.component.open('services');
  f.component.backToServicesMenu();
  assert.equal(f.component.selected, 'home');
  assert.equal(f.component.settingsFilter, 'services');
  assert.equal(f.component.searchControl.value, 'recordatorios');
  assert.equal(f.component.visibleCards.length, 1);
  f.component.selectCategory('notifications');
  f.component.clearSearch();
  f.component.searchControl.setValue('correo');
  f.component.open('email');
  f.component.back();
  assert.equal(f.component.settingsFilter, 'notifications');
  assert.equal(f.component.searchControl.value, 'correo');
  f.component.ngOnDestroy();
});
test('categoría y búsqueda se restauran al volver del catálogo o recargar', () => {
  const saved = new Map();
  let f = fixture({ saved });
  f.component.showServicesOptions();
  f.component.searchControl.setValue('tipos');
  f.component.open('service-types');
  f.component.ngOnDestroy();
  f = fixture({ saved });
  assert.equal(f.component.settingsFilter, 'services');
  assert.equal(f.component.searchControl.value, 'tipos');
  assert.equal(f.component.visibleCards[0].id, 'service-types');
  f.component.ngOnDestroy();
});
test('descarta filtros almacenados inválidos y no persiste contraseñas ni datos de formularios', () => {
  const f = fixture({ saved: new Map([['admin-settings', { category: 'bad', search: null }]]) });
  assert.equal(f.component.settingsFilter, 'all');
  assert.equal(f.component.searchControl.value, '');
  f.component.selectCategory('services');
  const data = f.saved.get('admin-settings');
  assert.equal(Object.keys(data).sort().join(','), 'category,search');
  f.component.ngOnDestroy();
});
test('el alias services-menu sigue filtrando y una categoría inválida no altera la selección', () => {
  const f = fixture();
  f.component.open('services-menu');
  assert.equal(f.component.settingsFilter, 'services');
  f.component.selectCategory('invalid');
  assert.equal(f.component.settingsFilter, 'services');
  f.component.ngOnDestroy();
});
test('plantillas de ticket siguen cambiando de controles y conservan borradores independientes', () => {
  const f = fixture();
  for (const event of f.component.templateOptions) {
    f.component.templateEvent = event.key;
    f.component.selectedSubjectControl.setValue('Asunto ' + event.key);
    f.component.selectedBodyControl.setValue('Cuerpo ' + event.key);
  }
  for (const event of f.component.templateOptions) {
    f.component.templateEvent = event.key;
    assert.equal(f.component.selectedSubjectControl.value, 'Asunto ' + event.key);
    assert.equal(f.component.selectedBodyControl.value, 'Cuerpo ' + event.key);
  }
  f.component.saveEmail();
  assert.equal(f.calls.at(-1).method, 'updateSettings');
  assert.equal(f.calls.at(-1).payload.assignedSubject, 'Asunto assigned');
  assert.equal(f.calls.at(-1).payload.ticketCreatedSubject, 'Asunto created');
  f.component.ngOnDestroy();
});
test('plantillas de servicio por vencer y vencido mantienen datos y contrato de guardado', () => {
  const f = fixture();
  f.component.serviceTemplateEvent = 'upcoming';
  f.component.selectedServiceSubjectControl.setValue('Por vencer');
  f.component.selectedServiceBodyControl.setValue('Aviso próximo');
  f.component.serviceTemplateEvent = 'expired';
  f.component.selectedServiceSubjectControl.setValue('Vencido');
  f.component.selectedServiceBodyControl.setValue('Aviso vencido');
  f.component.saveServiceSettings();
  const request = f.calls.at(-1);
  assert.equal(request.method, 'updateServiceSettings');
  assert.equal(request.payload.asuntoPorVencer, 'Por vencer');
  assert.equal(request.payload.asuntoVencido, 'Vencido');
  assert.equal(request.payload.plantillaPorVencer, 'Aviso próximo');
  request.response.next({ success: true });
  assert.equal(f.component.saved, true);
  f.component.ngOnDestroy();
});
test('borrar o cambiar filtros no guarda preferencias ni envía correos', () => {
  const f = fixture();
  f.component.selectCategory('services');
  f.component.searchControl.setValue('vencimiento');
  f.component.clearSearch();
  f.component.resetHubFilters();
  assert.equal(
    f.calls.filter((c) => c.method.startsWith('update') || c.method === 'testEmail').length,
    0,
  );
  f.component.ngOnDestroy();
});
test('salir elimina la suscripción de búsqueda y evita persistencia tardía', () => {
  const f = fixture();
  f.component.searchControl.setValue('correo');
  const saved = f.saved.get('admin-settings');
  f.component.ngOnDestroy();
  f.component.searchControl.setValue('otro');
  assert.equal(f.saved.get('admin-settings'), saved);
});
test('guardados repetidos comparten una sola petición y respetan la respuesta de error', () => {
  const f = fixture();
  f.component.saveEmail();
  f.component.saveEmail();
  assert.equal(f.calls.filter((c) => c.method === 'updateSettings').length, 1);
  assert.equal(f.component.saving, true);
  const req = f.calls.at(-1);
  req.response.next({ success: false, message: 'Sin permiso' });
  req.response.complete();
  assert.equal(f.component.saved, false);
  assert.equal(f.component.testError, 'Sin permiso');
  assert.equal(f.component.saving, false);
  f.component.saveEmail();
  f.calls.at(-1).response.error({ error: { message: 'Error al guardar' } });
  assert.equal(f.component.saving, false);
  assert.equal(f.component.testError, 'Error al guardar');
  f.component.ngOnDestroy();
});
test('validación de servicios detecta plazos incorrectos y plantillas ocultas sin escribir', () => {
  const f = fixture();
  for (const days of [null, 0, 366, 1.5]) {
    f.component.serviceForm.get('diasPorVencer').setValue(days);
    f.component.saveServiceSettings();
    assert.equal(f.component.serviceSubmitted, true);
    assert.equal(f.calls.filter((c) => c.method === 'updateServiceSettings').length, 0);
  }
  f.component.serviceForm.get('diasPorVencer').setValue(5);
  f.component.serviceForm.get('asuntoVencido').setValue('');
  f.component.serviceTemplateEvent = 'upcoming';
  f.component.saveServiceSettings();
  assert.equal(f.component.serviceForm.get('asuntoVencido').touched, true);
  assert.equal(f.calls.filter((c) => c.method === 'updateServiceSettings').length, 0);
  f.component.ngOnDestroy();
});
test('no permite guardar valores predeterminados si la carga del servidor falló', () => {
  const f = fixture();
  f.component.loadSettings();
  f.calls.at(-1).response.error({});
  f.component.saveEmail();
  assert.equal(f.calls.filter((c) => c.method === 'updateSettings').length, 0);
  assert.ok(f.component.emailLoadError);
  f.component.loadSettings();
  f.calls.at(-1).response.next({ success: true, data: { assignedSubject: 'Servidor' } });
  f.calls.at(-1).response.complete();
  f.component.saveEmail();
  assert.equal(f.calls.at(-1).payload.assignedSubject, 'Servidor');
  f.calls.at(-1).response.complete();
  f.component.open('services');
  f.calls.at(-1).response.error({});
  f.component.saveServiceSettings();
  assert.equal(f.calls.filter((c) => c.method === 'updateServiceSettings').length, 0);
  assert.ok(f.component.serviceLoadError);
  f.component.ngOnDestroy();
});
test('prueba SMTP solo explícita, sin duplicados, con error y recuperación', () => {
  const f = fixture();
  f.component.open('email');
  assert.equal(f.calls.filter((c) => c.method === 'testEmail').length, 0);
  f.component.testEmail();
  f.component.testEmail();
  assert.equal(f.calls.filter((c) => c.method === 'testEmail').length, 1);
  f.calls.at(-1).response.error({});
  assert.equal(f.component.testing, false);
  assert.equal(f.component.testSent, false);
  assert.ok(f.component.testError);
  f.component.testEmail();
  f.calls.at(-1).response.next({ success: true });
  f.calls.at(-1).response.complete();
  assert.equal(f.component.testSent, true);
  assert.equal(f.component.testError, '');
  f.component.ngOnDestroy();
});
test('salir cancela cargas y evita actualizaciones tardías de formularios', () => {
  const f = fixture();
  f.component.open('services');
  const req = f.calls.at(-1);
  assert.equal(f.component.loadingServices, true);
  f.component.ngOnDestroy();
  assert.equal(req.response.observed, false);
  req.response.next({ success: true, data: { diasPorVencer: 22 } });
  assert.equal(f.component.serviceForm.get('diasPorVencer').value, 5);
});
test('editar después de guardar elimina el mensaje de éxito anterior', () => {
  const f = fixture();
  f.component.saveEmail();
  f.calls.at(-1).response.next({ success: true });
  f.calls.at(-1).response.complete();
  assert.equal(f.component.saved, true);
  f.component.emailForm.get('assignedSubject').setValue('Nuevo borrador');
  assert.equal(f.component.saved, false);
  f.component.ngOnDestroy();
});
