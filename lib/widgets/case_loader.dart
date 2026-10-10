import 'dart:async';

import 'package:flutter/material.dart';

import '../core/theme.dart';

/// A conventional, calm document-processing status card.
///
/// The stable layout avoids dramatic motion and effects that can feel
/// alarming in a healthcare workflow. Status messages
/// advance slowly when motion is allowed; reduced-motion users see one steady
/// message.
class CaseLoader extends StatefulWidget {
  const CaseLoader({
    super.key,
    this.messages = const [
      'Reviewing your document…',
      'Checking the denial details…',
      'Preparing the next review step…',
    ],
    this.size = 210,
    this.progress,
  });

  final List<String> messages;
  final double size;
  final double? progress;

  @override
  State<CaseLoader> createState() => _CaseLoaderState();
}

class _CaseLoaderState extends State<CaseLoader> {
  Timer? _messageTimer;
  int _messageIndex = 0;
  bool _reduceMotion = false;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    final reduceMotion =
        MediaQuery.maybeOf(context)?.disableAnimations ?? false;
    if (reduceMotion == _reduceMotion && _messageTimer != null) return;
    _reduceMotion = reduceMotion;
    _configureTimer();
  }

  @override
  void didUpdateWidget(covariant CaseLoader oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.messages != widget.messages) {
      _messageIndex = 0;
      _configureTimer();
    }
  }

  void _configureTimer() {
    _messageTimer?.cancel();
    _messageTimer = null;
    if (_reduceMotion || widget.messages.length < 2) return;
    _messageTimer = Timer.periodic(const Duration(seconds: 4), (_) {
      if (!mounted) return;
      setState(
          () => _messageIndex = (_messageIndex + 1) % widget.messages.length);
    });
  }

  @override
  void dispose() {
    _messageTimer?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final safeIndex =
        _messageIndex < widget.messages.length ? _messageIndex : 0;
    final message = widget.messages.isEmpty
        ? 'Processing your documents…'
        : widget.messages[safeIndex];
    final progress = widget.progress?.clamp(0.0, 1.0);
    final semanticsValue = progress == null
        ? message
        : '$message ${(progress * 100).round()} percent complete';
    final iconSize = (widget.size * 0.38).clamp(64.0, 88.0).toDouble();

    return Semantics(
      container: true,
      liveRegion: true,
      label: 'Document processing status',
      value: semanticsValue,
      child: ExcludeSemantics(
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 430),
          child: Container(
            width: double.infinity,
            padding: const EdgeInsets.all(24),
            decoration: BoxDecoration(
              color: context.palette.surface,
              borderRadius: BorderRadius.circular(AppRadii.lg),
              border: Border.all(color: context.palette.border),
              boxShadow: context.palette.shadowSubtle,
            ),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Container(
                  width: iconSize,
                  height: iconSize,
                  decoration: BoxDecoration(
                    color: context.palette.primaryTint,
                    borderRadius: BorderRadius.circular(AppRadii.md),
                    border: Border.all(color: context.palette.border),
                  ),
                  child: Icon(
                    Icons.description_outlined,
                    size: iconSize * 0.5,
                    color: context.palette.primaryDark,
                  ),
                ),
                const SizedBox(height: 18),
                const Text(
                  'Preparing your documents',
                  textAlign: TextAlign.center,
                  style: TextStyle(fontSize: 21, fontWeight: FontWeight.w800),
                ),
                const SizedBox(height: 8),
                Text(
                  message,
                  textAlign: TextAlign.center,
                  style: TextStyle(
                    fontSize: 16,
                    height: 1.5,
                    color: context.palette.textSecondary,
                  ),
                ),
                const SizedBox(height: 18),
                if (!_reduceMotion)
                  LinearProgressIndicator(
                    value: progress,
                    minHeight: 8,
                    borderRadius: BorderRadius.circular(999),
                    backgroundColor: context.palette.border,
                    color: context.palette.accent,
                  )
                else
                  Container(
                    height: 8,
                    decoration: BoxDecoration(
                      color: context.palette.border,
                      borderRadius: BorderRadius.circular(999),
                    ),
                  ),
                const SizedBox(height: 12),
                Text(
                  'Keep this page open while this step finishes.',
                  textAlign: TextAlign.center,
                  style: TextStyle(
                    fontSize: 16,
                    color: context.palette.textMuted,
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
