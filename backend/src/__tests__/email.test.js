'use strict';

const { describe, it, afterEach, mock } = require('node:test');
const assert = require('node:assert');
const axios = require('axios');
const { sendEmail, getFromAddress } = require('../lib/email');

// Snapshot das envs relevantes para restaurar entre os testes.
const ORIG = {
  RESEND_API_KEY: process.env.RESEND_API_KEY,
  SUPPORT_FROM_EMAIL: process.env.SUPPORT_FROM_EMAIL,
  APP_EMAIL: process.env.APP_EMAIL,
};

function restoreEnv() {
  for (const k of Object.keys(ORIG)) {
    if (ORIG[k] === undefined) delete process.env[k];
    else process.env[k] = ORIG[k];
  }
}

describe('lib/email — sendEmail (best-effort, nunca lança)', () => {
  afterEach(() => {
    restoreEnv();
    mock.restoreAll();
  });

  it('sem RESEND_API_KEY → { skipped, no_api_key } e não chama o axios', async () => {
    delete process.env.RESEND_API_KEY;
    const post = mock.method(axios, 'post', async () => { throw new Error('não deveria ser chamado'); });
    const r = await sendEmail({ to: 'a@b.com', subject: 's', html: '<p>x</p>' });
    assert.deepStrictEqual(r, { ok: false, skipped: true, reason: 'no_api_key' });
    assert.strictEqual(post.mock.callCount(), 0);
  });

  it('com key mas sem remetente → { skipped, no_from_address }', async () => {
    process.env.RESEND_API_KEY = 're_test';
    delete process.env.SUPPORT_FROM_EMAIL;
    delete process.env.APP_EMAIL;
    const r = await sendEmail({ to: 'a@b.com', subject: 's', html: '<p>x</p>' });
    assert.strictEqual(r.skipped, true);
    assert.strictEqual(r.reason, 'no_from_address');
  });

  it('SUPPORT_FROM_EMAIL ausente cai no fallback APP_EMAIL', () => {
    delete process.env.SUPPORT_FROM_EMAIL;
    process.env.APP_EMAIL = 'contato@app.com';
    assert.strictEqual(getFromAddress(), 'contato@app.com');
  });

  it('com key+from mas sem destinatário → { skipped, no_recipient }', async () => {
    process.env.RESEND_API_KEY = 're_test';
    process.env.SUPPORT_FROM_EMAIL = 'Suporte <s@app.com>';
    const r = await sendEmail({ to: '', subject: 's', html: '<p>x</p>' });
    assert.strictEqual(r.reason, 'no_recipient');
    const empty = await sendEmail({ to: [], subject: 's', html: '<p>x</p>' });
    assert.strictEqual(empty.reason, 'no_recipient');
  });

  it('com key+from+to mas sem conteúdo → { skipped, missing_content }', async () => {
    process.env.RESEND_API_KEY = 're_test';
    process.env.SUPPORT_FROM_EMAIL = 's@app.com';
    const r = await sendEmail({ to: 'a@b.com', subject: '', html: '' });
    assert.strictEqual(r.reason, 'missing_content');
  });

  it('happy path → posta no Resend com payload e headers corretos, retorna { ok, id }', async () => {
    process.env.RESEND_API_KEY = 're_test';
    process.env.SUPPORT_FROM_EMAIL = 'Suporte <s@app.com>';
    let captured;
    mock.method(axios, 'post', async (url, payload, config) => {
      captured = { url, payload, config };
      return { data: { id: 'em_123' } };
    });

    const r = await sendEmail({ to: 'loja@x.com', subject: 'Oi', html: '<p>oi</p>', replyTo: 'r@x.com' });

    assert.deepStrictEqual(r, { ok: true, id: 'em_123' });
    assert.strictEqual(captured.url, 'https://api.resend.com/emails');
    assert.strictEqual(captured.payload.from, 'Suporte <s@app.com>');
    assert.deepStrictEqual(captured.payload.to, ['loja@x.com']);
    assert.strictEqual(captured.payload.subject, 'Oi');
    assert.strictEqual(captured.payload.reply_to, 'r@x.com');
    assert.strictEqual(captured.config.headers.Authorization, 'Bearer re_test');
  });

  it('to como array é preservado e reply_to omitido quando ausente', async () => {
    process.env.RESEND_API_KEY = 're_test';
    process.env.SUPPORT_FROM_EMAIL = 's@app.com';
    let payload;
    mock.method(axios, 'post', async (_url, body) => { payload = body; return { data: { id: 'x' } }; });

    await sendEmail({ to: ['a@x.com', 'b@x.com'], subject: 's', html: '<p>x</p>' });

    assert.deepStrictEqual(payload.to, ['a@x.com', 'b@x.com']);
    assert.ok(!('reply_to' in payload), 'reply_to não deve existir quando não informado');
  });

  it('axios lança → { ok:false, reason } sem propagar a exceção', async () => {
    process.env.RESEND_API_KEY = 're_test';
    process.env.SUPPORT_FROM_EMAIL = 's@app.com';
    mock.method(axios, 'post', async () => { throw new Error('network down'); });

    const r = await sendEmail({ to: 'a@b.com', subject: 's', html: '<p>x</p>' });

    assert.strictEqual(r.ok, false);
    assert.strictEqual(r.skipped, undefined);
    assert.ok(r.reason);
  });
});
