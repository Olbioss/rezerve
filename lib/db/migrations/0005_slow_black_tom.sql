CREATE TYPE "public"."subscription_charge_status" AS ENUM('succeeded', 'failed');--> statement-breakpoint
CREATE TABLE "subscription_charges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"period_start" date NOT NULL,
	"status" "subscription_charge_status" NOT NULL,
	"amount_cents" integer NOT NULL,
	"payment_ref" text,
	"attempt" integer DEFAULT 1 NOT NULL,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "subscription_charges_org_period" UNIQUE("organization_id","period_start")
);
--> statement-breakpoint
ALTER TABLE "org_subscriptions" ADD COLUMN "card_user_key" text;--> statement-breakpoint
ALTER TABLE "org_subscriptions" ADD COLUMN "card_token" text;--> statement-breakpoint
ALTER TABLE "org_subscriptions" ADD COLUMN "next_charge_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "subscription_charges" ADD CONSTRAINT "subscription_charges_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "subscription_charges_org_idx" ON "subscription_charges" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "org_subscriptions_next_charge_idx" ON "org_subscriptions" USING btree ("next_charge_at");