/**
 * First-party, aggregate-only traffic tracker.
 *
 * Events wait briefly for Flutter to restore Firebase Auth. The owner account
 * can therefore disable analytics before the queued visit/boot/pageview is
 * sent. Static marketing pages have no Firebase runtime, so they resolve as
 * anonymous after the bounded fallback below.
 */
(function (window) {
  'use strict';

  var TRACK_URL = '/api/track';
  var ADMIN_EXCLUSION_URL = '/api/admin-analytics-exclusion';
  var ADMIN_OPT_OUT_KEY = 'getmyyes_admin_analytics_opt_out_v1';
  var AUTH_FALLBACK_MS = 4000;
  var MAX_QUEUED_EVENTS = 64;
  var loaderScript = document.currentScript;
  var staticMode = Boolean(loaderScript &&
    loaderScript.hasAttribute('data-static'));
  var initialReferrer = document.referrer || '';
  var pending = [];
  var authResolved = false;
  var disabled = false;
  var fallbackTimer = null;

  function isLocalHost() {
    return /^(localhost|127\.|192\.168\.)/.test(location.hostname);
  }

  function storedAdminOptOut() {
    try {
      return window.localStorage.getItem(ADMIN_OPT_OUT_KEY) === '1';
    } catch (_) {
      return false;
    }
  }

  function persistAdminOptOut() {
    try {
      window.localStorage.setItem(ADMIN_OPT_OUT_KEY, '1');
    } catch (_) {}
  }

  function currentPath(path) {
    if (path) return String(path);
    return location.hash.indexOf('#/') === 0
      ? location.hash.slice(1)
      : location.pathname;
  }

  function isAdminRoute(path) {
    return path === '/stats' || path.indexOf('/stats?') === 0 ||
      path.indexOf('/stats/') === 0;
  }

  function stopFallbackTimer() {
    if (fallbackTimer !== null) {
      window.clearTimeout(fallbackTimer);
      fallbackTimer = null;
    }
  }

  function send(event) {
    if (disabled || isLocalHost() || isAdminRoute(event.path)) return;
    try {
      var payload = JSON.stringify(event);
      if (navigator.sendBeacon) {
        navigator.sendBeacon(TRACK_URL, payload);
      } else {
        fetch(TRACK_URL, {
          method: 'POST',
          body: payload,
          keepalive: true,
          credentials: 'same-origin'
        }).catch(function () {});
      }
    } catch (_) {}
  }

  function flush() {
    var events = pending;
    pending = [];
    if (disabled) return;
    for (var i = 0; i < events.length; i++) send(events[i]);
  }

  function resolveAnalyticsAuth() {
    if (authResolved) return;
    authResolved = true;
    stopFallbackTimer();
    flush();
  }

  function track(type, path, measurement) {
    var route = currentPath(path);
    // The private dashboard is never acquisition/product traffic. Suppress it
    // synchronously, even before Firebase Auth has restored the owner session.
    if (disabled || isLocalHost() || isAdminRoute(route)) return;
    var event = {
      t: String(type || ''),
      path: route,
      ref: initialReferrer
    };
    if (type === 'app_ready' && typeof measurement === 'number' &&
        Number.isFinite(measurement)) {
      event.ms = Math.round(measurement);
    }
    if (!authResolved) {
      if (pending.length < MAX_QUEUED_EVENTS) pending.push(event);
      return;
    }
    send(event);
  }

  function excludeAdminAnalytics(idToken) {
    disabled = true;
    authResolved = true;
    pending = [];
    stopFallbackTimer();
    persistAdminOptOut();

    // The verified endpoint installs an HttpOnly exclusion cookie. The client
    // deliberately cannot read it; same-origin credentials attach it to later
    // /api/track requests if browser storage APIs are unavailable.
    if (typeof idToken === 'string' && idToken.length > 0) {
      try {
        fetch(ADMIN_EXCLUSION_URL, {
          method: 'POST',
          headers: { Authorization: 'Bearer ' + idToken },
          credentials: 'same-origin',
          cache: 'no-store'
        }).catch(function () {});
      } catch (_) {}
    }
  }

  disabled = storedAdminOptOut();
  window.__track = track;
  window.__resolveAnalyticsAuth = resolveAnalyticsAuth;
  window.__excludeAdminAnalytics = excludeAdminAnalytics;

  // Every page that loads this script records one visit, unless it is the
  // dashboard or this browser has already been marked as the owner's device.
  track('visit');
  if (staticMode) {
    // Pure marketing pages do not load Firebase Auth. Resolve immediately so
    // short visits are retained; a prior owner opt-out still wins above.
    resolveAnalyticsAuth();
  } else if (!disabled && !isAdminRoute(currentPath())) {
    fallbackTimer = window.setTimeout(resolveAnalyticsAuth, AUTH_FALLBACK_MS);
  }
})(window);
