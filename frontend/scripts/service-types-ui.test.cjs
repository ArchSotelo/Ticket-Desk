// node --test scripts/service-types-ui.test.cjs (tras npm run build).
// API simulada: no crea, edita ni desactiva registros reales.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { launchBrowser } = require('./helpers/browser.cjs');
const { installPermissionSessionDefaults } = require('./helpers/permission-session.cjs');
test(
  'Tipos de servicio: ocho vistas, filtros, retorno a Ajustes, formularios y cambios de estado',
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
    let browser,
      layouts = 0;
    try {
      browser = await launchBrowser({ headless: true, channel: 'chrome' });
      for (const dark of [false, true]) {
        const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
        const page = await context.newPage(),
          errors = [],
          writes = [];
        let failList = false,
          failSave = false,
          failState = false;
        let data = [
          'Correo',
          'Dominio',
          'Internet Fibra Óptica',
          'Página Web',
          'Servidor',
          'Telefonía Móvil',
        ].map((nombre, i) => ({
          id: i + 1,
          nombre,
          descripcion: '',
          icono: ['mail', 'category', 'language', 'language', 'dns', 'miscellaneous_services'][i],
          activa: true,
        }));
        page.on('pageerror', (error) => errors.push(error.message));
        await page.addInitScript(installPermissionSessionDefaults);
        await page.addInitScript((dark) => {
          localStorage.setItem(
            'user_session',
            JSON.stringify({
              accessToken:
                'e30.' +
                btoa(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 3600 })) +
                '.test',
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
        await page.route('**/api/v1/**', async (route) => {
          const req = route.request(),
            url = new URL(req.url()),
            method = req.method();
          let result = [];
          if (method !== 'GET') {
            writes.push({
              method,
              path: url.pathname,
              query: url.search,
              payload: req.postDataJSON(),
            });
            await new Promise((resolve) => setTimeout(resolve, 150));
          }
          if (url.pathname === '/api/v1/service-categories') {
            if (method === 'GET') {
              if (failList) return route.fulfill({ status: 500, json: { success: false } });
              result = data;
            } else {
              assert.equal(method, 'POST');
              if (failSave)
                return route.fulfill({
                  status: 400,
                  json: { success: false, message: 'Nombre duplicado simulado' },
                });
              result = { id: 20, ...req.postDataJSON(), activa: true };
              data.push(result);
            }
          } else if (/\/service-categories\/\d+\/status$/.test(url.pathname)) {
            assert.equal(method, 'PATCH');
            if (failState)
              return route.fulfill({
                status: 500,
                json: { success: false, message: 'No se pudo cambiar el estado simulado' },
              });
            const id = Number(url.pathname.split('/').at(-2));
            result = data.find((item) => item.id === id);
            result.activa = url.searchParams.get('activa') === 'true';
          } else if (/\/service-categories\/\d+$/.test(url.pathname)) {
            assert.equal(method, 'PUT');
            const id = Number(url.pathname.split('/').at(-1));
            result = data.find((item) => item.id === id);
            assert.equal(req.postDataJSON().activa, undefined);
            Object.assign(result, req.postDataJSON());
          } else if (url.pathname.endsWith('/users/me'))
            result = {
              id: 1,
              nombres: 'Administrador',
              apellidos: 'Demo',
              roles: ['ROLE_ADMIN'],
              estado: 'ACTIVO',
            };
          else if (url.pathname.endsWith('/count')) result = { count: 0 };
          else if (url.pathname.endsWith('/settings')) result = { enabled: false };
          else assert.equal(method, 'GET');
          await route.fulfill({ json: { success: true, data: result } });
        });
        const origin = `http://127.0.0.1:${server.address().port}`;
        const cards = async (count) =>
          page.waitForFunction(
            (count) => document.querySelectorAll('.type-card').length === count,
            count,
          );
        await page.goto(origin + '/ajustes');
        await page
          .locator('.hub-nav')
          .getByRole('button', { name: 'Servicios', exact: true })
          .click();
        await page.getByRole('button', { name: 'Tipos de servicio', exact: true }).click();
        await cards(6);
        assert.equal(
          await page.locator('app-sidebar a[href="/ajustes"]').getAttribute('aria-current'),
          'page',
        );
        const back = page.getByRole('button', { name: 'Volver a ajustes', exact: true });
        assert.equal(await back.locator('mat-icon').innerText(), 'arrow_back');
        assert.equal(await back.innerText(), 'arrow_back');
        const dimensions = await back.boundingBox();
        assert.equal(dimensions.width, 40);
        assert.equal(dimensions.height, 40);
        assert.equal(
          await page
            .locator('.type-card .type-state')
            .allTextContents()
            .then((values) => values.join(',')),
          'Activo,Activo,Activo,Activo,Activo,Activo',
        );
        assert.equal(
          await page.locator('.type-card').last().locator('.type-icon mat-icon').innerText(),
          'miscellaneous_services',
        );
        for (const width of [1920, 1024, 390, 320]) {
          await page.setViewportSize({ width, height: width < 400 ? 844 : 1080 });
          await page.waitForTimeout(300);
          await page.locator('.main-content').evaluate((el) => (el.scrollTop = 0));
          for (const selector of [
            '.service-types-page',
            '.types-header',
            '.types-filters',
            '.types-grid',
            '.types-footer',
          ])
            assert.ok(
              await page.locator(selector).evaluate((el) => el.scrollWidth <= el.clientWidth + 1),
              selector + ' no desborda a ' + width,
            );
          assert.ok(
            await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
          );
          const columns = await page
            .locator('.types-grid')
            .evaluate((el) => getComputedStyle(el).gridTemplateColumns.split(' ').length);
          assert.equal(columns, width === 1920 ? 3 : width === 1024 ? 2 : 1);
          if (width === 1920) {
            assert.ok(
              await page.locator('.service-types-page').evaluate((el) => el.clientWidth > 1400),
            );
            assert.ok(
              await page
                .locator('.types-footer')
                .evaluate(
                  (el) =>
                    el.getBoundingClientRect().bottom <=
                    document.querySelector('.main-content').getBoundingClientRect().bottom + 1,
                ),
            );
          }
          await page.screenshot({
            path: path.join(os.tmpdir(), `service-types-${dark ? 'dark' : 'light'}-${width}.png`),
          });
          layouts++;
        }
        await page
          .getByLabel('Buscar por nombre o descripción', { exact: true })
          .fill('FIBRA optica');
        await cards(1);
        await page.getByLabel('Estado', { exact: true }).selectOption('inactive');
        await cards(0);
        await page
          .getByRole('heading', { name: 'No hay tipos con estos filtros', exact: true })
          .waitFor();
        await page.getByRole('button', { name: 'Limpiar filtros', exact: true }).click();
        await cards(6);
        assert.equal(writes.length, 0);
        await page.setViewportSize({ width: 1920, height: 1080 });
        await page.waitForTimeout(300);
        await page.getByRole('button', { name: 'Volver a ajustes', exact: true }).click();
        await page.waitForURL(origin + '/ajustes');
        assert.equal(
          await page
            .locator('.hub-nav')
            .getByRole('button', { name: 'Servicios', exact: true })
            .getAttribute('aria-pressed'),
          'true',
        );
        await page.getByRole('button', { name: 'Tipos de servicio', exact: true }).click();
        await cards(6);
        await page.getByRole('button', { name: 'Desactivar Correo', exact: true }).click();
        await page.getByRole('button', { name: 'Cancelar', exact: true }).click();
        assert.equal(writes.length, 0);
        await page.getByRole('button', { name: 'Desactivar Correo', exact: true }).click();
        await page.getByRole('button', { name: 'Sí, desactivar', exact: true }).click();
        await page
          .getByText('Tipo de servicio desactivado correctamente.', { exact: true })
          .waitFor();
        await page.getByLabel('Estado', { exact: true }).selectOption('inactive');
        await cards(1);
        assert.equal(await page.locator('.type-card h3').innerText(), 'Correo');
        failState = true;
        await page.getByRole('button', { name: 'Activar Correo', exact: true }).click();
        await page.getByRole('button', { name: 'Sí, activar', exact: true }).click();
        await page.getByText('No se pudo cambiar el estado simulado', { exact: true }).waitFor();
        assert.equal(await page.locator('.type-state').innerText(), 'Inactivo');
        failState = false;
        await page.getByRole('button', { name: 'Activar Correo', exact: true }).click();
        await page.getByRole('button', { name: 'Sí, activar', exact: true }).click();
        await cards(0);
        await page.getByRole('button', { name: 'Limpiar filtros', exact: true }).click();
        await cards(6);
        await page.getByRole('button', { name: 'Editar Correo', exact: true }).click();
        await page.locator('dialog[open]').waitFor();
        assert.equal(
          await page.getByLabel('Nombre del tipo *', { exact: true }).inputValue(),
          'Correo',
        );
        assert.equal(await page.getByLabel('Icono', { exact: true }).inputValue(), 'mail');
        await page
          .getByLabel('Descripción (opcional)', { exact: true })
          .fill('Mensajería empresarial');
        await page.getByLabel('Icono', { exact: true }).selectOption('cloud');
        await page.getByRole('button', { name: 'Guardar tipo', exact: true }).click();
        await page
          .getByText('Tipo de servicio actualizado correctamente.', { exact: true })
          .waitFor();
        await cards(6);
        await page
          .getByLabel('Buscar por nombre o descripción', { exact: true })
          .fill('mensajeria');
        await cards(1);
        assert.equal(await page.locator('.type-icon mat-icon').innerText(), 'cloud');
        await page.reload();
        await cards(1);
        assert.equal(
          await page.getByLabel('Buscar por nombre o descripción', { exact: true }).inputValue(),
          'mensajeria',
        );
        await page.getByRole('button', { name: 'Nuevo tipo', exact: true }).click();
        await page.locator('dialog[open]').waitFor();
        await page.getByRole('button', { name: 'Guardar tipo', exact: true }).click();
        await page.getByText('Ingresa el nombre del tipo de servicio.', { exact: true }).waitFor();
        await page.getByLabel('Nombre del tipo *', { exact: true }).fill('Hosting');
        await page.getByLabel('Icono', { exact: true }).selectOption('dns');
        failSave = true;
        await page.getByRole('button', { name: 'Guardar tipo', exact: true }).click();
        await page.getByText('Nombre duplicado simulado', { exact: true }).waitFor();
        assert.equal(
          await page.getByLabel('Nombre del tipo *', { exact: true }).inputValue(),
          'Hosting',
        );
        failSave = false;
        await page.getByRole('button', { name: 'Guardar tipo', exact: true }).click();
        await page.getByText('Tipo de servicio creado correctamente.', { exact: true }).waitFor();
        await cards(1);
        await page.getByRole('button', { name: 'Limpiar', exact: true }).click();
        await cards(7);
        await page.getByRole('button', { name: 'Nuevo tipo', exact: true }).click();
        await page.locator('dialog[open]').waitFor();
        await page.keyboard.press('Escape');
        assert.equal(await page.locator('dialog[open]').count(), 0);
        failList = true;
        await page.reload();
        await page
          .getByText('No se pudo cargar el catálogo de tipos de servicio.', { exact: true })
          .waitFor();
        assert.equal(await page.locator('.types-empty').count(), 0);
        assert.equal(await page.locator('.types-count').count(), 0);
        failList = false;
        await page.getByRole('button', { name: 'Reintentar', exact: true }).click();
        await cards(7);
        assert.equal(
          writes.some((req) => req.method === 'DELETE'),
          false,
        );
        assert.deepEqual(errors, []);
        await context.close();
      }
      console.log(
        'Verificadas ' +
          layouts +
          ' vistas y flujos de crear/editar/activar/desactivar con API simulada.',
      );
    } finally {
      await browser?.close();
      await new Promise((resolve) => server.close(resolve));
    }
  },
);
