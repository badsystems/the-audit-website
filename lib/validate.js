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

  return { errors, clean };
}

module.exports = { validateEvent, STATUSES };
