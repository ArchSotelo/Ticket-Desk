# Pruebas del frontend

Esta carpeta contiene las verificaciones del frontend. Sus usuarios, empresas,
identificadores fiscales, teléfonos y servicios son ejemplos ficticios. Los correos
usan dominios de ejemplo; las contraseñas y tokens simulados sirven exclusivamente
para las pruebas. No copiar aquí datos de una instalación real ni credenciales válidas.

## Organización

| Archivos                              | Función                                                                                    |
| ------------------------------------- | ------------------------------------------------------------------------------------------ |
| `*.test.cjs`, excepto `*-ui.test.cjs` | Pruebas sin navegador de validaciones, sesiones, permisos y comportamiento de componentes. |
| `*-ui.test.cjs`                       | Pruebas con Playwright de pantallas, formularios y navegación con API simulada.            |
| `*.fixture.cjs`                       | Preparación reutilizable para las pruebas; no se ejecuta como una prueba independiente.    |
| `helpers/`                            | Funciones auxiliares compartidas.                                                          |
| `run-unit-tests.cjs`                  | Ejecutor de las pruebas sin navegador que utiliza `npm test`.                              |
| `.prettierrc.json`                    | Formato común, limitado a esta carpeta.                                                    |

Se conservan las rutas de los archivos para mantener los comandos existentes.
`ticket-detail-ui.test.cjs` es un punto de entrada compatible que ejecuta
`unified-ticket-detail-ui.test.cjs`; basta ejecutar uno de los dos para ese escenario.

## Ejecutar las pruebas

Desde `frontend`:

```bash
npm test
```

Las pruebas de interfaz requieren compilar el frontend e instalar Playwright y un
navegador compatible. No se incluyen en `npm test` ni en la verificación
automática actual de GitHub. Sus servidores son locales y sus respuestas de API se
simulan dentro de los tests.

Ejemplo, con las dependencias de navegador ya instaladas:

```bash
npm run build
PLAYWRIGHT_CHANNEL=chromium node --test scripts/company-management-ui.test.cjs
```

`PLAYWRIGHT_CHANNEL=chromium` selecciona el Chromium instalado mediante Playwright;
`PLAYWRIGHT_CHANNEL=chrome` selecciona Google Chrome instalado en el equipo. Sin esa
variable se conserva la selección original de cada prueba. `helpers/browser.cjs`
centraliza este ajuste sin cambiar las opciones restantes. Los navegadores de una
carpeta personalizada se pueden localizar con `PLAYWRIGHT_BROWSERS_PATH`.

## Mantener los archivos

- Colocar primero las dependencias, después la preparación de datos y funciones
  auxiliares, y finalmente los casos de prueba.
- Usar ejemplos ficticios también en las búsquedas, etiquetas y resultados esperados.
  Al cambiar un dato, actualizar sus comprobaciones relacionadas.
- Mantener las comprobaciones de errores y permisos; ordenar el código no debe
  eliminar casos ni cambiar el comportamiento esperado.
- En las pruebas de interfaz, identificar la pantalla por su nombre accesible y
  esperar el cambio visible antes de editar o comprobar un campo compartido.
- Escribir las instrucciones en líneas separadas, con sangría de dos espacios.

Para aplicar o comprobar el formato sin añadir una dependencia al proyecto, desde
`frontend`:

```bash
npm exec --yes --package=prettier@3.6.2 -- prettier --write "scripts/**/*.cjs" "scripts/*.md" "scripts/.prettierrc.json"
npm exec --yes --package=prettier@3.6.2 -- prettier --check "scripts/**/*.cjs" "scripts/*.md" "scripts/.prettierrc.json"
```

Estos comandos requieren acceso al registro npm o que la herramienta ya esté en caché.

Pruebas de sesiones y contraseñas:

- `auth-session.test.cjs`: renovación compartida, rotación entre pestañas mediante
  Web Locks, respuestas atrasadas y navegación de cambio obligatorio.
- `realtime.test.cjs`: reconexión y rechazo de sesiones revocadas.
- `forced-password-ui.test.cjs`: cambio inicial para los cuatro roles, rutas
  restringidas, validaciones y pantalla móvil.
- `profile-password-ui.test.cjs`: cambio voluntario desde los perfiles y nuevo login.

Los escenarios de navegador utilizan una API simulada; los controles reales del
servidor se comprueban con `SessionSecurityIntegrationTest` y H2 temporal.
