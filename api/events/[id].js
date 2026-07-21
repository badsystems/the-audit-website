const { getSql } = require('../../lib/db');
const { findEventByIdOrSlug, computeAvailability } = require('../../lib/events');

// Public, single-event lookup by UUID or slug. Deliberately does not filter by
// status — a custom page that already knows its own slug is allowed to fetch
// a draft event (e.g. while testing RSVP flow before the event is announced).
module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const { id } = req.query;
  const sql = getSql();

  try {
    const event = await findEventByIdOrSlug(sql, id);
    if (!event) {
      res.status(404).json({ error: 'Event not found' });
      return;
    }

    const { spotsLeft, soldOut } = computeAvailability(event);

    res.setHeader('Cache-Control', 's-maxage=10, stale-while-revalidate=30');
    res.status(200).json({
      id: event.id,
      title: event.title,
      capacity: event.capacity,
      price_cents: event.price_cents,
      currency: event.currency,
      spots_left: spotsLeft,
      sold_out: soldOut,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load event' });
  }
};
