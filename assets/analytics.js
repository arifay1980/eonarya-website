(function () {
  'use strict';

  const MEASUREMENT_ID = 'G-GFHVXH40X5';
  const STORAGE_KEY = 'eonarya.analytics.consent.v1';
  const BLOCKED_PATHS = new Set([
    '/bilgi.html',
    '/mesaj.html',
    '/onay.html',
    '/onay-hatirlatma.html',
    '/tercihler.html',
    '/ucuncu-kisi-aydinlatma.html'
  ]);

  if (BLOCKED_PATHS.has(window.location.pathname)) return;

  const isProduction = window.location.hostname === 'eonarya.com' || window.location.hostname === 'www.eonarya.com';
  let consent = readConsent();
  let gaLoaded = false;
  let supportSuccessTracked = false;
  let helpSearchTracked = false;

  function readConsent() {
    try {
      const value = window.localStorage.getItem(STORAGE_KEY);
      return value === 'granted' || value === 'denied' ? value : null;
    } catch {
      return null;
    }
  }

  function writeConsent(value) {
    consent = value;
    try {
      window.localStorage.setItem(STORAGE_KEY, value);
    } catch {
      // Storage kapalıysa tercih yalnız bu sayfa oturumunda geçerli kalır.
    }
  }

  function removeGaCookies() {
    document.cookie.split(';').forEach(function (item) {
      const name = item.split('=')[0].trim();
      if (!name.startsWith('_ga')) return;
      document.cookie = name + '=; Max-Age=0; path=/; SameSite=Lax';
      document.cookie = name + '=; Max-Age=0; path=/; domain=.eonarya.com; SameSite=Lax';
    });
  }

  function campaignConfig() {
    const params = new URLSearchParams(window.location.search);
    const config = {};
    const mappings = [
      ['utm_source', 'campaign_source'],
      ['utm_medium', 'campaign_medium'],
      ['utm_campaign', 'campaign_name'],
      ['utm_id', 'campaign_id']
    ];

    mappings.forEach(function (pair) {
      const value = params.get(pair[0]);
      if (value) config[pair[1]] = value.slice(0, 100);
    });
    return config;
  }

  function loadGoogleAnalytics() {
    if (!isProduction || gaLoaded || consent !== 'granted') return;

    window['ga-disable-' + MEASUREMENT_ID] = false;
    window.dataLayer = window.dataLayer || [];
    window.gtag = window.gtag || function () { window.dataLayer.push(arguments); };

    window.gtag('js', new Date());
    window.gtag('config', MEASUREMENT_ID, Object.assign({
      send_page_view: false,
      allow_google_signals: false,
      allow_ad_personalization_signals: false
    }, campaignConfig()));

    window.gtag('event', 'page_view', {
      page_location: window.location.origin + window.location.pathname,
      page_title: document.title
    });

    const script = document.createElement('script');
    script.async = true;
    script.src = 'https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(MEASUREMENT_ID);
    script.referrerPolicy = 'strict-origin-when-cross-origin';
    document.head.appendChild(script);
    gaLoaded = true;
  }

  function track(eventName, params) {
    if (consent !== 'granted' || !gaLoaded || typeof window.gtag !== 'function') return;
    window.gtag('event', eventName, params || {});
  }

  window.eonaryaAnalytics = {
    track: track,
    getConsent: function () { return consent; },
    openPreferences: function () { showConsent(true); }
  };

  function injectStyles() {
    if (document.getElementById('eonarya-analytics-style')) return;

    const style = document.createElement('style');
    style.id = 'eonarya-analytics-style';
    style.textContent =
      '.eonarya-consent{position:fixed;left:20px;right:20px;bottom:20px;z-index:9999;max-width:760px;margin:0 auto;padding:18px 20px;border:1px solid rgba(255,255,255,.14);border-radius:16px;background:#0f0b17;color:#f4efff;box-shadow:0 18px 50px rgba(0,0,0,.28);font:14px/1.55 Manrope,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}' +
      '.eonarya-consent p{margin:0;color:#d8d0e8}.eonarya-consent a{color:#cbbcff;text-decoration:underline;text-underline-offset:3px}' +
      '.eonarya-consent__row{display:flex;align-items:center;justify-content:space-between;gap:18px;flex-wrap:wrap}' +
      '.eonarya-consent__actions{display:flex;gap:10px;flex-wrap:wrap}.eonarya-consent button{font:inherit;font-weight:600;border-radius:999px;padding:9px 15px;cursor:pointer}' +
      '.eonarya-consent__deny{border:1px solid rgba(255,255,255,.2);background:transparent;color:#f4efff}.eonarya-consent__allow{border:1px solid #8b6cff;background:#8b6cff;color:#fff}' +
      '.eonarya-analytics-settings{appearance:none;border:0;background:none;padding:0;font:inherit;font-size:14.5px;color:var(--d-ink-soft,#BCB1D8);cursor:pointer;text-align:left}' +
      '.eonarya-analytics-settings:hover{text-decoration:underline;text-underline-offset:3px}@media(max-width:600px){.eonarya-consent{left:12px;right:12px;bottom:12px;padding:16px}.eonarya-consent__actions{width:100%}.eonarya-consent button{flex:1}}';
    document.head.appendChild(style);
  }

  function closeConsent() {
    const node = document.getElementById('eonarya-analytics-consent');
    if (node) node.remove();
  }

  function setConsent(value) {
    const previouslyGranted = consent === 'granted';
    writeConsent(value);

    if (value === 'granted') {
      loadGoogleAnalytics();
      closeConsent();
      return;
    }

    window['ga-disable-' + MEASUREMENT_ID] = true;
    removeGaCookies();
    closeConsent();
    if (previouslyGranted && gaLoaded) window.location.reload();
  }

  function showConsent(force) {
    if (!force && consent) return;

    closeConsent();
    injectStyles();

    const box = document.createElement('aside');
    box.id = 'eonarya-analytics-consent';
    box.className = 'eonarya-consent';
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-label', 'Analitik tercihleri');

    const row = document.createElement('div');
    row.className = 'eonarya-consent__row';

    const text = document.createElement('p');
    text.innerHTML = 'Siteyi nasıl kullandığını anlamak için yalnızca izin verirsen Google Analytics kullanıyoruz. Reklam veya kişiselleştirme amacıyla kullanmıyoruz. <a href="/gizlilik.html">Gizlilik</a>';

    const actions = document.createElement('div');
    actions.className = 'eonarya-consent__actions';

    const deny = document.createElement('button');
    deny.type = 'button';
    deny.className = 'eonarya-consent__deny';
    deny.textContent = 'İzin verme';
    deny.addEventListener('click', function () { setConsent('denied'); });

    const allow = document.createElement('button');
    allow.type = 'button';
    allow.className = 'eonarya-consent__allow';
    allow.textContent = 'İzin ver';
    allow.addEventListener('click', function () { setConsent('granted'); });

    actions.appendChild(deny);
    actions.appendChild(allow);
    row.appendChild(text);
    row.appendChild(actions);
    box.appendChild(row);
    document.body.appendChild(box);

    if (force) allow.focus();
  }

  function addPreferenceLink() {
    const footer = document.querySelector('.footer-links');
    if (!footer || footer.querySelector('.eonarya-analytics-settings')) return;

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'eonarya-analytics-settings';
    button.textContent = 'Analitik tercihleri';
    button.addEventListener('click', function () { showConsent(true); });
    footer.appendChild(button);
  }

  function classifyCta(link) {
    const href = (link.getAttribute('href') || '').toLowerCase();
    if (href.includes('yardim')) return 'help_center';
    if (href.includes('#nasil')) return 'how_it_works';
    if (href.includes('#senaryolar')) return 'use_cases';
    if (href.includes('#destek')) return 'support';
    if (href.includes('#basla')) return 'discover';
    return 'other';
  }

  function instrumentPublicActions() {
    document.addEventListener('click', function (event) {
      const target = event.target.closest('a,button');
      if (!target) return;

      if (target.matches('.nav-cta,.actions .button,[data-support-link]')) {
        track('cta_click', { cta_id: classifyCta(target) });
      }
    });

    const search = document.getElementById('ym-search');
    if (search) {
      search.addEventListener('input', function () {
        if (!helpSearchTracked && search.value.trim().length > 0) {
          helpSearchTracked = true;
          track('help_search_used');
        }
      });
    }

    const status = document.getElementById('sf-status');
    if (status && 'MutationObserver' in window) {
      const observer = new MutationObserver(function () {
        if (supportSuccessTracked || !status.classList.contains('is-success')) return;
        supportSuccessTracked = true;
        track('support_form_success');
      });
      observer.observe(status, { attributes: true, childList: true, subtree: true });
    }
  }

  function boot() {
    injectStyles();
    addPreferenceLink();
    instrumentPublicActions();

    if (consent === 'granted') loadGoogleAnalytics();
    else if (!consent) showConsent(false);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})();
