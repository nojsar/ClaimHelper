import 'dart:async';
import 'dart:math' as math;
import 'dart:typed_data';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter/scheduler.dart';

import '../core/theme.dart';

/// The dawn print from getmyyes.com, carried into the app. The homepage
/// tells the story as "a denial arrives at night; by morning it reads in
/// plain English", so the app walks the same night: the upload happens under
/// the stars, and every step after it raises the sun a little.
///
/// Everything here is decoration. It is excluded from semantics, it never
/// carries text a reader needs, and under reduced motion it paints one still
/// frame.

/// How far the morning has come at each point of the flow, 0 = night,
/// 1 = full morning.
abstract final class Dawn {
  static const upload = 0.0;
  static const reading = 0.16;
  static const checkFacts = 0.34;
  static const questions = 0.6;
  static const summary = 0.84;
  static const morning = 1.0;

  static const _sky = <(double, List<Color>)>[
    (
      0.0,
      [
        Color(0xFF0B1524),
        Color(0xFF15213A),
        Color(0xFF23284A),
        Color(0xFF2E2B4A)
      ]
    ),
    (
      0.34,
      [
        Color(0xFF141F38),
        Color(0xFF2B2D52),
        Color(0xFF5B4566),
        Color(0xFFA0676B)
      ]
    ),
    (
      0.64,
      [
        Color(0xFF7E97C4),
        Color(0xFFC9C3DE),
        Color(0xFFF0BFA6),
        Color(0xFFF9D2A0)
      ]
    ),
    (
      1.0,
      [
        Color(0xFFA9C7E8),
        Color(0xFFCFE0F0),
        Color(0xFFF3E5D0),
        Color(0xFFFBE9C8)
      ]
    ),
  ];
  static const _sea = <(double, List<Color>)>[
    (0.0, [Color(0xFF101C2C), Color(0xFF09121E)]),
    (0.34, [Color(0xFF1C2439), Color(0xFF0D1524)]),
    (0.64, [Color(0xFF3B4B6B), Color(0xFF1C2A43)]),
    (1.0, [Color(0xFF5B7DA1), Color(0xFF2E4C6C)]),
  ];

  static List<Color> _pick(List<(double, List<Color>)> stops, double d) {
    final t = d.clamp(0.0, 1.0);
    for (var i = 1; i < stops.length; i++) {
      if (t <= stops[i].$1) {
        final a = stops[i - 1], b = stops[i];
        final k = (t - a.$1) / (b.$1 - a.$1);
        return [
          for (var n = 0; n < a.$2.length; n++)
            Color.lerp(a.$2[n], b.$2[n], k)!,
        ];
      }
    }
    return stops.last.$2;
  }

  static List<Color> sky(double d) => _pick(_sky, d);
  static List<Color> sea(double d) => _pick(_sea, d);
}

bool _reduceMotion(BuildContext context) =>
    MediaQuery.maybeOf(context)?.disableAnimations ?? false;

/// A faint paper grain, made once: a small tile of random grey whose alpha is
/// baked in, so it tiles at full paint strength.
abstract final class _Grain {
  static ui.Image? image;
  static Future<ui.Image>? _loading;

  static Future<ui.Image> load() => _loading ??= _make();

  static Future<ui.Image> _make() {
    const n = 128;
    final random = math.Random(11);
    final pixels = Uint8List(n * n * 4);
    for (var i = 0; i < n * n; i++) {
      // Premultiplied, as the engine expects: grey * alpha.
      const alpha = 12;
      final v = random.nextInt(256) * alpha ~/ 255;
      pixels[i * 4] = v;
      pixels[i * 4 + 1] = v;
      pixels[i * 4 + 2] = v;
      pixels[i * 4 + 3] = alpha;
    }
    final done = Completer<ui.Image>();
    ui.decodeImageFromPixels(pixels, n, n, ui.PixelFormat.rgba8888, (img) {
      image = img;
      done.complete(img);
    });
    return done.future;
  }
}

/// The page itself: warm paper with a faint grain, a dawn wash across the
/// top that settles into the paper (a night sky in dark mode), and the
/// letter-pad margin rules down the edges of the reading column.
class PaperBackdrop extends StatefulWidget {
  const PaperBackdrop({super.key, required this.columnWidth});

  final double columnWidth;

