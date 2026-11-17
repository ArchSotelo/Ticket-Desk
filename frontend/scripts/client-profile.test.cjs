// node --test scripts/client-profile.test.cjs
const { test, before } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const rxjs = require('rxjs');
let Profile, forms, ProfileBase;
const profileClasses = {};
before(async () => {
  await import('@angular/compiler');
  forms = await import('@angular/forms');
  const load = (source) => {
    const moduleObject = { exports: {} };
    vm.runInNewContext(
      ts.transpileModule(fs.readFileSync(path.resolve(__dirname, source), 'utf8'), {
        compilerOptions: {
          module: ts.ModuleKind.CommonJS,
          target: ts.ScriptTarget.ES2022,
          experimentalDecorators: true,
          useDefineForClassFields: false,
        },
      }).outputText,
      {
        exports: moduleObject.exports,
        module: moduleObject,
        TextEncoder,
        require: (name) => {
          if (name === 'rxjs') return rxjs;
          if (name === '@angular/forms') return forms;
          if (name === '@angular/core')
            return {
              Component: () => (component) => component,
              Directive: () => (component) => component,
            };
          if (name === '../shared/profile/profile-base') return { ProfileBase };
          if (name.startsWith('@angular/') || name.startsWith('../core/')) return {};
          throw new Error(name);
        },
      },
    );
    return moduleObject.exports;
  };
  ProfileBase = load('../src/app/shared/profile/profile-base.ts').ProfileBase;
  Profile = load('../src/app/cliente/client-profile.component.ts').ClientProfileComponent;
  profileClasses.client = Profile;
  profileClasses.technician = load(
    '../src/app/tecnico/technician-profile.component.ts',
  ).TechnicianProfileComponent;
  profileClasses.admin = load('../src/app/admin/admin-profile.component.ts').AdminProfileComponent;
});
const original = {
  id: 8,
  nombres: 'Ana',
  apellidos: 'Torres',
  email: 'ana@example.test',
  telefono: '+51 900 000 001',
  cargo: 'Analista de RRHH',
  empresaNombre: 'Corporación Demo',
  areaNombre: 'Recursos Humanos',
  estado: 'ACTIVO',
};
function fixture(portal = 'client') {
  const gets = [],
    puts = [],
    synced = [],
    passwords = [];
  const component = new profileClasses[portal](
    new forms.FormBuilder(),
    {
      changeMyPassword: (payload) => {
        const result = new rxjs.Subject();
        passwords.push({ payload, result });
        return result;
      },
      getProfile: () => {
        const result = new rxjs.Subject();
        gets.push(result);
        return result;
      },
      updateMyProfile: (payload) => {
        const result = new rxjs.Subject();
        puts.push({ payload, result });
        return result;
      },
    },
    {
      syncProfile: (profile) => synced.push(profile),
      passwordChanged: () => passwords.push('session-ended'),
    },
  );
  component.ngOnInit();
  return { component, gets, puts, synced, passwords };
}
function load(f) {
  f.gets.at(-1).next({ success: true, data: original });
  f.gets.at(-1).complete();
}
for (const portal of ['client', 'technician', 'admin']) {
  test(`carga los datos existentes sin inventar un estado activo (${portal})`, () => {
    const f = fixture(portal);
    assert.equal(f.component.loadingProfile, true);
    load(f);
    assert.equal(f.component.loadingProfile, false);
    assert.equal(f.component.initials, 'AT');
    assert.equal(f.component.profileForm.contains('avatarUrl'), false);
    assert.equal(f.component.accountActive, true);
    f.component.profile = { ...original, estado: 'INACTIVO' };
    assert.equal(f.component.accountActive, false);
    assert.equal(f.component.accountStatus, 'INACTIVO');
    f.component.profile = { ...original, estado: undefined };
    assert.equal(f.component.accountActive, false);
    assert.equal(f.component.accountStatus, 'No disponible');
    f.component.ngOnDestroy();
  });
  test(`los errores de carga se muestran y se pueden reintentar (${portal})`, () => {
    const f = fixture(portal);
    f.gets[0].error({ error: { message: 'Sin conexión' } });
    assert.equal(f.component.loadError, 'Sin conexión');
    assert.equal(f.component.loadingProfile, false);
    f.component.reload();
    load(f);
    assert.equal(f.component.loadError, '');
    assert.ok(f.component.profile);
    f.component.ngOnDestroy();
  });
  test(`una respuesta incompleta de carga no oculta el error ni habilita guardar sin perfil (${portal})`, () => {
    const f = fixture(portal);
    f.gets[0].next({ success: false });
    f.gets[0].complete();
    assert.match(f.component.loadError, /cargar/);
    f.component.save();
    assert.equal(f.puts.length, 0);
    f.component.ngOnDestroy();
  });
  test(`validación real de Angular muestra los campos obligatorios y el correo inválido (${portal})`, () => {
    const f = fixture(portal);
    load(f);
    f.component.profileForm.patchValue({ nombres: '', apellidos: '', email: 'no-es-correo' });
    assert.equal(f.component.fieldError('nombres'), '');
    f.component.save();
    assert.equal(f.puts.length, 0);
    assert.equal(f.component.fieldError('nombres'), 'Ingresa tus nombres.');
    assert.equal(f.component.fieldError('apellidos'), 'Ingresa tus apellidos.');
    assert.equal(f.component.fieldError('email'), 'Ingresa un correo electrónico válido.');
    f.component.profileForm.patchValue({ email: '' });
    assert.equal(f.component.fieldError('email'), 'Ingresa tu correo electrónico.');
    f.component.ngOnDestroy();
  });
  test(`guardar conserva el payload, bloquea envíos duplicados y sincroniza la respuesta del servidor (${portal})`, () => {
    const f = fixture(portal);
    load(f);
    f.component.profileForm.patchValue({ nombres: 'Ana María' });
    f.component.save();
    f.component.save();
    f.component.reload();
    assert.equal(f.puts.length, 1);
    assert.equal(f.gets.length, 1);
    assert.equal(Object.hasOwn(f.puts[0].payload, 'avatarUrl'), false);
    assert.equal(f.puts[0].payload.nombres, 'Ana María');
    const updated = { ...original, nombres: 'Ana Maria' };
    f.puts[0].result.next({ success: true, data: updated });
    f.puts[0].result.complete();
    assert.equal(f.component.loading, false);
    assert.equal(f.synced[0], updated);
    assert.equal(f.component.profileForm.get('nombres').value, 'Ana Maria');
    assert.equal(f.component.profileForm.pristine, true);
    assert.equal(f.component.profileForm.untouched, true);
    assert.ok(f.component.successMessage);
    f.component.ngOnDestroy();
  });
  test(`fallos al guardar conservan lo escrito y permiten reintentar, restaurar recarga los datos (${portal})`, () => {
    const f = fixture(portal);
    load(f);
    f.component.profileForm.patchValue({ cargo: 'Otro cargo' });
    f.component.save();
    f.puts[0].result.error({ error: { message: 'No se pudo guardar' } });
    assert.equal(f.component.errorMessage, 'No se pudo guardar');
    assert.equal(f.component.loading, false);
    assert.equal(f.component.profileForm.get('cargo').value, 'Otro cargo');
    f.component.save();
    f.puts[1].result.next({ success: false, message: 'Correo duplicado' });
    f.puts[1].result.complete();
    assert.equal(f.component.errorMessage, 'Correo duplicado');
    f.component.reload();
    load(f);
    assert.equal(f.component.profileForm.get('cargo').value, original.cargo);
    assert.equal(f.component.errorMessage, '');
    f.component.ngOnDestroy();
  });
  test(`salir cancela las peticiones de carga y guardado (${portal})`, () => {
    const f = fixture(portal);
    f.component.ngOnDestroy();
    assert.equal(f.gets[0].observed, false);
    const g = fixture(portal);
    load(g);
    g.component.save();
    g.component.ngOnDestroy();
    assert.equal(g.puts[0].result.observed, false);
  });
  test(`título, roles y cargo conservan el contexto de cada portal (${portal})`, () => {
    const f = fixture(portal);
    load(f);
    assert.equal(f.component.portal, portal);
    assert.equal(f.component.isStaff, portal !== 'client');
    assert.equal(
      f.component.profileTitle,
      { client: 'Mi perfil', technician: 'Perfil del técnico', admin: 'Perfil del administrador' }[
        portal
      ],
    );
    assert.equal(f.component.roleLabel('ROLE_TECNICO'), 'Técnico');
    assert.equal(f.component.roleLabel('ROLE_ADMIN'), 'Administrador');
    assert.equal(f.component.roleLabel('ROLE_SUPERVISOR'), 'Supervisor');
    assert.equal(f.component.roleLabel('ROLE_SUPERVISOR'), 'Supervisor');
    assert.equal(f.component.roleLabel('ROLE_CUSTOM'), 'CUSTOM');
    assert.equal(
      f.component.defaultPosition,
      portal === 'technician' ? 'Técnico' : 'Administrador',
    );
    f.component.ngOnDestroy();
  });
}

