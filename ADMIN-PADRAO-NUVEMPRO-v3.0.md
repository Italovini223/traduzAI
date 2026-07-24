# NUVEMPRO — Padrao Completo de Apps Nuvemshop v3.0

> **v3.0 — Marco 2026 — Eri Cabral / Weethub**
>
> Este documento instrui a IA (Claude) na criacao COMPLETA de um app SaaS embedado
> na Nuvemshop com painel administrativo isolado. Cobre desde o setup ate o deploy.
> Baseado 100% nos padroes validados no PostAI.
>
> **Changelog v3.0:**
> - Documento expandido: agora cobre TODO o ciclo (app + admin + billing + deploy)
> - Fases numeradas e sequenciais — cada fase deve ser validada antes de avancar
> - Templates de codigo reais extraidos do PostAI
> - Stripe auto-sync com badge de verificacao
> - Comissao por plano + Revenue Share
> - Checklist de validacao por fase
> - Troubleshooting completo

---

## INDICE

1. [Visao Geral e Arquitetura](#1-visao-geral-e-arquitetura)
2. [Pre-requisitos](#2-pre-requisitos)
3. [Fase 1 — Estrutura do Projeto](#3-fase-1--estrutura-do-projeto)
4. [Fase 2 — Backend Base](#4-fase-2--backend-base)
5. [Fase 3 — Integracao Nuvemshop (OAuth + Nexo)](#5-fase-3--integracao-nuvemshop)
6. [Fase 4 — Frontend App Embedado](#6-fase-4--frontend-app-embedado)
7. [Fase 5 — Termos de Uso + Onboarding](#7-fase-5--termos--onboarding)
8. [Fase 6 — Stripe Billing](#8-fase-6--stripe-billing)
9. [Fase 7 — Admin Backend](#9-fase-7--admin-backend)
10. [Fase 8 — Admin Frontend](#10-fase-8--admin-frontend)
11. [Fase 9 — Stripe Auto-Sync](#11-fase-9--stripe-auto-sync)
12. [Fase 10 — Comissoes e Revenue Share](#12-fase-10--comissoes-e-revenue-share)
13. [Fase 11 — Deploy](#13-fase-11--deploy)
14. [Fase 12 — Checklist Final](#14-fase-12--checklist-final)
15. [Apendice A — Schema Prisma Completo](#15-apendice-a--schema-prisma)
16. [Apendice B — Variaveis de Ambiente](#16-apendice-b--variaveis-de-ambiente)
17. [Apendice C — Convencoes de Codigo](#17-apendice-c--convencoes)
18. [Apendice D — Troubleshooting](#18-apendice-d--troubleshooting)

---

## 1. Visao Geral e Arquitetura

### O que este documento cria

Um app SaaS completo com duas interfaces:

**App (Tenant / Lojista):**
- Instalacao via OAuth Nuvemshop (embedado no admin da loja)
- Tela de Termos de Uso (gate obrigatorio)
- Onboarding configuravel (multi-step)
- Menu superior padrao: Dashboard, Assinatura, Suporte, Idioma
- Billing completo via Stripe (trial + 3 planos x 3 intervalos)
- i18n nativo (pt-BR, es-AR, es-MX)
- O conteudo especifico do app sera adicionado APOS a base concluida

**Admin (Interno / Operacao):**
- Login isolado com JWT proprio
- Dashboard com metricas
- 11 modulos: Lojas, Planos, Assinaturas, Cupons, Comissoes, Termos, FAQ, Logs, Seguranca, Configuracoes
- Stripe auto-sync (cria Product + Prices automaticamente)
- Comissao por plano + revenue share

### Stack Padrao

| Camada | Tecnologia |
|--------|-----------|
| Frontend App | React 18 + Vite + @nimbus-ds (Nuvemshop DS) |
| Frontend Admin | React 18 + Vite + Tailwind CSS + Lucide icons |
| Backend | Node.js + Express 4 |
| ORM | Prisma 6 + PostgreSQL (Neon) |
| Billing | Stripe (subscriptions + webhooks) |
| Auth App | Nuvemshop Nexo SDK + JWT |
| Auth Admin | JWT isolado + bcryptjs + AdminSession |
| i18n | i18next + react-i18next |
| Deploy | Railway (backend) + Vercel (frontends) |
| Fila (opcional) | BullMQ + Redis (Upstash) |

### Diagrama de Arquitetura

```
Nuvemshop Admin (iframe)
    |
    v
[Frontend App :5173]  <--- Nexo SDK (session token)
    |                         |
    |  proxy /api             |
    v                         v
[Backend :3001]         [Stripe Checkout]
    |                         |
    +---> PostgreSQL          |
    +---> Redis (opcional)    |
    +---> Stripe API <--------+
    +---> /webhook (raw body)

[Admin Frontend :5174] <--- JWT isolado
    |
    |  proxy /admin-api
    v
[Backend :3001 /admin-api/*]
    +---> AdminUser, AdminSession, AdminPlan...
    +---> Stripe API (sync, verify)
```

### Regras Absolutas

1. **Isolamento de tenant**: Toda query do app DEVE filtrar por `storeId`
2. **Admin isolado**: JWT, tabelas e middleware SEPARADOS do app
3. **Webhook raw body**: `express.raw()` ANTES de `express.json()` no server.js
4. **Nuvemshop header**: `Authentication` (nao `Authorization`)
5. **i18n obrigatorio**: Nenhuma string visivel hardcoded
6. **Prisma singleton**: Importar de `lib/prisma.js`, nunca instanciar novo
7. **Log de acoes admin**: Toda mutacao gera AdminLog
8. **Fases sequenciais**: Cada fase deve ser validada antes de iniciar a proxima

---

## 2. Pre-requisitos

### Contas Necessarias

| Recurso | URL | Para que |
|---------|-----|---------|
| Nuvemshop Partners | partners.nuvemshop.com.br | App ID, Client ID/Secret |
| Stripe | dashboard.stripe.com | Billing, webhooks |
| Railway | railway.app | Backend deploy |
| Vercel | vercel.com | Frontend deploy |
| Neon | neon.tech | PostgreSQL serverless |
| Upstash | upstash.com | Redis (se usar fila) |

### Ferramentas Locais

```bash
node >= 18.x
npm >= 9.x
npx prisma    # Prisma CLI
git
stripe        # Stripe CLI (para testar webhooks local)
```

### Configurar App na Nuvemshop Partners

1. Criar app no painel de parceiros
2. Anotar: `NUVEMSHOP_APP_ID`, `NUVEMSHOP_CLIENT_ID`, `NUVEMSHOP_CLIENT_SECRET`
3. Configurar:
   - **Redirect URI**: `https://backend.railway.app/auth/callback`
   - **Tipo**: App embedado
   - **Scopes**: `read_products write_products read_content write_content` (minimo)

---

## 3. Fase 1 — Estrutura do Projeto

### Criar Monorepo

```bash
mkdir nome-do-app && cd nome-do-app
mkdir backend frontend admin-frontend
git init
```

### Arvore Final de Diretorios

```
nome-do-app/
├── CLAUDE.md                          # Instrucoes para o Claude
├── .claude/
│   ├── CONTEXT.md                     # Arquitetura e decisoes
│   ├── DECISIONS.md                   # ADRs
│   ├── CONVENTIONS.md                 # Padroes de codigo
│   └── TASKS.md                       # Tracking de tarefas
├── backend/
│   ├── package.json
│   ├── .env / .env.example
│   ├── prisma/
│   │   ├── schema.prisma
│   │   └── seed-admin.js
│   └── src/
│       ├── server.js                  # Entry point Express
│       ├── config/
│       │   ├── db.js                  # (alias para lib/prisma)
│       │   ├── nuvemshop.js           # OAuth + API client
│       │   ├── stripe.js              # StripeService
│       │   └── plans.js               # Price ID → planKey map
│       ├── lib/
│       │   └── prisma.js              # Prisma singleton
│       ├── middleware/
│       │   ├── auth.js                # requireAuth (JWT app)
│       │   └── validate.js            # Input validation
│       ├── routes/
│       │   ├── auth.js                # OAuth callback + verify
│       │   ├── billing.js             # Checkout, status, portal
│       │   ├── webhook.js             # Stripe webhooks
│       │   ├── terms.js               # Terms status/accept
│       │   └── profile.js             # Store profile CRUD
│       └── admin/
│           ├── middleware/
│           │   ├── adminAuth.js       # JWT admin + session
│           │   └── requireRole.js     # Role hierarchy
│           ├── routes/
│           │   ├── adminAuth.js       # Login/logout/me
│           │   ├── adminPlans.js      # CRUD + Stripe sync
│           │   ├── adminCustomers.js  # Stores list/detail
│           │   ├── adminSubscriptions.js
│           │   ├── adminCoupons.js
│           │   ├── adminCommissions.js
│           │   ├── adminTerms.js
│           │   ├── adminFaq.js
│           │   ├── adminLogs.js
│           │   ├── adminSecurity.js   # Admin users CRUD
│           │   └── adminConfig.js     # Key-value settings
│           └── services/
│               ├── adminPlanService.js    # + syncToStripe, verifyStripeIds
│               ├── adminLogService.js     # Audit logging
│               └── ... (1 service por entidade)
├── frontend/
│   ├── package.json
│   ├── vite.config.js
│   ├── index.html
│   └── src/
│       ├── main.jsx                   # Root + session_token detect
│       ├── App.jsx                    # Routing + gates (terms→billing→onboarding)
│       ├── i18n/
│       │   ├── index.js              # i18next config
│       │   ├── dateFnsLocale.js      # date-fns locale map
│       │   └── locales/
│       │       ├── pt-BR.json
│       │       ├── es-AR.json
│       │       └── es-MX.json
│       ├── providers/
│       │   └── NexoProvider.jsx       # Auth + billing gate + token refresh
│       ├── services/
│       │   └── api.js                 # Axios + interceptors + retry 401
│       ├── hooks/
│       │   ├── useApi.js              # Generic API hook
│       │   └── useProfile.js          # Profile CRUD hook
│       ├── components/
│       │   ├── AppNav.jsx             # Top nav + support sidebar
│       │   ├── Layout.jsx             # Outlet wrapper
│       │   ├── LanguageSwitcher.jsx   # i18n selector
│       │   ├── ErrorBoundary.jsx
│       │   ├── LoadingState.jsx
│       │   └── EmptyState.jsx
│       └── pages/
│           ├── InstallSuccess.jsx     # OAuth callback page
│           ├── TermsPage.jsx          # Scroll-gated acceptance
│           ├── Onboarding.jsx         # Multi-step form
│           ├── Dashboard.jsx          # Main page
│           ├── Settings.jsx           # Profile + integrations
│           └── BillingPage.jsx        # Plans + invoices + portal
└── admin-frontend/
    ├── package.json
    ├── vite.config.js
    ├── tailwind.config.js
    ├── postcss.config.js
    ├── index.html
    └── src/
        ├── main.jsx
        ├── App.jsx                    # Routes + AuthProvider
        ├── index.css                  # Tailwind imports
        ├── services/
        │   └── adminApi.js            # Axios + JWT injection + 401 redirect
        ├── providers/
        │   └── AuthProvider.jsx       # Admin auth context
        ├── components/
        │   ├── layout/
        │   │   ├── AdminLayout.jsx    # Sidebar + Outlet (protected)
        │   │   └── Sidebar.jsx        # 11 nav items + logout
        │   ├── StatCard.jsx           # Metric card
        │   └── DataTable.jsx          # Generic paginated table
        └── pages/
            ├── LoginPage.jsx
            ├── DashboardPage.jsx      # Stats + charts (Recharts)
            ├── CustomersPage.jsx      # Stores list + tabs + search
            ├── CustomerDetailPage.jsx # Store detail + actions
            ├── PlansPage.jsx          # Cards + Stripe sync + badges
            ├── SubscriptionsPage.jsx  # Metrics + list + actions
            ├── CouponsPage.jsx        # CRUD + types
            ├── CommissionsPage.jsx    # Summary + approve + pay
            ├── TermsPage.jsx          # Version CRUD + publish
            ├── FaqPage.jsx            # Category CRUD
            ├── LogsPage.jsx           # 4 tabs (activity/errors/usage/abuse)
            ├── SecurityPage.jsx       # Admin users + roles
            └── SettingsPage.jsx       # Dynamic config + change password
```

### Validacao Fase 1

- [ ] 3 diretorios criados (backend, frontend, admin-frontend)
- [ ] git init executado
- [ ] .gitignore com: `node_modules`, `.env`, `dist`, `.prisma`

---

## 4. Fase 2 — Backend Base

### 4.1 Inicializar

```bash
cd backend
npm init -y
npm install express cors dotenv jsonwebtoken bcryptjs @prisma/client stripe axios
npm install -D prisma nodemon
```

### 4.2 package.json scripts

```json
{
  "scripts": {
    "dev": "nodemon src/server.js",
    "start": "node src/server.js",
    "db:push": "npx prisma db push",
    "db:generate": "npx prisma generate",
    "db:seed": "node prisma/seed-admin.js",
    "db:studio": "npx prisma studio"
  }
}
```

### 4.3 server.js — Entry Point

```javascript
require('dotenv').config();
const express = require('express');
const cors = require('cors');

const app = express();

// !! CRITICO: webhook raw body ANTES de json parser
app.use('/webhook', express.raw({ type: 'application/json' }));
app.use(express.json({ limit: '10mb' }));

// CORS
const allowedOrigins = [
  process.env.FRONTEND_URL,
  process.env.ADMIN_FRONTEND_URL,
  'http://localhost:5173',
  'http://localhost:5174',
].filter(Boolean);

app.use(cors({
  origin: (origin, cb) => {
    if (!origin || allowedOrigins.some(o => origin.startsWith(o))) cb(null, true);
    else cb(null, false);
  },
  credentials: true,
}));

// Health
app.get('/health', (_, res) => res.json({ ok: true }));

// === ROTAS APP (tenant) ===
app.use('/auth', require('./routes/auth'));
app.use('/webhook', require('./routes/webhook'));

const { requireAuth } = require('./middleware/auth');
app.use('/api/billing', requireAuth, require('./routes/billing'));
app.use('/api/terms', requireAuth, require('./routes/terms'));
app.use('/api/profile', requireAuth, require('./routes/profile'));
// ... (adicionar rotas especificas do app aqui)

// === ROTAS ADMIN ===
const adminAuth = require('./admin/middleware/adminAuth');
app.use('/admin-api/health', (_, res) => res.json({ ok: true, admin: true }));
app.use('/admin-api/auth', require('./admin/routes/adminAuth'));
app.use('/admin-api/plans', adminAuth, require('./admin/routes/adminPlans'));
app.use('/admin-api/customers', adminAuth, require('./admin/routes/adminCustomers'));
app.use('/admin-api/subscriptions', adminAuth, require('./admin/routes/adminSubscriptions'));
app.use('/admin-api/coupons', adminAuth, require('./admin/routes/adminCoupons'));
app.use('/admin-api/commissions', adminAuth, require('./admin/routes/adminCommissions'));
app.use('/admin-api/terms', adminAuth, require('./admin/routes/adminTerms'));
app.use('/admin-api/faq', adminAuth, require('./admin/routes/adminFaq'));
app.use('/admin-api/logs', adminAuth, require('./admin/routes/adminLogs'));
app.use('/admin-api/admins', adminAuth, require('./admin/routes/adminSecurity'));
app.use('/admin-api/config', adminAuth, require('./admin/routes/adminConfig'));

// Error handler global
app.use((err, req, res, next) => {
  console.error('[ERROR]', err.message);
  res.status(err.status || 500).json({ error: err.message || 'Erro interno' });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`Server :${PORT}`));
```

### 4.4 lib/prisma.js — Singleton

```javascript
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
});
module.exports = { prisma };
```

### 4.5 middleware/auth.js — JWT do App

```javascript
const jwt = require('jsonwebtoken');
const { prisma } = require('../lib/prisma');

async function requireAuth(req, res, next) {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) return res.status(401).json({ error: 'Token ausente' });

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const store = await prisma.store.findUnique({ where: { id: decoded.storeId } });
    if (!store) return res.status(401).json({ error: 'Loja nao encontrada' });

    req.store = store;
    next();
  } catch {
    res.status(401).json({ error: 'Token invalido' });
  }
}

module.exports = { requireAuth };
```

### Validacao Fase 2

```bash
npm run dev
curl http://localhost:3001/health  # {"ok":true}
```

- [ ] Server inicia sem erros na porta 3001
- [ ] /health retorna 200

---

## 5. Fase 3 — Integracao Nuvemshop

### 5.1 config/nuvemshop.js — OAuth + API Client

```javascript
const axios = require('axios');

const AUTH_URL = 'https://www.tiendanube.com/apps/authorize/token';
const API_BASE = 'https://api.tiendanube.com/v1';

async function exchangeCodeForToken(code) {
  const { data } = await axios.post(AUTH_URL, {
    client_id: process.env.NUVEMSHOP_CLIENT_ID,
    client_secret: process.env.NUVEMSHOP_CLIENT_SECRET,
    grant_type: 'authorization_code',
    code,
  });
  return data; // { access_token, user_id, ... }
}

function nuvemshopApi(storeNuvemshopId, accessToken) {
  return axios.create({
    baseURL: `${API_BASE}/${storeNuvemshopId}`,
    headers: {
      'Authentication': `bearer ${accessToken}`,  // !! ATENCAO: "Authentication" nao "Authorization"
      'Content-Type': 'application/json',
      'User-Agent': `${process.env.APP_NAME} (${process.env.APP_EMAIL})`,
    },
  });
}

module.exports = { exchangeCodeForToken, nuvemshopApi };
```

### 5.2 routes/auth.js — OAuth Flow Completo

```javascript
const { Router } = require('express');
const jwt = require('jsonwebtoken');
const { prisma } = require('../lib/prisma');
const { exchangeCodeForToken } = require('../config/nuvemshop');
const router = Router();

// Callback OAuth (Nuvemshop redireciona aqui)
router.get('/callback', async (req, res) => {
  try {
    const { code } = req.query;
    if (!code) return res.status(400).send('Codigo ausente');

    const tokenData = await exchangeCodeForToken(code);
    const nuvemshopId = String(tokenData.user_id);

    const store = await prisma.store.upsert({
      where: { nuvemshopId },
      update: { accessToken: tokenData.access_token, name: tokenData.store_name || null },
      create: {
        nuvemshopId,
        accessToken: tokenData.access_token,
        name: tokenData.store_name || null,
        plan: 'starter',
        trialEndsAt: new Date(Date.now() + (parseInt(process.env.TRIAL_DAYS) || 7) * 86400000),
      },
    });

    const token = jwt.sign(
      { storeId: store.id, nuvemshopId },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );

    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    res.redirect(`${frontendUrl}?session_token=${token}`);
  } catch (err) {
    console.error('[Auth] Callback error:', err.message);
    res.status(500).send('Erro na autenticacao');
  }
});

// Verifica token (chamado pelo frontend)
router.post('/verify-token', async (req, res) => {
  try {
    const { token } = req.body;
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const store = await prisma.store.findUnique({ where: { id: decoded.storeId } });
    if (!store) return res.status(404).json({ error: 'Loja nao encontrada' });
    res.json({ token, store: { id: store.id, name: store.name, plan: store.plan } });
  } catch {
    res.status(401).json({ error: 'Token invalido' });
  }
});

// Dev token (apenas em desenvolvimento)
router.get('/dev-token', async (req, res) => {
  if (process.env.NODE_ENV === 'production') return res.status(403).end();
  const store = await prisma.store.findFirst();
  if (!store) return res.status(404).json({ error: 'Nenhuma loja' });
  const token = jwt.sign({ storeId: store.id, nuvemshopId: store.nuvemshopId }, process.env.JWT_SECRET, { expiresIn: '24h' });
  res.json({ token, store });
});

module.exports = router;
```

### 5.3 Fluxo de Instalacao

```
1. Lojista → "Instalar" no marketplace Nuvemshop
2. Nuvemshop → GET /auth/callback?code=XXX
3. Backend troca code por access_token
4. Upsert Store no banco (cria com trial ou atualiza token)
5. Gera JWT → redireciona para frontend?session_token=JWT
6. Frontend detecta param → POST /auth/verify-token
7. Armazena token → inicia app
```

### Validacao Fase 3

- [ ] /auth/dev-token retorna JWT + store
- [ ] Store criada no banco com trial

---

## 6. Fase 4 — Frontend App Embedado

### 6.1 Inicializar

```bash
cd frontend
npm create vite@latest . -- --template react
npm install @nimbus-ds/components @nimbus-ds/styles @tiendanube/nexo
npm install axios react-router-dom i18next react-i18next date-fns
```

### 6.2 vite.config.js

```javascript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': { target: 'http://localhost:3001', changeOrigin: true },
      '/auth': { target: 'http://localhost:3001', changeOrigin: true },
    },
  },
});
```

### 6.3 services/api.js — Axios + Token Refresh

```javascript
import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '',
  withCredentials: false,
});

let tokenRefresher = null;
let onUnauthorized = null;

export function setSessionToken(t) {
  if (t) api.defaults.headers.common['Authorization'] = `Bearer ${t}`;
  else delete api.defaults.headers.common['Authorization'];
}
export function setTokenRefresher(fn) { tokenRefresher = fn; }
export function setOnUnauthorized(fn) { onUnauthorized = fn; }

// 401 → refresh token → retry
api.interceptors.response.use(
  (r) => r,
  async (err) => {
    if (err.response?.status === 401 && !err.config._retry) {
      err.config._retry = true;
      if (tokenRefresher) {
        try {
          const t = await tokenRefresher();
          if (t) { err.config.headers['Authorization'] = `Bearer ${t}`; return api(err.config); }
        } catch {}
      }
      delete api.defaults.headers.common['Authorization'];
      onUnauthorized?.();
    }
    return Promise.reject(err);
  }
);

export default api;
```

### 6.4 NexoProvider.jsx — Auth + Gates

```javascript
// Responsabilidades:
// 1. Detecta se esta no iframe Nuvemshop (isEmbedded)
// 2. Em dev: GET /auth/dev-token
// 3. Em prod: Nexo SDK getSessionToken()
// 4. Bloqueia acesso direto (fora do iframe)
// 5. Carrega billing status + terms status
// 6. Refresh proativo a cada 20 min
// 7. Expoe: store, billingStatus, termsAccepted via Context

// Deteccao de iframe:
const isEmbedded = (() => {
  try {
    if (window.self === window.top) return false;
    const ref = document.referrer || '';
    return ref.includes('nuvemshop') || ref.includes('tiendanube');
  } catch { return true; }
})();
```

### 6.5 App.jsx — Roteamento + Ordem dos Gates

```javascript
// ORDEM OBRIGATORIA DOS GATES:
// 1. Termos de Uso → bloqueia tudo ate aceitar
// 2. Billing → bloqueia se trial expirado / cancelado (mostra so BillingPage)
// 3. Onboarding → bloqueia se perfil nao criado
// 4. App principal (rotas normais)

export default function App() {
  const { billingStatus, termsAccepted, setTermsAccepted } = useNexo();
  const { hasProfile, createProfile, loading } = useProfile();

  if (loading) return <LoadingState />;
  if (termsAccepted === false) return <TermsPage onAccepted={() => setTermsAccepted(true)} />;
  if (billingStatus && !billingStatus.hasAccess) return <BillingPage locked />;
  if (!hasProfile) return <Onboarding onComplete={createProfile} />;

  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<Dashboard />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/billing" element={<BillingPage />} />
        {/* Adicionar rotas especificas do app AQUI */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
```

### 6.6 AppNav.jsx — Menu Superior Padrao

```javascript
// Itens base (SEMPRE presentes em qualquer app):
// - Dashboard (/)
// - [Itens especificos do app serao adicionados aqui]
// - Assinatura (/billing) — direita
// - Suporte (abre sidebar) — direita
// - Idioma (LanguageSwitcher) — direita

// Sidebar de Suporte contem:
// - WhatsApp link
// - Video tutorial (embed YouTube)
// - FAQ (items do i18n: support.faq returnObjects)
```

### 6.7 i18n — Configuracao

```javascript
// i18n/index.js
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import ptBR from './locales/pt-BR.json';
import esAR from './locales/es-AR.json';
import esMX from './locales/es-MX.json';

export const NUVEMSHOP_LANG_MAP = {
  'pt': 'pt-BR', 'es': 'es-AR', 'es-MX': 'es-MX', 'es-AR': 'es-AR',
};

i18n.use(initReactI18next).init({
  resources: { 'pt-BR': { translation: ptBR }, 'es-AR': { translation: esAR }, 'es-MX': { translation: esMX } },
  lng: 'pt-BR',
  fallbackLng: 'pt-BR',
  interpolation: { escapeValue: false },
});

export default i18n;
```

### 6.8 Componentes Base

| Componente | Funcao |
|-----------|--------|
| Layout.jsx | Box flex + AppNav + Outlet |
| LoadingState.jsx | Spinner central + mensagem |
| EmptyState.jsx | Ilustracao + texto + action button |
| ErrorBoundary.jsx | Catch errors + botao recarregar |
| LanguageSwitcher.jsx | Select com 3 idiomas |

### 6.9 UI Kit — Nimbus DS (Nuvemshop)

```javascript
// Importacoes padrao:
import { Box, Card, Button, Text, Title, Input, Select, Alert,
         Tag, Badge, Spinner, Table, Sidebar, NavTabs } from '@nimbus-ds/components';

// Layout: <Box display="flex" flexDirection="column" gap="4" padding="4">
// Cards: <Card><Card.Header title="..." /><Card.Body>...</Card.Body></Card>
// Buttons: <Button appearance="primary|neutral|danger">Label</Button>
// Status: <Tag appearance="success|warning|danger">Active</Tag>
// Feedback: <Alert appearance="success|danger">Message</Alert>
```

### Validacao Fase 4

```bash
cd frontend && npm run dev
# http://localhost:5173
```

- [ ] Dev server na porta 5173
- [ ] Proxy /api funciona
- [ ] LanguageSwitcher troca idioma
- [ ] Dev token carrega store

---

## 7. Fase 5 — Termos + Onboarding

### 7.1 TermsPage.jsx — Scroll-Gated

```
Padrao:
1. Box com scroll (height fixa, overflowY auto)
2. Conteudo via i18n (terms.s1.title, terms.s1.body, ...)
3. onScroll: detecta final (scrollTop + clientHeight >= scrollHeight - 20)
4. Botao "Aceitar" desabilitado ate chegar ao final
5. POST /api/terms/accept → onAccepted()
```

### 7.2 Onboarding.jsx — Multi-Step

```
Padrao:
1. useState: step (1-3)
2. Step 1: campos do dominio (niche, audience)
3. Step 2: configuracoes (tone, frequency)
4. Step 3: avancado (keywords, URLs)
5. Validacao por step (campos obrigatorios)
6. Submit: POST /api/profile → onComplete() → navigate('/')

IMPORTANTE: campos sao especificos de cada app.
Manter 2-3 steps com validacao progressiva.
```

### Validacao Fase 5

- [ ] Termos aparecem antes de qualquer tela
- [ ] Botao ativa so apos scroll
- [ ] Onboarding cria perfil
- [ ] Apos onboarding, redireciona ao dashboard

---

## 8. Fase 6 — Stripe Billing

### 8.1 config/stripe.js — StripeService

```javascript
// Metodos essenciais:
// getOrCreateCustomer(store) — upsert Stripe Customer
// createCheckoutSession(store, returnUrl, priceId, planKey) — cria sessao
// cancelAllActiveSubscriptions(customerId) — evita duplicacao
// createPortalSession(store, returnUrl) — gestao de pagamento
// getSubscriptionStatus(store) — sync do Stripe + calcula hasAccess

// METADADOS na subscription (essencial para comissao):
subscription_data: {
  metadata: {
    app_id: process.env.NUVEMSHOP_APP_ID,
    app_name: process.env.APP_NAME,
    app_slug: 'slug',
    partner_id: store.partnerId || '',
    partner_name: store.partnerName || '',
    store_id: String(store.id),
    plan_key: planKey || '',  // usado para resolver comissao
  },
}
```

### 8.2 routes/webhook.js — Eventos Stripe

```javascript
// !! CRITICO: req.body deve ser RAW (express.raw no server.js)
// Verificar assinatura: stripe.webhooks.constructEvent(req.body, sig, secret)

// Eventos tratados:
// checkout.session.completed → cria/atualiza Subscription
// invoice.paid → registra Invoice + calcula comissao
// customer.subscription.updated → atualiza status/periodo
// customer.subscription.deleted → marca canceled
```

### 8.3 routes/billing.js — Endpoints App

```
GET  /api/billing/status    → Status + hasAccess
GET  /api/billing/plans     → Planos disponiveis com precos
GET  /api/billing/invoices  → Historico de faturas
POST /api/billing/checkout  → Cria Stripe checkout session
POST /api/billing/portal    → Abre portal de gestao
POST /api/billing/cancel    → Cancela assinatura
```

### 8.4 BillingPage.jsx — Frontend

```
Componentes:
1. Status atual (plano, badge, data renovacao, botao gerenciar)
2. Toggle mensal/semestral/anual
3. Cards de planos (Starter/Growth/Scale) com features
4. Tabela de faturas (numero, data, valor, status, PDF)
5. Botao checkout: abre Stripe em nova aba (window.top para iframe)
```

### 8.5 config/plans.js — Price Map

```javascript
// Popula automaticamente de env vars:
// STRIPE_PRICE_GROWTH_MONTHLY → { planKey: 'growth', interval: 'monthly' }
// STRIPE_PRICE_SCALE_ANNUAL → { planKey: 'scale', interval: 'annual' }
// getPlanByPriceId(priceId) → { planKey, interval } ou null
```

### Validacao Fase 6

```bash
# Terminal 1: backend rodando
# Terminal 2: stripe listen --forward-to localhost:3001/webhook
```

- [ ] Checkout redireciona para Stripe
- [ ] Webhook recebe eventos (verificar logs)
- [ ] Subscription criada no banco apos pagamento
- [ ] /billing/status retorna corretamente
- [ ] Portal Stripe abre

---

## 9. Fase 7 — Admin Backend

### 9.1 Isolamento (CRITICO)

```
JWT:      ADMIN_JWT_SECRET (separado de JWT_SECRET)
Tabelas:  AdminUser, AdminSession (separadas de Store)
Middleware: adminAuth.js (separado de auth.js)
Prefixo:  /admin-api/* (separado de /api/*)
Roles:    proprietario > gerente > suporte
```

### 9.2 admin/middleware/adminAuth.js

```javascript
// 1. Extrai Bearer token do header
// 2. Verifica JWT com ADMIN_JWT_SECRET
// 3. Busca AdminSession ativa + nao expirada no banco
// 4. Verifica admin.isActive
// 5. req.admin = session.admin
// Se qualquer etapa falhar → 401
```

### 9.3 admin/middleware/requireRole.js

```javascript
// Hierarquia: proprietario(3) > gerente(2) > suporte(1)
// requireRole('proprietario', 'gerente') → aceita quem tem nivel >= 2
// Usado em: create plan, delete, impersonate, create admin
```

### 9.4 admin/routes/adminAuth.js

```
POST /admin-api/auth/login
  - Rate limiter: 5 tentativas por IP / 15 min (in-memory)
  - bcrypt.compare(password, hash)
  - Gera JWT (8h)
  - Cria AdminSession no banco
  - Atualiza lastLogin

GET /admin-api/auth/me
  - Retorna admin do token

POST /admin-api/auth/logout
  - Marca AdminSession como inativa
```

### 9.5 admin/services/adminLogService.js

```javascript
// log({ adminId, action, entity, entityId, details, ipAddress, severity })
// Toda mutacao no admin DEVE gerar log
// Severidades: info, warning, error, critical
```

### 9.6 Modulos Admin — Rotas

| Modulo | CRUD | Endpoints Especiais |
|--------|------|---------------------|
| Plans | GET/POST/PUT/DELETE | POST /:id/sync-stripe, GET /:id/verify-stripe |
| Customers | GET (list+detail) | POST /:id/impersonate, POST /:id/extend-trial |
| Subscriptions | GET (list+metrics) | POST /:id/cancel, PUT /:id/extend-trial |
| Coupons | GET/POST/DELETE | — |
| Commissions | GET (list+summary) | PUT /:id/approve, PUT /:id/mark-paid |
| Terms | GET/POST/PUT | POST /:id/publish |
| FAQ | GET/POST/PUT/DELETE | — |
| Logs | GET (4 tabs) | — |
| Security | GET/POST/DELETE | — (admin users) |
| Config | GET/PUT | — (key-value batch) |

### 9.7 prisma/seed-admin.js

```javascript
// 1. Cria AdminUser (proprietario) com bcrypt hash
//    - Email: ADMIN_SEED_EMAIL
//    - Senha: ADMIN_SEED_PASSWORD (minimo 12 chars)
// 2. Cria 3 AdminPlans base:
//    - Starter (free, commission 0, revenue 0)
//    - Growth (R$79/mo, commission 20%, revenue 0)
//    - Scale (R$197/mo, commission 15%, revenue 0)
// 3. Usa upsert para ser idempotente
```

### Validacao Fase 7

```bash
npx prisma db push
npx prisma generate  # !! OBRIGATORIO apos alterar schema
node prisma/seed-admin.js
npm run dev

curl -X POST http://localhost:3001/admin-api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@email.com","password":"senhaSegura123"}'
# Deve retornar { token, admin }
```

- [ ] Login retorna JWT
- [ ] /admin-api/health retorna ok
- [ ] Rotas protegidas retornam 401 sem token
- [ ] requireRole bloqueia por nivel
- [ ] Seed cria admin + 3 planos

---

## 10. Fase 8 — Admin Frontend

### 10.1 Inicializar

```bash
cd admin-frontend
npm create vite@latest . -- --template react
npm install react-router-dom axios recharts lucide-react clsx tailwind-merge
npm install -D tailwindcss postcss autoprefixer
npx tailwindcss init -p
```

### 10.2 vite.config.js

```javascript
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5174,
    proxy: {
      '/admin-api': { target: 'http://localhost:3001', changeOrigin: true },
    },
  },
});
```

### 10.3 services/adminApi.js

```javascript
// Axios instance com:
// - baseURL: '/admin-api' (proxy em dev)
// - Request interceptor: injeta Bearer token do localStorage
// - Response interceptor: 401 → limpa localStorage → redirect /login
```

### 10.4 providers/AuthProvider.jsx

```javascript
// Context com:
// - admin, loading, isAuthenticated
// - login(email, password) → POST /auth/login → localStorage
// - logout() → POST /auth/logout → limpa localStorage
// - No mount: GET /auth/me para validar token existente
```

### 10.5 Sidebar.jsx — 11 Itens

```
Dashboard      → /dashboard       (LayoutDashboard, blue)
Lojas          → /customers       (Store, emerald)
Planos         → /plans           (CreditCard, violet)
Assinaturas    → /subscriptions   (Receipt, sky)
Cupons         → /coupons         (Tag, amber)
Comissoes      → /commissions     (DollarSign, green)
Termos         → /terms           (FileText, orange)
FAQ / Suporte  → /faq             (HelpCircle, pink)
Logs           → /logs            (Activity, red)
Seguranca      → /security        (Shield, indigo)
Configuracoes  → /settings        (Settings, slate)
```

### 10.6 Padroes de UI Admin

**CRUD com Modal:**
```
1. useState: data[], showForm, editing, loading, error
2. useEffect → load() (api.get)
3. Botao "+ Novo" → setShowForm(true), setEditing(null)
4. Card/Row "Editar" → setEditing(item), setShowForm(true)
5. Modal form → api.post (novo) ou api.put (edit) → load() → close
6. Delete → confirm() → api.delete → load()
```

**Lista + Tabs + Paginacao:**
```
1. TABS: [{ key, label }]
2. useState: tab, search, page, data, meta
3. useEffect deps: [tab, search, page]
4. DataTable: columns, rows, meta, onPageChange
```

**Status Badges:**
```
const COLORS = {
  active: 'bg-green-100 text-green-700',
  trial: 'bg-blue-100 text-blue-700',
  canceled: 'bg-red-100 text-red-700',
  expired: 'bg-slate-100 text-slate-500',
};
```

### 10.7 Componentes Reutilizaveis

**StatCard:** titulo, valor, icone, cor de borda, subtitulo
**DataTable:** columns (key, label, render?), rows, meta, onPageChange, loading, emptyText

### Validacao Fase 8

```bash
cd admin-frontend && npm run dev
# http://localhost:5174
```

- [ ] Login funciona
- [ ] Dashboard mostra metricas
- [ ] Sidebar com 11 itens
- [ ] Cada modulo carrega dados
- [ ] Logout funciona

---

## 11. Fase 9 — Stripe Auto-Sync

### Fluxo

```
1. Admin cria plano (nome + precos) → Salvar no DB
2. Card do plano mostra "Nao sincronizado"
3. Admin clica "Sincronizar com Stripe"
4. Backend cria:
   a. 1 Stripe Product (metadata: app_id, plan_key, admin_plan_id)
   b. 1 Stripe Price por intervalo com preco > 0:
      - monthly: recurring { interval: month, interval_count: 1 }
      - semestral: recurring { interval: month, interval_count: 6 }
      - annual: recurring { interval: year, interval_count: 1 }
   c. unit_amount = preco * 100 (centavos BRL)
5. Salva Price IDs no AdminPlan.stripePriceIds
6. Card atualiza para "Sincronizado" (verde)
```

### Endpoints

```
POST /admin-api/plans/:id/sync-stripe    → syncToStripe()
GET  /admin-api/plans/:id/verify-stripe   → verifyStripeIds()
```

### Badge de Verificacao

| Estado | Badge | Cor |
|--------|-------|-----|
| Verificando | Loader + "Verificando..." | cinza |
| Todos validos | CheckCircle + "Sincronizado" | verde |
| Alguns invalidos | AlertTriangle + "Parcial X/Y" | amarelo |
| Nenhum valido | XCircle + "IDs invalidos" | vermelho |
| Sem IDs | "Nao sincronizado" | cinza |

Cada Price ID individual tem icone verde/vermelho ao lado.

### Verificacao no Mount

```javascript
// PlanCard faz GET /verify-stripe no useEffect
// Resultado salvo em state local
// Botao refresh manual re-verifica sem recarregar pagina
```

---

## 12. Fase 10 — Comissoes e Revenue Share

### 12.1 Campos no AdminPlan

```prisma
commissionRate   Float @default(0)  // 0.20 = 20% sobre valor da fatura
revenueShareRate Float @default(0)  // 0.01 = 1% sobre faturamento da loja
```

### 12.2 Comissao do Parceiro (commission)

Percentual pago ao parceiro Nuvemshop sobre cada fatura.

**Hierarquia de resolucao (webhook invoice.paid):**

```
1. plan_key da metadata da subscription Stripe
2. AdminPlan.findFirst({ where: { name: planKey, isActive: true } })
   → usa commissionRate do plano
3. Se nao encontrar: AdminConfig.findUnique({ where: { key: 'commission_default_rate' } })
4. Fallback final: 0.20 (20%)
```

**Registro:**
```javascript
// No webhook invoice.paid:
const commissionAmount = (invoice.amount_paid / 100) * commissionRate;
if (commissionAmount > 0 && metadata.partner_id) {
  await prisma.adminCommission.create({
    data: {
      partnerId: metadata.partner_id,
      storeId: parseInt(metadata.store_id),
      invoiceId: invoice.id,
      amount: invoice.amount_paid / 100,
      commissionRate,
      commissionAmount,
      status: 'pending',
    },
  });
}
```

**Fluxo de aprovacao:**
```
pending → approved (gerente aprova)
approved → paid (proprietario marca como pago)
```

### 12.3 Revenue Share (sobre faturamento)

Percentual cobrado sobre o GMV (faturamento bruto) da loja — independente da assinatura.

**Status atual**: Campo preparado no modelo. Implementacao futura via:
1. Nuvemshop Orders API → pedidos do periodo
2. Calcula faturamento bruto
3. Aplica revenueShareRate do plano
4. Cobra via Stripe usage-based billing ou invoice avulsa

**Quando usar**: Apps com modelo de monetizacao variavel sobre vendas.

### 12.4 Frontend — Exibicao

**Card do plano:**
```
Comissao parceiro — 20% (verde) ou "Sem comissao" (cinza)
Revenue share — 1.5% / fat. (violeta) ou "Sem revenue share" (cinza)
```

**Form do plano:**
- Input numerico para commissionRate (0-1, step 0.01) com preview "= X%"
- Input numerico para revenueShareRate (0-1, step 0.005) com preview "= X%"
- Nota explicativa quando > 0

---

## 13. Fase 11 — Deploy

### 13.1 Railway (Backend)

```
1. Criar projeto → conectar repositorio GitHub
2. Root directory: /backend
3. Start command: npm start
4. Adicionar TODAS as env vars (Apendice B)
5. Apos deploy: prisma db push + seed
```

### 13.2 Vercel (Frontend App)

```
1. Conectar repositorio
2. Root: /frontend
3. Build: npm run build → Output: dist
4. Env vars:
   - VITE_API_URL=https://backend.railway.app
   - VITE_NUVEMSHOP_APP_ID=xxxxx
5. vercel.json com CSP headers para iframe Nuvemshop
```

### 13.3 Vercel (Admin Frontend)

```
1. Mesmo repo, projeto separado
2. Root: /admin-frontend
3. Env vars:
   - VITE_ADMIN_API_URL=https://backend.railway.app/admin-api
```

### 13.4 Stripe Webhook (Producao)

```
Dashboard → Developers → Webhooks
URL: https://backend.railway.app/webhook
Eventos:
  - checkout.session.completed
  - invoice.paid
  - customer.subscription.updated
  - customer.subscription.deleted
Secret → STRIPE_WEBHOOK_SECRET no Railway
```

### 13.5 Nuvemshop App

```
Atualizar no Partners:
- Redirect URI: https://backend.railway.app/auth/callback
- App URL: https://frontend.vercel.app
```

### 13.6 CSP para Iframe

```json
// vercel.json do frontend
{
  "headers": [{
    "source": "/(.*)",
    "headers": [{
      "key": "Content-Security-Policy",
      "value": "frame-ancestors 'self' https://*.nuvemshop.com.br https://*.tiendanube.com https://*.mitiendanube.com"
    }]
  }],
  "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }]
}
```

---

## 14. Fase 12 — Checklist Final

### App (Tenant)

- [ ] OAuth install funciona (Store criada)
- [ ] App renderiza no iframe Nuvemshop
- [ ] Termos aparecem no primeiro acesso
- [ ] Botao aceitar so ativa apos scroll
- [ ] Onboarding completa e cria perfil
- [ ] Dashboard carrega
- [ ] Menu superior com itens base
- [ ] LanguageSwitcher funciona (3 idiomas)
- [ ] Suporte sidebar abre
- [ ] Checkout Stripe funciona
- [ ] Billing status atualiza apos pagamento
- [ ] Portal Stripe abre
- [ ] Trial expira e bloqueia app
- [ ] Cancelamento funciona
- [ ] Acesso direto bloqueado (fora do iframe)

### Admin

- [ ] Login funciona
- [ ] Dashboard com metricas + graficos
- [ ] Lojas: lista, busca, tabs, detalhe
- [ ] Planos: CRUD + Stripe sync + verify badge
- [ ] Assinaturas: metricas, lista, cancelar, estender trial
- [ ] Cupons: CRUD com tipos e validade
- [ ] Comissoes: resumo, lista, aprovar, pagar
- [ ] Termos: CRUD, versoes, publicar
- [ ] FAQ: CRUD com categorias
- [ ] Logs: 4 tabs com paginacao
- [ ] Seguranca: admin CRUD com roles
- [ ] Configuracoes: key-value + trocar senha

### Stripe

- [ ] Webhook recebe eventos (signature OK)
- [ ] Subscription criada no banco
- [ ] Invoice registrada
- [ ] Comissao calculada corretamente
- [ ] Sync de planos cria Product + Prices
- [ ] Verify confirma IDs ativos

### Deploy

- [ ] Backend saudavel (GET /health)
- [ ] Frontend no iframe
- [ ] Admin acessivel
- [ ] CORS OK
- [ ] CSP permite iframe Nuvemshop
- [ ] SSL configurado

---

## 15. Apendice A — Schema Prisma

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

// ═══ APP (Tenant) ═══════════════════════════════════════

model Store {
  id                Int       @id @default(autoincrement())
  nuvemshopId       String    @unique
  name              String?
  domain            String?
  email             String?
  accessToken       String?
  plan              String    @default("starter")
  trialEndsAt       DateTime?
  stripeCustomerId  String?
  partnerId         String?
  partnerName       String?
  createdAt         DateTime  @default(now())
  updatedAt         DateTime  @updatedAt

  subscription      Subscription?
  profile           StoreProfile?
  termsAcceptances  TermsAcceptance[]

  @@map("stores")
}

model StoreProfile {
  id        Int      @id @default(autoincrement())
  storeId   Int      @unique
  store     Store    @relation(fields: [storeId], references: [id])
  data      Json     @default("{}")
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@map("store_profiles")
}

model Subscription {
  id                    Int       @id @default(autoincrement())
  storeId               Int       @unique
  store                 Store     @relation(fields: [storeId], references: [id])
  stripeSubscriptionId  String?
  status                String    @default("none")
  planKey               String?
  billingInterval       String?
  currentPeriodStart    DateTime?
  currentPeriodEnd      DateTime?
  cancelAtPeriodEnd     Boolean   @default(false)
  createdAt             DateTime  @default(now())
  updatedAt             DateTime  @updatedAt

  @@map("subscriptions")
}

model Invoice {
  id               Int      @id @default(autoincrement())
  storeId          Int
  stripeInvoiceId  String   @unique
  amountPaid       Float
  currency         String   @default("brl")
  status           String
  invoiceUrl       String?
  invoicePdf       String?
  periodStart      DateTime?
  periodEnd        DateTime?
  createdAt        DateTime @default(now())

  @@map("invoices")
}

// ═══ TERMOS ═════════════════════════════════════════════

model TermsVersion {
  id          Int       @id @default(autoincrement())
  version     String
  title       String
  content     String
  isPublished Boolean   @default(false)
  publishedAt DateTime?
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt
  acceptances TermsAcceptance[]

  @@map("terms_versions")
}

model TermsAcceptance {
  id              Int          @id @default(autoincrement())
  storeId         Int
  store           Store        @relation(fields: [storeId], references: [id])
  termsVersionId  Int
  termsVersion    TermsVersion @relation(fields: [termsVersionId], references: [id])
  acceptedAt      DateTime     @default(now())

  @@unique([storeId, termsVersionId])
  @@map("terms_acceptances")
}

// ═══ ADMIN ══════════════════════════════════════════════

model AdminUser {
  id           Int       @id @default(autoincrement())
  name         String
  email        String    @unique
  passwordHash String
  role         String    @default("suporte")
  isActive     Boolean   @default(true)
  lastLogin    DateTime?
  createdAt    DateTime  @default(now())
  updatedAt    DateTime  @updatedAt
  sessions     AdminSession[]

  @@map("admin_users")
}

model AdminSession {
  id        Int       @id @default(autoincrement())
  adminId   Int
  admin     AdminUser @relation(fields: [adminId], references: [id])
  token     String
  ipAddress String?
  userAgent String?
  isActive  Boolean   @default(true)
  expiresAt DateTime
  createdAt DateTime  @default(now())

  @@map("admin_sessions")
}

model AdminPlan {
  id               Int      @id @default(autoincrement())
  appId            String
  name             String
  stripePriceIds   Json     @default("{}")
  features         Json     @default("{}")
  price            Json     @default("{}")
  commissionRate   Float    @default(0)
  revenueShareRate Float    @default(0)
  isActive         Boolean  @default(true)
  sortOrder        Int      @default(0)
  createdAt        DateTime @default(now())
  updatedAt        DateTime @updatedAt

  @@unique([appId, name])
  @@map("admin_plans")
}

model AdminConfig {
  id        Int      @id @default(autoincrement())
  key       String   @unique
  value     String
  group     String   @default("system")
  label     String?
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@map("admin_configs")
}

model AdminLog {
  id        Int      @id @default(autoincrement())
  adminId   Int?
  action    String
  entity    String?
  entityId  String?
  details   Json?
  ipAddress String?
  severity  String   @default("info")
  createdAt DateTime @default(now())

  @@map("admin_logs")
}

model AdminCommission {
  id               Int      @id @default(autoincrement())
  partnerId        String
  partnerName      String?
  storeId          Int
  invoiceId        String
  amount           Float
  commissionRate   Float
  commissionAmount Float
  status           String   @default("pending")
  createdAt        DateTime @default(now())
  updatedAt        DateTime @updatedAt

  @@map("admin_commissions")
}

model AdminCoupon {
  id             Int       @id @default(autoincrement())
  code           String    @unique
  type           String
  value          Float
  maxRedemptions Int?
  timesRedeemed  Int       @default(0)
  validUntil     DateTime?
  isActive       Boolean   @default(true)
  createdAt      DateTime  @default(now())
  updatedAt      DateTime  @updatedAt

  @@map("admin_coupons")
}

model AdminFaq {
  id          Int      @id @default(autoincrement())
  category    String   @default("geral")
  question    String
  answer      String
  videoUrl    String?
  isPublished Boolean  @default(true)
  sortOrder   Int      @default(0)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  @@map("admin_faqs")
}
```

---

## 16. Apendice B — Variaveis de Ambiente

### Backend (.env)

```bash
# Banco
DATABASE_URL=postgresql://user:pass@host:5432/db

# App
NODE_ENV=development
PORT=3001
APP_NAME=MeuApp
APP_EMAIL=contato@meuapp.com
JWT_SECRET=<openssl rand -hex 32>
TRIAL_DAYS=7

# Nuvemshop
NUVEMSHOP_APP_ID=xxxxx
NUVEMSHOP_CLIENT_ID=xxxxx
NUVEMSHOP_CLIENT_SECRET=xxxxx
NUVEMSHOP_REDIRECT_URI=http://localhost:3001/auth/callback

# Stripe
STRIPE_SECRET_KEY=sk_test_xxxxx
STRIPE_WEBHOOK_SECRET=whsec_xxxxx

# Stripe Price IDs (auto-preenchidos apos sync)
STRIPE_PRICE_GROWTH_MONTHLY=
STRIPE_PRICE_GROWTH_SEMESTRAL=
STRIPE_PRICE_GROWTH_ANNUAL=
STRIPE_PRICE_SCALE_MONTHLY=
STRIPE_PRICE_SCALE_SEMESTRAL=
STRIPE_PRICE_SCALE_ANNUAL=

# URLs
FRONTEND_URL=http://localhost:5173
ADMIN_FRONTEND_URL=http://localhost:5174

# Admin
ADMIN_JWT_SECRET=<openssl rand -hex 32>
ADMIN_SEED_EMAIL=admin@meuapp.com
ADMIN_SEED_PASSWORD=<12+ caracteres>

# Redis (opcional)
REDIS_URL=redis://localhost:6379
```

### Frontend (.env)

```bash
VITE_API_URL=                      # vazio em dev, URL backend em prod
VITE_NUVEMSHOP_APP_ID=xxxxx
```

### Admin Frontend (.env)

```bash
VITE_ADMIN_API_URL=                # vazio em dev, URL/admin-api em prod
```

---

## 17. Apendice C — Convencoes

### Nomenclatura

| Tipo | Formato | Exemplo |
|------|---------|---------|
| Tabelas (@@map) | snake_case | admin_plans |
| Models | PascalCase | AdminPlan |
| Variaveis | camelCase | commissionRate |
| Funcoes | verbNoun | createCheckoutSession |
| Constantes | UPPER_SNAKE | TRIAL_DAYS |
| Componentes | PascalCase | PlansPage |
| Rotas | kebab-case | /admin-api/plans |
| i18n keys | dot.separated.camelCase | billing.plans.growth |

### Prisma

```bash
npx prisma db push      # Sync schema → banco (sem migrations)
npx prisma generate     # Regenera client (OBRIGATORIO apos alteracao)
npx prisma studio       # UI visual
```

**REGRA**: Apos `db push`, SEMPRE `prisma generate` + reiniciar backend.
Se `generate` falhar com DLL lock: parar backend primeiro.

### Git

- Branch principal: `main` (auto-deploy)
- Commits: mensagem descritiva + `Co-Authored-By: Claude`
- Nunca commitar .env

---

## 18. Apendice D — Troubleshooting

| Problema | Causa | Solucao |
|----------|-------|---------|
| Webhook 400 | express.json() processou antes | express.raw() ANTES de express.json() |
| 401 no app embedado | Token Nexo expirou | Refresh proativo 20 min |
| Admin "Muitas tentativas" | Rate limiter in-memory | Reiniciar backend |
| Campo Prisma nao aparece | Client nao regenerado | Parar backend → prisma generate → reiniciar |
| migrate dev drift | DB ≠ migration history | Usar prisma db push |
| CORS blocked | Origem nao permitida | Adicionar URL ao allowedOrigins |
| CSP frame-ancestors | Iframe bloqueado | Adicionar dominios Nuvemshop |
| Stripe Price invalido | Nao sincronizado | Clicar "Sincronizar com Stripe" |
| React state vazio (automacao) | type nao dispara onChange | Usar clipboard paste (Ctrl+V) |
| DLL lock no prisma generate | Backend segurando arquivo | Parar backend antes |

### Ordem de Setup (Novo App)

```bash
# 1. Backend
cd backend && npm install
cp .env.example .env  # preencher
npx prisma db push && npx prisma generate
node prisma/seed-admin.js
npm run dev

# 2. Frontend
cd frontend && npm install && npm run dev

# 3. Admin
cd admin-frontend && npm install && npm run dev

# 4. Stripe local
stripe listen --forward-to localhost:3001/webhook

# 5. Verificar
# Backend:  http://localhost:3001/health
# App:      http://localhost:5173
# Admin:    http://localhost:5174

# 6. Sync planos no Stripe
# Admin → Planos → "Sincronizar com Stripe"
```

---

> **Este documento e a fonte de verdade para criar novos apps Nuvemshop.**
> Atualizar sempre que implementar novos padroes ou resolver problemas novos.
> App de referencia: PostAI (D:\AI\AppBlog-Nuvemshop\postai)
>
> v3.0 — Marco 2026 — Eri Cabral / Weethub
