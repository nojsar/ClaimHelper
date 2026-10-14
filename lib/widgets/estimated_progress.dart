import 'dart:async';
import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../core/theme.dart';

/// How far along an AI step probably is, from how long it has run and how
/// long it usually takes. The model reports no real progress, so this is an
/// honest estimate: steady to 80% at the usual time, then easing toward 95%.
/// It never reaches 100% on its own; the screen moves on when the work is
/// actually done.
double estimatedProgress(Duration elapsed, Duration expected) {
  final ratio = elapsed.inMilliseconds / expected.inMilliseconds;
  if (ratio <= 0) return 0.02;
  if (ratio < 1) return math.max(0.02, 0.8 * ratio);
  return 0.8 + 0.15 * (1 - math.exp(-(ratio - 1) * 2));
}

/// A plain-English estimate of the time left, never a promise.
String remainingLabel(Duration elapsed, Duration expected) {
  final left = (expected - elapsed).inSeconds;
  if (left > 90) return 'About ${(left / 60).ceil()} min left';
  if (left > 10) return 'About ${((left + 4) ~/ 5) * 5} seconds left';
  if (left > -20) return 'Almost done…';
  return 'Taking a little longer than usual. Still working.';
}

/// The bar and time line for a step with a known usual duration.
///
/// [startedAt] should come from the server when it is known, so a page that
/// is refreshed or reopened continues where it was instead of starting over.
class EstimatedProgress extends StatefulWidget {
  const EstimatedProgress({
    super.key,
    required this.expected,
    required this.typical,
    this.startedAt,
    this.minHeight = 8,
  });

  final Duration expected;

  /// The usual range in plain words, such as "Usually 20–40 seconds".
  final String typical;
  final DateTime? startedAt;
  final double minHeight;

  @override
  State<EstimatedProgress> createState() => _EstimatedProgressState();
}

class _EstimatedProgressState extends State<EstimatedProgress> {
  late DateTime _start;
  Timer? _ticker;

  @override
  void initState() {
    super.initState();
    _start = _plausibleStart(widget.startedAt);
    _ticker = Timer.periodic(const Duration(seconds: 1), (_) {
      if (mounted) setState(() {});
    });
  }

  @override
  void didUpdateWidget(covariant EstimatedProgress oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (widget.startedAt != null && widget.startedAt != oldWidget.startedAt) {
      _start = _plausibleStart(widget.startedAt);
    }
  }

  /// A server start time is used only when it is plausible on this device's
  /// clock; otherwise the estimate starts now.
  DateTime _plausibleStart(DateTime? candidate) {
    final now = DateTime.now();
    if (candidate == null) return now;
    final age = now.difference(candidate);
    if (age.isNegative || age > const Duration(minutes: 10)) return now;
    return candidate;
  }

  @override
  void dispose() {
    _ticker?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final elapsed = DateTime.now().difference(_start);
    return Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        LinearProgressIndicator(
          value: estimatedProgress(elapsed, widget.expected),
          minHeight: widget.minHeight,
          borderRadius: BorderRadius.circular(999),
          backgroundColor: context.palette.border,
          color: context.palette.accent,
        ),
        const SizedBox(height: 10),
        Wrap(
          alignment: WrapAlignment.spaceBetween,
          spacing: 12,
          runSpacing: 4,
          children: [
            Text(
              widget.typical,
              style: TextStyle(fontSize: 16, color: context.palette.textMuted),
            ),
            Text(
              remainingLabel(elapsed, widget.expected),
              style: TextStyle(
                fontSize: 16,
                fontWeight: FontWeight.w700,
                color: context.palette.textSecondary,
              ),
            ),
          ],
        ),
      ],
    );
  }
}
