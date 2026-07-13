import 'file_drop_types.dart';

/// No-op drag-and-drop for non-web platforms (mobile uses the file/camera
/// pickers instead). Kept API-compatible with the web implementation.
class FileDrop {
  void attach(
      {required OnFilesDropped onFiles, required OnDragChanged onDrag}) {}
  void detach() {}
}
