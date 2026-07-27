import 'package:claimhelper/services/mock_backend.dart';
import 'package:claimhelper/state/intake_controller.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('Full Case CTA preference is in-memory, bounded, and resettable', () {
    final controller = IntakeController(MockBackend());
    addTearDown(controller.dispose);

    expect(controller.state.requestedPurchaseKind, isNull);

    controller.setRequestedPurchaseKind('packet_plus');
    expect(controller.state.requestedPurchaseKind, 'packet_plus');

    // Query values cannot request arbitrary checkout kinds.
    controller.setRequestedPurchaseKind('anything_else');
    expect(controller.state.requestedPurchaseKind, 'packet_plus');

    controller.reset();
    expect(controller.state.requestedPurchaseKind, isNull);
  });
}
