// Ejecutar tras compilar: node --test scripts/client-home-ui.test.cjs
// Chrome local y API simulada: no utiliza usuarios ni tickets reales.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { launchBrowser } = require('./helpers/browser.cjs');
const { installPermissionSessionDefaults } = require('./helpers/permission-session.cjs');

test(
  'inicio del cliente: datos reales paginados, temas, responsive, navegación, errores y estado vacío',
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
      let combinations = 0;
      for (const dark of [false, true]) {
        const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
        const page = await context.newPage();
        const errors = [],
          requests = [];
        page.on('pageerror', (error) => errors.push(error.message));
        await page.addInitScript(installPermissionSessionDefaults);
        await page.addInitScript(() => {
          const accessToken =
            'e30.' + btoa(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 3600 })) + '.test';
          localStorage.setItem(
            'user_session',
            JSON.stringify({
              accessToken,
              roles: ['ROLE_CLIENTE'],
              userId: 8,
              fullName: 'Ana Torres',
            }),
          );
          window.WebSocket = class {
            static OPEN = 1;
            readyState = 0;
            close() {}
            addEventListener() {}
            removeEventListener() {}
          };
        });
        const tickets = [
          {
            id: 6,
            codigo: 'TICK-2026-0006',
            titulo: 'No puedo acceder',
            estadoCodigo: 'NUEVO',
            estadoNombre: 'Nuevo',
            prioridadNombre: 'Baja',
            fechaCreacion: '2026-09-29T00:53:00',
          },
          {
            id: 4,
            codigo: 'TICK-2026-0004',
            titulo: 'Red mal configurada',
            estadoCodigo: 'EN_PROCESO',
            estadoNombre: 'En proceso',
            prioridadNombre: 'Media',
            fechaCreacion: '2026-08-24T10:00:00',
          },
          {
            id: 1,
            codigo: 'TICK-2026-0001',
            titulo: 'No puedo conectar a la VPN',
            estadoCodigo: 'EN_PROCESO',
            estadoNombre: 'En proceso',
            prioridadNombre: 'Alta',
            fechaCreacion: '2026-08-23T10:00:00',
          },
          {
            id: 2,
            codigo: 'TICK-2026-0002',
            titulo: 'Pantalla azul en mi laptop',
            estadoCodigo: 'PENDIENTE_CLIENTE',
            estadoNombre: 'Pendiente cliente',
            prioridadNombre: 'Crítica',
            fechaCreacion: '2026-08-22T10:00:00',
          },
        ].map((ticket) => ({
          ...ticket,
          descripcion: 'Descripción de la solicitud de prueba.',
          clienteId: 8,
          clienteNombre: 'Ana Torres',
          categoriaNombre: 'Software',
          tecnicoNombre: 'Carlos Mendoza',
          attachments: [],
          comentarios: [],
          historialCambios: [],
        }));
        let empty = false,
          failRecent = false,
          failMetrics = false;
        const totals = {
          '': 64,
          NUEVO: 10,
          ASIGNADO: 5,
          EN_PROCESO: 30,
          PENDIENTE_CLIENTE: 4,
          RESUELTO: 10,
          CERRADO: 5,
        };
        await page.route('**/api/v1/**', async (route) => {
          const url = new URL(route.request().url());
          let data = [];
          if (url.pathname.endsWith('/tickets/mine')) {
            const size = Number(url.searchParams.get('size') || 8),
              state = url.searchParams.get('estado') || '';
            requests.push({ size, state, page: url.searchParams.get('page') });
            if ((size === 4 && failRecent) || (size === 1 && failMetrics)) {
              await route.fulfill({ status: 500, json: { message: 'Error simulado' } });
              return;
            }
            data = {
              totalElements: empty ? 0 : totals[state] || 0,
              number: 0,
              size,
              content: empty
                ? []
                : tickets
                    .filter((ticket) => !state || ticket.estadoCodigo === state)
                    .slice(0, size),
            };
          } else if (/\/tickets\/\d+$/.test(url.pathname))
            data = tickets.find((ticket) => ticket.id === Number(url.pathname.split('/').at(-1)));
          else if (url.pathname.endsWith('/users/me'))
            data = {
              id: 8,
              nombres: 'Ana',
              apellidos: 'Torres',
              email: 'ana@example.test',
              empresaId: 1,
              empresaNombre: 'Corporación Demo',
              areaId: 2,
              areaNombre: 'Recursos Humanos',
              roles: ['ROLE_CLIENTE'],
            };
          else if (url.pathname.endsWith('/count')) data = { count: 0 };
          else if (url.pathname.endsWith('/settings')) data = { enabled: false };
          await route.fulfill({ json: { success: true, data } });
        });
        await page.goto(base + '/cliente');
        await page.locator('.home-recent-table tbody tr').first().waitFor();
        await page.waitForFunction(
          () => document.querySelectorAll('.home-stat strong')[1]?.textContent.trim() === '49',
        );
        await page.evaluate((dark) => document.body.classList.toggle('dark-theme', dark), dark);
        assert.deepEqual(await page.locator('.home-stat strong').allTextContents(), [
          '64',
          '49',
          '15',
        ]);
        assert.equal(await page.locator('.home-recent-table tbody tr').count(), 4);
        assert.equal(requests.filter((request) => request.size === 4).length, 1);
        assert.equal(requests.filter((request) => request.size === 1).length, 6);
        assert.match(
          await page.locator('.home-ticket-title').first().innerText(),
          /No puedo acceder/,
        );
        for (const width of [1920, 1024, 390]) {
          await page.setViewportSize({ width, height: width === 390 ? 844 : 1080 });
          await page.waitForTimeout(150);
          assert.ok(
            await page
              .locator('.client-home-workspace')
              .evaluate((el) => el.scrollWidth <= el.clientWidth + 1),
            `${dark}/${width}: desbordamiento del contenido`,
          );
          const isHorizontal = await page.locator('.home-content-grid').evaluate((el) => {
            const main = el.querySelector('.home-recent').getBoundingClientRect(),
              side = el.querySelector('.home-side-column').getBoundingClientRect();
            return side.x > main.x + 10 && Math.abs(side.y - main.y) < 1;
          });
          assert.equal(isHorizontal, width === 1920);
          if (width === 390)
            assert.ok(
              await page
                .locator('.home-recent-table-scroll')
                .evaluate((el) => el.scrollWidth > el.clientWidth),
            );
          await page.screenshot({
            path: path.join(os.tmpdir(), `client-home-${dark ? 'dark' : 'light'}-${width}.png`),
          });
          combinations++;
        }
        await page.setViewportSize({ width: 1920, height: 1080 });
        await page.locator('.home-detail-link').first().click();
        await page.waitForURL(/\/cliente\/tickets\/6\?returnTo=/);
        await page.getByRole('heading', { name: 'No puedo acceder', exact: true }).waitFor();
        await page.getByRole('button', { name: 'Volver a tickets', exact: true }).click();
        await page.waitForURL(base + '/cliente');
        await page.locator('.home-recent-table').waitFor();
        await page.locator('.home-new-ticket').click();
        await page.waitForURL(/\/cliente\/nuevo-ticket$/);
        await page.goBack();
        await page.locator('.home-new-ticket').waitFor();
        await page.locator('.home-all-tickets').click();
        await page.waitForURL(/\/cliente\/tickets$/);
        await page.goBack();
        await page.locator('.home-shortcut').first().waitFor();
        await page.locator('.home-shortcut').last().click();
        await page.waitForURL(/\/cliente\/perfil$/);
        await page.goBack();
        await page.locator('.home-shortcut').first().waitFor();
        failRecent = true;
        await page.reload();
        await page.locator('.home-list-error').waitFor();
        assert.equal((await page.locator('.home-stat strong').first().innerText()).trim(), '—');
        assert.equal(
          await page.getByRole('heading', { name: 'Aún no tienes tickets', exact: true }).count(),
          0,
        );
        failRecent = false;
        await page.getByRole('button', { name: 'Reintentar', exact: true }).click();
        await page.locator('.home-recent-table').waitFor();
        failMetrics = true;
        await page.reload();
        await page.locator('.home-summary-error').waitFor();
        await page.locator('.home-recent-table').waitFor();
        assert.deepEqual(await page.locator('.home-stat strong').allTextContents(), [
          '64',
          '—',
          '—',
        ]);
        failMetrics = false;
        await page.getByRole('button', { name: 'Reintentar resumen', exact: true }).click();
        await page.waitForFunction(
          () => document.querySelectorAll('.home-stat strong')[1]?.textContent.trim() === '49',
        );
        empty = true;
        await page.reload();
        await page.getByRole('heading', { name: 'Aún no tienes tickets', exact: true }).waitFor();
        await page.waitForFunction(() =>
          [...document.querySelectorAll('.home-stat strong')].every(
            (el) => el.textContent.trim() === '0',
          ),
        );
        assert.ok(await page.getByRole('link', { name: /Crear mi primer ticket/ }).isVisible());
        assert.deepEqual(errors, []);
        await context.close();
      }
      console.log(
        `${combinations} combinaciones de tema/resolución, totales >50, navegación y fallos verificados.`,
      );
    } finally {
      if (browser) await browser.close();
      await new Promise((resolve) => server.close(resolve));
    }
  },
);
