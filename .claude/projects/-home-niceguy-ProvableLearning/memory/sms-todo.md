# SMS / Twilio TODO

## Status (as of 2026-02-25)
- Twilio A2P 10DLC campaign registered, status: **IN REVIEW** (Campaign SID: CMa0f5299f6bc010abbee1c3315af2595e)
- Phone number: +14706846608 — currently `CAN_SEND_MESSAGES: FALSE` until campaign approved
- SMS code is fully implemented (`src/lib/notifications/send-sms.ts`, `send-booking-notification.ts`) but disabled in UI

## What's Disabled
- **Booking widget** (`src/app/book/booking-widget.tsx`): SMS/Both radio buttons hidden, hardcoded to `contactMethod='email'`
- Search for `TODO: Re-enable SMS/Both options` in the file

## When Campaign Is Approved
1. Verify SMS sends successfully (test with your own number)
2. **Re-enable contact method options** in `booking-widget.tsx`:
   - Remove the hidden input and TODO comment
   - Restore the `<fieldset>` with Email / Text / Both radio buttons
3. **Implement 12-hour reminder cron** (`src/app/api/cron/booking-reminders/`):
   - Query bookings where `reminder_sent = FALSE` and `datetime` is within 12 hours
   - Send reminder via `sendBookingNotification({ type: 'reminder' })`
   - Set `reminder_sent = TRUE` after sending
   - Must be done before first class starts

## Resend (Email) Setup
- Domain `provablelearning.com` being verified at resend.com/domains (DNS records added to Porkbun)
- Once verified, set `RESEND_FROM_EMAIL=Provable Learning <noreply@provablelearning.com>` in Vercel env vars
- Email confirmations will work immediately after domain verification
