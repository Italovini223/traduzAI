require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function main() {
  const email = process.env.ADMIN_SEED_EMAIL;
  const password = process.env.ADMIN_SEED_PASSWORD;
  const appSlug = process.env.APP_SLUG || 'meuapp';

  if (!email || !password) {
    console.error('ADMIN_SEED_EMAIL and ADMIN_SEED_PASSWORD must be set in .env');
    process.exit(1);
  }

  if (password.length < 12) {
    console.error('ADMIN_SEED_PASSWORD must be at least 12 characters');
    process.exit(1);
  }

  const passwordHash = await bcrypt.hash(password, 12);

  // Upsert admin user
  const admin = await prisma.adminUser.upsert({
    where: { email },
    update: { passwordHash, name: 'Administrador', role: 'proprietario' },
    create: {
      name: 'Administrador',
      email,
      passwordHash,
      role: 'proprietario',
      isActive: true,
    },
  });
  console.log(`Admin user upserted: ${admin.email} (id: ${admin.id})`);

  // Upsert 3 default plans
  const plans = [
    {
      appId: appSlug,
      name: 'starter',
      stripePriceIds: {},
      // Features como array de strings legíveis — exibidas diretamente nos cards de plano
      features: [
        'Funcionalidades básicas',
        'Até 50 produtos',
        'Suporte por e-mail',
      ],
      price: { monthly: 0, semestral: 0, annual: 0 },
      commissionRate: 0,
      revenueShareRate: 0,
      isActive: true,
      sortOrder: 0,
    },
    {
      appId: appSlug,
      name: 'growth',
      stripePriceIds: {
        monthly: process.env.STRIPE_PRICE_GROWTH_MONTHLY || '',
        semestral: process.env.STRIPE_PRICE_GROWTH_SEMESTRAL || '',
        annual: process.env.STRIPE_PRICE_GROWTH_ANNUAL || '',
      },
      features: [
        'Tudo do Starter',
        'Até 500 produtos',
        'Analytics avançado',
        'Suporte prioritário',
      ],
      price: { monthly: 49.9, semestral: 39.9, annual: 29.9 },
      commissionRate: 0.20,
      revenueShareRate: 0,
      isActive: true,
      sortOrder: 1,
    },
    {
      appId: appSlug,
      name: 'scale',
      stripePriceIds: {
        monthly: process.env.STRIPE_PRICE_SCALE_MONTHLY || '',
        semestral: process.env.STRIPE_PRICE_SCALE_SEMESTRAL || '',
        annual: process.env.STRIPE_PRICE_SCALE_ANNUAL || '',
      },
      features: [
        'Tudo do Growth',
        'Produtos ilimitados',
        'Branding personalizado',
        'Gerente de conta dedicado',
        'SLA garantido',
      ],
      price: { monthly: 99.9, semestral: 79.9, annual: 59.9 },
      commissionRate: 0.15,
      revenueShareRate: 0,
      isActive: true,
      sortOrder: 2,
    },
  ];

  for (const plan of plans) {
    const upserted = await prisma.adminPlan.upsert({
      where: { appId_name: { appId: plan.appId, name: plan.name } },
      update: {
        // IMPORTANTE: isActive NÃO é atualizado pelo seed para preservar configurações do admin.
        // Se o admin desativou um plano, o seed não deve reativá-lo.
        // Somente o painel admin deve controlar isActive.
        stripePriceIds: plan.stripePriceIds,
        features: plan.features,
        price: plan.price,
        commissionRate: plan.commissionRate,
        revenueShareRate: plan.revenueShareRate,
        sortOrder: plan.sortOrder,
      },
      create: plan,
    });
    console.log(`Plan upserted: ${upserted.name} (id: ${upserted.id})`);
  }

  // Upsert trial config defaults — só cria se não existe; nunca sobrescreve valores do admin
  const trialDefaults = [
    {
      key: 'trial_mode',
      value: 'none',
      group: 'trial',
      label: 'Modo de Trial (none | free | paid)',
    },
    {
      key: 'trial_days',
      value: '7',
      group: 'trial',
      label: 'Duração do Trial (dias)',
    },
    {
      key: 'trial_coupon',
      value: '',
      group: 'trial',
      label: 'Código do Cupom Stripe (trial_mode=paid)',
    },
  ];

  for (const cfg of trialDefaults) {
    await prisma.adminConfig.upsert({
      where: { key: cfg.key },
      update: {}, // nunca sobrescreve — admin gerencia via painel
      create: cfg,
    });
    console.log(`Config upserted: ${cfg.key}`);
  }

  // Goal defaults (dashboard targets + server cost)
  const goalDefaults = [
    { key: 'goal_stores', value: '0', group: 'goals', label: 'Meta de Lojas (total)' },
    { key: 'goal_subs', value: '0', group: 'goals', label: 'Meta de Assinaturas Ativas' },
    { key: 'goal_trial', value: '0', group: 'goals', label: 'Meta de Em Trial' },
    { key: 'goal_mrr', value: '0', group: 'goals', label: 'Meta de MRR (R$)' },
    { key: 'server_cost', value: '0', group: 'goals', label: 'Custo de Servidor Mensal (R$)' },
  ];

  for (const cfg of goalDefaults) {
    await prisma.adminConfig.upsert({
      where: { key: cfg.key },
      update: {},
      create: cfg,
    });
    console.log(`Config upserted: ${cfg.key}`);
  }

  // Support config defaults (FAQ sidebar)
  const supportDefaults = [
    { key: 'support_video_url', value: '', group: 'support', label: 'URL do Vídeo Principal de Apresentação' },
    { key: 'support_whatsapp', value: '', group: 'support', label: 'Número do WhatsApp de Suporte (ex: 5511999999999)' },
    { key: 'support_notify_email', value: '', group: 'support', label: 'E-mail para notificação de novos tickets (requer RESEND_API_KEY)' },
  ];

  for (const cfg of supportDefaults) {
    await prisma.adminConfig.upsert({
      where: { key: cfg.key },
      update: {},
      create: cfg,
    });
    console.log(`Config upserted: ${cfg.key}`);
  }

  // Stripe mode default — flag test/live (as chaves ficam no env, nunca no banco)
  const stripeDefaults = [
    { key: 'stripe_mode', value: 'test', group: 'stripe', label: 'Modo Stripe (test/live)' },
  ];

  for (const cfg of stripeDefaults) {
    await prisma.adminConfig.upsert({
      where: { key: cfg.key },
      update: {}, // nunca sobrescreve — admin gerencia via toggle
      create: cfg,
    });
    console.log(`Config upserted: ${cfg.key}`);
  }

  console.log('Seed completed successfully.');
}

main()
  .catch((e) => {
    console.error('Seed failed:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
