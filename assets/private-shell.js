(function () {
  'use strict';

  const experience = window.EONARYA_EXPERIENCE || {};

  function captureSensitiveParams(names) {
    const url = new URL(window.location.href);
    const previous = (window.history.state && window.history.state.eonaryaPrivateParams) || {};
    const values = { ...previous };
    let changed = false;

    names.forEach((name) => {
      if (url.searchParams.has(name)) {
        values[name] = url.searchParams.get(name) || '';
        url.searchParams.delete(name);
        changed = true;
      } else if (!(name in values)) {
        values[name] = '';
      }
    });

    if (changed) {
      const nextState = { ...(window.history.state || {}), eonaryaPrivateParams: values };
      window.history.replaceState(nextState, '', `${url.pathname}${url.search}${url.hash}`);
    }
    return values;
  }

  function hydrateSharedContent() {
    document.querySelectorAll('[data-content-path]').forEach((node) => {
      const path = (node.getAttribute('data-content-path') || '').split('.');
      const value = path.reduce((current, key) => current && current[key], experience);
      if (typeof value === 'string') node.textContent = value;
    });

    document.querySelectorAll('[data-support-link]').forEach((node) => {
      const kind = node.getAttribute('data-support-link');
      const labelKey = kind === 'message' ? 'messageLabel' : 'helpLabel';
      const hrefKey = kind === 'message' ? 'messageHref' : 'helpHref';
      const support = experience.SUPPORT_COPY || {};
      if (typeof support[labelKey] === 'string') node.textContent = support[labelKey];
      if (typeof support[hrefKey] === 'string') node.setAttribute('href', support[hrefKey]);
    });

    document.querySelectorAll('[data-support-href]').forEach((node) => {
      const kind = node.getAttribute('data-support-href');
      const hrefKey = kind === 'message' ? 'messageHref' : 'helpHref';
      const support = experience.SUPPORT_COPY || {};
      if (typeof support[hrefKey] === 'string') node.setAttribute('href', support[hrefKey]);
    });

    Object.values(experience.LEGAL_LINKS || {}).forEach(({ href, label }) => {
      if (typeof href !== 'string' || href.startsWith('{{')) return;
      document.querySelectorAll(`a[href="${href}"]`).forEach((link) => {
        link.textContent = label;
      });
    });

    document.querySelectorAll('a[href]').forEach((link) => {
      link.setAttribute('rel', 'noreferrer');
    });
  }

  const navigationGuard = new MutationObserver((records) => {
    records.forEach(({ addedNodes }) => {
      addedNodes.forEach((node) => {
        if (!(node instanceof Element)) return;
        if (node.matches('a[href]')) node.setAttribute('rel', 'noreferrer');
        node.querySelectorAll('a[href]').forEach((link) => link.setAttribute('rel', 'noreferrer'));
      });
    });
  });

  window.EonaryaPrivate = Object.freeze({ captureSensitiveParams });
  hydrateSharedContent();
  navigationGuard.observe(document.body, { childList: true, subtree: true });
})();
