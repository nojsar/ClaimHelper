import 'package:firebase_core/firebase_core.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'app_router.dart';
import 'core/constants.dart';
import 'core/theme.dart';
import 'firebase_options.dart';

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

  runApp(const ProviderScope(child: ClaimHelperApp()));
}

class ClaimHelperApp extends StatelessWidget {
  const ClaimHelperApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp.router(
      title: AppCopy.appName,
      debugShowCheckedModeBanner: false,
      theme: buildAppTheme(),
      routerConfig: appRouter,
    );
  }
}
