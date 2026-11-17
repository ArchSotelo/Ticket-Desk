// Navegador con API simulada: no modifica artículos reales.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { launchBrowser } = require('./helpers/browser.cjs');
const { installPermissionSessionDefaults } = require('./helpers/permission-session.cjs');
const http = require('node:http'),
  fs = require('node:fs'),
  path = require('node:path'),
  os = require('node:os');

test(
  'Base de conocimiento: búsqueda, lectura segura, editor, Markdown, guardado, categorías, móvil y errores',
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
      for (const technician of [false, true]) {
        const context = await browser.newContext({ viewport: { width: 1846, height: 964 } });
        const page = await context.newPage(),
          errors = [],
          writes = [];
        page.on('pageerror', (error) => errors.push(error.message));
        await page.addInitScript(installPermissionSessionDefaults);
        await page.addInitScript((tech) => {
          const accessToken =
            'e30.' + btoa(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 3600 })) + '.test';
          localStorage.setItem(
            'user_session',
            JSON.stringify({
              accessToken,
              roles: [tech ? 'ROLE_TECNICO' : 'ROLE_ADMIN'],
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
        }, technician);
        const categories = [
          { id: 1, nombre: 'Redes & Conectividad' },
          { id: 2, nombre: 'Capacitaciones' },
          { id: 3, nombre: 'Sistema Datcorpv5' },
        ];
        const titles = [
          'No tengo acceso a Internet por cable',
          'Buenas prácticas para describir un incidente',
          'Cómo registrar un ticket de soporte',
          'Reportar un error en Datcorpv5',
          'Una opción de Datcorpv5 no está disponible',
          'No puedo ingresar al Sistema Datcorpv5',
        ];
        const original =
          '## Problema\n\nEl equipo está conectado por cable, pero no tiene conexión a Internet.\n\n## Solución\n\n1. Revisa que el cable de red esté conectado en ambos extremos.\n2. Comprueba si el puerto muestra luces de actividad.\n3. Prueba otro cable autorizado si está disponible.\n\n> Si el problema continúa, registra un ticket.\n\n[Documentación](https://example.com)\n\n```text\nipconfig\n```';
        let articles = Array.from({ length: 14 }, (_, i) => ({
          id: i + 1,
          titulo: titles[i] || 'Artículo adicional ' + (i + 1),
          contenidoMarkdown: i === 0 ? original : '## Guía\n\nPasos para resolver el problema.',
          categoriaId: i === 0 ? 1 : i < 3 ? 2 : 3,
          categoriaNombre: categories[i === 0 ? 0 : i < 3 ? 1 : 2].nombre,
          autorNombre: 'Administrador Demo',
          vistas: 0,
          esPublico: true,
          fechaCreacion: '27/10/2026 23:43',
        }));
        let failSave = false,
          failCatalog = false,
          failCategories = false;
        await page.route('**/api/v1/**', async (route) => {
          const req = route.request(),
            url = new URL(req.url());
          let data = [];
          if (url.pathname === '/api/v1/catalogs/categories') {
            if (failCategories) return route.fulfill({ status: 500, json: { success: false } });
            data = categories;
          } else if (url.pathname === '/api/v1/knowledge-base' && req.method() === 'GET') {
            if (failCatalog) return route.fulfill({ status: 500, json: { success: false } });
            data = {
              content: articles,
              number: 0,
              size: 200,
              totalElements: articles.length,
              totalPages: 1,
            };
          } else if (req.method() === 'POST' || req.method() === 'PUT') {
            assert.ok(url.pathname.startsWith('/api/v1/knowledge-base'));
            const payload = req.postDataJSON();
            writes.push({ method: req.method(), payload });
            if (failSave)
              return route.fulfill({
                status: 500,
                json: { success: false, message: 'No se pudo guardar el artículo de prueba.' },
              });
            if (req.method() === 'POST') {
              data = {
                ...payload,
                id: 99,
                categoriaNombre: categories.find((c) => c.id === payload.categoriaId).nombre,
                autorNombre: 'Administrador Demo',
                vistas: 0,
                fechaCreacion: '27/10/2026 23:43',
              };
              articles.unshift(data);
            } else {
              const index = articles.findIndex(
                (a) => a.id === Number(url.pathname.split('/').at(-1)),
              );
              articles[index] = {
                ...articles[index],
                ...payload,
                categoriaNombre: categories.find((c) => c.id === payload.categoriaId).nombre,
              };
              data = articles[index];
            }
          } else if (req.method() === 'DELETE') {
            writes.push({ method: 'DELETE' });
            articles = articles.filter((a) => a.id !== Number(url.pathname.split('/').at(-1)));
            data = null;
          } else if (/\/knowledge-base\/\d+$/.test(url.pathname)) {
            data = articles.find((a) => a.id === Number(url.pathname.split('/').at(-1)));
            data = { ...data, vistas: data.vistas + 1 };
          } else if (url.pathname.endsWith('/users/me'))
            data = {
              id: 1,
              nombres: 'Administrador',
              apellidos: 'Demo',
              roles: [technician ? 'ROLE_TECNICO' : 'ROLE_ADMIN'],
              estado: 'ACTIVO',
            };
          else if (url.pathname.endsWith('/count')) data = { count: 0 };
          else if (url.pathname.endsWith('/settings')) data = { enabled: false };
          await route.fulfill({ json: { success: true, data } });
        });
        const base = `http://127.0.0.1:${server.address().port}${technician ? '/tecnico' : ''}/knowledge-base`;
        await page.goto(base);
        await page.locator('.kb-article-row').nth(5).waitFor();
        await page.getByLabel('Buscar por título o contenido', { exact: true }).fill('conexion');
        await page.waitForFunction(() => document.querySelectorAll('.kb-article-row').length === 1);
        await page.getByLabel('Buscar por título o contenido', { exact: true }).fill('');
        await page.locator('.kb-article-row').nth(5).waitFor();
        await page.getByRole('button', { name: 'Capacitaciones', exact: true }).click();
        await page.waitForFunction(() => document.querySelectorAll('.kb-article-row').length === 2);
        await page.getByRole('button', { name: 'Todos', exact: true }).click();
        await page.locator('.kb-article-row').nth(5).waitFor();
        await page.getByRole('button', { name: 'Página siguiente', exact: true }).click();
        await page.waitForFunction(() =>
          document.querySelector('.kb-pagination p')?.textContent.includes('7–12'),
        );
        await page.getByRole('button', { name: 'Página 3', exact: true }).click();
        await page.waitForFunction(() => document.querySelectorAll('.kb-article-row').length === 2);
        await page.getByRole('button', { name: 'Página 1', exact: true }).click();
        await page.locator('#kb-article-1').waitFor();
        await page
          .getByRole('button', { name: 'Leer artículo: ' + titles[0], exact: true })
          .click();
        await page.locator('.kb-reading-body h2').first().waitFor();
        assert.equal(await page.locator('.kb-reading-body h2').first().innerText(), 'Problema');
        assert.equal(await page.locator('.kb-reading-body ol li').count(), 3);
        assert.equal(await page.locator('.kb-reading-body code').innerText(), 'ipconfig\n');
        for (const dark of [false, true])
          for (const width of [1846, 1024, 390, 320]) {
            await page.setViewportSize({ width, height: 964 });
            await page.evaluate((d) => document.body.classList.toggle('dark-theme', d), dark);
            await page.waitForTimeout(250);
            assert.ok(
              await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
              'Lectura sin desbordamiento',
            );
            if (!technician)
              await page.screenshot({
                path: path.join(os.tmpdir(), `kb-read-${dark ? 'dark' : 'light'}-${width}.png`),
              });
          }
        await page.setViewportSize({ width: 1846, height: 964 });
        await page.evaluate(() => document.body.classList.remove('dark-theme'));
        await page.getByRole('button', { name: 'Editar', exact: true }).click();
        await page.getByRole('dialog').waitFor();
        await page.getByLabel('Título *', { exact: true }).fill('Conexión revisada');
        await page
          .getByLabel('Categoría *', { exact: true })
          .selectOption({ label: 'Capacitaciones' });
        await page.getByRole('button', { name: 'Guardar artículo', exact: true }).click();
        await page
          .getByRole('status')
          .filter({ hasText: 'Artículo actualizado correctamente.' })
          .waitFor();
        assert.equal(
          writes[0].payload.contenidoMarkdown,
          original,
          'Editar solo el título conserva el Markdown original sin cambios',
        );
        assert.equal(writes[0].payload.categoriaId, 2);
        await page.getByRole('button', { name: 'Nuevo artículo', exact: true }).click();
        await page.getByRole('button', { name: 'Guardar artículo', exact: true }).click();
        await page.getByText('Ingresa un título para el artículo.', { exact: true }).waitFor();
        assert.equal(writes.length, 1);
        await page.getByLabel('Título *', { exact: true }).fill('Guía nueva de conexión');
        await page
          .getByLabel('Categoría *', { exact: true })
          .selectOption({ label: 'Redes & Conectividad' });
        const editor = page.locator('.kb-visual-editor');
        await editor.fill('Revisa el cable');
        await editor.evaluate((el) => {
          const r = document.createRange();
          r.selectNodeContents(el);
          const s = window.getSelection();
          s.removeAllRanges();
          s.addRange(r);
        });
        await page.getByRole('button', { name: 'Negrita', exact: true }).click();
        await page.locator('.kb-preview .kb-rich strong').waitFor();
        await page.getByRole('button', { name: 'Insertar enlace', exact: true }).click();
        await page.getByLabel('URL del enlace', { exact: true }).fill('javascript:alert(1)');
        await page.getByRole('button', { name: 'Insertar', exact: true }).click();
        await page.getByRole('alert').filter({ hasText: 'Ingresa un enlace http' }).waitFor();
        await page.getByLabel('URL del enlace', { exact: true }).fill('https://example.com/ayuda');
        await page.getByRole('button', { name: 'Insertar', exact: true }).click();
        await page.locator('.kb-preview .kb-rich a[href="https://example.com/ayuda"]').waitFor();
        await page.getByRole('button', { name: 'Markdown', exact: true }).click();
        const source = page.locator('.kb-markdown-editor');
        const unsafe =
          '## Problema\n\nTexto de prueba\n\n## Solución\n\n1. Primer paso\n2. Segundo paso\n\n<img src="x" onerror="window.kbXss=true"><script>window.kbXss=true</script>\n\n[Malicioso](javascript:alert(1))';
        await source.fill(unsafe);
        await page.locator('.kb-preview .kb-rich h2').first().waitFor();
        assert.equal(await page.locator('.kb-preview script, .kb-preview [onerror]').count(), 0);
        assert.ok(!(await page.evaluate(() => window.kbXss)));
        const content =
          '## Problema\n\nTexto de prueba\n\n## Solución\n\n1. Primer paso\n2. Segundo paso';
        await source.fill(content);
        await page.getByRole('button', { name: 'Visual', exact: true }).click();
        await page.locator('.kb-visual-editor h2').first().waitFor();
        for (const dark of [false, true])
          for (const width of [1846, 390, 320]) {
            await page.setViewportSize({ width, height: 964 });
            await page.evaluate((d) => document.body.classList.toggle('dark-theme', d), dark);
            await page.waitForTimeout(200);
            assert.ok(
              await page
                .locator('.kb-dialog')
                .evaluate((el) => el.scrollWidth <= el.clientWidth + 1),
              'Editor sin desbordamiento',
            );
            if (!technician)
              await page.screenshot({
                path: path.join(os.tmpdir(), `kb-editor-${dark ? 'dark' : 'light'}-${width}.png`),
              });
          }
        await page.setViewportSize({ width: 1846, height: 964 });
        await page.evaluate(() => document.body.classList.remove('dark-theme'));
        await page.getByLabel('Visible para los usuarios', { exact: false }).uncheck();
        failSave = true;
        await page.getByRole('button', { name: 'Guardar artículo', exact: true }).click();
        await page
          .getByRole('alert')
          .filter({ hasText: 'No se pudo guardar el artículo de prueba.' })
          .waitFor();
        assert.equal(
          await page.getByLabel('Título *', { exact: true }).inputValue(),
          'Guía nueva de conexión',
        );
        assert.equal(
          await page.getByLabel('Visible para los usuarios', { exact: false }).isChecked(),
          false,
        );
        failSave = false;
        await page.getByRole('button', { name: 'Guardar artículo', exact: true }).click();
        await page
          .getByRole('status')
          .filter({ hasText: 'Artículo creado correctamente.' })
          .waitFor();
        assert.equal(writes.at(-1).payload.esPublico, false);
        assert.equal(writes.at(-1).payload.contenidoMarkdown, content);
        await page
          .locator('.kb-internal-note')
          .filter({ hasText: 'Artículo interno, no visible para los usuarios.' })
          .waitFor();
        await page.getByRole('button', { name: 'Nuevo artículo', exact: true }).click();
        await page.waitForFunction(
          () => document.querySelector('#kb-editor-article-title')?.value === '',
        );
        await page.keyboard.press('Escape');
        await page.getByRole('dialog').waitFor({ state: 'hidden' });
        await page.getByRole('button', { name: 'Eliminar artículo', exact: true }).click();
        await page.getByRole('button', { name: 'Cancelar', exact: true }).click();
        assert.equal(writes.filter((w) => w.method === 'DELETE').length, 0);
        await page.getByRole('button', { name: 'Eliminar artículo', exact: true }).click();
        await page.getByRole('button', { name: 'Sí, eliminar', exact: true }).click();
        await page
          .getByRole('status')
          .filter({ hasText: 'Artículo eliminado correctamente.' })
          .waitFor();
        assert.equal(writes.filter((w) => w.method === 'DELETE').length, 1);
        failCatalog = true;
        failCategories = true;
        await page.reload();
        await page
          .getByRole('alert')
          .filter({ hasText: 'No se pudieron cargar los artículos.' })
          .waitFor();
        failCatalog = false;
        await page.getByRole('button', { name: 'Reintentar artículos', exact: true }).click();
        await page.locator('.kb-article-row').nth(5).waitFor();
        await page.getByRole('button', { name: 'Nuevo artículo', exact: true }).click();
        await page
          .getByRole('alert')
          .filter({ hasText: 'No se pudieron cargar las categorías.' })
          .waitFor();
        failCategories = false;
        await page.getByRole('button', { name: 'Reintentar categorías', exact: true }).click();
        await page.waitForFunction(
          () => document.querySelectorAll('#kb-editor-category option').length === 4,
        );
        await page.keyboard.press('Escape');
        assert.deepEqual(errors, []);
        console.log(
          `${technician ? 'Técnico' : 'Admin'}: búsqueda, lectura, editor y CRUD con API simulada OK`,
        );
        await context.close();
      }
    } finally {
      await browser?.close();
      await new Promise((resolve) => server.close(resolve));
    }
  },
);
