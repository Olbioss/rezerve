ALTER TABLE "bookings" RENAME COLUMN "stripe_checkout_session_id" TO "payment_token";
--> statement-breakpoint
ALTER TABLE "bookings" RENAME CONSTRAINT "bookings_stripe_checkout_session_id_unique" TO "bookings_payment_token_unique";
