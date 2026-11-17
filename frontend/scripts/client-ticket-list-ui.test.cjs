// Ejecutar tras compilar: node --test scripts/client-ticket-list-ui.test.cjs
// Chrome local, API simulada y servidor efímero. No modifica datos reales.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { launchBrowser } = require('./helpers/browser.cjs');
const { installPermissionSessionDefaults } = require('./helpers/permission-session.cjs');

test(
  'Mis tickets: filtros, estados, detalle, paginación y diseño adaptable en ambos temas',
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
        { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.png': 'image/png' }[
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
      const tickets = Array.from({ length: 14 }, (_, index) => ({
        id: index + 1,
        codigo: `TICK-2026-${String(index + 1).padStart(4, '0')}`,
        titulo: index === 0 ? 'No puedo acceder al correo' : `Problema de conexión ${index + 1}`,
        descripcion: 'Detalle de prueba de la solicitud.',
        estadoCodigo: index < 3 ? 'NUEVO' : 'EN_PROCESO',
        estadoNombre: index < 3 ? 'Nuevo' : 'En proceso',
        prioridadNombre: index % 2 ? 'Alta' : 'Media',
        categoriaId: 2,
        categoriaNombre: 'Software',
        clienteNombre: 'Ana Torres',
        clienteId: 8,
        empresaNombre: 'Empresa cliente',
        fechaCreacion: '2026-09-29T12:00:00',
        attachments: [],
        comentarios: [],
        historialCambios: [],
      }));
      let checks = 0;
      for (const dark of [false, true]) {
        const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
        const page = await context.newPage();
        const errors = [];
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
        let failNextList = false;
        await page.route('**/api/v1/**', async (route) => {
          const url = new URL(route.request().url());
          let data = [];
          if (url.pathname.endsWith('/tickets/mine')) {
            const q = url.searchParams;
            const size = Number(q.get('size') || 8),
              number = Number(q.get('page') || 0);
            if (failNextList && size !== 1) {
              failNextList = false;
              await route.fulfill({ status: 500, json: { message: 'Error de prueba' } });
              return;
            }
            const filtered = tickets.filter(
              (t) =>
                (!q.get('estado') || t.estadoCodigo === q.get('estado')) &&
                (!q.get('prioridad') || t.prioridadNombre === q.get('prioridad')) &&
                (!q.get('categoriaId') || t.categoriaId === Number(q.get('categoriaId'))) &&
                (!q.get('busqueda') ||
                  (t.titulo + t.codigo).toLowerCase().includes(q.get('busqueda').toLowerCase())) &&
                (!q.get('fechaDesde') || t.fechaCreacion.slice(0, 10) >= q.get('fechaDesde')) &&
                (!q.get('fechaHasta') || t.fechaCreacion.slice(0, 10) <= q.get('fechaHasta')),
            );
            data = {
              content: filtered.slice(number * size, (number + 1) * size),
              size,
              number,
              totalElements: filtered.length,
              totalPages: Math.ceil(filtered.length / size),
            };
          } else if (/\/tickets\/\d+$/.test(url.pathname))
            data = tickets.find((t) => t.id === Number(url.pathname.split('/').at(-1)));
          else if (url.pathname.endsWith('/catalogs/categories'))
            data = [{ id: 2, nombre: 'Software' }];
          else if (url.pathname.endsWith('/catalogs/priorities'))
            data = [
              { id: 1, nombre: 'Media' },
              { id: 2, nombre: 'Alta' },
            ];
          else if (url.pathname.endsWith('/users/me'))
            data = { id: 8, nombres: 'Ana', apellidos: 'Torres', roles: ['ROLE_CLIENTE'] };
          else if (url.pathname.endsWith('/count')) data = { count: 0 };
          else if (url.pathname.endsWith('/settings')) data = { enabled: false };
          await route.fulfill({ json: { success: true, data } });
        });
        await page.goto(base + '/cliente/tickets');
        await page.locator('.mat-mdc-row').first().waitFor();
        await page.waitForFunction(
          () => document.querySelector('.status-tab .status-count')?.textContent.trim() === '14',
        );
        await page.evaluate((dark) => document.body.classList.toggle('dark-theme', dark), dark);
        assert.equal(await page.locator('.mat-mdc-row').count(), 8);
        assert.equal(
          await page.locator('.status-tab').first().getAttribute('aria-pressed'),
          'true',
        );
        await page.getByRole('button', { name: /Más filtros/ }).click();
        await page.locator('.advanced-filters').waitFor();
        for (const width of [1920, 1024, 390]) {
          await page.setViewportSize({ width, height: width === 390 ? 844 : 1080 });
          await page.waitForTimeout(250);
          const overflow = await page
            .locator('.client-ticket-workspace')
            .evaluate((el) => el.scrollWidth - el.clientWidth);
          assert.ok(overflow <= 1, `${dark}/${width}: overflow del contenido principal`);
          await page.screenshot({
            path: path.join(
              os.tmpdir(),
              `client-ticket-list-${dark ? 'dark' : 'light'}-${width}.png`,
            ),
          });
          checks++;
        }
        await page.setViewportSize({ width: 1920, height: 1080 });
        await page.getByRole('button', { name: /Nuevos/ }).click();
        await page.waitForFunction(() => document.querySelectorAll('.mat-mdc-row').length === 3);
        assert.equal(await page.locator('[name="estado"]').innerText(), 'Nuevo');
        // El total de Todos no cae a 3 al seleccionar un estado.
        assert.equal(
          (await page.locator('.status-tab .status-count').first().innerText()).trim(),
          '14',
        );
        await page.locator('[name="prioridad"]').click();
        await page.getByRole('option', { name: 'Media', exact: true }).click();
        await page.waitForFunction(() => document.querySelectorAll('.mat-mdc-row').length === 2);
        await page.locator('[name="categoria"]').click();
        await page.getByRole('option', { name: 'Software', exact: true }).click();
        await page.locator('#client-date-from').fill('2026-09-01');
        await page.locator('#client-date-to').fill('2026-09-30');
        await page.getByRole('button', { name: 'Filtrar', exact: true }).click();
        await page.locator('.mat-mdc-row').first().waitFor();
        await page.locator('.detail-link').first().click();
        await page.waitForURL(/\/cliente\/tickets\/1$/);
        await page.goBack();
        await page.locator('.mat-mdc-row').first().waitFor();
        assert.ok(await page.locator('.advanced-filters').isVisible());
        assert.equal(await page.locator('#client-date-from').inputValue(), '2026-09-01');
        assert.equal(await page.locator('[name="categoria"]').innerText(), 'Software');
        assert.equal(await page.locator('[name="estado"]').innerText(), 'Nuevo');
        await page.getByRole('button', { name: 'Limpiar', exact: true }).click();
        await page.waitForFunction(() => document.querySelectorAll('.mat-mdc-row').length === 8);
        await page.getByRole('button', { name: 'Página siguiente', exact: true }).click();
        await page.waitForFunction(() => document.querySelectorAll('.mat-mdc-row').length === 6);
        await page.locator('.detail-link').first().click();
        await page.waitForURL(/\/cliente\/tickets\/9$/);
        await page.goBack();
        await page.locator('.mat-mdc-row').first().waitFor();
        assert.match(await page.locator('.list-pagination p').innerText(), /9–14/);
        await page.locator('#client-ticket-search').fill('ninguna coincidencia');
        await page.getByRole('button', { name: 'Filtrar', exact: true }).click();
        await page
          .getByRole('heading', { name: 'No encontramos tickets con esos filtros' })
          .waitFor();
        await page.getByRole('button', { name: 'Limpiar filtros', exact: true }).click();
        await page.locator('.mat-mdc-row').first().waitFor();
        failNextList = true;
        await page.getByRole('button', { name: 'Filtrar', exact: true }).click();
        await page.locator('.list-error').waitFor();
        await page.getByRole('button', { name: 'Reintentar' }).click();
        await page.locator('.mat-mdc-row').first().waitFor();
        assert.deepEqual(errors, []);
        await context.close();
      }
      console.log(
        `${checks} combinaciones de tema/resolución verificadas con navegación y filtros.`,
      );
    } finally {
      if (browser) await browser.close();
      await new Promise((resolve) => server.close(resolve));
    }
  },
);
