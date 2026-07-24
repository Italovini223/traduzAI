const express = require('express');
const prisma = require('../../lib/prisma');
const { AppError } = require('../../lib/errors');
const { parsePagination, paginatedResponse } = require('../../lib/paginate');
const { requireRole } = require('../middleware/requireRole');
const adminLogService = require('../services/adminLogService');
const { sendEmail } = require('../../lib/email');

const router = express.Router();

const STATUSES = ['open', 'answered', 'closed'];
const MSG_MAX = 5000;

function escapeHtml(str) {
  return String(str || '').replace(/[&<>"]/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]
  ));
}

/**
 * Notifica o lojista por e-mail que o suporte respondeu. Best-effort, fire-and-forget:
 * só envia se a loja tiver e-mail e o `lib/email` estiver configurado. Nunca lança.
 */
async function notifyStoreOfReply({ to, storeId, storeName, ticketId, subject, message }) {
  try {
    if (!to) return;

    // Respeita o opt-out da loja (StoreProfile.data.supportEmailOptOut)
    if (storeId) {
      const profile = await prisma.storeProfile.findUnique({ where: { storeId } });
      if (profile?.data?.supportEmailOptOut === true) return;
    }

    const appName = process.env.APP_NAME || 'App';
    const appUrl = (process.env.FRONTEND_URL || '').replace(/\/$/, '');

    const html = `
      <div style="font-family:system-ui,Arial,sans-serif;max-width:560px">
        <h2 style="margin:0 0 4px">O suporte respondeu seu ticket — ${escapeHtml(appName)}</h2>
        <p style="color:#555;margin:0 0 16px">Olá${storeName ? `, ${escapeHtml(storeName)}` : ''}! Recebemos sua mensagem (ticket #${ticketId}) e respondemos:</p>
        ${subject ? `<p style="margin:0 0 8px"><strong>Assunto:</strong> ${escapeHtml(subject)}</p>` : ''}
        <blockquote style="margin:0 0 16px;padding:12px 16px;background:#f5f5f5;border-left:3px solid #ccc;white-space:pre-wrap">${escapeHtml(message)}</blockquote>
        <p style="color:#555;margin:0 0 16px">Para ver a conversa completa ou responder, abra o app e acesse <strong>Suporte</strong>.</p>
        ${appUrl ? `<p><a href="${appUrl}" style="background:#111;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none">Abrir o app</a></p>` : ''}
      </div>`;

    await sendEmail({ to, subject: `[${appName}] Resposta ao seu ticket #${ticketId}`, html });
  } catch (err) {
    console.error('[adminSupport] notifyStoreOfReply falhou (ignorado):', err.message);
  }
}

/**
 * GET /admin-api/support — lista de tickets (paginada).
 * Query: ?status=open|answered|closed&search=...&page=1&limit=20
 */
router.get('/', async (req, res, next) => {
  try {
    const { page, limit, skip } = parsePagination(req.query);
    const { status, search } = req.query;

    const where = {};
    if (status && STATUSES.includes(status)) where.status = status;
    if (search) {
      where.OR = [
        { subject: { contains: search, mode: 'insensitive' } },
        { store: { is: { name: { contains: search, mode: 'insensitive' } } } },
      ];
    }

    const [tickets, total] = await Promise.all([
      prisma.supportTicket.findMany({
        where,
        orderBy: { lastMessageAt: 'desc' },
        skip,
        take: limit,
        include: {
          store: { select: { name: true, nuvemshopId: true } },
          messages: { orderBy: { createdAt: 'desc' }, take: 1 },
          _count: { select: { messages: true } },
        },
      }),
      prisma.supportTicket.count({ where }),
    ]);

    const data = tickets.map((tk) => ({
      id: tk.id,
      storeId: tk.storeId,
      storeName: tk.store?.name || `Loja ${tk.storeId}`,
      nuvemshopId: tk.store?.nuvemshopId || null,
      subject: tk.subject,
      status: tk.status,
      messageCount: tk._count.messages,
      lastMessage: tk.messages[0]?.body?.slice(0, 140) || '',
      lastMessageAuthor: tk.messages[0]?.author || null,
      lastMessageAt: tk.lastMessageAt,
      createdAt: tk.createdAt,
    }));

    res.json(paginatedResponse(data, total, { page, limit }));
  } catch (err) {
    next(err);
  }
});

