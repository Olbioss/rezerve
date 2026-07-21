-- Prevent double-booking at the database level: no two non-cancelled bookings
-- for the same organization may overlap in time. Pending holds count too.
-- Violations surface as SQLSTATE 23P01 (exclusion_violation).
CREATE EXTENSION IF NOT EXISTS btree_gist;
--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_no_overlap"
  EXCLUDE USING gist (
    "organization_id" WITH =,
    tstzrange("starts_at", "ends_at") WITH &&
  ) WHERE (status <> 'cancelled');
