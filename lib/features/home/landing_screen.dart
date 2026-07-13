import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../core/constants.dart';
import '../../core/theme.dart';
import '../../widgets/app_scaffold.dart';
import '../../widgets/ui.dart';

/// Award-quality marketing landing: gradient hero with a product preview,
/// how-it-works, what's-included, trust, pricing, and a closing CTA + footer.
class LandingScreen extends StatelessWidget {
  const LandingScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return AppScaffold(
      title: 'Insurance denial appeal assistant',
      maxWidth: double.infinity,
      child: SingleChildScrollView(
        child: Column(
          children: const [
            _Hero(),
            _LogosStrip(),
            _HowItWorks(),
            _WhatsIncluded(),
            _TrustBand(),
            _PricingTeaser(),
            _ClosingCta(),
            _Footer(),
          ],
        ),
      ),
    );
  }
}

/// Centers section content to a max width with consistent horizontal padding.
/// [fillViewport] stretches the section to roughly one screen height and
/// centers its content, so one scroll gesture reveals one segment at a time.
class _Section extends StatelessWidget {
  const _Section({
    required this.child,
    this.padding = const EdgeInsets.symmetric(horizontal: 24, vertical: 96),
    this.color,
    this.gradient,
    this.fillViewport = false,
  });
  final Widget child;
  final EdgeInsets padding;
  final Color? color;
  final Gradient? gradient;
  final bool fillViewport;

  @override
  Widget build(BuildContext context) {
    final minH = fillViewport ? MediaQuery.sizeOf(context).height - 66 : 0.0;
    return Container(
      width: double.infinity,
      constraints: BoxConstraints(minHeight: minH),
      alignment: Alignment.center,
      decoration: BoxDecoration(color: color, gradient: gradient),
      child: Padding(
        padding: padding,
        child: Center(
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 1120),
            child: child,
          ),
        ),
      ),
    );
  }
}

class _Hero extends StatelessWidget {
  const _Hero();

  @override
  Widget build(BuildContext context) {
    final wide = MediaQuery.sizeOf(context).width > 940;

    final copy = Column(
      crossAxisAlignment:
          wide ? CrossAxisAlignment.start : CrossAxisAlignment.center,
      children: [
        const PillBadge(
          label: 'Denied medication & prior-auth appeals',
          icon: Icons.bolt_rounded,
        ),
        const SizedBox(height: 22),
        Semantics(
          header: true,
          child: Text.rich(
            TextSpan(
              style: TextStyle(
                fontSize: wide ? 52 : 38,
                fontWeight: FontWeight.w800,
                height: 1.08,
                letterSpacing: -1.4,
                color: AppColors.textPrimary,
              ),
              children: [
                const TextSpan(text: 'Turn a denial letter into a '),
                TextSpan(
                  text: 'ready-to-send appeal',
                  style: TextStyle(
                    foreground: Paint()
                      ..shader = AppGradients.accentText
                          .createShader(const Rect.fromLTWH(0, 0, 420, 60)),
                  ),
                ),
                const TextSpan(text: ' in 15 minutes.'),
              ],
            ),
            textAlign: wide ? TextAlign.start : TextAlign.center,
          ),
        ),
        const SizedBox(height: 20),
        ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 520),
          child: Text(
            AppCopy.subTagline,
            textAlign: wide ? TextAlign.start : TextAlign.center,
            style: const TextStyle(
                fontSize: 17.5, height: 1.6, color: AppColors.textSecondary),
          ),
        ),
        const SizedBox(height: 30),
        Wrap(
          spacing: 14,
          runSpacing: 14,
          alignment: wide ? WrapAlignment.start : WrapAlignment.center,
          children: [
            FilledButton.icon(
              onPressed: () => context.go('/upload'),
              icon: const Icon(Icons.auto_awesome_rounded, size: 20),
              label: const Text('Start your appeal packet'),
            ),
            OutlinedButton.icon(
              onPressed: () => context.go('/account'),
              icon: const Icon(Icons.folder_open_rounded, size: 20),
              label: const Text('My saved cases'),
            ),
          ],
        ),
        const SizedBox(height: 26),
        Wrap(
          spacing: 22,
          runSpacing: 10,
          alignment: wide ? WrapAlignment.start : WrapAlignment.center,
          children: const [
            _TrustPoint(
                icon: Icons.lock_outline_rounded, text: 'Private & encrypted'),
            _TrustPoint(
                icon: Icons.schedule_rounded, text: 'Auto-deletes in 24h'),
            _TrustPoint(
                icon: Icons.description_outlined,
                text: 'You review before sending'),
          ],
        ),
      ],
    );

    const visual = _PacketPreview();

    return _Section(
      gradient: AppGradients.heroWash,
      padding: EdgeInsets.fromLTRB(24, wide ? 96 : 84, 24, 72),
      child: wide
          ? Row(
              crossAxisAlignment: CrossAxisAlignment.center,
              children: [
                Expanded(flex: 6, child: copy),
                const SizedBox(width: 48),
                Expanded(flex: 5, child: visual),
              ],
            )
          : Column(children: [copy, const SizedBox(height: 44), visual]),
    );
  }
}