for (const portal of ['client', 'technician', 'admin']) {
  test(`cambio de contraseña valida confirmación, impide duplicados y borra campos al guardar (${portal})`, () => {
    const f = fixture(portal);
    load(f);
    const c = f.component;
    c.togglePasswordPanel();
    c.changePassword();
    assert.equal(f.passwords.length, 0);
    c.passwordForm.setValue({
      currentPassword: 'Anterior123!',
      newPassword: 'Nueva123!',
      confirmPassword: 'Otra123!',
    });
    c.changePassword();
    assert.equal(f.passwords.length, 0);
    assert.equal(c.passwordFieldError('confirmPassword'), 'Las contraseñas no coinciden.');
    c.passwordForm.get('confirmPassword').setValue('Nueva123!');
    c.changePassword();
    c.changePassword();
    assert.equal(f.passwords.length, 1);
    assert.deepEqual(JSON.parse(JSON.stringify(f.passwords[0].payload)), {
      currentPassword: 'Anterior123!',
      newPassword: 'Nueva123!',
    });
    assert.equal(f.puts.length, 0, 'Cambiar contraseña no guarda otros datos del perfil');
    f.passwords[0].result.next({ success: true });
    assert.equal(c.passwordPanelOpen, false);
    assert.equal(c.changingPassword, false);
    assert.equal(c.passwordForm.get('newPassword').value, null);
    assert.ok(f.passwords.includes('session-ended'));
    c.ngOnDestroy();
  });
  test(`rechaza contraseña repetida o demasiado larga y muestra errores del servidor (${portal})`, () => {
    const f = fixture(portal);
    load(f);
    const c = f.component;
    c.togglePasswordPanel();
    c.passwordForm.setValue({
      currentPassword: 'Anterior123!',
      newPassword: 'Anterior123!',
      confirmPassword: 'Anterior123!',
    });
    c.changePassword();
    assert.equal(f.passwords.length, 0);
    assert.match(c.passwordError, /diferente/);
    c.passwordForm.setValue({
      currentPassword: 'Anterior123!',
      newPassword: 'á'.repeat(40),
      confirmPassword: 'á'.repeat(40),
    });
    c.changePassword();
    assert.equal(f.passwords.length, 0);
    assert.match(c.passwordError, /72 bytes/);
    c.passwordForm.setValue({
      currentPassword: 'Incorrecta123!',
      newPassword: 'Nueva123!',
      confirmPassword: 'Nueva123!',
    });
    c.changePassword();
    f.passwords[0].result.error({ error: { message: 'La contraseña actual es incorrecta.' } });
    assert.equal(c.changingPassword, false);
    assert.equal(c.passwordPanelOpen, true);
    assert.equal(c.passwordForm.get('currentPassword').value, null);
    assert.match(c.passwordError, /incorrecta/);
    c.togglePasswordPanel();
    assert.equal(c.passwordForm.get('newPassword').value, null);
    c.ngOnDestroy();
  });
}
