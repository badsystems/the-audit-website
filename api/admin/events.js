const { getSql } = require('../../lib/db');
const { requireAuth } = require('../../lib/auth');
const { validateEvent } = require('../../lib/validate');

module.exports = async function handler(req, res) {
  if (!requireAuth(req, res)) return;

  const sql = getSql();

  if (req.method === 'GET') {
    try {
      const rows = await sql`
        SELECT id, title, description, location, start_at, end_at,
               image_url, rsvp_url, capacity, status, created_at, updated_at
        FROM events
        ORDER BY start_at DESC
      `;
      res.status(200).json({ events: rows });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Failed to load events' });
    }
    return;
  }

  if (req.method === 'POST') {
    let body = req.body;
    if (typeof body === 'string') {
      try {
        body = JSON.parse(body);
      } catch {
        body = {};
      }
    }
    body = body || {};

    const { errors, clean } = validateEvent(body, { isNew: true });
    if (errors.length) {
      res.status(400).json({ errors });
      return;
    }

    try {
      const rows = await sql`
        INSERT INTO events
          (title, description, location, start_at, end_at, image_url, rsvp_url, capacity, status)
        VALUES
          (${clean.title}, ${clean.description}, ${clean.location}, ${clean.start_at.toISOString()},
           ${clean.end_at ? clean.end_at.toISOString() : null}, ${clean.image_url}, ${clean.rsvp_url},
           ${clean.capacity}, ${clean.status})
        RETURNING id, title, description, location, start_at, end_at,
                  image_url, rsvp_url, capacity, status, created_at, updated_at
      `;
      res.status(201).json({ event: rows[0] });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Failed to create event' });
    }
    return;
  }

  res.status(405).json({ error: 'Method not allowed' });
};
