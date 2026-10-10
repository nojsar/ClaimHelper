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
class AppScaffold extends StatefulWidget {
  const AppScaffold({
    super.key,
    required this.child,
    this.title,
    this.showChrome = true,
    this.maxWidth = 760,
    this.actions,
    this.backgroundColor,
    this.showPrimaryAction = true,
  });

  final Widget child;
  final String? title;
  final bool showChrome;
  final double maxWidth;
  final List<Widget>? actions;
  final Color? backgroundColor;
  final bool showPrimaryAction;

  @override
  State<AppScaffold> createState() => _AppScaffoldState();
}

class _AppScaffoldState extends State<AppScaffold> {
  late final FocusNode _mainFocusNode;
  bool _mainFocused = false;
  bool _skipFocused = false;
  final GlobalKey _skipLinkKey = GlobalKey();

  @override
  void initState() {
    super.initState();
    _mainFocusNode = FocusNode(
      debugLabel: 'Main content',
      skipTraversal: true,
    );
  }

  @override
  void dispose() {
    _mainFocusNode.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final media = MediaQuery.of(context);
    final wide = media.size.width > 900 && media.textScaler.scale(14.5) <= 20;
    final compactBrand =
        media.size.width < 600 && media.textScaler.scale(19) > 28;
    const headerHeight = 72.0;
    final scaffold = Scaffold(
      backgroundColor: widget.backgroundColor,
      extendBodyBehindAppBar: true,
      appBar: widget.showChrome
          ? PreferredSize(
              preferredSize: const Size.fromHeight(headerHeight),
              child: Container(
                decoration: BoxDecoration(
                  color: context.palette.surface,
                  border: Border(
                    bottom: BorderSide(color: context.palette.border),
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
                                        : Wordmark(markSize: 30, fontSize: 19),
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
                                children: widget.actions ??
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
            )
          : null,
      body: SafeArea(
        top: false,
        child: Center(
          child: ConstrainedBox(
            constraints: BoxConstraints(maxWidth: widget.maxWidth),
            child: Padding(
              padding:
                  EdgeInsets.only(top: widget.showChrome ? headerHeight : 0),
              child: Focus(
                key: const ValueKey('main-content'),
                focusNode: _mainFocusNode,
                onFocusChange: (focused) {
                  if (_mainFocused != focused) {
                    setState(() => _mainFocused = focused);
                  }
                },
                child: Semantics(
                  container: true,
                  explicitChildNodes: true,
                  focusable: true,
                  focused: _mainFocused,
                  label: 'Main content',
                  child: _BodyEntrance(child: widget.child),
                ),
              ),
            ),
          ),
        ),
      ),
    );
    final skipControl = Positioned(
      top: 8,
      left: 8,
      child: IgnorePointer(
        ignoring: !_skipFocused,
        child: Opacity(
          opacity: _skipFocused ? 1 : 0,
          alwaysIncludeSemantics: true,
          child: FocusTraversalOrder(
            order: const NumericFocusOrder(0),
            child: _SkipToMainContent(
              key: _skipLinkKey,
              onFocusChange: (focused) {
                if (_skipFocused != focused) {
                  setState(() => _skipFocused = focused);
                }
              },
              onPressed: () => _mainFocusNode.requestFocus(),
            ),
          ),
        ),
      ),
    );
    final shell = FocusTraversalGroup(
      policy: OrderedTraversalPolicy(),
      child: Stack(
        children: widget.showChrome ? [scaffold, skipControl] : [scaffold],
      ),
    );
    if (widget.title == null) return shell;
    return Title(
      color: context.palette.primary,
      title: '${widget.title} | GetMyYes',
      child: Semantics(
        scopesRoute: true,
        namesRoute: true,
        label: widget.title,
        explicitChildNodes: true,
        child: shell,
      ),
    );
  }

  List<Widget> _defaultActions(BuildContext context, bool wide) {
    return [
      _AdminNav(wide: wide),
      if (wide) ...[
        _NavLink(label: 'My cases', onTap: () => context.go('/account')),
        const SizedBox(width: 4),
        _NavLink(label: 'Privacy', onTap: () => context.go('/settings')),
        if (widget.showPrimaryAction) ...[
          const SizedBox(width: 14),
          FilledButton(
            onPressed: () => context.go('/upload'),
            style: FilledButton.styleFrom(
              padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 12),
              textStyle:
                  const TextStyle(fontSize: 16, fontWeight: FontWeight.w700),
            ),
            child: const Text('Free denial summary'),
          ),
        ],
      ] else ...[
        const _CompactNavigation(),
      ],
    ];
  }
}

enum _CompactDestination { cases, settings }

/// A single conventional menu prevents the mobile header from overflowing at
/// 200% text zoom while keeping full, readable destination names in the menu.
class _CompactNavigation extends StatelessWidget {
  const _CompactNavigation();

  @override
  Widget build(BuildContext context) {
    return PopupMenuButton<_CompactDestination>(
      tooltip: 'Navigation menu',
      icon: const Icon(Icons.menu_rounded),
      constraints: const BoxConstraints(minWidth: 220),
      onSelected: (destination) => switch (destination) {
        _CompactDestination.cases => context.go('/account'),
        _CompactDestination.settings => context.go('/settings'),
      },
      itemBuilder: (context) => const [
        PopupMenuItem(
          value: _CompactDestination.cases,
          height: 52,
          child: Row(
            children: [
              Icon(Icons.folder_open_outlined),
              SizedBox(width: 12),
              Text('My cases', style: TextStyle(fontSize: 16)),
            ],
          ),
        ),
        PopupMenuItem(
          value: _CompactDestination.settings,
          height: 52,
          child: Row(
            children: [
              Icon(Icons.settings_outlined),
              SizedBox(width: 12),
              Text('Privacy and settings', style: TextStyle(fontSize: 16)),
            ],
          ),
        ),
      ],
    );
  }
}

/// Keyboard-only bypass control for the repeated site navigation. It remains
/// visually hidden until focused, then moves focus to the main page region.
class _SkipToMainContent extends StatefulWidget {
  const _SkipToMainContent({
    super.key,
    required this.onFocusChange,
    required this.onPressed,
  });

  final ValueChanged<bool> onFocusChange;
  final VoidCallback onPressed;

  @override
  State<_SkipToMainContent> createState() => _SkipToMainContentState();
}

class _SkipToMainContentState extends State<_SkipToMainContent> {
  late final FocusNode _focusNode =
      FocusNode(debugLabel: 'Skip to main content');

  @override
  void dispose() {
    _focusNode.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Focus(
      canRequestFocus: false,
      skipTraversal: true,
      onFocusChange: widget.onFocusChange,
      child: FilledButton(
        key: const ValueKey('skip-to-main-content'),
        focusNode: _focusNode,
        onPressed: widget.onPressed,
        child: const Text('Skip to main content'),
      ),
    );
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
        foregroundColor: context.palette.textSecondary,
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
        textStyle: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700),
      ),
      child: Text(label),
    );
  }
}

