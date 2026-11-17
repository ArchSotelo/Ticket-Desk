// node --test scripts/subcategory-management-ui.test.cjs (tras npm run build)
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
  'Subcategorías: filtros, CRUD, confirmación, errores, persistencia, modal y temas responsive',
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
        console.log('Checking Subcategorías/' + (dark ? 'dark' : 'light'));
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
        const categories = [
          { id: 1, nombre: 'Software & Aplicaciones', activa: true },
          { id: 2, nombre: 'Sistema Datcorpv5', activa: false },
          { id: 3, nombre: 'Capacitaciones', activa: true },
          { id: 4, nombre: 'Accesos & Seguridad', activa: true },
          { id: 5, nombre: 'Redes & Conectividad', activa: true },
        ];
        const names = [
          'Querys',
          'Regularizacion de Saldos de Almacen',
          'Cambio de codigo de requerimientos',
          'Otras Capacitaciones',
          'Sistema Datcorpv5',
          'Creacion de articulos',
          'Restablecimiento de Contraseña',
          'Falla de VPN',
          'Subcategoría de prueba 9',
          'Subcategoría de prueba 10',
          'Subcategoría de prueba 11',
          'Subcategoría de prueba 12',
        ];
        const subcategories = names.map((nombre, i) => {
          const categoriaId = [1, 2, 2, 3, 3, 2, 4, 5, 1, 3, 4, 5][i];
          return {
            id: i + 1,
            nombre,
            categoriaId,
            categoriaNombre: categories.find((c) => c.id === categoriaId).nombre,
            descripcion:
              [
                'Consultas dinámicas a la BD',
                '',
                'Cambio de código de artículos en los requerimientos',
                '',
                '',
                'Creación de nuevo artículo',
                'Olvido o bloqueo de clave',
                'No se logra conectar a la red corporativa',
              ][i] || '',
            activa: true,
          };
        });
        let failList = false,
          failCategories = false,
          failSave = false;
        await page.route('**/api/v1/**', async (route) => {
          const req = route.request(),
            url = new URL(req.url());
          requests.push({ path: url.pathname, method: req.method(), query: url.search });
          let data = [];
          const failure = (message) =>
            route.fulfill({ status: 500, json: { success: false, message } });
          if (url.pathname === '/api/v1/categorias') {
            if (failCategories) {
              failCategories = false;
              return failure('Catálogo no disponible');
            }
            data = categories;
          } else if (url.pathname === '/api/v1/subcategorias' && req.method() === 'GET') {
            assert.equal(
              url.search,
              '',
              'El listado no debe perder subcategorías inactivas usando categoriaId en la API',
            );
            if (failList) {
              failList = false;
              return failure('Directorio no disponible');
            }
            data = subcategories;
          } else if (url.pathname.startsWith('/api/v1/subcategorias') && req.method() !== 'GET') {
            mutations.push({
              path: url.pathname,
              method: req.method(),
              payload: req.postDataJSON(),
            });
            await new Promise((resolve) => setTimeout(resolve, 180));
            if (failSave) {
              failSave = false;
              return failure('No se pudo guardar la subcategoría de prueba');
            }
            if (req.method() === 'POST') {
              data = {
                ...req.postDataJSON(),
                id: 100,
                categoriaNombre: categories.find((c) => c.id === req.postDataJSON().categoriaId)
                  .nombre,
              };
              subcategories.push(data);
            } else {
              const item = subcategories.find(
                (a) => a.id === Number(url.pathname.split('/').at(-1)),
              );
              if (req.method() === 'PUT') {
                Object.assign(item, req.postDataJSON());
                item.categoriaNombre = categories.find((c) => c.id === item.categoriaId).nombre;
                data = item;
              } else {
                item.activa = false;
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
        await page.goto(base + '/subcategorias');
        await page.waitForFunction(
          () => document.querySelectorAll('.subcategory-table tbody tr').length === 8,
        );
        await page.evaluate((dark) => document.body.classList.toggle('dark-theme', dark), dark);
        for (const width of [1920, 1024, 390, 320]) {
          await page.setViewportSize({ width, height: width <= 390 ? 844 : 1080 });
          await page.waitForTimeout(300);
          await page.locator('.main-content').evaluate((el) => (el.scrollTop = 0));
          assert.ok(
            await page
              .locator('.subcategory-workspace')
              .evaluate((el) => el.scrollWidth <= el.clientWidth + 1),
          );
          assert.ok(
            await page
              .locator('.subcategory-filters')
              .evaluate((el) => el.scrollWidth <= el.clientWidth + 1),
          );
          if (width !== 1920)
            assert.ok(
              await page
                .locator('.subcategory-table-scroll')
                .evaluate((el) => el.scrollWidth > el.clientWidth),
            );
          await page.screenshot({
            path: path.join(os.tmpdir(), `subcategories-${dark ? 'dark' : 'light'}-${width}.png`),
          });
          await page.getByRole('button', { name: 'Nueva subcategoría', exact: true }).click();
          await page.waitForFunction(() => document.querySelector('dialog')?.open);
          assert.equal(
            await page
              .locator('#subcategory-editor-category')
              .evaluate((el) => document.activeElement === el),
            true,
          );
          const geometry = await page.locator('.subcategory-editor').evaluate((el) => {
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
          const field = await page.locator('#subcategory-editor-name').evaluate((el) => ({
            background: getComputedStyle(el).backgroundColor,
            border: getComputedStyle(el).borderTopColor,
          }));
          assert.notEqual(field.background, field.border);
          if (dark) assert.equal(field.background, 'rgb(19, 33, 56)');
          assert.ok(
            await page.locator('.subcategory-active-control').evaluate((el) => {
              const panel = el.getBoundingClientRect(),
                copy = el.querySelector('.subcategory-state-copy').getBoundingClientRect();
              return copy.top >= panel.top && copy.bottom <= panel.bottom;
            }),
            'El texto de estado no debe desbordar su panel',
          );
          if (width <= 390) {
            const heights = await page
              .locator('.subcategory-editor-actions button')
              .evaluateAll((buttons) => buttons.map((el) => el.getBoundingClientRect().height));
            assert.equal(heights[0], heights[1], 'Botones de igual altura en móvil');
          }
          await page.screenshot({
            path: path.join(
              os.tmpdir(),
              `subcategory-editor-${dark ? 'dark' : 'light'}-${width}.png`,
            ),
          });
          assert.equal(
            await page.locator('#subcategory-category-hint').innerText(),
            'Solo se muestran categorías activas.',
          );
          assert.equal(await page.locator('#subcategory-name-count').innerText(), '0/100');
          assert.equal(await page.locator('#subcategory-description-count').innerText(), '0/255');
          await page.locator('#subcategory-editor-name').fill('Falla de VPN');
          await page.locator('#subcategory-editor-description-input').fill('Conexión remota');
          await page.waitForFunction(
            () =>
              document.querySelector('#subcategory-name-count')?.textContent === '12/100' &&
              document.querySelector('#subcategory-description-count')?.textContent === '15/255',
          );
          assert.equal(
            await page.locator('#subcategory-editor-name').getAttribute('maxlength'),
            '100',
          );
          assert.equal(
            await page.locator('#subcategory-editor-description-input').getAttribute('maxlength'),
            '255',
          );
          const stateSwitch = page.getByRole('switch', {
            name: 'Subcategoría activa',
            exact: true,
          });
          assert.equal(await stateSwitch.isChecked(), true);
          await stateSwitch.focus();
          await page.keyboard.press('Space');
          await page.waitForFunction(() => !!document.querySelector('.subcategory-active-off'));
          assert.equal(await stateSwitch.isChecked(), false);
          assert.equal(
            await page.locator('#subcategory-active-hint').innerText(),
            'No se mostrará al crear tickets.',
          );
          assert.equal(
            await page
              .locator('.subcategory-switch-track')
              .evaluate((el) => getComputedStyle(el).outlineStyle),
            'solid',
          );
          await page.keyboard.press('Space');
          assert.equal(await stateSwitch.isChecked(), true);
          if (width <= 390) {
            await page.setViewportSize({ width, height: 480 });
            await page.waitForTimeout(100);
            assert.ok(
              await page
                .locator('.subcategory-editor-body')
                .evaluate((el) => el.scrollHeight > el.clientHeight),
              'El cuerpo del formulario debe desplazarse en pantallas bajas',
            );
            assert.ok(
              await page
                .locator('.subcategory-editor-actions')
                .evaluate((el) => el.getBoundingClientRect().bottom <= innerHeight),
              'Los botones deben permanecer dentro de la pantalla',
            );
            assert.ok(
              await page
                .locator('.subcategory-editor-actions')
                .evaluate((el) => el.scrollWidth <= el.clientWidth + 1),
              'Acciones sin desbordamiento en móvil',
            );
            await page.setViewportSize({ width, height: 844 });
          }
          await page.keyboard.press('Escape');
          await page.waitForFunction(() => !document.querySelector('dialog')?.open);
          layouts++;
        }
        await page.setViewportSize({ width: 1920, height: 1080 });
        await page.waitForTimeout(300);
        await page.getByLabel('Buscar subcategoría', { exact: true }).fill('contraseña');
        await page.waitForFunction(() =>
          document
            .querySelector('.subcategory-results p')
            ?.textContent.includes('1 subcategoría encontrada'),
        );
        assert.equal(
          await page.locator('#subcategory-search').evaluate((el) => document.activeElement === el),
          true,
        );
        await page.getByLabel('Categoría', { exact: true }).first().selectOption('4');
        await page.getByLabel('Estado', { exact: true }).selectOption('active');
        await page.reload();
        await page.waitForFunction(
          () => document.querySelector('#subcategory-search')?.value === 'contraseña',
        );
        assert.equal(await page.locator('#subcategory-category').inputValue(), '4');
        await page.getByRole('button', { name: 'Limpiar', exact: true }).click();
        await page.waitForFunction(() =>
          document
            .querySelector('.subcategory-results p')
            ?.textContent.includes('12 subcategorías encontradas'),
        );

        await page.getByLabel('Buscar subcategoría', { exact: true }).fill('dinamicas');
        await page.waitForFunction(() =>
          document
            .querySelector('.subcategory-results p')
            ?.textContent.includes('1 subcategoría encontrada'),
        );
        assert.match(await page.locator('.subcategory-table tbody').innerText(), /Querys/);
        await page.getByRole('button', { name: 'Limpiar', exact: true }).click();
        await page.locator('#subcategory-category').selectOption('2');
        await page
          .getByRole('button', {
            name: 'Editar subcategoría Regularizacion de Saldos de Almacen',
            exact: true,
          })
          .click();
        assert.equal(
          await page.locator('#subcategory-editor-category option:checked').innerText(),
          'Sistema Datcorpv5 (Inactiva)',
        );
        assert.match(
          await page.locator('#subcategory-category-hint').innerText(),
          /conservar la categoría original/,
        );
        assert.equal(
          await page.locator('#subcategory-name-count').innerText(),
          names[1].length + '/100',
        );
        await page.keyboard.press('Escape');
        await page.getByRole('button', { name: 'Limpiar', exact: true }).click();

        await page.getByRole('button', { name: 'Nueva subcategoría', exact: true }).click();
        assert.equal(
          await page
            .locator('#subcategory-editor-category option')
            .filter({ hasText: '(Inactiva)' })
            .count(),
          0,
        );
        await page.getByRole('button', { name: 'Guardar subcategoría', exact: true }).click();
        await page.getByText('Selecciona una categoría.', { exact: true }).waitFor();
        await page.getByText('Ingresa el nombre de la subcategoría.', { exact: true }).waitFor();
        assert.equal(mutations.length, 0);
        await page
          .locator('#subcategory-editor-category')
          .selectOption({ label: categories[2].nombre });
        await page.locator('#subcategory-editor-name').fill('Nueva subcategoría de prueba');
        await page
          .locator('#subcategory-editor-description-input')
          .fill('Descripción dla subcategoría');
        await page
          .getByRole('button', { name: 'Guardar subcategoría', exact: true })
          .click({ clickCount: 3 });
        await page.waitForFunction(() => !document.querySelector('dialog')?.open);
        await page.waitForFunction(() =>
          document
            .querySelector('.subcategory-results p')
            ?.textContent.includes('13 subcategorías encontradas'),
        );
        assert.equal(mutations.filter((r) => r.method === 'POST').length, 1);
        assert.equal(subcategories.at(-1).categoriaId, 3);
        await page.locator('#subcategory-category').selectOption('3');
        await page
          .getByRole('button', {
            name: 'Editar subcategoría Nueva subcategoría de prueba',
            exact: true,
          })
          .click();
        await page.waitForFunction(
          () =>
            document.querySelector('#subcategory-editor-name')?.value ===
            'Nueva subcategoría de prueba',
        );
        assert.equal(
          await page.locator('#subcategory-editor-description-input').inputValue(),
          'Descripción dla subcategoría',
        );
        await page.locator('#subcategory-editor-name').fill('Subcategoría editada');
        failSave = true;
        await page.getByRole('switch', { name: 'Subcategoría activa', exact: true }).uncheck();
        await page.getByRole('button', { name: 'Guardar subcategoría', exact: true }).click();
        await page
          .getByRole('alert')
          .filter({ hasText: 'No se pudo guardar la subcategoría de prueba' })
          .waitFor();
        assert.equal(
          await page.locator('#subcategory-editor-name').inputValue(),
          'Subcategoría editada',
        );
        assert.equal(
          await page.getByRole('switch', { name: 'Subcategoría activa', exact: true }).isChecked(),
          false,
        );
        assert.equal(mutations.at(-1).payload.activa, false);
        await page.getByRole('switch', { name: 'Subcategoría activa', exact: true }).check();
        await page.getByRole('button', { name: 'Guardar subcategoría', exact: true }).click();
        await page.waitForFunction(() => !document.querySelector('dialog')?.open);
        await page
          .getByRole('button', { name: 'Editar subcategoría Subcategoría editada', exact: true })
          .waitFor();
        assert.equal(await page.locator('#subcategory-category').inputValue(), '3');
        await page
          .getByRole('button', { name: 'Eliminar subcategoría Subcategoría editada', exact: true })
          .click();
        await page.getByRole('button', { name: 'Cancelar', exact: true }).click();
        assert.equal(mutations.filter((r) => r.method === 'DELETE').length, 0);
        await page
          .getByRole('button', { name: 'Eliminar subcategoría Subcategoría editada', exact: true })
          .click();
        await page.getByRole('button', { name: 'Sí, desactivar', exact: true }).click();
        await page.waitForFunction(() =>
          Array.from(document.querySelectorAll('.subcategory-status-pill')).some((el) =>
            el.textContent.includes('Inactiva'),
          ),
        );
        assert.equal(mutations.filter((r) => r.method === 'DELETE').length, 1);
        await page.locator('#subcategory-status').selectOption('inactive');
        await page
          .getByRole('button', { name: 'Editar subcategoría Subcategoría editada', exact: true })
          .waitFor();
        assert.equal(
          await page
            .getByRole('button', {
              name: 'Eliminar subcategoría Subcategoría editada',
              exact: true,
            })
            .isDisabled(),
          true,
        );
        await page.locator('#subcategory-search').fill('no existe');
        await page
          .getByText('No encontramos subcategorías con estos filtros', { exact: true })
          .waitFor();
        await page.getByRole('button', { name: 'Limpiar filtros', exact: true }).click();

        subcategories.push(
          ...Array.from({ length: 13 }, (_, i) => ({
            id: 200 + i,
            nombre: 'Subcategoría adicional ' + i,
            categoriaId: 1,
            categoriaNombre: categories[0].nombre,
            activa: true,
          })),
        );
        await page.reload();
        await page.waitForFunction(() =>
          document
            .querySelector('.subcategory-results p')
            ?.textContent.includes('26 subcategorías encontradas'),
        );
        await page.getByRole('button', { name: 'Página 3', exact: true }).click();
        await page.waitForFunction(() =>
          document.querySelector('.subcategory-pagination p')?.textContent.includes('17–24'),
        );
        await page.reload();
        await page.waitForFunction(() =>
          document.querySelector('.subcategory-pagination p')?.textContent.includes('17–24'),
        );
        await page.getByLabel('Filas', { exact: true }).selectOption({ label: '5' });
        await page.waitForFunction(() =>
          document.querySelector('.subcategory-pagination p')?.textContent.includes('1–5'),
        );
        failList = true;
        await page.reload();
        await page
          .getByRole('alert')
          .filter({ hasText: 'No se pudo cargar el directorio' })
          .waitFor();
        assert.equal(
          await page.getByText('Todavía no hay subcategorías registradas', { exact: true }).count(),
          0,
        );
        await page.getByRole('button', { name: 'Reintentar', exact: true }).click();
        await page.waitForFunction(
          () =>
            document.querySelectorAll('.subcategory-table tbody tr').length === 5 &&
            !document.querySelector('.subcategory-load-error'),
        );
        failCategories = true;
        await page.reload();
        await page.getByRole('alert').filter({ hasText: 'catálogo de categorías' }).waitFor();
        await page.getByRole('button', { name: 'Nueva subcategoría', exact: true }).click();
        assert.equal(
          await page
            .getByRole('button', { name: 'Guardar subcategoría', exact: true })
            .isDisabled(),
          true,
        );
        await page
          .getByRole('button', { name: 'Reintentar categorías', exact: true })
          .last()
          .click();
        await page.waitForFunction(
          () => !document.querySelector('.subcategory-editor button[type="submit"]')?.disabled,
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
