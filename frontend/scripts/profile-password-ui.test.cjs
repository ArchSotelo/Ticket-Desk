// API simulada: no cambia contraseñas de cuentas reales.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { launchBrowser } = require('./helpers/browser.cjs');
const { installPermissionSessionDefaults } = require('./helpers/permission-session.cjs');
const http = require('node:http'),
  fs = require('node:fs'),
  path = require('node:path'),
  os = require('node:os');

test(
  'Cambio de contraseña en perfiles: validación, error, éxito y móvil',
  { timeout: 120000 },
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
      browser = await launchBrowser({ headless: true });
      for (const [portal, routePath, role] of [
        ['technician', '/tecnico/perfil', 'ROLE_TECNICO'],
        ['admin', '/perfil', 'ROLE_ADMIN'],
        ['client', '/cliente/perfil', 'ROLE_CLIENTE'],
      ]) {
        const context = await browser.newContext({ viewport: { width: 1846, height: 964 } });
        const page = await context.newPage(),
          errors = [],
          writes = [];
        page.on('pageerror', (error) => errors.push(error.message));
        await page.addInitScript(installPermissionSessionDefaults);
        await page.addInitScript((role) => {
          const accessToken =
            'e30.' + btoa(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 3600 })) + '.test';
          localStorage.setItem(
            'user_session',
            JSON.stringify({ accessToken, roles: [role], userId: 1, fullName: 'Carlos Campos' }),
          );
          window.WebSocket = class {
            static OPEN = 1;
            readyState = 0;
            close() {}
            addEventListener() {}
            removeEventListener() {}
          };
        }, role);
        let fail = true;
        await page.route('**/api/v1/**', async (route) => {
          const req = route.request(),
            url = new URL(req.url());
          let data = [];
          if (url.pathname.endsWith('/users/me/password')) {
            assert.equal(req.method(), 'PUT');
            writes.push(req.postDataJSON());
            if (fail)
              return route.fulfill({
                status: 400,
                json: { success: false, message: 'La contraseña actual es incorrecta.' },
              });
            return route.fulfill({
              json: { success: true, message: 'Contraseña actualizada correctamente.' },
            });
          }
          assert.equal(
            req.method(),
            'GET',
            'El formulario de contraseña no debe modificar otros datos',
          );
          if (url.pathname.endsWith('/users/me'))
            data = {
              id: 1,
              nombres: 'Carlos',
              apellidos: 'Campos',
              email: 'carlos@example.test',
              estado: 'ACTIVO',
              empresaNombre: 'Empresa Demo',
              roles: [role],
            };
          else if (url.pathname.endsWith('/count')) data = { count: 0 };
          else if (url.pathname.endsWith('/settings')) data = { enabled: false };
          await route.fulfill({ json: { success: true, data } });
        });
        await page.goto(`http://127.0.0.1:${server.address().port}${routePath}`);
        await page.getByRole('button', { name: 'Cambiar contraseña', exact: true }).click();
        await page.getByRole('button', { name: 'Actualizar contraseña', exact: true }).click();
        await page.locator('#current-password-error').waitFor();
        assert.equal(writes.length, 0);
        await page.getByLabel('Contraseña actual *', { exact: true }).fill('Anterior123!');
        await page.getByLabel('Nueva contraseña *', { exact: true }).fill('Nueva123!');
        await page.getByLabel('Confirmar nueva contraseña *', { exact: true }).fill('Otra123!');
        await page.getByRole('button', { name: 'Actualizar contraseña', exact: true }).click();
        await page.getByText('Las contraseñas no coinciden.', { exact: true }).waitFor();
        assert.equal(writes.length, 0);
        await page.getByLabel('Confirmar nueva contraseña *', { exact: true }).fill('Nueva123!');
        for (const width of [1846, 390]) {
          await page.setViewportSize({ width, height: 964 });
          await page.waitForTimeout(300);
          assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
          await page.screenshot({
            path: path.join(os.tmpdir(), `profile-password-${portal}-${width}.png`),
          });
        }
        await page.getByRole('button', { name: 'Actualizar contraseña', exact: true }).click();
        await page
          .getByRole('alert')
          .filter({ hasText: 'La contraseña actual es incorrecta.' })
          .waitFor();
        assert.equal(
          await page.getByLabel('Contraseña actual *', { exact: true }).inputValue(),
          '',
        );
        assert.deepEqual(writes[0], { currentPassword: 'Anterior123!', newPassword: 'Nueva123!' });
        fail = false;
        await page.getByLabel('Contraseña actual *', { exact: true }).fill('Anterior123!');
        await page.getByRole('button', { name: 'Actualizar contraseña', exact: true }).click();
        await page.waitForURL('**/auth/login?passwordChanged=true');
        await page
          .getByRole('status')
          .filter({ hasText: 'Contraseña actualizada. Inicia sesión con tu nueva contraseña.' })
          .waitFor();
        assert.equal(await page.evaluate(() => localStorage.getItem('user_session')), null);
        assert.deepEqual(errors, []);
        await context.close();
        console.log(`${portal}: cambio de contraseña verificado`);
      }
    } finally {
      await browser?.close();
      await new Promise((resolve) => server.close(resolve));
    }
  },
);
