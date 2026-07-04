import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../core/constants.dart';
import '../core/theme.dart';

/// Responsive page shell: a top bar with the ClaimHelper wordmark plus
/// Account/Settings actions, and a body constrained to a comfortable reading
/// width on wide screens.
class AppScaffold extends StatelessWidget {
  const AppScaffold({
    super.key,
    required this.child,
    this.title,
    this.showChrome = true,
    this.maxWidth = 760,
    this.actions,
  });

  final Widget child;
  final String? title;
  final bool showChrome;
  final double maxWidth;
  final List<Widget>? actions;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: showChrome
          ? AppBar(
              title: InkWell(
                onTap: () => context.go('/'),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    const Icon(Icons.shield_outlined,
                        color: AppColors.primary, size: 22),
                    const SizedBox(width: 8),
                    Text(title ?? AppCopy.appName,
                        style: const TextStyle(
                            fontWeight: FontWeight.w700, fontSize: 18)),
                  ],
                ),
              ),
              actions: actions ??
                  [
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
                    const SizedBox(width: 8),
                  ],
            )
          : null,
      body: SafeArea(
        child: Center(
          child: ConstrainedBox(
            constraints: BoxConstraints(maxWidth: maxWidth),
            child: child,
          ),
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
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      decoration: BoxDecoration(
        color: const Color(0xFFEFF6FF),
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: const Color(0xFFBFDBFE)),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          const Icon(Icons.info_outline, size: 16, color: AppColors.primary),
          const SizedBox(width: 8),
          Flexible(
            child: Text(text,
                style: const TextStyle(
                    fontSize: 12, color: AppColors.textSecondary)),
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
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.error_outline, color: AppColors.error, size: 40),
            const SizedBox(height: 12),
            Text(message, textAlign: TextAlign.center),
            const SizedBox(height: 16),
            FilledButton.icon(
              onPressed: onRetry,
              icon: const Icon(Icons.refresh),
              label: const Text('Try again'),
            ),
          ],
        ),
      ),
    );
  }
}