  @override
  State<PaperBackdrop> createState() => _PaperBackdropState();
}

class _PaperBackdropState extends State<PaperBackdrop> {
  @override
  void initState() {
    super.initState();
    if (_Grain.image == null) {
      _Grain.load().then((_) {
        if (mounted) setState(() {});
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final dark = Theme.of(context).brightness == Brightness.dark;
    return ExcludeSemantics(
      child: RepaintBoundary(
        child: CustomPaint(
          painter: _PaperPainter(
            paper: context.palette.background,
            dark: dark,
            columnWidth: widget.columnWidth,
            grain: _Grain.image,
          ),
          child: const SizedBox.expand(),
        ),
      ),
    );
  }
}

class _PaperPainter extends CustomPainter {
  _PaperPainter({
    required this.paper,
    required this.dark,
    required this.columnWidth,
    required this.grain,
  });

  final Color paper;
  final bool dark;
  final double columnWidth;
  final ui.Image? grain;

  @override
  void paint(Canvas canvas, Size size) {
    final all = Offset.zero & size;
    canvas.drawRect(all, Paint()..color = paper);

    // The wash: dawn colours in light mode, a starry night in dark, both
    // settling into the paper well before the content's own text begins.
    final washHeight = math.min(340.0, size.height * 0.5);
    final wash = Rect.fromLTWH(0, 0, size.width, washHeight);
    final colors = dark
        ? const [Color(0xFF0B1524), Color(0xFF15213A), Color(0xFF1B2440)]
        : const [Color(0xFFD9E1EF), Color(0xFFE9E0EA), Color(0xFFF6E2D4)];
    canvas.drawRect(
      wash,
      Paint()
        ..shader = LinearGradient(
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
          colors: [colors[0], colors[1], colors[2], paper],
          stops: const [0, 0.32, 0.6, 1],
        ).createShader(wash),
    );
    if (dark) {
      final random = math.Random(5);
      final star = Paint()..color = const Color(0xFFFFF3D6);
      for (var i = 0; i < 26; i++) {
        final p = Offset(random.nextDouble() * size.width,
            random.nextDouble() * washHeight * 0.55);
        star.color = const Color(0xFFFFF3D6)
            .withValues(alpha: 0.25 + random.nextDouble() * 0.45);
        canvas.drawCircle(p, 0.7 + random.nextDouble() * 0.8, star);
      }
    } else {
      // A low sun glow off to the right, as on the guide pages.
      final glowCenter = Offset(size.width * 0.86, washHeight * 0.62);
      canvas.drawCircle(
        glowCenter,
        220,
        Paint()
          ..shader = RadialGradient(colors: [
            const Color(0xFFFFE6B8).withValues(alpha: 0.55),
            const Color(0xFFFFE6B8).withValues(alpha: 0),
          ]).createShader(Rect.fromCircle(center: glowCenter, radius: 220)),
      );
      canvas.drawRect(
        Rect.fromLTWH(0, washHeight * 0.55, size.width, washHeight * 0.45),
        Paint()
          ..shader = LinearGradient(
            begin: Alignment.topCenter,
            end: Alignment.bottomCenter,
            colors: [paper.withValues(alpha: 0), paper],
          ).createShader(Rect.fromLTWH(
              0, washHeight * 0.55, size.width, washHeight * 0.45)),
      );
    }

    // Letter-pad margin rules at the reading column's edges.
    final column = math.min(columnWidth, size.width);
    final left = (size.width - column) / 2 + 6;
    final rule = Paint()
      ..color = dark ? const Color(0x12FFFFFF) : const Color(0x1710263B)
      ..strokeWidth = 1;
    canvas.drawLine(Offset(left, 0), Offset(left, size.height), rule);
    canvas.drawLine(Offset(size.width - left, 0),
        Offset(size.width - left, size.height), rule);

    final image = grain;
    if (image != null) {
      canvas.drawRect(
        all,
        Paint()
          ..shader = ImageShader(image, TileMode.repeated, TileMode.repeated,
              Matrix4.identity().storage),
      );
    }
  }

  @override
  bool shouldRepaint(_PaperPainter old) =>
      old.paper != paper ||
      old.dark != dark ||
      old.columnWidth != columnWidth ||
      old.grain != grain;
}

/// A window onto the dawn: sky, stars, a sun on the sea, and (when [stages]
/// is set) the paper plane's flight along a dotted path with one mark per
/// step. The morning carries over between screens: a new window rises from
/// where the last one was left, so moving to the next step raises the sun.
class DawnWindow extends StatefulWidget {
  const DawnWindow({
    super.key,
    required this.dawn,
    this.stages = 0,
    this.stage = 0,
    this.height = 148,
    this.ambient = true,
  });

  /// 0 = night, 1 = morning. See [Dawn].
  final double dawn;

  /// How many marks the flight path has; 0 draws no path.
  final int stages;

  /// Which mark the plane is at.
  final int stage;

  final double height;

  /// Twinkle, glitter and drift for the first few seconds. Off for a still,
  /// calm surface.
  final bool ambient;

  @override
  State<DawnWindow> createState() => _DawnWindowState();
}

class _DawnWindowState extends State<DawnWindow> with TickerProviderStateMixin {
  static const _ambientFor = Duration(milliseconds: 4800);
  static double? _lastDawn;
  static double? _lastStage;

  late final AnimationController _rise = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 1800),
  );
  late final ValueNotifier<double> _clock = ValueNotifier(0);
  Ticker? _ticker;
  double _fromDawn = 0;
  double _fromStage = 0;
  Duration _lastTick = Duration.zero;
  bool _started = false;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_started) return;
    _started = true;
    final still = _reduceMotion(context);
    _fromDawn = still ? widget.dawn : (_lastDawn ?? widget.dawn);
    _fromStage = still
        ? widget.stage.toDouble()
        : (_lastStage ?? widget.stage.toDouble());
    if (_fromDawn == widget.dawn && _fromStage == widget.stage) {
      _rise.value = 1;
    } else {
      _rise.forward();
    }
    _lastDawn = widget.dawn;
    _lastStage = widget.stage.toDouble();
    if (widget.ambient && !still) {
      _ticker = createTicker((elapsed) {
        // The scene comes alive as the step opens and then holds still:
        // under five seconds of motion needs no pause control (WCAG 2.2.2)
        // and never competes with the form for attention.
        if (elapsed >= _ambientFor) {
          _clock.value = _ambientFor.inMicroseconds / 1e6;
          _ticker?.stop();
          return;
        }
        // About thirty frames a second is plenty for a drifting sea.
        if ((elapsed - _lastTick).inMilliseconds < 33) return;
        _lastTick = elapsed;
        _clock.value = elapsed.inMicroseconds / 1e6;
      })
        ..start();
    }
  }

  @override
  void didUpdateWidget(covariant DawnWindow old) {
    super.didUpdateWidget(old);
    if (old.dawn != widget.dawn || old.stage != widget.stage) {
      final t = Curves.easeInOutCubic.transform(_rise.value);
      _fromDawn = _fromDawn + (old.dawn - _fromDawn) * t;
      _fromStage = _fromStage + (old.stage - _fromStage) * t;
      _lastDawn = widget.dawn;
      _lastStage = widget.stage.toDouble();
      if (_reduceMotion(context)) {
        _fromDawn = widget.dawn;
        _fromStage = widget.stage.toDouble();
        _rise.value = 1;
      } else {
        _rise.forward(from: 0);
      }
    }
  }

  @override
  void dispose() {
    _ticker?.dispose();
    _rise.dispose();
    _clock.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return ExcludeSemantics(
      child: RepaintBoundary(
        child: ClipRRect(
          borderRadius: BorderRadius.circular(18),
          child: SizedBox(
            height: widget.height,
            width: double.infinity,
            child: CustomPaint(
              painter: _DawnPainter(
                rise: _rise,
                clock: _clock,
                fromDawn: _fromDawn,
                toDawn: widget.dawn,
                fromStage: _fromStage,
                toStage: widget.stage.toDouble(),
                stages: widget.stages,
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _DawnPainter extends CustomPainter {
  _DawnPainter({
    required this.rise,
    required this.clock,
    required this.fromDawn,
    required this.toDawn,
    required this.fromStage,
    required this.toStage,
    required this.stages,
  }) : super(repaint: Listenable.merge([rise, clock]));

  final Animation<double> rise;
  final ValueNotifier<double> clock;
  final double fromDawn;
  final double toDawn;
  final double fromStage;
  final double toStage;
  final int stages;

  static final _stars = () {
    final random = math.Random(3);
    return [
      for (var i = 0; i < 46; i++)
        (
          random.nextDouble(),
          random.nextDouble() * 0.62,
          0.6 + random.nextDouble() * 1.1,
          random.nextDouble() * math.pi * 2,
          0.6 + random.nextDouble() * 1.8,
        ),
    ];
  }();

  @override
  void paint(Canvas canvas, Size size) {
    final k = Curves.easeInOutCubic.transform(rise.value);
    final d = fromDawn + (toDawn - fromDawn) * k;
    final s = fromStage + (toStage - fromStage) * k;
    final t = clock.value;
    final w = size.width, h = size.height;
    final horizon = h * 0.7;

    // Sky.
    final sky = Dawn.sky(d);
    final skyRect = Rect.fromLTWH(0, 0, w, horizon + 1);
    canvas.drawRect(
      skyRect,
      Paint()
        ..shader = LinearGradient(
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
          colors: sky,
          stops: const [0, 0.38, 0.78, 1],
        ).createShader(skyRect),
    );

    // Stars fade as the light comes.
    final starAlpha = (1 - d / 0.5).clamp(0.0, 1.0);
    if (starAlpha > 0) {
      final paint = Paint();
      for (final star in _stars) {
        final twinkle = 0.55 + 0.45 * math.sin(t * star.$5 + star.$4);
        paint.color = const Color(0xFFFFF3D6)
            .withValues(alpha: starAlpha * twinkle * 0.9);
        canvas.drawCircle(
            Offset(star.$1 * w, star.$2 * horizon), star.$3, paint);
      }
    }

    // The sun climbs from under the sea to a morning height.
    final sunR = h * 0.17;
    final sunX = w * 0.74;
    final sunY = horizon + sunR * 1.15 - (horizon * 0.62 + sunR * 1.15) * d;
    final sunColor =
        Color.lerp(const Color(0xFFFFB27A), const Color(0xFFFFF0C4), d)!;
    final glowR = sunR * (3.2 + d * 1.6);
    canvas.drawCircle(
      Offset(sunX, sunY),
      glowR,
      Paint()
        ..shader = RadialGradient(colors: [
          sunColor.withValues(alpha: 0.5 * (0.35 + d * 0.65)),
          sunColor.withValues(alpha: 0),
        ]).createShader(
            Rect.fromCircle(center: Offset(sunX, sunY), radius: glowR)),
    );
    // God rays once it is light.
    if (d > 0.45) {
      final rays = Paint()
        ..color = const Color(0xFFFFF4DC).withValues(alpha: (d - 0.45) * 0.22);
      canvas.save();
      canvas.clipRect(skyRect);
      for (var i = 0; i < 12; i++) {
        final a = -math.pi +
            (i + 0.5) * math.pi / 12 +
            math.sin(t * 0.05 + i) * 0.015;
        final path = Path()
          ..moveTo(sunX, sunY)
          ..lineTo(
              sunX + math.cos(a - 0.035) * w, sunY + math.sin(a - 0.035) * w)
          ..lineTo(
              sunX + math.cos(a + 0.035) * w, sunY + math.sin(a + 0.035) * w)
          ..close();
        canvas.drawPath(path, rays);
      }
      canvas.restore();
    }
    canvas.save();
    canvas.clipRect(skyRect);
    canvas.drawCircle(Offset(sunX, sunY), sunR, Paint()..color = sunColor);
    canvas.restore();

    // Haze drifting across the light.
    final haze = Paint()
      ..color = Color.lerp(const Color(0x08FFFFFF), const Color(0x55FFF6EA), d)!
      ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 5);
    for (var i = 0; i < 3; i++) {
      final y = horizon * (0.28 + i * 0.2);
      final len = w * (0.22 + i * 0.07);
      final x = ((t * (6 + i * 3) + i * w * 0.37) % (w + len)) - len;
      canvas.drawRRect(
        RRect.fromRectAndRadius(
            Rect.fromLTWH(x, y, len, h * 0.035), const Radius.circular(99)),
        haze,
      );
    }

    // The sea, in print swells, with the sun's path glittering on it.
    final sea = Dawn.sea(d);
    final seaRect = Rect.fromLTWH(0, horizon, w, h - horizon);
    canvas.drawRect(
      seaRect,
      Paint()
        ..shader = LinearGradient(
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
          colors: sea,
        ).createShader(seaRect),
    );
    final swell = Paint()..color = const Color(0x0FFFFFFF);
    for (var y = horizon + 3.0; y < h; y += 4 + (y - horizon) * 0.12) {
      canvas.drawRect(Rect.fromLTWH(0, y, w, 1), swell);
    }
    final glitter = Paint();
    final random = math.Random(9);
    final rows = 9;
    for (var r = 0; r < rows; r++) {
      final depth = (r + 1) / rows;
      final y = horizon + 2 + (h - horizon - 4) * depth * depth;
      for (var c = 0; c < 5; c++) {
        final seed = random.nextDouble();
        final spread = (8 + depth * w * 0.09);
        final x = sunX + (random.nextDouble() - 0.5) * spread * 2;
        final shimmer =
            0.5 + 0.5 * math.sin(t * (1.4 + seed * 2.2) + seed * 40);
        final len = 3 + depth * 14 * (0.4 + seed);
        glitter.color =
            Color.lerp(const Color(0xFFFFC98E), const Color(0xFFFFF4D6), d)!
                .withValues(
                    alpha: (0.18 + 0.62 * d) *
                        shimmer *
                        (sunY < horizon ? 1 : 0.35));
        canvas.drawRRect(
          RRect.fromRectAndRadius(
              Rect.fromCenter(center: Offset(x, y), width: len, height: 1.6),
              const Radius.circular(1)),
          glitter,
        );
      }
    }

    if (stages > 1) _paintFlight(canvas, size, s, d);
  }

  /// A dotted arc over the sea with one mark per step, and the paper plane
  /// sitting at the current one.
  void _paintFlight(Canvas canvas, Size size, double s, double d) {
    final w = size.width, h = size.height;
    final p0 = Offset(w * 0.07, h * 0.62);
    final p1 = Offset(w * 0.45, h * 0.02);
    final p2 = Offset(w * 0.93, h * 0.36);
    Offset at(double u) {
      final a = Offset.lerp(p0, p1, u)!, b = Offset.lerp(p1, p2, u)!;
      return Offset.lerp(a, b, u)!;
    }

    final light = d > 0.5;
    final ink = light ? const Color(0xFF10263B) : const Color(0xFFFFF6E6);
    final reached = (s / (stages - 1)).clamp(0.0, 1.0);
    final dot = Paint();
    const steps = 64;
    for (var i = 0; i <= steps; i++) {
      final u = i / steps;
      dot.color = ink.withValues(alpha: u <= reached ? 0.7 : 0.26);
      canvas.drawCircle(at(u), 1.3, dot);
    }
    for (var i = 0; i < stages; i++) {
      final u = i / (stages - 1);
      final c = at(u);
      final done = u <= reached + 0.001;
      canvas.drawCircle(
          c, 5.5, Paint()..color = done ? ink : ink.withValues(alpha: 0));
      canvas.drawCircle(
        c,
        5.5,
        Paint()
          ..style = PaintingStyle.stroke
          ..strokeWidth = 1.6
          ..color = ink.withValues(alpha: done ? 1 : 0.5),
      );
    }

    final pos = at(reached);
    final ahead = at((reached + 0.01).clamp(0.0, 1.0));
    final behind = at((reached - 0.01).clamp(0.0, 1.0));
    final angle = math.atan2(ahead.dy - behind.dy, ahead.dx - behind.dx);
    final bob = math.sin(clock.value * 1.6) * 1.5;
    canvas.save();
    canvas.translate(pos.dx, pos.dy - 15 + bob);
    // The drawing's nose points up and to the right (-45 degrees).
    canvas.rotate(angle + math.pi / 4);
    _paintPlane(canvas, 34);
    canvas.restore();
  }

  @override
  bool shouldRepaint(_DawnPainter old) =>
      old.fromDawn != fromDawn ||
      old.toDawn != toDawn ||
      old.fromStage != fromStage ||
      old.toStage != toStage ||
      old.stages != stages;
}

/// The homepage's paper plane (web/media/home/orn-plane.svg), nose to the
/// right, centred on the origin, [size] wide.
void _paintPlane(Canvas canvas, double size) {
  final k = size / 160;
  canvas.save();
  canvas.scale(k);
  canvas.translate(-214, -97);
  Path poly(List<double> xy) {
    final p = Path()..moveTo(xy[0], xy[1]);
    for (var i = 2; i < xy.length; i += 2) {
      p.lineTo(xy[i], xy[i + 1]);
    }
    return p..close();
  }

  canvas.drawPath(
    poly([138, 118, 292, 18, 196, 150]),
    Paint()..color = const Color(0xFFE7DCC8),
  );
  canvas.drawPath(
    poly([138, 118, 292, 18, 176, 128]),
    Paint()..color = const Color(0xFFFFFDF7),
  );
  canvas.drawPath(
    poly([176, 128, 292, 18, 206, 176, 190, 140]),
    Paint()..color = const Color(0xFFF2E8D6),
  );
  canvas.drawPath(
    poly([190, 140, 206, 176, 176, 128]),
    Paint()..color = const Color(0xFFCDBD9F),
  );
  canvas.restore();
}

/// The plain-English lens from the film: a letter whose lines are read one
/// by one, each turning from grey insurer type into dark, plain print as the
/// glass passes. It loops calmly while a document is being read.
class LensLetter extends StatefulWidget {
  const LensLetter({super.key, this.width = 220});

  final double width;

  @override
  State<LensLetter> createState() => _LensLetterState();
}

class _LensLetterState extends State<LensLetter>
    with SingleTickerProviderStateMixin {
  late final AnimationController _read = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 6400),
  );

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_reduceMotion(context)) {
      _read
        ..stop()
        ..value = 0.45;
    } else if (!_read.isAnimating) {
      _read.repeat();
    }
  }

  @override
  void dispose() {
    _read.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return ExcludeSemantics(
      child: SizedBox(
        width: widget.width,
        height: widget.width * 1.18,
        child: CustomPaint(painter: _LensPainter(_read)),
      ),
    );
  }
}

class _LensPainter extends CustomPainter {
  _LensPainter(this.read) : super(repaint: read);

  final Animation<double> read;

  static const _widths = [0.92, 0.78, 0.86, 0.64, 0.9, 0.72, 0.84, 0.5];

  @override
  void paint(Canvas canvas, Size size) {
    final w = size.width, h = size.height;
    final sheet = RRect.fromRectAndRadius(
      Rect.fromLTWH(w * 0.06, h * 0.03, w * 0.88, h * 0.94),
      const Radius.circular(10),
    );
    canvas.drawRRect(
      sheet.shift(const Offset(0, 10)),
      Paint()
        ..color = const Color(0x3310263B)
        ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 14),
    );
    canvas.drawRRect(sheet, Paint()..color = const Color(0xFFFFFDF8));
    canvas.drawRRect(
      sheet,
      Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = 1
        ..color = const Color(0xFFE6DCCB),
    );
    final left = sheet.left + w * 0.1;
    final right = sheet.right - w * 0.1;
    // Masthead: a short mono rule and a hairline.
    canvas.drawRRect(
      RRect.fromRectAndRadius(
          Rect.fromLTWH(left, sheet.top + h * 0.07, w * 0.34, h * 0.022),
          const Radius.circular(4)),
      Paint()..color = const Color(0xFF9AA6AE),
    );
    canvas.drawRect(
      Rect.fromLTWH(left, sheet.top + h * 0.13, right - left, 1),
      Paint()..color = const Color(0x2417324D),
    );

    // The lens travels down the lines, holds at the end, then starts over.
    final phase = read.value;
    final travel = Curves.easeInOut.transform((phase / 0.82).clamp(0.0, 1.0));
    final top = sheet.top + h * 0.2;
    final gap = (sheet.bottom - h * 0.1 - top) / (_widths.length - 1);
    final lensRow = travel * (_widths.length - 1);
    for (var i = 0; i < _widths.length; i++) {
      final y = top + i * gap;
      final printed = (lensRow - i + 0.5).clamp(0.0, 1.0);
      final colour = Color.lerp(
          const Color(0xFFC9CFD4), const Color(0xFF17324D), printed)!;
      canvas.drawRRect(
        RRect.fromRectAndRadius(
          Rect.fromLTWH(left, y, (right - left) * _widths[i],
              h * 0.026 + printed * h * 0.006),
          const Radius.circular(4),
        ),
        Paint()..color = colour,
      );
    }

    final fade = phase > 0.9 ? 1 - (phase - 0.9) / 0.1 : 1.0;
    final lensY = top + lensRow * gap - gap * 0.42;
    final lens = RRect.fromRectAndRadius(
      Rect.fromLTWH(
          sheet.left + w * 0.04, lensY, sheet.width - w * 0.08, gap * 1.05),
      const Radius.circular(10),
    );
    canvas.drawRRect(
      lens.shift(const Offset(0, 8)),
      Paint()
        ..color = Color.fromRGBO(16, 38, 59, 0.22 * fade)
        ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 10),
    );
    canvas.drawRRect(
      lens,
      Paint()
        ..shader = LinearGradient(
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
          colors: [
            Color.fromRGBO(255, 255, 255, 0.5 * fade),
            Color.fromRGBO(255, 255, 255, 0.08 * fade),
          ],
        ).createShader(lens.outerRect),
    );
    canvas.drawRRect(
      lens,
      Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = 1.6
        ..color = Color.fromRGBO(47, 111, 98, 0.75 * fade),
    );
    // The "Plain English" tab on the glass.
    final tab = RRect.fromRectAndRadius(
      Rect.fromLTWH(
          lens.right - w * 0.32, lens.top - h * 0.03, w * 0.28, h * 0.055),
      const Radius.circular(99),
    );
    canvas.drawRRect(tab, Paint()..color = Color.fromRGBO(47, 111, 98, fade));
    canvas.drawRRect(
      RRect.fromRectAndRadius(
        Rect.fromLTWH(tab.left + tab.width * 0.18, tab.center.dy - h * 0.005,
            tab.width * 0.64, h * 0.01),
        const Radius.circular(4),
      ),
      Paint()..color = Color.fromRGBO(255, 255, 255, 0.9 * fade),
    );
  }

  @override
  bool shouldRepaint(_LensPainter old) => false;
}

