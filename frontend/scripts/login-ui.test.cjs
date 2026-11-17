// API simulada: no inicia sesiones ni modifica cuentas reales.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { launchBrowser } = require('./helpers/browser.cjs');
const http = require('node:http'),
  fs = require('node:fs'),
  path = require('node:path'),
  os = require('node:os');

test(
  'Login: diseño responsive, tema persistente, contraseña, errores, envíos duplicados y destinos por rol',
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
      for (const [role, destination] of [
        ['ROLE_ADMIN', '/dashboard'],
        ['ROLE_TECNICO', '/tecnico/dashboard'],
        ['ROLE_CLIENTE', '/cliente'],
      ]) {
        const context = await browser.newContext({ viewport: { width: 1846, height: 964 } }),
          page = await context.newPage(),
          errors = [],
          logins = [];
        page.on('pageerror', (error) => errors.push(error.message));
        let mode = 'error',
          hold;
        await page.route('**/api/v1/**', async (route) => {
          if (!route.request().url().endsWith('/auth/login')) return; // Mantén los paneles de destino en estado de carga.
          assert.equal(route.request().method(), 'POST');
          logins.push(route.request().postDataJSON());
          if (mode === 'hold') await new Promise((resolve) => (hold = resolve));
          if (mode === 'network') return route.abort();
          if (mode === 'error')
            return route.fulfill({
              status: 401,
              json: { success: false, message: 'Usuario o contraseña incorrectos.' },
            });
          if (mode === 'unsuccessful')
            return route.fulfill({
              json: { success: false, message: 'No se pudo iniciar sesión.' },
            });
          const accessToken =
            'e30.' +
            Buffer.from(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 3600 })).toString(
              'base64',
            ) +
            '.test';
          await route.fulfill({
            json: {
              success: true,
              data: {
                accessToken,
                refreshToken: 'test-refresh',
                roles: [role],
                username: 'demo',
                userId: 1,
                fullName: 'Usuario Demo',
                email: 'demo@example.test',
              },
            },
          });
        });
        const base = `http://127.0.0.1:${server.address().port}`;
        await page.goto(base + '/auth/login');
        await page.getByRole('heading', { name: 'Bienvenido de nuevo', exact: true }).waitFor();
        const username = page.getByLabel('Usuario', { exact: true }),
          password = page.getByLabel('Contraseña', { exact: true }),
          submit = page.getByRole('button', { name: 'Iniciar sesión', exact: true });
        assert.equal(await submit.isDisabled(), true);
        assert.equal(await username.getAttribute('autocomplete'), 'username');
        assert.equal(await password.getAttribute('autocomplete'), 'current-password');
        await page.locator('form').evaluate((form) => form.requestSubmit());
        assert.equal(logins.length, 0, 'No envía credenciales vacías');
        if (role === 'ROLE_ADMIN') {
          await username.fill('   ');
          await password.fill('ClaveDemo123!');
          assert.equal(await submit.isDisabled(), true);
          await page.locator('form').evaluate((form) => form.requestSubmit());
          assert.equal(logins.length, 0);
          await username.fill('');
          await password.fill('');
          for (const dark of [false, true]) {
            if (dark)
              await page.getByRole('button', { name: 'Activar modo oscuro', exact: true }).click();
            assert.equal(
              await page.evaluate(() => localStorage.getItem('ticketdesk-theme')),
              dark ? 'dark' : null,
            );
            for (const [width, height] of [
              [1846, 964],
              [1366, 768],
              [1024, 768],
              [760, 844],
              [390, 844],
              [320, 640],
            ]) {
              await page.setViewportSize({ width, height });
              await page.waitForTimeout(150);
              assert.ok(
                await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
                'Sin desplazamiento horizontal a ' + width,
              );
              assert.equal(await username.isVisible(), true);
              assert.equal(await password.isVisible(), true);
              if (width <= 760)
                assert.equal(
                  await page.locator('.auth-story').isVisible(),
                  false,
                  'El formulario tiene prioridad en móvil',
                );
              if (width >= 1024)
                assert.ok(
                  await submit.evaluate(
                    (el) => el.getBoundingClientRect().bottom <= innerHeight + 1,
                  ),
                  'Botón de acceso dentro de la pantalla de escritorio',
                );
              await page.screenshot({
                path: path.join(os.tmpdir(), `login-${dark ? 'dark' : 'light'}-${width}.png`),
              });
            }
          }
          await page.reload();
          await page.getByRole('button', { name: 'Activar modo claro', exact: true }).waitFor();
          assert.equal(
            await page.evaluate(() => document.body.classList.contains('dark-theme')),
            true,
          );
          await page.getByRole('button', { name: 'Activar modo claro', exact: true }).click();
          assert.equal(
            await page.evaluate(() => localStorage.getItem('ticketdesk-theme')),
            'light',
          );
          await page.setViewportSize({ width: 1846, height: 964 });
          await username.fill('demo');
          await password.fill('ClaveDemo123!');
          await page.getByRole('button', { name: 'Mostrar contraseña', exact: true }).click();
          await page.waitForFunction(
            () => document.querySelector('#auth-password')?.type === 'text',
          );
          assert.equal(await password.inputValue(), 'ClaveDemo123!');
          await page.getByRole('button', { name: 'Ocultar contraseña', exact: true }).click();
          await page.waitForFunction(
            () => document.querySelector('#auth-password')?.type === 'password',
          );
          await submit.click();
          await page
            .getByRole('alert')
            .filter({ hasText: 'Usuario o contraseña incorrectos.' })
            .waitFor();
          assert.equal(await submit.isEnabled(), true);
          assert.equal(await page.evaluate(() => localStorage.getItem('user_session')), null);
          assert.deepEqual(logins.at(-1), { username: 'demo', password: 'ClaveDemo123!' });
          mode = 'unsuccessful';
          await submit.click();
          await page.getByRole('alert').filter({ hasText: 'No se pudo iniciar sesión.' }).waitFor();
          assert.equal(await password.inputValue(), 'ClaveDemo123!');
          mode = 'network';
          await submit.click();
          await page
            .getByRole('alert')
            .filter({ hasText: 'Usuario o contraseña incorrectos' })
            .waitFor();
          assert.equal(await submit.isEnabled(), true);
        } else {
          await username.fill('demo');
          await password.fill('ClaveDemo123!');
        }
        mode = 'hold';
        const before = logins.length;
        await submit.click();
        await page.getByRole('button', { name: 'Iniciando sesión…', exact: true }).waitFor();
        assert.equal(await username.isDisabled(), true);
        assert.equal(await password.isDisabled(), true);
        await page.locator('form').evaluate((form) => {
          form.requestSubmit();
          form.requestSubmit();
        });
        assert.equal(logins.length, before + 1, 'Solo envía una petición mientras carga');
        mode = 'success';
        hold();
        await page.waitForURL(base + destination);
        const session = await page.evaluate(() => JSON.parse(localStorage.getItem('user_session')));
        assert.deepEqual(session.roles, [role]);
        assert.deepEqual(errors, []);
        await context.close();
        console.log(role + ': acceso y redirección verificados');
      }
    } finally {
      await browser?.close();
      await new Promise((resolve) => server.close(resolve));
    }
  },
);
