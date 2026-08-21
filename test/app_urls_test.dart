import 'package:claimhelper/core/constants.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('public app links use direct canonical HTTPS URLs', () {
    const urls = <String>[
      AppUrls.terms,
      AppUrls.accuracyGuarantee,
      AppUrls.privacy,
      AppUrls.accessibility,
      AppUrls.insurerDenialRates,
      AppUrls.externalReview,
    ];

    for (final value in urls) {
      final url = Uri.parse(value);
      expect(url.scheme, 'https', reason: value);
      expect(url.host, 'getmyyes.com', reason: value);
      expect(url.path.endsWith('.html'), isFalse, reason: value);
    }
  });
}
