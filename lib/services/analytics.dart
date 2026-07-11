/// First-party, cookieless pageview tracking.
///
/// The actual beacon lives in web/index.html (`window.__track`) so the static
/// landing page is counted even when Flutter never boots. This facade lets
/// the app report in-app route changes to the same counter. On non-web
/// platforms it is a no-op.
///
/// Privacy: only the event name and route are sent — no cookies, no ids,
/// no document contents. Aggregated into daily totals server-side.
library;

import 'analytics_stub.dart'
    if (dart.library.js_interop) 'analytics_web.dart' as impl;

void trackPageview(String path) => impl.trackPageview(path);
