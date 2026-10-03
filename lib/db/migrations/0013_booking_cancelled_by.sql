CREATE TYPE "public"."booking_cancelled_by" AS ENUM('owner', 'customer');--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "cancelled_by" "booking_cancelled_by";