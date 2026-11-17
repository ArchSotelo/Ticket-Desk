// node --test scripts/settings-detail-ui.test.cjs después de compilar.
// Todas las peticiones están simuladas: no se guardan preferencias reales ni se envían correos.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { launchBrowser } = require('./helpers/browser.cjs');
const { installPermissionSessionDefaults } = require('./helpers/permission-session.cjs');

test(
  'Correo y servicios: diseños adaptables, borradores independientes, errores y acciones explícitas',
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
    let browser,
      layouts = 0;
    try {
      browser = await launchBrowser({ channel: 'chrome', headless: true });
      for (const dark of [false, true]) {
        const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
        const page = await context.newPage(),
          errors = [],
          writes = [];
        let failEmailLoad = false,
          failServiceLoad = false,
          failSmtp = false,
          failSave = false,
          releaseWrite;
        let holdWrite = false;
        const events = [
          ['Ticket creado', 'ticketCreatedSubject', 'ticketCreatedBody'],
          ['Ticket asignado', 'assignedSubject', 'assignedBody'],
          ['Cambio de estado', 'statusChangedSubject', 'statusChangedBody'],
          ['Nueva respuesta', 'replySubject', 'replyBody'],
          ['Archivo adjunto', 'attachmentSubject', 'attachmentBody'],
          ['SLA próximo a vencer', 'slaSubject', 'slaBody'],
        ];
        const email = {
          enabled: true,
          onTicketCreated: true,
          onAssigned: true,
          onStatusChanged: true,
          onReply: true,
          onAttachment: false,
          onSla: true,
          emailSubject: 'General sin tocar',
          emailBody: 'Contenido general',
        };
        for (const [label, subject, body] of events) {
          email[subject] = label;
          email[body] = 'Contenido ' + label;
        }
        const service = {
          diasPorVencer: 5,
          recordatorioVencido: true,
          asuntoRecordatorio: 'General sin tocar',
          plantillaRecordatorio: 'Contenido general',
          asuntoPorVencer: 'Por vencer',
          plantillaPorVencer: 'Aviso próximo {{servicio.nombre}}',
          asuntoVencido: 'Vencido',
          plantillaVencido: 'Aviso vencido',
        };
        page.on('pageerror', (e) => errors.push(e.message));
        await page.addInitScript(installPermissionSessionDefaults);
        await page.addInitScript((dark) => {
          localStorage.setItem(
            'user_session',
            JSON.stringify({
              accessToken:
                'e30.' +
                btoa(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 3600 })) +
                '.test',
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
        await page.route('**/api/v1/**', async (route) => {
          const req = route.request(),
            endpoint = new URL(req.url()).pathname,
            method = req.method();
          let data = [];
          if (method !== 'GET') {
            writes.push({ endpoint, method, payload: req.postDataJSON() });
            if (holdWrite) await new Promise((resolve) => (releaseWrite = resolve));
            if (failSave)
              return route.fulfill({
                status: 500,
                json: { success: false, message: 'Error de guardado simulado' },
              });
          }
          if (endpoint === '/api/v1/notifications/settings') {
            if (method === 'GET' && failEmailLoad)
              return route.fulfill({ status: 500, json: { success: false } });
            if (method === 'PUT') Object.assign(email, req.postDataJSON());
            data = email;
          } else if (endpoint === '/api/v1/service-settings') {
            if (method === 'GET' && failServiceLoad)
              return route.fulfill({ status: 500, json: { success: false } });
            if (method === 'PUT') Object.assign(service, req.postDataJSON());
            data = service;
          } else if (endpoint === '/api/v1/notifications/email/status') {
            if (failSmtp) return route.fulfill({ status: 500, json: { success: false } });
            data = { enabled: false, configured: false };
          } else if (endpoint === '/api/v1/notifications/email/test') {
            assert.equal(method, 'POST');
            data = null;
          } else if (endpoint.endsWith('/users/me'))
            data = {
              id: 1,
              nombres: 'Administrador',
              apellidos: 'Demo',
              roles: ['ROLE_ADMIN'],
              estado: 'ACTIVO',
            };
          else if (endpoint.endsWith('/count')) data = { count: 0 };
          else assert.equal(method, 'GET');
          await route.fulfill({ json: { success: true, data } });
        });
        const open = async (name) => {
          await page.getByRole('button', { name: 'Configuración de ' + name, exact: true }).click();
          await page
            .getByRole('heading', { name: 'Configuración de ' + name, exact: true })
            .waitFor();
        };
        const layout = async (kind) => {
          for (const width of [1920, 1024, 390, 320]) {
            await page.setViewportSize({ width, height: width < 400 ? 844 : 1080 });
            await page.waitForTimeout(300);
            await page.locator('.main-content').evaluate((el) => (el.scrollTop = 0));
            for (const selector of [
              '.config-page',
              '.config-fieldset',
              '.template-panel',
              kind === 'email' ? '.template-workspace' : '.service-workspace',
            ])
              assert.ok(
                await page.locator(selector).evaluate((el) => el.scrollWidth <= el.clientWidth + 1),
                selector + ' no desborda a ' + width,
              );
            assert.ok(
              await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
            );
            if (width === 1920)
              assert.ok(await page.locator('.config-page').evaluate((el) => el.clientWidth > 1400));
            assert.ok(
              await page
                .locator('.panel-footer')
                .evaluate(
                  (el) =>
                    el.getBoundingClientRect().bottom <=
                    document.querySelector('.main-content').getBoundingClientRect().bottom + 1,
                ),
              'El guardado permanece visible',
            );
            await page.screenshot({
              path: path.join(
                os.tmpdir(),
                `settings-${kind}-${dark ? 'dark' : 'light'}-${width}.png`,
              ),
            });
            layouts++;
          }
          await page.setViewportSize({ width: 1920, height: 1080 });
          await page.waitForTimeout(300);
        };
        await page.goto(`http://127.0.0.1:${server.address().port}/ajustes`);
        await open('correo');
        await page.getByText('Servicio pendiente de configuración', { exact: true }).waitFor();
        await page.waitForFunction(() => !document.querySelector('.config-fieldset')?.disabled);
        assert.equal(await page.locator('.event-grid [role=switch]').count(), 6);
        assert.equal(await page.locator('.template-nav button').count(), 6);
        assert.equal(await page.locator('.event-grid [role=switch]:checked').count(), 5);
        await layout('email');
        assert.equal(writes.length, 0);
        for (const [label] of events) {
          await page
            .locator('.template-nav')
            .getByRole('button', { name: label, exact: true })
            .click();
          await page.waitForFunction(
            (label) => document.querySelector('#email-subject').value === label,
            label,
          );
          await page.locator('#email-subject').fill('Editado ' + label);
          await page.locator('#email-body').fill('Cuerpo editado ' + label);
        }
        for (const [label] of events) {
          await page
            .locator('.template-nav')
            .getByRole('button', { name: label, exact: true })
            .click();
          await page.waitForFunction(
            (label) => document.querySelector('#email-subject').value === 'Editado ' + label,
            label,
          );
          assert.equal(await page.locator('#email-body').inputValue(), 'Cuerpo editado ' + label);
        }
        await page
          .locator('.event-grid')
          .getByRole('switch', { name: /Archivo adjunto/ })
          .check();
        holdWrite = true;
        await page.getByRole('button', { name: 'Guardar cambios', exact: true }).click();
        await page.getByRole('button', { name: 'Guardando…', exact: true }).waitFor();
        assert.equal(
          await page.getByRole('button', { name: 'Guardando…', exact: true }).isDisabled(),
          true,
        );
        assert.equal(await page.locator('.config-fieldset').evaluate((el) => el.disabled), true);
        assert.equal(await page.locator('#email-subject').isDisabled(), true);
        await page.waitForFunction(
          () => document.querySelector('.mail-form').getAttribute('aria-busy') === 'true',
        );
        while (!releaseWrite) await page.waitForTimeout(10);
        holdWrite = false;
        releaseWrite();
        await page.getByText('Plantillas guardadas correctamente.', { exact: true }).waitFor();
        assert.equal(writes.length, 1);
        assert.equal(email.onAttachment, true);
        assert.equal(email.emailSubject, 'General sin tocar');
        for (const [label, subject, body] of events) {
          assert.equal(email[subject], 'Editado ' + label);
          assert.equal(email[body], 'Cuerpo editado ' + label);
        }
        await page.getByRole('button', { name: 'Probar conexión', exact: true }).click();
        await page.getByText('Correo de prueba enviado correctamente.', { exact: true }).waitFor();
        assert.equal(writes.filter((w) => w.method === 'POST').length, 1);
        await page.getByRole('button', { name: 'Volver a ajustes', exact: true }).click();
        failSmtp = true;
        await open('correo');
        await page.locator('.smtp-pending.error').waitFor();
        assert.match(
          await page.locator('.smtp-pending.error').innerText(),
          /No se pudo consultar el estado SMTP/,
        );
        assert.equal(
          await page.getByText('Servicio pendiente de configuración', { exact: true }).count(),
          0,
        );
        failSmtp = false;
        await page.getByRole('button', { name: 'Reintentar consulta', exact: true }).click();
        await page.getByText('Servicio pendiente de configuración', { exact: true }).waitFor();
        await page.getByRole('button', { name: 'Volver a ajustes', exact: true }).click();
        await open('servicios');
        await page.waitForFunction(() => !document.querySelector('.config-fieldset')?.disabled);
        await layout('services');
        await page.locator('#service-subject').fill('Próximo editado');
        await page.locator('#service-body').fill('Contenido próximo editado');
        await page.getByRole('button', { name: 'Servicio vencido', exact: true }).click();
        await page.waitForFunction(
          () => document.querySelector('#service-subject').value === 'Vencido',
        );
        await page.locator('#service-subject').fill('');
        await page.getByRole('button', { name: 'Servicio por vencer', exact: true }).click();
        await page.getByRole('button', { name: 'Guardar configuración', exact: true }).click();
        await page.getByText('Revisa los campos obligatorios.', { exact: true }).waitFor();
        await page
          .getByRole('button', {
            name: 'Completa el asunto y el cuerpo de servicio vencido.',
            exact: true,
          })
          .click();
        // Esperar el borrador seleccionado antes de escribir en su campo compartido.
        await page.waitForFunction(() => document.querySelector('#service-subject')?.value === '');
        await page.locator('#service-subject').fill('Vencido editado');
        await page.locator('#expiry-days').fill('0');
        await page.getByRole('button', { name: 'Guardar configuración', exact: true }).click();
        assert.equal(await page.locator('#expiry-days').getAttribute('aria-invalid'), 'true');
        await page.locator('#expiry-days').fill('7');
        await page.getByRole('switch', { name: 'Enviar aviso al vencer', exact: true }).uncheck();
        await page.waitForFunction(() => !document.querySelector('.validation-summary'));
        failSave = true;
        await page.getByRole('button', { name: 'Guardar configuración', exact: true }).click();
        try {
          await page.getByText('Error de guardado simulado', { exact: true }).waitFor();
        } catch (error) {
          console.log(await page.locator('.config-page').innerText(), JSON.stringify(writes));
          await page.screenshot({ path: path.join(os.tmpdir(), 'settings-detail-failure.png') });
          throw error;
        }
        assert.equal(await page.locator('#service-subject').inputValue(), 'Vencido editado');
        failSave = false;
        await page.getByRole('button', { name: 'Guardar configuración', exact: true }).click();
        await page.getByText('Configuración guardada correctamente.', { exact: true }).waitFor();
        assert.equal(service.asuntoPorVencer, 'Próximo editado');
        assert.equal(service.asuntoVencido, 'Vencido editado');
        assert.equal(service.plantillaPorVencer, 'Contenido próximo editado');
        assert.equal(service.asuntoRecordatorio, 'General sin tocar');
        assert.equal(service.recordatorioVencido, false);
        assert.equal(service.diasPorVencer, 7);
        await page
          .getByRole('button', { name: 'Volver a configuración de servicios', exact: true })
          .click();
        failServiceLoad = true;
        await open('servicios');
        await page
          .getByText('No se pudo cargar la configuración. Reintenta antes de guardar.', {
            exact: false,
          })
          .waitFor();
        assert.equal(
          await page
            .getByRole('button', { name: 'Guardar configuración', exact: true })
            .isDisabled(),
          true,
        );
        failServiceLoad = false;
        await page.getByRole('button', { name: 'Reintentar', exact: true }).click();
        await page.waitForFunction(() => !document.querySelector('.config-fieldset')?.disabled);
        await page
          .getByRole('button', { name: 'Volver a configuración de servicios', exact: true })
          .click();
        failEmailLoad = true;
        await page.reload();
        await open('correo');
        await page
          .getByText('No se pudieron cargar las preferencias. Reintenta antes de guardar.', {
            exact: false,
          })
          .waitFor();
        assert.equal(
          await page.getByRole('button', { name: 'Guardar cambios', exact: true }).isDisabled(),
          true,
        );
        failEmailLoad = false;
        await page.getByRole('button', { name: 'Reintentar', exact: true }).click();
        await page.waitForFunction(() => !document.querySelector('.config-fieldset')?.disabled);
        assert.deepEqual(errors, []);
        await context.close();
      }
      console.log(
        'Verificados ' +
          layouts +
          ' diseños de correo/servicios y escenarios de guardado, validación y recuperación con API simulada.',
      );
    } finally {
      await browser?.close();
      await new Promise((resolve) => server.close(resolve));
    }
  },
);
