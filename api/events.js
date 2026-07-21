const { getSql } = require('../lib/db');

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const sql = getSql();
    const rows = await sql`
      SELECT id, title, description, location, start_at, end_at,
             image_url, rsvp_url, capacity, slug, price_cents, currency
      FROM events
      WHERE status = 'published'
      ORDER BY start_at ASC
    `;
    res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=300');
    res.status(200).json({ events: rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load events' });
  }
};
