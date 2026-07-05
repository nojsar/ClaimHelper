import 'dart:typed_data';

/// A file dropped onto the page via native browser drag-and-drop.
class DroppedFile {
  DroppedFile(this.name, this.bytes);
  final String name;
  final Uint8List bytes;
}

typedef OnFilesDropped = void Function(List<DroppedFile> files);
typedef OnDragChanged = void Function(bool dragging);
