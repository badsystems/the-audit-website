-- Run this once against your Neon database, after 0001_create_events.sql
-- (Neon SQL Editor, or `psql "$DATABASE_URL" -f migrations/0002_event_payments.sql`).

ALTER TABLE events
  ADD COLUMN IF NOT EXISTS slug TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS price_cents INTEGER,
  ADD COLUMN IF NOT EXISTS currency TEXT NOT NULL DEFAULT 'cad',
  -- Authoritative count of paid RSVPs, maintained only by the atomic
  -- "UPDATE events SET paid_count = paid_count + 1 WHERE ... paid_count < capacity"
  -- guard in the Stripe webhook. Living on this row (not derived via COUNT(*)
  -- over event_rsvps) is what makes the capacity check race-safe: Postgres
  -- only re-checks a WHERE clause against fresh data, after a lock wait, for
  -- the exact row being updated — a count read from a different table would
  -- not get re-evaluated the same way.
  ADD COLUMN IF NOT EXISTS paid_count INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS event_rsvps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  stripe_session_id TEXT UNIQUE,
  payment_status TEXT NOT NULL DEFAULT 'pending' CHECK (payment_status IN ('pending', 'paid', 'refunded')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS event_rsvps_event_status_idx ON event_rsvps (event_id, payment_status);

DROP TRIGGER IF EXISTS event_rsvps_set_updated_at ON event_rsvps;
CREATE TRIGGER event_rsvps_set_updated_at
BEFORE UPDATE ON event_rsvps
FOR EACH ROW EXECUTE FUNCTION set_updated_at();
