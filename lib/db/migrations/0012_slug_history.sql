CREATE TABLE "organization_slug_history" (
	"slug" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "organization_slug_history" ADD CONSTRAINT "organization_slug_history_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "organization_slug_history_org_idx" ON "organization_slug_history" USING btree ("organization_id");