class _TrustPoint extends StatelessWidget {
  const _TrustPoint({required this.icon, required this.text});
  final IconData icon;
  final String text;

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Icon(icon, size: 17, color: AppColors.accent),
        const SizedBox(width: 7),
        Text(text,
            style: const TextStyle(
                fontSize: 13.5,
                fontWeight: FontWeight.w600,
                color: AppColors.textSecondary)),
      ],
    );
  }
}

/// A stylized preview of the generated appeal packet — sells the outcome.
class _PacketPreview extends StatelessWidget {
  const _PacketPreview();

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(AppRadii.xl),
        border: Border.all(color: AppColors.border),
        boxShadow: AppShadows.lifted,
      ),
      padding: const EdgeInsets.all(22),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const IconTile(icon: Icons.description_rounded, size: 42),
              const SizedBox(width: 12),
              const Flexible(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('Appeal packet',
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(
                            fontWeight: FontWeight.w800, fontSize: 15.5)),
                    Text('Step-therapy exception',
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(
                            fontSize: 12.5, color: AppColors.textMuted)),
                  ],
                ),
              ),
              const SizedBox(width: 8),
              const Spacer(),
              const PillBadge(
                label: 'Ready',
                icon: Icons.check_circle_rounded,
                color: AppColors.accent,
              ),
            ],
          ),
          const SizedBox(height: 18),
          const _FakeLine(widthFactor: 1),
          const _FakeLine(widthFactor: 0.92),
          const _FakeLine(widthFactor: 0.72),
          const SizedBox(height: 16),
          Container(height: 1, color: AppColors.border),
          const SizedBox(height: 16),
          ...[
            'Appeal letter draft',
            'Evidence checklist',
            'Doctor letter request',
            'Insurer call script',
          ].map((t) => Padding(
                padding: const EdgeInsets.only(bottom: 11),
                child: Row(
                  children: [
                    const Icon(Icons.check_circle_rounded,
                        size: 18, color: AppColors.accent),
                    const SizedBox(width: 10),
                    Text(t,
                        style: const TextStyle(
                            fontSize: 13.5,
                            fontWeight: FontWeight.w600,
                            color: AppColors.textPrimary)),
                  ],
                ),
              )),
          const SizedBox(height: 6),
          Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: AppColors.accentTint,
              borderRadius: BorderRadius.circular(AppRadii.md),
            ),
            child: Row(
              children: const [
                Icon(Icons.savings_outlined, size: 18, color: AppColors.accent),
                SizedBox(width: 10),
                Text('\$1,349 at stake',
                    style: TextStyle(
                        fontWeight: FontWeight.w800,
                        color: AppColors.accent,
                        fontSize: 13.5)),
                Spacer(),
                Text('PDF ready',
                    style: TextStyle(
                        fontSize: 12.5, color: AppColors.textSecondary)),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _FakeLine extends StatelessWidget {
  const _FakeLine({required this.widthFactor});
  final double widthFactor;
  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 9),
      child: FractionallySizedBox(
        alignment: Alignment.centerLeft,
        widthFactor: widthFactor,
        child: Container(
          height: 9,
          decoration: BoxDecoration(
            color: AppColors.surfaceAlt,
            borderRadius: BorderRadius.circular(6),
          ),
        ),
      ),
    );
  }
}

