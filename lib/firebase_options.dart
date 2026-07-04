// Firebase configuration for project claimhelper-38152.
//
// Android values below are REAL (from google-services.json). The Web values
// are partially filled from the project; the two fields marked TODO must come
// from your Web app registration in the Firebase console:
//   Console → Project settings → Your apps → Web app → SDK setup and config
// Copy `apiKey` and `appId` into `web` below. Or regenerate this whole file
// automatically with:
//   dart pub global activate flutterfire_cli
//   flutterfire configure --project claimhelper-38152
//
// Run the app with no backend at all (no Firebase needed):
//   flutter run -d chrome --dart-define=USE_MOCKS=true
import 'package:firebase_core/firebase_core.dart' show FirebaseOptions;
import 'package:flutter/foundation.dart'
    show defaultTargetPlatform, kIsWeb, TargetPlatform;

class DefaultFirebaseOptions {
  static FirebaseOptions get currentPlatform {
    if (kIsWeb) return web;
    switch (defaultTargetPlatform) {
      case TargetPlatform.android:
        return android;
      case TargetPlatform.iOS:
        return ios;
      default:
        return web;
    }
  }

  // Real Android configuration (from google-services.json).
  static const FirebaseOptions android = FirebaseOptions(
    apiKey: 'AIzaSyCiDPogOIIAo8LjeTezTa5SLQKFPFOauUY',
    appId: '1:267339997414:android:3df67284ccf2bb49ce5b27',
    messagingSenderId: '267339997414',
    projectId: 'claimhelper-38152',
    storageBucket: 'claimhelper-38152.firebasestorage.app',
  );

  // Real Web configuration (from the Firebase console Web app).
  static const FirebaseOptions web = FirebaseOptions(
    apiKey: 'AIzaSyCMaCv7F39u7dUh_U6Rd_cmvaDmj4OecP0',
    appId: '1:267339997414:web:3da42666bc24ca9dce5b27',
    messagingSenderId: '267339997414',
    projectId: 'claimhelper-38152',
    authDomain: 'claimhelper-38152.firebaseapp.com',
    storageBucket: 'claimhelper-38152.firebasestorage.app',
  );

  // iOS — set up later (rerun flutterfire configure once the iOS app exists).
  static const FirebaseOptions ios = FirebaseOptions(
    apiKey: 'TODO_IOS_API_KEY',
    appId: 'TODO_IOS_APP_ID',
    messagingSenderId: '267339997414',
    projectId: 'claimhelper-38152',
    storageBucket: 'claimhelper-38152.firebasestorage.app',
    iosBundleId: 'com.nojus.claimhelper',
  );
}
