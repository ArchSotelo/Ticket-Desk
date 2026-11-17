// node --test scripts/service-list-ui.test.cjs (tras npm run build)
// API simulada; las pruebas no escriben en registros reales.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { launchBrowser } = require('./helpers/browser.cjs');
const { installPermissionSessionDefaults } = require('./helpers/permission-session.cjs');

test(
  'Servicios: admin y técnico, filtros, divisas, iconos, navegación, Excel y diseño responsive',
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
          const role = technician ? 'technician' : 'admin',
            base = technician ? '/tecnico/servicios' : '/servicios';
          console.log('Checking Servicios/' + role + '/' + (dark ? 'dark' : 'light'));
          const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
          const page = await context.newPage(),
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
            'Correo Corporativo DEMO B',
            'Correo Corporativo DEMO C',
            'Dominio DEMO D',
            'Dominio DEMO A',
            'Dominio DEMO B',
            'Dominio DEMO C',
            'Internet',
          ];
          const services = names.map((nombre, i) => ({
            id: i + 1,
            nombre,
            proveedor: i < 3 ? 'Google' : i < 6 ? 'Punto PE' : i === 6 ? 'GoDaddy' : 'Claro',
            tipo: i < 3 ? 'Correo' : i < 7 ? 'Dominio' : 'Internet',
            categoriaServicioId: i < 3 ? 1 : i < 7 ? 2 : 3,
            fechaInicio: [
              '2026-09-01',
              '2026-09-01',
              '2026-09-01',
              '2025-12-28',
              '2026-08-12',
              '2026-06-11',
              '2026-02-03',
              '2026-07-28',
            ][i],
            fechaFin: [
              '2026-09-30',
              '2026-09-30',
              '2026-09-30',
              '2026-12-28',
              '2027-08-12',
              '2027-06-11',
              '2027-02-03',
              '2026-08-28',
            ][i],
            estado: i < 3 || i === 7 ? 'VENCIDO' : 'ACTIVO',
            costoMensual: [302.4, 8.4, 67.2, 110, 110, 110, 74.99, 295][i],
            divisa: [0, 3, 4, 5, 6].includes(i) ? 'PEN' : 'USD',
            responsable: 'Sistemas',
            correosRecordatorio: [],
            adjuntos: [],
          }));
          services.push(
            ...Array.from({ length: 8 }, (_, i) => ({
              id: 9 + i,
              nombre: 'Servicio adicional ' + (i + 1),
              proveedor: 'Proveedor de prueba',
              tipo: 'Licencia',
              categoriaServicioId: 4,
              fechaInicio: '2026-09-01',
              fechaFin: '2026-10-23',
              estado: i < 2 ? 'POR_VENCER' : 'ACTIVO',
              costoMensual: [1000, 500, 400, 209.13, 200, 100, 75, 38.71][i],
              divisa: i < 4 ? 'PEN' : 'USD',
              responsable: 'Sistemas',
              correosRecordatorio: [],
              adjuntos: [],
            })),
          );
          const categories = [
            { id: 1, nombre: 'Correo', icono: 'mail', activa: false },
            { id: 2, nombre: 'Dominio', icono: 'category', activa: true },
            { id: 3, nombre: 'Internet', icono: 'public', activa: true },
            { id: 4, nombre: 'Licencia', icono: 'license', activa: true },
          ];
          let failList = false,
            failIcons = false,
            failExport = false;
          await page.route('**/api/v1/**', async (route) => {
            const req = route.request(),
              url = new URL(req.url());
            requests.push({ path: url.pathname, method: req.method(), query: url.search });
            assert.equal(
              req.method(),
              'GET',
              'El listado y su navegación no deben escribir servicios',
            );
            let data = [];
            if (url.pathname === '/api/v1/services/export/excel') {
              assert.equal(url.search, '');
              await new Promise((resolve) => setTimeout(resolve, 200));
              if (failExport) {
                failExport = false;
                return route.fulfill({ status: 500, json: { success: false } });
              }
              return route.fulfill({
                contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                body: Buffer.from('PK excel simulado'),
              });
            } else if (url.pathname === '/api/v1/service-categories') {
              if (failIcons) {
                failIcons = false;
                return route.fulfill({ status: 500, json: { success: false } });
              }
              data = categories;
            } else if (url.pathname === '/api/v1/services') {
              if (failList) {
                failList = false;
                return route.fulfill({ status: 500, json: { success: false } });
              }
              const search = (url.searchParams.get('busqueda') || '').toLowerCase(),
                status = url.searchParams.get('estado') || '',
                size = Number(url.searchParams.get('size') || 8),
                number = Number(url.searchParams.get('page') || 0);
              const filtered = services.filter(
                (s) =>
                  (!search ||
                    [s.nombre, s.proveedor, s.responsable].some((value) =>
                      value.toLowerCase().includes(search),
                    )) &&
                  (!status || s.estado === status),
              );
              const totals = {};
              filtered.forEach(
                (s) => (totals[s.divisa] = (totals[s.divisa] || 0) + s.costoMensual),
              );
              data = {
                content: filtered.slice(number * size, (number + 1) * size),
                totalElements: filtered.length,
                totalPages: Math.ceil(filtered.length / size),
                number,
                size,
                totalesPorDivisa: totals,
              };
            } else if (url.pathname === '/api/v1/services/history')
              data = [{ ...services[0], id: 50, estado: 'FINALIZADO' }];
            else if (/\/services\/\d+$/.test(url.pathname))
              data = services.find((s) => s.id === Number(url.pathname.split('/').at(-1)));
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
          await page.goto(origin + base);
          await page.waitForFunction(
            () =>
              document.querySelectorAll('.service-list-table tbody tr').length === 8 &&
              document.querySelectorAll('.service-list-currency-card').length === 2,
          );
          assert.equal(
            await page
              .locator('.service-list-table th')
              .allTextContents()
              .then((items) => items.join(',')),
            'Servicio,Vigencia,Estado,Costo mensual,Responsable,Acciones',
          );
          assert.equal(
            await page.locator('.service-list-avatar mat-icon').first().innerText(),
            'mail',
          );
          assert.match(
            await page
              .locator('.service-list-currency-card')
              .allTextContents()
              .then((items) => items.join(' ')),
            /2,?816\.52/,
          );
          assert.equal(await page.locator('.service-list-table tbody button').count(), 8);
          assert.equal(await page.locator('.service-modal').count(), 0);
          for (const width of [1920, 1024, 390, 320]) {
            await page.setViewportSize({ width, height: width <= 390 ? 844 : 1080 });
            await page.waitForTimeout(300);
            await page.locator('.main-content, .tech-main').evaluate((el) => (el.scrollTop = 0));
            for (const selector of [
              '.service-list-workspace',
              '.service-list-header-actions',
              '.service-list-filters',
              '.service-list-summary',
            ])
              assert.ok(
                await page.locator(selector).evaluate((el) => el.scrollWidth <= el.clientWidth + 1),
                selector + ' sin desbordamiento',
              );
            if (width === 1920) {
              assert.ok(
                await page
                  .locator('.service-list-workspace')
                  .evaluate((el) => el.clientWidth > 1450),
                'Aprovecha el ancho disponible',
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
                'Ocho filas y paginación visibles en escritorio',
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
                `services-${role}-${dark ? 'dark' : 'light'}-${width}.png`,
              ),
            });
            layouts++;
          }
          await page.setViewportSize({ width: 1920, height: 1080 });
          await page.waitForTimeout(300);
          await page.getByRole('button', { name: 'Página 2', exact: true }).click();
          await page.waitForFunction(() =>
            document.querySelector('.service-list-pagination p')?.textContent.includes('9–16'),
          );
          await page
            .getByRole('button', { name: /^Ver detalle de / })
            .first()
            .click();
          await page.waitForURL(origin + base + '/9');
          await page.locator('.service-detail-page').waitFor();
          await page.getByRole('button', { name: 'Servicios', exact: true }).click();
          await page.waitForFunction(() =>
            document.querySelector('.service-list-pagination p')?.textContent.includes('9–16'),
          );
          await page.getByLabel('Filas', { exact: true }).selectOption({ label: '5' });
          await page.waitForFunction(() =>
            document.querySelector('.service-list-pagination p')?.textContent.includes('1–5'),
          );
          await page.getByLabel('Buscar servicio', { exact: true }).fill('Correo');
          await page.getByLabel('Estado', { exact: true }).selectOption('VENCIDO');
          await page.getByRole('button', { name: 'Filtrar', exact: true }).click();
          await page.waitForFunction(() =>
            document
              .querySelector('.service-list-results p')
              ?.textContent.includes('3 servicios encontrados'),
          );
          await page
            .getByRole('button', { name: 'Ver detalle de Correo Corporativo DEMO A', exact: true })
            .click();
          await page.waitForURL(origin + base + '/1');
          await page.getByRole('button', { name: 'Servicios', exact: true }).click();
          await page.waitForFunction(() =>
            document
              .querySelector('.service-list-results p')
              ?.textContent.includes('3 servicios encontrados'),
          );
          assert.equal(await page.locator('#service-list-search').inputValue(), 'Correo');
          assert.equal(await page.locator('#service-list-status').inputValue(), 'VENCIDO');
          await page.getByRole('link', { name: 'Historial general', exact: true }).click();
          await page.waitForURL(origin + base + '/historial');
          await page
            .getByRole('heading', { name: 'Historial de servicios', exact: true })
            .waitFor();
          await page.getByRole('button', { name: 'Volver a Servicios', exact: true }).click();
          // Ambas vistas comparten clase mientras termina la transición de ruta.
          await page.waitForURL(origin + base);
          await page
            .getByRole('region', { name: 'Historial de servicios', exact: true })
            .waitFor({ state: 'detached' });
          await page.getByRole('region', { name: 'Servicios', exact: true }).waitFor();
          await page.getByRole('button', { name: 'Nuevo servicio', exact: true }).click();
          await page.waitForURL(origin + base + '/nuevo');
          await page.locator('.service-form-page').waitFor();
          await page.getByRole('button', { name: 'Volver a Servicios', exact: true }).click();
          await page.waitForFunction(() =>
            document
              .querySelector('.service-list-results p')
              ?.textContent.includes('3 servicios encontrados'),
          );
          const beforeExport = requests.filter((r) => r.path.endsWith('/excel')).length;
          const download = page.waitForEvent('download');
          await page
            .getByRole('button', { name: 'Exportar', exact: true })
            .click({ clickCount: 3 });
          assert.match((await download).suggestedFilename(), /^servicios_.*\.xlsx$/);
          assert.equal(requests.filter((r) => r.path.endsWith('/excel')).length, beforeExport + 1);
          failExport = true;
          await page.getByRole('button', { name: 'Exportar', exact: true }).click();
          await page.getByRole('alert').filter({ hasText: 'No se pudo exportar' }).waitFor();
          assert.equal(await page.locator('.service-list-table tbody tr').count(), 3);
          await page.getByRole('button', { name: 'Limpiar', exact: true }).click();
          await page.waitForFunction(() =>
            document
              .querySelector('.service-list-results p')
              ?.textContent.includes('16 servicios encontrados'),
          );
          await page.getByLabel('Estado', { exact: true }).selectOption('POR_VENCER');
          await page.getByRole('button', { name: 'Filtrar', exact: true }).click();
          await page.waitForFunction(
            () => document.querySelectorAll('.service-list-status-pill.por_vencer').length === 2,
          );
          await page.getByRole('button', { name: 'Limpiar', exact: true }).click();
          await page.waitForFunction(() =>
            document
              .querySelector('.service-list-results p')
              ?.textContent.includes('16 servicios encontrados'),
          );
          await page.getByLabel('Buscar servicio', { exact: true }).fill('no existe');
          await page.locator('#service-list-search').press('Enter');
          await page.waitForFunction(() =>
            document
              .querySelector('.service-list-results p')
              ?.textContent.includes('0 servicios encontrados'),
          );
          assert.equal(await page.locator('.service-list-currency-card').count(), 0);
          assert.equal(
            await page.getByRole('button', { name: 'Página siguiente', exact: true }).isDisabled(),
            true,
          );
          await page.getByRole('button', { name: 'Limpiar filtros', exact: true }).click();
          await page.waitForFunction(() =>
            document
              .querySelector('.service-list-results p')
              ?.textContent.includes('16 servicios encontrados'),
          );
          failList = true;
          await page.reload();
          await page
            .getByRole('alert')
            .filter({ hasText: 'No se pudo cargar el directorio' })
            .waitFor();
          assert.equal(
            await page
              .getByText('No hay servicios con los filtros aplicados', { exact: true })
              .count(),
            0,
          );
          await page.getByRole('button', { name: 'Reintentar servicios', exact: true }).click();
          await page.waitForFunction(() =>
            document
              .querySelector('.service-list-results p')
              ?.textContent.includes('16 servicios encontrados'),
          );
          failIcons = true;
          await page.reload();
          await page
            .getByRole('alert')
            .filter({ hasText: 'No se pudieron cargar los iconos' })
            .waitFor();
          await page.getByRole('button', { name: 'Reintentar iconos', exact: true }).click();
          await page.waitForFunction(() =>
            document.querySelector('.service-list-avatar mat-icon')?.textContent.includes('mail'),
          );
          assert.deepEqual(errors, []);
          await context.close();
        }
      console.log(
        'Verificados ' +
          layouts +
          ' escenarios de rol/tema/resolución y navegación con API simulada.',
      );
    } finally {
      await browser?.close();
      await new Promise((resolve) => server.close(resolve));
    }
  },
);
