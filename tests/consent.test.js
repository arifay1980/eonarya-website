const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'assets/consent.js'), 'utf8');
const publicPages = [
  'index.html',
  'yardim.html',
  'gizlilik.html',
  'kullanim-sartlari.html',
  'kvkk.html',
  'aydinlatma.html',
  'ucuncu-kisi-aydinlatma.html',
  'cerez-politikasi.html',
  'blog/index.html',
];
const privatePages = ['bilgi.html', 'mesaj.html', 'onay.html', 'onay-hatirlatma.html', 'tercihler.html'];

class FakeElement {
  constructor(tagName = 'div') {
    this.tagName = tagName.toUpperCase();
    this.children = [];
    this.listeners = new Map();
    this.attributes = new Map();
    this.hidden = false;
    this.id = '';
    this.className = '';
    this.textContent = '';
  }

  append(...children) {
    this.children.push(...children);
  }

  appendChild(child) {
    this.children.push(child);
    return child;
  }

  addEventListener(type, callback) {
    this.listeners.set(type, callback);
  }

  setAttribute(name, value) {
    this.attributes.set(name, String(value));
  }

  getAttribute(name) {
    return this.attributes.get(name) || null;
  }

  focus() {
    this.focused = true;
  }
}

function descendants(node) {
  const result = [];
  for (const child of node.children || []) {
    if (typeof child === 'string') continue;
    result.push(child, ...descendants(child));
  }
  return result;
}

function runtime({ stored = null, storageFails = false } = {}) {
  const values = new Map();
  if (stored !== null) values.set('eonarya_cookie_consent', stored);
  const settings = new FakeElement('button');
  const head = new FakeElement('head');
  const body = new FakeElement('body');
  const cookieWrites = [];
  const replacements = [];

  const document = {
    readyState: 'complete',
    referrer: 'https://referrer.example/onceki?token=secret#private',
    head,
    body,
    createElement: (tag) => new FakeElement(tag),
    addEventListener() {},
    getElementById(id) {
      return [...descendants(head), ...descendants(body)].find((element) => element.id === id) || null;
    },
    querySelectorAll(selector) {
      return selector === '[data-cookie-settings]' ? [settings] : [];
    },
  };
  Object.defineProperty(document, 'cookie', {
    get: () => '_ga=GA1.1.1; _ga_TEST=GS1.1.1; necessary=yes',
    set: (value) => cookieWrites.push(value),
  });

  const localStorage = {
    getItem(key) {
      if (storageFails) throw new Error('storage blocked');
      return values.has(key) ? values.get(key) : null;
    },
    setItem(key, value) {
      if (storageFails) throw new Error('storage blocked');
      values.set(key, value);
    },
  };
  const location = {
    origin: 'https://eonarya.com',
    hostname: 'eonarya.com',
    pathname: '/yardim.html',
    href: 'https://eonarya.com/yardim.html?token=secret#private',
    replace: (value) => replacements.push(value),
  };
  const window = { document, localStorage, location };
  window.window = window;
  const context = vm.createContext({
    window,
    document,
    localStorage,
    location,
    URL,
    Date,
    Object,
    encodeURIComponent,
  });
  vm.runInContext(source, context);

  return { window, document, values, cookieWrites, replacements, settings, head, body };
}

function commands(instance, name) {
  return instance.window.dataLayer
    .map((entry) => Array.from(entry))
    .filter((entry) => entry[0] === name);
}

