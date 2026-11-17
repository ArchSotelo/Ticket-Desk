// node --test scripts/area-management-ui.test.cjs (tras npm run build)
// Servidor efímero y API simulada: no accede a registros reales.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { launchBrowser } = require('./helpers/browser.cjs');
const { installPermissionSessionDefaults } = require('./helpers/permission-session.cjs');

test(
  'Áreas: filtros, CRUD, confirmación, errores, persistencia, modal y temas responsive',
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
        console.log('Checking Áreas/' + (dark ? 'dark' : 'light'));
        const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
        const page = await context.newPage(),
          errors = [],
          requests = [],
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
          { id: 1, razonSocial: 'EMPRESA DEMO S.A.C.', estado: true },
          { id: 2, razonSocial: 'Corporación Demo S.A.C.', estado: false },
        ];
        const names = [
          'Sistemas',
          'Finanzas',
          'Servicio técnico',
          'Operaciones',
          'Compras',
          'Ventas',
          'Administración',
        ];
        const areas = names.map((nombre, i) => ({
          id: i + 1,
          nombre,
          empresaId: 1,
          empresaNombre: companies[0].razonSocial,
          descripcion: '',
          activo: true,
        }));
        let failList = false,
          failCompanies = false,
          failSave = false;
        await page.route('**/api/v1/**', async (route) => {
          const req = route.request(),
            url = new URL(req.url());
          requests.push({ path: url.pathname, method: req.method(), query: url.search });
          let data = [];
          const failure = (message) =>
            route.fulfill({ status: 500, json: { success: false, message } });
          if (url.pathname === '/api/v1/empresas') {
            if (failCompanies) {
              failCompanies = false;
              return failure('Catálogo no disponible');
            }
            data = companies;
          } else if (url.pathname === '/api/v1/areas' && req.method() === 'GET') {
            assert.equal(
              url.search,
              '',
              'El listado no debe perder áreas inactivas usando empresaId en la API',
            );
            if (failList) {
              failList = false;
              return failure('Directorio no disponible');
            }
            data = areas;
          } else if (url.pathname.startsWith('/api/v1/areas') && req.method() !== 'GET') {
            mutations.push({
              path: url.pathname,
              method: req.method(),
              payload: req.postDataJSON(),
            });
            await new Promise((resolve) => setTimeout(resolve, 180));
            if (failSave) {
              failSave = false;
              return failure('No se pudo guardar el área de prueba');
            }
            if (req.method() === 'POST') {
              data = {
                ...req.postDataJSON(),
                id: 100,
                empresaNombre: companies.find((c) => c.id === req.postDataJSON().empresaId)
                  .razonSocial,
              };
              areas.push(data);
            } else {
              const area = areas.find((a) => a.id === Number(url.pathname.split('/').at(-1)));
              if (req.method() === 'PUT') {
                Object.assign(area, req.postDataJSON());
                area.empresaNombre = companies.find((c) => c.id === area.empresaId).razonSocial;
                data = area;
              } else {
                area.activo = false;
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
        await page.goto(base + '/areas');
        await page.waitForFunction(
          () => document.querySelectorAll('.area-table tbody tr').length === 7,
        );
        await page.evaluate((dark) => document.body.classList.toggle('dark-theme', dark), dark);
        for (const width of [1920, 1024, 390]) {
          await page.setViewportSize({ width, height: width === 390 ? 844 : 1080 });
          await page.waitForTimeout(300);
          await page.locator('.main-content').evaluate((el) => (el.scrollTop = 0));
          assert.ok(
            await page
              .locator('.area-workspace')
              .evaluate((el) => el.scrollWidth <= el.clientWidth + 1),
          );
          assert.ok(
            await page
              .locator('.area-filters')
              .evaluate((el) => el.scrollWidth <= el.clientWidth + 1),
          );
          if (width !== 1920)
            assert.ok(
              await page
                .locator('.area-table-scroll')
                .evaluate((el) => el.scrollWidth > el.clientWidth),
            );
          await page.screenshot({
            path: path.join(os.tmpdir(), `areas-${dark ? 'dark' : 'light'}-${width}.png`),
          });
          await page.getByRole('button', { name: 'Nueva área', exact: true }).click();
          await page.waitForFunction(() => document.querySelector('dialog')?.open);
          assert.equal(
            await page
              .locator('#area-editor-company')
              .evaluate((el) => document.activeElement === el),
            true,
          );
          const geometry = await page.locator('.area-editor').evaluate((el) => {
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
          const field = await page.locator('#area-editor-name').evaluate((el) => ({
            background: getComputedStyle(el).backgroundColor,
            border: getComputedStyle(el).borderTopColor,
          }));
          assert.notEqual(field.background, field.border);
          if (dark) assert.equal(field.background, 'rgb(19, 33, 56)');
          await page.screenshot({
            path: path.join(os.tmpdir(), `area-editor-${dark ? 'dark' : 'light'}-${width}.png`),
          });
          if (width === 390) {
            await page.setViewportSize({ width: 390, height: 480 });
            await page.waitForTimeout(100);
            assert.ok(
              await page
                .locator('.area-editor-body')
                .evaluate((el) => el.scrollHeight > el.clientHeight),
              'El cuerpo del formulario debe desplazarse en pantallas bajas',
            );
            assert.ok(
              await page
                .locator('.area-editor-actions')
                .evaluate((el) => el.getBoundingClientRect().bottom <= innerHeight),
              'Los botones deben permanecer dentro de la pantalla',
            );
            await page.setViewportSize({ width: 390, height: 844 });
          }
          await page.keyboard.press('Escape');
          await page.waitForFunction(() => !document.querySelector('dialog')?.open);
          layouts++;
        }
        await page.setViewportSize({ width: 1920, height: 1080 });
        await page.waitForTimeout(300);
        await page.getByLabel('Buscar área', { exact: true }).fill('administracion');
        await page.waitForFunction(() =>
          document.querySelector('.area-results p')?.textContent.includes('1 área encontrada'),
        );
        assert.equal(
          await page.locator('#area-search').evaluate((el) => document.activeElement === el),
          true,
        );
        await page.getByLabel('Empresa', { exact: true }).first().selectOption('1');
        await page.getByLabel('Estado', { exact: true }).selectOption('active');
        await page.reload();
        await page.waitForFunction(
          () => document.querySelector('#area-search')?.value === 'administracion',
        );
        assert.equal(await page.locator('#area-company').inputValue(), '1');
        await page.getByRole('button', { name: 'Limpiar', exact: true }).click();
        await page.waitForFunction(() =>
          document.querySelector('.area-results p')?.textContent.includes('7 áreas encontradas'),
        );

        await page.getByRole('button', { name: 'Nueva área', exact: true }).click();
        await page.getByRole('button', { name: 'Guardar área', exact: true }).click();
        await page.getByText('Selecciona una empresa.', { exact: true }).waitFor();
        await page.getByText('Ingresa el nombre del área.', { exact: true }).waitFor();
        assert.equal(mutations.length, 0);
        await page
          .locator('#area-editor-company')
          .selectOption({ label: companies[1].razonSocial + ' (Inactiva)' });
        await page.locator('#area-editor-name').fill('Nueva área de prueba');
        await page.locator('#area-editor-description-input').fill('Descripción del área');
        await page
          .getByRole('button', { name: 'Guardar área', exact: true })
          .click({ clickCount: 3 });
        await page.waitForFunction(() => !document.querySelector('dialog')?.open);
        await page.waitForFunction(() =>
          document.querySelector('.area-results p')?.textContent.includes('8 áreas encontradas'),
        );
        assert.equal(mutations.filter((r) => r.method === 'POST').length, 1);
        assert.equal(areas.at(-1).empresaId, 2);
        await page.locator('#area-company').selectOption('2');
        await page
          .getByRole('button', { name: 'Editar área Nueva área de prueba', exact: true })
          .click();
        await page.waitForFunction(
          () => document.querySelector('#area-editor-name')?.value === 'Nueva área de prueba',
        );
        assert.equal(
          await page.locator('#area-editor-description-input').inputValue(),
          'Descripción del área',
        );
        await page.locator('#area-editor-name').fill('Área editada');
        failSave = true;
        await page.getByRole('button', { name: 'Guardar área', exact: true }).click();
        await page
          .getByRole('alert')
          .filter({ hasText: 'No se pudo guardar el área de prueba' })
          .waitFor();
        assert.equal(await page.locator('#area-editor-name').inputValue(), 'Área editada');
        await page.getByRole('button', { name: 'Guardar área', exact: true }).click();
        await page.waitForFunction(() => !document.querySelector('dialog')?.open);
        await page.getByRole('button', { name: 'Editar área Área editada', exact: true }).waitFor();
        assert.equal(await page.locator('#area-company').inputValue(), '2');
        await page.getByRole('button', { name: 'Eliminar área Área editada', exact: true }).click();
        await page.getByRole('button', { name: 'Cancelar', exact: true }).click();
        assert.equal(mutations.filter((r) => r.method === 'DELETE').length, 0);
        await page.getByRole('button', { name: 'Eliminar área Área editada', exact: true }).click();
        await page.getByRole('button', { name: 'Sí, desactivar', exact: true }).click();
        await page.waitForFunction(() =>
          document.querySelector('.area-table .area-status-pill')?.textContent.includes('Inactiva'),
        );
        assert.equal(mutations.filter((r) => r.method === 'DELETE').length, 1);
        await page.locator('#area-status').selectOption('inactive');
        await page.getByRole('button', { name: 'Editar área Área editada', exact: true }).waitFor();
        assert.equal(
          await page
            .getByRole('button', { name: 'Eliminar área Área editada', exact: true })
            .isDisabled(),
          true,
        );
        await page.locator('#area-search').fill('no existe');
        await page.getByText('No encontramos áreas con estos filtros', { exact: true }).waitFor();
        await page.getByRole('button', { name: 'Limpiar filtros', exact: true }).click();

        areas.push(
          ...Array.from({ length: 13 }, (_, i) => ({
            id: 200 + i,
            nombre: 'Área adicional ' + i,
            empresaId: 1,
            empresaNombre: companies[0].razonSocial,
            activo: true,
          })),
        );
        await page.reload();
        await page.waitForFunction(() =>
          document.querySelector('.area-results p')?.textContent.includes('21 áreas encontradas'),
        );
        await page.getByRole('button', { name: 'Página 3', exact: true }).click();
        await page.waitForFunction(() =>
          document.querySelector('.area-pagination p')?.textContent.includes('17–21'),
        );
        await page.reload();
        await page.waitForFunction(() =>
          document.querySelector('.area-pagination p')?.textContent.includes('17–21'),
        );
        await page.getByLabel('Filas', { exact: true }).selectOption({ label: '5' });
        await page.waitForFunction(() =>
          document.querySelector('.area-pagination p')?.textContent.includes('1–5'),
        );
        failList = true;
        await page.reload();
        await page
          .getByRole('alert')
          .filter({ hasText: 'No se pudo cargar el directorio' })
          .waitFor();
        assert.equal(
          await page.getByText('Todavía no hay áreas registradas', { exact: true }).count(),
          0,
        );
        await page.getByRole('button', { name: 'Reintentar áreas', exact: true }).click();
        await page.waitForFunction(
          () =>
            document.querySelectorAll('.area-table tbody tr').length === 5 &&
            !document.querySelector('.area-load-error'),
        );
        failCompanies = true;
        await page.reload();
        await page.getByRole('alert').filter({ hasText: 'catálogo de empresas' }).waitFor();
        await page.getByRole('button', { name: 'Nueva área', exact: true }).click();
        assert.equal(
          await page.getByRole('button', { name: 'Guardar área', exact: true }).isDisabled(),
          true,
        );
        await page.getByRole('button', { name: 'Reintentar empresas', exact: true }).last().click();
        await page.waitForFunction(
          () => !document.querySelector('.area-editor button[type="submit"]')?.disabled,
        );
        await page.keyboard.press('Escape');
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
