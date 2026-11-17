// API simulada y servidor efímero: no modifica tickets reales.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http'),
  fs = require('node:fs'),
  path = require('node:path'),
  os = require('node:os');
const { launchBrowser } = require('./helpers/browser.cjs');
const { installPermissionSessionDefaults } = require('./helpers/permission-session.cjs');
test(
  'detalle unificado: tres roles, notas privadas, gestión explícita, pestañas y responsive',
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
      for (const role of ['client', 'technician', 'admin'])
        for (const dark of [false, true]) {
          const context = await browser.newContext({ viewport: { width: 1920, height: 1200 } }),
            page = await context.newPage(),
            errors = [],
            writes = [];
          page.on('pageerror', (e) => errors.push(e.message));
          await page.addInitScript(installPermissionSessionDefaults);
          await page.addInitScript((role) => {
            if (window !== window.top) return;
            const token =
              'e30.' + btoa(JSON.stringify({ exp: Date.now() / 1000 + 3600 })) + '.test';
            localStorage.setItem(
              'user_session',
              JSON.stringify({
                accessToken: token,
                userId: role === 'client' ? 8 : role === 'technician' ? 2 : 1,
                fullName:
                  role === 'client'
                    ? 'Ana Torres'
                    : role === 'technician'
                      ? 'Carlos Mendoza'
                      : 'Administrador',
                roles: [
                  role === 'client'
                    ? 'ROLE_CLIENTE'
                    : role === 'technician'
                      ? 'ROLE_TECNICO'
                      : 'ROLE_ADMIN',
                ],
              }),
            );
            window.__sockets = [];
            window.WebSocket = class {
              static OPEN = 1;
              readyState = 1;
              constructor() {
                window.__sockets.push(this);
                setTimeout(() => this.onopen?.(), 0);
              }
              send() {}
              close() {
                this.readyState = 3;
              }
            };
          }, role);
          const now = Date.now(),
            date = new Date(now - 80 * 60000).toISOString();
          const ticket = {
            id: 6,
            codigo: 'TICK-2026-0105',
            titulo: 'Problemas al iniciar Excel',
            descripcion:
              'Excel se cierra al abrir un archivo. Necesito continuar con el reporte de hoy.',
            estadoCodigo: 'ASIGNADO',
            estadoNombre: 'Asignado',
            prioridadNombre: 'Alta',
            clienteId: 8,
            clienteNombre: 'Ana Torres',
            clienteEmail: 'ana@example.test',
            tecnicoId: 2,
            tecnicoNombre: 'Carlos Mendoza',
            empresaNombre: 'Empresa Demo',
            areaNombre: 'Finanzas',
            categoriaNombre: 'Software y aplicaciones',
            subcategoriaNombre: 'Microsoft Office',
            fechaCreacion: date,
            fechaModificacion: date,
            fechaLimiteResolucion: new Date(now + 160 * 60000).toISOString(),
            tiempoEstimadoMinutos: 240,
            comentarios: [
              {
                id: 1,
                usuarioId: 8,
                usuarioNombre: 'Ana Torres',
                usuarioRol: 'CLIENTE',
                contenido: 'El problema aparece al abrir el reporte.',
                fechaCreacion: date,
              },
              {
                id: 2,
                usuarioId: 2,
                usuarioNombre: 'Carlos Mendoza',
                usuarioRol: 'TECNICO',
                contenido: 'Estoy revisando el archivo. Te avisaré cuando pueda abrirse.',
                fechaCreacion: date,
              },
              {
                id: 3,
                usuarioId: 2,
                usuarioNombre: 'Carlos Mendoza',
                usuarioRol: 'TECNICO',
                contenido: 'Validar los complementos de Excel antes de reinstalar.',
                esInterno: true,
                fechaCreacion: date,
              },
            ],
            attachments: [
              {
                id: 101,
                nombreOriginal: 'reporte.xlsx',
                mimeType: 'application/octet-stream',
                tamanoBytes: 4000,
                downloadUrl: '/api/v1/files/test.xlsx',
                previewUrl: '/api/v1/files/test.xlsx',
              },
            ],
            historialCambios: [
              {
                id: 1,
                campoModificado: 'Estado',
                valorAnterior: 'Nuevo',
                valorNuevo: 'Asignado',
                usuarioNombre: 'Administrador',
                fechaCambio: date,
              },
            ],
          };
          await page.route('**/api/v1/**', async (route) => {
            const request = route.request(),
              url = new URL(request.url());
            let data = [];
            if (url.pathname.includes('/files/unsafe'))
              return route.fulfill({
                body: '<svg xmlns="http://www.w3.org/2000/svg" onload="window.top.attachmentExecuted=true"></svg>',
                contentType: 'image/svg+xml',
              });
            if (url.pathname.includes('/files/'))
              return route.fulfill({
                body: Buffer.from('test file'),
                contentType: 'application/octet-stream',
              });
            if (request.method() !== 'GET')
              writes.push({ path: url.pathname, params: Object.fromEntries(url.searchParams) });
            if (url.pathname.endsWith('/tickets/6')) data = ticket;
            else if (url.pathname.endsWith('/states'))
              data = [
                { codigo: 'ASIGNADO', nombre: 'Asignado' },
                { codigo: 'EN_PROCESO', nombre: 'En proceso' },
                { codigo: 'CERRADO', nombre: 'Cerrado' },
              ];
            else if (url.pathname.endsWith('/contacts'))
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
                    nombres: 'Luis',
                    apellidos: 'Ramos',
                    username: 'luis',
                    estado: 'ACTIVO',
                    roles: ['ROLE_TECNICO'],
                  },
                ],
              };
            else if (url.pathname.endsWith('/count')) data = { count: 0 };
            else if (url.pathname.endsWith('/estado')) {
              ticket.estadoCodigo = url.searchParams.get('nuevoEstadoCodigo');
              ticket.estadoNombre = 'En proceso';
              data = ticket;
            } else if (url.pathname.endsWith('/asignar')) {
              ticket.tecnicoId = Number(url.searchParams.get('tecnicoId'));
              ticket.tecnicoNombre = 'Luis Ramos';
              data = ticket;
            } else if (url.pathname.endsWith('/comentarios')) {
              ticket.comentarios.push({
                id: ticket.comentarios.length + 1,
                usuarioId: role === 'client' ? 8 : 2,
                usuarioNombre: 'Respuesta de prueba',
                usuarioRol: role === 'client' ? 'CLIENTE' : 'TECNICO',
                contenido: url.searchParams.get('contenido'),
                esInterno: url.searchParams.get('esInterno') === 'true',
                fechaCreacion: new Date().toISOString(),
              });
              ticket.comentarioCreadoId = ticket.comentarios.at(-1).id;
              data = ticket;
            }
            if (url.pathname.endsWith('/attachments') && request.method() === 'POST') {
              const match = request
                .postDataBuffer()
                .toString()
                .match(/name="comentarioId"\r\n\r\n(\d+)/);
              assert.ok(match);
              assert.equal(Number(match[1]), ticket.comentarioCreadoId);
              data = {
                id: 202,
                ticketId: 6,
                comentarioId: Number(match[1]),
                nombreOriginal: 'evidencia.pdf',
                mimeType: 'application/pdf',
                tamanoBytes: 100,
                previewUrl: '/api/v1/files/evidencia.pdf',
                downloadUrl: '/api/v1/files/evidencia.pdf',
              };
              ticket.attachments.push(data);
            }
            if (url.pathname.endsWith('/comentarios'))
              await page.evaluate(() =>
                window.__sockets
                  .at(-1)
                  ?.onmessage?.({ data: JSON.stringify({ type: 'ticket-comment', ticketId: 6 }) }),
              );
            await route.fulfill({ json: { success: true, data } });
          });
          const route =
            role === 'client'
              ? '/cliente/tickets/6'
              : role === 'technician'
                ? '/tecnico/tickets/6'
                : '/tickets/detail/6';
          await page.goto(`http://127.0.0.1:${server.address().port}${route}`);
          await page.getByRole('heading', { name: ticket.titulo, exact: true }).waitFor();
          await page.evaluate((dark) => document.body.classList.toggle('dark-theme', dark), dark);
          assert.equal(await page.getByRole('tab').count(), 3);
          assert.equal(await page.locator('.detail-tracking').count(), role === 'client' ? 1 : 0);
          assert.equal(await page.locator('.detail-management').count(), role === 'client' ? 0 : 1);
          assert.equal(
            await page.locator('#staff-ticket-technician').count(),
            role === 'admin' ? 1 : 0,
          );
          assert.equal(
            await page.locator('.staff-thread-internal').count(),
            role === 'client' ? 0 : 1,
          );
          assert.equal(
            await page.locator('.detail-response-modes').count(),
            role === 'client' ? 0 : 1,
          );
          await page.locator('#staff-ticket-response').fill('Borrador antes de validar archivos');
          const writesBeforeRejectedFile = writes.length;
          await page.locator('.staff-reply-composer input[type=file]').setInputFiles({
            name: 'no-permitido.svg',
            mimeType: 'image/svg+xml',
            buffer: Buffer.from('<svg/>'),
          });
          const warning = page.getByRole('dialog', {
            name: 'No se pudo adjuntar el archivo',
            exact: true,
          });
          await warning.waitFor();
          assert.match(await warning.innerText(), /Tipo de archivo no permitido/);
          assert.equal(await page.locator('.staff-feedback-error').count(), 0);
          assert.equal(await page.locator('.staff-pending-file').count(), 0);
          assert.equal(writes.length, writesBeforeRejectedFile);
          await page.getByRole('button', { name: 'Entendido', exact: true }).click();
          await warning.waitFor({ state: 'detached' });
          assert.equal(
            await page.locator('#staff-ticket-response').innerText(),
            'Borrador antes de validar archivos',
          );
          await page.locator('#staff-ticket-response').fill('');

          for (const width of [1920, 1024, 390]) {
            await page.setViewportSize({ width, height: width === 390 ? 844 : 1200 });
            await page.waitForTimeout(300);
            assert.ok(
              await page
                .locator('.staff-detail-workspace')
                .evaluate((el) => el.scrollWidth <= el.clientWidth + 1),
              `${role}/${dark}/${width}: overflow`,
            );
            await page.screenshot({
              path: path.join(
                os.tmpdir(),
                `unified-ticket-${role}-${dark ? 'dark' : 'light'}-${width}.png`,
              ),
            });
            await page.locator('.detail-file-chips button').first().click();
            await page.getByRole('dialog').waitFor();
            const bounds = await page.locator('.attachment-viewer').evaluate((el) => {
              const r = el.getBoundingClientRect();
              return {
                top: r.top,
                left: r.left,
                right: r.right,
                bottom: r.bottom,
                width: innerWidth,
                height: innerHeight,
              };
            });
            assert.ok(
              bounds.top >= 0 &&
                bounds.left >= 0 &&
                bounds.right <= bounds.width + 1 &&
                bounds.bottom <= bounds.height + 1,
              `${role}/${dark}/${width}: visor fuera de pantalla`,
            );
            await page.getByRole('button', { name: 'Cerrar visor' }).click();
            await page.getByRole('dialog').waitFor({ state: 'detached' });
          }
          await page.setViewportSize({ width: 1440, height: 1000 });
          await page.locator('#staff-ticket-response').fill('Borrador conservado');
          await page.getByRole('tab', { name: /Adjuntos/ }).click();
          await page.locator('.staff-attachment').scrollIntoViewIfNeeded();
          const beforeViewer = await page.locator('app-ticket-detail').evaluate((el) => {
            const entries = [];
            for (let node = el; node; node = node.parentElement)
              entries.push({
                top: node.scrollTop,
                left: node.scrollLeft,
                style: node.getAttribute('style'),
              });
            return entries;
          });
          await page.locator('.staff-attachment').click();
          await page.getByRole('dialog').waitFor();
          const geometry = await page.getByRole('dialog').evaluate((el) => {
            const r = el.getBoundingClientRect();
            return {
              modal: el.matches(':modal'),
              top: r.top,
              left: r.left,
              width: r.width,
              height: r.height,
              vw: innerWidth,
              vh: innerHeight,
            };
          });
          assert.equal(geometry.modal, true);
          assert.equal(geometry.top, 0);
          assert.equal(geometry.left, 0);
          assert.equal(geometry.width, geometry.vw);
          assert.equal(geometry.height, geometry.vh);
          assert.equal(
            await page.evaluate(() => getComputedStyle(document.documentElement).overflowY),
            'hidden',
          );
          const scrollWhileOpen = await page.locator('app-ticket-detail').evaluate((el) => {
            const entries = [];
            for (let node = el; node; node = node.parentElement)
              entries.push([node.scrollTop, node.scrollLeft]);
            return entries;
          });
          await page.mouse.move(4, 4);
          await page.mouse.wheel(0, 700);
          await page.waitForTimeout(100);
          assert.deepEqual(
            await page.locator('app-ticket-detail').evaluate((el) => {
              const entries = [];
              for (let node = el; node; node = node.parentElement)
                entries.push([node.scrollTop, node.scrollLeft]);
              return entries;
            }),
            scrollWhileOpen,
          );
          await page.keyboard.press('Escape');
          await page.getByRole('dialog').waitFor({ state: 'detached' });
          assert.deepEqual(
            await page.locator('app-ticket-detail').evaluate((el) => {
              const entries = [];
              for (let node = el; node; node = node.parentElement)
                entries.push({
                  top: node.scrollTop,
                  left: node.scrollLeft,
                  style: node.getAttribute('style') || null,
                });
              return entries;
            }),
            beforeViewer.map((e) => ({ ...e, style: e.style || null })),
          );

          await page.getByRole('tab', { name: 'Actividad', exact: true }).click();
          assert.equal(await page.locator('.staff-history-timeline li').count(), 1);
          await page.getByRole('tab', { name: /Conversación/ }).click();
          assert.equal(
            await page.locator('#staff-ticket-response').innerText(),
            'Borrador conservado',
          );
          if (role !== 'client') {
            await page
              .locator('.detail-response-modes')
              .getByRole('button', { name: 'Nota interna', exact: true })
              .click();
            await page.locator('#staff-ticket-response').fill('Solo personal');
            await page.getByRole('button', { name: 'Guardar nota interna', exact: true }).click();
            await page
              .locator('.staff-feedback-success')
              .filter({ hasText: 'Nota interna' })
              .waitFor();
            assert.equal(
              writes.find((w) => w.path.endsWith('/comentarios')).params.esInterno,
              'true',
            );
            await page
              .locator('.detail-response-modes')
              .getByRole('button', { name: 'Respuesta al cliente', exact: true })
              .click();
            for (let index = 1; index <= 3; index++) {
              const text = `Mensaje público ${index}`;
              await page.locator('#staff-ticket-response').fill(text);
              await page.getByRole('button', { name: 'Enviar respuesta', exact: true }).click();
              await page.locator('.staff-thread-message').filter({ hasText: text }).waitFor();
            }
            await page.locator('#staff-ticket-state').selectOption('EN_PROCESO');
            if (role === 'admin') {
              await page.locator('#staff-ticket-technician').selectOption({ label: 'Luis Ramos' });
              assert.equal(writes.filter((w) => w.path.endsWith('/asignar')).length, 0);
            }
            const saved = page.waitForResponse((r) =>
              new URL(r.url()).pathname.endsWith(role === 'admin' ? '/asignar' : '/estado'),
            );
            await page
              .getByRole('button', {
                name: role === 'admin' ? 'Guardar cambios' : 'Guardar estado',
                exact: true,
              })
              .click();
            await saved;
            await page
              .locator('.staff-feedback-success')
              .filter({ hasText: role === 'admin' ? 'Cambios guardados' : 'Estado actualizado' })
              .waitFor();
            assert.equal(writes.filter((w) => w.path.endsWith('/estado')).length, 1);
            assert.equal(
              writes.filter((w) => w.path.endsWith('/asignar')).length,
              role === 'admin' ? 1 : 0,
            );
          } else {
            for (let index = 1; index <= 3; index++) {
              const text = `Mensaje público ${index}`;
              await page.locator('#staff-ticket-response').fill(text);
              await page.getByRole('button', { name: 'Enviar respuesta', exact: true }).click();
              await page.locator('.staff-thread-message').filter({ hasText: text }).waitFor();
            }
            assert.equal(writes[0].params.esInterno, 'false');
          }
          await page.locator('#staff-ticket-response').fill('Mensaje con documento');
          await page.locator('.staff-reply-composer input[type=file]').setInputFiles({
            name: 'evidencia.pdf',
            mimeType: 'application/pdf',
            buffer: Buffer.from('test'),
          });
          await page.getByRole('button', { name: 'Enviar respuesta', exact: true }).click();
          const attached = page
            .locator('.staff-thread-message')
            .filter({ hasText: 'Mensaje con documento' })
            .locator('.detail-message-files button');
          await attached.waitFor();
          assert.match(await attached.innerText(), /evidencia.pdf/);
          assert.equal(
            await page.locator('.detail-file-chips').filter({ hasText: 'evidencia.pdf' }).count(),
            0,
          );
          await attached.click();
          await page.getByRole('dialog').waitFor();
          await page.getByRole('button', { name: 'Cerrar visor' }).click();
          await page.getByRole('dialog').waitFor({ state: 'detached' });
          await page.waitForFunction(
            () =>
              !document.querySelector('.staff-reply-composer button[type=submit]').disabled ||
              document.querySelector('#staff-ticket-response').getAttribute('aria-disabled') ===
                'false',
          );
          // La misma barra debe producir formato persistente en los tres roles.
          const editor = page.locator('#staff-ticket-response');
          for (const [button, tag] of [
            ['Negrita', 'strong'],
            ['Cursiva', 'em'],
            ['Título', 'h3'],
            ['Lista numerada', 'ol'],
            ['Lista con viñetas', 'ul'],
          ]) {
            await editor.fill(`Formato ${button}`);
            await editor.press('Control+a');
            await page.getByRole('button', { name: button, exact: true }).click();
            await page.getByRole('button', { name: 'Enviar respuesta', exact: true }).click();
            await page
              .locator('.staff-thread-message')
              .filter({ hasText: `Formato ${button}` })
              .locator(`.staff-message-body ${tag}`)
              .waitFor();
            assert.equal(await editor.innerText(), '');
            assert.equal(
              await page
                .getByRole('button', { name: 'Título', exact: true })
                .getAttribute('aria-pressed'),
              'false',
            );
          }
          await editor.fill('Documentación');
          await editor.press('Control+a');
          await page.getByRole('button', { name: 'Insertar enlace', exact: true }).click();
          await page
            .getByLabel('Dirección del enlace', { exact: true })
            .fill('javascript:alert(1)');
          await page.getByRole('button', { name: 'Insertar', exact: true }).click();
          await page.getByRole('alert').filter({ hasText: 'Escribe un enlace válido' }).waitFor();
          await page
            .getByLabel('Dirección del enlace', { exact: true })
            .fill('https://example.test/ayuda');
          await page.getByRole('button', { name: 'Insertar', exact: true }).click();
          await page.getByRole('button', { name: 'Enviar respuesta', exact: true }).click();
          await page.locator('.staff-message-body a[href="https://example.test/ayuda"]').waitFor();
          await editor.fill('   ');
          assert.equal(
            await page.getByRole('button', { name: 'Enviar respuesta', exact: true }).isDisabled(),
            true,
          );
          ticket.comentarios.push(
            {
              id: 900,
              usuarioId: 8,
              usuarioNombre: 'Histórico',
              contenido: '<b>Texto histórico literal</b>',
              fechaCreacion: date,
            },
            {
              id: 901,
              usuarioId: 8,
              usuarioNombre: 'Seguridad',
              contenido:
                '<!-- servicedesk-rich:v1 -->\n<strong>Seguro</strong><img src=x onerror="window.richUnsafe=true"><a href="javascript:alert(1)">Enlace inválido</a>',
              fechaCreacion: date,
            },
          );
          await page.reload();
          await page
            .locator('.staff-message-body')
            .filter({ hasText: 'Texto histórico literal' })
            .waitFor();
          assert.equal(
            await page
              .locator('.staff-message-body')
              .filter({ hasText: 'Texto histórico literal' })
              .innerText(),
            '<b>Texto histórico literal</b>',
          );
          await page
            .locator('.staff-thread-message')
            .filter({ hasText: 'Formato Negrita' })
            .locator('.staff-message-body strong')
            .waitFor();
          await page.locator('.staff-message-body a[href="https://example.test/ayuda"]').waitFor();
          const sanitized = page
            .locator('.staff-message-body')
            .filter({ hasText: 'Enlace inválido' });
          assert.equal(await sanitized.locator('img,a,script').count(), 0);
          assert.equal(await page.evaluate(() => !!window.richUnsafe), false);
          ticket.attachments.push({
            id: 999,
            nombreOriginal: 'unsafe.svg',
            mimeType: 'image/svg+xml',
            tamanoBytes: 100,
            previewUrl: '/api/v1/files/unsafe-preview.svg',
            downloadUrl: '/api/v1/files/unsafe-download.svg',
          });
          await page.reload();
          await page.getByRole('heading', { name: ticket.titulo, exact: true }).waitFor();
          await page.getByRole('tab', { name: /Adjuntos/ }).click();
          await page.locator('#staff-attachments-panel').waitFor();
          await page
            .locator('#staff-attachments-panel')
            .getByRole('button', { name: 'Ver unsafe.svg', exact: true })
            .click();
          await page.getByRole('dialog').waitFor();
          assert.equal(
            await page.locator('.attachment-viewer img,.attachment-viewer iframe').count(),
            0,
          );
          const downloaded = page.waitForEvent('download');
          await page.getByRole('button', { name: 'Descargar archivo', exact: true }).click();
          assert.equal((await downloaded).suggestedFilename(), 'unsafe.svg');
          assert.equal(await page.evaluate(() => !!window.attachmentExecuted), false);
          await page.getByRole('button', { name: 'Cerrar visor' }).click();
          await page.getByRole('dialog').waitFor({ state: 'detached' });
          ticket.estadoCodigo = 'CERRADO';
          ticket.estadoNombre = 'Cerrado';
          await page.reload();
          await page.locator('.staff-ticket-closed').waitFor();
          assert.equal(await page.locator('#staff-ticket-response').count(), 0);
          assert.deepEqual(errors, [], `${role}/${dark}: errores de navegador`);
          await context.close();
        }
    } finally {
      await browser?.close();
      await new Promise((resolve) => server.close(resolve));
    }
  },
);
