import 'dart:js_interop';

/// Defined in web/analytics.js; sends a cookieless beacon to trackEvent.
@JS('__track')
external void _jsTrack(String type, String path);

@JS('__resolveAnalyticsAuth')
external void _jsResolveAnalyticsAuth();

@JS('__excludeAdminAnalytics')
external void _jsExcludeAdminAnalytics(String idToken);

void trackPageview(String path) {
  // Never let a missing/broken tracker affect the app.
  try {
    _jsTrack('pageview', path);
  } catch (_) {}
}

void trackDocumentAdded() {
  try {
    _jsTrack('document_added', '/upload');
  } catch (_) {}
}

void resolveAnalyticsAuth() {
  try {
    _jsResolveAnalyticsAuth();
  } catch (_) {}
}

void excludeAdminAnalytics(String? idToken) {
  try {
    _jsExcludeAdminAnalytics(idToken ?? '');
  } catch (_) {}
}