class _LogosStrip extends StatelessWidget {
  const _LogosStrip();
  @override
  Widget build(BuildContext context) {
    return _Section(
      color: AppColors.surface,
      padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 26),
      child: Wrap(
        alignment: WrapAlignment.center,
        crossAxisAlignment: WrapCrossAlignment.center,
        spacing: 30,
        runSpacing: 14,
        children: const [
          _StatChip(value: 'ADHD', label: 'medications'),
          _Dot(),
          _StatChip(value: 'GLP-1', label: 'weight-loss'),
          _Dot(),
          _StatChip(value: 'Prior auth', label: 'denials'),
          _Dot(),
          _StatChip(value: 'Step therapy', label: 'exceptions'),
          _Dot(),
          _StatChip(value: 'Specialty', label: '& mental-health'),
        ],
      ),
    );
  }
}

class _StatChip extends StatelessWidget {
  const _StatChip({required this.value, required this.label});
  final String value;
  final String label;
  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Text(value,
            style: const TextStyle(
                fontWeight: FontWeight.w800,
                color: AppColors.textPrimary,
                fontSize: 14.5)),
        const SizedBox(width: 6),
        Text(label,
            style: const TextStyle(color: AppColors.textMuted, fontSize: 14.5)),
      ],
    );
  }
}

class _Dot extends StatelessWidget {
  const _Dot();
  @override
  Widget build(BuildContext context) => Container(
        width: 4,
        height: 4,
        decoration: const BoxDecoration(
            color: AppColors.borderStrong, shape: BoxShape.circle),
      );
}

class _HowItWorks extends StatelessWidget {
  const _HowItWorks();

  static const _steps = [
    (
      '01',
      Icons.file_upload_outlined,
      'Upload',
      'Add your denial letter, EOB, or prior-auth denial — PDF or a photo.'
    ),
    (
      '02',
      Icons.fact_check_outlined,
      'Review the facts',
      'We extract the key details. You check and correct them in seconds.'
    ),
    (
      '03',
      Icons.forum_outlined,
      'Answer a few questions',
      'Quick prompts tailor the appeal to your plan and situation.'
    ),
    (
      '04',
      Icons.workspace_premium_outlined,
      'Get your packet',
      'Appeal letter, checklists, a call script, and a polished PDF.'
    ),
  ];

  @override
  Widget build(BuildContext context) {
    return _Section(
      fillViewport: true,
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          const SectionHeader(
            eyebrow: 'How it works',
            title: 'From denial to appeal in four steps',
            subtitle:
                'No jargon, no legalese. A calm, guided flow that does the '
                'paperwork for you — you stay in control.',
          ),
          const SizedBox(height: 44),
          LayoutBuilder(builder: (context, c) {
            final cols = c.maxWidth > 860 ? 4 : (c.maxWidth > 520 ? 2 : 1);
            return Wrap(
              spacing: 20,
              runSpacing: 20,
              alignment: WrapAlignment.center,
              children: [
                for (var i = 0; i < _steps.length; i++)
                  SizedBox(
                    width: (c.maxWidth - (cols - 1) * 20) / cols,
                    child: HoverCard(
                      padding: const EdgeInsets.all(24),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Row(
                            children: [
                              IconTile(icon: _steps[i].$2),
                              const Spacer(),
                              Text(_steps[i].$1,
                                  style: const TextStyle(
                                      fontSize: 22,
                                      fontWeight: FontWeight.w800,
                                      color: AppColors.border)),
                            ],
                          ),
                          const SizedBox(height: 18),
                          Text(_steps[i].$3,
                              style: const TextStyle(
                                  fontSize: 16.5,
                                  fontWeight: FontWeight.w700,
                                  color: AppColors.textPrimary)),
                          const SizedBox(height: 8),
                          Text(_steps[i].$4,
                              style: const TextStyle(
                                  fontSize: 13.5,
                                  height: 1.5,
                                  color: AppColors.textSecondary)),
                        ],
                      ),
                    ),
                  ),
              ],
            );
          }),
        ],
      ),
    );
  }
}

class _WhatsIncluded extends StatelessWidget {
  const _WhatsIncluded();

