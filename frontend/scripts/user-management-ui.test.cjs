// node --test scripts/user-management-ui.test.cjs — API simulada; no usa usuarios reales.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { launchBrowser } = require('./helpers/browser.cjs');
const { installPermissionSessionDefaults } = require('./helpers/permission-session.cjs');

test(
  'Usuarios: ocho diseños, filtros del servidor, persistencia, editor y activar/desactivar',
  { timeout: 180000 },
  async () => {
    const dist = path.resolve(__dirname, '../dist/enterprise-ticket-frontend');
    const server = http.createServer((req, res) => {
      let file = path.resolve(dist, '.' + new URL(req.url, 'http://localhost').pathname);
      if (
        !file.startsWith(dist + path.sep) ||
        !fs.existsSync(file) ||
        fs.statSync(file).isDirectory()
      )
        file = path.join(dist, 'index.html');
      res.setHeader(
        'Content-Type',
        { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html' }[
          path.extname(file)
        ] || 'application/octet-stream',
      );
      fs.createReadStream(file).pipe(res);
    });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    let browser;
    try {
      browser = await launchBrowser({ headless: true, channel: 'chrome' });
      const origin = `http://127.0.0.1:${server.address().port}`;
      let layouts = 0;
      for (const dark of [false, true]) {
        console.log('Usuarios/' + (dark ? 'dark' : 'light'));
        const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } }),
          page = await context.newPage(),
          errors = [],
          requests = [];
        page.on('pageerror', (error) => errors.push(error.message));
        await page.addInitScript(installPermissionSessionDefaults);
        await page.addInitScript((dark) => {
          const accessToken =
            'e30.' + btoa(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 3600 })) + '.test';
          localStorage.setItem(
            'user_session',
            JSON.stringify({
              accessToken,
              roles: ['ROLE_ADMIN'],
              userId: 1,
              fullName: 'Administrador Demo',
            }),
          );
          window.addEventListener('DOMContentLoaded', () =>
            document.body.classList.toggle('dark-theme', dark),
          );
          window.WebSocket = class {
            static OPEN = 1;
            static CONNECTING = 0;
            readyState = 0;
            close() {}
            addEventListener() {}
            removeEventListener() {}
          };
        }, dark);
        const companies = [
          { id: 1, razonSocial: 'EMPRESA DEMO S.A.C.', estado: true },
          { id: 2, razonSocial: 'Empresa B', estado: false },
        ];
        const areas = [
          { id: 1, empresaId: 1, nombre: 'Sistemas', activo: true },
          { id: 2, empresaId: 2, nombre: 'Compras', activo: true },
        ];
        const names = [
          ['ADM', 'Administrador', 'Demo', 'Administrador', 'ROLE_ADMIN'],
          ['CLIENTE_DEMO_01', 'Andrés', 'Fuentes', 'Planner', 'ROLE_CLIENTE'],
          ['TECNICO_DEMO_01', 'Carlos', 'Campos', 'Auxiliar Sistemas', 'ROLE_TECNICO'],
          ['CLIENTE_DEMO_02', 'Eduardo', 'Acosta', 'Auxiliar Operaciones', 'ROLE_CLIENTE'],
          ['CLIENTE_DEMO_03', 'Esteban', 'Castro', 'Auxiliar Compras', 'ROLE_CLIENTE'],
          ['CLIENTE_DEMO_04', 'Karla', 'Figueroa', 'Asistente Administrativo', 'ROLE_CLIENTE'],
          ['CLIENTE_DEMO_05', 'Katia', 'Paredes', 'Auxiliar de Operaciones', 'ROLE_CLIENTE'],
          ['CLIENTE_DEMO_06', 'Laura', 'Ramírez', 'Ventas', 'ROLE_CLIENTE'],
          ['CLIENTE_DEMO_07', 'Maria', 'Rojas', 'Finanzas', 'ROLE_CLIENTE'],
          ['CLIENTE_DEMO_08', 'Pedro', 'Luna', 'Administración', 'ROLE_CLIENTE'],
        ];
        const users = names.map(([username, nombres, apellidos, cargo, role], i) => ({
          id: i + 1,
          username,
          nombres,
          apellidos,
          email: username.toLowerCase() + '@example.test',
          cargo,
          telefono: '',
          roles: i === 2 ? ['ROLE_TECNICO', 'ROLE_SUPERVISOR'] : [role],
          estado: i === 3 ? 'INACTIVO' : i === 9 ? 'BLOQUEADO' : 'ACTIVO',
          empresaId: i >= 8 ? 2 : 1,
          empresaNombre: companies[i >= 8 ? 1 : 0].razonSocial,
          areaId: i >= 8 ? 2 : 1,
          areaNombre: i >= 8 ? 'Compras' : 'Sistemas',
        }));
        let failList = false,
          failSave = false,
          failCompanies = false,
          failDetail = false;
        await page.route('**/api/v1/**', async (route) => {
          const req = route.request(),
            url = new URL(req.url()),
            method = req.method();
          requests.push({
            path: url.pathname,
            method,
            query: url.search,
            body: method === 'GET' ? null : req.postDataJSON(),
          });
          assert.notEqual(
            method,
            'DELETE',
            'El flujo solo activa/desactiva, nunca elimina usuarios',
          );
          let data = [],
            match;
          if (url.pathname === '/api/v1/users' && method === 'GET') {
            if (failList) {
              failList = false;
              return route.fulfill({ status: 500, json: { success: false } });
            }
            const search = (url.searchParams.get('busqueda') || '').toLowerCase(),
              role = url.searchParams.get('rol'),
              company = url.searchParams.get('empresaId'),
              status = url.searchParams.get('estado');
            const filtered = users.filter(
              (u) =>
                (!search ||
                  [u.nombres + ' ' + u.apellidos, u.email, u.username].some((v) =>
                    v.toLowerCase().includes(search),
                  )) &&
                (!role || u.roles.includes(role)) &&
                (!company || u.empresaId === Number(company)) &&
                (!status || u.estado === status),
            );
            const size = Number(url.searchParams.get('size') || 8),
              number = Number(url.searchParams.get('page') || 0);
            data = {
              content: filtered.slice(number * size, (number + 1) * size),
              number,
              size,
              totalElements: filtered.length,
              totalPages: Math.ceil(filtered.length / size),
            };
          } else if (url.pathname === '/api/v1/users' && method === 'POST') {
            await new Promise((resolve) => setTimeout(resolve, 200));
            if (failSave) {
              failSave = false;
              return route.fulfill({ status: 409, json: { message: 'Usuario duplicado' } });
            }
            data = {
              ...req.postDataJSON(),
              id: 11,
              estado: 'ACTIVO',
              empresaNombre: companies.find((c) => c.id === req.postDataJSON().empresaId)
                ?.razonSocial,
            };
            users.push(data);
          } else if ((match = /\/users\/(\d+)\/estado$/.exec(url.pathname))) {
            assert.equal(method, 'PATCH');
            const record = users.find((u) => u.id === Number(match[1]));
            record.estado = url.searchParams.get('estado');
            data = null;
          } else if ((match = /\/users\/(\d+)$/.exec(url.pathname))) {
            const record = users.find((u) => u.id === Number(match[1]));
            if (method === 'GET') {
              if (failDetail) {
                failDetail = false;
                return route.fulfill({ status: 500, json: { message: 'Detalle no disponible' } });
              }
              data = record;
            } else {
              assert.equal(method, 'PUT');
              Object.assign(record, req.postDataJSON());
              data = record;
            }
          } else if (url.pathname === '/api/v1/empresas') {
            if (failCompanies) {
              failCompanies = false;
              return route.fulfill({ status: 500, json: { success: false } });
            }
            data = companies;
          } else if (url.pathname === '/api/v1/areas')
            data = areas.filter((a) => a.empresaId === Number(url.searchParams.get('empresaId')));
          else if (url.pathname.endsWith('/users/me')) data = users[0];
          else if (url.pathname.endsWith('/count')) data = { count: 0 };
          else if (url.pathname.endsWith('/settings')) data = { enabled: false };
          await route.fulfill({ json: { success: true, data } });
        });
        await page.goto(origin + '/users');
        await page.waitForFunction(
          () => document.querySelectorAll('.users-table tbody tr').length === 8,
        );
        assert.equal(
          await page
            .locator('.users-table th')
            .allTextContents()
            .then((items) => items.join(',')),
          'Usuario,Cargo,Empresa,Rol,Estado,Acciones',
        );
        assert.match(await page.locator('.users-roles .role_tecnico').innerText(), /Técnico/);
        for (const width of [1920, 1024, 390, 320]) {
          await page.setViewportSize({ width, height: width <= 390 ? 844 : 1080 });
          await page.waitForTimeout(300);
          await page.locator('.main-content').evaluate((el) => (el.scrollTop = 0));
          for (const selector of [
            '.users-workspace',
            '.users-filters',
            '.service-list-directory',
            '.service-list-pagination',
          ])
            assert.ok(
              await page.locator(selector).evaluate((el) => el.scrollWidth <= el.clientWidth + 1),
              selector + ' sin desbordamiento a ' + width,
            );
          assert.ok(
            await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
          );
          if (width === 1920) {
            assert.ok(
              await page.locator('.users-workspace').evaluate((el) => el.clientWidth > 1450),
            );
            assert.ok(
              await page
                .locator('.service-list-pagination')
                .evaluate(
                  (el) =>
                    el.getBoundingClientRect().bottom <=
                    document.querySelector('.main-content').getBoundingClientRect().bottom + 1,
                ),
              'Ocho filas y paginación visibles',
            );
          }
          await page.screenshot({
            path: path.join(os.tmpdir(), `users-${dark ? 'dark' : 'light'}-${width}.png`),
          });
          layouts++;
        }
        await page.setViewportSize({ width: 1920, height: 1080 });
        await page.waitForTimeout(300);
        await page.getByRole('button', { name: 'Página 2', exact: true }).click();
        await page.waitForFunction(() =>
          document.querySelector('.service-list-pagination p')?.textContent.includes('9–10'),
        );
        await page.reload();
        await page.waitForFunction(() =>
          document.querySelector('.service-list-pagination p')?.textContent.includes('9–10'),
        );
        await page.getByLabel('Filas', { exact: true }).selectOption({ label: '5' });
        await page.waitForFunction(
          () => document.querySelectorAll('.users-table tbody tr').length === 5,
        );
        await page.getByLabel('Buscar usuario', { exact: true }).fill('Carlos');
        await page.getByLabel('Rol', { exact: true }).selectOption('ROLE_TECNICO');
        await page.getByLabel('Empresa', { exact: true }).selectOption('1');
        await page.getByLabel('Estado', { exact: true }).selectOption('ACTIVO');
        await page.getByRole('button', { name: 'Filtrar', exact: true }).click();
        await page.waitForFunction(() =>
          document.querySelector('.service-list-results span')?.textContent.includes('1 usuario'),
        );
        await page
          .getByRole('button', { name: 'Editar usuario TECNICO_DEMO_01', exact: true })
          .click();
        await page.getByLabel('Nombres *', { exact: true }).fill('Carlos actualizado');
        assert.equal(
          await page.getByLabel('Usuario *', { exact: true }).getAttribute('readonly'),
          '',
        );
        await page
          .getByRole('button', { name: 'Guardar usuario', exact: true })
          .click({ clickCount: 3 });
        await page.locator('dialog[open]').waitFor({ state: 'hidden' });
        const edit = requests.filter((r) => r.method === 'PUT').at(-1);
        assert.equal(edit.path, '/api/v1/users/3');
        assert.equal('roles' in edit.body, false);
        assert.equal('password' in edit.body, false);
        assert.equal(users[2].roles.length, 2);
        await page.reload();
        await page.waitForFunction(
          () => document.querySelector('#users-search')?.value === 'Carlos',
        );
        assert.equal(await page.getByLabel('Estado', { exact: true }).inputValue(), 'ACTIVO');
        await page.getByRole('button', { name: 'Limpiar', exact: true }).click();
        await page.waitForFunction(() =>
          document.querySelector('.service-list-results span')?.textContent.includes('10 usuarios'),
        );
        await page.getByLabel('Estado', { exact: true }).selectOption('INACTIVO');
        await page.getByRole('button', { name: 'Filtrar', exact: true }).click();
        await page
          .getByRole('button', { name: 'Activar usuario CLIENTE_DEMO_02', exact: true })
          .click();
        await page.locator('.swal2-cancel').click();
        await page.locator('.swal2-container').waitFor({ state: 'hidden' });
        assert.equal(requests.filter((r) => r.method === 'PATCH').length, 0);
        await page
          .getByRole('button', { name: 'Activar usuario CLIENTE_DEMO_02', exact: true })
          .click();
        await page.locator('.swal2-confirm').click();
        await page
          .getByRole('heading', { name: 'No hay usuarios con los filtros aplicados', exact: true })
          .waitFor();
        assert.equal(users[3].estado, 'ACTIVO');
        await page.getByRole('button', { name: 'Limpiar filtros', exact: true }).click();
        await page
          .getByRole('button', { name: 'Desactivar usuario CLIENTE_DEMO_02', exact: true })
          .click();
        await page.locator('.swal2-confirm').click();
        await page.waitForFunction(() =>
          [...document.querySelectorAll('.users-status')].some((el) =>
            el.textContent.includes('Inactivo'),
          ),
        );
        await page.getByRole('button', { name: 'Nuevo usuario', exact: true }).click();
        for (const section of ['Datos personales', 'Acceso al sistema', 'Organización'])
          await page.getByRole('group', { name: section, exact: true }).waitFor();
        assert.equal(await page.getByLabel('Área (opcional)', { exact: true }).isDisabled(), true);
        assert.match(
          await page.getByLabel('Área (opcional)', { exact: true }).innerText(),
          /Selecciona primero una empresa/,
        );
        await page.locator('#user-password').fill('Password123');
        await page.getByRole('button', { name: 'Mostrar contraseña', exact: true }).click();
        await page.getByRole('button', { name: 'Ocultar contraseña', exact: true }).waitFor();
        assert.equal(await page.locator('#user-password').getAttribute('type'), 'text');
        assert.equal(
          await page
            .getByRole('button', { name: 'Ocultar contraseña', exact: true })
            .getAttribute('aria-pressed'),
          'true',
        );
        await page.getByRole('button', { name: 'Ocultar contraseña', exact: true }).click();
        await page.getByRole('button', { name: 'Mostrar contraseña', exact: true }).waitFor();
        assert.equal(await page.locator('#user-password').getAttribute('type'), 'password');
        await page.getByRole('button', { name: 'Mostrar contraseña', exact: true }).click();
        await page.getByRole('button', { name: 'Cancelar', exact: true }).click();
        await page.getByRole('button', { name: 'Nuevo usuario', exact: true }).click();
        assert.equal(await page.locator('#user-password').getAttribute('type'), 'password');
        assert.equal(await page.locator('#user-password').inputValue(), '');
        for (const width of [1920, 1024, 390, 320]) {
          await page.setViewportSize({ width, height: width === 1920 ? 1080 : 700 });
          await page.waitForTimeout(100);
          assert.ok(
            await page.locator('dialog[open]').evaluate((el) => {
              const r = el.getBoundingClientRect();
              return (
                r.top >= 0 &&
                r.left >= 0 &&
                r.right <= innerWidth + 1 &&
                r.bottom <= innerHeight + 1 &&
                el.scrollWidth <= el.clientWidth + 1
              );
            }),
          );
          assert.ok(
            await page
              .getByRole('button', { name: 'Guardar usuario', exact: true })
              .evaluate((el) => el.getBoundingClientRect().bottom <= innerHeight),
          );
          const headerTop = await page
            .locator('.users-editor-header')
            .evaluate((el) => el.getBoundingClientRect().top);
          await page
            .locator('.users-editor-body')
            .evaluate((el) => (el.scrollTop = el.scrollHeight));
          assert.equal(
            await page
              .locator('.users-editor-header')
              .evaluate((el) => el.getBoundingClientRect().top),
            headerTop,
          );
          assert.ok(
            await page
              .locator('.users-editor-footer')
              .evaluate((el) => el.getBoundingClientRect().bottom <= innerHeight),
          );
          await page.locator('.users-editor-body').evaluate((el) => (el.scrollTop = 0));
          await page.screenshot({
            path: path.join(os.tmpdir(), `user-editor-${dark ? 'dark' : 'light'}-${width}.png`),
          });
        }
        await page.setViewportSize({ width: 1920, height: 1080 });
        await page.getByRole('button', { name: 'Guardar usuario', exact: true }).click();
        await page.getByText('Completa este campo.', { exact: true }).first().waitFor();
        assert.equal(requests.filter((r) => r.method === 'POST').length, 0);
        await page.getByLabel('Usuario *', { exact: true }).fill('NEW');
        await page.getByLabel('Correo electrónico *', { exact: true }).fill('new@example.test');
        await page.getByLabel('Nombres *', { exact: true }).fill('Nuevo');
        await page.getByLabel('Apellidos *', { exact: true }).fill('Usuario');
        await page.getByLabel('Contraseña *', { exact: true }).fill('Password123');
        await page
          .getByLabel('Empresa *', { exact: true })
          .selectOption({ label: companies[0].razonSocial });
        await page
          .getByLabel('Área (opcional)', { exact: true })
          .selectOption({ label: 'Sistemas' });
        await page.getByLabel('Empresa *', { exact: true }).selectOption({ label: 'Empresa B' });
        await page
          .getByLabel('Área (opcional)', { exact: true })
          .selectOption({ label: 'Compras' });
        failSave = true;
        await page.getByRole('button', { name: 'Guardar usuario', exact: true }).click();
        await page.getByRole('alert').filter({ hasText: 'Usuario duplicado' }).waitFor();
        assert.equal(await page.getByLabel('Usuario *', { exact: true }).inputValue(), 'NEW');
        await page
          .getByRole('button', { name: 'Guardar usuario', exact: true })
          .click({ clickCount: 3 });
        await page.locator('dialog[open]').waitFor({ state: 'hidden' });
        assert.equal(users.length, 11);
        assert.equal(users.at(-1).empresaId, 2);
        assert.equal(users.at(-1).areaId, 2);
        failDetail = true;
        await page.getByRole('button', { name: 'Editar usuario ADM', exact: true }).click();
        await page.getByRole('alert').filter({ hasText: 'Detalle no disponible' }).waitFor();
        assert.equal(
          await page.getByRole('button', { name: 'Guardar usuario', exact: true }).isDisabled(),
          true,
        );
        await page.getByRole('button', { name: 'Cerrar formulario', exact: true }).click();
        failList = true;
        await page.reload();
        await page.getByRole('button', { name: 'Reintentar usuarios', exact: true }).click();
        await page.waitForFunction(() =>
          document.querySelector('.service-list-results span')?.textContent.includes('11 usuarios'),
        );
        failCompanies = true;
        await page.reload();
        await page.getByRole('button', { name: 'Reintentar empresas', exact: true }).click();
        await page.waitForFunction(
          () => document.querySelectorAll('#users-company option').length === 3,
        );
        assert.deepEqual(errors, []);
        await context.close();
      }
      console.log(
        'Verificados ' + layouts + ' diseños, formularios y operaciones con API simulada.',
      );
    } finally {
      await browser?.close();
      await new Promise((resolve) => server.close(resolve));
    }
  },
);
