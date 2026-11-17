// node --test scripts/settings-hub-ui.test.cjs (después de npm run build).
// API simulada: no guarda configuraciones reales ni envía correos.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { launchBrowser } = require('./helpers/browser.cjs');
const { installPermissionSessionDefaults } = require('./helpers/permission-session.cjs');
async function waitForCards(page, available, upcoming) {
  await page.waitForFunction(
    ([active, soon]) =>
      document.querySelectorAll('.hub-available-card').length === active &&
      document.querySelectorAll('.hub-soon-card').length === soon,
    [available, upcoming],
  );
}

test(
  'Ajustes: ocho diseños, categorías reales, búsqueda, retorno y editores existentes',
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
      for (const dark of [false, true]) {
        console.log('Ajustes/' + (dark ? 'dark' : 'light'));
        const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } }),
          page = await context.newPage(),
          errors = [],
          requests = [];
        page.on('pageerror', (error) => errors.push(error.message));
        await page.addInitScript(installPermissionSessionDefaults);
        await page.addInitScript((dark) => {
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
        }, dark);
        const email = {
          enabled: true,
          onTicketCreated: true,
          onAssigned: true,
          onStatusChanged: true,
          onReply: true,
          onAttachment: false,
          onSla: true,
          ticketCreatedSubject: 'Creado API',
          ticketCreatedBody: 'Cuerpo creado API',
          assignedSubject: 'Asignado API',
          assignedBody: 'Cuerpo asignado API',
        };
        const service = {
          diasPorVencer: 5,
          recordatorioVencido: true,
          asuntoRecordatorio: 'Recordatorio API',
          plantillaRecordatorio: 'Contenido API',
          asuntoPorVencer: 'Por vencer API',
          plantillaPorVencer: 'Aviso por vencer API',
          asuntoVencido: 'Vencido API',
          plantillaVencido: 'Aviso vencido API',
        };
        await page.route('**/api/v1/**', async (route) => {
          const req = route.request(),
            url = new URL(req.url()),
            method = req.method();
          requests.push({
            path: url.pathname,
            method,
            body: method === 'GET' ? null : req.postDataJSON(),
          });
          let data = [];
          if (url.pathname === '/api/v1/notifications/settings') {
            if (method === 'PUT') Object.assign(email, req.postDataJSON());
            else assert.equal(method, 'GET');
            data = email;
          } else if (url.pathname === '/api/v1/service-settings') {
            if (method === 'PUT') Object.assign(service, req.postDataJSON());
            else assert.equal(method, 'GET');
            data = service;
          } else if (url.pathname === '/api/v1/notifications/email/status')
            data = { enabled: true, configured: true };
          else if (url.pathname === '/api/v1/service-categories') data = [];
          else if (url.pathname.endsWith('/users/me'))
            data = {
              id: 1,
              nombres: 'Administrador',
              apellidos: 'Demo',
              roles: ['ROLE_ADMIN'],
              estado: 'ACTIVO',
            };
          else if (url.pathname.endsWith('/count')) data = { count: 0 };
          else if (url.pathname === '/api/v1/notifications/email/test')
            assert.fail('La navegación y la búsqueda no deben enviar correos');
          else
            assert.equal(
              method,
              'GET',
              'No se permiten escrituras fuera de los formularios probados',
            );
          await route.fulfill({ json: { success: true, data } });
        });
        await page.goto(origin + '/ajustes');
        await page.getByRole('heading', { name: 'Ajustes', exact: true }).waitFor();
        assert.equal(await page.locator('.hub-available-card').count(), 3);
        assert.equal(await page.locator('.hub-soon-card').count(), 4);
        assert.equal(
          await page
            .locator('.hub-soon-card button, .hub-soon-card a, .hub-soon-card [tabindex]')
            .count(),
          0,
        );
        assert.equal(await page.locator('.hub-service-grid .hub-available-card').count(), 2);
        for (const width of [1920, 1024, 390, 320]) {
          await page.setViewportSize({ width, height: width <= 390 ? 844 : 1080 });
          await page.waitForTimeout(300);
          await page.locator('.main-content').evaluate((el) => (el.scrollTop = 0));
          for (const selector of [
            '.settings-hub',
            '.hub-layout',
            '.hub-nav',
            '.hub-content',
            '.hub-search',
            '.hub-service-grid',
            '.hub-upcoming-grid',
          ])
            assert.ok(
              await page.locator(selector).evaluate((el) => el.scrollWidth <= el.clientWidth + 1),
              selector + ' sin desbordamiento a ' + width,
            );
          assert.ok(
            await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
          );
          if (width === 1920) {
            assert.ok(await page.locator('.settings-hub').evaluate((el) => el.clientWidth > 1450));
            assert.ok(
              await page
                .locator('.hub-layout')
                .evaluate(
                  (el) =>
                    el.getBoundingClientRect().bottom <=
                    document.querySelector('.main-content').getBoundingClientRect().bottom + 1,
                ),
              'Todo el directorio cabe en escritorio',
            );
          }
          await page.screenshot({
            path: path.join(os.tmpdir(), `settings-hub-${dark ? 'dark' : 'light'}-${width}.png`),
          });
          layouts++;
        }
        // La categoría funciona también en móvil y mantiene la misma URL.
        await page.getByRole('button', { name: 'Servicios', exact: true }).click();
        await waitForCards(page, 2, 0);
        assert.equal(page.url(), origin + '/ajustes');
        assert.equal(await page.locator('.hub-available-card').count(), 2);
        assert.equal(await page.locator('.hub-soon-card').count(), 0);
        assert.equal(
          await page
            .getByRole('button', { name: 'Servicios', exact: true })
            .getAttribute('aria-pressed'),
          'true',
        );
        await page.getByRole('button', { name: 'Seguridad', exact: true }).click();
        await waitForCards(page, 0, 1);
        await page
          .locator('.hub-nav')
          .getByRole('button', { name: 'Notificaciones', exact: true })
          .click();
        await waitForCards(page, 1, 2);
        await page.getByRole('button', { name: 'General', exact: true }).click();
        await page.getByLabel('Buscar configuración', { exact: true }).fill('configuracion CORREO');
        await waitForCards(page, 1, 0);
        await page.getByRole('button', { name: 'Servicios', exact: true }).click();
        await page
          .getByRole('heading', { name: 'No hay configuraciones con estos filtros', exact: true })
          .waitFor();
        await page.getByRole('button', { name: 'Limpiar búsqueda', exact: true }).click();
        await waitForCards(page, 2, 0);
        await page.getByLabel('Buscar configuración', { exact: true }).fill('iconos');
        await waitForCards(page, 1, 0);
        assert.equal(
          requests.filter((req) => req.method !== 'GET').length,
          0,
          'Los filtros no guardan preferencias del servidor',
        );
        await page.setViewportSize({ width: 1920, height: 1080 });
        await page.waitForTimeout(300);
        await page.getByRole('button', { name: 'Tipos de servicio', exact: true }).click();
        await page.waitForURL(origin + '/categorias-servicio');
        await page.getByRole('heading', { name: 'Tipos de servicio', exact: true }).waitFor();
        await page.getByRole('button', { name: 'Volver a ajustes', exact: true }).click();
        await page.getByRole('heading', { name: 'Ajustes', exact: true }).waitFor();
        await page.waitForFunction(
          () => document.querySelector('#settings-search')?.value === 'iconos',
        );
        assert.equal(
          await page
            .getByRole('button', { name: 'Servicios', exact: true })
            .getAttribute('aria-pressed'),
          'true',
        );
        await page.reload();
        await page.waitForFunction(
          () => document.querySelector('#settings-search')?.value === 'iconos',
        );
        await waitForCards(page, 1, 0);
        await page.getByRole('button', { name: 'Limpiar búsqueda', exact: true }).click();
        await page.getByRole('button', { name: 'Configuración de servicios', exact: true }).click();
        await page
          .getByRole('heading', { name: 'Configuración de servicios', exact: true })
          .waitFor();
        await page.waitForFunction(
          () => document.querySelector('.template-panel input')?.value === 'Por vencer API',
        );
        await page.locator('.template-panel input').fill('Próximo editado');
        await page.locator('.template-panel textarea').fill('Cuerpo próximo editado');
        await page.getByRole('button', { name: 'Servicio vencido', exact: true }).click();
        await page.waitForFunction(
          () => document.querySelector('#service-subject')?.value === 'Vencido API',
        );
        assert.equal(await page.locator('.template-panel input').inputValue(), 'Vencido API');
        await page.locator('.template-panel input').fill('Vencido editado');
        await page.getByRole('button', { name: 'Guardar configuración', exact: true }).click();
        await page.getByText('Configuración guardada correctamente.', { exact: true }).waitFor();
        assert.equal(service.asuntoPorVencer, 'Próximo editado');
        assert.equal(service.asuntoVencido, 'Vencido editado');
        assert.equal(service.plantillaPorVencer, 'Cuerpo próximo editado');
        await page
          .getByRole('button', { name: 'Volver a configuración de servicios', exact: true })
          .click();
        await waitForCards(page, 2, 0);
        assert.equal(
          await page
            .getByRole('button', { name: 'Servicios', exact: true })
            .getAttribute('aria-pressed'),
          'true',
        );
        await page
          .locator('.hub-nav')
          .getByRole('button', { name: 'Notificaciones', exact: true })
          .click();
        await page.getByLabel('Buscar configuración', { exact: true }).fill('correo');
        await page.getByRole('button', { name: 'Configuración de correo', exact: true }).click();
        await page.getByRole('heading', { name: 'Configuración de correo', exact: true }).waitFor();
        await page.waitForFunction(
          () => document.querySelector('.template-panel input')?.value === 'Creado API',
        );
        await page.getByRole('button', { name: 'Ticket asignado', exact: true }).click();
        await page.waitForFunction(
          () => document.querySelector('#email-subject')?.value === 'Asignado API',
        );
        assert.equal(await page.locator('.template-panel input').inputValue(), 'Asignado API');
        await page.locator('.template-panel input').fill('Asignado editado');
        await page.locator('.template-panel textarea').fill('Contenido asignado editado');
        await page.getByRole('button', { name: 'Guardar cambios', exact: true }).click();
        await page.getByText('Plantillas guardadas correctamente.', { exact: true }).waitFor();
        assert.equal(email.ticketCreatedSubject, 'Creado API');
        assert.equal(email.assignedSubject, 'Asignado editado');
        assert.equal(email.assignedBody, 'Contenido asignado editado');
        await page.getByRole('button', { name: 'Volver a ajustes', exact: true }).click();
        assert.equal(
          await page
            .locator('.hub-nav')
            .getByRole('button', { name: 'Notificaciones', exact: true })
            .getAttribute('aria-pressed'),
          'true',
        );
        assert.equal(
          await page.getByLabel('Buscar configuración', { exact: true }).inputValue(),
          'correo',
        );
        await page.getByLabel('Buscar configuración', { exact: true }).fill('sin coincidencias');
        await page.getByRole('button', { name: 'Restablecer filtros', exact: true }).click();
        await waitForCards(page, 3, 4);
        assert.equal(requests.filter((req) => req.method === 'PUT').length, 2);
        assert.equal(
          requests.filter(
            (req) => req.method === 'POST' || req.method === 'DELETE' || req.method === 'PATCH',
          ).length,
          0,
        );
        assert.deepEqual(errors, []);
        await context.close();
      }
      console.log(
        'Verificados ' + layouts + ' diseños, filtrado sin navegación y editores con API simulada.',
      );
    } finally {
      await browser?.close();
      await new Promise((resolve) => server.close(resolve));
    }
  },
);
