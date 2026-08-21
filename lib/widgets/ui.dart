import 'package:flutter/material.dart';

import '../core/theme.dart';

/// The GetMyYes brand mark: a calm navy-to-teal tile with a check.
class BrandMark extends StatelessWidget {
  const BrandMark({super.key, this.size = 34});
  final double size;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: size,
      height: size,
      decoration: BoxDecoration(
        gradient: AppGradients.brand,
        borderRadius: BorderRadius.circular(size * 0.30),
        boxShadow: const [
          BoxShadow(
            color: Color(0x382F6F62),
            blurRadius: 14,
            offset: Offset(0, 6),
            spreadRadius: -3,
          ),
        ],
      ),
      child: Icon(Icons.check_rounded, color: Colors.white, size: size * 0.62),
    );
  }
}

/// Wordmark: brand mark + "GetMyYes".
class Wordmark extends StatelessWidget {
  const Wordmark({super.key, this.markSize = 32, this.fontSize = 20});
  final double markSize;
  final double fontSize;

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        BrandMark(size: markSize),
        const SizedBox(width: 10),
        Text('GetMyYes',
            style: TextStyle(
              fontSize: fontSize,
              fontWeight: FontWeight.w800,
              letterSpacing: -0.5,
              color: AppColors.textPrimary,
            )),
      ],
    );
  }
}

/// Text painted with a gradient — for highlighting a headline keyword.
class GradientText extends StatelessWidget {
  const GradientText(this.text,
      {super.key,
      required this.style,
      this.gradient = AppGradients.accentText});
  final String text;
  final TextStyle style;
  final Gradient gradient;

  @override
  Widget build(BuildContext context) {
    return ShaderMask(
      shaderCallback: (bounds) => gradient.createShader(
        Rect.fromLTWH(0, 0, bounds.width, bounds.height),
      ),
      child: Text(text, style: style.copyWith(color: Colors.white)),
    );
  }
}

/// A small rounded pill with optional icon — for trust badges / eyebrows.
class PillBadge extends StatelessWidget {
  const PillBadge({
    super.key,
    required this.label,
    this.icon,
    this.color = AppColors.primary,
    this.background,
  });
  final String label;
  final IconData? icon;
  final Color color;
  final Color? background;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding:
          EdgeInsets.symmetric(horizontal: icon != null ? 12 : 14, vertical: 7),
      decoration: BoxDecoration(
        color: background ?? color.withValues(alpha: 0.09),
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: color.withValues(alpha: 0.18)),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (icon != null) ...[
            Icon(icon, size: 15, color: color),
            const SizedBox(width: 6),
          ],
          Text(label,
              style: TextStyle(
                  fontSize: 15,
                  fontWeight: FontWeight.w700,
                  letterSpacing: 0.1,
                  color: color)),
        ],
      ),
    );
  }
}

/// Section eyebrow + title + optional subtitle, centered or left-aligned.
class SectionHeader extends StatelessWidget {
  const SectionHeader({
    super.key,
    required this.eyebrow,
    required this.title,
    this.subtitle,
    this.center = true,
  });
  final String eyebrow;
  final String title;
  final String? subtitle;
  final bool center;

  @override
  Widget build(BuildContext context) {
    final align = center ? CrossAxisAlignment.center : CrossAxisAlignment.start;
    return Column(
      crossAxisAlignment: align,
      children: [
        Text(eyebrow,
            style: const TextStyle(
              fontSize: 15,
              fontWeight: FontWeight.w800,
              letterSpacing: 0.2,
              color: AppColors.primary,
            )),
        const SizedBox(height: 10),
        Semantics(
          header: true,
          child: Text(title,
              textAlign: center ? TextAlign.center : TextAlign.start,
              style: const TextStyle(
                fontSize: 30,
                fontWeight: FontWeight.w800,
                letterSpacing: -0.6,
                height: 1.15,
                color: AppColors.textPrimary,
              )),
        ),
        if (subtitle != null) ...[
          const SizedBox(height: 12),
          ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 560),
            child: Text(subtitle!,
                textAlign: center ? TextAlign.center : TextAlign.start,
                style: const TextStyle(
                    fontSize: 16,
                    height: 1.55,
                    color: AppColors.textSecondary)),
          ),
        ],
      ],
    );
  }
}

/// A surface card that lifts and brightens its border on hover (web/desktop).
class HoverCard extends StatefulWidget {
  const HoverCard({
    super.key,
    required this.child,
    this.padding = const EdgeInsets.all(22),
    this.onTap,
    this.radius = AppRadii.lg,
    this.baseShadow = AppShadows.subtle,
  });
  final Widget child;
  final EdgeInsets padding;
  final VoidCallback? onTap;
  final double radius;
  final List<BoxShadow> baseShadow;

  @override
  State<HoverCard> createState() => _HoverCardState();
}

class _HoverCardState extends State<HoverCard> {
  bool _hover = false;
  bool _focused = false;

