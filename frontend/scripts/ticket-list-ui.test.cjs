// Ejecutar tras compilar: node --test scripts/ticket-list-ui.test.cjs
// Servidor local efímero y API simulada, sin tocar tickets reales.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { launchBrowser } = require('./helpers/browser.cjs');
const { installPermissionSessionDefaults } = require('./helpers/permission-session.cjs');

test(
  'listado compartido: temas, responsive, pestañas, filtros, Excel, detalle y errores',
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
          path: '/tickets/list',
          role: 'ROLE_ADMIN',
          detail: '/tickets/detail/',
          create: '/tickets/new',
        },
        {
          name: 'technician',
          path: '/tecnico',
          role: 'ROLE_TECNICO',
          detail: '/tecnico/tickets/',
          create: '/tecnico/nuevo-ticket',
        },
      ])
        for (const dark of [false, true]) {
          const context = await browser.newContext({
            viewport: { width: 1920, height: 1080 },
            acceptDownloads: true,
          });
          const page = await context.newPage();
          const errors = [],
            requests = [],
            exports = [];
          page.on('pageerror', (error) => errors.push(error.message));
          await page.addInitScript(installPermissionSessionDefaults);
          await page.addInitScript((role) => {
            const accessToken =
              'e30.' +
              btoa(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 3600 })) +
              '.test';
            localStorage.setItem(
              'user_session',
              JSON.stringify({ accessToken, roles: [role], userId: 3, fullName: 'Carlos Mendoza' }),
            );
            window.WebSocket = class {
              static OPEN = 1;
              readyState = 0;
              close() {}
              addEventListener() {}
              removeEventListener() {}
            };
          }, portal.role);
          const titles = [
            'No puedo acceder',
            'Error ftp',
            'Red mal configurada',
            'Prueba 1',
            'No puedo conectar a la VPN desde mi domicilio',
            'Pantalla azul recurrente en Laptop HP ProBook',
          ];
          const states = [
            'NUEVO',
            'NUEVO',
            'EN_PROCESO',
            'EN_PROCESO',
            'EN_PROCESO',
            'EN_PROCESO',
            'RESUELTO',
            'CERRADO',
            'ASIGNADO',
            'PENDIENTE_CLIENTE',
            'CANCELADO',
            'EN_PROCESO',
            'EN_PROCESO',
            'EN_PROCESO',
          ];
          const tickets = Array.from({ length: 14 }, (_, index) => ({
            id: index + 1,
            codigo: `TICK-2026-${String(index + 1).padStart(4, '0')}`,
            titulo: titles[index] || `Solicitud de soporte ${index + 1}`,
            descripcion: 'Descripción de prueba del ticket.',
            clienteId: 8,
            clienteNombre:
              index === 1 ? 'Carlos Mendoza' : index === 3 ? 'Administrador General' : 'Ana Torres',
            estadoCodigo: states[index],
            estadoNombre: {
              NUEVO: 'Nuevo',
              EN_PROCESO: 'En proceso',
              RESUELTO: 'Resuelto',
              CERRADO: 'Cerrado',
              ASIGNADO: 'Asignado',
              PENDIENTE_CLIENTE: 'Pendiente cliente',
              CANCELADO: 'Cancelado',
            }[states[index]],
            prioridadNombre: index === 4 ? 'Alta' : index % 2 ? 'Media' : 'Baja',
            categoriaId: index % 2 ? 2 : 1,
            categoriaNombre: index % 2 ? 'Software & Aplicaciones' : 'Redes & Conectividad',
            fechaCreacion: '2026-09-29T12:00:00',
            tecnicoNombre: 'Carlos Mendoza',
            empresaNombre: 'Corporación Demo S.A.C.',
            attachments: [],
            comentarios: [],
            historialCambios: [],
          }));
          let failList = false,
            failCounts = false;
          await page.route('**/api/v1/**', async (route) => {
            const url = new URL(route.request().url());
            let data = [];
            if (url.pathname === '/api/v1/tickets') {
              const q = url.searchParams,
                size = Number(q.get('size') || 8),
                number = Number(q.get('page') || 0);
              requests.push(Object.fromEntries(q));
              if ((size === 1 && failCounts) || (size !== 1 && failList)) {
                await route.fulfill({ status: 500, json: { message: 'Error simulado' } });
                return;
              }
              const filtered = tickets.filter(
                (t) =>
                  (!q.get('estado') || t.estadoCodigo === q.get('estado')) &&
                  (!q.get('prioridad') || t.prioridadNombre === q.get('prioridad')) &&
                  (!q.get('categoriaId') || t.categoriaId === Number(q.get('categoriaId'))) &&
                  (!q.get('busqueda') ||
                    (t.titulo + t.codigo + t.clienteNombre)
                      .toLowerCase()
                      .includes(q.get('busqueda').toLowerCase())) &&
                  (!q.get('fechaDesde') || t.fechaCreacion.slice(0, 10) >= q.get('fechaDesde')) &&
                  (!q.get('fechaHasta') || t.fechaCreacion.slice(0, 10) <= q.get('fechaHasta')),
              );
              data = {
                content: filtered.slice(number * size, (number + 1) * size),
                number,
                size,
                totalElements: filtered.length,
                totalPages: Math.ceil(filtered.length / size),
              };
            } else if (url.pathname.endsWith('/reports/tickets/excel')) {
              exports.push(Object.fromEntries(url.searchParams));
              await route.fulfill({
                contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                body: 'Excel simulado',
              });
              return;
            } else if (/\/tickets\/\d+$/.test(url.pathname))
              data = tickets.find((t) => t.id === Number(url.pathname.split('/').at(-1)));
            else if (url.pathname.endsWith('/catalogs/categories'))
              data = [
                { id: 1, nombre: 'Redes & Conectividad' },
                { id: 2, nombre: 'Software & Aplicaciones' },
              ];
            else if (url.pathname.endsWith('/catalogs/priorities'))
              data = [
                { id: 1, nombre: 'Baja' },
                { id: 2, nombre: 'Media' },
                { id: 3, nombre: 'Alta' },
              ];
            else if (url.pathname.endsWith('/users/me'))
              data = {
                id: 3,
                nombres: 'Carlos',
                apellidos: 'Mendoza',
                roles: [portal.role],
                estado: 'ACTIVO',
              };
            else if (url.pathname.endsWith('/count')) data = { count: 0 };
            else if (url.pathname.endsWith('/settings')) data = { enabled: false };
            await route.fulfill({ json: { success: true, data } });
          });
          await page.goto(base + portal.path);
          await page.locator('.staff-ticket-table tbody tr').first().waitFor();
          await page.waitForFunction(
            () => document.querySelector('.staff-status-count')?.textContent.trim() === '14',
          );
          await page.evaluate((dark) => document.body.classList.toggle('dark-theme', dark), dark);
          assert.equal(await page.locator('.staff-ticket-table tbody tr').count(), 8);
          assert.equal(
            await page.locator('.staff-status-tab').first().getAttribute('aria-pressed'),
            'true',
          );
          await page.getByRole('button', { name: /Más filtros/ }).click();
          for (const width of [1920, 1024, 390]) {
            await page.setViewportSize({ width, height: width === 390 ? 844 : 1080 });
            await page.waitForTimeout(150);
            assert.ok(
              await page
                .locator('.staff-ticket-workspace')
                .evaluate((el) => el.scrollWidth <= el.clientWidth + 1),
              `${portal.name}/${dark}/${width}: contenido desbordado`,
            );
            if (width !== 1920)
              assert.ok(
                await page
                  .locator('.staff-table-scroll')
                  .evaluate((el) => el.scrollWidth > el.clientWidth),
              );
            assert.ok(
              await page
                .locator('.staff-ticket-table td')
                .first()
                .evaluate((el) => getComputedStyle(el).borderLeftWidth === '0px'),
            );
            const css = await page.locator('#staff-ticket-search').evaluate((el) => {
              const s = getComputedStyle(el);
              return { bg: s.backgroundColor, color: s.color, border: s.borderTopColor };
            });
            assert.equal(css.bg, dark ? 'rgb(17, 29, 51)' : 'rgb(255, 255, 255)');
            assert.notEqual(css.bg, css.color);
            assert.notEqual(css.bg, css.border);
            await page.screenshot({
              path: path.join(
                os.tmpdir(),
                `staff-ticket-list-${portal.name}-${dark ? 'dark' : 'light'}-${width}.png`,
              ),
            });
            checks++;
          }
          await page.setViewportSize({ width: 1920, height: 1080 });
          await page.getByRole('button', { name: /Nuevos/ }).click();
          await page.waitForFunction(
            () => document.querySelectorAll('.staff-ticket-table tbody tr').length === 2,
          );
          assert.equal(await page.locator('#staff-ticket-state').inputValue(), 'NUEVO');
          assert.equal(
            (await page.locator('.staff-status-count').first().innerText()).trim(),
            '14',
          );
          await page.locator('#staff-ticket-priority').selectOption('Media');
          await page.waitForFunction(
            () => document.querySelectorAll('.staff-ticket-table tbody tr').length === 1,
          );
          await page
            .locator('#staff-ticket-category')
            .selectOption({ label: 'Software & Aplicaciones' });
          await page.locator('#staff-date-from').fill('2026-09-01');
          await page.locator('#staff-date-to').fill('2026-09-30');
          await page.getByRole('button', { name: 'Filtrar', exact: true }).click();
          await page.locator('.staff-detail-link').first().waitFor();
          const download = page.waitForEvent('download');
          await page.getByRole('button', { name: /Exportar Excel/ }).click();
          assert.match((await download).suggestedFilename(), /^tickets_filtrados_.*\.xlsx$/);
          assert.deepEqual(exports.at(-1), {
            estado: 'NUEVO',
            prioridad: 'Media',
            categoriaId: '2',
            fechaDesde: '2026-09-01',
            fechaHasta: '2026-09-30',
          });
          await page.locator('.staff-detail-link').first().click();
          await page.waitForURL(new RegExp(portal.detail + '2\\?returnTo='));
          await page.getByRole('button', { name: 'Volver a tickets', exact: true }).click();
          await page.waitForURL(base + portal.path);
          await page.locator('.staff-ticket-table tbody tr').first().waitFor();
          assert.equal(await page.locator('#staff-date-from').inputValue(), '2026-09-01');
          assert.equal(await page.locator('#staff-ticket-state').inputValue(), 'NUEVO');
          assert.equal(await page.locator('#staff-ticket-priority').inputValue(), 'Media');
          assert.equal(
            await page.locator('#staff-ticket-category option:checked').innerText(),
            'Software & Aplicaciones',
          );
          assert.equal(
            await page.locator('.staff-more-filters').getAttribute('aria-expanded'),
            'true',
          );
          await page.getByRole('button', { name: 'Limpiar', exact: true }).click();
          await page.waitForFunction(
            () => document.querySelectorAll('.staff-ticket-table tbody tr').length === 8,
          );
          await page.getByRole('button', { name: 'Página siguiente', exact: true }).click();
          await page.waitForFunction(
            () => document.querySelectorAll('.staff-ticket-table tbody tr').length === 6,
          );
          await page.locator('.staff-detail-link').first().click();
          await page.waitForURL(new RegExp(portal.detail + '9\\?returnTo='));
          await page.getByRole('button', { name: 'Volver a tickets', exact: true }).click();
          await page.waitForURL(base + portal.path);
          await page.locator('.staff-ticket-table tbody tr').first().waitFor();
          assert.match(await page.locator('.staff-pagination > p').innerText(), /9–14/);
          await page.locator('#staff-page-size').selectOption({ label: '12' });
          await page.waitForFunction(
            () => document.querySelectorAll('.staff-ticket-table tbody tr').length === 12,
          );
          await page.locator('#staff-date-from').fill('2026-10-08');
          await page.locator('#staff-date-to').fill('2026-09-30');
          const requestCount = requests.length;
          await page.getByRole('button', { name: 'Filtrar', exact: true }).click();
          await page.locator('.staff-filter-error').waitFor();
          assert.equal(requests.length, requestCount);
          await page.getByRole('button', { name: 'Limpiar', exact: true }).click();
          await page.locator('#staff-ticket-search').fill('no existe esta solicitud');
          await page.locator('#staff-ticket-search').press('Enter');
          await page
            .getByRole('heading', { name: 'No encontramos tickets con esos filtros', exact: true })
            .waitFor();
          await page.getByRole('button', { name: 'Limpiar filtros', exact: true }).click();
          await page.locator('.staff-ticket-table').waitFor();
          failList = true;
          await page.getByRole('button', { name: 'Filtrar', exact: true }).click();
          await page.locator('.staff-list-error').waitFor();
          assert.equal(await page.locator('.staff-list-empty').count(), 0);
          failList = false;
          await page.getByRole('button', { name: 'Reintentar', exact: true }).click();
          await page.locator('.staff-ticket-table').waitFor();
          failCounts = true;
          await page.getByRole('button', { name: 'Filtrar', exact: true }).click();
          await page.locator('.staff-counts-error').waitFor();
          assert.equal((await page.locator('.staff-status-count').first().innerText()).trim(), '—');
          assert.ok(await page.locator('.staff-ticket-table').isVisible());
          failCounts = false;
          await page.getByRole('button', { name: 'Reintentar resumen', exact: true }).click();
          await page.waitForFunction(
            () => document.querySelector('.staff-status-count')?.textContent.trim() === '14',
          );
          await page.locator('.staff-header-actions a').click();
          await page.waitForURL(base + portal.create);
          assert.deepEqual(errors, []);
          await context.close();
        }
      console.log(
        `${checks} combinaciones de tema/resolución, filtros persistentes, contadores, paginación, detalle y exportación verificados.`,
      );
    } finally {
      if (browser) await browser.close();
      await new Promise((resolve) => server.close(resolve));
    }
  },
);
