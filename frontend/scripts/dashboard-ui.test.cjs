// node --test scripts/dashboard-ui.test.cjs (tras npm run build)
// Chromium de Playwright, API simulada, sin escrituras externas ni tickets reales.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { launchBrowser } = require('./helpers/browser.cjs');
const { installPermissionSessionDefaults } = require('./helpers/permission-session.cjs');

test(
  'dashboard: ambos portales, temas, resoluciones, datos, orden, retorno y recuperación de errores',
  { timeout: 240000 },
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
      let checks = 0;
      for (const portal of [
        {
          name: 'admin',
          path: '/dashboard',
          role: 'ROLE_ADMIN',
          list: '/tickets/list',
          detail: '/tickets/detail/104',
        },
        {
          name: 'technician',
          path: '/tecnico/dashboard',
          role: 'ROLE_TECNICO',
          list: '/tecnico',
          detail: '/tecnico/tickets/104',
        },
      ])
        for (const dark of [false, true]) {
          console.log('Checking dashboard ' + portal.name + '/' + (dark ? 'dark' : 'light'));
          const context = await browser.newContext({ viewport: { width: 1920, height: 1440 } });
          const page = await context.newPage(),
            errors = [],
            requests = [];
          page.on('pageerror', (error) => errors.push(error.message));
          await page.addInitScript(installPermissionSessionDefaults);
          await page.addInitScript((role) => {
            if (window !== window.top) return;
            const accessToken =
              'e30.' +
              btoa(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 3600 })) +
              '.test';
            localStorage.setItem(
              'user_session',
              JSON.stringify({ accessToken, roles: [role], userId: 3, fullName: 'Carlos Campos' }),
            );
            window.WebSocket = class {
              static OPEN = 1;
              static CONNECTING = 0;
              readyState = 0;
              close() {}
              addEventListener() {}
              removeEventListener() {}
            };
          }, portal.role);
          let metrics = {
            totalTickets: 104,
            ticketsAbiertos: 0,
            ticketsEnProceso: 0,
            ticketsResueltos: 0,
            ticketsCerrados: 104,
            ticketsVencidosSla: 8,
            porcentajeCumplimientoSla: 90.38,
            ticketsPorEstado: { Cerrado: 104 },
            ticketsPorPrioridad: { Baja: 3, Media: 30, Alta: 65, Crítica: 6 },
            ticketsPorCategoria: {
              'Sistema Demo v1': 86,
              'Accesos & Seguridad': 4,
              'Software & Aplicaciones': 10,
              Capacitaciones: 1,
              'Redes & Conectividad': 3,
            },
            ticketsPorTecnico: { 'Carlos Campos': 104 },
            ticketsSlaCumplidos: 94,
            ticketsSlaIncumplidos: 10,
            ticketsSlaPendientes: 0,
            fechasTendencia: ['08/10', '09/10', '10/10', '11/10', '12/10', '13/10', '14/10'],
            ticketsCreadosPorFecha: [1, 2, 1, 0, 0, 0, 0],
            ticketsResueltosPorFecha: [0, 1, 1, 0, 0, 0, 0],
          };
          const tickets = Array.from({ length: 5 }, (_, i) => ({
            id: 104 - i,
            codigo: 'TICK-2026-0' + (104 - i),
            titulo:
              i === 2
                ? 'REPORTE SALDOS'
                : i === 4
                  ? 'ACTUALIZACIÓN DE SALDOS'
                  : 'CREACIÓN DE ARTÍCULO',
            descripcion: 'Descripción de prueba para el dashboard.',
            clienteId: 8,
            clienteNombre: i === 2 || i === 4 ? 'Esteban Castro' : 'Laura Ramírez',
            clienteEmail: 'cliente@example.test',
            estadoCodigo: 'CERRADO',
            estadoNombre: 'Cerrado',
            prioridadNombre: i === 0 || i === 3 ? 'Alta' : 'Media',
            tecnicoId: 3,
            tecnicoNombre: 'Carlos Campos',
            empresaNombre: 'Corporación Demo S.A.C.',
            areaNombre: 'Sistemas',
            categoriaNombre: 'Sistema Demo v1',
            fechaCreacion: `2026-10-${i === 0 ? '10' : i === 1 ? '09' : '07'}T10:00:00`,
            attachments: [],
            comentarios: [],
            historialCambios: [],
          }));
          let failMetrics = false,
            failLatest = false,
            delay = 0;
          await page.route('**/api/v1/**', async (route) => {
            const url = new URL(route.request().url());
            requests.push({ path: url.pathname, query: Object.fromEntries(url.searchParams) });
            let data = [];
            if (url.pathname.endsWith('/dashboard/stats')) {
              if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
              if (failMetrics) {
                failMetrics = false;
                return route.fulfill({
                  status: 500,
                  json: { message: 'Fallo de métricas simulado' },
                });
              }
              data = metrics;
              if (url.searchParams.has('fechaDesde')) {
                const from = url.searchParams.get('fechaDesde'),
                  to = url.searchParams.get('fechaHasta');
                const selected = tickets.filter(
                  (ticket) =>
                    ticket.fechaCreacion.slice(0, 10) >= from &&
                    ticket.fechaCreacion.slice(0, 10) <= to,
                );
                const count = selected.length;
                data = {
                  ...metrics,
                  fechaDesde: from,
                  fechaHasta: to,
                  totalTickets: count,
                  ticketsAbiertos: 0,
                  ticketsEnProceso: 0,
                  ticketsResueltos: 0,
                  ticketsCerrados: count,
                  ticketsSlaCumplidos: count,
                  ticketsSlaIncumplidos: 0,
                  ticketsSlaPendientes: 0,
                  porcentajeCumplimientoSla: 100,
                  ticketsPorEstado: count ? { Cerrado: count } : {},
                  ticketsPorCategoria: count ? { 'Sistema Demo v1': count } : {},
                  ticketsPorTecnico: count ? { 'Carlos Campos': count } : {},
                  ticketsPorPrioridad: {
                    Alta: selected.filter((t) => t.prioridadNombre === 'Alta').length,
                    Media: selected.filter((t) => t.prioridadNombre === 'Media').length,
                  },
                  fechasTendencia: [
                    from.slice(8) +
                      '/' +
                      from.slice(5, 7) +
                      '–' +
                      to.slice(8) +
                      '/' +
                      to.slice(5, 7),
                  ],
                  ticketsCreadosPorFecha: [count],
                  ticketsResueltosPorFecha: [0],
                  descripcionTendencia: 'Periodo seleccionado agrupado para esta prueba.',
                };
              }
            } else if (url.pathname === '/api/v1/tickets') {
              if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
              if (failLatest) {
                failLatest = false;
                return route.fulfill({
                  status: 500,
                  json: { message: 'Fallo de recientes simulado' },
                });
              }
              const from = url.searchParams.get('fechaDesde'),
                to = url.searchParams.get('fechaHasta');
              const selected = tickets.filter(
                (ticket) =>
                  (!from || ticket.fechaCreacion.slice(0, 10) >= from) &&
                  (!to || ticket.fechaCreacion.slice(0, 10) <= to),
              );
              data = {
                content: selected,
                totalElements: from || to ? selected.length : 104,
                size: 5,
                number: 0,
              };
            } else if (/\/tickets\/\d+$/.test(url.pathname))
              data = tickets.find((t) => t.id === Number(url.pathname.split('/').at(-1)));
            else if (url.pathname.endsWith('/states'))
              data = [{ codigo: 'CERRADO', nombre: 'Cerrado' }];
            else if (url.pathname.endsWith('/users')) data = { content: [], totalElements: 0 };
            else if (url.pathname.endsWith('/users/me'))
              data = {
                id: 3,
                nombres: 'Carlos',
                apellidos: 'Campos',
                roles: [portal.role],
                estado: 'ACTIVO',
              };
            else if (url.pathname.endsWith('/count')) data = { count: 0 };
            else if (url.pathname.endsWith('/settings')) data = { enabled: false };
            await route.fulfill({ json: { success: true, data } });
          });
          await page.goto(base + portal.path);
          await page.waitForFunction(
            () =>
              document.querySelector('.db-kpi strong')?.textContent === '104' &&
              document.querySelectorAll('.db-ticket-table tbody tr').length === 5,
          );
          await page.evaluate((value) => document.body.classList.toggle('dark-theme', value), dark);
          assert.equal(
            await page.getByRole('link', { name: 'Ver tickets', exact: true }).getAttribute('href'),
            portal.list,
          );
          assert.equal(
            await page.getByRole('link', { name: 'Ver todos', exact: true }).getAttribute('href'),
            portal.list,
          );
          assert.equal(await page.locator('.db-kpi').count(), 6);
          assert.equal(await page.locator('.db-kpi strong').nth(4).textContent(), '10');
          assert.equal(await page.locator('.db-kpi strong').nth(5).textContent(), '90.38%');
          assert.equal(requests.find((r) => r.path === '/api/v1/tickets').query.size, '5');
          const donutBackground = await page
            .locator('[data-panel="estado"] .db-donut')
            .evaluate((el) => getComputedStyle(el).backgroundImage);
          assert.ok(donutBackground.includes('conic-gradient'));
          const expectedLine = dark ? 'rgb(103, 168, 255)' : 'rgb(37, 131, 239)';
          assert.equal(
            await page.locator('.db-created-line').evaluate((el) => getComputedStyle(el).stroke),
            expectedLine,
          );

          for (const width of [1920, 1024, 390]) {
            await page.setViewportSize({ width, height: width === 390 ? 844 : 1440 });
            await page.waitForTimeout(300); // Esperar también la transición del menú móvil.
            await page
              .locator('.main-content, .tech-main')
              .first()
              .evaluate((el) => (el.scrollTop = 0));
            assert.ok(
              await page
                .locator('.support-dashboard')
                .evaluate((el) => el.scrollWidth <= el.clientWidth + 1),
              `${portal.name}/${dark}/${width}: dashboard desbordado`,
            );
            assert.ok(
              await page
                .locator('.db-chart-grid')
                .evaluate((el) => el.scrollWidth <= el.clientWidth + 1),
            );
            if (width === 1920)
              assert.equal(
                await page
                  .locator('.db-kpis')
                  .evaluate(
                    (el) =>
                      new Set(
                        [...el.children].map((c) => Math.round(c.getBoundingClientRect().top)),
                      ).size,
                  ),
                1,
              );
            if (width === 390) {
              assert.equal(
                await page
                  .locator('.db-kpis')
                  .evaluate((el) => getComputedStyle(el).gridTemplateColumns.split(' ').length),
                2,
              );
              assert.equal(
                await page
                  .locator('.db-chart-grid')
                  .evaluate((el) => getComputedStyle(el).gridTemplateColumns.split(' ').length),
                1,
              );
              assert.ok(
                await page
                  .locator('.db-latest .db-table-scroll')
                  .evaluate((el) => el.scrollWidth > el.clientWidth),
              );
            }
            await page.screenshot({
              path: path.join(
                os.tmpdir(),
                `support-dashboard-${portal.name}-${dark ? 'dark' : 'light'}-${width}.png`,
              ),
              fullPage: false,
            });
            checks++;
          }
          await page.setViewportSize({ width: 1920, height: 1440 });
          await page
            .getByRole('button', { name: 'Mover Tickets por estado antes', exact: true })
            .click();
          await page.waitForFunction(
            () =>
              document.querySelector('.db-chart-grid > article')?.getAttribute('data-panel') ===
              'estado',
          );
          assert.equal(
            await page.locator('.db-chart-grid > article').first().getAttribute('data-panel'),
            'estado',
          );
          await page
            .getByRole('link', { name: 'Ver detalle de TICK-2026-0104', exact: true })
            .click();
          await page.locator('.staff-back-link').waitFor();
          assert.ok(page.url().includes(portal.detail));
          await page.locator('.staff-back-link').click();
          await page.waitForFunction(
            () => document.querySelectorAll('.db-ticket-table tbody tr').length === 5,
          );
          assert.equal(
            await page.locator('.db-chart-grid > article').first().getAttribute('data-panel'),
            'estado',
          );
          await page.getByText('Ver datos de la tendencia', { exact: true }).click();
          assert.equal(await page.locator('.db-trend-data tbody tr').count(), 7);
          await page.locator('.db-trend-data summary').click();

          // Arrastre real de paneles; el manejador mantiene el tema al moverlo.
          const grip = page.locator('[data-panel="estado"] .db-panel-grip');
          await grip.scrollIntoViewIfNeeded();
          const start = await grip.boundingBox();
          const destination = await page.locator('[data-panel="tendencia"]').boundingBox();
          const panelColor = await page
            .locator('[data-panel="estado"]')
            .evaluate((el) => getComputedStyle(el).backgroundColor);
          await page.mouse.move(start.x + 10, start.y + 12);
          await page.mouse.down();
          await page.mouse.move(start.x + 22, start.y + 24, { steps: 4 });
          await page.locator('.cdk-drag-preview').waitFor();
          assert.equal(
            await page
              .locator('.cdk-drag-preview')
              .evaluate((el) => getComputedStyle(el).backgroundColor),
            panelColor,
          );
          await page.mouse.move(
            destination.x + destination.width / 2,
            destination.y + destination.height / 2,
            { steps: 24 },
          );
          await page.waitForTimeout(150);
          await page.mouse.up();
          await page.waitForFunction(
            () =>
              !document.querySelector('.cdk-drag-preview') &&
              JSON.parse(localStorage.getItem('dashboard-chart-order'))[0] === 'tendencia' &&
              document.querySelector('.db-chart-grid > article')?.getAttribute('data-panel') ===
                'tendencia',
          );
          assert.equal(
            await page.locator('.db-chart-grid > article:not(.cdk-drag-preview)').count(),
            6,
          );
          assert.equal(
            await page.locator('.db-chart-grid > article').first().getAttribute('data-panel'),
            'tendencia',
          );
          assert.equal(
            await page.evaluate(() => JSON.parse(localStorage.getItem('dashboard-chart-order'))[0]),
            'tendencia',
          );

          failMetrics = true;
          failLatest = true;
          await page.getByRole('button', { name: 'Actualizar dashboard', exact: true }).click();
          await page.getByRole('alert').filter({ hasText: 'actualizar las métricas' }).waitFor();
          await page
            .getByRole('alert')
            .filter({ hasText: 'actualizar los tickets recientes' })
            .waitFor();
          assert.equal(await page.locator('.db-kpi strong').first().textContent(), '104');
          assert.equal(await page.locator('.db-ticket-table tbody tr').count(), 5);
          await page.getByRole('button', { name: 'Reintentar métricas', exact: true }).click();
          await page.getByRole('button', { name: 'Reintentar tickets', exact: true }).click();
          await page.waitForFunction(() => document.querySelectorAll('.db-notice').length === 0);

          metrics = {
            ...metrics,
            porcentajeCumplimientoSla: 0,
            ticketsPorCategoria: {},
            ticketsPorTecnico: {},
            ticketsCreadosPorFecha: [0, 0, 0, 0, 0, 0, 0],
            ticketsResueltosPorFecha: [0, 0, 0, 0, 0, 0, 0],
          };
          await page.getByRole('button', { name: 'Actualizar dashboard', exact: true }).click();
          await page.waitForFunction(
            () => document.querySelectorAll('.db-kpi strong')[5]?.textContent === '0.00%',
          );
          assert.equal(await page.locator('[data-panel="categoria"] .db-bars').count(), 0);
          assert.equal(await page.locator('[data-panel="tecnico"] table').count(), 0);
          assert.equal(await page.locator('.db-created-point').count(), 7);

          // El selector filtra métricas Y recientes; el rango se conserva tras el detalle.
          await page.getByLabel('Periodo del dashboard', { exact: true }).selectOption('custom');
          await page.getByLabel('Desde', { exact: true }).fill('2026-10-09');
          await page.getByLabel('Hasta', { exact: true }).fill('2026-10-10');
          await page.getByRole('button', { name: 'Aplicar periodo', exact: true }).click();
          await page.waitForFunction(
            () =>
              document.querySelector('.db-kpi strong')?.textContent === '2' &&
              document.querySelectorAll('.db-ticket-table tbody tr').length === 2,
          );
          for (const apiPath of ['/api/v1/dashboard/stats', '/api/v1/tickets']) {
            const last = requests.filter((request) => request.path === apiPath).at(-1);
            assert.equal(last.query.fechaDesde, '2026-10-09');
            assert.equal(last.query.fechaHasta, '2026-10-10');
          }
          await page
            .getByRole('link', { name: 'Ver detalle de TICK-2026-0104', exact: true })
            .click();
          await page.locator('.staff-back-link').waitFor();
          await page.locator('.staff-back-link').click();
          await page.waitForFunction(
            () =>
              document.querySelector('#dashboard-period')?.value === 'custom' &&
              document.querySelectorAll('.db-ticket-table tbody tr').length === 2,
          );
          assert.equal(await page.getByLabel('Desde', { exact: true }).inputValue(), '2026-10-09');
          const beforeInvalid = requests.length;
          await page.getByLabel('Desde', { exact: true }).fill('2026-10-15');
          await page.getByRole('button', { name: 'Aplicar periodo', exact: true }).click();
          await page.getByRole('alert').filter({ hasText: 'posterior' }).waitFor();
          assert.equal(requests.length, beforeInvalid);
          await page.getByLabel('Desde', { exact: true }).fill('2099-01-01');
          await page.getByLabel('Hasta', { exact: true }).fill('2099-01-02');
          await page.getByRole('button', { name: 'Aplicar periodo', exact: true }).click();
          await page.waitForFunction(
            () => document.querySelector('.db-kpi strong')?.textContent === '0',
          );
          await page
            .getByText('No hay tickets en el periodo seleccionado.', { exact: true })
            .waitFor();
          for (const preset of ['today', 'last7', 'last30', 'month']) {
            await page.getByLabel('Periodo del dashboard', { exact: true }).selectOption(preset);
            await page.waitForFunction(() => !document.querySelector('.db-refresh')?.disabled);
            const statsRequest = requests
              .filter((request) => request.path === '/api/v1/dashboard/stats')
              .at(-1);
            const listRequest = requests
              .filter((request) => request.path === '/api/v1/tickets')
              .at(-1);
            assert.equal(statsRequest.query.fechaDesde, listRequest.query.fechaDesde);
            assert.equal(statsRequest.query.fechaHasta, listRequest.query.fechaHasta);
            assert.ok(statsRequest.query.fechaDesde);
          }
          await page.getByLabel('Periodo del dashboard', { exact: true }).selectOption('all');
          await page.waitForFunction(
            () => document.querySelector('.db-kpi strong')?.textContent === '104',
          );
          assert.equal(
            requests.filter((request) => request.path === '/api/v1/dashboard/stats').at(-1).query
              .fechaDesde,
            undefined,
          );
          await page.getByLabel('Periodo del dashboard', { exact: true }).selectOption('custom');
          await page.setViewportSize({ width: 390, height: 844 });
          await page.waitForTimeout(300);
          await page.getByLabel('Desde', { exact: true }).fill('2026-10-01');
          await page.getByLabel('Hasta', { exact: true }).fill('2026-10-14');
          await page
            .locator('.main-content, .tech-main')
            .first()
            .evaluate((el) => (el.scrollTop = 0));
          assert.ok(
            await page
              .locator('.support-dashboard')
              .evaluate((el) => el.scrollWidth <= el.clientWidth + 1),
          );
          await page.screenshot({
            path: path.join(
              os.tmpdir(),
              `dashboard-period-${portal.name}-${dark ? 'dark' : 'light'}-390.png`,
            ),
          });
          assert.deepEqual(errors, []);
          await context.close();
        }
      console.log(
        'Dashboard verificado en ' + checks + ' combinaciones de portal/tema/resolución.',
      );
    } finally {
      await browser?.close();
      await new Promise((resolve) => server.close(resolve));
    }
  },
);
