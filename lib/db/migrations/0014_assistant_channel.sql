CREATE TYPE "public"."booking_source" AS ENUM('web', 'owner', 'assistant');--> statement-breakpoint
ALTER TABLE "booking_attempts" ALTER COLUMN "email" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "booking_attempts" ADD COLUMN "customer_ref" text;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "source" "booking_source" DEFAULT 'web' NOT NULL;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "customer_ref" text;--> statement-breakpoint
ALTER TABLE "business_profiles" ADD COLUMN "assistant_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "business_profiles" ADD COLUMN "assistant_notes" text;--> statement-breakpoint
CREATE INDEX "bookings_org_customer_ref_idx" ON "bookings" USING btree ("organization_id","customer_ref");--> statement-breakpoint
ALTER TABLE "booking_attempts" ADD CONSTRAINT "booking_attempts_has_identity" CHECK ("booking_attempts"."email" IS NOT NULL OR "booking_attempts"."customer_ref" IS NOT NULL);--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_assistant_has_customer_ref" CHECK ("bookings"."source" <> 'assistant' OR "bookings"."customer_ref" IS NOT NULL);--> statement-breakpoint
-- Nothing recorded where a booking came from before this migration. One thing
-- is certain: the public form always takes an email, so a booking without one
-- was entered by the owner (or seeded as demo history).
UPDATE "bookings" SET "source" = 'owner' WHERE "customer_email" IS NULL;