  static const _items = [
    (
      Icons.article_outlined,
      'Plain-English summary',
      'Understand exactly why you were denied — in words that make sense.'
    ),
    (
      Icons.draw_outlined,
      'Appeal letter draft',
      'A careful, professional letter citing your plan\'s own denial reason.'
    ),
    (
      Icons.checklist_rounded,
      'Evidence checklist',
      'Know precisely what to attach and why each item strengthens your case.'
    ),
    (
      Icons.medical_information_outlined,
      'Doctor letter request',
      'A ready draft to hand your prescriber for a supporting statement.'
    ),
    (
      Icons.call_outlined,
      'Insurer call script',
      'Word-for-word talking points so the phone call is stress-free.'
    ),
    (
      Icons.event_available_outlined,
      'Deadline tracker',
      'Every date and task laid out so you never miss your appeal window.'
    ),
  ];

  @override
  Widget build(BuildContext context) {
    return _Section(
      color: AppColors.surfaceAlt,
      fillViewport: true,
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          const SectionHeader(
            eyebrow: 'Everything you get',
            title: 'A complete, submit-ready appeal packet',
            subtitle:
                'Not a template dump — a tailored set of documents built from '
                'your denial and your answers.',
          ),
          const SizedBox(height: 44),
          LayoutBuilder(builder: (context, c) {
            final cols = c.maxWidth > 860 ? 3 : (c.maxWidth > 540 ? 2 : 1);
            return Wrap(
              spacing: 20,
              runSpacing: 20,
              children: [
                for (final it in _items)
                  SizedBox(
                    width: (c.maxWidth - (cols - 1) * 20) / cols,
                    child: HoverCard(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          IconTile(
                            icon: it.$1,
                            color: AppColors.accent,
                            background: AppColors.accentTint,
                          ),
                          const SizedBox(height: 16),
                          Text(it.$2,
                              style: const TextStyle(
                                  fontSize: 16, fontWeight: FontWeight.w700)),
                          const SizedBox(height: 7),
                          Text(it.$3,
                              style: const TextStyle(
                                  fontSize: 13.5,
                                  height: 1.5,
                                  color: AppColors.textSecondary)),
                        ],
                      ),
                    ),
                  ),
              ],
            );
          }),
        ],
      ),
    );
  }
}

class _TrustBand extends StatelessWidget {
  const _TrustBand();

  @override
  Widget build(BuildContext context) {
    final wide = MediaQuery.sizeOf(context).width > 820;
    final bullets = Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        for (final b in AppCopy.privacyBullets)
          Padding(
            padding: const EdgeInsets.only(bottom: 14),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Icon(Icons.check_circle_rounded,
                    size: 20, color: AppColors.accent),
                const SizedBox(width: 12),
                Expanded(
                  child: Text(b,
                      style: const TextStyle(
                          fontSize: 15,
                          height: 1.45,
                          color: AppColors.textPrimary)),
                ),
              ],
            ),
          ),
      ],
    );

    final heading = Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const PillBadge(
            label: 'Privacy first', icon: Icons.lock_outline_rounded),
        const SizedBox(height: 18),
        const Text('Your health data stays yours',
            style: TextStyle(
                fontSize: 30,
                fontWeight: FontWeight.w800,
                letterSpacing: -0.6,
                height: 1.15)),
        const SizedBox(height: 14),
        const Text(
          'GetMyYes is a document drafting assistant — not medical, legal, '
          'or insurance advice. We never train AI on your documents, and you '
          'review everything before it\'s sent.',
          style: TextStyle(
              fontSize: 15.5, height: 1.6, color: AppColors.textSecondary),
        ),
      ],
    );

    return _Section(
      fillViewport: true,
      child: Container(
        padding: EdgeInsets.all(wide ? 44 : 28),
        decoration: BoxDecoration(
          color: AppColors.primaryTint,
          borderRadius: BorderRadius.circular(AppRadii.xl),
          border: Border.all(color: AppColors.primary.withValues(alpha: 0.12)),
        ),
        child: wide
            ? Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Expanded(child: heading),
                  const SizedBox(width: 48),
                  Expanded(child: bullets),
                ],
              )
            : Column(children: [heading, const SizedBox(height: 28), bullets]),
      ),
    );
  }
}

