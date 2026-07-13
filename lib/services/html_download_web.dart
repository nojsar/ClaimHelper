import 'dart:js_interop';

import 'package:web/web.dart' as web;

Future<void> downloadHtml(String contents, String filename) async {
  final blob = web.Blob(
    <web.BlobPart>[contents.toJS].toJS,
    web.BlobPropertyBag(type: 'text/html;charset=utf-8'),
  );
  final url = web.URL.createObjectURL(blob);
  try {
    final anchor = web.HTMLAnchorElement()
      ..href = url
      ..download = filename;
    web.document.body?.appendChild(anchor);
    try {
      anchor.click();
    } finally {
      anchor.remove();
    }
    // Let the browser begin reading the blob before releasing its URL.
    await Future<void>.delayed(Duration.zero);
  } finally {
    web.URL.revokeObjectURL(url);
  }
}
