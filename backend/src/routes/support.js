const express = require('express');
const prisma = require('../lib/prisma');
const { AppError } = require('../lib/errors');
const { requireAuth } = require('../middleware/auth');
const { ticketLimiter } = require('../middleware/rateLimiter');
const { sendEmail } = require('../lib/email');

const router = express.Router();

function escapeHtml(str) {
  return String(str || '').replace(/[&<>"]/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]
  ));
}

/**
 * Notifica o admin por e-mail sobre atividade num ticket. Best-effort, fire-and-forget:
 * lê o destino em AdminConfig['support_notify_email'] e não lança em caso de falha.
 */
async function notifyAdminOfTicket({ kind, ticketId, storeName, subject, message }) {
  try {
    const cfg = await prisma.adminConfig.findUnique({ where: { key: 'support_notify_email' } });
    const to = (cfg?.value || '').trim();
    if (!to) return;

    const appName = process.env.APP_NAME || 'App';
    const isNew = kind === 'new';
    const heading = isNew ? 'Novo ticket de suporte' : 'Nova mensagem em ticket';
    const adminUrl = (process.env.ADMIN_FRONTEND_URL || '').replace(/\/$/, '');
    const link = adminUrl ? `${adminUrl}/support` : '';

    const html = `
      <div style="font-family:system-ui,Arial,sans-serif;max-width:560px">
        <h2 style="margin:0 0 4px">${escapeHtml(heading)} — ${escapeHtml(appName)}</h2>
        <p style="color:#555;margin:0 0 16px">Ticket #${ticketId} · Loja: <strong>${escapeHtml(storeName)}</strong></p>
        ${subject ? `<p style="margin:0 0 8px"><strong>Assunto:</strong> ${escapeHtml(subject)}</p>` : ''}
        <blockquote style="margin:0 0 16px;padding:12px 16px;background:#f5f5f5;border-left:3px solid #ccc;white-space:pre-wrap">${escapeHtml(message)}</blockquote>
        ${link ? `<p><a href="${link}" style="background:#111;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none">Responder no painel</a></p>` : ''}
      </div>`;

    await sendEmail({ to, subject: `[${appName}] ${heading} #${ticketId}`, html });
  } catch (err) {
    console.error('[support] notifyAdminOfTicket falhou (ignorado):', err.message);
  }
}

/**
 * GET /api/support — Public endpoint (no auth required)
 * Returns published FAQs + support config (video, whatsapp)
 */
router.get('/', async (req, res, next) => {
  try {
    // Idioma da loja: o app envia ?lang=pt-BR|es-AR|es-MX|pt|es. Normaliza para a
    // base (pt | es); qualquer coisa fora disso vira 'pt'.
    const base = String(req.query.lang || '').slice(0, 2).toLowerCase();
    const locale = base === 'es' ? 'es' : 'pt';

    const faqSelect = {
      id: true,
      question: true,
      answer: true,
      videoUrl: true,
      category: true,
      sortOrder: true,
    };
    const faqOrder = [{ sortOrder: 'asc' }, { createdAt: 'asc' }];

    const [faqsRaw, configs] = await Promise.all([
      prisma.adminFaq.findMany({
        where: { isPublished: true, locale },
        orderBy: faqOrder,
        select: faqSelect,
      }),
      prisma.adminConfig.findMany({
        where: { key: { in: ['support_video_url', 'support_whatsapp'] } },
      }),
    ]);

    // Fallback: sem FAQ no idioma pedido (e não é pt) → usa as de português.
    let faqs = faqsRaw;
    if (faqs.length === 0 && locale !== 'pt') {
      faqs = await prisma.adminFaq.findMany({
        where: { isPublished: true, locale: 'pt' },
        orderBy: faqOrder,
        select: faqSelect,
      });
    }

    const configMap = Object.fromEntries(configs.map((c) => [c.key, c.value]));

    res.json({
      faqs,
      mainVideoUrl: configMap.support_video_url || '',
      whatsapp: configMap.support_whatsapp || '',
    });
  } catch (err) {
    next(err);
  }
});

// ─── Tickets de suporte (tenant) — requer autenticação da loja ──────────────

const MSG_MAX = 5000;
const SUBJ_MAX = 200;

/**
 * GET /api/support/tickets — lista os tickets da loja (com a thread).
 */
