const Stripe = require('stripe');
const { getSql } = require('../../lib/db');

let stripe;
function getStripe() {
  if (!stripe) {
    if (!process.env.STRIPE_SECRET_KEY) throw new Error('STRIPE_SECRET_KEY is not set');
    stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  }
  return stripe;
}

function readRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

// Two sequential single-row updates, each safe under concurrency for a
// different reason:
//
// 1. Claim this specific rsvp row (pending -> paid), guarded on its own
//    current status. This makes re-delivery of the same webhook event a
//    harmless no-op — Stripe retries webhooks, and this is what keeps a
//    retry from being processed twice.
// 2. Atomically increment the event's paid_count, guarded by its own
//    capacity. Because the guard condition and the column being updated
//    are on the SAME row, Postgres re-checks it against fresh data if this
//    statement has to wait for a concurrent one — this is what actually
//    prevents two different rsvps from both claiming the last spot. (An
//    earlier version tried to guard this with a cross-table CTE instead of
//    a counter column, which does NOT get re-checked the same way and
//    allowed overselling under real concurrency — verified with a manual
//    3-way race against capacity 2 before switching to this approach.)
//
// If step 1 succeeds but step 2 finds no room, the row is reverted and
// refunded — this is the actual capacity guarantee, not the checkout
// route's pre-check.
async function markPaidIfRoom(sql, rsvpId, eventId) {
  const claimed = await sql`
    UPDATE event_rsvps SET payment_status = 'paid'
    WHERE id = ${rsvpId} AND payment_status = 'pending'
    RETURNING id
  `;
  if (!claimed.length) {
    return 'already-handled';
  }

  const gotSpot = await sql`
    UPDATE events SET paid_count = paid_count + 1
    WHERE id = ${eventId} AND (capacity IS NULL OR paid_count < capacity)
    RETURNING id
  `;
  if (gotSpot.length) {
    return 'paid';
  }

  await sql`UPDATE event_rsvps SET payment_status = 'refunded' WHERE id = ${rsvpId}`;
  return 'refund-needed';
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const sig = req.headers['stripe-signature'];
  let event;
  try {
    const rawBody = await readRawBody(req);
    event = getStripe().webhooks.constructEvent(rawBody, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('Stripe signature verification failed:', err.message);
    res.status(400).json({ error: 'Invalid signature' });
    return;
  }

  if (event.type !== 'checkout.session.completed') {
    res.status(200).json({ received: true });
    return;
  }

  const session = event.data.object;
  const { rsvp_id: rsvpId, event_id: eventId } = session.metadata || {};
  if (!rsvpId || !eventId) {
    console.error('Webhook missing rsvp_id/event_id metadata for session', session.id);
    res.status(200).json({ received: true });
    return;
  }

  const sql = getSql();
  try {
    const result = await markPaidIfRoom(sql, rsvpId, eventId);

    if (result === 'refund-needed') {
      // Customer already paid Stripe, but capacity filled before this
      // payment was confirmed — refund rather than oversell.
      if (session.payment_intent) {
        await getStripe().refunds.create({ payment_intent: session.payment_intent });
      }
      console.error(`Refunded RSVP ${rsvpId} for event ${eventId} — capacity was full.`);
    }

    res.status(200).json({ received: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
};

// Signature verification needs the exact raw request bytes, so disable
// Vercel's default JSON body parsing for this route only. Must be set after
// module.exports is assigned the handler function, or it's silently lost.
module.exports.config = { api: { bodyParser: false } };
module.exports.markPaidIfRoom = markPaidIfRoom;
