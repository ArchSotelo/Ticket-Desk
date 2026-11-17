// node --test scripts/company-management-ui.test.cjs (tras npm run build)
// API simulada y servidor efímero: no accede a registros reales.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { launchBrowser } = require('./helpers/browser.cjs');
const { installPermissionSessionDefaults } = require('./helpers/permission-session.cjs');

test(
  'Empresas: listado, filtros, CRUD, modal, errores y ocho escenarios responsive',
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
      const base = `http://127.0.0.1:${server.address().port}`;
      let layouts = 0;
      for (const dark of [false, true]) {
        console.log('Checking Empresas/' + (dark ? 'dark' : 'light'));
        const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
        const page = await context.newPage(),
          errors = [],
          mutations = [];
        page.on('pageerror', (error) => errors.push(error.message));
        await page.addInitScript(installPermissionSessionDefaults);
        await page.addInitScript(() => {
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
          window.WebSocket = class {
            static OPEN = 1;
            static CONNECTING = 0;
            readyState = 0;
            close() {}
            addEventListener() {}
            removeEventListener() {}
          };
        });
        const companies = [
          {
            id: 1,
            razonSocial: 'EMPRESA DEMO S.A.C.',
            ruc: '20000000001',
            email: 'administrador@empresa.example.test',
            telefono: '',
            direccion: '',
            estado: true,
          },
        ];
        let failList = false,
          failSave = false;
        await page.route('**/api/v1/**', async (route) => {
          const req = route.request(),
            url = new URL(req.url());
          let data = [];
          if (url.pathname === '/api/v1/empresas' && req.method() === 'GET') {
            if (failList) {
              failList = false;
              return route.fulfill({
                status: 500,
                json: { success: false, message: 'Directorio no disponible' },
              });
            }
            data = companies;
          } else if (url.pathname.startsWith('/api/v1/empresas') && req.method() !== 'GET') {
            mutations.push({
              path: url.pathname,
              method: req.method(),
              payload: req.postDataJSON(),
            });
            await new Promise((resolve) => setTimeout(resolve, 200));
            if (failSave) {
              failSave = false;
              return route.fulfill({
                status: 409,
                json: { success: false, message: 'Ya existe una empresa con ese RUC' },
              });
            }
            if (req.method() === 'POST') {
              data = { ...req.postDataJSON(), id: 100 };
              companies.push(data);
            } else {
              const company = companies.find(
                (c) => c.id === Number(url.pathname.split('/').at(-1)),
              );
              if (req.method() === 'PUT') {
                Object.assign(company, req.postDataJSON());
                data = company;
              } else {
                company.estado = false;
                data = null;
              }
            }
          } else if (url.pathname.endsWith('/users/me'))
            data = {
              id: 1,
              nombres: 'Administrador',
              apellidos: 'Demo',
              roles: ['ROLE_ADMIN'],
              estado: 'ACTIVO',
            };
          else if (url.pathname.endsWith('/count')) data = { count: 0 };
          else if (url.pathname.endsWith('/settings')) data = { enabled: false };
          await route.fulfill({ json: { success: true, data } });
        });
        await page.goto(base + '/empresas');
        await page.waitForFunction(() =>
          document
            .querySelector('.company-results p')
            ?.textContent.includes('1 empresa encontrada'),
        );
        await page.evaluate((dark) => document.body.classList.toggle('dark-theme', dark), dark);
        for (const width of [1920, 1024, 390, 320]) {
          await page.setViewportSize({ width, height: width <= 390 ? 844 : 1080 });
          await page.waitForTimeout(300);
          await page.locator('.main-content').evaluate((el) => (el.scrollTop = 0));
          assert.ok(
            await page
              .locator('.company-workspace')
              .evaluate((el) => el.scrollWidth <= el.clientWidth + 1),
          );
          assert.ok(
            await page
              .locator('.company-filters')
              .evaluate((el) => el.scrollWidth <= el.clientWidth + 1),
          );
          if (width !== 1920)
            assert.ok(
              await page
                .locator('.company-table-scroll')
                .evaluate((el) => el.scrollWidth > el.clientWidth),
            );
          assert.equal(
            await page.getByRole('button', { name: 'Página anterior', exact: true }).isDisabled(),
            true,
          );
          assert.equal(
            await page.getByRole('button', { name: 'Página siguiente', exact: true }).isDisabled(),
            true,
          );
          await page.screenshot({
            path: path.join(os.tmpdir(), `companies-${dark ? 'dark' : 'light'}-${width}.png`),
          });
          await page.getByRole('button', { name: 'Nueva empresa', exact: true }).click();
          await page.waitForFunction(() => document.querySelector('dialog')?.open);
          assert.equal(
            await page
              .locator('#company-editor-name')
              .evaluate((el) => document.activeElement === el),
            true,
          );
          const geometry = await page.locator('.company-editor').evaluate((el) => {
            const r = el.getBoundingClientRect();
            return {
              top: r.top,
              bottom: r.bottom,
              height: innerHeight,
              overflow: el.scrollWidth > el.clientWidth + 1,
            };
          });
          assert.ok(
            geometry.top >= 0 && geometry.bottom <= geometry.height + 1 && !geometry.overflow,
            'Diálogo ajustado al viewport',
          );
          const field = await page.locator('#company-editor-name').evaluate((el) => ({
            background: getComputedStyle(el).backgroundColor,
            border: getComputedStyle(el).borderTopColor,
          }));
          assert.notEqual(field.background, field.border);
          assert.ok(
            await page
              .locator('.company-editor-body')
              .evaluate(
                (el) =>
                  el.querySelector('label[for="company-editor-name"]').getBoundingClientRect()
                    .top >= el.getBoundingClientRect().top,
              ),
            'La primera etiqueta debe ser visible al abrir',
          );
          if (dark) assert.equal(field.background, 'rgb(19, 33, 56)');
          const columns = await page
            .locator('.company-editor-body')
            .evaluate((el) => getComputedStyle(el).gridTemplateColumns.split(' ').length);
          assert.equal(columns, width <= 390 ? 1 : 2);
          await page.screenshot({
            path: path.join(os.tmpdir(), `company-editor-${dark ? 'dark' : 'light'}-${width}.png`),
          });
          const stateSwitch = page.getByRole('switch', { name: 'Empresa activa', exact: true });
          assert.equal(await stateSwitch.isChecked(), true);
          await stateSwitch.focus();
          await page.keyboard.press('Space');
          await page.waitForFunction(() => !!document.querySelector('.company-active-off'));
          assert.equal(await stateSwitch.isChecked(), false);
          assert.equal(
            await page.locator('#company-active-hint').innerText(),
            'Deshabilitada en el sistema.',
          );
          await page.keyboard.press('Space');
          assert.equal(await stateSwitch.isChecked(), true);
          if (width <= 390) {
            await page.setViewportSize({ width, height: 480 });
            await page.waitForTimeout(100);
            assert.ok(
              await page
                .locator('.company-editor-body')
                .evaluate((el) => el.scrollHeight > el.clientHeight),
              'El cuerpo se desplaza en pantallas bajas',
            );
            assert.ok(
              await page
                .locator('.company-editor-actions')
                .evaluate(
                  (el) =>
                    el.getBoundingClientRect().bottom <= innerHeight &&
                    el.scrollWidth <= el.clientWidth + 1,
                ),
              'Acciones visibles y sin desbordamiento',
            );
            await page.setViewportSize({ width, height: 844 });
          }
          await page.keyboard.press('Escape');
          await page.waitForFunction(() => !document.querySelector('dialog')?.open);
          layouts++;
        }
        await page.setViewportSize({ width: 1920, height: 1080 });
        await page.waitForTimeout(300);
        for (const search of [
          'empresa demo',
          '20000000001',
          'ADMINISTRADOR@EMPRESA.EXAMPLE.TEST',
        ]) {
          await page.getByLabel('Buscar empresa', { exact: true }).fill(search);
          await page.waitForFunction(() =>
            document
              .querySelector('.company-results p')
              ?.textContent.includes('1 empresa encontrada'),
          );
          assert.match(await page.locator('.company-table tbody').innerText(), /EMPRESA DEMO/);
        }
        await page.getByLabel('Estado', { exact: true }).selectOption('active');
        await page.reload();
        await page.waitForFunction(
          () =>
            document.querySelector('#company-search')?.value ===
            'ADMINISTRADOR@EMPRESA.EXAMPLE.TEST',
        );
        assert.equal(await page.locator('#company-status').inputValue(), 'active');
        await page.getByRole('button', { name: 'Limpiar', exact: true }).click();
        await page.getByRole('button', { name: 'Nueva empresa', exact: true }).click();
        await page.getByRole('button', { name: 'Guardar empresa', exact: true }).click();
        await page.getByText('Ingresa la razón social.', { exact: true }).waitFor();
        await page.getByText('Ingresa el RUC.', { exact: true }).waitFor();
        assert.equal(mutations.length, 0);
        await page.locator('#company-editor-name').fill(' Nueva empresa de prueba ');
        await page.locator('#company-editor-ruc').fill(' ABC-2026 ');
        await page.locator('#company-editor-email').fill('correo-invalido');
        await page.getByRole('button', { name: 'Guardar empresa', exact: true }).click();
        await page.getByText('Ingresa un correo electrónico válido.', { exact: true }).waitFor();
        assert.equal(mutations.length, 0);
        await page.locator('#company-editor-email').fill(' info@example.test ');
        await page.locator('#company-editor-phone').fill('+51 900 000 003');
        await page.locator('#company-editor-address').fill('Dirección de prueba');
        await page
          .getByRole('button', { name: 'Guardar empresa', exact: true })
          .click({ clickCount: 3 });
        await page.waitForFunction(() => !document.querySelector('dialog')?.open);
        await page.waitForFunction(() =>
          document
            .querySelector('.company-results p')
            ?.textContent.includes('2 empresas encontradas'),
        );
        assert.equal(mutations.filter((r) => r.method === 'POST').length, 1);
        assert.equal(companies.at(-1).ruc, 'ABC-2026');
        assert.equal(companies.at(-1).razonSocial, 'Nueva empresa de prueba');
        await page
          .getByRole('button', { name: 'Editar empresa Nueva empresa de prueba', exact: true })
          .click();
        assert.equal(await page.locator('#company-editor-email').inputValue(), 'info@example.test');
        assert.equal(await page.locator('#company-editor-phone').inputValue(), '+51 900 000 003');
        assert.equal(
          await page.locator('#company-editor-address').inputValue(),
          'Dirección de prueba',
        );
        await page.locator('#company-editor-name').fill('Empresa editada');
        failSave = true;
        await page.getByRole('button', { name: 'Guardar empresa', exact: true }).click();
        await page
          .getByRole('alert')
          .filter({ hasText: 'Ya existe una empresa con ese RUC' })
          .waitFor();
        assert.equal(await page.locator('#company-editor-name').inputValue(), 'Empresa editada');
        await page.getByRole('button', { name: 'Guardar empresa', exact: true }).click();
        await page.waitForFunction(() => !document.querySelector('dialog')?.open);
        await page
          .getByRole('button', { name: 'Eliminar empresa Empresa editada', exact: true })
          .click();
        await page.getByRole('button', { name: 'Cancelar', exact: true }).click();
        assert.equal(mutations.filter((r) => r.method === 'DELETE').length, 0);
        await page
          .getByRole('button', { name: 'Eliminar empresa Empresa editada', exact: true })
          .click();
        await page.getByRole('button', { name: 'Sí, desactivar', exact: true }).click();
        await page.waitForFunction(() =>
          Array.from(document.querySelectorAll('.company-status-pill')).some((el) =>
            el.textContent.includes('Inactiva'),
          ),
        );
        assert.equal(mutations.filter((r) => r.method === 'DELETE').length, 1);
        await page.locator('#company-status').selectOption('inactive');
        await page
          .getByRole('button', { name: 'Editar empresa Empresa editada', exact: true })
          .waitFor();
        assert.equal(
          await page
            .getByRole('button', { name: 'Eliminar empresa Empresa editada', exact: true })
            .isDisabled(),
          true,
        );
        await page
          .getByRole('button', { name: 'Editar empresa Empresa editada', exact: true })
          .click();
        assert.equal(
          await page.getByRole('switch', { name: 'Empresa activa', exact: true }).isChecked(),
          false,
        );
        await page.getByRole('switch', { name: 'Empresa activa', exact: true }).check();
        await page.getByRole('button', { name: 'Guardar empresa', exact: true }).click();
        await page.waitForFunction(() => !document.querySelector('dialog')?.open);
        await page
          .getByText('No encontramos empresas con estos filtros', { exact: true })
          .waitFor();
        await page.getByRole('button', { name: 'Limpiar filtros', exact: true }).click();
        await page.locator('#company-search').fill('no existe');
        await page
          .getByText('No encontramos empresas con estos filtros', { exact: true })
          .waitFor();
        await page.getByRole('button', { name: 'Limpiar filtros', exact: true }).click();
        companies.push(
          ...Array.from({ length: 19 }, (_, i) => ({
            id: 200 + i,
            razonSocial: 'Empresa adicional ' + i,
            ruc: String(20000000200 + i),
            estado: true,
          })),
        );
        await page.reload();
        await page.waitForFunction(() =>
          document
            .querySelector('.company-results p')
            ?.textContent.includes('21 empresas encontradas'),
        );
        await page.getByRole('button', { name: 'Página 3', exact: true }).click();
        await page.waitForFunction(() =>
          document.querySelector('.company-pagination p')?.textContent.includes('17–21'),
        );
        await page.reload();
        await page.waitForFunction(() =>
          document.querySelector('.company-pagination p')?.textContent.includes('17–21'),
        );
        await page.getByLabel('Filas', { exact: true }).selectOption({ label: '5' });
        await page.waitForFunction(() =>
          document.querySelector('.company-pagination p')?.textContent.includes('1–5'),
        );
        failList = true;
        await page.reload();
        await page
          .getByRole('alert')
          .filter({ hasText: 'No se pudo cargar el directorio' })
          .waitFor();
        assert.equal(
          await page.getByText('Todavía no hay empresas registradas', { exact: true }).count(),
          0,
        );
        await page.getByRole('button', { name: 'Reintentar', exact: true }).click();
        await page.waitForFunction(
          () =>
            document.querySelectorAll('.company-table tbody tr').length === 5 &&
            !document.querySelector('.company-load-error'),
        );
        assert.deepEqual(errors, []);
        await context.close();
      }
      console.log(
        'Verificados ' + layouts + ' escenarios de tema/resolución con CRUD y API simulada.',
      );
    } finally {
      await browser?.close();
      await new Promise((resolve) => server.close(resolve));
    }
  },
);