router.get('/tickets', requireAuth, async (req, res, next) => {
  try {
    const tickets = await prisma.supportTicket.findMany({
      where: { storeId: req.store.id },
      orderBy: { lastMessageAt: 'desc' },
      include: { messages: { orderBy: { createdAt: 'asc' } } },
    });
    res.json({ tickets });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/support/tickets/summary — contagem leve p/ badge no app.
 * Definido antes de outras rotas /tickets/* para evitar conflito de match.
 */
router.get('/tickets/summary', requireAuth, async (req, res, next) => {
  try {
    const grouped = await prisma.supportTicket.groupBy({
      by: ['status'],
      where: { storeId: req.store.id },
      _count: { _all: true },
    });
    const counts = { open: 0, answered: 0, closed: 0 };
    for (const g of grouped) counts[g.status] = g._count._all;
    res.json(counts);
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/support/preferences — preferências de suporte da loja.
 * Retorna `{ emailNotifications }` (default: true). Guardado em StoreProfile.data.
 */
router.get('/preferences', requireAuth, async (req, res, next) => {
  try {
    const profile = await prisma.storeProfile.findUnique({ where: { storeId: req.store.id } });
    const data = profile?.data || {};
    res.json({ emailNotifications: data.supportEmailOptOut !== true });
  } catch (err) {
    next(err);
  }
});

/**
 * PUT /api/support/preferences — atualiza preferências de suporte da loja.
 * Body: { emailNotifications: boolean }. Faz merge no StoreProfile.data (não sobrescreve).
 */
router.put('/preferences', requireAuth, async (req, res, next) => {
  try {
    const { emailNotifications } = req.body;
    if (typeof emailNotifications !== 'boolean') {
      throw new AppError('Campo "emailNotifications" deve ser booleano.', 400, 'INVALID_PREFERENCE');
    }

    const existing = await prisma.storeProfile.findUnique({ where: { storeId: req.store.id } });
    const data = { ...(existing?.data || {}), supportEmailOptOut: !emailNotifications };

    await prisma.storeProfile.upsert({
      where: { storeId: req.store.id },
      update: { data },
      create: { storeId: req.store.id, data },
    });

    res.json({ emailNotifications });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/support/tickets — abre um ticket (1ª mensagem da loja).
 * Body: { subject?, message }
 */
router.post('/tickets', requireAuth, ticketLimiter, async (req, res, next) => {
  try {
    const subject = (req.body.subject || '').toString().trim().slice(0, SUBJ_MAX) || null;
    const message = (req.body.message || '').toString().trim();
    if (!message) {
      throw new AppError('Mensagem é obrigatória.', 400, 'MISSING_MESSAGE');
    }

    const ticket = await prisma.supportTicket.create({
      data: {
        storeId: req.store.id,
        subject,
        status: 'open',
        lastMessageAt: new Date(),
        messages: { create: { author: 'store', body: message.slice(0, MSG_MAX) } },
      },
      include: { messages: { orderBy: { createdAt: 'asc' } } },
    });

    // Notifica o admin (best-effort, não aguarda)
    notifyAdminOfTicket({
      kind: 'new',
      ticketId: ticket.id,
      storeName: req.store.name || `Loja ${req.store.id}`,
      subject,
      message,
    });

    res.status(201).json({ ticket });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/support/tickets/:id/messages — loja adiciona follow-up.
 * Reabre o ticket (status volta a 'open') se estava respondido/fechado.
 */
router.post('/tickets/:id/messages', requireAuth, ticketLimiter, async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    const message = (req.body.message || '').toString().trim();
    if (!message) {
      throw new AppError('Mensagem é obrigatória.', 400, 'MISSING_MESSAGE');
    }

    // Garante que o ticket pertence à loja (isolamento de tenant)
    const ticket = await prisma.supportTicket.findFirst({
      where: { id, storeId: req.store.id },
      select: { id: true },
    });
    if (!ticket) {
      throw new AppError('Ticket não encontrado.', 404, 'TICKET_NOT_FOUND');
    }

    const now = new Date();
    await prisma.supportMessage.create({
      data: { ticketId: id, author: 'store', body: message.slice(0, MSG_MAX) },
    });
    await prisma.supportTicket.update({
      where: { id },
      data: { status: 'open', lastMessageAt: now },
    });

    const updated = await prisma.supportTicket.findUnique({
      where: { id },
      include: { messages: { orderBy: { createdAt: 'asc' } } },
    });

    // Notifica o admin (best-effort, não aguarda)
    notifyAdminOfTicket({
      kind: 'followup',
      ticketId: id,
      storeName: req.store.name || `Loja ${req.store.id}`,
      subject: updated?.subject,
      message,
    });

    res.json({ ticket: updated });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
