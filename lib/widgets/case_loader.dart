import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../core/theme.dart';

/// THE CASEWORKER'S DESK — the app's signature loader. A letter types itself
/// line by line while a carmine stamp slams onto the corner with an ink
/// ripple, and a red evidence string draws itself between two pins. One
/// repaint-driven CustomPainter, no assets, matches the paper world.
class CaseLoader extends StatefulWidget {
  const CaseLoader({
    super.key,
    this.messages = const [
      'Reading the fine print…',
      'Citing their words back…',
      'Building your strongest arguments…',
      'Assembling the case file…',
    ],
    this.size = 210,
    this.progress,
  });

  /// Captions cycled under the animation, in reading order.
  final List<String> messages;
  final double size;

  /// Optional determinate 0..1 progress, drawn as a pencil rule under the
  /// sheet (used while uploading); null keeps the loader indeterminate.
  final double? progress;

  @override
  State<CaseLoader> createState() => _CaseLoaderState();
}

class _CaseLoaderState extends State<CaseLoader>
    with SingleTickerProviderStateMixin {
  late final AnimationController _controller;
  int _messageIndex = 0;
  bool _reduceMotion = false;

  @override
  void initState() {
    super.initState();
    _controller =
        AnimationController(vsync: this, duration: const Duration(seconds: 3))
          ..addStatusListener((status) {
            if (status == AnimationStatus.completed) {
              if (_reduceMotion || widget.messages.isEmpty) return;
              setState(() =>
                  _messageIndex = (_messageIndex + 1) % widget.messages.length);
              _controller.forward(from: 0);
            }
          })
          ..forward();
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    final reduceMotion =
        MediaQuery.maybeOf(context)?.disableAnimations ?? false;
    if (reduceMotion == _reduceMotion) return;
    _reduceMotion = reduceMotion;
    if (_reduceMotion) {
      _controller
        ..stop()
        ..value = 0;
      _messageIndex = 0;
    } else if (!_controller.isAnimating) {
      _controller.forward(from: 0);
    }
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final message = widget.messages.isEmpty
        ? 'Processing your documents'
        : widget.messages[_messageIndex];
    final progress = widget.progress?.clamp(0.0, 1.0);
    final semanticsValue = progress == null
        ? message
        : '$message ${(progress * 100).round()} percent';
    return Semantics(
      container: true,
      liveRegion: true,
      label: 'Document processing status',
      value: semanticsValue,
      child: ExcludeSemantics(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            RepaintBoundary(
              child: CustomPaint(
                size: Size(widget.size, widget.size),
                painter: _DeskPainter(
                  animation: _controller,
                  progress: widget.progress,
                ),
              ),
            ),
            const SizedBox(height: 18),
            AnimatedSwitcher(
              duration: _reduceMotion
                  ? Duration.zero
                  : const Duration(milliseconds: 350),
              transitionBuilder: (child, anim) => FadeTransition(
                opacity: anim,
                child: SlideTransition(
                  position: Tween<Offset>(
                          begin: const Offset(0, 0.35), end: Offset.zero)
                      .animate(anim),
                  child: child,
                ),
              ),
              child: Text(
                message,
                key: ValueKey(_messageIndex),
                textAlign: TextAlign.center,
                style: const TextStyle(
                  fontFamily: AppFonts.mono,
                  fontSize: 13,
                  fontWeight: FontWeight.w600,
                  letterSpacing: 0.8,
                  color: AppColors.textSecondary,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _DeskPainter extends CustomPainter {
  _DeskPainter({required this.animation, this.progress})
      : super(repaint: animation);

  final Animation<double> animation;
  final double? progress;

  // Line layout of the "letter" as (indent, relative width) pairs.
  static const _lines = <(double, double)>[
    (0.00, 0.42), // Re: line
    (0.00, 0.86),
    (0.00, 0.78),
    (0.00, 0.90),
    (0.00, 0.55),
    (0.34, 0.30), // signature
  ];

  @override
  void paint(Canvas canvas, Size size) {
    final t = animation.value;
    final w = size.width;
    final h = size.height;
    final center = Offset(w / 2, h / 2);

    // The whole desk breathes very slightly.
    canvas.save();
    canvas.translate(0, math.sin(t * 2 * math.pi) * 1.5);

    _paintBackSheets(canvas, center, w, h);
    final sheet = _paintSheet(canvas, center, w, h);
    _paintTypedLines(canvas, sheet, t);
    _paintString(canvas, sheet, t);
    _paintStamp(canvas, sheet, t);

    canvas.restore();

    if (progress != null) {
      _paintProgressRule(canvas, size, progress!.clamp(0, 1));
    }
  }

  void _paintBackSheets(Canvas canvas, Offset center, double w, double h) {
    final paint = Paint()..color = AppColors.surface.withValues(alpha: 0.75);
    final border = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = 1
      ..color = AppColors.borderStrong.withValues(alpha: 0.5);
    for (final (angle, dx) in [(-0.07, -8.0), (0.05, 9.0)]) {
      canvas.save();
      canvas.translate(center.dx + dx, center.dy + 5);
      canvas.rotate(angle);
      final r = Rect.fromCenter(
          center: Offset.zero, width: w * 0.62, height: h * 0.78);
      canvas.drawRect(r, paint);
      canvas.drawRect(r, border);
      canvas.restore();
    }
  }

  Rect _paintSheet(Canvas canvas, Offset center, double w, double h) {
    final rect = Rect.fromCenter(
        center: center.translate(0, 2), width: w * 0.64, height: h * 0.80);
    canvas.drawRect(rect.shift(const Offset(3, 4)),
        Paint()..color = AppColors.ink.withValues(alpha: 0.10));
    canvas.drawRect(rect, Paint()..color = AppColors.surface);
    canvas.drawRect(
        rect,
        Paint()
          ..style = PaintingStyle.stroke
          ..strokeWidth = 1.2
          ..color = AppColors.borderStrong);
    // Letterhead rule.
    final headY = rect.top + rect.height * 0.14;
    canvas.drawLine(
        Offset(rect.left + 10, headY),
        Offset(rect.right - 10, headY),
        Paint()
          ..strokeWidth = 2
          ..color = AppColors.ink.withValues(alpha: 0.85));
    return rect;
  }

  void _paintTypedLines(Canvas canvas, Rect sheet, double t) {
    // Typing occupies the first 72% of the loop; each line streams in after
    // the previous one finishes, with a caret at the write head.
    final typeT = (t / 0.72).clamp(0.0, 1.0);
    final inkPaint = Paint()
      ..strokeWidth = 3
      ..strokeCap = StrokeCap.round
      ..color = AppColors.ink.withValues(alpha: 0.55);

    final totalUnits =
        _lines.fold<double>(0, (acc, l) => acc + l.$2) + _lines.length * 0.06;
    var consumed = 0.0;
    final left = sheet.left + 12;
    final usable = sheet.width - 24;
    var y = sheet.top + sheet.height * 0.24;
    final lineGap = sheet.height * 0.105;
    Offset? caret;

    for (final (indent, width) in _lines) {
      final start = consumed / totalUnits;
      final end = (consumed + width) / totalUnits;
      final lineT = ((typeT - start) / (end - start)).clamp(0.0, 1.0);
      if (lineT > 0) {
        final x0 = left + usable * indent;
        final x1 = x0 + usable * width * lineT;
        canvas.drawLine(Offset(x0, y), Offset(x1, y), inkPaint);
        if (lineT < 1) caret = Offset(x1, y);
      }
      consumed += width + 0.06;
      y += lineGap;
    }

    // Blinking caret at the write head (or end of text while waiting).
    final blink = (t * 6) % 1 < 0.55;
    if (blink) {
      final c =
          caret ?? Offset(left + usable * 0.34 + usable * 0.30, y - lineGap);
      canvas.drawRect(
          Rect.fromCenter(center: c.translate(4, 0), width: 2.4, height: 11),
          Paint()..color = AppColors.primary);
    }
  }

  void _paintString(Canvas canvas, Rect sheet, double t) {
    // Evidence string draws itself pin-to-pin across the sheet's top corner.
    final drawT =
        Curves.easeInOut.transform(((t - 0.1) / 0.55).clamp(0.0, 1.0));
    final a = Offset(sheet.left - 14, sheet.top + 8);
    final b = Offset(sheet.right + 12, sheet.top + sheet.height * 0.32);
    final path = Path()
      ..moveTo(a.dx, a.dy)
      ..cubicTo(a.dx + 30, a.dy + 46, b.dx - 60, b.dy - 44, b.dx, b.dy);

    if (drawT > 0) {
      final metric = path.computeMetrics().first;
      canvas.drawPath(
          metric.extractPath(0, metric.length * drawT),
          Paint()
            ..style = PaintingStyle.stroke
            ..strokeWidth = 1.6
            ..color = AppColors.primary.withValues(alpha: 0.8));
    }
    for (final (pin, show) in [(a, true), (b, drawT >= 1)]) {
      if (!show) continue;
      canvas.drawCircle(pin, 4, Paint()..color = AppColors.primaryDark);
      canvas.drawCircle(
          pin,
          4,
          Paint()
            ..style = PaintingStyle.stroke
            ..strokeWidth = 1
            ..color = AppColors.ink);
    }
  }

  void _paintStamp(Canvas canvas, Rect sheet, double t) {
    // The slam: stamp drops in at 74%..86% of the loop with overshoot, then
    // an ink ripple radiates from the impact.
    final slamT = ((t - 0.74) / 0.12).clamp(0.0, 1.0);
    if (slamT <= 0) return;
    final impact = Curves.easeOutBack.transform(slamT);
    final scale = 1.9 - 0.9 * impact;
    final opacity = (slamT * 2).clamp(0.0, 1.0);
    final centerStamp = Offset(
        sheet.right - sheet.width * 0.28, sheet.bottom - sheet.height * 0.17);

    // Ink ripple + splatter appear only after contact.
    final afterT = ((t - 0.86) / 0.14).clamp(0.0, 1.0);
    if (afterT > 0) {
      canvas.drawCircle(
          centerStamp,
          26 + afterT * 22,
          Paint()
            ..style = PaintingStyle.stroke
            ..strokeWidth = 1.4 * (1 - afterT)
            ..color = AppColors.primary.withValues(alpha: 0.5 * (1 - afterT)));
      final rng = math.Random(7);
      for (var i = 0; i < 7; i++) {
        final angle = rng.nextDouble() * 2 * math.pi;
        final dist = 30 + rng.nextDouble() * 16 * afterT;
        canvas.drawCircle(
            centerStamp + Offset(math.cos(angle), math.sin(angle)) * dist,
            (1.6 + rng.nextDouble()) * (1 - afterT * 0.6),
            Paint()
              ..color =
                  AppColors.primary.withValues(alpha: 0.55 * (1 - afterT)));
      }
    }

    canvas.save();
    canvas.translate(centerStamp.dx, centerStamp.dy);
    canvas.rotate(-0.22);
    canvas.scale(scale);

    final red = AppColors.primary.withValues(alpha: 0.9 * opacity);
    canvas.drawCircle(
        Offset.zero,
        26,
        Paint()
          ..style = PaintingStyle.stroke
          ..strokeWidth = 2.6
          ..color = red);
    canvas.drawCircle(
        Offset.zero,
        21,
        Paint()
          ..style = PaintingStyle.stroke
          ..strokeWidth = 1
          ..color = red);
    final tp = TextPainter(
      text: TextSpan(
        text: 'IN REVIEW',
        style: TextStyle(
          fontFamily: AppFonts.mono,
          fontSize: 7.5,
          fontWeight: FontWeight.w600,
          letterSpacing: 1.4,
          color: red,
        ),
      ),
      textDirection: TextDirection.ltr,
    )..layout();
    tp.paint(canvas, Offset(-tp.width / 2, -tp.height / 2));
    canvas.restore();
  }

  void _paintProgressRule(Canvas canvas, Size size, double p) {
    final y = size.height - 4;
    final track = Paint()
      ..strokeWidth = 3
      ..strokeCap = StrokeCap.round
      ..color = AppColors.borderStrong;
    final fill = Paint()
      ..strokeWidth = 3
      ..strokeCap = StrokeCap.round
      ..color = AppColors.primary;
    final x0 = size.width * 0.14;
    final x1 = size.width * 0.86;
    canvas.drawLine(Offset(x0, y), Offset(x1, y), track);
    if (p > 0) {
      canvas.drawLine(Offset(x0, y), Offset(x0 + (x1 - x0) * p, y), fill);
    }
  }

  @override
  bool shouldRepaint(covariant _DeskPainter old) => old.progress != progress;
}
