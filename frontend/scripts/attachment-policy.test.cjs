const { test } = require('node:test'),
  assert = require('node:assert/strict');
const {
  attachmentFileError,
  isRasterAttachment,
  isPdfAttachment,
} = require('./attachment-policy.fixture.cjs');
test('bloquea HTML/SVG, ejecutables, macros y archivos vacíos o grandes antes de subir', () => {
  for (const name of [
    'a.html',
    'a.SVG',
    'a.svgz',
    'a.exe',
    'a.js',
    'a.docm',
    'a.xlsm',
    'a.zip',
    'a.pdf.exe',
    'x.png:html',
    '../x.png',
  ])
    assert.ok(attachmentFileError({ name, size: 4 }), name);
  assert.ok(attachmentFileError({ name: 'x.pdf', size: 0 }));
  assert.ok(attachmentFileError({ name: 'x.pdf', size: 26 * 1024 * 1024 }));
  for (const name of [
    'a.PNG',
    'a.jpg',
    'a.gif',
    'a.webp',
    'a.pdf',
    'a.docx',
    'a.xlsx',
    'a.pptx',
    'a.txt',
    'a.csv',
  ])
    assert.equal(attachmentFileError({ name, size: 4 }), null, name);
});
test('no considera imágenes o PDF por extensión o MIME aislados', () => {
  for (const f of [
    { nombreOriginal: 'x.svg', mimeType: 'image/svg+xml' },
    { nombreOriginal: 'x.html', mimeType: 'image/png' },
    { nombreOriginal: 'x.png', mimeType: 'text/html' },
  ])
    assert.equal(isRasterAttachment(f), false);
  assert.equal(isRasterAttachment({ nombreOriginal: 'x.PNG', mimeType: 'image/png' }), true);
  assert.equal(isPdfAttachment({ nombreOriginal: 'x.pdf', mimeType: 'text/html' }), false);
  assert.equal(isPdfAttachment({ nombreOriginal: 'x.html', mimeType: 'application/pdf' }), false);
});
