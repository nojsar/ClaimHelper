import { initializeApp } from "firebase-admin/app";

initializeApp();

export { createCaseUploadSession, deleteCaseAndFiles, saveCase, deleteAccount } from "./cases";
export { prepareGuestCaseClaim, claimPreparedGuestCase } from "./case_claims";
export { updateCaseTracker } from "./case_tracker";
export { extractDenialFromUploadedFile } from "./extraction";
export { generateFreePreview } from "./preview";
export { generateAppealPacket, saveGuidedAnswers } from "./packet";
export { generateFollowUp } from "./followup";
export { createCheckoutSession, stripeWebhook } from "./payments";
export { saveReminderEmail } from "./reminders";
export { scheduledCleanupExpiredFiles } from "./cleanup";
export { setAdminAnalyticsExclusion, trackEvent } from "./analytics";
