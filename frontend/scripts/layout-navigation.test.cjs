// Ejecutar: node --test scripts/layout-navigation.test.cjs
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const { Subject } = require('rxjs');
const rxjs = require('rxjs');

function fixture(compact = false) {
  const resize = new Subject();
  const events = new Subject();
  const subscriptions = [];
  const breakpointToken = Symbol('BreakpointObserver');
  class NavigationEnd {}
  class Router {}
  const breakpoints = {
    isMatched: (query) => {
      assert.equal(query, '(max-width: 960px)');
      return compact;
    },
    observe: (query) => {
      assert.equal(query, '(max-width: 960px)');
      return resize;
    },
  };
  const signal = (initial) => {
    let value = initial;
    const read = () => value;
    read.set = (next) => {
      value = next;
    };
    read.update = (callback) => {
      value = callback(value);
    };
    return read;
  };
  const file = path.resolve(__dirname, '../src/app/layouts/layout-navigation.service.ts');
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      experimentalDecorators: true,
    },
  }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(
    code,
    {
      exports: module.exports,
      module,
      require: (name) => {
        if (name === 'rxjs') return rxjs;
        if (name === '@angular/core')
          return {
            Injectable: () => (component) => component,
            signal,
            computed: (callback) => callback,
            inject: (token) => (token === breakpointToken ? breakpoints : { events }),
          };
        if (name === '@angular/cdk/layout') return { BreakpointObserver: breakpointToken };
        if (name === '@angular/router') return { Router, NavigationEnd };
        if (name === '@angular/core/rxjs-interop')
          return {
            takeUntilDestroyed: () => (source) =>
              new rxjs.Observable((observer) => {
                const subscription = source.subscribe(observer);
                subscriptions.push(subscription);
                return subscription;
              }),
          };
        throw new Error('Dependencia inesperada: ' + name);
      },
    },
    { filename: file },
  );
  return {
    navigation: new module.exports.LayoutNavigationService(),
    resize,
    events,
    NavigationEnd,
    destroy: () => subscriptions.forEach((subscription) => subscription.unsubscribe()),
  };
}

test('escritorio inicia expandido y permite plegar el sidebar', () => {
  const { navigation } = fixture();
  assert.equal(navigation.expanded(), true);
  navigation.toggle();
  assert.equal(navigation.collapsed(), true);
  assert.equal(navigation.mobileOpen(), false);
  navigation.toggle();
  assert.equal(navigation.expanded(), true);
});

test('móvil inicia cerrado y el botón abre un menú con sus textos', () => {
  const { navigation } = fixture(true);
  assert.equal(navigation.expanded(), false);
  navigation.toggle();
  assert.equal(navigation.expanded(), true);
  assert.equal(navigation.collapsed(), false);
  navigation.closeMobile();
  assert.equal(navigation.mobileOpen(), false);
});

test('cambiar el tamaño cierra el menú móvil y conserva el estado de escritorio', () => {
  const { navigation, resize } = fixture();
  navigation.toggle();
  resize.next({ matches: true });
  assert.equal(navigation.collapsed(), false);
  navigation.toggle();
  assert.equal(navigation.mobileOpen(), true);
  resize.next({ matches: false });
  assert.equal(navigation.mobileOpen(), false);
  assert.equal(navigation.collapsed(), true);
});

test('la navegación cierra el menú móvil sin modificar el menú de escritorio', () => {
  const { navigation, events, NavigationEnd } = fixture(true);
  navigation.toggle();
  events.next({});
  assert.equal(navigation.mobileOpen(), true);
  events.next(new NavigationEnd());
  assert.equal(navigation.mobileOpen(), false);
});

test('cada portal mantiene su propio estado y libera las suscripciones al salir', () => {
  const first = fixture(true);
  const second = fixture(true);
  first.navigation.toggle();
  assert.equal(second.navigation.mobileOpen(), false);
  first.destroy();
  first.resize.next({ matches: false });
  assert.equal(first.navigation.isCompact(), true);
});
