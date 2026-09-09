CREATE TYPE "public"."billing_event_source" AS ENUM('callback', 'poll', 'manual');--> statement-breakpoint
CREATE TYPE "public"."billing_plan" AS ENUM('free', 'pro');--> statement-breakpoint
CREATE TYPE "public"."payout_account_status" AS ENUM('pending', 'active', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."submerchant_type" AS ENUM('personal', 'private_company', 'limited_or_joint_stock_company');--> statement-breakpoint
CREATE TYPE "public"."subscription_status" AS ENUM('none', 'pending', 'trialing', 'active', 'past_due', 'cancelled', 'expired');--> statement-breakpoint
CREATE TABLE "billing_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text,
	"source" "billing_event_source" NOT NULL,
	"kind" text NOT NULL,
	"iyzico_ref" text,
	"payload" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "org_payout_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"status" "payout_account_status" DEFAULT 'pending' NOT NULL,
	"sub_merchant_key" text,
	"sub_merchant_external_id" text NOT NULL,
	"merchant_type" "submerchant_type" NOT NULL,
	"name" text NOT NULL,
	"legal_company_title" text,
	"contact_name" text,
	"contact_surname" text,
	"identity_number" text,
	"tax_number" text,
	"tax_office" text,
	"iban" text NOT NULL,
	"address" text NOT NULL,
	"gsm_number" text NOT NULL,
	"email" text NOT NULL,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "org_payout_accounts_organization_id_unique" UNIQUE("organization_id"),
	CONSTRAINT "org_payout_accounts_sub_merchant_key_unique" UNIQUE("sub_merchant_key"),
	CONSTRAINT "org_payout_accounts_sub_merchant_external_id_unique" UNIQUE("sub_merchant_external_id"),
	CONSTRAINT "payout_accounts_identity_or_tax" CHECK ("org_payout_accounts"."identity_number" IS NOT NULL OR "org_payout_accounts"."tax_number" IS NOT NULL),
	CONSTRAINT "payout_accounts_active_has_key" CHECK ("org_payout_accounts"."status" <> 'active' OR "org_payout_accounts"."sub_merchant_key" IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "org_subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"plan" "billing_plan" DEFAULT 'free' NOT NULL,
	"status" "subscription_status" DEFAULT 'none' NOT NULL,
	"checkout_token" text,
	"iyzico_customer_ref" text,
	"iyzico_subscription_ref" text,
	"pricing_plan_ref" text,
	"trial_ends_at" timestamp with time zone,
	"current_period_ends_at" timestamp with time zone,
	"cancel_at_period_end" boolean DEFAULT false NOT NULL,
	"last_synced_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "org_subscriptions_organization_id_unique" UNIQUE("organization_id"),
	CONSTRAINT "org_subscriptions_checkout_token_unique" UNIQUE("checkout_token"),
	CONSTRAINT "org_subscriptions_iyzico_subscription_ref_unique" UNIQUE("iyzico_subscription_ref")
);
--> statement-breakpoint
ALTER TABLE "billing_events" ADD CONSTRAINT "billing_events_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "org_payout_accounts" ADD CONSTRAINT "org_payout_accounts_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "org_subscriptions" ADD CONSTRAINT "org_subscriptions_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "billing_events_org_created_at_idx" ON "billing_events" USING btree ("organization_id","created_at");--> statement-breakpoint
CREATE INDEX "billing_events_iyzico_ref_idx" ON "billing_events" USING btree ("iyzico_ref");--> statement-breakpoint
CREATE INDEX "org_subscriptions_status_idx" ON "org_subscriptions" USING btree ("status");