import assert from "node:assert/strict";
import test from "node:test";

import {
  checkoutConfirmationStatus,
  stripeCheckoutCreationToken,
  stripeCheckoutSessionId,
} from "../payments";

test("checkout reconciliation accepts only bounded Stripe Checkout session ids", () => {
  assert.equal(
    stripeCheckoutSessionId("cs_live_12345678AbCd"),
    "cs_live_12345678AbCd",
  );
  assert.equal(
    stripeCheckoutSessionId("cs_test_12345678AbCd"),
    "cs_test_12345678AbCd",
  );
  assert.equal(stripeCheckoutSessionId("pi_123456789"), null);
  assert.equal(stripeCheckoutSessionId("cs_live_short"), null);
  assert.equal(stripeCheckoutSessionId("cs_live_12345678/path"), null);
  assert.equal(stripeCheckoutSessionId(null), null);
});

test("checkout creation metadata accepts only canonical random UUID tokens", () => {
  const token = "123e4567-e89b-42d3-a456-426614174000";
  assert.equal(stripeCheckoutCreationToken(token), token);
  assert.equal(
    stripeCheckoutCreationToken("123e4567-e89b-12d3-a456-426614174000"),
    null,
  );
  assert.equal(stripeCheckoutCreationToken("123e4567-e89b-42d3-c456-426614174000"), null);
  assert.equal(stripeCheckoutCreationToken("not-a-checkout-token"), null);
});

test("customer-return confirmation exposes only bounded payment states", () => {
  assert.equal(
    checkoutConfirmationStatus({ status: "complete", paymentStatus: "paid" }),
    "paid",
  );
  assert.equal(
    checkoutConfirmationStatus({ status: "complete", paymentStatus: "unpaid" }),
    "processing",
  );
  assert.equal(
    checkoutConfirmationStatus({ status: "expired", paymentStatus: "unpaid" }),
    "expired",
  );
  assert.equal(
    checkoutConfirmationStatus({ status: "open", paymentStatus: "unpaid" }),
    "open",
  );
  assert.equal(
    checkoutConfirmationStatus({ status: "invented", paymentStatus: "paid" }),
    "open",
  );
});
