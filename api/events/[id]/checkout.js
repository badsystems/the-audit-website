const crypto = require('crypto');
const Stripe = require('stripe');
const { getSql } = require('../../../lib/db');
const { findEventByIdOrSlug, computeAvailability } = require('../../../lib/events');
const { validateRsvp } = require('../../../lib/validate');

let stripe;
function getStripe() {
  if (!stripe) {
    if (!process.env.STRIPE_SECRET_KEY) throw new Error('STRIPE_SECRET_KEY is not set');
    stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  }
  return stripe;
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const { id } = req.query;
  const sql = getSql();

  let body = req.body;
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body);
    } catch {
      body = {};
    }
  }
  body = body || {};

  const { errors, clean } = validateRsvp(body);
  if (errors.length) {
    res.status(400).json({ errors });
    return;
  }

  try {
    const event = await findEventByIdOrSlug(sql, id);
    if (!event) {
      res.status(404).json({ error: 'Event not found' });
      return;
    }
    if (event.price_cents == null) {
      res.status(400).json({ error: 'This event is not set up for paid RSVP.' });
      return;
    }

    // Soft check for a fast, friendly "sold out" response. The real
    // guarantee against overselling happens in the webhook, which flips
    // pending -> paid under a row lock and refunds if capacity was hit
    // by a concurrent request first.
    const { soldOut } = computeAvailability(event);
    if (soldOut) {
      res.status(409).json({ error: 'Sold out' });
      return;
    }

    const host = req.headers['x-forwarded-host'] || req.headers.host;
    const proto = req.headers['x-forwarded-proto'] || 'https';
    const origin = `${proto}://${host}`;
    // Reuse whatever identifier the page itself used to call this endpoint —
    // that's guaranteed to match the page's own URL path.
    const returnPath = `/events/${id}/`;

    const rsvpId = crypto.randomUUID();

    const session = await getStripe().checkout.sessions.create({
      mode: 'payment',
      customer_email: clean.email,
      line_items: [
        {
          price_data: {
            currency: event.currency,
            product_data: { name: event.title },
            unit_amount: event.price_cents,
          },
          quantity: 1,
        },
      ],
      success_url: `${origin}${returnPath}?rsvp=success`,
      cancel_url: `${origin}${returnPath}?rsvp=cancelled`,
      metadata: { event_id: event.id, rsvp_id: rsvpId },
    });

    await sql`
      INSERT INTO event_rsvps (id, event_id, name, email, stripe_session_id, payment_status)
      VALUES (${rsvpId}, ${event.id}, ${clean.name}, ${clean.email}, ${session.id}, 'pending')
    `;

    res.status(200).json({ url: session.url });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to start checkout' });
  }
};
