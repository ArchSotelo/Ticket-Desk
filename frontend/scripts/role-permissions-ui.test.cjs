// Navegador y API simulada: comprueba menús y navegación sin usar cuentas reales.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http'),
  fs = require('node:fs'),
  path = require('node:path');
const { launchBrowser } = require('./helpers/browser.cjs');

test(
  'cuatro roles: menús por permiso, administración restringida y roles retirados sin portal',
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
    const browser = await launchBrowser({ headless: true });
    const all = [
      'USER_MANAGE',
      'ORGANIZATION_MANAGE',
      'CATEGORY_MANAGE',
      'SERVICE_CONFIG_MANAGE',
      'AUDIT_VIEW',
      'CONTACT_READ',
      'REPORT_VIEW',
      'TICKET_ASSIGN',
    ];
    const cases = [
      { role: 'ROLE_ADMIN', permissions: all, landing: '/dashboard' },
      {
        role: 'ROLE_SUPERVISOR',
        permissions: ['AUDIT_VIEW', 'CONTACT_READ', 'REPORT_VIEW', 'TICKET_ASSIGN'],
        landing: '/dashboard',
      },
      {
        role: 'ROLE_TECNICO',
        permissions: ['CONTACT_READ', 'REPORT_VIEW'],
        landing: '/tecnico/dashboard',
      },
      { role: 'ROLE_CLIENTE', permissions: [], landing: '/cliente' },
      { role: 'ROLE_ADMIN', permissions: [], landing: '/dashboard' },
      { role: 'ROLE_HELPDESK', permissions: [], landing: '/auth/login' },
      { role: 'ROLE_INVITADO', permissions: [], landing: '/auth/login' },
    ];
    try {
      for (const actor of cases) {
        const context = await browser.newContext(),
          page = await context.newPage(),
          errors = [],
          requests = [];
        page.on('pageerror', (e) => errors.push(e.message));
        await page.addInitScript((actor) => {
          const token = 'e30.' + btoa(JSON.stringify({ exp: Date.now() / 1000 + 3600 })) + '.test';
          localStorage.setItem(
            'user_session',
            JSON.stringify({
              accessToken: token,
              userId: 1,
              fullName: 'Usuario de prueba',
              roles: [actor.role],
              permissions: actor.permissions,
            }),
          );
          window.WebSocket = class {
            static OPEN = 1;
            readyState = 0;
            close() {}
            addEventListener() {}
            removeEventListener() {}
          };
        }, actor);
        await page.route('**/api/v1/**', async (route) => {
          const url = new URL(route.request().url());
          requests.push(url.pathname);
          let data = {
            content: [],
            totalElements: 0,
            totalPages: 0,
            size: 10,
            number: 0,
            first: true,
            last: true,
            empty: true,
          };
          if (url.pathname.endsWith('/users/me'))
            data = {
              id: 1,
              username: 'test',
              nombres: 'Usuario',
              apellidos: 'Prueba',
              roles: [actor.role],
              permissions: actor.permissions,
              estado: 'ACTIVO',
              empresaId: 1,
            };
          else if (url.pathname.endsWith('/dashboard/stats'))
            data = {
              totalTickets: 0,
              ticketsAbiertos: 0,
              ticketsCerrados: 0,
              ticketsVencidos: 0,
              cumplimientoSla: 100,
              ticketsPorEstado: {},
              ticketsPorPrioridad: {},
              ticketsPorCategoria: {},
              ticketsPorMes: [],
              cargaPorTecnico: [],
            };
          else if (url.pathname.includes('/notifications'))
            data = url.pathname.endsWith('/unread') ? [] : { count: 0 };
          else if (url.pathname.includes('/catalogs/') || url.pathname.endsWith('/empresas'))
            data = [];
          await route.fulfill({ json: { success: true, data } });
        });
        const base = 'http://127.0.0.1:' + server.address().port;
        await page.goto(base + '/dashboard', { waitUntil: 'domcontentloaded' });
        await page.waitForURL((url) => url.pathname === actor.landing);
        const selector =
          actor.landing === '/auth/login'
            ? 'app-login'
            : actor.role === 'ROLE_CLIENTE'
              ? 'app-client-layout'
              : actor.role === 'ROLE_TECNICO'
                ? 'app-technician-layout'
                : 'app-sidebar';
        await page.locator(selector).waitFor();
        if (selector === 'app-sidebar') {
          assert.equal(
            await page.locator('app-sidebar a[href="/users"]').count(),
            actor.permissions.includes('USER_MANAGE') ? 1 : 0,
          );
          assert.equal(
            await page.locator('app-sidebar a[href="/ajustes"]').count(),
            actor.permissions.includes('SERVICE_CONFIG_MANAGE') ? 1 : 0,
          );
          assert.equal(
            await page.locator('app-sidebar a[href="/audit"]').count(),
            actor.permissions.includes('AUDIT_VIEW') ? 1 : 0,
          );
        }
        if (!actor.permissions.includes('USER_MANAGE')) {
          await page.goto(base + '/users', { waitUntil: 'domcontentloaded' });
          await page.waitForURL((url) => url.pathname === actor.landing);
          assert.equal(
            requests.includes('/api/v1/users'),
            false,
            actor.role + ' no debe consultar administración de usuarios',
          );
        }
        if (!actor.permissions.includes('AUDIT_VIEW')) {
          await page.goto(base + '/audit', { waitUntil: 'domcontentloaded' });
          await page.waitForURL((url) => url.pathname === actor.landing);
          assert.equal(requests.includes('/api/v1/audit'), false);
        }
        assert.deepEqual(errors, [], actor.role + ' sin errores de interfaz');
        await context.close();
      }
    } finally {
      await browser.close();
      await new Promise((resolve) => server.close(resolve));
    }
  },
);
