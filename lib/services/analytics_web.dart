import 'dart:js_interop';

/// Defined in web/index.html; sends a cookieless beacon to trackEvent.
@JS('__track')
external void _jsTrack(String type, String path);

void trackPageview(String path) {
  // Never let a missing/broken tracker affect the app.
  try {
    _jsTrack('pageview', path);
  } catch (_) {}
}
