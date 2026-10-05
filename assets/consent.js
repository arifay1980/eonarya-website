(function () {
  'use strict';

  const MEASUREMENT_ID = 'G-GFHVXH40X5';
  const STORAGE_KEY = 'eonarya_cookie_consent';
  const ACCEPTED = 'accepted';
  const REJECTED = 'rejected';
  const SCRIPT_ID = 'eonarya-ga4';
  const DISABLE_KEY = `ga-disable-${MEASUREMENT_ID}`;
  const POLICY_PATH = '/cerez-politikasi.html';

  window.dataLayer = window.dataLayer || [];
  window.gtag = window.gtag || function gtag() {
    window.dataLayer.push(arguments);
  };

  window.gtag('consent', 'default', {
    analytics_storage: 'denied',
    ad_storage: 'denied',
    ad_user_data: 'denied',
    ad_personalization: 'denied',
  });
  window[DISABLE_KEY] = true;

  let preference = readPreference();
  let analyticsStarted = false;
  let panel = null;
  let lastSettingsTrigger = null;

  function readPreference() {
    try {
      const value = window.localStorage.getItem(STORAGE_KEY);
      return value === ACCEPTED || value === REJECTED ? value : null;
    } catch (_error) {
      return null;
    }
  }

  function writePreference(value) {
    try {
      window.localStorage.setItem(STORAGE_KEY, value);
      return window.localStorage.getItem(STORAGE_KEY) === value;
    } catch (_error) {
      return false;
    }
  }

  function cleanUrl(value) {
    if (!value) return '';
    try {
      const url = new URL(value, window.location.origin);
      return `${url.origin}${url.pathname}`;
    } catch (_error) {
      return '';
    }
  }

  function analyticsConfig() {
    return {
      page_location: cleanUrl(window.location.href),
      page_path: window.location.pathname,
      page_referrer: cleanUrl(document.referrer),
      allow_google_signals: false,
      allow_ad_personalization_signals: false,
    };
  }

  function enableAnalytics() {
    window[DISABLE_KEY] = false;
    window.gtag('consent', 'update', {
      analytics_storage: 'granted',
      ad_storage: 'denied',
      ad_user_data: 'denied',
      ad_personalization: 'denied',
    });

    if (analyticsStarted || document.getElementById(SCRIPT_ID)) return;
    analyticsStarted = true;
    window.gtag('js', new Date());
    window.gtag('config', MEASUREMENT_ID, analyticsConfig());

    const script = document.createElement('script');
    script.id = SCRIPT_ID;
    script.async = true;
    script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(MEASUREMENT_ID)}`;
    document.head.appendChild(script);
  }

  function cookiePaths() {
    const parts = window.location.pathname.split('/').filter(Boolean);
    const paths = ['/'];
    let current = '';
    for (const part of parts.slice(0, -1)) {
      current += `/${part}`;
      paths.push(`${current}/`);
    }
    return [...new Set(paths)];
  }

  function cookieDomains() {
    const hostname = window.location.hostname;
    const domains = ['', hostname, `.${hostname}`];
    const parts = hostname.split('.');
    if (parts.length > 2) {
      const base = parts.slice(-2).join('.');
      domains.push(base, `.${base}`);
    }
    return [...new Set(domains)];
  }

  function clearAnalyticsCookies() {
    const names = document.cookie
      .split(';')
      .map((entry) => entry.split('=')[0].trim())
      .filter((name) => name === '_ga' || name.startsWith('_ga_'));

    for (const name of [...new Set(names)]) {
      for (const path of cookiePaths()) {
        for (const domain of cookieDomains()) {
          const domainPart = domain ? `; domain=${domain}` : '';
          document.cookie = `${name}=; Max-Age=0; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=${path}${domainPart}; SameSite=Lax`;
        }
      }
    }
  }

  function showPanel(trigger) {
    if (!panel) return;
    lastSettingsTrigger = trigger || null;
    panel.hidden = false;
    panel.setAttribute('aria-hidden', 'false');
    if (trigger) {
      const target = preference === ACCEPTED ? panel.acceptButton : panel.rejectButton;
      target.focus();
    }
  }

  function hidePanel() {
    if (!panel) return;
    panel.hidden = true;
    panel.setAttribute('aria-hidden', 'true');
    if (lastSettingsTrigger) lastSettingsTrigger.focus();
    lastSettingsTrigger = null;
  }

  function accept() {
    if (!writePreference(ACCEPTED)) {
      preference = null;
      window[DISABLE_KEY] = true;
      showPanel();
      return false;
    }
    preference = ACCEPTED;
    enableAnalytics();
    hidePanel();
    return true;
  }

  function reject() {
    const analyticsWasActive = analyticsStarted || preference === ACCEPTED || Boolean(document.getElementById(SCRIPT_ID));
    window[DISABLE_KEY] = true;
    window.gtag('consent', 'update', {
      analytics_storage: 'denied',
      ad_storage: 'denied',
      ad_user_data: 'denied',
      ad_personalization: 'denied',
    });
    clearAnalyticsCookies();

    if (!writePreference(REJECTED)) {
      preference = null;
      showPanel();
      return false;
    }

    preference = REJECTED;
    hidePanel();
    if (analyticsWasActive) window.location.replace(cleanUrl(window.location.href));
    return true;
  }

  function makeButton(label, action) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'eonarya-consent__button';
    button.textContent = label;
    button.addEventListener('click', action);
    return button;
  }

  function buildPanel() {
    const region = document.createElement('section');
    region.className = 'eonarya-consent';
    region.setAttribute('role', 'region');
    region.setAttribute('aria-label', 'Çerez tercihleri');
    region.setAttribute('aria-describedby', 'eonarya-consent-description');
    region.setAttribute('aria-hidden', 'true');
    region.hidden = true;

    const copy = document.createElement('div');
    copy.className = 'eonarya-consent__copy';

    const description = document.createElement('p');
    description.id = 'eonarya-consent-description';
    description.append('Site kullanımını anlamak ve deneyimi geliştirmek için, izninizle analitik çerezler kullanıyoruz. Kabul etmezseniz analitik çerezler çalışmaz. ');
    const policy = document.createElement('a');
    policy.href = POLICY_PATH;
    policy.textContent = 'Çerez Politikası';
    description.appendChild(policy);
    copy.append(description);

    const actions = document.createElement('div');
    actions.className = 'eonarya-consent__actions';
    const rejectButton = makeButton('Reddet', reject);
    const acceptButton = makeButton('Kabul Et', accept);
    actions.append(rejectButton, acceptButton);
    region.append(copy, actions);

    region.rejectButton = rejectButton;
    region.acceptButton = acceptButton;
    document.body.appendChild(region);
    return region;
  }

  function ready() {
    panel = buildPanel();
    document.querySelectorAll('[data-cookie-settings]').forEach((trigger) => {
      trigger.addEventListener('click', (event) => {
        event.preventDefault();
        showPanel(trigger);
      });
    });
    if (!preference) showPanel();
  }

  window.EonaryaConsent = Object.freeze({
    accept,
    reject,
    open: () => showPanel(),
    getPreference: () => preference,
  });

  if (preference === ACCEPTED) enableAnalytics();
  if (preference === REJECTED) clearAnalyticsCookies();
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ready, { once: true });
  else ready();
})();
