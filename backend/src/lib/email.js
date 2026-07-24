const axios = require('axios');

/**
 * Serviço de e-mail transacional best-effort via API HTTP do Resend.
 *
 * Design:
 *  - Sem SMTP, sem nova dependência (usa o `axios` já presente).
 *  - É **best-effort**: nunca lança. Se não houver `RESEND_API_KEY` ou destinatário,
 *    retorna `{ skipped: true }` silenciosamente. Falhas da API são logadas e engolidas
 *    para não derrubar o fluxo que disparou o envio (ex.: abertura de ticket).
 *
 * Env:
 *  - RESEND_API_KEY      → chave da API Resend (re_...). Sem ela, e-mails são no-op.
 *  - SUPPORT_FROM_EMAIL  → remetente. Fallback: APP_EMAIL. Ex.: "Suporte <suporte@app.com>"
 */

const RESEND_ENDPOINT = 'https://api.resend.com/emails';

function getFromAddress() {
  const from = process.env.SUPPORT_FROM_EMAIL || process.env.APP_EMAIL || '';
  return from.trim();
}

/**
 * Envia um e-mail. Best-effort — nunca lança.
 * @param {{ to: string|string[], subject: string, html: string, replyTo?: string }} opts
 * @returns {Promise<{ ok: boolean, skipped?: boolean, reason?: string, id?: string }>}
 */
async function sendEmail({ to, subject, html, replyTo } = {}) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = getFromAddress();

  if (!apiKey) return { ok: false, skipped: true, reason: 'no_api_key' };
  if (!from) return { ok: false, skipped: true, reason: 'no_from_address' };
  if (!to || (Array.isArray(to) && to.length === 0)) {
    return { ok: false, skipped: true, reason: 'no_recipient' };
  }
  if (!subject || !html) return { ok: false, skipped: true, reason: 'missing_content' };

  try {
    const payload = { from, to: Array.isArray(to) ? to : [to], subject, html };
    if (replyTo) payload.reply_to = replyTo;

    const { data } = await axios.post(RESEND_ENDPOINT, payload, {
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      timeout: 8000,
    });
    return { ok: true, id: data?.id };
  } catch (err) {
    const detail = err.response?.data?.message || err.message;
    console.error('[email] falha ao enviar (ignorado):', detail);
    return { ok: false, reason: detail };
  }
}

module.exports = { sendEmail, getFromAddress };