/// The upload target: an envelope that opens when a file is near, a letter
/// rising out of it, and a seal once the documents are in.
class EnvelopeArt extends StatelessWidget {
  const EnvelopeArt({
    super.key,
    required this.open,
    required this.sealed,
    this.width = 132,
  });

  /// 0 = closed, 1 = flap up and the letter half out.
  final double open;
  final bool sealed;
  final double width;

  @override
  Widget build(BuildContext context) {
    final still = _reduceMotion(context);
    final target = sealed ? 0.0 : open;
    return ExcludeSemantics(
      child: TweenAnimationBuilder<double>(
        tween: Tween(end: target),
        duration: still ? Duration.zero : const Duration(milliseconds: 520),
        curve: Curves.easeOutBack,
        builder: (context, value, _) => TweenAnimationBuilder<double>(
          tween: Tween(end: sealed ? 1 : 0),
          duration: still ? Duration.zero : const Duration(milliseconds: 420),
          curve: Curves.easeOutBack,
          builder: (context, seal, _) => SizedBox(
            width: width,
            height: width * 0.98,
            child: CustomPaint(painter: _EnvelopePainter(value, seal)),
          ),
        ),
      ),
    );
  }
}

class _EnvelopePainter extends CustomPainter {
  _EnvelopePainter(this.open, this.seal);