  @override
  Widget build(BuildContext context) {
    final active = _hover || _focused;
    final reduceMotion =
        MediaQuery.maybeOf(context)?.disableAnimations ?? false;
    return FocusableActionDetector(
      enabled: widget.onTap != null,
      mouseCursor:
          widget.onTap != null ? SystemMouseCursors.click : MouseCursor.defer,
      onShowHoverHighlight: (value) => setState(() => _hover = value),
      onShowFocusHighlight: (value) => setState(() => _focused = value),
      actions: widget.onTap == null
          ? const <Type, Action<Intent>>{}
          : <Type, Action<Intent>>{
              ActivateIntent: CallbackAction<ActivateIntent>(
                onInvoke: (_) {
                  widget.onTap!();
                  return null;
                },
              ),
            },
      child: Semantics(
        button: widget.onTap != null,
        child: GestureDetector(
          onTap: widget.onTap,
          child: AnimatedContainer(
            duration: reduceMotion
                ? Duration.zero
                : const Duration(milliseconds: 200),
            curve: Curves.easeOut,
            padding: widget.padding,
            decoration: BoxDecoration(
              color: AppColors.surface,
              borderRadius: BorderRadius.circular(widget.radius),
              border: Border.all(
                color: active
                    ? AppColors.primary.withValues(alpha: 0.75)
                    : AppColors.border,
                width: _focused ? 2 : 1,
              ),
              boxShadow: widget.baseShadow,
            ),
            child: widget.child,
          ),
        ),
      ),
    );
  }
}

/// Rounded square icon tile with a tinted background — used on feature cards.
class IconTile extends StatelessWidget {
  const IconTile({
    super.key,
    required this.icon,
    this.color = AppColors.primary,
    this.background,
    this.size = 46,
  });
  final IconData icon;
  final Color color;
  final Color? background;
  final double size;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: size,
      height: size,
      decoration: BoxDecoration(
        color: background ?? color.withValues(alpha: 0.10),
        borderRadius: BorderRadius.circular(size * 0.3),
      ),
      child: Icon(icon, color: color, size: size * 0.5),
    );
  }
}

/// Keeps adjacent actions usable when the viewport narrows or text is zoomed.
/// Buttons share a row when there is room and become full-width stacked
/// controls otherwise, avoiding clipped labels and horizontal scrolling.
class ResponsiveActions extends StatelessWidget {
  const ResponsiveActions({
    super.key,
    required this.children,
    this.breakpoint = 520,
    this.spacing = 12,
  });

  final List<Widget> children;
  final double breakpoint;
  final double spacing;

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, constraints) {
        final zoomed = MediaQuery.textScalerOf(context).scale(14) > 20;
        final stack = constraints.maxWidth < breakpoint || zoomed;
        if (stack) {
          return Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              for (var i = 0; i < children.length; i++) ...[
                if (i > 0) SizedBox(height: spacing),
                children[i],
              ],
            ],
          );
        }
        return Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            for (var i = 0; i < children.length; i++) ...[
              if (i > 0) SizedBox(width: spacing),
              Expanded(child: children[i]),
            ],
          ],
        );
      },
    );
  }
}

/// A calm, shared orientation cue for the document-to-summary workflow.
/// It intentionally uses a single current-stage label rather than a cramped
/// horizontal stepper so it remains readable on small screens and at 200% zoom.
class WorkflowProgress extends StatelessWidget {
  const WorkflowProgress({
    super.key,
    required this.currentStep,
  }) : assert(currentStep >= 0 && currentStep < 4);

  final int currentStep;

  static const stages = [
    'Add document',
    'Check facts',
    'Answer questions',
    'Review summary',
  ];

  @override
  Widget build(BuildContext context) {
    final current = stages[currentStep];
    final next =
        currentStep + 1 < stages.length ? stages[currentStep + 1] : null;
    return Semantics(
      container: true,
      label: 'Step ${currentStep + 1} of ${stages.length}: $current'
          '${next == null ? '' : '. Next: $next'}',
      excludeSemantics: true,
      child: Container(
        width: double.infinity,
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: AppColors.primaryTint,
          borderRadius: BorderRadius.circular(AppRadii.md),
          border: Border.all(color: AppColors.border),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'STEP ${currentStep + 1} OF ${stages.length}',
              style: const TextStyle(
                color: AppColors.accentBright,
                fontSize: 16,
                fontWeight: FontWeight.w800,
                letterSpacing: 0.5,
              ),
            ),
            const SizedBox(height: 4),
            Text(
              current,
              style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w800),
            ),
            const SizedBox(height: 10),
            LinearProgressIndicator(
              value: (currentStep + 1) / stages.length,
              minHeight: 8,
              borderRadius: BorderRadius.circular(999),
              backgroundColor: AppColors.border,
              color: AppColors.accent,
            ),
            if (next != null) ...[
              const SizedBox(height: 8),
              Text(
                'Next: $next',
                style: const TextStyle(
                  fontSize: 16,
                  color: AppColors.textSecondary,
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }
}