test('genel sayfalar ortak consent katmanını, hassas sayfalar ise sıfır Analytics sözleşmesini korur', () => {
  for (const page of publicPages) {
    const html = fs.readFileSync(path.join(root, page), 'utf8');
    assert.match(html, /assets\/consent\.js/, `${page}: consent JS`);
    assert.match(html, /assets\/consent\.css/, `${page}: consent CSS`);
    assert.match(html, /data-cookie-settings/, `${page}: ayarlar bağlantısı`);
    assert.doesNotMatch(html, /<script async src="https:\/\/www\.googletagmanager\.com\/gtag\/js/);
    assert.doesNotMatch(html, /gtag\(['"]config['"],\s*['"]G-GFHVXH40X5['"]\)/);
  }

  for (const page of privatePages) {
    const html = fs.readFileSync(path.join(root, page), 'utf8');
    assert.doesNotMatch(html, /assets\/consent\.(?:js|css)|data-cookie-settings|googletagmanager\.com\/gtag\/js/);
  }
});

test('Çerez Politikası onaylı içeriği, ayar erişimini ve kanonik adresi korur', () => {
  const html = fs.readFileSync(path.join(root, 'cerez-politikasi.html'), 'utf8');
  assert.match(html, /<link rel="canonical" href="https:\/\/eonarya\.com\/cerez-politikasi\.html">/);
  assert.equal((html.match(/class="doc-section-title"/g) || []).length, 13);
  assert.match(html, /Google Analytics’e gönderilmeyen bilgiler/);
  assert.match(html, /data-cookie-settings/);
  assert.match(source, /const POLICY_PATH = '\/cerez-politikasi\.html'/);
  assert.match(source, /policy\.href = POLICY_PATH/);
});

test('ilk ziyaret ve geçersiz tercih fail-closed kalır, banner görünür', () => {
  for (const stored of [null, 'unexpected']) {
    const instance = runtime({ stored });
    assert.equal(instance.head.children.filter((element) => element.id === 'eonarya-ga4').length, 0);
    assert.equal(instance.window['ga-disable-G-GFHVXH40X5'], true);
    assert.equal(instance.body.children[0].hidden, false);
    assert.equal(commands(instance, 'config').length, 0);
    assert.equal(commands(instance, 'consent')[0][2].analytics_storage, 'denied');
  }
});

test('kabul tercihi GA4 yükleyicisini ve config çağrısını yalnız bir kez oluşturur', () => {
  const instance = runtime({ stored: 'accepted' });
  instance.window.EonaryaConsent.accept();
  assert.equal(instance.head.children.filter((element) => element.id === 'eonarya-ga4').length, 1);
  assert.equal(commands(instance, 'config').length, 1);
  assert.equal(instance.window['ga-disable-G-GFHVXH40X5'], false);
  assert.equal(instance.values.get('eonarya_cookie_consent'), 'accepted');
});

test('Analytics config query, hash ve referrer parametrelerini göndermez', () => {
  const instance = runtime({ stored: 'accepted' });
  const config = commands(instance, 'config')[0];
  assert.equal(config[1], 'G-GFHVXH40X5');
  assert.deepEqual(
    {
      page_location: config[2].page_location,
      page_path: config[2].page_path,
      page_referrer: config[2].page_referrer,
    },
    {
      page_location: 'https://eonarya.com/yardim.html',
      page_path: '/yardim.html',
      page_referrer: 'https://referrer.example/onceki',
    },
  );
  assert.doesNotMatch(JSON.stringify(config[2]), /secret|#private/);
});

test('ret GA4 yüklemez; kabulden ret ise çerezleri temizleyip temiz URL ile yeniden başlar', () => {
  const firstReject = runtime();
  assert.equal(firstReject.window.EonaryaConsent.reject(), true);
  assert.equal(firstReject.head.children.filter((element) => element.id === 'eonarya-ga4').length, 0);
  assert.equal(firstReject.replacements.length, 0);
  assert.equal(firstReject.values.get('eonarya_cookie_consent'), 'rejected');

  const revoked = runtime({ stored: 'accepted' });
  assert.equal(revoked.window.EonaryaConsent.reject(), true);
  assert.equal(revoked.window['ga-disable-G-GFHVXH40X5'], true);
  assert.equal(revoked.values.get('eonarya_cookie_consent'), 'rejected');
  assert.deepEqual(revoked.replacements, ['https://eonarya.com/yardim.html']);
  assert.ok(revoked.cookieWrites.some((value) => value.startsWith('_ga=')));
  assert.ok(revoked.cookieWrites.some((value) => value.startsWith('_ga_TEST=')));
});

test('kayıtlı ret tercihi çerez temizliğini tekrarlar ve sonradan kabul GA4 engelini kaldırır', () => {
  const instance = runtime({ stored: 'rejected' });
  assert.equal(instance.head.children.filter((element) => element.id === 'eonarya-ga4').length, 0);
  assert.ok(instance.cookieWrites.some((value) => value.startsWith('_ga=')));
  assert.equal(instance.window.EonaryaConsent.accept(), true);
  assert.equal(instance.window['ga-disable-G-GFHVXH40X5'], false);
  assert.equal(instance.head.children.filter((element) => element.id === 'eonarya-ga4').length, 1);
  assert.equal(commands(instance, 'config').length, 1);
});

test('erişilemeyen localStorage kabulü açmaz ve paneli görünür tutar', () => {
  const instance = runtime({ storageFails: true });
  assert.equal(instance.window.EonaryaConsent.accept(), false);
  assert.equal(instance.window['ga-disable-G-GFHVXH40X5'], true);
  assert.equal(instance.head.children.filter((element) => element.id === 'eonarya-ga4').length, 0);
  assert.equal(instance.body.children[0].hidden, false);
});
