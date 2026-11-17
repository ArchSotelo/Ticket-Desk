const { chromium } = require('playwright');

// Conserva las opciones de cada prueba y permite seleccionar otro navegador instalado.
function launchBrowser(options = {}) {
  const selectedChannel = process.env.PLAYWRIGHT_CHANNEL;
  if (!selectedChannel) return chromium.launch(options);

  return chromium.launch({
    ...options,
    channel: selectedChannel === 'chromium' ? undefined : selectedChannel,
  });
}

module.exports = { launchBrowser };
