import 'dart:ui';

import 'package:firebase_auth/firebase_auth.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../core/constants.dart';
import '../core/theme.dart';
import 'ui.dart';

/// Responsive page shell: a translucent sticky top bar with the ClaimHelper
/// wordmark plus navigation, and a body constrained to a comfortable reading
/// width on wide screens.
class AppScaffold extends StatelessWidget {
  const AppScaffold({
    super.key,
    required this.child,
    this.title,
    this.showChrome = true,
    this.maxWidth = 760,
    this.actions,
    this.backgroundColor,
  });

  final Widget child;
  final String? title;
  final bool showChrome;
  final double maxWidth;
  final List<Widget>? actions;
  final Color? backgroundColor;

  @override
  Widget build(BuildContext context) {
    final media = MediaQuery.of(context);
    final wide = media.size.width > 640 && media.textScaler.scale(14.5) <= 20;
    final compactBrand =
        media.size.width < 600 && media.textScaler.scale(19) > 28;
    const headerHeight = 72.0;
    final scaffold = Scaffold(
      backgroundColor: backgroundColor,
      extendBodyBehindAppBar: true,
      appBar: showChrome
          ? PreferredSize(
              preferredSize: const Size.fromHeight(headerHeight),
              child: ClipRect(
                child: BackdropFilter(
                  filter: ImageFilter.blur(sigmaX: 14, sigmaY: 14),
                  child: Container(
                    decoration: BoxDecoration(
                      color: AppColors.surface.withValues(alpha: 0.72),
                      border: const Border(
                        bottom: BorderSide(color: AppColors.border),
                      ),
                    ),
                    child: SafeArea(
                      bottom: false,
                      child: Center(
                        child: ConstrainedBox(
                          constraints: const BoxConstraints(maxWidth: 1120),
                          child: Padding(
                            padding: const EdgeInsets.symmetric(
                                horizontal: 20, vertical: 8),
                            child: Row(
                              children: [
                                Semantics(
                                  button: true,
                                  label: 'GetMyYes home',
                                  excludeSemantics: true,
                                  onTap: () => context.go('/'),
                                  child: InkWell(
                                    onTap: () => context.go('/'),
                                    borderRadius: BorderRadius.circular(10),
                                    child: ConstrainedBox(
                                      constraints: const BoxConstraints(
                                        minWidth: 48,
                                        minHeight: 48,
                                      ),
                                      child: Padding(
                                        padding: const EdgeInsets.all(2),
                                        child: compactBrand
                                            ? BrandMark(size: 30)
                                            : Wordmark(
                                                markSize: 30, fontSize: 19),
                                      ),
                                    ),
                                  ),
                                ),
                                const Spacer(),
                                Semantics(
                                  container: true,
                                  label: 'Primary navigation',
                                  explicitChildNodes: true,
                                  child: Row(
                                    mainAxisSize: MainAxisSize.min,
                                    children: actions ??
                                        _defaultActions(context, wide),
                                  ),
                                ),
                              ],
                            ),
                          ),
                        ),
                      ),
                    ),
                  ),
                ),
              ),
            )
          : null,
      body: SafeArea(
        top: false,
        child: Center(
          child: ConstrainedBox(
            constraints: BoxConstraints(maxWidth: maxWidth),
            child: Padding(
              padding: EdgeInsets.only(top: showChrome ? headerHeight : 0),
              child: _BodyEntrance(child: child),
            ),
          ),
        ),
      ),
    );
    if (title == null) return scaffold;
    return Semantics(
      scopesRoute: true,
      namesRoute: true,
      label: title,
      explicitChildNodes: true,
      child: scaffold,
    );
  }

  List<Widget> _defaultActions(BuildContext context, bool wide) {
    return [
      _AdminNav(wide: wide),
      if (wide) ...[
        _NavLink(label: 'My cases', onTap: () => context.go('/account')),
        const SizedBox(width: 4),
        _NavLink(label: 'Privacy', onTap: () => context.go('/settings')),
        const SizedBox(width: 14),
        FilledButton(
          onPressed: () => context.go('/upload'),
          style: FilledButton.styleFrom(
            padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 12),
            textStyle:
                const TextStyle(fontSize: 14.5, fontWeight: FontWeight.w700),
          ),
          child: const Text('Start appeal'),
        ),
      ] else ...[
        IconButton(
          tooltip: 'Saved cases',
          icon: const Icon(Icons.folder_outlined),
          onPressed: () => context.go('/account'),
        ),
        IconButton(
          tooltip: 'Settings & privacy',
          icon: const Icon(Icons.settings_outlined),
          onPressed: () => context.go('/settings'),
        ),
      ],
    ];
  }
}

