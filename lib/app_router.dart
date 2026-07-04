import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import 'features/account/account_screen.dart';
import 'features/extraction/extraction_review_screen.dart';
import 'features/guided/guided_questions_screen.dart';
import 'features/home/landing_screen.dart';
import 'features/packet/appeal_packet_screen.dart';
import 'features/preview/preview_paywall_screen.dart';
import 'features/preview/purchase_success_screen.dart';
import 'features/processing/processing_screen.dart';
import 'features/settings/settings_screen.dart';
import 'features/upload/upload_screen.dart';

final appRouter = GoRouter(
  initialLocation: '/',
  routes: [
    GoRoute(path: '/', builder: (_, __) => const LandingScreen()),
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
  ],
  errorBuilder: (_, state) => Scaffold(
    body: Center(child: Text('Page not found: ${state.uri}')),
  ),
);
