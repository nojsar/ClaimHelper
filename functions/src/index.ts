import { initializeApp } from "firebase-admin/app";

initializeApp();

export { createCaseUploadSession, deleteCaseAndFiles, saveCase, deleteAccount } from "./cases";
export { prepareGuestCaseClaim, claimPreparedGuestCase } from "./case_claims";
export { updateCaseTracker } from "./case_tracker";
export { extractDenialFromUploadedFile } from "./extraction";
export { generateFreePreview } from "./preview";
export { generateAppealPacket, saveGuidedAnswers } from "./packet";
export {
  fulfillPaidPacket,
  repairPaidPacketFulfillment,
} from "./packet_fulfillment";
export { generateFollowUp } from "./followup";
export {
  confirmCheckoutSession,
  createCheckoutSession,
  reconcileStripeCheckouts,
  reconcileStripeRefunds,
  stripeWebhook,
} from "./payments";
export { saveReminderEmail } from "./reminders";
export { scheduledCleanupExpiredFiles } from "./cleanup";
export {
  setAdminAnalyticsExclusion,
  trackEvent,
  recordCaseFunnelEvent,
  recordCaseTierSelection,
  saveCaseAcquisitionAttribution,
  saveCaseFeedback,
} from "./analytics";
