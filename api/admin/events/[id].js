const { getSql } = require('../../../lib/db');
const { requireAuth } = require('../../../lib/auth');
const { validateEvent } = require('../../../lib/validate');

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

module.exports = async function handler(req, res) {
  if (!requireAuth(req, res)) return;

  const { id } = req.query;
  if (!UUID_RE.test(id)) {
    res.status(400).json({ error: 'Invalid event id' });
    return;
  }

  const sql = getSql();

  if (req.method === 'PUT' || req.method === 'PATCH') {
    let body = req.body;
    if (typeof body === 'string') {
      try {
        body = JSON.parse(body);
      } catch {
        body = {};
      }
    }
    body = body || {};

    const { errors, clean } = validateEvent(body, { isNew: false });
    if (errors.length) {
      res.status(400).json({ errors });
      return;
    }

    try {
      const rows = await sql`
        UPDATE events SET
          title = ${clean.title},
          description = ${clean.description},
          location = ${clean.location},
          start_at = ${clean.start_at.toISOString()},
          end_at = ${clean.end_at ? clean.end_at.toISOString() : null},
          image_url = ${clean.image_url},
          rsvp_url = ${clean.rsvp_url},
          capacity = ${clean.capacity},
          status = ${clean.status},
          slug = ${clean.slug},
          price_cents = ${clean.price_cents},
          currency = ${clean.currency}
        WHERE id = ${id}
        RETURNING id, title, description, location, start_at, end_at,
                  image_url, rsvp_url, capacity, status, slug, price_cents, currency,
                  created_at, updated_at
      `;
      if (!rows.length) {
        res.status(404).json({ error: 'Event not found' });
        return;
      }
      res.status(200).json({ event: rows[0] });
    } catch (err) {
      if (err && err.code === '23505') {
        res.status(400).json({ errors: ['That slug is already in use by another event.'] });
        return;
      }
      console.error(err);
      res.status(500).json({ error: 'Failed to update event' });
    }
    return;
  }

  if (req.method === 'DELETE') {
    try {
      const rows = await sql`DELETE FROM events WHERE id = ${id} RETURNING id`;
      if (!rows.length) {
        res.status(404).json({ error: 'Event not found' });
        return;
      }
      res.status(200).json({ ok: true });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Failed to delete event' });
    }
    return;
  }

  res.status(405).json({ error: 'Method not allowed' });
};
