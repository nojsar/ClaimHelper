import assert from "node:assert/strict";
import test from "node:test";

import { refundNeedsReconciliation } from "../payments";

test("only actionable pending/manual Stripe refunds enter scheduled reconciliation", () => {
  assert.equal(refundNeedsReconciliation({
    refundStatus: "pending",
    stripeRefundId: "re_pending123",
  }), true);
  assert.equal(refundNeedsReconciliation({
    refundStatus: "manual_review",
    stripeRefundId: "re_failed123",
  }), true);
  assert.equal(refundNeedsReconciliation({
    refundStatus: "refunded",
    stripeRefundId: "re_done123",
  }), false);
  assert.equal(refundNeedsReconciliation({
    refundStatus: "pending",
    stripeRefundId: "not-a-stripe-refund",
  }), false);
  assert.equal(refundNeedsReconciliation({
    refundStatus: "manual_review",
    stripeRefundId: null,
  }), false);
});
