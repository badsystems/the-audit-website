const { checkPassword, createSessionToken, setSessionCookie } = require('../../lib/auth');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  let body = req.body;
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body);
    } catch {
      body = {};
    }
  }

  const password = body && body.password;
  if (!checkPassword(password)) {
    res.status(401).json({ error: 'Incorrect password' });
    return;
  }

  const token = createSessionToken();
  setSessionCookie(res, token);
  res.status(200).json({ ok: true });
};
