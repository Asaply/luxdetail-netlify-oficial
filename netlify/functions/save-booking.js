const crypto = require('crypto');
const https = require('https');

function base64url(str) {
  return Buffer.from(str).toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

function httpsPost(hostname, path, headers, body) {
  return new Promise((resolve, reject) => {
    const req = https.request({ hostname, path, method: 'POST', headers }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => resolve(data));
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

async function getAccessToken(creds) {
  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claim  = base64url(JSON.stringify({
    iss: creds.client_email,
    scope: 'https://www.googleapis.com/auth/spreadsheets',
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600,
    iat: now,
  }));
  const input = `${header}.${claim}`;
  const sig = crypto.createSign('RSA-SHA256');
  sig.update(input);
  const signature = sig.sign(creds.private_key, 'base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
  const jwt = `${input}.${signature}`;

  const body = `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`;
  const res = await httpsPost('oauth2.googleapis.com', '/token',
    { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(body) },
    body
  );
  const parsed = JSON.parse(res);
  if (!parsed.access_token) throw new Error('Token error: ' + res);
  return parsed.access_token;
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };

  try {
    const booking = JSON.parse(event.body);
    const creds = {
      client_email: process.env.GOOGLE_CLIENT_EMAIL,
      private_key: Buffer.from(process.env.GOOGLE_PRIVATE_KEY_B64, 'base64').toString('utf8'),
    };
    const sheetId = process.env.SPREADSHEET_ID;
    const token   = await getAccessToken(creds);

    const addons = Object.values(booking.addons || {}).map(a => a.name).join(', ') || '—';
    const row = [
      (booking.id || '').toUpperCase(),
      new Date().toLocaleDateString('es-MX'),
      booking.name || '',
      booking.phone || '',
      booking.address || '',
      booking.vehName || '',
      `${booking.category || ''} · ${booking.variant || ''}`,
      addons,
      booking.date || '',
      booking.time || '',
      `$${booking.total || 0} MXN`,
      booking.paymentMethod || 'efectivo',
      booking.anticipoPaid ? 'Sí' : 'No',
      booking.notes || '',
      'Por confirmar',
    ];

    const body = JSON.stringify({ values: [row] });
    const path = `/v4/spreadsheets/${sheetId}/values/A1:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`;
    await httpsPost('sheets.googleapis.com', path,
      { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
      body
    );

    return { statusCode: 200, body: JSON.stringify({ ok: true }) };
  } catch (err) {
    console.error(err);
    return { statusCode: 500, body: JSON.stringify({ ok: false, error: err.message }) };
  }
};
