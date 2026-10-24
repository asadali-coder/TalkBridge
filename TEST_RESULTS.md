# Validation report — 24 October 2026

## Passed

- Backend strict TypeScript production build (`npm run build`).
- Frontend ESLint (`npm run lint`), TypeScript and Vite production build (`npm run build`).
- Lockfile dependencies match each package manifest; the broken parent-directory dependency is removed.
- Eight backend integration tests using a real, isolated temporary MongoDB:
  1. Authentication, normalized email, duplicate signup, safe responses and invalid IDs.
  2. Text delivery, multiple sender tabs, unread counts, populated replies, read receipts, cross-conversation reply rejection, sender-only deletion and authenticated typing identity.
  3. Image/voice payload validation, upload handling and preserved audio MIME type.
  4. Immediate first-violation bans, blocked parallel sends, 24-hour expiry and sending after expiry.
  5. Unread-message deletion counters and multipart profile-photo/name updates.
  6. Recipient-only delivery acknowledgement, persisted sent/delivered/read flags and partial read counters.
  7. Mocked Gemini 429 sends normal messages and replies with a warning, while local profanity immediately triggers a ban.
  8. One violation blocks all recipients/media, notifies every tab, persists through login, keeps the offending message out of history and allows sending after expiry.
- Seven moderation regression tests cover fresh IPv4 attempts, reset retry, recovery without restart, HTTP rejection, invalid responses, local/AI blocking, deadline cancellation, quota cooldown and automatic resumption. All **15 backend tests passed**.
- Headless Chromium checks against the complete production frontend and an isolated backend:
  - Two separate accounts log in and exchange realtime text.
  - Replies reference the correct sender; deletion updates original and quoted messages.
  - Messages appear once when both socket and HTTP responses arrive.
  - A simulated server failure preserves the text draft for retry.
  - Image selection/send and microphone recording/preview/send reach the recipient.
  - Blocked profanity is not sent and remains in the draft.
  - The mobile chat fits a 320px viewport without document-level horizontal scrolling.
  - The top navbar Install App button displays Safari Add to Home Screen instructions on iPhone.
  - The manifest has standalone display and both required icon sizes.
  - The production service worker serves the offline fallback when disconnected.
  - No browser page exceptions occurred during these flows.

- Additional browser checks passed for first-unread positioning, visible read progression, long-preview badge sizing, offline single ticks, delivered/read double ticks, stable scroll on incoming messages, 320px mobile drawer badges and read-through-latest counter clearing. The focus gate was checked with explicit blur emulation because headless automation forces focus.
- The sender warning toast was verified using a successful API response containing quota-warning metadata; backend tests separately verify that a real mocked HTTP 429 produces that response while persisting the message.

- Immediate-ban browser checks passed: first violation rejects delivery, banner updates in two tabs, all send controls disable, Profile shows Blocked, direct text/image/voice requests fail, refresh/routes/logout-login preserve the ban, and the 320px banner fits above the chat. Expiry was shortened by a test-only fixture (excluded from the ZIP) to verify automatic UI and sending recovery. The production ban remains 24 hours.

- Navbar installation update: frontend lint and production build passed. Browser checks passed for the visible 320px authenticated navbar, fallback dialog close/Escape, iPhone instructions, standalone hiding, and native prompt invocation/dismiss/retry/confirmation using simulated browser install events. Actual OS installation still requires a real device and HTTPS deployment.

## Scope and remaining deployment checks

Cloudinary uploads were mocked in the integration and browser tests. Actual recording used Chromium's fake microphone input. Live Gemini requests were not made. Quota, timeout and transport errors were simulated in the moderation tests. No uploaded production secrets or existing customer database were used.

Verify your actual Cloudinary uploads/playback, configured Gemini model, mobile microphone permissions, iPhone recording and native Android/iOS installation on your final HTTPS deployment. Browser installation eligibility and cross-site-cookie behavior depend on hosting and the device/browser. These tests do not certify that every possible device or production failure has been eliminated.

The service worker provides a public offline screen; sending/receiving chat and closed-app push notifications are not available offline. Live content moderation of voice/images requires the optional Gemini configuration described in README.md.
