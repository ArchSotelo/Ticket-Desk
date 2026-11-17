// API simulada: no modifica usuarios ni contraseñas reales.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { launchBrowser } = require('./helpers/browser.cjs');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

test(
  'cambio obligatorio: cuatro roles, navegación restringida, errores, móvil y cierre de sesión',
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
      const base = `http://127.0.0.1:${server.address().port}`;
      for (const [role, protectedPath] of [
        ['ROLE_ADMIN', '/audit'],
        ['ROLE_SUPERVISOR', '/tickets/list'],
        ['ROLE_TECNICO', '/tecnico/kanban'],
        ['ROLE_CLIENTE', '/cliente/tickets'],
      ]) {
        const context = await browser.newContext({ viewport: { width: 1440, height: 960 } });
        const page = await context.newPage();
        const errors = [],
          business = [],
          writes = [];
        page.on('pageerror', (error) => errors.push(error.message));
        let fail = true;
        await page.route('**/api/v1/**', async (route) => {
          const request = route.request();
          const endpoint = new URL(request.url()).pathname;
          if (endpoint.endsWith('/auth/login'))
            return route.fulfill({
              json: {
                success: true,
                data: {
                  accessToken: `e30.${Buffer.from(JSON.stringify({ sv: 1, exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url')}.test`,
                  refreshToken: 'initial-test-refresh',
                  userId: 1,
                  roles: [role],
                  permissions: [],
                  requiresPasswordChange: true,
                },
              },
            });
          if (endpoint.endsWith('/users/me/password')) {
            assert.equal(request.method(), 'PUT');
            writes.push(request.postDataJSON());
            return route.fulfill(
              fail
                ? {
                    status: 400,
                    json: { success: false, message: 'La contraseña actual es incorrecta.' },
                  }
                : { json: { success: true } },
            );
          }
          business.push(endpoint);
          return route.fulfill({
            status: 403,
            json: { success: false, errors: ['PASSWORD_CHANGE_REQUIRED'] },
          });
        });
        await page.goto(base + '/auth/login');
        await page.getByLabel('Usuario', { exact: true }).fill('usuario-ejemplo');
        await page.getByLabel('Contraseña', { exact: true }).fill('Temporal123!');
        await page.getByRole('button', { name: 'Iniciar sesión', exact: true }).click();
        await page.waitForURL(base + '/auth/change-password');
        await page.getByRole('heading', { name: 'Cambia tu contraseña' }).waitFor();
        assert.equal(business.length, 0);
        await page.goto(base + protectedPath);
        await page.waitForURL(base + '/auth/change-password');
        assert.equal(
          business.length,
          0,
          'Los portales no deben cargar datos mientras se exige el cambio',
        );
        await page.getByLabel('Contraseña actual', { exact: true }).fill('Temporal123!');
        await page.getByLabel('Nueva contraseña', { exact: true }).fill('Nueva123!');
        await page.getByLabel('Confirmar nueva contraseña', { exact: true }).fill('Distinta123!');
        await page.getByRole('button', { name: 'Guardar contraseña', exact: true }).click();
        await page.getByRole('alert').filter({ hasText: 'no coinciden' }).waitFor();
        assert.equal(writes.length, 0);
        await page.getByLabel('Confirmar nueva contraseña', { exact: true }).fill('Nueva123!');
        await page.getByRole('button', { name: 'Guardar contraseña', exact: true }).click();
        await page.getByRole('alert').filter({ hasText: 'actual es incorrecta' }).waitFor();
        assert.equal(writes.length, 1);
        for (const [width, theme] of [
          [1440, 'light'],
          [390, 'dark'],
        ]) {
          await page.setViewportSize({ width, height: 960 });
          await page.evaluate(
            (theme) => document.body.classList.toggle('dark-theme', theme === 'dark'),
            theme,
          );
          assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
          await page.screenshot({
            path: path.join(os.tmpdir(), `forced-password-${role}-${width}.png`),
            fullPage: true,
          });
        }
        fail = false;
        await page.getByRole('button', { name: 'Guardar contraseña', exact: true }).click();
        await page.waitForURL(base + '/auth/login?passwordChanged=true');
        await page.getByRole('status').filter({ hasText: 'Contraseña actualizada.' }).waitFor();
        assert.equal(await page.evaluate(() => localStorage.getItem('user_session')), null);
        assert.deepEqual(errors, []);
        await context.close();
        console.log(`${role}: cambio inicial y rutas protegidas comprobados`);
      }
      // Aunque se altere el indicador del navegador, el 403 del servidor obliga a cambiarla.
      const context = await browser.newContext();
      const page = await context.newPage();
      await page.addInitScript(() =>
        localStorage.setItem(
          'user_session',
          JSON.stringify({
            accessToken:
              'e30.' +
              btoa(JSON.stringify({ sv: 1, exp: Math.floor(Date.now() / 1000) + 3600 })) +
              '.test',
            refreshToken: 'test-refresh',
            userId: 1,
            roles: ['ROLE_ADMIN'],
            requiresPasswordChange: false,
          }),
        ),
      );
      await page.route('**/api/v1/**', (route) =>
        route.fulfill({
          status: 403,
          json: { success: false, errors: ['PASSWORD_CHANGE_REQUIRED'] },
        }),
      );
      await page.goto(base + '/perfil');
      await page.waitForURL(base + '/auth/change-password');
      await context.close();
    } finally {
      await browser?.close();
      await new Promise((resolve) => server.close(resolve));
    }
  },
);
