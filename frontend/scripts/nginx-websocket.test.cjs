// Static regression checks; an actual nginx -t still requires Nginx/Docker.
// Run: node --test scripts/nginx-websocket.test.cjs
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const config = fs.readFileSync(path.resolve(__dirname, '../nginx.conf'), 'utf8');
const apiLocation = config.match(/location\s+\/api\/v1\/\s*\{([^{}]*)\}/)?.[1];

test('el proxy de API conserva HTTP/1.1 y reenvía ambos encabezados WebSocket', () => {
  assert.ok(apiLocation, 'Debe existir el proxy /api/v1/');
  assert.match(apiLocation, /proxy_http_version\s+1\.1\s*;/);
  assert.match(apiLocation, /proxy_set_header\s+Upgrade\s+\$http_upgrade\s*;/);
  assert.match(apiLocation, /proxy_set_header\s+Connection\s+\$connection_upgrade\s*;/);
});

test('el cambio de protocolo es condicional y las llamadas HTTP normales no solicitan upgrade', () => {
  const mapping = config.match(/map\s+\$http_upgrade\s+\$connection_upgrade\s*\{([^{}]*)\}/)?.[1];
  assert.ok(mapping, 'Debe existir el map de Connection');
  assert.match(mapping, /default\s+upgrade\s*;/);
  assert.match(mapping, /''\s+close\s*;/);
  assert.ok(
    config.indexOf('map $http_upgrade') < config.indexOf('server {'),
    'map debe estar fuera del bloque server',
  );
});

test('no se alteran la ruta backend, los encabezados originales ni el fallback de Angular', () => {
  assert.match(apiLocation, /proxy_pass\s+http:\/\/backend:8080\/api\/v1\/\s*;/);
  assert.match(apiLocation, /proxy_set_header\s+Host\s+\$host\s*;/);
  assert.match(apiLocation, /proxy_set_header\s+X-Forwarded-For\s+\$proxy_add_x_forwarded_for\s*;/);
  assert.match(apiLocation, /proxy_set_header\s+X-Forwarded-Proto\s+\$scheme\s*;/);
  assert.match(apiLocation, /client_max_body_size\s+50m\s*;/);
  assert.match(config, /try_files\s+\$uri\s+\$uri\/\s+\/index\.html\s*;/);
  const dockerfile = fs.readFileSync(path.resolve(__dirname, '../Dockerfile'), 'utf8');
  assert.match(dockerfile, /COPY\s+nginx\.conf\s+\/etc\/nginx\/conf\.d\/default\.conf/);
});
