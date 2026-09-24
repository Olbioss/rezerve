CREATE TABLE "availability_exceptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"starts_on" date NOT NULL,
	"ends_on" date NOT NULL,
	"intervals" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "availability_exceptions_range_valid" CHECK ("availability_exceptions"."ends_on" >= "availability_exceptions"."starts_on"),
	CONSTRAINT "availability_exceptions_intervals_array" CHECK (jsonb_typeof("availability_exceptions"."intervals") = 'array')
);
--> statement-breakpoint
ALTER TABLE "availability_exceptions" ADD CONSTRAINT "availability_exceptions_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "availability_exceptions_org_ends_idx" ON "availability_exceptions" USING btree ("organization_id","ends_on");--> statement-breakpoint
-- Hand-written, as drizzle cannot express it: no two exceptions for one
-- business may cover the same date, so each date has at most one to obey.
-- btree_gist is already installed by 0001. Violations surface as SQLSTATE
-- 23P01 (exclusion_violation).
ALTER TABLE "availability_exceptions" ADD CONSTRAINT "availability_exceptions_no_overlap"
  EXCLUDE USING gist (
    "organization_id" WITH =,
    daterange("starts_on", "ends_on", '[]') WITH &&
  );