/// Owner-only "Analytics" entry in the top bar. Renders nothing for everyone
/// else; the data itself is additionally gated by Firestore rules.
class _AdminNav extends StatelessWidget {
  const _AdminNav({required this.wide});
  final bool wide;

  @override
  Widget build(BuildContext context) {
    // Widget tests and demo shells may render the shared chrome before a
    // Firebase app exists. The owner shortcut is optional UI, so it should
    // disappear instead of making the entire page fail to build.
    if (kUseMocks || Firebase.apps.isEmpty) return const SizedBox.shrink();
    return StreamBuilder<User?>(
      stream: FirebaseAuth.instance.authStateChanges(),
      builder: (context, snap) {
        if (snap.data?.uid != kAdminUid) return const SizedBox.shrink();
        return wide
            ? _NavLink(label: 'Analytics', onTap: () => context.go('/stats'))
            : IconButton(
                tooltip: 'Analytics',
                icon: const Icon(Icons.insights_outlined),
                onPressed: () => context.go('/stats'),
              );
      },
    );
  }
}

class _NavLink extends StatelessWidget {
  const _NavLink({required this.label, required this.onTap});
  final String label;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return TextButton(
      onPressed: onTap,
      style: TextButton.styleFrom(
        foregroundColor: AppColors.textSecondary,
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
        textStyle: const TextStyle(fontSize: 14.5, fontWeight: FontWeight.w600),
      ),
      child: Text(label),
    );
  }
}

/// Gentle zoom-in for page content on load. Lives on the BODY only — the
/// sticky header chrome stays perfectly still while pages come in.
class _BodyEntrance extends StatelessWidget {
  const _BodyEntrance({required this.child});
  final Widget child;

  @override
  Widget build(BuildContext context) {
    if (MediaQuery.maybeOf(context)?.disableAnimations ?? false) return child;
    return TweenAnimationBuilder<double>(
      tween: Tween(begin: 0, end: 1),
      duration: const Duration(milliseconds: 420),
      curve: Curves.easeOutCubic,
      child: child,
      builder: (context, t, inner) => Opacity(
        opacity: t,
        child: Transform.scale(
          scale: 0.97 + 0.03 * t,
          alignment: Alignment.topCenter,
          child: inner,
        ),
      ),
    );
  }
}

/// A small pill that repeats the "not advice" reminder near actions.
class DisclaimerChip extends StatelessWidget {
  const DisclaimerChip({super.key, this.text = AppCopy.notMedicalAdviceShort});
  final String text;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
      decoration: BoxDecoration(
        color: AppColors.primaryTint,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: AppColors.primary.withValues(alpha: 0.14)),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          const Icon(Icons.shield_outlined, size: 16, color: AppColors.primary),
          const SizedBox(width: 8),
          Flexible(
            child: Text(text,
                style: const TextStyle(
                    fontSize: 12.5,
                    fontWeight: FontWeight.w600,
                    color: AppColors.textSecondary)),
          ),
        ],
      ),
    );
  }
}

/// Standard error/retry block used across async screens.
class ErrorRetry extends StatelessWidget {
  const ErrorRetry({super.key, required this.message, required this.onRetry});
  final String message;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      container: true,
      liveRegion: true,
      label: 'Error',
      child: Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const IconTile(
                icon: Icons.error_outline_rounded,
                color: AppColors.error,
                size: 54,
              ),
              const SizedBox(height: 16),
              Text(message,
                  textAlign: TextAlign.center,
                  style: const TextStyle(
                      fontSize: 15, color: AppColors.textSecondary)),
              const SizedBox(height: 18),
              FilledButton.icon(
                onPressed: onRetry,
                icon: const Icon(Icons.refresh),
                label: const Text('Try again'),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
