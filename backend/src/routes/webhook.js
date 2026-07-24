const express = require('express');
const prisma = require('../lib/prisma');
const { stripe, getActiveMode, getWebhookSecret } = require('../config/stripe');

const router = express.Router();

/**
 * Verifica a assinatura do webhook tentando o secret do modo ativo primeiro e,
 * em seguida, o do outro modo. Necessário porque test e live assinam com secrets
 * diferentes e ambos os endpoints podem apontar para a mesma URL.
 */
function constructEventAnyMode(body, sig) {
  const active = getActiveMode();
  const order = active === 'live' ? ['live', 'test'] : ['test', 'live'];
  let lastErr;
  for (const mode of order) {
    const secret = getWebhookSecret(mode);
    if (!secret) continue;
    try {
      return stripe.webhooks.constructEvent(body, sig, secret);
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr || new Error('Nenhum webhook secret configurado.');
}

/**
 * POST /webhook — Stripe webhook handler
 * NOTE: express.raw() must be applied BEFORE this route in server.js
 */
router.post('/', async (req, res) => {
  const sig = req.headers['stripe-signature'];
  if (!sig) {
    return res.status(400).json({ error: 'Missing stripe-signature header.' });
  }

  let event;
  try {
    event = constructEventAnyMode(req.body, sig);
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return res.status(400).json({ error: 'Webhook signature verification failed.' });
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed':
        await handleCheckoutCompleted(event.data.object);
        break;
      case 'invoice.paid':
        await handleInvoicePaid(event.data.object);
        break;
      case 'customer.subscription.updated':
        await handleSubscriptionUpdated(event.data.object);
        break;
      case 'customer.subscription.deleted':
        await handleSubscriptionDeleted(event.data.object);
        break;
      default:
        console.log(`Unhandled event type: ${event.type}`);
    }
  } catch (err) {
    console.error(`Error handling ${event.type}:`, err);
    // Handlers são idempotentes (upsert por chave única + guard de comissão por
    // invoiceId), então é seguro pedir retry ao Stripe em falha transitória
    // (ex: DB momentaneamente indisponível). Sem isto, o evento seria perdido.
    return res.status(500).json({ error: 'Webhook handler failed.' });
  }

  res.json({ received: true });
});

/**
 * Handle checkout.session.completed
 */
async function handleCheckoutCompleted(session) {
  // Metadata gravado em stripe.js usa snake_case: store_id, billing_interval
  const storeId = parseInt(session.metadata?.store_id);
  const planKey = session.metadata?.plan_key;
  const billingInterval = session.metadata?.billing_interval;

  if (!storeId || !planKey) {
    console.error('checkout.session.completed missing metadata:', session.metadata);
    return;
  }

  const stripeSubscriptionId = session.subscription;

  // Update store plan
  await prisma.store.update({
    where: { id: storeId },
    data: { plan: planKey },
  });

  // Upsert subscription
  await prisma.subscription.upsert({
    where: { storeId },
    update: {
      stripeSubscriptionId,
      status: 'active',
      planKey,
      billingInterval,
      cancelAtPeriodEnd: false,
    },
    create: {
      storeId,
      stripeSubscriptionId,
      status: 'active',
      planKey,
      billingInterval,
    },
  });

  console.log(`Store ${storeId} upgraded to ${planKey} (${billingInterval})`);
}

/**
 * Handle invoice.paid — record invoice + calculate commission
 */
async function handleInvoicePaid(invoice) {
  const customerId = invoice.customer;
  const amountPaid = (invoice.amount_paid || 0) / 100;

  // Find store by Stripe customer ID
  const store = await prisma.store.findFirst({
    where: { stripeCustomerId: customerId },
  });

  if (!store) {
    console.error('invoice.paid: store not found for customer:', customerId);
    return;
  }

  // Record invoice
  await prisma.invoice.upsert({
    where: { stripeInvoiceId: invoice.id },
    update: {
      amountPaid,
      status: invoice.status,
      invoiceUrl: invoice.hosted_invoice_url || null,
      invoicePdf: invoice.invoice_pdf || null,
    },
    create: {
      storeId: store.id,
      stripeInvoiceId: invoice.id,
      amountPaid,
      currency: invoice.currency || 'brl',
      status: invoice.status,
      invoiceUrl: invoice.hosted_invoice_url || null,
      invoicePdf: invoice.invoice_pdf || null,
      periodStart: invoice.period_start ? new Date(invoice.period_start * 1000) : null,
      periodEnd: invoice.period_end ? new Date(invoice.period_end * 1000) : null,
    },
  });

  // Calculate commission if store has a partner
  if (store.partnerId && amountPaid > 0) {
    const appSlug = process.env.APP_SLUG || 'meuapp';

    // Look up commission rate from AdminPlan
    const plan = await prisma.adminPlan.findFirst({
      where: { appId: appSlug, name: store.plan, isActive: true },
    });

    const commissionRate = plan ? plan.commissionRate : 0;

    if (commissionRate > 0) {
      // Idempotência por invoiceId. O guard findFirst evita o caso comum, e a
      // constraint @@unique([invoiceId]) + catch P2002 cobre a corrida concorrente
      // (duas reentregas simultâneas passam pelo findFirst antes de qualquer create).
      const existing = await prisma.adminCommission.findFirst({
        where: { invoiceId: invoice.id },
      });

      if (existing) {
        console.log(`Commission already recorded for invoice ${invoice.id}, skipping`);
      } else {
        const commissionAmount = amountPaid * commissionRate;

        try {
          await prisma.adminCommission.create({
            data: {
              partnerId: store.partnerId,
              partnerName: store.partnerName || null,
              storeId: store.id,
              invoiceId: invoice.id,
              amount: amountPaid,
              commissionRate,
              commissionAmount,
              status: 'pending',
            },
          });

          console.log(
            `Commission created: ${commissionAmount.toFixed(2)} for partner ${store.partnerId} (store ${store.id})`
          );
        } catch (e) {
          if (e.code === 'P2002') {
            console.log(`Commission race for invoice ${invoice.id} — já criada por outra entrega, ignorando`);
          } else {
            throw e;
          }
        }
      }
    }
  }

  console.log(`Invoice recorded: ${invoice.id} for store ${store.id}`);
}

/**
 * Handle customer.subscription.updated
 */
async function handleSubscriptionUpdated(subscription) {
  // Metadata gravado em stripe.js usa snake_case: store_id, billing_interval
  const storeId = parseInt(subscription.metadata?.store_id);
  if (!storeId) return;

  const planKey = subscription.metadata?.plan_key;

  await prisma.subscription.upsert({
    where: { storeId },
    update: {
      status: subscription.status,
      planKey: planKey || undefined,
      billingInterval: subscription.metadata?.billing_interval || undefined,
      cancelAtPeriodEnd: subscription.cancel_at_period_end,
      currentPeriodStart: new Date(subscription.current_period_start * 1000),
      currentPeriodEnd: new Date(subscription.current_period_end * 1000),
    },
    create: {
      storeId,
      stripeSubscriptionId: subscription.id,
      status: subscription.status,
      planKey,
      billingInterval: subscription.metadata?.billing_interval,
      cancelAtPeriodEnd: subscription.cancel_at_period_end,
      currentPeriodStart: new Date(subscription.current_period_start * 1000),
      currentPeriodEnd: new Date(subscription.current_period_end * 1000),
    },
  });

  // Update store plan if changed
  if (planKey) {
    await prisma.store.update({
      where: { id: storeId },
      data: { plan: planKey },
    });
  }

  console.log(`Subscription updated for store ${storeId}: ${subscription.status}`);
}

/**
 * Handle customer.subscription.deleted
 */
async function handleSubscriptionDeleted(subscription) {
  const storeId = parseInt(subscription.metadata?.store_id);
  if (!storeId) return;

  await prisma.subscription.update({
    where: { storeId },
    data: {
      status: 'canceled',
      cancelAtPeriodEnd: false,
    },
  });

  await prisma.store.update({
    where: { id: storeId },
    data: { plan: 'starter' },
  });

  console.log(`Subscription deleted for store ${storeId}, reverted to starter`);
}

module.exports = router;
