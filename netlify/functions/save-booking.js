const { google } = require('googleapis');

const SPREADSHEET_ID = process.env.SPREADSHEET_ID;
const SHEET_NAME = 'Reservaciones';

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    const booking = JSON.parse(event.body);

    const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY);
    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });

    const sheets = google.sheets({ version: 'v4', auth });

    // Ensure header row exists
    const header = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEET_NAME}!A1:P1`,
    });

    if (!header.data.values || header.data.values.length === 0) {
      await sheets.spreadsheets.values.update({
        spreadsheetId: SPREADSHEET_ID,
        range: `${SHEET_NAME}!A1`,
        valueInputOption: 'RAW',
        requestBody: {
          values: [[
            'Folio', 'Fecha Reserva', 'Nombre', 'Teléfono', 'Dirección',
            'Vehículo', 'Servicio', 'Extras', 'Fecha Cita', 'Hora',
            'Total', 'Pago', 'Anticipo', 'Notas', 'Estado', 'Creado'
          ]],
        },
      });
    }

    const addonsStr = Object.values(booking.addons || {}).map(a => a.name).join(', ') || '—';
    const row = [
      (booking.id || '').toUpperCase(),
      new Date().toLocaleDateString('es-MX'),
      booking.name || '',
      booking.phone || '',
      booking.address || '',
      booking.vehName || '',
      `${booking.category || ''} · ${booking.variant || ''}`,
      addonsStr,
      booking.date || '',
      booking.time || '',
      `$${(booking.total || 0).toLocaleString()} MXN`,
      booking.paymentMethod || 'efectivo',
      booking.anticipoPaid ? 'Sí' : 'No',
      booking.notes || '',
      'Por confirmar',
      booking.createdAt || new Date().toISOString(),
    ];

    await sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEET_NAME}!A1`,
      valueInputOption: 'RAW',
      insertDataOption: 'INSERT_ROWS',
      requestBody: { values: [row] },
    });

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ok: true }),
    };
  } catch (err) {
    console.error('save-booking error:', err);
    return {
      statusCode: 500,
      body: JSON.stringify({ ok: false, error: err.message }),
    };
  }
};
