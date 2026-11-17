// Run after build: node --test scripts/staff-ticket-detail-ui.test.cjs
// Local Chrome, ephemeral server, mocked API only; never accesses real tickets.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { launchBrowser } = require('./helpers/browser.cjs');
const { installPermissionSessionDefaults } = require('./helpers/permission-session.cjs');

test(
  'staff detail: both portals, themes, responsive, tabs, replies, files and role controls',
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
      browser = await launchBrowser({ headless: true });
      const base = 'http://127.0.0.1:' + server.address().port;
      const portals = [
        { name: 'admin', role: 'ROLE_ADMIN', detail: '/tickets/detail/6', list: '/tickets/list' },
        {
          name: 'technician',
          role: 'ROLE_TECNICO',
          detail: '/tecnico/tickets/6',
          list: '/tecnico',
        },
      ];
      const states = [
        { codigo: 'NUEVO', nombre: 'Nuevo' },
        { codigo: 'ASIGNADO', nombre: 'Asignado' },
        { codigo: 'EN_PROCESO', nombre: 'En proceso' },
        { codigo: 'PENDIENTE_CLIENTE', nombre: 'Pendiente cliente' },
        { codigo: 'RESUELTO', nombre: 'Resuelto' },
        { codigo: 'CERRADO', nombre: 'Cerrado' },
      ];
      const pdf =
        '%PDF-1.4\n1 0 obj <</Type /Catalog /Pages 2 0 R>> endobj\n2 0 obj <</Type /Pages /Kids [3 0 R] /Count 1>> endobj\n3 0 obj <</Type /Page /Parent 2 0 R /MediaBox [0 0 200 200]>> endobj\ntrailer <</Root 1 0 R>>\n%%EOF';
      const image = Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jL1sAAAAASUVORK5CYII=',
        'base64',
      );
      let combinations = 0;
      for (const portal of portals)
        for (const dark of [false, true]) {
          console.log('Checking ' + portal.name + '/' + (dark ? 'dark' : 'light'));
          const context = await browser.newContext({
            acceptDownloads: true,
            viewport: { width: 1920, height: 1080 },
          });
          const page = await context.newPage(),
            errors = [],
            requests = [];
          page.on('pageerror', (error) => errors.push(error.message));
          await page.addInitScript(installPermissionSessionDefaults);
          await page.addInitScript((role) => {
            if (window !== window.top) return; // PDF/blob frames have no localStorage.
            const accessToken =
              'e30.' +
              btoa(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 3600 })) +
              '.test';
            localStorage.setItem(
              'user_session',
              JSON.stringify({
                accessToken,
                roles: [role],
                userId: role === 'ROLE_ADMIN' ? 1 : 2,
                fullName: role === 'ROLE_ADMIN' ? 'Administrador General' : 'Carlos Mendoza',
              }),
            );
            window.WebSocket = class {
              static OPEN = 1;
              readyState = 0;
              close() {}
              addEventListener() {}
              removeEventListener() {}
            };
          }, portal.role);
          const ticket = {
            id: 6,
            codigo: 'TICK-2026-0006',
            titulo: 'No puedo acceder',
            descripcion:
              'No puedo acceder al sistema desde mi equipo. Adjunto una captura del error.',
            estadoCodigo: 'EN_PROCESO',
            estadoNombre: 'En proceso',
            prioridadNombre: 'Baja',
            clienteId: 8,
            clienteNombre: 'Ana Torres',
            clienteEmail: 'ana.torres@example.test',
            tecnicoId: 2,
            tecnicoNombre: 'Carlos Mendoza',
            empresaNombre: 'Corporación Demo S.A.C.',
            areaNombre: 'Recursos Humanos',
            categoriaNombre: 'Redes & Conectividad',
            subcategoriaNombre: '',
            fechaCreacion: '2026-09-29T12:53:00',
            comentarios: [
              {
                id: 1,
                usuarioId: 8,
                usuarioNombre: 'Ana Torres',
                usuarioRol: 'CLIENTE',
                contenido: 'Al iniciar sesión aparece un error de conexión.',
                fechaCreacion: '2026-09-29T12:53:00',
              },
              {
                id: 2,
                usuarioId: 2,
                usuarioNombre: 'Carlos Mendoza',
                usuarioRol: 'TECNICO',
                contenido:
                  'Hola Ana, estoy revisando el acceso. ¿El problema también ocurre en otro navegador?',
                fechaCreacion: '2026-09-29T13:10:00',
              },
              {
                id: 3,
                usuarioId: 1,
                usuarioNombre: 'Administrador General',
                usuarioRol: 'ADMIN',
                contenido: 'El caso ya está asignado al equipo de soporte.',
                fechaCreacion: '2026-09-29T13:15:00',
              },
            ],
            attachments: [
              {
                id: 1,
                nombreOriginal: 'captura-error.png',
                extension: 'png',
                mimeType: 'image/png',
                tamanoBytes: 1200,
                previewUrl: '/api/v1/files/captura.png',
                downloadUrl: '/api/v1/files/captura.png',
              },
              {
                id: 2,
                nombreOriginal: 'informe.pdf',
                extension: 'pdf',
                mimeType: 'application/pdf',
                tamanoBytes: 1800,
                previewUrl: '/api/v1/files/informe.pdf',
                downloadUrl: '/api/v1/files/informe.pdf',
              },
            ],
            historialCambios: [
              {
                id: 1,
                campoModificado: 'Estado',
                usuarioNombre: 'Carlos Mendoza',
                fechaCambio: '2026-09-29T13:00:00',
                valorAnterior: 'Asignado',
                valorNuevo: 'En proceso',
              },
              {
                id: 2,
                campoModificado: 'Técnico asignado',
                usuarioNombre: 'Administrador General',
                fechaCambio: '2026-09-29T12:55:00',
                valorAnterior: 'Sin asignar',
                valorNuevo: 'Carlos Mendoza',
              },
            ],
          };
          let failComment = false,
            failState = false,
            failDetail = false,
            failStates = false,
            failUsers = false,
            failAssignment = false;
          await page.route('**/api/v1/**', async (route) => {
            const request = route.request(),
              url = new URL(request.url());
            requests.push({
              path: url.pathname,
              method: request.method(),
              query: url.searchParams,
            });
            const failure = async (message) => route.fulfill({ status: 500, json: { message } });
            let data = [];
            if (url.pathname.includes('/files/')) {
              return route.fulfill({
                contentType: url.pathname.endsWith('.pdf') ? 'application/pdf' : 'image/png',
                body: url.pathname.endsWith('.pdf') ? pdf : image,
              });
            } else if (/\/tickets\/6$/.test(url.pathname)) {
              if (failDetail) {
                failDetail = false;
                return failure('No se pudo cargar el ticket de prueba.');
              }
              data = ticket;
            } else if (url.pathname.endsWith('/states')) {
              if (failStates) {
                failStates = false;
                return failure('Estados no disponibles');
              }
              data = states;
            } else if (url.pathname.endsWith('/estado')) {
              if (failState) {
                failState = false;
                return failure('No se pudo guardar el estado de prueba.');
              }
              await new Promise((resolve) => setTimeout(resolve, 120));
              const state = states.find(
                (state) => state.codigo === url.searchParams.get('nuevoEstadoCodigo'),
              );
              ticket.estadoCodigo = state.codigo;
              ticket.estadoNombre = state.nombre;
              data = ticket;
            } else if (url.pathname.endsWith('/asignar')) {
              if (failAssignment) {
                failAssignment = false;
                return failure('No se pudo asignar el técnico de prueba.');
              }
              await new Promise((resolve) => setTimeout(resolve, 120));
              ticket.tecnicoId = Number(url.searchParams.get('tecnicoId'));
              ticket.tecnicoNombre = 'Esteban Castro';
              data = ticket;
            } else if (url.pathname.endsWith('/comentarios')) {
              if (failComment) {
                failComment = false;
                return failure('No se pudo enviar la respuesta de prueba.');
              }
              await new Promise((resolve) => setTimeout(resolve, 120));
              ticket.comentarios.push({
                id: ticket.comentarios.length + 1,
                usuarioId: portal.name === 'admin' ? 1 : 2,
                usuarioNombre: portal.name === 'admin' ? 'Administrador General' : 'Carlos Mendoza',
                usuarioRol: portal.name === 'admin' ? 'ADMIN' : 'TECNICO',
                contenido: url.searchParams.get('contenido'),
                fechaCreacion: '2026-10-09T10:00:00',
                esInterno: false,
              });
              ticket.comentarioCreadoId = ticket.comentarios.at(-1).id;
              data = ticket;
            } else if (url.pathname.endsWith('/attachments') && request.method() === 'POST') {
              const match = request
                .postDataBuffer()
                .toString()
                .match(/name="comentarioId"\r\n\r\n(\d+)/);
              assert.ok(match, 'Cada archivo de respuesta debe enviar comentarioId');
              assert.equal(Number(match[1]), ticket.comentarioCreadoId);
              data = {
                comentarioId: Number(match[1]),
                id: ticket.attachments.length + 1,
                nombreOriginal: 'evidencia-' + ticket.attachments.length + '.pdf',
                extension: 'pdf',
                mimeType: 'application/pdf',
                tamanoBytes: 1800,
                previewUrl: '/api/v1/files/informe.pdf',
                downloadUrl: '/api/v1/files/informe.pdf',
              };
              ticket.attachments.push(data);
            } else if (url.pathname.endsWith('/users/me'))
              data = { id: 2, nombres: 'Carlos', apellidos: 'Mendoza', roles: [portal.role] };
            else if (url.pathname.endsWith('/count')) data = { count: 0 };
            else if (url.pathname.endsWith('/settings')) data = { enabled: false };
            else if (url.pathname.endsWith('/contacts')) {
              if (failUsers) {
                failUsers = false;
                return failure('Técnicos no disponibles');
              }
              data = {
                content: [
                  {
                    id: 2,
                    nombres: 'Carlos',
                    apellidos: 'Mendoza',
                    username: 'carlos',
                    estado: 'ACTIVO',
                    roles: ['ROLE_TECNICO'],
                  },
                  {
                    id: 3,
                    nombres: 'Esteban',
                    apellidos: 'Castro',
                    username: 'esteban',
                    estado: 'ACTIVO',
                    roles: ['ROLE_TECNICO'],
                  },
                  {
                    id: 4,
                    nombres: 'Inactivo',
                    apellidos: 'Prueba',
                    estado: 'INACTIVO',
                    roles: ['ROLE_TECNICO'],
                  },
                ],
              };
            } else if (url.pathname.endsWith('/tickets'))
              data = { content: [], totalElements: 0, totalPages: 0, number: 0, size: 8 };
            await route.fulfill({ json: { success: true, data } });
          });
          await page.goto(base + portal.detail + '?returnTo=' + encodeURIComponent(portal.list));
          await page.getByRole('heading', { name: 'No puedo acceder', exact: true }).waitFor();
          await page.evaluate((dark) => document.body.classList.toggle('dark-theme', dark), dark);
          assert.equal(await page.locator('.client-detail-workspace').count(), 0);
          assert.equal(
            await page.locator('#staff-ticket-technician').count(),
            portal.name === 'admin' ? 1 : 0,
          );
          assert.equal(
            requests.filter((request) => request.path === '/api/v1/contacts').length,
            portal.name === 'admin' ? 1 : 0,
          );
          assert.equal(await page.locator('.staff-thread-message.staff-thread-client').count(), 1);
          assert.equal(await page.locator('.staff-thread-message.staff-thread-tech').count(), 1);
          assert.equal(await page.locator('.staff-thread-message.staff-thread-admin').count(), 1);
          assert.equal(await page.locator('#staff-attachments-panel').isVisible(), false);
          assert.equal(await page.locator('#staff-history-panel').isVisible(), false);
          for (const width of [1920, 1024, 390]) {
            await page.setViewportSize({ width, height: width === 390 ? 844 : 1080 });
            await page.waitForTimeout(300);
            assert.ok(
              await page
                .locator('.staff-detail-workspace')
                .evaluate((el) => el.scrollWidth <= el.clientWidth + 1),
              portal.name + '/' + dark + '/' + width + ': overflow',
            );
            const geometry = await page.locator('.staff-detail-grid').evaluate((el) => {
              const main = el.querySelector('main').getBoundingClientRect(),
                aside = el.querySelector('aside').getBoundingClientRect();
              return { mainX: main.x, mainY: main.y, asideX: aside.x, asideY: aside.y };
            });
            if (width === 1920) assert.ok(geometry.asideX > geometry.mainX);
            else assert.ok(geometry.asideY > geometry.mainY);
            const style = await page.locator('.reply-rich-editor').evaluate((el) => {
              const css = getComputedStyle(el);
              return { border: css.borderTopColor, bg: css.backgroundColor, text: css.color };
            });
            assert.notEqual(style.border, style.bg);
            assert.notEqual(style.text, style.bg);
            const roleColors = await page.locator('.staff-thread-message').evaluateAll((messages) =>
              messages.map((el) => ({
                outer: getComputedStyle(el).backgroundColor,
                bubble: getComputedStyle(
                  el.querySelector('.staff-message-content > .staff-message-body'),
                ).backgroundColor,
              })),
            );
            assert.ok(
              roleColors.every((colors) => colors.outer === 'rgba(0, 0, 0, 0)'),
              'Legacy role styles must not color the entire message row',
            );
            assert.equal(new Set(roleColors.map((colors) => colors.bubble)).size, 3);
            await page.screenshot({
              path: path.join(
                os.tmpdir(),
                'staff-ticket-detail-' +
                  portal.name +
                  '-' +
                  (dark ? 'dark' : 'light') +
                  '-' +
                  width +
                  '.png',
              ),
            });
            combinations++;
          }
          await page.setViewportSize({ width: 1920, height: 1080 });
          const response = page.locator('#staff-ticket-response');
          await response.fill('Borrador que se conserva entre pestañas.');
          const fileInput = page.locator('.staff-reply-composer input[type=file]').last();
          await fileInput.setInputFiles({
            name: 'borrador.pdf',
            mimeType: 'application/pdf',
            buffer: Buffer.from(pdf),
          });
          await page.getByRole('tab', { name: /Adjuntos/ }).click();
          await page.locator('#staff-conversation-panel').waitFor({ state: 'hidden' });
          assert.equal(await page.locator('#staff-conversation-panel').isVisible(), false);
          await page.getByRole('button', { name: 'Ver informe.pdf', exact: true }).click();
          await page.locator('.attachment-viewer iframe').waitFor();
          assert.equal(
            await page.locator('.attachment-viewer iframe').getAttribute('sandbox'),
            'allow-same-origin',
          );
          assert.match(
            await page.locator('.attachment-viewer iframe').getAttribute('src'),
            /^blob:/,
          );
          assert.equal(
            await page
              .locator('.attachment-viewer')
              .evaluate((el) => getComputedStyle(el.parentElement).position),
            'fixed',
          );
          await page.getByRole('button', { name: 'Cerrar visor' }).click();
          await page.getByRole('button', { name: 'Ver captura-error.png', exact: true }).click();
          await page.waitForFunction(() => {
            const img = document.querySelector('.attachment-viewer img');
            return img?.src.startsWith('blob:') && img.complete && img.naturalWidth > 0;
          });
          await page.getByRole('button', { name: 'Cerrar visor' }).click();
          await page.getByRole('tab', { name: 'Actividad' }).click();
          assert.equal(await page.locator('.staff-history-timeline li').count(), 2);
          await page.getByRole('tab', { name: 'Actividad' }).press('Home');
          await page.waitForFunction(
            () =>
              document.querySelector('#staff-conversation-tab')?.getAttribute('aria-selected') ===
              'true',
          );
          assert.equal(
            await page.getByRole('tab', { name: /Conversación/ }).getAttribute('aria-selected'),
            'true',
          );
          assert.equal(await response.innerText(), 'Borrador que se conserva entre pestañas.');
          assert.equal(await page.locator('.staff-pending-file').count(), 1);
          await page.getByRole('button', { name: 'Quitar borrador.pdf' }).click();
          const state = page.locator('#staff-ticket-state'),
            save = page.getByRole('button', {
              name: portal.name === 'admin' ? 'Guardar cambios' : 'Guardar estado',
              exact: true,
            });
          assert.ok(await save.isDisabled());
          await state.selectOption('RESUELTO');
          await page.waitForFunction(() => !document.querySelector('.detail-save').disabled);
          const previousCount = requests.filter((request) =>
            request.path.endsWith('/estado'),
          ).length;
          assert.equal(previousCount, 0);
          await save.click();
          await page
            .locator('.staff-feedback-success')
            .filter({ hasText: 'Estado actualizado correctamente.' })
            .waitFor();
          assert.equal(requests.filter((request) => request.path.endsWith('/estado')).length, 1);
          assert.equal(await state.inputValue(), 'RESUELTO');
          assert.equal(await response.innerText(), 'Borrador que se conserva entre pestañas.');
          failState = true;
          await state.selectOption('EN_PROCESO');
          await save.click();
          await page
            .locator('.staff-feedback-error')
            .filter({ hasText: 'No se pudo guardar' })
            .waitFor();
          assert.equal(await state.inputValue(), 'EN_PROCESO');
          await page.waitForFunction(() => !document.querySelector('.detail-save').disabled);
          await save.click();
          await page.locator('.staff-feedback-success').waitFor();
          if (portal.name === 'admin') {
            const tech = page.locator('#staff-ticket-technician');
            assert.equal(await tech.locator('option').filter({ hasText: 'Inactivo' }).count(), 0);
            failAssignment = true;
            await tech.selectOption({ label: 'Esteban Castro' });
            await save.click();
            await page.locator('.staff-feedback-error').filter({ hasText: 'asignar' }).waitFor();
            assert.match(await tech.locator('option:checked').innerText(), /Carlos Mendoza/);
            await tech.selectOption({ label: 'Esteban Castro' });
            await save.click();
            await page
              .locator('.staff-feedback-success')
              .filter({ hasText: 'Técnico asignado' })
              .waitFor();
            assert.match(await tech.locator('option:checked').innerText(), /Esteban Castro/);
          }
          failComment = true;
          await response.fill('Esta respuesta no se debe perder.');
          await page.getByRole('button', { name: 'Enviar respuesta', exact: true }).click();
          await page.locator('.staff-feedback-error').filter({ hasText: 'enviar' }).waitFor();
          assert.equal(await response.innerText(), 'Esta respuesta no se debe perder.');
          await fileInput.setInputFiles([
            { name: 'evidencia-a.pdf', mimeType: 'application/pdf', buffer: Buffer.from(pdf) },
            { name: 'evidencia-b.pdf', mimeType: 'application/pdf', buffer: Buffer.from(pdf) },
          ]);
          await page.getByRole('button', { name: 'Enviar respuesta', exact: true }).click();
          await page
            .locator('.staff-feedback-success')
            .filter({ hasText: 'Respuesta enviada' })
            .waitFor();
          assert.equal(await response.innerText(), '');
          assert.equal(await page.locator('.staff-pending-file').count(), 0);
          assert.equal(
            await page
              .locator('.staff-thread-message')
              .filter({ hasText: 'Esta respuesta no se debe perder.' })
              .locator('.detail-message-files button')
              .count(),
            2,
          );
          assert.equal(
            requests.filter(
              (request) => request.path.endsWith('/attachments') && request.method === 'POST',
            ).length,
            2,
          );
          ticket.estadoCodigo = 'CERRADO';
          ticket.estadoNombre = 'Cerrado';
          await page.reload();
          await page.locator('.staff-ticket-closed').waitFor();
          assert.equal(await page.locator('#staff-ticket-response').count(), 0);
          if (portal.name === 'technician') {
            assert.ok(await state.isDisabled());
            assert.ok(await save.isDisabled());
          } else {
            assert.ok(await state.isEnabled());
            await state.selectOption('EN_PROCESO');
            await save.click();
            await response.waitFor();
          }
          failStates = true;
          if (portal.name === 'admin') failUsers = true;
          await page.reload();
          await page.locator('.staff-catalog-error').first().waitFor();
          assert.ok(await state.isDisabled());
          await page
            .locator('.staff-management-field')
            .getByRole('button', { name: 'Reintentar' })
            .click();
          await page.waitForFunction(
            () => !document.querySelector('.staff-management-field .staff-catalog-error'),
          );
          if (portal.name === 'admin') {
            await page
              .locator('.staff-assignment')
              .getByRole('button', { name: 'Reintentar' })
              .click();
            await page.waitForFunction(
              () => !document.querySelector('.staff-assignment .staff-catalog-error'),
            );
          }
          failDetail = true;
          await page.reload();
          await page.getByRole('button', { name: 'Reintentar', exact: true }).waitFor();
          await page.getByRole('button', { name: 'Reintentar', exact: true }).click();
          await page.getByRole('heading', { name: 'No puedo acceder', exact: true }).waitFor();
          await page.getByRole('button', { name: 'Volver a tickets' }).click();
          await page.waitForURL(base + portal.list);
          assert.deepEqual(errors, []);
          await context.close();
        }
      console.log(
        combinations +
          ' combinations checked with mocked API; all role controls and workflows passed.',
      );
    } finally {
      if (browser) await browser.close();
      await new Promise((resolve) => server.close(resolve));
    }
  },
);