  final double open;
  final double seal;

  @override
  void paint(Canvas canvas, Size size) {
    final w = size.width, h = size.height;
    final body = Rect.fromLTWH(w * 0.04, h * 0.4, w * 0.92, h * 0.56);
    final o = open.clamp(-0.1, 1.15);

    canvas.drawRRect(
      RRect.fromRectAndRadius(
          body.shift(const Offset(0, 8)), const Radius.circular(8)),
      Paint()
        ..color = const Color(0x3010263B)
        ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 12),
    );
    // Back of the envelope.
    canvas.drawRRect(
      RRect.fromRectAndRadius(body, const Radius.circular(8)),
      Paint()..color = const Color(0xFFE9DFCC),
    );
    // Flap: folds up and over as the envelope opens.
    final flapTip = body.top + body.height * 0.52 * (1 - 2 * o.clamp(0.0, 1.0));
    final flap = Path()
      ..moveTo(body.left, body.top)
      ..lineTo(body.right, body.top)
      ..lineTo(body.center.dx, flapTip)
      ..close();
    if (o > 0.5) {
      canvas.drawPath(flap, Paint()..color = const Color(0xFFDCCFB6));
    }

    // The letter rises out of it.
    final rise = o.clamp(0.0, 1.15) * h * 0.36;
    final letter =
        Rect.fromLTWH(w * 0.14, body.top + h * 0.04 - rise, w * 0.72, h * 0.5);
    canvas.save();
    canvas.clipRect(Rect.fromLTRB(0, 0, w, body.top + body.height * 0.55));
    canvas.drawRRect(
      RRect.fromRectAndRadius(letter, const Radius.circular(5)),
      Paint()..color = const Color(0xFFFFFDF8),
    );
    canvas.drawRRect(
      RRect.fromRectAndRadius(letter, const Radius.circular(5)),
      Paint()
        ..style = PaintingStyle.stroke
        ..color = const Color(0xFFE2D6C2),
    );
    for (var i = 0; i < 4; i++) {
      canvas.drawRRect(
        RRect.fromRectAndRadius(
          Rect.fromLTWH(
              letter.left + letter.width * 0.12,
              letter.top + letter.height * (0.18 + i * 0.15),
              letter.width * (i == 0 ? 0.4 : 0.76 - i * 0.08),
              letter.height * 0.05),
          const Radius.circular(3),
        ),
        Paint()
          ..color = i == 0 ? const Color(0xFF9AA6AE) : const Color(0xFFC9CFD4),
      );
    }
    canvas.restore();

