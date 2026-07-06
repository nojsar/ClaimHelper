import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:video_player/video_player.dart';

import '../../core/theme.dart';
import '../../models/appeal_case.dart';
import '../../state/providers.dart';
import '../../widgets/app_scaffold.dart';

/// Landing page after Stripe checkout. Waits for the webhook to flip the case
/// to paid, then generates the packet and routes to it. While the model works,
/// the backend writes staged progress onto the case document and this screen
/// renders it as a cinematic "packet assembly" with a real progress bar.
class PurchaseSuccessScreen extends ConsumerStatefulWidget {
  const PurchaseSuccessScreen({
    super.key,
    required this.caseId,
    this.sessionId,
  });
  final String caseId;
  final String? sessionId;

  @override
  ConsumerState<PurchaseSuccessScreen> createState() =>
      _PurchaseSuccessScreenState();
}

class _PurchaseSuccessScreenState
    extends ConsumerState<PurchaseSuccessScreen> {
  bool _generating = false;
  String? _error;

  Future<void> _generateThenGo(AppealCase c) async {
    if (_generating || c.packet != null) {
      if (c.packet != null && mounted) {
        context.go('/case/${widget.caseId}/packet');
      }
      return;
    }
    _generating = true;
    try {
      await ref.read(backendProvider).generateAppealPacket(widget.caseId);
      if (mounted) context.go('/case/${widget.caseId}/packet');
    } catch (_) {
      if (mounted) {
        setState(() {
          _error = 'Your purchase is safe, but packet generation failed. '
              'Please retry.';
          _generating = false;
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final caseAsync = ref.watch(caseStreamProvider(widget.caseId));

    return AppScaffold(
      title: 'Thank you',
      child: caseAsync.when(
        loading: () => const _GenerationTheater(
            progress: null, stage: 'Loading your case…'),
        error: (e, _) => ErrorRetry(
          message: 'Could not load your case. Please refresh.',
          onRetry: () => ref.invalidate(caseStreamProvider(widget.caseId)),
        ),
        data: (c) {
          if (c == null) {
            return const _GenerationTheater(
                progress: null, stage: 'Loading…');
          }
          if (_error != null) {
            return ErrorRetry(
              message: _error!,
              onRetry: () {
                _error = null;
                _generateThenGo(c);
              },
            );
          }
          if (c.paid) {
            // Fire generation once the case is paid.
            WidgetsBinding.instance
                .addPostFrameCallback((_) => _generateThenGo(c));
            final done = c.packet != null;
            return _GenerationTheater(
              progress: done ? 1.0 : c.generationProgress,
              stage: done
                  ? 'Ready — opening your packet…'
                  : (c.generationStage ?? 'Starting the drafting engine…'),
              paymentConfirmed: true,
            );
          }
          return const _GenerationTheater(
            progress: null,
            stage: 'Waiting for payment confirmation… this can take a few '
                'seconds.',
          );
        },
      ),
    );
  }
}

/// Dark cinematic progress card: a stack of document "sheets" flies in as the
/// backend reports progress, a scan line sweeps while the model writes, and a
/// gradient bar tracks the true generation progress (null = indeterminate).
class _GenerationTheater extends StatefulWidget {
  const _GenerationTheater({
    required this.progress,
    required this.stage,
    this.paymentConfirmed = false,
  });
  final double? progress;
  final String stage;
  final bool paymentConfirmed;

  @override
  State<_GenerationTheater> createState() => _GenerationTheaterState();
}

class _GenerationTheaterState extends State<_GenerationTheater>
    with SingleTickerProviderStateMixin {
  late final AnimationController _pulse;
  VideoPlayerController? _video;
  bool _videoReady = false;

  @override
  void initState() {
    super.initState();
    _pulse = AnimationController(
        vsync: this, duration: const Duration(milliseconds: 2200))
      ..repeat();
    _initVideo();
  }

  /// Ambient AI-assembly clip (Seedance) behind the progress card. Served
  /// from the site's own /media path on web; if it can't load (dev server,
  /// offline, mobile builds) the gradient background simply shows instead.
  Future<void> _initVideo() async {
    if (!kIsWeb) return;
    try {
      final controller = VideoPlayerController.networkUrl(
          Uri.base.resolve('media/packet_assembly.mp4'));
      await controller.initialize();
      await controller.setLooping(true);
      await controller.setVolume(0);
      await controller.play();
      if (!mounted) {
        controller.dispose();
        return;
      }
      setState(() {
        _video = controller;
        _videoReady = true;
      });
    } catch (_) {
      // Gradient fallback.
    }
  }

  @override
  void dispose() {
    _pulse.dispose();
    _video?.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final target = widget.progress;
    return Center(
      child: SingleChildScrollView(
        padding: const EdgeInsets.all(24),
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 520),
          child: TweenAnimationBuilder<double>(
            tween: Tween(begin: 0, end: (target ?? 0).clamp(0.0, 1.0)),
            duration: const Duration(milliseconds: 900),
            curve: Curves.easeOutCubic,
            builder: (context, v, _) {
              final indeterminate = target == null;
              return Container(
                decoration: BoxDecoration(
                  borderRadius: BorderRadius.circular(24),
                  boxShadow: const [
                    BoxShadow(
                      color: Color(0x552563EB),
                      blurRadius: 46,
                      offset: Offset(0, 18),
                      spreadRadius: -18,
                    ),
                  ],
                ),
                child: ClipRRect(
                  borderRadius: BorderRadius.circular(24),
                  child: Stack(
                    children: [
                      // Ambient Seedance clip of papers assembling; sits under
                      // a dark scrim so the progress UI stays readable.
                      if (_videoReady && _video != null)
                        Positioned.fill(
                          child: FittedBox(
                            fit: BoxFit.cover,
                            clipBehavior: Clip.hardEdge,
                            child: SizedBox(
                              width: _video!.value.size.width,
                              height: _video!.value.size.height,
                              child: VideoPlayer(_video!),
                            ),
                          ),
                        ),
                      Positioned.fill(
                        child: DecoratedBox(
                          decoration: BoxDecoration(
                            gradient: LinearGradient(
                              begin: Alignment.topLeft,
                              end: Alignment.bottomRight,
                              colors: _videoReady
                                  ? const [Color(0xD90B1220), Color(0xC613203E)]
                                  : const [Color(0xFF0B1220), Color(0xFF13203E)],
                            ),
                          ),
                        ),
                      ),
                      Padding(
                        padding: const EdgeInsets.fromLTRB(28, 26, 28, 30),
                        child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    if (widget.paymentConfirmed) ...[
                      Row(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: const [
                          Icon(Icons.verified_rounded,
                              color: Color(0xFF34D399), size: 18),
                          SizedBox(width: 7),
                          Text('Payment confirmed',
                              style: TextStyle(
                                  color: Color(0xFF34D399),
                                  fontSize: 13,
                                  fontWeight: FontWeight.w700,
                                  letterSpacing: 0.3)),
                        ],
                      ),
                      const SizedBox(height: 18),
                    ],
                    _PacketAssembly(
                        progress: indeterminate ? 0.0 : v, pulse: _pulse),
                    const SizedBox(height: 22),
                    if (!indeterminate)
                      Text('${(v * 100).round()}%',
                          style: const TextStyle(
                              color: Colors.white,
                              fontSize: 34,
                              fontWeight: FontWeight.w800,
                              letterSpacing: -1)),
                    const SizedBox(height: 12),
                    _ProgressBar(
                        value: indeterminate ? null : v, pulse: _pulse),
                    const SizedBox(height: 16),
                    AnimatedSwitcher(
                      duration: const Duration(milliseconds: 350),
                      child: Text(
                        widget.stage,
                        key: ValueKey(widget.stage),
                        textAlign: TextAlign.center,
                        style: const TextStyle(
                            color: Colors.white70,
                            fontSize: 14.5,
                            height: 1.45,
                            fontWeight: FontWeight.w600),
                      ),
                    ),
                    const SizedBox(height: 10),
                    const Text(
                      'This usually takes a minute or two — keep this tab '
                      'open. Your packet is saved to your account either way.',
                      textAlign: TextAlign.center,
                      style: TextStyle(color: Colors.white38, fontSize: 12),
                    ),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
              );
            },
          ),
        ),
      ),
    );
  }
}

/// Sheets of the appeal packet assembling into a neat stack as progress rises.
class _PacketAssembly extends StatelessWidget {
  const _PacketAssembly({required this.progress, required this.pulse});
  final double progress;
  final Animation<double> pulse;

  static const _sheetCount = 6;

  @override
  Widget build(BuildContext context) {
    const width = 280.0;
    const height = 168.0;
    return SizedBox(
      width: width,
      height: height,
      child: AnimatedBuilder(
        animation: pulse,
        builder: (context, _) {
          final sweep = pulse.value;
          return Stack(
            clipBehavior: Clip.none,
            alignment: Alignment.center,
            children: [
              // Ambient glow that breathes with the pulse.
              Container(
                width: 180 + 14 * (0.5 - (sweep - 0.5).abs()) * 2,
                height: 120,
                decoration: BoxDecoration(
                  borderRadius: BorderRadius.circular(90),
                  gradient: RadialGradient(colors: [
                    const Color(0xFF2563EB)
                        .withValues(alpha: 0.24 + 0.10 * sweep),
                    Colors.transparent,
                  ]),
                ),
              ),
              // Document sheets fly in one by one.
              for (var i = 0; i < _sheetCount; i++)
                _sheet(i, progress >= (i + 1) / (_sheetCount + 1)),
              // Scan line sweeps while assembling.
              if (progress < 1)
                Positioned(
                  left: sweep * (width - 4),
                  top: 10,
                  bottom: 10,
                  child: Container(
                    width: 2.5,
                    decoration: BoxDecoration(
                      color: const Color(0xFF5EEAD4).withValues(alpha: 0.85),
                      borderRadius: BorderRadius.circular(2),
                      boxShadow: const [
                        BoxShadow(color: Color(0x885EEAD4), blurRadius: 14),
                      ],
                    ),
                  ),
                ),
              // Done badge.
              AnimatedScale(
                scale: progress >= 1 ? 1 : 0,
                duration: const Duration(milliseconds: 450),
                curve: Curves.easeOutBack,
                child: Container(
                  width: 54,
                  height: 54,
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    gradient: AppGradients.brand,
                    boxShadow: const [
                      BoxShadow(color: Color(0x882563EB), blurRadius: 22),
                    ],
                  ),
                  child: const Icon(Icons.check_rounded,
                      color: Colors.white, size: 32),
                ),
              ),
            ],
          );
        },
      ),
    );
  }

  Widget _sheet(int i, bool visible) {
    // Final resting position: a slightly fanned stack.
    final restLeft = 86.0 + i * 3.5;
    final restTop = 12.0 + i * 3.0;
    final startLeft = i.isEven ? -150.0 : 340.0;
    final startTop = 20.0 + (i * 37) % 90;
    final angle = (i - _sheetCount / 2) * 0.028;
    return AnimatedPositioned(
      duration: const Duration(milliseconds: 550),
      curve: Curves.easeOutCubic,
      left: visible ? restLeft : startLeft,
      top: visible ? restTop : startTop,
      child: AnimatedOpacity(
        duration: const Duration(milliseconds: 400),
        opacity: visible ? 1 : 0,
        child: Transform.rotate(
          angle: angle,
          child: Container(
            width: 108,
            height: 138,
            padding: const EdgeInsets.fromLTRB(12, 14, 12, 12),
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(10),
              border: Border.all(color: const Color(0xFFE2E8F0)),
              boxShadow: const [
                BoxShadow(
                    color: Color(0x33000000),
                    blurRadius: 16,
                    offset: Offset(0, 8)),
              ],
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Container(
                  width: 44,
                  height: 7,
                  decoration: BoxDecoration(
                    gradient: AppGradients.brand,
                    borderRadius: BorderRadius.circular(4),
                  ),
                ),
                const SizedBox(height: 10),
                for (var l = 0; l < 5; l++) ...[
                  Container(
                    width: l == 4 ? 52 : 84,
                    height: 5,
                    margin: const EdgeInsets.only(bottom: 7),
                    decoration: BoxDecoration(
                      color: const Color(0xFFE2E8F0),
                      borderRadius: BorderRadius.circular(3),
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

/// Gradient progress bar; sweeps a highlight segment when indeterminate.
class _ProgressBar extends StatelessWidget {
  const _ProgressBar({required this.value, required this.pulse});
  final double? value;
  final Animation<double> pulse;

  @override
  Widget build(BuildContext context) {
    return ClipRRect(
      borderRadius: BorderRadius.circular(999),
      child: SizedBox(
        height: 10,
        child: AnimatedBuilder(
          animation: pulse,
          builder: (context, _) {
            return Stack(
              children: [
                Container(color: Colors.white.withValues(alpha: 0.10)),
                if (value != null)
                  FractionallySizedBox(
                    alignment: Alignment.centerLeft,
                    widthFactor: value!.clamp(0.02, 1.0),
                    child: Container(
                      decoration: const BoxDecoration(
                        gradient: LinearGradient(colors: [
                          Color(0xFF2563EB),
                          Color(0xFF0D9488),
                          Color(0xFF5EEAD4),
                        ]),
                        boxShadow: [
                          BoxShadow(color: Color(0x662563EB), blurRadius: 10),
                        ],
                      ),
                    ),
                  )
                else
                  Align(
                    alignment: Alignment((pulse.value * 2 - 1) * 1.4, 0),
                    child: FractionallySizedBox(
                      widthFactor: 0.28,
                      child: Container(
                        decoration: const BoxDecoration(
                          gradient: LinearGradient(colors: [
                            Colors.transparent,
                            Color(0xFF2563EB),
                            Color(0xFF5EEAD4),
                            Colors.transparent,
                          ]),
                        ),
                      ),
                    ),
                  ),
              ],
            );
          },
        ),
      ),
    );
  }
}
