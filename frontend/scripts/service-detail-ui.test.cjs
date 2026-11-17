// node --test scripts/service-detail-ui.test.cjs (tras npm run build)
// API y almacenamiento simulados: nunca modifica datos reales.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { launchBrowser } = require('./helpers/browser.cjs');
const { installPermissionSessionDefaults } = require('./helpers/permission-session.cjs');
const imageData = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a5m0AAAAASUVORK5CYII=',
  'base64',
);
const pdfData = Buffer.from(
  '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 600 800]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF',
);

test(
  'Detalle de servicio: 16 diseños, adjuntos/visor, observaciones, estados y navegación admin/técnico',
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
      const origin = `http://127.0.0.1:${server.address().port}`;
      let layouts = 0;
      for (const technician of [false, true])
        for (const dark of [false, true]) {
          const role = technician ? 'technician' : 'admin',
            base = technician ? '/tecnico/servicios' : '/servicios';
          console.log('Detalle/' + role + '/' + (dark ? 'dark' : 'light'));
          const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } }),
            page = await context.newPage(),
            errors = [],
            requests = [],
            downloads = [];
          page.on('pageerror', (error) => errors.push(error.message));
          page.on('download', (download) => downloads.push(download.suggestedFilename()));
          await page.addInitScript(installPermissionSessionDefaults);
          await page.addInitScript(
            ({ technician, dark }) => {
              if (window !== window.top) return;
              const accessToken =
                'e30.' +
                btoa(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 3600 })) +
                '.test';
              localStorage.setItem(
                'user_session',
                JSON.stringify({
                  accessToken,
                  roles: [technician ? 'ROLE_TECNICO' : 'ROLE_ADMIN'],
                  userId: 1,
                  fullName: technician ? 'Carlos Mendoza' : 'Administrador Demo',
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
            },
            { technician, dark },
          );
          const file = (id, name, mime) => ({
            id,
            nombreOriginal: name,
            mimeType: mime,
            tamanoBytes: 1024,
            fechaCreacion: '2026-09-01',
            previewUrl: '/api/v1/mock-preview/' + id,
            downloadUrl: '/api/v1/mock-download/' + id,
          });
          const records = Object.fromEntries(
            ['VENCIDO', 'ACTIVO', 'POR_VENCER', 'FINALIZADO', 'CANCELADO'].map((estado, i) => [
              i + 1,
              {
                id: i + 1,
                nombre: 'Correo Corporativo DEMO A',
                proveedor: 'Google',
                tipo: 'Correo',
                categoriaServicioId: 1,
                estado,
                fechaInicio: '2026-09-01',
                fechaFin: '2026-09-30',
                costoMensual: 302.4,
                divisa: 'PEN',
                responsable: 'Sistemas',
                notas: '',
                correosRecordatorio: [],
                adjuntos:
                  i >= 3
                    ? [
                        file(10, 'informe.pdf', 'application/pdf'),
                        file(99, 'legacy.svg', 'image/svg+xml'),
                      ]
                    : [],
                observacionCancelacion: i === 4 ? 'Ya no se utiliza.' : null,
              },
            ]),
          );
          let failLoad = false,
            failNotes = false,
            failIcons = false,
            missingPreview = false;
          await page.route('**/api/v1/**', async (route) => {
            const req = route.request(),
              url = new URL(req.url()),
              method = req.method();
            requests.push({ path: url.pathname, method });
            let data = [],
              match;
            if (url.pathname === '/api/v1/mock-download/99')
              return route.fulfill({
                contentType: 'image/svg+xml',
                body: '<svg xmlns="http://www.w3.org/2000/svg" onload="window.top.serviceAttachmentExecuted=true"/>',
              });
            if (/\/mock-preview\//.test(url.pathname)) {
              if (missingPreview) {
                missingPreview = false;
                return route.fulfill({
                  status: 404,
                  json: { success: false, message: 'Archivo no disponible' },
                });
              }
              if (url.pathname.endsWith('/11'))
                return route.fulfill({ contentType: 'image/png', body: imageData });
              return route.fulfill({
                contentType: 'application/pdf',
                body: pdfData,
                headers: { 'Content-Disposition': 'attachment; filename="informe.pdf"' },
              });
            } else if ((match = /\/services\/(\d+)\/notes$/.exec(url.pathname))) {
              assert.equal(method, 'PATCH');
              await new Promise((resolve) => setTimeout(resolve, 150));
              if (failNotes) {
                failNotes = false;
                return route.fulfill({ status: 500, json: { message: 'Error simulado' } });
              }
              data = records[match[1]];
              data.notas = req.postDataJSON().observaciones;
            } else if ((match = /\/services\/(\d+)\/attachments$/.exec(url.pathname))) {
              assert.equal(method, 'POST');
              assert.match(req.postData(), /informe.pdf/);
              assert.match(req.postData(), /imagen.png/);
              await new Promise((resolve) => setTimeout(resolve, 150));
              data = records[match[1]];
              data.adjuntos = [
                file(10, 'informe.pdf', 'application/pdf'),
                file(11, 'imagen.png', 'image/png'),
              ];
            } else if ((match = /\/services\/(\d+)\/attachments\/(\d+)$/.exec(url.pathname))) {
              assert.equal(method, 'DELETE');
              records[match[1]].adjuntos = records[match[1]].adjuntos.filter(
                (f) => f.id !== Number(match[2]),
              );
            } else if ((match = /\/services\/(\d+)\/status$/.exec(url.pathname))) {
              assert.equal(method, 'PATCH');
              assert.equal(url.searchParams.get('estado'), 'FINALIZADO');
              data = records[match[1]];
              data.estado = 'FINALIZADO';
            } else if ((match = /\/services\/(\d+)\/cancel$/.exec(url.pathname))) {
              assert.equal(method, 'PATCH');
              data = records[match[1]];
              data.estado = 'CANCELADO';
              data.observacionCancelacion = req.postDataJSON().observacionCancelacion;
            } else if (url.pathname === '/api/v1/service-categories') {
              if (failIcons) {
                failIcons = false;
                return route.fulfill({ status: 500, json: { success: false } });
              }
              data = [{ id: 1, nombre: 'Correo renombrado', icono: 'mail', activa: false }];
            } else if ((match = /\/services\/(\d+)$/.exec(url.pathname))) {
              if (failLoad) {
                failLoad = false;
                return route.fulfill({ status: 500, json: { success: false } });
              }
              data = records[match[1]];
            } else if (url.pathname.endsWith('/history')) data = [records[4], records[5]];
            else if (url.pathname === '/api/v1/services')
              data = {
                content: [],
                totalElements: 0,
                totalPages: 0,
                number: 0,
                size: 8,
                totalesPorDivisa: {},
              };
            else if (url.pathname.endsWith('/users/me'))
              data = {
                id: 1,
                nombres: 'Carlos',
                apellidos: 'Mendoza',
                roles: [technician ? 'ROLE_TECNICO' : 'ROLE_ADMIN'],
                estado: 'ACTIVO',
              };
            else if (url.pathname.endsWith('/count')) data = { count: 0 };
            else if (url.pathname.endsWith('/settings')) data = { enabled: false };
            await route.fulfill({ json: { success: true, data } });
          });
          await page.goto(origin + base + '/1');
          await page
            .getByRole('heading', { name: 'Correo Corporativo DEMO A', exact: true })
            .waitFor();
          await page.waitForFunction(() =>
            document.querySelector('.detail-service-icon mat-icon')?.textContent.includes('mail'),
          );
          assert.equal(await page.locator('.sd-status').innerText(), 'Vencido');
          assert.equal(await page.locator('.sd-cost').innerText(), 'PEN 302.40');
          assert.equal(await page.locator('.sd-file-count').innerText(), '0 archivos');
          for (const width of [1920, 1024, 390, 320]) {
            await page.setViewportSize({ width, height: width <= 390 ? 844 : 1080 });
            await page.waitForTimeout(300);
            await page.locator('.main-content, .tech-main').evaluate((el) => (el.scrollTop = 0));
            for (const selector of [
              '.service-detail-page',
              '.detail-header',
              '.detail-hero',
              '.detail-grid',
              '.invoice-card',
              '.observations-panel',
            ])
              assert.ok(
                await page.locator(selector).evaluate((el) => el.scrollWidth <= el.clientWidth + 1),
                selector + ' a ' + width,
              );
            assert.ok(
              await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
            );
            if (width === 1920) {
              assert.ok(
                await page.locator('.service-detail-page').evaluate((el) => el.clientWidth > 1450),
              );
              assert.ok(
                await page
                  .locator('.observations-panel')
                  .evaluate(
                    (el) =>
                      el.getBoundingClientRect().bottom <=
                      document.querySelector('.main-content, .tech-main').getBoundingClientRect()
                        .bottom +
                        1,
                  ),
              );
            }
            await page.screenshot({
              path: path.join(
                os.tmpdir(),
                `service-detail-${role}-${dark ? 'dark' : 'light'}-${width}.png`,
              ),
            });
            layouts++;
          }
          await page.setViewportSize({ width: 1920, height: 1080 });
          await page.waitForTimeout(300);
          await page
            .getByLabel('Observaciones del servicio', { exact: true })
            .fill('Observación de prueba');
          await page
            .getByRole('button', { name: 'Guardar observaciones', exact: true })
            .click({ clickCount: 3 });
          await page.locator('.swal2-container').waitFor();
          await page.locator('.swal2-container').waitFor({ state: 'hidden' });
          assert.equal(requests.filter((r) => r.path.endsWith('/notes')).length, 1);
          assert.equal(records[1].notas, 'Observación de prueba');
          failNotes = true;
          await page.getByRole('button', { name: 'Guardar observaciones', exact: true }).click();
          await page
            .getByRole('heading', { name: 'No se pudieron guardar', exact: true })
            .waitFor();
          await page.locator('.swal2-confirm').click();
          await page.locator('.swal2-container').waitFor({ state: 'hidden' });
          assert.equal(
            await page.getByLabel('Observaciones del servicio', { exact: true }).inputValue(),
            'Observación de prueba',
          );
          const beforeRejectedUpload = requests.filter((r) => r.method === 'POST').length;
          await page.locator('.invoice-card input[type=file]').setInputFiles({
            name: 'x.svg',
            mimeType: 'image/svg+xml',
            buffer: Buffer.from('<svg/>'),
          });
          await page
            .getByRole('dialog', { name: 'No se pudo adjuntar el archivo', exact: true })
            .waitFor();
          await page.getByRole('button', { name: 'Entendido', exact: true }).click();
          await page.locator('.swal2-container').waitFor({ state: 'hidden' });
          assert.equal(requests.filter((r) => r.method === 'POST').length, beforeRejectedUpload);
          await page.locator('.invoice-card input[type=file]').setInputFiles([
            { name: 'informe.pdf', mimeType: 'application/pdf', buffer: pdfData },
            { name: 'imagen.png', mimeType: 'image/png', buffer: imageData },
          ]);
          await page.waitForFunction(() =>
            document.querySelector('.sd-file-count')?.textContent.includes('2 archivos'),
          );
          missingPreview = true;
          await page
            .getByRole('button', { name: 'Previsualizar informe.pdf', exact: true })
            .click();
          await page.getByRole('dialog', { name: 'Archivo no disponible', exact: true }).waitFor();
          assert.equal(await page.locator('dialog[open]').count(), 0);
          assert.equal(downloads.length, 0);
          await page.getByRole('button', { name: 'Entendido', exact: true }).click();
          await page.locator('.swal2-container').waitFor({ state: 'hidden' });
          await page
            .getByRole('button', { name: 'Previsualizar informe.pdf', exact: true })
            .click();
          await page.locator('dialog[open] iframe').waitFor();
          assert.equal(
            await page.locator('dialog[open] iframe').getAttribute('sandbox'),
            'allow-same-origin',
          );
          await page.waitForTimeout(300);
          assert.equal(downloads.length, 0, 'Abrir no descarga el PDF');
          for (const width of [1920, 390, 320]) {
            await page.setViewportSize({ width, height: width === 1920 ? 1080 : 600 });
            await page.mouse.wheel(0, 800);
            assert.ok(
              await page.locator('dialog[open]').evaluate((el) => {
                const r = el.getBoundingClientRect();
                return (
                  r.top >= 0 &&
                  r.left >= 0 &&
                  r.right <= innerWidth + 1 &&
                  r.bottom <= innerHeight + 1 &&
                  el.scrollWidth <= el.clientWidth + 1
                );
              }),
              'Visor ajustado a la ventana',
            );
            assert.ok(
              await page
                .getByRole('button', { name: 'Cerrar', exact: true })
                .evaluate((el) => el.getBoundingClientRect().bottom <= innerHeight),
            );
          }
          await page.screenshot({
            path: path.join(
              os.tmpdir(),
              `service-preview-${role}-${dark ? 'dark' : 'light'}-320.png`,
            ),
          });
          await page.keyboard.press('Escape');
          await page.locator('dialog[open]').waitFor({ state: 'hidden' });
          await page.getByRole('button', { name: 'Previsualizar imagen.png', exact: true }).click();
          await page.waitForFunction(() => {
            const img = document.querySelector('dialog[open] img');
            return img && img.complete && img.naturalWidth > 0;
          });
          assert.equal(downloads.length, 0);
          const download = page.waitForEvent('download');
          await page.getByRole('button', { name: 'Descargar', exact: true }).click();
          assert.equal((await download).suggestedFilename(), 'imagen.png');
          await page.getByRole('button', { name: 'Cerrar visor', exact: true }).click();
          await page.setViewportSize({ width: 1920, height: 1080 });
          await page.waitForTimeout(300);
          await page.getByRole('button', { name: 'Eliminar imagen.png', exact: true }).click();
          await page.locator('.swal2-confirm').click();
          await page.getByRole('heading', { name: 'Archivo eliminado', exact: true }).waitFor();
          await page.locator('.swal2-container').waitFor({ state: 'hidden' });
          assert.equal(await page.locator('.sd-file-count').innerText(), '1 archivo');
          await page.getByRole('button', { name: 'Renovar', exact: true }).click();
          await page.waitForURL(origin + base + '/1/renovar');
          await page.locator('.service-form-page').waitFor();
          await page.goto(origin + base + '/2');
          await page.getByRole('button', { name: 'Finalizar servicio', exact: true }).click();
          await page.locator('.swal2-confirm').click();
          await page.getByRole('heading', { name: 'Servicio finalizado', exact: true }).waitFor();
          await page.locator('.swal2-confirm').click();
          assert.equal(
            await page
              .getByRole('button', { name: 'Guardar observaciones', exact: true })
              .isDisabled(),
            true,
          );
          assert.equal(
            await page.getByRole('button', { name: 'Seleccionar archivos', exact: true }).count(),
            0,
          );
          await page.goto(origin + base + '/3');
          await page.getByRole('button', { name: 'Cancelar servicio', exact: true }).click();
          await page.locator('.swal2-confirm').click();
          await page.locator('.swal2-validation-message').waitFor();
          await page.locator('.swal2-textarea').fill('Ya no se requiere.');
          await page.locator('.swal2-confirm').click();
          await page.getByRole('heading', { name: 'Servicio cancelado', exact: true }).waitFor();
          await page.locator('.swal2-confirm').click();
          assert.match(await page.locator('.cancellation-note').innerText(), /Ya no se requiere/);
          for (const id of [4, 5]) {
            await page.goto(origin + base + '/' + id + '?from=history');
            await page
              .getByRole('heading', { name: 'Correo Corporativo DEMO A', exact: true })
              .waitFor();
            assert.equal(
              await page
                .getByRole('button', { name: 'Guardar observaciones', exact: true })
                .isDisabled(),
              true,
            );
            assert.equal(await page.locator('#service-notes').getAttribute('readonly'), '');
            assert.equal(await page.locator('.sd-delete').count(), 0);
            assert.equal(
              await page.getByRole('button', { name: 'Renovar', exact: true }).count(),
              0,
            );
            await page
              .getByRole('button', { name: 'Previsualizar legacy.svg', exact: true })
              .click();
            await page.locator('dialog[open] .attachment-viewer-file').waitFor();
            assert.equal(await page.locator('dialog[open] img,dialog[open] iframe').count(), 0);
            const legacyDownload = page.waitForEvent('download');
            await page.getByRole('button', { name: 'Descargar', exact: true }).click();
            assert.equal((await legacyDownload).suggestedFilename(), 'legacy.svg');
            assert.equal(await page.evaluate(() => !!window.serviceAttachmentExecuted), false);
            await page.keyboard.press('Escape');
            await page.locator('dialog[open]').waitFor({ state: 'hidden' });
            await page
              .getByRole('button', { name: 'Previsualizar informe.pdf', exact: true })
              .click();
            await page.locator('dialog[open] iframe').waitFor();
            assert.equal(
              await page.locator('dialog[open] iframe').getAttribute('sandbox'),
              'allow-same-origin',
            );
            await page.keyboard.press('Escape');
            await page.getByRole('button', { name: 'Historial de servicios', exact: true }).click();
            await page.waitForURL(origin + base + '/historial');
          }
          failLoad = true;
          await page.goto(origin + base + '/1');
          await page.getByRole('button', { name: 'Reintentar servicio', exact: true }).click();
          await page
            .getByRole('heading', { name: 'Correo Corporativo DEMO A', exact: true })
            .waitFor();
          failIcons = true;
          await page.reload();
          await page.getByRole('button', { name: 'Reintentar icono', exact: true }).click();
          await page.waitForFunction(() =>
            document.querySelector('.detail-service-icon mat-icon')?.textContent.includes('mail'),
          );
          assert.deepEqual(errors, []);
          await context.close();
        }
      console.log('Comprobadas ' + layouts + ' vistas, visores y operaciones con API simulada.');
    } finally {
      await browser?.close();
      await new Promise((resolve) => server.close(resolve));
    }
  },
);