/// A brief opacity-only entrance keeps the interface calm and spatially stable.
class _BodyEntrance extends StatelessWidget {
  const _BodyEntrance({required this.child});
  final Widget child;

  @override
  Widget build(BuildContext context) {
    if (MediaQuery.maybeOf(context)?.disableAnimations ?? false) return child;
    return TweenAnimationBuilder<double>(
      tween: Tween(begin: 0, end: 1),
      duration: const Duration(milliseconds: 160),
      curve: Curves.easeOutCubic,
      child: child,
      builder: (context, t, inner) => Opacity(opacity: t, child: inner),
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
        color: context.palette.primaryTint,
        borderRadius: BorderRadius.circular(12),
        border:
            Border.all(color: context.palette.primary.withValues(alpha: 0.14)),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(Icons.shield_outlined, size: 18, color: context.palette.primary),
          const SizedBox(width: 8),
          Flexible(
            child: Text(text,
                style: TextStyle(
                    fontSize: 16,
                    fontWeight: FontWeight.w600,
                    color: context.palette.textSecondary)),
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
      child: LayoutBuilder(
        builder: (context, constraints) => SingleChildScrollView(
          padding: const EdgeInsets.all(24),
          child: ConstrainedBox(
            constraints: BoxConstraints(
              minHeight: (constraints.maxHeight - 48).clamp(0, double.infinity),
            ),
            child: Center(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  IconTile(
                    icon: Icons.error_outline_rounded,
                    color: context.palette.error,
                    size: 54,
                  ),
                  const SizedBox(height: 16),
                  Text(message,
                      textAlign: TextAlign.center,
                      style: TextStyle(
                          fontSize: 16, color: context.palette.textSecondary)),
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
        ),
      ),
    );
  }
}
