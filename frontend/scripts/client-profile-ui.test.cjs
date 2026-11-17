// Ejecutar tras compilar: node --test scripts/client-profile-ui.test.cjs
// Navegador Chrome local y API simulada, sin modificar cuentas reales.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { launchBrowser } = require('./helpers/browser.cjs');
const { installPermissionSessionDefaults } = require('./helpers/permission-session.cjs');

test(
  'perfiles de cliente, técnico y administrador: temas, responsive, validación, guardar, restaurar y errores',
  { timeout: 300000 },
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
      const base = `http://127.0.0.1:${server.address().port}`;
      let combinations = 0;
      for (const portal of [
        {
          name: 'client',
          path: '/cliente/perfil',
          role: 'ROLE_CLIENTE',
          title: 'Mi perfil',
          roleLabel: 'Cliente',
        },
        {
          name: 'technician',
          path: '/tecnico/perfil',
          role: 'ROLE_TECNICO',
          title: 'Perfil del técnico',
          roleLabel: 'Técnico',
        },
        {
          name: 'admin',
          path: '/perfil',
          role: 'ROLE_ADMIN',
          title: 'Perfil del administrador',
          roleLabel: 'Administrador',
        },
      ]) {
        for (const dark of [false, true]) {
          const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
          const page = await context.newPage();
          const errors = [],
            writes = [];
          page.on('pageerror', (error) => errors.push(error.message));
          await page.addInitScript(installPermissionSessionDefaults);
          await page.addInitScript((role) => {
            const accessToken =
              'e30.' +
              btoa(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 3600 })) +
              '.test';
            localStorage.setItem(
              'user_session',
              JSON.stringify({ accessToken, roles: [role], userId: 8, fullName: 'Ana Torres' }),
            );
            window.WebSocket = class {
              static OPEN = 1;
              readyState = 0;
              close() {}
              addEventListener() {}
              removeEventListener() {}
            };
          }, portal.role);
          let profile = {
            id: 8,
            nombres: 'Ana',
            apellidos: 'Torres',
            email: 'ana.torres@example.test',
            telefono: '+51 900 000 001',
            cargo: 'Analista de RRHH',
            empresaNombre: 'Corporación Demo S.A.C.',
            areaNombre: 'Recursos Humanos',
            estado: 'ACTIVO',
            roles: [portal.role],
          };
          let failLoad = false,
            failSave = false,
            saveDelay = 0;
          await page.route('**/api/v1/**', async (route) => {
            const url = new URL(route.request().url());
            let data = [];
            if (url.pathname.endsWith('/users/me')) {
              if (route.request().method() === 'PUT') {
                const payload = route.request().postDataJSON();
                writes.push(payload);
                if (saveDelay) await new Promise((resolve) => setTimeout(resolve, saveDelay));
                if (failSave) {
                  await route.fulfill({
                    status: 500,
                    json: { message: 'No se pudo guardar el perfil de prueba.' },
                  });
                  return;
                }
                profile = { ...profile, ...payload };
                data = profile;
              } else {
                if (failLoad) {
                  await route.fulfill({
                    status: 500,
                    json: { message: 'No se pudo cargar el perfil de prueba.' },
                  });
                  return;
                }
                data = profile;
              }
            } else if (url.pathname.endsWith('/count')) data = { count: 0 };
            else if (url.pathname.endsWith('/settings')) data = { enabled: false };
            await route.fulfill({ json: { success: true, data } });
          });
          await page.goto(base + portal.path);
          await page.locator('#profile-nombres').waitFor();
          await page.evaluate((dark) => document.body.classList.toggle('dark-theme', dark), dark);
          assert.equal(await page.getByLabel('Nombres', { exact: false }).inputValue(), 'Ana');
          assert.equal(await page.locator('.profile-status.is-active').count(), 1);
          assert.ok(
            await page.getByRole('heading', { name: portal.title, exact: true }).isVisible(),
          );
          assert.equal(
            await page.locator('.profile-roles').count(),
            portal.name === 'client' ? 0 : 1,
          );
          if (portal.name !== 'client') {
            assert.equal(await page.locator('.profile-roles span').innerText(), portal.roleLabel);
            assert.equal(await page.locator('.profile-meta-row').count(), 3);
          }
          assert.equal(await page.locator('.profile-organization input').count(), 0);
          for (const width of [1920, 1024, 390]) {
            await page.setViewportSize({ width, height: width === 390 ? 844 : 1080 });
            await page.waitForTimeout(150);
            assert.ok(
              await page
                .locator('.profile-workspace')
                .evaluate((el) => el.scrollWidth <= el.clientWidth + 1),
              `${dark}/${width}: contenido desbordado`,
            );
            const horizontal = await page.locator('.profile-grid').evaluate((el) => {
              const identity = el.querySelector('.profile-identity').getBoundingClientRect(),
                editor = el.querySelector('.profile-editor').getBoundingClientRect();
              return editor.x > identity.x + 10 && Math.abs(editor.y - identity.y) < 1;
            });
            assert.equal(horizontal, width === 1920);
            if (width === 390) {
              const first = await page.locator('#profile-nombres').boundingBox(),
                second = await page.locator('#profile-apellidos').boundingBox();
              assert.ok(second.y > first.y + first.height);
            }
            const appearance = await page.locator('#profile-nombres').evaluate((el) => {
              const css = getComputedStyle(el);
              return { bg: css.backgroundColor, text: css.color, border: css.borderTopColor };
            });
            assert.equal(appearance.bg, dark ? 'rgb(17, 29, 51)' : 'rgb(255, 255, 255)');
            assert.notEqual(appearance.text, appearance.bg);
            assert.notEqual(appearance.border, appearance.bg);
            await page.screenshot({
              path: path.join(
                os.tmpdir(),
                `${portal.name}-profile-${dark ? 'dark' : 'light'}-${width}.png`,
              ),
            });
            await page
              .getByRole('button', { name: 'Guardar cambios', exact: true })
              .scrollIntoViewIfNeeded();
            await page.screenshot({
              path: path.join(
                os.tmpdir(),
                `${portal.name}-profile-footer-${dark ? 'dark' : 'light'}-${width}.png`,
              ),
            });
            combinations++;
          }
          await page.setViewportSize({ width: 1920, height: 1080 });
          await page.locator('#profile-nombres').fill('');
          await page.locator('#profile-email').fill('correo-incorrecto');
          await page.getByRole('button', { name: 'Guardar cambios', exact: true }).click();
          await page.locator('#nombres-error').waitFor();
          await page.locator('#email-error').waitFor();
          assert.equal(writes.length, 0);
          assert.equal(await page.locator('#profile-email').getAttribute('aria-invalid'), 'true');
          await page.getByRole('button', { name: 'Restaurar', exact: true }).click();
          await page.waitForFunction(
            () => document.querySelector('#profile-nombres')?.value === 'Ana',
          );
          assert.equal(
            await page.locator('#profile-email').inputValue(),
            'ana.torres@example.test',
          );
          assert.equal(await page.locator('.profile-field-error').count(), 0);
          await page.locator('#profile-nombres').fill('Ana María');
          await page.locator('#profile-telefono').fill('+51 900 000 002');
          saveDelay = 500;
          await page.getByRole('button', { name: 'Guardar cambios', exact: true }).click();
          assert.equal(
            await page.getByRole('button', { name: 'Guardando...', exact: true }).isDisabled(),
            true,
          );
          assert.equal(await page.locator('#profile-nombres').isDisabled(), true);
          assert.equal(
            await page.getByRole('button', { name: 'Restaurar', exact: true }).isDisabled(),
            true,
          );
          await page.locator('.profile-feedback-success').waitFor();
          assert.equal(writes.length, 1);
          assert.equal(Object.hasOwn(writes[0], 'avatarUrl'), false);
          assert.equal(writes[0].telefono, '+51 900 000 002');
          assert.match(await page.locator('.profile-person h2').innerText(), /Ana María Torres/);
          assert.equal(
            await page.evaluate(() => JSON.parse(localStorage.getItem('user_session')).fullName),
            'Ana María Torres',
          );
          saveDelay = 0;
          failSave = true;
          await page.locator('#profile-cargo').fill('Nuevo cargo');
          await page.getByRole('button', { name: 'Guardar cambios', exact: true }).click();
          await page.locator('.profile-feedback-error').waitFor();
          assert.equal(await page.locator('#profile-cargo').inputValue(), 'Nuevo cargo');
          assert.equal(
            await page.getByRole('button', { name: 'Guardar cambios', exact: true }).isDisabled(),
            false,
          );
          failSave = false;
          await page.getByRole('button', { name: 'Guardar cambios', exact: true }).click();
          await page.locator('.profile-feedback-success').waitFor();
          failLoad = true;
          await page.reload();
          await page.getByRole('button', { name: 'Reintentar', exact: true }).waitFor();
          assert.equal(await page.locator('.profile-grid').count(), 0);
          failLoad = false;
          await page.getByRole('button', { name: 'Reintentar', exact: true }).click();
          await page.locator('#profile-nombres').waitFor();
          profile = { ...profile, estado: 'INACTIVO' };
          await page.getByRole('button', { name: 'Restaurar', exact: true }).click();
          await page.waitForFunction(
            () => document.querySelector('.profile-status')?.textContent.trim() === 'INACTIVO',
          );
          assert.equal(await page.locator('.profile-status.is-active').count(), 0);
          assert.deepEqual(errors, []);
          await context.close();
        }
      }
      console.log(
        `${combinations} combinaciones de tema/resolución; validación, guardado, restauración, estado y errores verificados.`,
      );
    } finally {
      if (browser) await browser.close();
      await new Promise((resolve) => server.close(resolve));
    }
  },
);
