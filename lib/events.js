const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Public event lookups (checkout, spots-left) accept either the event's UUID
// or its slug, since static pages hardcode a human-chosen slug rather than a
// DB-generated id that doesn't exist yet when the page is written.
async function findEventByIdOrSlug(sql, idOrSlug) {
  const rows = UUID_RE.test(idOrSlug)
    ? await sql`
        SELECT id, title, capacity, price_cents, currency, status, paid_count
        FROM events WHERE id = ${idOrSlug}
      `
    : await sql`
        SELECT id, title, capacity, price_cents, currency, status, paid_count
        FROM events WHERE slug = ${idOrSlug}
      `;
  return rows[0] || null;
}

// `paid_count` is the authoritative, atomically-maintained counter (see
// migrations/0002_event_payments.sql) — not a live COUNT(*) over event_rsvps.
function computeAvailability(event) {
  const spotsLeft = event.capacity == null ? null : Math.max(0, event.capacity - event.paid_count);
  const soldOut = event.capacity != null && event.paid_count >= event.capacity;
  return { spotsLeft, soldOut };
}

module.exports = { findEventByIdOrSlug, computeAvailability };
