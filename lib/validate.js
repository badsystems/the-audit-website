const STATUSES = ['draft', 'published'];

// `isNew` controls the "start date can't be in the past" rule — it only
// applies when creating an event, so editing/archiving a past event doesn't
// get blocked by its own start date.
function validateEvent(input, { isNew }) {
  const errors = [];
  const clean = {};

  const title = typeof input.title === 'string' ? input.title.trim() : '';
  if (!title) errors.push('Title is required.');
  clean.title = title;

  const location = typeof input.location === 'string' ? input.location.trim() : '';
  if (!location) errors.push('Location is required.');
  clean.location = location;

  clean.description = typeof input.description === 'string' ? input.description.trim() : '';
  clean.image_url = typeof input.image_url === 'string' ? input.image_url.trim() : '';
  clean.rsvp_url = typeof input.rsvp_url === 'string' ? input.rsvp_url.trim() : '';

  const startAt = input.start_at ? new Date(input.start_at) : null;
  if (!startAt || Number.isNaN(startAt.getTime())) {
    errors.push('A valid start date/time is required.');
  } else if (isNew && startAt.getTime() < Date.now()) {
    errors.push('Start date/time can\'t be in the past for a new event.');
  }
  clean.start_at = startAt;

  let endAt = null;
  if (input.end_at) {
    endAt = new Date(input.end_at);
    if (Number.isNaN(endAt.getTime())) {
      errors.push('End date/time is invalid.');
    } else if (startAt && endAt.getTime() < startAt.getTime()) {
      errors.push('End date/time must be after the start date/time.');
    }
  }
  clean.end_at = endAt;

  clean.capacity = null;
  if (input.capacity !== undefined && input.capacity !== null && input.capacity !== '') {
    const capacity = Number(input.capacity);
    if (!Number.isInteger(capacity) || capacity <= 0) {
      errors.push('Capacity must be a positive whole number.');
    } else {
      clean.capacity = capacity;
    }
  }

  clean.status = STATUSES.includes(input.status) ? input.status : 'draft';

  const slug = typeof input.slug === 'string' ? input.slug.trim().toLowerCase() : '';
  if (slug && !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) {
    errors.push('Slug can only contain lowercase letters, numbers, and hyphens.');
  }
  clean.slug = slug || null;

  clean.price_cents = null;
  if (input.price_cents !== undefined && input.price_cents !== null && input.price_cents !== '') {
    const priceCents = Number(input.price_cents);
    if (!Number.isInteger(priceCents) || priceCents < 0) {
      errors.push('Price must be a non-negative whole number of cents.');
    } else {
      clean.price_cents = priceCents;
    }
  }

  const currency = typeof input.currency === 'string' ? input.currency.trim().toLowerCase() : '';
  clean.currency = /^[a-z]{3}$/.test(currency) ? currency : 'cad';

  return { errors, clean };
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validateRsvp(input) {
  const errors = [];
  const clean = {};

  clean.name = typeof input.name === 'string' ? input.name.trim() : '';
  if (!clean.name) errors.push('Name is required.');

  clean.email = typeof input.email === 'string' ? input.email.trim() : '';
  if (!clean.email || !EMAIL_RE.test(clean.email)) errors.push('A valid email is required.');

  return { errors, clean };
}

module.exports = { validateEvent, validateRsvp, STATUSES };