/**
 * GET /admin-api/support/stats — contagem por status (para badge no menu).
 * Definido ANTES de /:id para não casar com o param.
 */
router.get('/stats', async (req, res, next) => {
  try {
    const grouped = await prisma.supportTicket.groupBy({
      by: ['status'],
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
 * GET /admin-api/support/:id — detalhe do ticket (loja + thread completa).
 */
router.get('/:id', async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    const ticket = await prisma.supportTicket.findUnique({
      where: { id },
      include: {
        store: { select: { id: true, name: true, nuvemshopId: true, email: true, domain: true } },
        messages: { orderBy: { createdAt: 'asc' } },
      },
    });
    if (!ticket) throw new AppError('Ticket nao encontrado.', 404, 'TICKET_NOT_FOUND');

    // Sinaliza se a loja desativou e-mails de resposta (StoreProfile.data.supportEmailOptOut)
    const profile = await prisma.storeProfile.findUnique({ where: { storeId: ticket.storeId } });
    const emailOptOut = profile?.data?.supportEmailOptOut === true;

    res.json({ ticket: { ...ticket, store: { ...ticket.store, emailOptOut } } });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /admin-api/support/:id/reply — admin responde (status -> answered).
 * Body: { message }
 */
router.post('/:id/reply', requireRole('suporte'), async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    const message = (req.body.message || '').toString().trim();
    if (!message) throw new AppError('Mensagem e obrigatoria.', 400, 'MISSING_MESSAGE');

    const existing = await prisma.supportTicket.findUnique({
      where: { id },
      select: { id: true, subject: true, storeId: true, store: { select: { email: true, name: true } } },
    });
    if (!existing) throw new AppError('Ticket nao encontrado.', 404, 'TICKET_NOT_FOUND');

    const now = new Date();
    await prisma.supportMessage.create({
      data: { ticketId: id, author: 'admin', body: message.slice(0, MSG_MAX) },
    });
    await prisma.supportTicket.update({
      where: { id },
      data: { status: 'answered', lastMessageAt: now },
    });

    await adminLogService.log({
      adminId: req.admin.id,
      action: 'reply_support_ticket',
      entity: 'support_ticket',
      entityId: id,
      ipAddress: req.ip,
    });

    const updated = await prisma.supportTicket.findUnique({
      where: { id },
      include: { messages: { orderBy: { createdAt: 'asc' } } },
    });

    // Notifica o lojista que respondemos (best-effort, não aguarda)
    notifyStoreOfReply({
      to: existing.store?.email,
      storeId: existing.storeId,
      storeName: existing.store?.name,
      ticketId: id,
      subject: existing.subject,
      message,
    });

    res.json({ ticket: updated });
  } catch (err) {
    next(err);
  }
});

/**
 * PATCH /admin-api/support/:id/status — fecha/reabre o ticket.
 * Body: { status: open|answered|closed }
 */
router.patch('/:id/status', requireRole('suporte'), async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    const { status } = req.body;
    if (!STATUSES.includes(status)) {
      throw new AppError('Status invalido.', 400, 'INVALID_STATUS');
    }
    const existing = await prisma.supportTicket.findUnique({ where: { id }, select: { id: true } });
    if (!existing) throw new AppError('Ticket nao encontrado.', 404, 'TICKET_NOT_FOUND');

    const ticket = await prisma.supportTicket.update({ where: { id }, data: { status } });

    await adminLogService.log({
      adminId: req.admin.id,
      action: 'set_support_ticket_status',
      entity: 'support_ticket',
      entityId: id,
      details: { status },
      ipAddress: req.ip,
    });

    res.json({ ticket });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
