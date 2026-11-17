// Ejecutar después de compilar. API simulada, sin modificar registros reales.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { launchBrowser } = require('./helpers/browser.cjs');
const { installPermissionSessionDefaults } = require('./helpers/permission-session.cjs');
const http = require('node:http'),
  fs = require('node:fs'),
  path = require('node:path'),
  os = require('node:os');

test(
  'Auditoría: filtros enviados al servidor, detalle, paginación, fechas, errores, móvil y temas',
  { timeout: 120000 },
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
      const context = await browser.newContext({ viewport: { width: 1846, height: 964 } });
      const page = await context.newPage(),
        errors = [],
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
            roles: ['ROLE_ADMIN'],
            userId: 1,
            fullName: 'Administrador Demo',
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
      const source = Array.from({ length: 17 }, (_, i) => ({
        id: i + 1,
        usuarioNombre:
          i % 3 === 0 ? 'No identificado' : i % 2 ? 'Carlos Campos' : 'Administrador Demo',
        accion:
          i % 4 === 0
            ? 'POST'
            : i % 4 === 1
              ? 'LOGIN_EXITOSO'
              : i % 4 === 2
                ? 'PUT_ERROR'
                : 'LOGIN_FALLIDO',
        modulo: i % 4 === 0 ? 'Auth' : i % 4 === 2 ? 'Ticket' : 'AUTENTICACION',
        detalle:
          i % 4 === 0
            ? 'POST /api/v1/auth/login ejecutado correctamente'
            : i % 4 === 1
              ? 'Inicio de sesión correcto'
              : i % 4 === 2
                ? 'PUT /api/v1/tickets/1 fallo: sin permisos'
                : 'Inicio de sesión fallido',
        ipOrigen: '127.0.0.1',
        userAgent:
          'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/156.0.0.0 Safari/537.36',
        fechaRegistro: `2026-10-${i > 8 ? '26' : '27'}T23:${String(50 - i).padStart(2, '0')}:00`,
      }));
      let fail = false;
      await page.route('**/api/v1/**', async (route) => {
        const req = route.request(),
          url = new URL(req.url());
        let data = [];
        assert.equal(req.method(), 'GET', 'Auditoría solo consulta información');
        if (url.pathname === '/api/v1/audit') {
          const p = Object.fromEntries(url.searchParams);
          requests.push(p);
          if (fail) return route.fulfill({ status: 500, json: { success: false } });
          let items = source.filter(
            (e) =>
              (!p.grupo ||
                (p.grupo === 'accesos' ? e.modulo !== 'Ticket' : e.modulo === 'Ticket')) &&
              (!p.accion || e.accion === p.accion) &&
              (!p.busqueda ||
                `${e.usuarioNombre} ${e.accion} ${e.ipOrigen}`
                  .toLowerCase()
                  .includes(p.busqueda.toLowerCase())) &&
              (!p.desde || e.fechaRegistro.slice(0, 10) >= p.desde) &&
              (!p.hasta || e.fechaRegistro.slice(0, 10) <= p.hasta),
          );
          if (p.orden === 'asc') items.reverse();
          data = {
            content: items.slice(
              Number(p.page) * Number(p.size),
              (Number(p.page) + 1) * Number(p.size),
            ),
            number: Number(p.page),
            size: Number(p.size),
            totalElements: items.length,
            totalPages: Math.ceil(items.length / Number(p.size)),
          };
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
      await page.goto(`http://127.0.0.1:${server.address().port}/audit`);
      await page.locator('.audit-table tbody tr').nth(7).waitFor();
      assert.equal(
        await page.locator('.audit-table tbody tr').first().locator('.success').count(),
        0,
        'Una solicitud de login no es un login exitoso',
      );
      assert.equal(
        await page
          .locator('.audit-table tbody tr')
          .nth(1)
          .locator('.audit-badge.success')
          .innerText(),
        'Exitoso',
      );
      for (const dark of [false, true])
        for (const width of [1846, 1024, 390, 320]) {
          await page.setViewportSize({ width, height: 964 });
          await page.evaluate((dark) => document.body.classList.toggle('dark-theme', dark), dark);
          await page.waitForTimeout(300);
          assert.ok(
            await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
            'Sin desbordamiento de página',
          );
          await page.screenshot({
            path: path.join(os.tmpdir(), `audit-${dark ? 'dark' : 'light'}-${width}.png`),
          });
        }
      await page.setViewportSize({ width: 1846, height: 964 });
      await page.evaluate(() => document.body.classList.remove('dark-theme'));
      await page.getByRole('button', { name: 'Ver detalle del evento 2', exact: true }).click();
      await page.getByRole('heading', { name: 'Detalle del evento', exact: true }).waitFor();
      assert.match(await page.locator('.audit-detail').innerText(), /Carlos Campos/);
      assert.match(await page.locator('.audit-details').innerText(), /Chrome/);
      await page.getByText('Ver datos técnicos', { exact: true }).click();
      await page.getByText(source[1].userAgent, { exact: true }).waitFor();
      await page.screenshot({ path: path.join(os.tmpdir(), 'audit-detail-desktop.png') });
      await page.setViewportSize({ width: 390, height: 964 });
      await page.waitForTimeout(300);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
      await page.screenshot({ path: path.join(os.tmpdir(), 'audit-detail-mobile.png') });
      await page.getByRole('button', { name: 'Cerrar detalle del evento' }).click();
      await page.locator('.audit-detail').waitFor({ state: 'detached' });
      await page.setViewportSize({ width: 1846, height: 964 });
      await page.getByRole('button', { name: 'Página siguiente', exact: true }).click();
      await page.waitForFunction(() =>
        document.querySelector('.audit-pagination p')?.textContent.includes('9–16'),
      );
      await page.getByRole('button', { name: 'Página 3', exact: true }).click();
      await page.waitForFunction(
        () => document.querySelectorAll('.audit-table tbody tr').length === 1,
      );
      await page.getByLabel('Buscar usuario, IP o evento', { exact: true }).fill('Carlos');
      await page.getByRole('button', { name: 'Filtrar', exact: true }).click();
      await page.waitForFunction(() =>
        document.querySelector('.audit-pagination p')?.textContent.includes('1–5'),
      );
      assert.equal(requests.at(-1).page, '0');
      assert.equal(requests.at(-1).busqueda, 'Carlos');
      await page.getByLabel('Desde', { exact: true }).fill('2026-10-28');
      await page.getByLabel('Hasta', { exact: true }).fill('2026-10-27');
      const before = requests.length;
      await page.getByRole('button', { name: 'Filtrar', exact: true }).click();
      await page.getByRole('alert').filter({ hasText: 'La fecha desde' }).waitFor();
      assert.equal(requests.length, before);
      await page.getByRole('button', { name: 'Limpiar', exact: true }).click();
      await page.locator('.audit-table tbody tr').nth(7).waitFor();
      await page.getByRole('button', { name: 'Accesos', exact: true }).click();
      await page.waitForFunction(() =>
        document.querySelector('.audit-results p')?.textContent.includes('13 eventos'),
      );
      assert.equal(requests.at(-1).grupo, 'accesos');
      await page.getByLabel('Tipo de evento', { exact: true }).selectOption('LOGIN_EXITOSO');
      await page.getByRole('button', { name: 'Filtrar', exact: true }).click();
      await page.waitForFunction(
        () => document.querySelectorAll('.audit-table tbody tr').length === 4,
      );
      await page.getByLabel('Orden:', { exact: true }).selectOption('asc');
      await page.waitForFunction(
        () => document.querySelector('.audit-event button')?.id === 'audit-event-14',
      );
      assert.equal(requests.at(-1).orden, 'asc');
      await page.getByLabel('Filas:', { exact: true }).selectOption('5');
      await page.waitForFunction(() => document.querySelector('#audit-size')?.value.includes('5'));
      await page.getByLabel('Buscar usuario, IP o evento', { exact: true }).fill('No existe');
      await page.getByRole('button', { name: 'Filtrar', exact: true }).click();
      await page.getByRole('heading', { name: 'No hay eventos con estos filtros' }).waitFor();
      fail = true;
      await page.getByRole('button', { name: 'Actualizar', exact: true }).click();
      await page.getByRole('heading', { name: 'No pudimos cargar los eventos' }).waitFor();
      assert.equal(
        await page.getByRole('heading', { name: 'No hay eventos con estos filtros' }).count(),
        0,
      );
      fail = false;
      await page.getByRole('button', { name: 'Reintentar', exact: true }).click();
      await page.getByRole('heading', { name: 'No hay eventos con estos filtros' }).waitFor();
      await page.getByRole('button', { name: 'Limpiar filtros', exact: true }).click();
      await page.locator('.audit-table tbody tr').nth(4).waitFor();
      assert.deepEqual(errors, []);
      await context.close();
    } finally {
      await browser?.close();
      await new Promise((resolve) => server.close(resolve));
    }
  },
);
