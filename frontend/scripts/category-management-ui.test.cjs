// node --test scripts/category-management-ui.test.cjs (tras npm run build)
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
  'Categorías: filtros, CRUD, confirmación, errores, persistencia, modal y temas responsive',
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
        console.log('Checking Categorías/' + (dark ? 'dark' : 'light'));
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
        const names = [
          'Capacitaciones',
          'Sistema Datcorpv5',
          'Accesos & Seguridad',
          'Redes & Conectividad',
          'Software & Aplicaciones',
          'Hardware & Equipos',
        ];
        const categories = names.map((nombre, i) => ({
          id: i + 1,
          nombre,
          descripcion: [
            'Capacitaciones del Sistema u otros',
            'Sistema Datcorpv5',
            'Creación de cuentas, Reset de password y Permisos',
            'VPN, Wi-Fi, Router y Servidores',
            'Licencias, Correo y Herramientas',
            'Laptops, Monitores, Impresoras y Periféricos',
          ][i],
          activa: true,
        }));
        let failList = false,
          failSave = false;
        await page.route('**/api/v1/**', async (route) => {
          const req = route.request(),
            url = new URL(req.url());
          requests.push({ path: url.pathname, method: req.method(), query: url.search });
          let data = [];
          const failure = (message) =>
            route.fulfill({ status: 500, json: { success: false, message } });
          if (url.pathname === '/api/v1/categorias' && req.method() === 'GET') {
            if (failList) {
              failList = false;
              return failure('Directorio no disponible');
            }
            data = categories;
          } else if (url.pathname.startsWith('/api/v1/categorias') && req.method() !== 'GET') {
            mutations.push({
              path: url.pathname,
              method: req.method(),
              payload: req.postDataJSON(),
            });
            await new Promise((resolve) => setTimeout(resolve, 180));
            if (failSave) {
              failSave = false;
              return failure('No se pudo guardar la categoría de prueba');
            }
            if (req.method() === 'POST') {
              data = { ...req.postDataJSON(), id: 100 };
              categories.push(data);
            } else {
              const category = categories.find(
                (c) => c.id === Number(url.pathname.split('/').at(-1)),
              );
              if (req.method() === 'PUT') {
                Object.assign(category, req.postDataJSON());
                data = category;
              } else {
                category.activa = false;
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
        await page.goto(base + '/categorias');
        await page.waitForFunction(
          () => document.querySelectorAll('.category-table tbody tr').length === 6,
        );
        await page.evaluate((dark) => document.body.classList.toggle('dark-theme', dark), dark);
        for (const width of [1920, 1024, 390]) {
          await page.setViewportSize({ width, height: width === 390 ? 844 : 1080 });
          await page.waitForTimeout(300);
          await page.locator('.main-content').evaluate((el) => (el.scrollTop = 0));
          assert.ok(
            await page
              .locator('.category-workspace')
              .evaluate((el) => el.scrollWidth <= el.clientWidth + 1),
          );
          assert.ok(
            await page
              .locator('.category-filters')
              .evaluate((el) => el.scrollWidth <= el.clientWidth + 1),
          );
          if (width !== 1920)
            assert.ok(
              await page
                .locator('.category-table-scroll')
                .evaluate((el) => el.scrollWidth > el.clientWidth),
            );
          await page.screenshot({
            path: path.join(os.tmpdir(), `categories-${dark ? 'dark' : 'light'}-${width}.png`),
          });
          await page.getByRole('button', { name: 'Nueva categoría', exact: true }).click();
          await page.waitForFunction(() => document.querySelector('dialog')?.open);
          assert.equal(
            await page
              .locator('#category-editor-name')
              .evaluate((el) => document.activeElement === el),
            true,
          );
          const geometry = await page.locator('.category-editor').evaluate((el) => {
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
          const field = await page.locator('#category-editor-name').evaluate((el) => ({
            background: getComputedStyle(el).backgroundColor,
            border: getComputedStyle(el).borderTopColor,
          }));
          assert.notEqual(field.background, field.border);
          if (dark) assert.equal(field.background, 'rgb(19, 33, 56)');
          await page.screenshot({
            path: path.join(os.tmpdir(), `category-editor-${dark ? 'dark' : 'light'}-${width}.png`),
          });
          if (width === 390) {
            await page.setViewportSize({ width: 390, height: 480 });
            await page.waitForTimeout(100);
            assert.ok(
              await page
                .locator('.category-editor-body')
                .evaluate((el) => el.scrollHeight > el.clientHeight),
              'El cuerpo del formulario debe desplazarse en pantallas bajas',
            );
            assert.ok(
              await page
                .locator('.category-editor-actions')
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
        await page.getByLabel('Buscar categoría', { exact: true }).fill('conectividad');
        await page.waitForFunction(() =>
          document
            .querySelector('.category-results p')
            ?.textContent.includes('1 categoría encontrada'),
        );
        assert.equal(
          await page.locator('#category-search').evaluate((el) => document.activeElement === el),
          true,
        );
        await page.getByLabel('Estado', { exact: true }).selectOption('active');
        await page.reload();
        await page.waitForFunction(
          () => document.querySelector('#category-search')?.value === 'conectividad',
        );
        await page.getByRole('button', { name: 'Limpiar', exact: true }).click();
        await page.waitForFunction(() =>
          document
            .querySelector('.category-results p')
            ?.textContent.includes('6 categorías encontradas'),
        );

        await page.getByLabel('Buscar categoría', { exact: true }).fill('licencias');
        await page.waitForFunction(() =>
          document
            .querySelector('.category-results p')
            ?.textContent.includes('1 categoría encontrada'),
        );
        assert.match(
          await page.locator('.category-table tbody').innerText(),
          /Software & Aplicaciones/,
        );
        await page.getByRole('button', { name: 'Limpiar', exact: true }).click();
        await page.getByRole('button', { name: 'Nueva categoría', exact: true }).click();
        await page.getByRole('button', { name: 'Guardar categoría', exact: true }).click();
        await page.getByText('Ingresa el nombre de la categoría.', { exact: true }).waitFor();
        assert.equal(mutations.length, 0);
        await page.locator('#category-editor-name').fill('Nueva categoría de prueba');
        await page
          .locator('#category-editor-description-input')
          .fill('Descripción de la categoría');
        await page
          .getByRole('button', { name: 'Guardar categoría', exact: true })
          .click({ clickCount: 3 });
        await page.waitForFunction(() => !document.querySelector('dialog')?.open);
        await page.waitForFunction(() =>
          document
            .querySelector('.category-results p')
            ?.textContent.includes('7 categorías encontradas'),
        );
        assert.equal(mutations.filter((r) => r.method === 'POST').length, 1);
        await page
          .getByRole('button', { name: 'Editar categoría Nueva categoría de prueba', exact: true })
          .click();
        await page.waitForFunction(
          () =>
            document.querySelector('#category-editor-name')?.value === 'Nueva categoría de prueba',
        );
        assert.equal(
          await page.locator('#category-editor-description-input').inputValue(),
          'Descripción de la categoría',
        );
        await page.locator('#category-editor-name').fill('Categoría editada');
        failSave = true;
        await page.getByRole('button', { name: 'Guardar categoría', exact: true }).click();
        await page
          .getByRole('alert')
          .filter({ hasText: 'No se pudo guardar la categoría de prueba' })
          .waitFor();
        assert.equal(await page.locator('#category-editor-name').inputValue(), 'Categoría editada');
        await page.getByRole('button', { name: 'Guardar categoría', exact: true }).click();
        await page.waitForFunction(() => !document.querySelector('dialog')?.open);
        await page
          .getByRole('button', { name: 'Editar categoría Categoría editada', exact: true })
          .waitFor();
        await page
          .getByRole('button', { name: 'Eliminar categoría Categoría editada', exact: true })
          .click();
        await page.getByRole('button', { name: 'Cancelar', exact: true }).click();
        assert.equal(mutations.filter((r) => r.method === 'DELETE').length, 0);
        await page
          .getByRole('button', { name: 'Eliminar categoría Categoría editada', exact: true })
          .click();
        await page.getByRole('button', { name: 'Sí, desactivar', exact: true }).click();
        await page.waitForFunction(() =>
          Array.from(document.querySelectorAll('.category-status-pill')).some((el) =>
            el.textContent.includes('Inactiva'),
          ),
        );
        assert.equal(mutations.filter((r) => r.method === 'DELETE').length, 1);
        await page.locator('#category-status').selectOption('inactive');
        await page
          .getByRole('button', { name: 'Editar categoría Categoría editada', exact: true })
          .waitFor();
        assert.equal(
          await page
            .getByRole('button', { name: 'Eliminar categoría Categoría editada', exact: true })
            .isDisabled(),
          true,
        );
        await page.locator('#category-search').fill('no existe');
        await page
          .getByText('No encontramos categorías con estos filtros', { exact: true })
          .waitFor();
        await page.getByRole('button', { name: 'Limpiar filtros', exact: true }).click();

        categories.push(
          ...Array.from({ length: 13 }, (_, i) => ({
            id: 200 + i,
            nombre: 'Categoría adicional ' + i,
            activa: true,
          })),
        );
        await page.reload();
        await page.waitForFunction(() =>
          document
            .querySelector('.category-results p')
            ?.textContent.includes('20 categorías encontradas'),
        );
        await page.getByRole('button', { name: 'Página 3', exact: true }).click();
        await page.waitForFunction(() =>
          document.querySelector('.category-pagination p')?.textContent.includes('17–20'),
        );
        await page.reload();
        await page.waitForFunction(() =>
          document.querySelector('.category-pagination p')?.textContent.includes('17–20'),
        );
        await page.getByLabel('Filas', { exact: true }).selectOption({ label: '5' });
        await page.waitForFunction(() =>
          document.querySelector('.category-pagination p')?.textContent.includes('1–5'),
        );
        failList = true;
        await page.reload();
        await page
          .getByRole('alert')
          .filter({ hasText: 'No se pudo cargar el directorio' })
          .waitFor();
        assert.equal(
          await page.getByText('Todavía no hay categorías registradas', { exact: true }).count(),
          0,
        );
        await page.getByRole('button', { name: 'Reintentar', exact: true }).click();
        await page.waitForFunction(
          () =>
            document.querySelectorAll('.category-table tbody tr').length === 5 &&
            !document.querySelector('.category-load-error'),
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
