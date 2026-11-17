// node --test scripts/kanban-ui.test.cjs (tras npm run build)
// Chromium de Playwright + API/socket simulados; no modifica registros reales.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { launchBrowser } = require('./helpers/browser.cjs');
const { installPermissionSessionDefaults } = require('./helpers/permission-session.cjs');

test(
  'Kanban compartido: temas, responsive, filtros persistentes, arrastre, rollback y realtime',
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
      let combinations = 0;
      for (const portal of [
        {
          name: 'admin',
          path: '/tickets/kanban',
          role: 'ROLE_ADMIN',
          list: '/tickets/list',
          create: '/tickets/new',
          detail: '/tickets/detail/',
        },
        {
          name: 'technician',
          path: '/tecnico/kanban',
          role: 'ROLE_TECNICO',
          list: '/tecnico',
          create: '/tecnico/nuevo-ticket',
          detail: '/tecnico/tickets/',
        },
      ])
        for (const dark of [false, true]) {
          console.log('Checking ' + portal.name + '/' + (dark ? 'dark' : 'light'));
          const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
          const page = await context.newPage(),
            errors = [],
            requests = [],
            patches = [];
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
              JSON.stringify({
                accessToken,
                roles: [role],
                userId: 3,
                fullName: role === 'ROLE_ADMIN' ? 'Administrador General' : 'Carlos Mendoza',
              }),
            );
            window.__sockets = [];
            window.WebSocket = class {
              static OPEN = 1;
              static CONNECTING = 0;
              readyState = 1;
              constructor() {
                window.__sockets.push(this);
                setTimeout(() => this.onopen?.(), 0);
              }
              send(data) {
                this.subscription = JSON.parse(data);
              }
              close() {}
              addEventListener() {}
              removeEventListener() {}
            };
          }, portal.role);
          const titles = [
            'No puedo acceder',
            'Error ftp',
            '1prueba',
            'Red mal configurada',
            'Prueba 1',
            'No puedo conectar la VPN desde mi domicilio',
            'Pantalla azul recurrente en Laptop HP ProBook',
          ];
          const ids = [6, 5, 7, 4, 3, 1, 2];
          const tickets = titles.map((title, i) => ({
            id: ids[i],
            codigo: `TICK-2026-${String(ids[i]).padStart(4, '0')}`,
            titulo: title,
            descripcion: 'Descripción de la incidencia de prueba.',
            clienteId: 8,
            clienteNombre:
              i === 1 ? 'Carlos Mendoza' : i === 4 ? 'Administrador General' : 'Ana Torres',
            clienteEmail: 'ana@example.test',
            estadoCodigo: i < 2 ? 'NUEVO' : 'EN_PROCESO',
            estadoNombre: i < 2 ? 'Nuevo' : 'En proceso',
            prioridadNombre: i === 0 || i === 4 ? 'Baja' : i === 5 ? 'Alta' : 'Media',
            tecnicoId: i < 2 ? undefined : 3,
            tecnicoNombre: i < 2 ? undefined : 'Carlos Mendoza',
            empresaNombre: 'Corporación Demo S.A.C.',
            areaNombre: 'Recursos Humanos',
            categoriaNombre: 'Redes & Conectividad',
            fechaCreacion: '2026-09-29T12:00:00',
            attachments: [],
            comentarios: [],
            historialCambios: [],
          }));
          let failPatch = false,
            failLoad = false;
          await page.route('**/api/v1/**', async (route) => {
            const request = route.request(),
              url = new URL(request.url());
            let data = [];
            if (url.pathname === '/api/v1/tickets') {
              requests.push(Object.fromEntries(url.searchParams));
              if (failLoad) {
                failLoad = false;
                return route.fulfill({ status: 500, json: { message: 'Error de carga simulado' } });
              }
              const pageIndex = Number(url.searchParams.get('page') || 0),
                size = Number(url.searchParams.get('size') || 10);
              data = {
                content: tickets.slice(pageIndex * size, (pageIndex + 1) * size),
                totalElements: tickets.length,
                number: pageIndex,
                size,
              };
            } else if (url.pathname.endsWith('/estado')) {
              patches.push(url.searchParams.get('nuevoEstadoCodigo'));
              await new Promise((resolve) => setTimeout(resolve, 200));
              if (failPatch) {
                failPatch = false;
                return route.fulfill({
                  status: 500,
                  json: { message: 'Error de estado simulado' },
                });
              }
              const id = Number(url.pathname.split('/').at(-2)),
                ticket = tickets.find((t) => t.id === id);
              ticket.estadoCodigo = url.searchParams.get('nuevoEstadoCodigo');
              ticket.estadoNombre = ticket.estadoCodigo === 'RESUELTO' ? 'Resuelto' : 'En proceso';
              if (portal.name === 'technician') {
                ticket.tecnicoId = 3;
                ticket.tecnicoNombre = 'Carlos Mendoza';
              }
              data = ticket;
            } else if (/\/tickets\/\d+$/.test(url.pathname))
              data = tickets.find((t) => t.id === Number(url.pathname.split('/').at(-1)));
            else if (url.pathname.endsWith('/states'))
              data = [
                { codigo: 'NUEVO', nombre: 'Nuevo' },
                { codigo: 'EN_PROCESO', nombre: 'En proceso' },
                { codigo: 'RESUELTO', nombre: 'Resuelto' },
                { codigo: 'CERRADO', nombre: 'Cerrado' },
              ];
            else if (url.pathname.endsWith('/users'))
              data = {
                content: [
                  {
                    id: 3,
                    nombres: 'Carlos',
                    apellidos: 'Mendoza',
                    roles: ['ROLE_TECNICO'],
                    estado: 'ACTIVO',
                  },
                ],
                totalElements: 1,
              };
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
          await page.waitForFunction(
            () => document.querySelectorAll('.staff-kanban-card').length === 7,
          );
          await page.evaluate((dark) => document.body.classList.toggle('dark-theme', dark), dark);
          assert.equal(
            await page.getByRole('link', { name: 'Ver lista de tickets' }).getAttribute('href'),
            portal.list,
          );
          assert.equal(
            await page.getByRole('link', { name: 'Nuevo ticket' }).getAttribute('href'),
            portal.create,
          );
          assert.equal(await page.locator('.staff-kanban-empty').count(), 2);
          for (const width of [1920, 1024, 390]) {
            await page.setViewportSize({ width, height: width === 390 ? 844 : 1080 });
            await page.waitForTimeout(120);
            assert.ok(
              await page
                .locator('.staff-kanban-workspace')
                .evaluate((el) => el.scrollWidth <= el.clientWidth + 1),
              `${portal.name}/${dark}/${width}: desbordamiento de la página`,
            );
            const geometry = await page.locator('.staff-kanban-board').evaluate((el) => ({
              client: el.clientWidth,
              scroll: el.scrollWidth,
              columns: [...el.children].map((c) => c.getBoundingClientRect().width),
            }));
            if (width === 1920) {
              assert.ok(geometry.scroll <= geometry.client + 1);
              assert.ok(Math.max(...geometry.columns) - Math.min(...geometry.columns) < 2);
            } else
              assert.ok(
                geometry.scroll > geometry.client,
                'Kanban debe desplazarse horizontalmente',
              );
            assert.ok(
              await page
                .locator('#board-search')
                .evaluate(
                  (el) =>
                    getComputedStyle(el).borderTopColor !== getComputedStyle(el).backgroundColor,
                ),
            );
            await page.screenshot({
              path: path.join(
                os.tmpdir(),
                `kanban-${portal.name}-${dark ? 'dark' : 'light'}-${width}.png`,
              ),
              fullPage: false,
            });
            combinations++;
          }
          await page.setViewportSize({ width: 1920, height: 1080 });
          await page.locator('.staff-kanban-board').evaluate((el) => (el.scrollLeft = 0));
          await page.locator('#board-search').fill('VPN');
          await page.waitForFunction(
            () => document.querySelectorAll('.staff-kanban-card').length === 1,
          );
          assert.equal(
            await page.locator('#board-search').evaluate((el) => document.activeElement === el),
            true,
          );
          await page.locator('#board-priority').selectOption('Alta');
          await page.locator('#board-technician').selectOption('3');
          await page.getByRole('button', { name: 'Ver detalle de TICK-2026-0001' }).click();
          await page.locator('.staff-back-link').waitFor();
          assert.ok(page.url().includes(portal.detail + '1'));
          await page.locator('.staff-back-link').click();
          await page.locator('#board-search').waitFor();
          // ngModel restaura los controles en una microtarea después de crear la vista.
          await page.waitForFunction(
            () => document.querySelector('#board-search')?.value === 'VPN',
          );
          assert.equal(await page.locator('#board-search').inputValue(), 'VPN');
          assert.equal(await page.locator('#board-priority').inputValue(), 'Alta');
          assert.equal(await page.locator('#board-technician').inputValue(), '3');
          await page.getByRole('button', { name: 'Limpiar', exact: true }).click();
          await page.waitForFunction(
            () => document.querySelectorAll('.staff-kanban-card').length === 7,
          );

          const drag = async (source, target, inspectPreview = false) => {
            const start = await page
              .locator(source + ' .staff-kanban-grip')
              .first()
              .boundingBox();
            const end = await page.locator(target).boundingBox();
            const color = await page
              .locator(source + ' .staff-kanban-card')
              .first()
              .evaluate((el) => getComputedStyle(el).backgroundColor);
            await page.mouse.move(start.x + start.width / 2, start.y + start.height / 2);
            await page.mouse.down();
            await page.mouse.move(start.x + start.width / 2 + 12, start.y + start.height / 2 + 12, {
              steps: 4,
            });
            await page.locator('.cdk-drag-preview').waitFor();
            if (inspectPreview)
              assert.equal(
                await page
                  .locator('.cdk-drag-preview')
                  .evaluate((el) => getComputedStyle(el).backgroundColor),
                color,
                'vista de arrastre conserva tema',
              );
            await page.mouse.move(end.x + end.width / 2, end.y + 50, { steps: 24 });
            await page.waitForTimeout(150);
            await page.mouse.up();
          };
          await drag('#NUEVO', '#RESUELTO', true);
          await page.waitForFunction(() =>
            document.querySelector('#RESUELTO .staff-kanban-code')?.textContent.includes('0006'),
          );
          await page.waitForFunction(() =>
            document
              .querySelector('.staff-kanban-feedback')
              ?.textContent.includes('estado actualizado'),
          );
          await page.waitForFunction(
            () =>
              document.querySelector('.staff-kanban-board').getAttribute('aria-busy') === 'false',
          );
          assert.equal(patches.length, 1);
          assert.equal(tickets[0].estadoCodigo, 'RESUELTO');
          failPatch = true;
          await drag('#EN_PROCESO', '#RESUELTO');
          await page
            .getByRole('alert')
            .filter({ hasText: 'volvió a su columna anterior' })
            .waitFor();
          assert.equal(await page.locator('#EN_PROCESO .staff-kanban-card').count(), 5);
          assert.equal(patches.length, 2);
          const closed = {
            ...tickets[1],
            id: 8,
            codigo: 'TICK-2026-0008',
            estadoCodigo: 'CERRADO',
            estadoNombre: 'Cerrado',
          };
          tickets.push(closed);
          const previousRequests = requests.length;
          await page.evaluate(() =>
            window.__sockets
              .at(-1)
              .onmessage({ data: JSON.stringify({ type: 'kanban-updated', scope: 'KANBAN' }) }),
          );
          await page.locator('#CERRADO .staff-kanban-card').waitFor();
          assert.ok(requests.length > previousRequests);
          assert.equal(
            await page.locator('#CERRADO .staff-kanban-grip').count(),
            portal.name === 'admin' ? 1 : 0,
          );
          assert.equal(
            await page
              .locator('#CERRADO .staff-kanban-card')
              .evaluate((el) => el.classList.contains('cdk-drag-disabled')),
            portal.name !== 'admin',
          );
          failLoad = true;
          await page.getByRole('button', { name: 'Actualizar tablero', exact: true }).click();
          await page.getByRole('alert').filter({ hasText: 'últimos datos cargados' }).waitFor();
          assert.equal(await page.locator('.staff-kanban-card').count(), 8);
          await page.getByRole('button', { name: 'Reintentar', exact: true }).click();
          await page.waitForFunction(
            () =>
              !document.querySelector('.staff-kanban-error')?.textContent.includes('últimos datos'),
          );
          assert.deepEqual(errors, []);
          await context.close();
        }
      console.log('Combinaciones de portal/tema/resolución verificadas: ' + combinations);
    } finally {
      await browser?.close();
      await new Promise((resolve) => server.close(resolve));
    }
  },
);