    // Front pocket.
    final pocket = Path()
      ..moveTo(body.left, body.top + body.height * 0.18)
      ..lineTo(body.center.dx, body.top + body.height * 0.62)
      ..lineTo(body.right, body.top + body.height * 0.18)
      ..lineTo(body.right, body.bottom - 8)
      ..quadraticBezierTo(body.right, body.bottom, body.right - 8, body.bottom)
      ..lineTo(body.left + 8, body.bottom)
      ..quadraticBezierTo(body.left, body.bottom, body.left, body.bottom - 8)
      ..close();
    canvas.drawPath(pocket, Paint()..color = const Color(0xFFF4ECDD));
    canvas.drawPath(
      pocket,
      Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = 1
        ..color = const Color(0xFFDCCFB6),
    );
    if (o <= 0.5) {
      canvas.drawPath(flap, Paint()..color = const Color(0xFFEFE5D3));
      canvas.drawPath(
        flap,
        Paint()
          ..style = PaintingStyle.stroke
          ..strokeWidth = 1
          ..color = const Color(0xFFDCCFB6),
      );
    }

    if (seal > 0.01) {
      final c = Offset(body.center.dx, body.top + body.height * 0.5);
      final r = w * 0.11 * seal;
      canvas.drawCircle(c, r, Paint()..color = const Color(0xFF2F6F62));
      final tick = Path()
        ..moveTo(c.dx - r * 0.42, c.dy + r * 0.02)
        ..lineTo(c.dx - r * 0.1, c.dy + r * 0.34)
        ..lineTo(c.dx + r * 0.46, c.dy - r * 0.32);
      canvas.drawPath(
        tick,
        Paint()
          ..style = PaintingStyle.stroke
          ..strokeWidth = r * 0.2
          ..strokeCap = StrokeCap.round
          ..strokeJoin = StrokeJoin.round
          ..color = Colors.white,
      );
    }
  }

  @override
  bool shouldRepaint(_EnvelopePainter old) =>
      old.open != open || old.seal != seal;
}

/// A dashed, rounded outline, for drop targets.
class DashedOutline extends CustomPainter {
  const DashedOutline(
      {required this.color, this.radius = 16, this.width = 1.4});

  final Color color;
  final double radius;
  final double width;

  @override
  void paint(Canvas canvas, Size size) {
    final path = Path()
      ..addRRect(RRect.fromRectAndRadius(
          (Offset.zero & size).deflate(width / 2), Radius.circular(radius)));
    final paint = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = width
      ..color = color;
    for (final metric in path.computeMetrics()) {
      var distance = 0.0;
      while (distance < metric.length) {
        canvas.drawPath(metric.extractPath(distance, distance + 7), paint);
        distance += 12;
      }
    }
  }

  @override
  bool shouldRepaint(DashedOutline old) =>
      old.color != color || old.radius != radius || old.width != width;
}
