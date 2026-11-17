// Ejecuta únicamente las pruebas que no requieren navegador ni servidor real.
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const tests = fs
  .readdirSync(__dirname)
  .filter((name) => name.endsWith('.test.cjs') && !name.endsWith('-ui.test.cjs'))
  .sort();
for (const test of tests) {
  const result = spawnSync(process.execPath, [path.join(__dirname, test)], { stdio: 'inherit' });
  if (result.error) {
    console.error(result.error.message);
    process.exit(1);
  }
  if (result.status !== 0) process.exit(result.status || 1);
}
console.log(`Archivos de pruebas completados: ${tests.length}`);