class _PricingTeaser extends StatelessWidget {
  const _PricingTeaser();

  @override
  Widget build(BuildContext context) {
    final wide = MediaQuery.sizeOf(context).width > 720;
    return _Section(
      color: AppColors.surfaceAlt,
      fillViewport: true,
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          const SectionHeader(
            eyebrow: 'Simple pricing',
            title: 'Free to preview. \$39 for the full packet.',
            subtitle:
                'See your denial type, what\'s at stake, and your likely appeal '
                'path before you pay a cent.',
          ),
          const SizedBox(height: 40),
          if (wide)
            IntrinsicHeight(
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: const [
                  Expanded(child: _FreePriceCard()),
                  SizedBox(width: 20),
                  Expanded(child: _PaidPriceCard()),
                ],
              ),
            )
          else
            Column(
              children: const [
                _FreePriceCard(),
                SizedBox(height: 20),
                _PaidPriceCard(),
              ],
            ),
        ],
      ),
    );
  }
}

class _FreePriceCard extends StatelessWidget {
  const _FreePriceCard();
  @override
  Widget build(BuildContext context) => const _PriceCard(
        title: 'Free preview',
        price: '\$0',
        blurb: 'Upload and see where you stand.',
        features: [
          'Denial type identified',
          'Amount at stake',
          'Recommended appeal path',
          'Missing info checklist',
        ],
        highlighted: false,
      );
}

class _PaidPriceCard extends StatelessWidget {
  const _PaidPriceCard();
  @override
  Widget build(BuildContext context) => const _PriceCard(
        title: 'Full appeal packet',
        price: '\$39',
        blurb: 'Everything you need to submit.',
        features: [
          'Appeal letter draft',
          'Evidence checklist',
          'Doctor letter request',
          'Insurer call script',
          'Deadline tracker + PDF export',
        ],
        highlighted: true,
      );
}

class _PriceCard extends StatelessWidget {
  const _PriceCard({
    required this.title,
    required this.price,
    required this.blurb,
    required this.features,
    required this.highlighted,
  });
  final String title;
  final String price;
  final String blurb;
  final List<String> features;
  final bool highlighted;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(28),
      decoration: BoxDecoration(
        gradient: highlighted ? AppGradients.cta : null,
        color: highlighted ? null : AppColors.surface,
        borderRadius: BorderRadius.circular(AppRadii.xl),
        border: Border.all(
            color: highlighted ? Colors.transparent : AppColors.border),
        boxShadow: highlighted ? AppShadows.lifted : AppShadows.subtle,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Text(title,
                  style: TextStyle(
                      fontSize: 15,
                      fontWeight: FontWeight.w700,
                      color: highlighted
                          ? Colors.white.withValues(alpha: 0.9)
                          : AppColors.textSecondary)),
              const Spacer(),
              if (highlighted)
                const PillBadge(
                  label: 'Most popular',
                  color: Colors.white,
                  background: Color(0x33FFFFFF),
                ),
            ],
          ),
          const SizedBox(height: 14),
          Row(
            crossAxisAlignment: CrossAxisAlignment.baseline,
            textBaseline: TextBaseline.alphabetic,
            children: [
              Text(price,
                  style: TextStyle(
                      fontSize: 42,
                      fontWeight: FontWeight.w800,
                      letterSpacing: -1.5,
                      color:
                          highlighted ? Colors.white : AppColors.textPrimary)),
              const SizedBox(width: 8),
              Flexible(
                child: Text(blurb,
                    maxLines: 2,
                    style: TextStyle(
                        fontSize: 13.5,
                        color: highlighted
                            ? Colors.white.withValues(alpha: 0.85)
                            : AppColors.textMuted)),
              ),
            ],
          ),
          const SizedBox(height: 20),
          ...features.map((f) => Padding(
                padding: const EdgeInsets.only(bottom: 11),
                child: Row(
                  children: [
                    Icon(Icons.check_circle_rounded,
                        size: 19,
                        color: highlighted ? Colors.white : AppColors.accent),
                    const SizedBox(width: 10),
                    Expanded(
                      child: Text(f,
                          style: TextStyle(
                              fontSize: 14.5,
                              color: highlighted
                                  ? Colors.white
                                  : AppColors.textPrimary)),
                    ),
                  ],
                ),
              )),
          const SizedBox(height: 18),
          SizedBox(
            width: double.infinity,
            child: highlighted
                ? FilledButton(
                    onPressed: () => context.go('/upload'),
                    style: FilledButton.styleFrom(
                      backgroundColor: Colors.white,
                      foregroundColor: AppColors.primaryDark,
                    ),
                    child: const Text('Start your appeal'),
                  )
                : OutlinedButton(
                    onPressed: () => context.go('/upload'),
                    child: const Text('Upload for free'),
                  ),
          ),
        ],
      ),
    );
  }
}

