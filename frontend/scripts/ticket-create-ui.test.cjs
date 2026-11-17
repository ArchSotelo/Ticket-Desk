// Ejecutar tras compilar: node --test scripts/ticket-create-ui.test.cjs
// Sirve el build local y simula las API: no necesita ni modifica una base de datos.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { launchBrowser } = require('./helpers/browser.cjs');
const { installPermissionSessionDefaults } = require('./helpers/permission-session.cjs');

test(
  'formulario de tickets: cuatro roles, ambos temas y escritorio/tablet/móvil',
  { timeout: 120000 },
  async () => {
    const dist = path.resolve(__dirname, '../dist/enterprise-ticket-frontend');
    assert.ok(fs.existsSync(path.join(dist, 'index.html')), 'Primero compila el frontend');
    const server = http.createServer((req, res) => {
      let file = path.resolve(dist, '.' + new URL(req.url, 'http://localhost').pathname);
      if (
        !file.startsWith(dist + path.sep) ||
        !fs.existsSync(file) ||
        fs.statSync(file).isDirectory()
      )
        file = path.join(dist, 'index.html');
      const types = {
        '.js': 'text/javascript',
        '.css': 'text/css',
        '.html': 'text/html',
        '.png': 'image/png',
      };
      res.setHeader('Content-Type', types[path.extname(file)] || 'application/octet-stream');
      fs.createReadStream(file).pipe(res);
    });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    let browser;
    try {
      browser = await launchBrowser({
        headless: true,
        channel: process.env.PLAYWRIGHT_CHANNEL || undefined,
      });
      const base = `http://127.0.0.1:${server.address().port}`;
      const client = {
        id: 8,
        username: 'ana',
        nombres: 'Ana',
        apellidos: 'Torres',
        email: 'ana@example.com',
        empresaId: 3,
        empresaNombre: 'Empresa del cliente',
        areaId: 4,
        areaNombre: 'Recursos Humanos',
        estado: 'ACTIVO',
        roles: ['ROLE_CLIENTE'],
      };
      let cases = 0;
      for (const role of ['client', 'admin', 'technician', 'supervisor']) {
        for (const dark of [false, true]) {
          const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
          const page = await context.newPage();
          const errors = [];
          page.on('pageerror', (error) => errors.push(error.message));
          const roleCode = {
            client: 'ROLE_CLIENTE',
            admin: 'ROLE_ADMIN',
            technician: 'ROLE_TECNICO',
            supervisor: 'ROLE_SUPERVISOR',
          }[role];
          await page.addInitScript(installPermissionSessionDefaults);
          await page.addInitScript(
            ({ roleCode }) => {
              const token =
                'eyJhbGciOiJIUzI1NiJ9.' +
                btoa(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 3600 })) +
                '.test';
              localStorage.setItem(
                'user_session',
                JSON.stringify({
                  accessToken: token,
                  refreshToken: 'test',
                  roles: [roleCode],
                  fullName: 'Usuario de prueba',
                  username: 'test',
                }),
              );
              // La conexión en tiempo real está fuera del alcance de esta prueba visual.
              window.WebSocket = class {
                static OPEN = 1;
                readyState = 0;
                close() {}
                addEventListener() {}
                removeEventListener() {}
              };
            },
            { roleCode },
          );
          await page.route('**/api/v1/**', async (route) => {
            const url = route.request().url();
            let data = [];
            if (url.includes('/users/me'))
              data =
                role === 'client'
                  ? client
                  : {
                      ...client,
                      id: 1,
                      nombres: 'Operador',
                      apellidos: 'Interno',
                      empresaNombre: 'Empresa del operador',
                      roles: [roleCode],
                    };
            else if (url.includes('/contacts?')) data = { content: [client] };
            else if (url.includes('/catalogs/categories'))
              data = [{ id: 2, nombre: 'Software', subcategorias: [{ id: 5, nombre: 'Correo' }] }];
            else if (url.includes('/catalogs/priorities')) data = [{ id: 1, nombre: 'Media' }];
            else if (url.includes('/count')) data = { count: 0 };
            else if (url.includes('/settings')) data = { enabled: false };
            await route.fulfill({ json: { success: true, data } });
          });
          const target = {
            client: '/cliente/nuevo-ticket',
            admin: '/tickets/new',
            technician: '/tecnico/nuevo-ticket',
            supervisor: '/tickets/new',
          }[role];
          await page.goto(base + target);
          await page.locator('.ticket-create-page h1').waitFor();
          if (role === 'supervisor') {
            await page.waitForFunction(() =>
              document.querySelector('.portal-badge')?.textContent.includes('Portal supervisor'),
            );
          }
          await page.evaluate((dark) => document.body.classList.toggle('dark-theme', dark), dark);
          if (role !== 'client') {
            assert.match(
              await page.locator('.requester-card').innerText(),
              /Selecciona un cliente/,
            );
            assert.doesNotMatch(
              await page.locator('.requester-card').innerText(),
              /Empresa del operador/,
            );
            await page.locator('[formControlName="clienteId"]').click();
            await page.getByRole('option', { name: /Ana Torres/ }).click();
          }
          await page.waitForFunction(() =>
            document.querySelector('.requester-card')?.textContent.includes('Empresa del cliente'),
          );
          assert.match(await page.locator('.requester-card').innerText(), /Empresa del cliente/);
          const requesterCard = await page.locator('.requester-card').innerText();
          assert.match(requesterCard, /Recursos Humanos/);
          if (role === 'client') {
            assert.match(requesterCard, /Empresa y área/);
            assert.doesNotMatch(requesterCard, /Ana Torres|ana@example.com|Solicitante/);
            assert.equal(await page.locator('.requester-avatar').count(), 0);
            assert.equal(await page.locator('.requester-email').count(), 0);
            assert.equal(await page.locator('[formControlName="clienteId"]').count(), 0);
          } else {
            assert.match(requesterCard, /Cliente seleccionado/);
            assert.match(requesterCard, /Ana Torres/);
            assert.match(requesterCard, /ana@example.com/);
            assert.equal(await page.locator('.requester-avatar').innerText(), 'AT');
          }
          for (const width of [1920, 1024, 390]) {
            await page.setViewportSize({ width, height: width === 390 ? 844 : 1080 });
            await page.waitForTimeout(250);
            const dimensions = await page.locator('.ticket-create-page').evaluate((root) => {
              const layout = root.querySelector('.ticket-form-layout');
              const form = root.querySelector('.form-card').getBoundingClientRect();
              const side = root.querySelector('.ticket-side-panels').getBoundingClientRect();
              const style = getComputedStyle(
                root.querySelector('input').parentElement.parentElement,
              );
              const placeholder = getComputedStyle(root.querySelector('input'), '::placeholder');
              return {
                width: root.clientWidth,
                scrollWidth: root.scrollWidth,
                columns: getComputedStyle(layout).gridTemplateColumns.split(' ').length,
                form,
                side,
                placeholderOpacity: placeholder.opacity,
                outline: style.borderColor,
              };
            });
            assert.ok(
              dimensions.scrollWidth <= dimensions.width + 1,
              `${role}/${dark}/${width}: overflow horizontal`,
            );
            assert.equal(dimensions.columns, width === 1920 ? 2 : 1);
            assert.equal(dimensions.placeholderOpacity, '1');
            cases++;
            if (width === 1920 || width === 390) {
              await page.screenshot({
                path: path.join(
                  os.tmpdir(),
                  `ticket-create-${role}-${dark ? 'dark' : 'light'}-${width}.png`,
                ),
              });
            }
          }
          await page.getByRole('button', { name: 'Enviar ticket', exact: true }).click();
          await page.locator('.validation-summary').waitFor({ state: 'visible' });
          assert.ok(await page.locator('.validation-summary').isVisible());
          assert.match(
            await page.locator('.validation-summary').innerText(),
            /Selecciona una subcategoría/,
          );
          assert.equal(await page.locator('.mat-mdc-form-field-error').count(), 5);
          await page.locator('[formControlName="titulo"]').fill('Problema con mi correo');
          await page
            .locator('[formControlName="descripcion"]')
            .fill('No puedo acceder a mi cuenta desde esta mañana.');
          await page.locator('[formControlName="prioridadId"]').click();
          await page.getByRole('option', { name: 'Media', exact: true }).click();
          await page.locator('[formControlName="categoriaId"]').click();
          await page.getByRole('option', { name: 'Software', exact: true }).click();
          await page.locator('[formControlName="subcategoriaId"]').click();
          await page.getByRole('option', { name: 'Correo', exact: true }).click();
          await page.locator('.validation-summary').waitFor({ state: 'detached' });
          assert.equal(await page.locator('.validation-summary').count(), 0);
          await page
            .locator('input[type="file"]')
            .last()
            .setInputFiles({
              name: 'informe.pdf',
              mimeType: 'application/pdf',
              buffer: Buffer.from('documento de prueba'),
            });
          assert.match(await page.locator('.pending-item').innerText(), /informe.pdf/);
          await page.getByRole('button', { name: 'Quitar informe.pdf', exact: true }).click();
          await page.locator('.pending-item').waitFor({ state: 'detached' });
          assert.equal(await page.locator('.pending-item').count(), 0);
          assert.deepEqual(errors, []);
          await context.close();
        }
      }
      console.log(
        `${cases} combinaciones de portal/tema/resolución verificadas. Capturas en ${os.tmpdir()}`,
      );
    } finally {
      if (browser) await browser.close();
      await new Promise((resolve) => server.close(resolve));
    }
  },
);
