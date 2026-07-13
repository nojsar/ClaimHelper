import 'dart:js_interop';

import 'package:web/web.dart' as web;

import 'file_drop_types.dart';

/// Native HTML5 drag-and-drop for Flutter web. Listens on the document so a
/// file dropped anywhere on the upload page is captured (and the browser's
/// default "open the file" behavior is prevented). Works regardless of the
/// browser's host OS (unlike packages that guard on defaultTargetPlatform).
class FileDrop {
  OnFilesDropped? _onFiles;
  OnDragChanged? _onDrag;
  int _depth = 0;

  JSFunction? _over;
  JSFunction? _enter;
  JSFunction? _leave;
  JSFunction? _drop;

  void attach(
      {required OnFilesDropped onFiles, required OnDragChanged onDrag}) {
    _onFiles = onFiles;
    _onDrag = onDrag;

    _over = ((web.Event e) => e.preventDefault()).toJS;
    _enter = ((web.Event e) {
      e.preventDefault();
      _depth++;
      _onDrag?.call(true);
    }).toJS;
    _leave = ((web.Event e) {
      _depth = _depth > 0 ? _depth - 1 : 0;
      if (_depth == 0) _onDrag?.call(false);
    }).toJS;
    _drop = ((web.Event e) {
      e.preventDefault();
      _depth = 0;
      _onDrag?.call(false);
      _read(e as web.DragEvent);
    }).toJS;

    final d = web.document;
    d.addEventListener('dragover', _over);
    d.addEventListener('dragenter', _enter);
    d.addEventListener('dragleave', _leave);
    d.addEventListener('drop', _drop);
  }

  Future<void> _read(web.DragEvent e) async {
    final dt = e.dataTransfer;
    if (dt == null) return;
    final list = dt.files;
    final out = <DroppedFile>[];
    for (var i = 0; i < list.length; i++) {
      final f = list.item(i);
      if (f == null) continue;
      final buffer = (await f.arrayBuffer().toDart).toDart;
      out.add(DroppedFile(f.name, buffer.asUint8List()));
    }
    if (out.isNotEmpty) _onFiles?.call(out);
  }

  void detach() {
    final d = web.document;
    if (_over != null) d.removeEventListener('dragover', _over);
    if (_enter != null) d.removeEventListener('dragenter', _enter);
    if (_leave != null) d.removeEventListener('dragleave', _leave);
    if (_drop != null) d.removeEventListener('drop', _drop);
    _over = _enter = _leave = _drop = null;
  }
}