class _ClosingCta extends StatelessWidget {
  const _ClosingCta();

  @override
  Widget build(BuildContext context) {
    return _Section(
      padding: const EdgeInsets.fromLTRB(24, 40, 24, 96),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 32, vertical: 56),
        decoration: BoxDecoration(
          gradient: AppGradients.cta,
          borderRadius: BorderRadius.circular(AppRadii.xl),
          boxShadow: AppShadows.lifted,
        ),
        child: Column(
          children: [
            const Text('Denied doesn\'t mean the end.',
                textAlign: TextAlign.center,
                style: TextStyle(
                    fontSize: 30,
                    fontWeight: FontWeight.w800,
                    letterSpacing: -0.7,
                    color: Colors.white)),
            const SizedBox(height: 12),
            Text('Most denials can be appealed. Start yours in minutes.',
                textAlign: TextAlign.center,
                style: TextStyle(
                    fontSize: 16,
                    height: 1.5,
                    color: Colors.white.withValues(alpha: 0.9))),
            const SizedBox(height: 26),
            FilledButton.icon(
              onPressed: () => context.go('/upload'),
              style: FilledButton.styleFrom(
                backgroundColor: Colors.white,
                foregroundColor: AppColors.primaryDark,
                padding:
                    const EdgeInsets.symmetric(horizontal: 30, vertical: 18),
              ),
              icon: const Icon(Icons.auto_awesome_rounded),
              label: const Text('Start appeal packet'),
            ),
          ],
        ),
      ),
    );
  }
}

class _Footer extends StatelessWidget {
  const _Footer();

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      color: AppColors.ink,
      child: Center(
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 1120),
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 40),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  mainAxisSize: MainAxisSize.min,
                  children: const [
                    BrandMark(size: 28),
                    SizedBox(width: 10),
                    Text('GetMyYes',
                        style: TextStyle(
                            color: Colors.white,
                            fontWeight: FontWeight.w800,
                            fontSize: 18)),
                  ],
                ),
                const SizedBox(height: 16),
                Text(
                  AppCopy.disclaimer,
                  style: TextStyle(
                      fontSize: 12.5,
                      height: 1.6,
                      color: Colors.white.withValues(alpha: 0.65)),
                ),
                const SizedBox(height: 20),
                Container(
                    height: 1, color: Colors.white.withValues(alpha: 0.12)),
                const SizedBox(height: 16),
                Wrap(
                  spacing: 20,
                  runSpacing: 8,
                  crossAxisAlignment: WrapCrossAlignment.center,
                  children: [
                    Text(
                        '© ${DateTime.now().year} GetMyYes · U.S. only at launch',
                        style: TextStyle(
                            fontSize: 12.5,
                            color: Colors.white.withValues(alpha: 0.55))),
                    _FooterLink('Privacy', () => context.go('/settings')),
                    _FooterLink('My cases', () => context.go('/account')),
                    _FooterLink('Start appeal', () => context.go('/upload')),
                  ],
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _FooterLink extends StatelessWidget {
  const _FooterLink(this.label, this.onTap);
  final String label;
  final VoidCallback onTap;
  @override
  Widget build(BuildContext context) {
    return TextButton(
      onPressed: onTap,
      style: TextButton.styleFrom(
        foregroundColor: Colors.white.withValues(alpha: 0.8),
        padding: const EdgeInsets.symmetric(horizontal: 4),
        minimumSize: Size.zero,
        textStyle: const TextStyle(fontSize: 12.5, fontWeight: FontWeight.w600),
      ),
      child: Text(label),
    );
  }
}
