import 'dart:async';

import 'package:flutter/material.dart';

import '../core/theme.dart';
import 'dawn.dart';
import 'estimated_progress.dart';

/// A calm document-processing status card: the plain-English lens from the
/// homepage film reading down a letter, line by line, above the status.
///
/// The motion is slow and steady, nothing that could feel alarming in a
/// healthcare workflow. Status messages advance slowly when motion is
/// allowed; reduced-motion users see one steady message and a still lens.
///
/// Give [expected] and [typical] for an AI step: the bar then shows an
/// estimate with the usual time and about how long is left.
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
    this.title = 'Preparing your documents',
    this.expected,
    this.typical,
    this.startedAt,
    this.note = 'Keep this page open while this step finishes.',
  });

  final List<String> messages;
  final double size;
  final double? progress;
  final String title;
  final Duration? expected;
  final String? typical;
  final DateTime? startedAt;

  /// What the visitor may do while waiting; null shows nothing.
  final String? note;

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
    final expected = widget.expected;
    final typical = widget.typical;
    final estimating = progress == null && expected != null && typical != null;
    final semanticsValue = progress != null
        ? '$message ${(progress * 100).round()} percent complete'
        : estimating
            ? '$message $typical.'
            : message;
    final letterWidth = (widget.size * 0.82).clamp(150.0, 190.0).toDouble();

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
              borderRadius: BorderRadius.circular(AppRadii.xl),
              border: Border.all(color: context.palette.border),
              boxShadow: context.palette.shadowSoft,
            ),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                LensLetter(width: letterWidth),
                const SizedBox(height: 18),
                Text(
                  widget.title,
                  textAlign: TextAlign.center,
                  style: const TextStyle(
                    fontFamily: AppFonts.serif,
                    fontSize: 23,
                    fontWeight: FontWeight.w700,
                    letterSpacing: -0.3,
                  ),
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
                if (estimating)
                  EstimatedProgress(
                    expected: expected,
                    typical: typical,
                    startedAt: widget.startedAt,
                  )
                else if (progress != null || !_reduceMotion)
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
                if (widget.note != null) ...[
                  const SizedBox(height: 14),
                  Text(
                    widget.note!,
                    textAlign: TextAlign.center,
                    style: TextStyle(
                      fontSize: 16,
                      height: 1.45,
                      color: context.palette.textSecondary,
                    ),
                  ),
                ],
              ],
            ),
          ),
        ),
      ),
    );
  }
}
