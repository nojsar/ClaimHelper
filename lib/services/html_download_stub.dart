Future<void> downloadHtml(String contents, String filename) {
  return Future<void>.error(
    UnsupportedError('HTML downloads are currently available on the web.'),
  );
}
