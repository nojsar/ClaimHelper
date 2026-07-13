/// First-party, cookieless pageview tracking.
///
/// The actual beacon lives in web/analytics.js (`window.__track`) so static
/// pages are counted even when Flutter never boots. This facade lets the app
/// report in-app route changes to the same counter. On non-web platforms it is
/// a no-op.
///
/// Privacy: traffic events contain only the event name and route — no cookies,
/// ids, or document contents. The owner-only exclusion handshake separately
/// sends a Firebase ID token to a verified endpoint so internal use is dropped.
/// That token is never included in analytics events or stored with counters.
library;

import 'analytics_stub.dart' if (dart.library.js_interop) 'analytics_web.dart'
    as impl;

void trackPageview(String path) => impl.trackPageview(path);

/// Releases queued traffic after Firebase Auth confirms this is not the owner.
void resolveAnalyticsAuth() => impl.resolveAnalyticsAuth();

/// Permanently suppresses this owner browser and installs the verified,
/// HttpOnly server exclusion cookie when [idToken] is available.
void excludeAdminAnalytics(String? idToken) =>
    impl.excludeAdminAnalytics(idToken);
