// node --test scripts/service-history-ui.test.cjs (después de npm run build)
// Navegador con API simulada. No modifica registros reales.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { launchBrowser } = require('./helpers/browser.cjs');
const { installPermissionSessionDefaults } = require('./helpers/permission-session.cjs');

test(
  'Historial: filtros, retorno al detalle, iconos, paginación y 16 vistas de admin/técnico/tema/tamaño',
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
      for (const technician of [false, true])
        for (const dark of [false, true]) {
          const base = technician ? '/tecnico/servicios' : '/servicios',
            role = technician ? 'technician' : 'admin';
          console.log('Historial/' + role + '/' + (dark ? 'dark' : 'light'));
          const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } }),
            page = await context.newPage(),
            errors = [],
            requests = [];
          page.on('pageerror', (error) => errors.push(error.message));
          await page.addInitScript(installPermissionSessionDefaults);
          await page.addInitScript(
            ({ technician, dark }) => {
              const accessToken =
                'e30.' +
                btoa(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 3600 })) +
                '.test';
              localStorage.setItem(
                'user_session',
                JSON.stringify({
                  accessToken,
                  roles: [technician ? 'ROLE_TECNICO' : 'ROLE_ADMIN'],
                  userId: 1,
                  fullName: technician ? 'Carlos Mendoza' : 'Administrador Demo',
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
            },
            { technician, dark },
          );
          const names = [
            'Correo Corporativo DEMO A',
            'Correo Corporativo DEMO A',
            'Correo Corporativo DEMO B',
            'Correo Corporativo DEMO B',
            'Correo Corporativo DEMO B',
            'Correo Corporativo DEMO C',
            'Correo Corporativo DEMO C',
            'Página Web DEMO A',
          ];
          const history = Array.from({ length: 18 }, (_, i) => ({
            id: i + 1,
            nombre: names[i] || 'Servicio histórico ' + (i + 1),
            proveedor: i === 7 ? 'GoDaddy' : 'Google',
            tipo: i === 7 ? 'Página Web' : 'Correo',
            categoriaServicioId: i === 7 ? 2 : 1,
            estado: [3, 7, 9, 13, 17].includes(i) ? 'CANCELADO' : 'FINALIZADO',
            fechaInicio: i % 2 === 0 ? '2026-07-01' : '2026-08-01',
            fechaFin: i % 2 === 0 ? '2026-07-31' : '2026-08-31',
            costoMensual: [302.4, 302.4, 8.4, 8.4, 8.4, 67.2, 67.2, 54.99][i] || 10,
            divisa: [0, 1, 3, 7].includes(i) ? 'PEN' : 'USD',
            responsable: 'Sistemas',
            correosRecordatorio: [],
            adjuntos: [],
          }));
          const categories = [
            { id: 1, nombre: 'Correo', icono: 'mail', activa: false },
            { id: 2, nombre: 'Página Web', icono: 'public', activa: true },
          ];
          let failHistory = false,
            failIcons = false;
          await page.route('**/api/v1/**', async (route) => {
            const req = route.request(),
              url = new URL(req.url());
            requests.push(url.pathname);
            assert.equal(req.method(), 'GET', 'El historial solo consulta datos');
            let data = [];
            if (
              url.pathname === '/api/v1/services/history' ||
              /\/services\/\d+\/history$/.test(url.pathname)
            ) {
              if (failHistory) {
                failHistory = false;
                return route.fulfill({ status: 500, json: { success: false } });
              }
              data = history;
            } else if (url.pathname === '/api/v1/service-categories') {
              if (failIcons) {
                failIcons = false;
                return route.fulfill({ status: 500, json: { success: false } });
              }
              data = categories;
            } else if (/\/services\/\d+$/.test(url.pathname))
              data = history.find((s) => s.id === Number(url.pathname.split('/').at(-1)));
            else if (url.pathname === '/api/v1/services')
              data = {
                content: [],
                totalElements: 0,
                totalPages: 0,
                number: 0,
                size: 8,
                totalesPorDivisa: {},
              };
            else if (url.pathname.endsWith('/users/me'))
              data = {
                id: 1,
                nombres: 'Carlos',
                apellidos: 'Mendoza',
                roles: [technician ? 'ROLE_TECNICO' : 'ROLE_ADMIN'],
                estado: 'ACTIVO',
              };
            else if (url.pathname.endsWith('/count')) data = { count: 0 };
            else if (url.pathname.endsWith('/settings')) data = { enabled: false };
            await route.fulfill({ json: { success: true, data } });
          });
          await page.goto(origin + base + '/historial');
          await page.waitForFunction(
            () => document.querySelectorAll('.service-history-table tbody tr').length === 8,
          );
          assert.equal(
            requests.filter((url) => url === '/api/v1/services').length,
            0,
            'No consulta el listado actual para mostrar historial',
          );
          assert.equal(
            await page
              .locator('.service-history-table th')
              .allTextContents()
              .then((items) => items.join(',')),
            'Servicio,Proveedor,Vigencia,Estado,Costo mensual,Acciones',
          );
          await page.waitForFunction(() =>
            document.querySelector('.service-list-avatar mat-icon')?.textContent.includes('mail'),
          );
          assert.equal(
            await page.locator('.service-list-avatar mat-icon').nth(7).innerText(),
            'public',
          );
          assert.equal(
            await page.locator('.service-list-cost-cell').nth(3).innerText(),
            'PEN 8.40',
          );
          for (const width of [1920, 1024, 390, 320]) {
            await page.setViewportSize({ width, height: width <= 390 ? 844 : 1080 });
            await page.waitForTimeout(300);
            await page.locator('.main-content, .tech-main').evaluate((el) => (el.scrollTop = 0));
            for (const selector of [
              '.service-history-workspace',
              '.service-history-filters',
              '.service-list-directory',
              '.service-list-pagination',
            ])
              assert.ok(
                await page.locator(selector).evaluate((el) => el.scrollWidth <= el.clientWidth + 1),
                selector + ' sin desbordamiento a ' + width,
              );
            assert.ok(
              await page.evaluate(
                () => document.documentElement.scrollWidth <= window.innerWidth + 1,
              ),
              'Sin scroll horizontal de la página',
            );
            if (width === 1920) {
              assert.ok(
                await page
                  .locator('.service-history-workspace')
                  .evaluate((el) => el.clientWidth > 1450),
              );
              assert.ok(
                await page
                  .locator('.service-list-pagination')
                  .evaluate(
                    (el) =>
                      el.getBoundingClientRect().bottom <=
                      document.querySelector('.main-content, .tech-main').getBoundingClientRect()
                        .bottom +
                        1,
                  ),
                'Ocho filas y pie visibles',
              );
            } else
              assert.ok(
                await page
                  .locator('.service-list-table-scroll')
                  .evaluate((el) => el.scrollWidth > el.clientWidth),
              );
            await page.screenshot({
              path: path.join(
                os.tmpdir(),
                `service-history-${role}-${dark ? 'dark' : 'light'}-${width}.png`,
              ),
            });
            layouts++;
          }
          await page.setViewportSize({ width: 1920, height: 1080 });
          await page.waitForTimeout(300);
          await page.getByRole('button', { name: 'Página 2', exact: true }).click();
          await page
            .getByRole('link', { name: 'Ver detalle de Servicio histórico 9', exact: true })
            .click();
          await page.waitForURL(origin + base + '/9?from=history');
          await page.getByRole('button', { name: 'Historial de servicios', exact: true }).click();
          await page.waitForFunction(() =>
            document.querySelector('.service-list-pagination p')?.textContent.includes('9–16'),
          );
          await page.getByLabel('Filas', { exact: true }).selectOption({ label: '5' });
          await page.getByLabel('Buscar servicio', { exact: true }).fill('google');
          await page.getByLabel('Estado', { exact: true }).selectOption('CANCELADO');
          await page.getByLabel('Inicio desde', { exact: true }).fill('2026-08-01');
          await page.getByLabel('Inicio hasta', { exact: true }).fill('2026-08-01');
          await page.getByRole('button', { name: 'Filtrar', exact: true }).click();
          await page.waitForFunction(() =>
            document
              .querySelector('.service-list-results span')
              ?.textContent.includes('4 registros encontrados'),
          );
          await page
            .getByRole('link', { name: 'Ver detalle de Correo Corporativo DEMO B', exact: true })
            .click();
          await page.waitForURL(origin + base + '/4?from=history');
          await page.getByRole('button', { name: 'Guardar observaciones', exact: true }).waitFor();
          assert.equal(
            await page
              .getByRole('button', { name: 'Guardar observaciones', exact: true })
              .isDisabled(),
            true,
            'Servicio cerrado no editable',
          );
          await page.getByRole('button', { name: 'Historial de servicios', exact: true }).click();
          await page.waitForFunction(() =>
            document
              .querySelector('.service-list-results span')
              ?.textContent.includes('4 registros encontrados'),
          );
          assert.equal(
            await page.getByLabel('Buscar servicio', { exact: true }).inputValue(),
            'google',
          );
          assert.equal(await page.getByLabel('Estado', { exact: true }).inputValue(), 'CANCELADO');
          assert.equal(
            await page.getByLabel('Inicio desde', { exact: true }).inputValue(),
            '2026-08-01',
          );
          await page.getByLabel('Inicio desde', { exact: true }).fill('2026-09-01');
          await page.getByRole('button', { name: 'Filtrar', exact: true }).click();
          await page.getByRole('alert').filter({ hasText: 'no puede ser posterior' }).waitFor();
          assert.equal(await page.locator('.service-history-table tbody tr').count(), 4);
          await page.getByRole('button', { name: 'Limpiar', exact: true }).click();
          await page.waitForFunction(() =>
            document
              .querySelector('.service-list-results span')
              ?.textContent.includes('18 registros encontrados'),
          );
          await page.getByLabel('Buscar servicio', { exact: true }).fill('no existe');
          await page.locator('#service-history-search').press('Enter');
          await page
            .getByRole('heading', {
              name: 'No hay registros con los filtros aplicados',
              exact: true,
            })
            .waitFor();
          assert.equal(
            await page.getByRole('button', { name: 'Página siguiente', exact: true }).isDisabled(),
            true,
          );
          await page.getByRole('button', { name: 'Limpiar filtros', exact: true }).click();
          failHistory = true;
          await page.reload();
          await page
            .getByRole('alert')
            .filter({ hasText: 'No se pudo cargar el historial' })
            .waitFor();
          assert.equal(
            await page
              .getByRole('heading', {
                name: 'No hay registros históricos de servicios',
                exact: true,
              })
              .count(),
            0,
          );
          await page.getByRole('button', { name: 'Reintentar historial', exact: true }).click();
          await page.waitForFunction(() =>
            document
              .querySelector('.service-list-results span')
              ?.textContent.includes('18 registros encontrados'),
          );
          failIcons = true;
          await page.reload();
          await page.getByRole('button', { name: 'Reintentar iconos', exact: true }).click();
          await page.waitForFunction(() =>
            document.querySelector('.service-list-avatar mat-icon')?.textContent.includes('mail'),
          );
          // Un historial individual debe volver a la misma cadena, no al general.
          await page.goto(origin + base + '/42/historial');
          await page.locator('.service-history-table tbody tr').first().waitFor();
          await page.getByLabel('Buscar servicio', { exact: true }).fill('Correo');
          await page.getByRole('button', { name: 'Filtrar', exact: true }).click();
          await page
            .getByRole('link', { name: /^Ver detalle de / })
            .first()
            .click();
          await page.waitForURL(origin + base + '/1?from=history&historyId=42');
          await page.getByRole('button', { name: 'Historial de servicios', exact: true }).click();
          await page.waitForURL(origin + base + '/42/historial');
          await page.waitForFunction(
            () => document.querySelector('#service-history-search')?.value === 'Correo',
          );
          await page.getByRole('button', { name: 'Volver a Servicios', exact: true }).click();
          await page.waitForURL(origin + base);
          await page.getByRole('heading', { name: 'Servicios', exact: true }).waitFor();
          assert.deepEqual(errors, []);
          await context.close();
        }
      console.log(
        'Verificadas ' +
          layouts +
          ' vistas y navegación con filtros persistentes, usando API simulada.',
      );
    } finally {
      await browser?.close();
      await new Promise((resolve) => server.close(resolve));
    }
  },
);
