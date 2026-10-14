import 'package:web/web.dart' as web;

// Storage can be blocked (private mode, site data disabled); resuming is a
// convenience, so failures are ignored.
void writeResumeEntry(String key, String value) {
  try {
    web.window.localStorage.setItem(key, value);
  } catch (_) {}
}

void removeResumeEntry(String key) {
  try {
    web.window.localStorage.removeItem(key);
  } catch (_) {}
}
