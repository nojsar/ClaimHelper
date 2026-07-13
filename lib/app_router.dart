import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:url_launcher/url_launcher.dart';

import 'core/theme.dart';
import 'features/account/account_screen.dart';
import 'features/admin/stats_screen.dart';
import 'features/extraction/extraction_review_screen.dart';
import 'features/guided/guided_questions_screen.dart';
import 'features/home/landing_screen.dart';
import 'features/packet/appeal_packet_screen.dart';
import 'features/preview/preview_paywall_screen.dart';
import 'features/preview/purchase_success_screen.dart';
import 'features/processing/processing_screen.dart';
import 'features/settings/settings_screen.dart';
import 'features/upload/upload_screen.dart';
import 'widgets/app_scaffold.dart';

final appRouter = GoRouter(
  initialLocation: '/',
  routes: [
    // getmyyes.com has ONE homepage: the static Case File landing that
    // index.html serves before the app boots. On web, the app's own root
    // route hands the visitor back to it (full page return) instead of
    // rendering a duplicate in-app marketing home. Mobile builds, which
    // have no static landing, keep the in-app LandingScreen.
    GoRoute(
      path: '/',
      builder: (_, __) =>
          kIsWeb ? const _ExitToLanding() : const LandingScreen(),
    ),
    GoRoute(path: '/upload', builder: (_, __) => const UploadScreen()),
    GoRoute(
      path: '/processing',
      builder: (_, __) => const ProcessingScreen(),
    ),
    GoRoute(
      path: '/case/:caseId/review',
      builder: (_, s) =>
          ExtractionReviewScreen(caseId: s.pathParameters['caseId']!),
    ),
    GoRoute(
      path: '/case/:caseId/questions',
      builder: (_, s) =>
          GuidedQuestionsScreen(caseId: s.pathParameters['caseId']!),
    ),
    GoRoute(
      path: '/case/:caseId/preview',
      builder: (_, s) =>
          PreviewPaywallScreen(caseId: s.pathParameters['caseId']!),
    ),
    GoRoute(
      path: '/case/:caseId/purchase-success',
      builder: (_, s) => PurchaseSuccessScreen(
        caseId: s.pathParameters['caseId']!,
        sessionId: s.uri.queryParameters['session_id'],
      ),
    ),
    GoRoute(
      path: '/case/:caseId/packet',
      builder: (_, s) =>
          AppealPacketScreen(caseId: s.pathParameters['caseId']!),
    ),
    GoRoute(path: '/account', builder: (_, __) => const AccountScreen()),
    GoRoute(path: '/settings', builder: (_, __) => const SettingsScreen()),
    // Owner-only traffic dashboard; Firestore rules gate the data itself.
    GoRoute(path: '/stats', builder: (_, __) => const StatsScreen()),
  ],
  errorBuilder: (context, state) => AppScaffold(
    title: 'Page not found',
    child: Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Semantics(
              header: true,
              child: Text(
                'Page not found',
                textAlign: TextAlign.center,
                style: TextStyle(fontSize: 24, fontWeight: FontWeight.w800),
              ),
            ),
            const SizedBox(height: 8),
            Text(
              'We could not find ${state.uri.path}.',
              textAlign: TextAlign.center,
              style: const TextStyle(color: AppColors.textSecondary),
            ),
            const SizedBox(height: 20),
            FilledButton(
              onPressed: () => context.go('/'),
              child: const Text('Go to home page'),
            ),
          ],
        ),
      ),
    ),
  ),
);

/// Web-only: leaving the app toward `/` performs a full navigation to the
/// site origin WITHOUT the `#/` hash, so index.html shows the real landing
/// instead of re-booting the app.
class _ExitToLanding extends StatefulWidget {
  const _ExitToLanding();

  @override
  State<_ExitToLanding> createState() => _ExitToLandingState();
}

class _ExitToLandingState extends State<_ExitToLanding> {
  @override
  void initState() {
    super.initState();
    launchUrl(Uri.parse('${Uri.base.origin}/'), webOnlyWindowName: '_self');
  }

  @override
  Widget build(BuildContext context) {
    return Title(
      color: AppColors.primary,
      title: 'Returning home | GetMyYes',
      child: Scaffold(
        backgroundColor: AppColors.background,
        body: Center(
          child: Semantics(
            scopesRoute: true,
            namesRoute: true,
            liveRegion: true,
            label: 'Returning to the GetMyYes home page',
            child: const CircularProgressIndicator(color: AppColors.primary),
          ),
        ),
      ),
    );
  }
}
