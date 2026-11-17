// API simulada. Verifica el portal del cliente sin modificar datos reales.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { launchBrowser } = require('./helpers/browser.cjs');
const { installPermissionSessionDefaults } = require('./helpers/permission-session.cjs');
const http = require('node:http'),
  fs = require('node:fs'),
  path = require('node:path'),
  os = require('node:os');

test(
  'Cliente: Base de conocimiento visible, pública y de solo lectura en escritorio y móvil',
  { timeout: 90000 },
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
      const context = await browser.newContext({ viewport: { width: 1846, height: 964 } }),
        page = await context.newPage(),
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
      const articles = [
        {
          id: 1,
          titulo: 'No tengo acceso a Internet por cable',
          contenidoMarkdown:
            '## Problema\n\nSin conexión a Internet.\n\n## Solución\n\n1. Revisa el cable de red.\n2. Registra un ticket si el problema continúa.',
          categoriaId: 1,
          categoriaNombre: 'Redes y conectividad',
          autorNombre: 'Soporte',
          esPublico: true,
          vistas: 3,
          fechaCreacion: '27/10/2026 23:43',
        },
        {
          id: 2,
          titulo: 'Configurar el correo',
          contenidoMarkdown: '## Guía\n\nPasos de configuración del correo.',
          categoriaId: 2,
          categoriaNombre: 'Correo',
          autorNombre: 'Soporte',
          esPublico: true,
          vistas: 2,
          fechaCreacion: '27/10/2026 23:43',
        },
      ];
      await page.route('**/api/v1/**', async (route) => {
        const req = route.request(),
          url = new URL(req.url());
        requests.push(url.pathname);
        assert.equal(req.method(), 'GET', 'El cliente solo debe consultar datos');
        let data = [];
        if (url.pathname === '/api/v1/knowledge-base')
          data = { content: articles, totalPages: 1, totalElements: 2 };
        else if (/\/knowledge-base\/\d+$/.test(url.pathname))
          data = {
            ...articles.find((a) => a.id === Number(url.pathname.split('/').at(-1))),
            vistas: 4,
          };
        else if (url.pathname.endsWith('/users/me'))
          data = {
            id: 8,
            nombres: 'Ana',
            apellidos: 'Torres',
            roles: ['ROLE_CLIENTE'],
            estado: 'ACTIVO',
          };
        else if (url.pathname.endsWith('/count')) data = { count: 0 };
        else if (url.pathname.endsWith('/settings')) data = { enabled: false };
        await route.fulfill({ json: { success: true, data } });
      });
      await page.goto(`http://127.0.0.1:${server.address().port}/cliente/knowledge-base`);
      await page.locator('.kb-article-row').nth(1).waitFor();
      assert.equal(
        await page
          .getByRole('link', { name: 'Base de conocimiento', exact: true })
          .getAttribute('href'),
        '/cliente/knowledge-base',
      );
      assert.equal(
        await page.getByRole('button', { name: 'Nuevo artículo', exact: true }).count(),
        0,
      );
      assert.equal(await page.locator('.kb-dialog').count(), 0);
      assert.equal(
        requests.includes('/api/v1/catalogs/categories'),
        false,
        'El cliente no carga el catálogo del editor',
      );
      await page.getByLabel('Buscar por título o contenido', { exact: true }).fill('conexion');
      await page.waitForFunction(() => document.querySelectorAll('.kb-article-row').length === 1);
      await page.getByLabel('Buscar por título o contenido', { exact: true }).fill('');
      await page.locator('.kb-article-row').nth(1).waitFor();
      await page.getByRole('button', { name: 'Correo', exact: true }).click();
      await page.waitForFunction(() => document.querySelectorAll('.kb-article-row').length === 1);
      await page.getByRole('button', { name: 'Todos', exact: true }).click();
      await page.locator('.kb-article-row').nth(1).waitFor();
      await page
        .getByRole('button', { name: 'Leer artículo: ' + articles[0].titulo, exact: true })
        .click();
      await page.locator('.kb-reading-body h2').first().waitFor();
      assert.equal(await page.locator('.kb-reading-body ol li').count(), 2);
      assert.equal(await page.getByRole('button', { name: 'Editar', exact: true }).count(), 0);
      assert.equal(
        await page.getByRole('button', { name: 'Eliminar artículo', exact: true }).count(),
        0,
      );
      for (const dark of [false, true])
        for (const width of [1846, 390]) {
          await page.setViewportSize({ width, height: 964 });
          await page.evaluate((d) => document.body.classList.toggle('dark-theme', d), dark);
          await page.waitForTimeout(250);
          assert.ok(
            await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
          );
          await page.screenshot({
            path: path.join(
              os.tmpdir(),
              `client-knowledge-${dark ? 'dark' : 'light'}-${width}.png`,
            ),
          });
        }
      await page.getByRole('button', { name: 'Cerrar artículo', exact: true }).click();
      await page.locator('.kb-detail').waitFor({ state: 'detached' });
      await page.getByLabel('Buscar por título o contenido', { exact: true }).fill('no existe');
      await page
        .getByRole('heading', { name: 'No encontramos artículos con estos filtros' })
        .waitFor();
      await page.getByRole('button', { name: 'Limpiar filtros', exact: true }).click();
      await page.locator('.kb-article-row').nth(1).waitFor();
      assert.deepEqual(errors, []);
      await context.close();
    } finally {
      await browser?.close();
      await new Promise((resolve) => server.close(resolve));
    }
  },
);
