import 'package:firebase_auth/firebase_auth.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'app_router.dart';
import 'core/constants.dart';
import 'core/theme.dart';
import 'firebase_options.dart';
import 'services/analytics.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();

  // In mock mode the app runs fully in-memory — skip Firebase init so it boots
  // without a configured project. Otherwise initialize Firebase normally.
  if (!kUseMocks) {
    try {
      await Firebase.initializeApp(
        options: DefaultFirebaseOptions.currentPlatform,
      );
    } catch (e) {
      // Surfaced by the app-level banner; the app still renders so the user
      // isn't staring at a blank screen if config is missing.
      debugPrint('Firebase init failed: $e');
    }
  }

  if (kIsWeb) {
    // Hold the initial visit/boot/pageview in the shared web tracker until
    // Firebase restores the signed-in user. Owner traffic is dropped locally
    // before any beacon and a verified endpoint installs an HttpOnly backup
    // exclusion cookie. Token refreshes renew that cookie without ever adding
    // the token or uid to analytics data.
    if (!kUseMocks && Firebase.apps.isNotEmpty) {
      FirebaseAuth.instance.idTokenChanges().listen((user) async {
        if (user?.uid != kAdminUid) {
          resolveAnalyticsAuth();
          return;
        }
        // Fail closed immediately while the token is being refreshed.
        excludeAdminAnalytics(null);
        try {
          excludeAdminAnalytics(await user!.getIdToken());
        } catch (_) {
          // Local suppression remains active even if token retrieval is offline.
        }
      });
    } else {
      // Demo mode or a failed Firebase bootstrap must not delay normal traffic.
      resolveAnalyticsAuth();
    }

    // Cookieless pageview counter (see services/analytics.dart). The initial
    // page load was already counted as a `visit` by index.html, so seed the
    // dedupe with the boot route and only report subsequent changes.
    var lastPath = Uri.base.fragment.isNotEmpty ? Uri.base.fragment : '/';
    appRouter.routerDelegate.addListener(() {
      final path = appRouter.routerDelegate.currentConfiguration.uri.toString();
      if (path != lastPath) {
        lastPath = path;
        trackPageview(path);
      }
    });
  }

  runApp(const ProviderScope(child: GetMyYesApp()));
}

class GetMyYesApp extends StatelessWidget {
  const GetMyYesApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp.router(
      title: AppCopy.appName,
      debugShowCheckedModeBanner: false,
      theme: buildAppTheme(),
      darkTheme: buildAppTheme(brightness: Brightness.dark),
      // Follows the system appearance, like the getmyyes.com landing page.
      themeMode: ThemeMode.system,
      routerConfig: appRouter,
    );
  }
}
