/// Remembers, on this device only, the last case step the visitor reached, so
/// the homepage can offer "Continue your case" after they leave or close the
/// tab while an AI step is still running.
///
/// Privacy: stores only the random case ID, the step name and a timestamp in
/// this browser's local storage under [resumeStorageKey]. Nothing is sent
/// anywhere, and the case itself stays protected by the visitor's sign-in.
library;

import 'dart:convert';

import 'resume_store_stub.dart' if (dart.library.js_interop) 'resume_store_web.dart'
    as impl;

/// Also read by the inline script in web/index.html; keep the two in sync.
const resumeStorageKey = 'gmy-resume';

const resumableSteps = {
  'processing',
  'review',
  'questions',
  'preview',
  'purchase-success',
  'packet',
};

final _caseRoute = RegExp(r'^/case/([A-Za-z0-9_-]{4,64})/([a-z-]+)(?:[?#].*)?$');

/// The stored entry for [path], or null when it is not a resumable case step.
String? resumeEntryFor(String path, DateTime now) {
  final match = _caseRoute.firstMatch(path);
  if (match == null) return null;
  final step = match.group(2)!;
  if (!resumableSteps.contains(step)) return null;
  return jsonEncode({
    'id': match.group(1),
    'step': step,
    'at': now.millisecondsSinceEpoch,
  });
}

void rememberCaseRoute(String path) {
  final entry = resumeEntryFor(path, DateTime.now());
  if (entry != null) impl.writeResumeEntry(resumeStorageKey, entry);
}

/// Called when the visitor deletes their cases or account.
void forgetCaseRoute() => impl.removeResumeEntry(resumeStorageKey);
