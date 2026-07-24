# CLAUDE.md — NuvemPro App Template

> Documento de contexto para o Claude Code. Leia este arquivo antes de qualquer tarefa.
> Versão atual do template: **1.9.5**

---

## O que é este projeto

**NuvemPro App Template** é um boilerplate SaaS para criar apps embedados na Nuvemshop (plataforma de e-commerce latino-americana). Inclui:

- Backend Node.js/Express com autenticação OAuth Nuvemshop, billing Stripe e painel admin
- Frontend React (app embedado no painel da loja via iframe/Nexo SDK)
- Admin Frontend React para gerenciar planos, clientes, faturas, configurações

Este repositório **é o template em si** — não um app específico. Quando se cria um novo app, copia-se este template e personaliza.

---

## Estrutura do Monorepo

```
nuvempro-app-template/
├── backend/                    # Node.js + Express + Prisma + PostgreSQL
│   ├── src/
│   │   ├── server.js           # Entry point, middlewares, rotas
│   │   ├── config/
│   │   │   └── stripe.js       # StripeService (checkout, cancel, status, portal)
│   │   ├── lib/
│   │   │   ├── version.js      # TEMPLATE_VERSION — bumpar a cada release
│   │   │   ├── prisma.js       # Instância Prisma singleton
│   │   │   └── errors.js       # AppError class
│   │   ├── middleware/
│   │   │   ├── auth.js         # requireAuth (JWT Nuvemshop)
│   │   │   └── rateLimiter.js  # 5 níveis de rate limiting
│   │   ├── routes/
│   │   │   ├── billing.js      # /plans, /checkout, /cancel, /sync, /status, /invoices, /partner
│   │   │   ├── auth.js         # OAuth Nuvemshop + dev-token
│   │   │   ├── webhook.js      # Stripe webhooks
│   │   │   ├── support.js      # GET /api/support (FAQs + vídeo + whatsapp — público)
│   │   │   ├── profile.js      # Perfil da loja
│   │   │   └── terms.js        # Termos de uso
│   │   └── admin/
│   │       ├── routes/
│   │       │   ├── adminPlans.js        # CRUD planos + verify-stripe (auto-heal)
│   │       │   ├── adminSubscriptions.js
│   │       │   ├── adminCustomers.js
│   │       │   ├── adminConfig.js
│   │       │   ├── adminCoupons.js
│   │       │   ├── adminFaq.js
│   │       │   ├── adminLogs.js
│   │       │   └── adminCommissions.js
│   │       └── services/
│   │           └── adminPlanService.js  # syncToStripe (idempotente), find-or-create
│   └── prisma/
│       ├── schema.prisma
│       └── seed-admin.js
├── frontend/                   # React + Vite + Nimbus DS (app embedado)
│   └── src/
│       ├── providers/
│       │   └── NexoProvider.jsx    # Auth Nexo SDK, billingStatus, termsAccepted
│       ├── pages/
│       │   ├── BillingPage.jsx     # Planos, checkout, cancelar, faturas, parceiro
│       │   ├── OnboardingPage.jsx
│       │   └── ...
│       ├── components/
│       │   └── AppNav.jsx          # Sidebar suporte: vídeo 16:9, FAQ dinâmico, WhatsApp
│       ├── services/
│       │   └── api.js              # Axios com token refresh automático
│       └── i18n/locales/
│           ├── pt-BR.json
│           ├── es-AR.json
│           └── es-MX.json
├── admin-frontend/             # React + Vite + Tailwind (painel interno)
│   └── src/pages/
│       ├── PlansPage.jsx       # Lista planos + Sincronizar com Stripe
│       └── FaqPage.jsx         # FAQ + Configurações de Suporte (vídeo + whatsapp)
├── railway.json                # Build config Railway (Nixpacks, start, restart policy)
├── vercel.json                 # Build config Vercel (aponta para frontend/)
├── CHANGELOG.md
├── STANDARDS.md                # Regras obrigatórias de código
├── PROMPT.md                   # Prompt para criar novo app a partir do template
├── PROMPT-UPDATE.md            # Prompt para atualizar app existente a partir do template
└── ADMIN-PADRAO-NUVEMPRO-v3.0.md  # Guia completo das 12 fases
```

---

## Portas de Desenvolvimento

| Serviço        | Porta |
|----------------|-------|
| Backend        | 3001  |
| Frontend App   | 5173  |
| Admin Frontend | 5174  |

---

## Variáveis de Ambiente Principais (backend/.env)

```env
DATABASE_URL=postgresql://...
JWT_SECRET=...
ADMIN_JWT_SECRET=...

NUVEMSHOP_APP_ID=...
NUVEMSHOP_CLIENT_ID=...
NUVEMSHOP_CLIENT_SECRET=...

STRIPE_SECRET_KEY=sk_...
STRIPE_WEBHOOK_SECRET=whsec_...

APP_NAME=NuvemPro App
APP_SLUG=meuapp
APP_EMAIL=contato@exemplo.com
FRONTEND_URL=https://...
ADMIN_FRONTEND_URL=https://...

# NuvemPro Partners — comissionamento de parceiros
PARTNERS_API_KEY=nv_live_...

# Notificação de tickets de suporte por e-mail (opcional — best-effort)
RESEND_API_KEY=re_...
SUPPORT_FROM_EMAIL=Suporte <suporte@exemplo.com>   # fallback: APP_EMAIL
```

---

## Modelos Prisma (schema resumido)

| Modelo            | Propósito                                          |
|-------------------|----------------------------------------------------|
| `Store`           | Tenant. Tem `plan`, `stripeCustomerId`, `partnerId`, `partnerName` |
| `Subscription`    | 1:1 com Store. `stripeSubscriptionId`, `cancelAtPeriodEnd`, `status` |
| `Invoice`         | Faturas Stripe salvas pelo webhook                 |
| `AdminPlan`       | Planos criados no admin. `stripePriceIds: Json`, `price: Json`, `features: Json` |
| `AdminUser`       | Usuários do painel admin                           |
| `AdminSession`    | Sessões admin (JWT salvo em DB)                    |
| `AdminConfig`     | Configurações chave-valor do app                   |
| `AdminCoupon`     | Cupons/promoções Stripe                            |
| `AdminFaq`        | FAQ do app                                         |
| `AdminLog`        | Auditoria de ações admin                           |
| `AdminCommission` | Comissões de parceiros                             |
| `StoreProfile`    | Dados extras da loja (JSON livre)                  |
| `TermsVersion`    | Versões dos termos de uso                          |
| `TermsAcceptance` | Aceites dos termos por loja                        |

### Campos de parceiro no `Store`

```prisma
partnerId    String?   // Partner ID do parceiro indicador (ex: "E5DCHV87")
partnerName  String?   // Nome do parceiro (salvo junto ao validar)
```

### Campo importante: `AdminPlan.stripePriceIds`

```json
{
  "monthly": "price_xxx",
  "semestral": "price_yyy",
  "annual": "price_zzz"
}
```

### Campo importante: `AdminPlan.features`

**SEMPRE array de strings legíveis** — nunca objeto JSON com booleanos.

```json
["Tudo do Starter", "Até 500 produtos", "Analytics avançado", "Suporte prioritário"]
```

O formulário de edição de planos no admin já salva no formato correto (textarea, uma feature por linha).
O seed cria planos com arrays de strings. Se um plano antigo tiver features como objeto (`{analytics: true, maxProducts: 500}`), edite-o pelo admin para corrigir.

### Campos de configuração de Trial (`AdminConfig`)

Criados automaticamente pelo `seed-admin.js`:

| key | valor padrão | descrição |
|-----|-------------|-----------|
| `trial_mode` | `'none'` | `none` \| `free` \| `paid` |
| `trial_days` | `'7'` | duração do trial em dias |
| `trial_coupon` | `''` | reservado (não usado atualmente) |

Gerenciados em **Admin → Configurações → Período de Trial**.

### Campos de configuração de Suporte (`AdminConfig`)

Criados automaticamente pelo `seed-admin.js`:

| key | valor padrão | descrição |
|-----|-------------|-----------|
| `support_video_url` | `''` | URL do YouTube do vídeo principal de apresentação do app |
| `support_whatsapp` | `''` | Número WhatsApp de suporte (ex: `5511999999999`) |
| `support_notify_email` | `''` | E-mail que recebe aviso quando uma loja abre/responde um ticket (requer `RESEND_API_KEY`) |

Gerenciados em **Admin → FAQ → Configurações de Suporte**.

---

## Sistema de Trial (duas modalidades)

O trial é configurado pelo admin em **Configurações → Período de Trial** e armazenado no `AdminConfig`.

### Modos disponíveis

| `trial_mode` | Comportamento |
|---|---|
| `none` | Sem trial. Usuário assina para acessar. |
| `free` | X dias grátis sem cartão. Banner de contagem regressiva no app. Ao expirar, gate de assinatura. |
| `paid` | Usuário cadastra cartão mas não é cobrado por X dias (`trial_period_days` nativo Stripe). Status `trialing`. |

### Como funciona no backend

- `GET /api/billing/status` lê `trial_mode` e `trial_days` do `AdminConfig` e retorna:
  - `trialMode`: modo atual
  - `trialDaysLeft`: dias restantes (só > 0 quando `trial_mode=free` e dentro do prazo)
  - `hasAccess`: `isFreePlan || subActive || (trialMode === 'free' && trialActive)`
- `POST /api/billing/checkout` aplica `trial_period_days` na `subscription_data` quando `trial_mode=paid`
- `GET /api/billing/plans` retorna `trialMode` e `trialDays` para o frontend exibir badges
- `backend/routes/auth.js` lê `trial_days` do `AdminConfig` ao criar nova loja (fallback: env `TRIAL_DAYS`)

### O que o usuário vê

**`free`**: banner amarelo no topo do app com contagem regressiva e botão "Ver planos"

**`paid`**: badge laranja nos planos pagos ("Assine e ganhe X dias grátis"). Após assinatura, card de status mostra "Trial ativo até {data}" + Alert azul: "Nenhuma cobrança até {data}. Cancele antes de {data} para não ser cobrado."

### ATENÇÃO: `trial_period_days` vs cupom

O modo `paid` usa `subscription_data.trial_period_days` (nativo Stripe) — **não** usa cupom. Isso evita erros de ID de cupom incorreto e é compatível com `allow_promotion_codes: true`. **Nunca trocar de volta para `discounts: [{coupon}]`** — Stripe não permite os dois ao mesmo tempo.

---

## Sistema de Parceiros (Comissionamento)

O sistema conecta apps indicados por parceiros ao **NuvemPro Partners** para pagamento de comissões.

### Fluxo completo

```
1. Parceiro compartilha seu Partner ID (ex: E5DCHV87) com o cliente
2. Cliente acessa BillingPage → seção "Código do Parceiro" (ao final da página)
3. Cliente digita o Partner ID e clica "Associar Parceiro"
4. Backend valida via GET https://partners.nuvempro.com/api/v1/partners/:id
   - 200: parceiro válido → { partnerId, name }
   - 404: não encontrado
   - 403: parceiro suspenso
5. Se válido:
   a. Salva partnerId + partnerName no Store (tenant) no banco local
   b. Atualiza metadados da subscription ativa no Stripe (best-effort)
6. Frontend exibe badge verde: "Parceiro associado: Nome (ID)" + botão "Alterar"
```

### Endpoints de parceiro

| Método | Rota | Descrição |
|--------|------|-----------|
| `GET` | `/api/billing/partner` | Retorna `{ partnerId, partnerName }` do store atual |
| `POST` | `/api/billing/partner` | Valida na Partners API, salva no DB, atualiza Stripe |

### Metadados Stripe na subscription

Toda subscription criada via checkout inclui `subscription_data.metadata`:

```js
{
  app_id: process.env.NUVEMSHOP_APP_ID,
  app_name: process.env.APP_NAME,
  app_slug: process.env.APP_SLUG,
  partner_id: store.partnerId || '',    // lido do Store no momento do checkout
  partner_name: store.partnerName || '',
  store_id: String(store.id),
  plan_key: planKey,
  billing_interval: billingInterval,
}
```

**Atenção**: o parceiro deve ser associado **antes** do checkout para que `partner_id` entre na subscription. Se o parceiro for associado depois, `POST /api/billing/partner` atualiza o Stripe diretamente via `stripe.subscriptions.update`.

### Partners API — Referência rápida

- **Base URL**: `https://partners.nuvempro.com/api/v1`
- **Auth**: header `x-api-key: PARTNERS_API_KEY`
- **Endpoint de validação**: `GET /partners/:partnerId`
- **Health check**: `GET /ping`
- **Partner ID**: 8 caracteres alfanuméricos (sem ambiguidade O/0/I/1/L)
- **Rate limit**: 100 req/min por IP

| Código | Significado |
|--------|-------------|
| `200` | Parceiro válido e ativo |
| `403` | Parceiro suspenso |
| `404` | Parceiro não encontrado |
| `401` | API Key inválida |

### Configuração necessária

Adicionar no Railway (backend environment):
```
PARTNERS_API_KEY=nv_live_...
```
Criar a chave em: `https://partners.nuvempro.com/admin/api-keys`

---

## Sistema de Suporte (FAQ + Vídeo + WhatsApp + Tickets)

### Endpoint público

`GET /api/support` — sem autenticação. Retorna:
```json
{
  "faqs": [{ "id", "question", "answer", "videoUrl", "category", "sortOrder" }],
  "mainVideoUrl": "https://youtube.com/watch?v=...",
  "whatsapp": "5511999999999"
}
```

### No AppNav (sidebar do frontend)

- Busca `/api/support` ao abrir pela primeira vez (lazy, cacheado em memória)
- Vídeo principal: renderiza como `<iframe>` 16:9 usando `aspectRatio: '16/9'` (div nativo, não Box Nimbus)
- FAQ: accordion por item, `expandedId` state
- FAQ com vídeo: botão "Ver vídeo" → `VideoModal` com autoplay (`?autoplay=1`)
- WhatsApp: `https://web.whatsapp.com/send?phone=${whatsapp}`

### No Admin (FaqPage)

- Seção "Configurações de Suporte" no topo: campos `support_video_url`, `support_whatsapp` e `support_notify_email`
- Salva via `PUT /admin-api/config` com formato batch: `{ updates: [{ key, value }] }`
- Lê via `GET /admin-api/config` usando `res.data.raw` (array flat)

### Tickets de suporte (thread loja ↔ admin)

Módulo padrão do template (v1.9.0+). Modelos `SupportTicket` (1:N) + `SupportMessage`. Status: `open` | `answered` | `closed`.

**App (tenant — `routes/support.js`, requer `requireAuth`):**

| Método | Rota | Descrição |
|--------|------|-----------|
| `GET` | `/api/support/tickets` | Lista os tickets da loja com a thread |
| `GET` | `/api/support/tickets/summary` | Contagem `{open, answered, closed}` p/ badge no app |
| `POST` | `/api/support/tickets` | Abre ticket (1ª mensagem). Anti-spam: `ticketLimiter` |
| `POST` | `/api/support/tickets/:id/messages` | Follow-up da loja → reabre (`open`). `ticketLimiter` |

- UI no `AppNav.jsx`: formulário + "Minhas conversas" (thread); badge "respondido" no botão Suporte (zera ao abrir).
- `ticketLimiter` (`rateLimiter.js`): 10 req / 10 min, chaveado por `req.store.id` (usar **após** `requireAuth`).

**Admin (`admin/routes/adminSupport.js`, montado em `/admin-api/support` com `adminAuth`):**

| Método | Rota | Descrição |
|--------|------|-----------|
| `GET` | `/admin-api/support` | Lista paginada (filtro `status`, `search`); usar `res.data.data` |
| `GET` | `/admin-api/support/stats` | Contagem por status p/ badge no menu (def. **antes** de `/:id`) |
| `GET` | `/admin-api/support/:id` | Detalhe do ticket + thread + loja |
| `POST` | `/admin-api/support/:id/reply` | Admin responde → status `answered` (`requireRole('suporte')`) |
| `PATCH` | `/admin-api/support/:id/status` | Fecha/reabre |

- UI no `SupportPage.jsx` + item "Suporte" no `Sidebar.jsx` com badge de tickets abertos.

### Notificação por e-mail (v1.9.2 / v1.9.3)

- `lib/email.js` → `sendEmail({ to, subject, html, replyTo })`: best-effort via API HTTP do **Resend** (usa `axios`, sem nova dep). **Nunca lança**; no-op (`{ skipped: true }`) se faltar `RESEND_API_KEY`, remetente ou destinatário.
- **Admin → recebe** (v1.9.2): fire-and-forget em `POST /tickets` e `POST /tickets/:id/messages` (helper `notifyAdminOfTicket` em `routes/support.js`), enviando ao `AdminConfig['support_notify_email']`.
- **Lojista → recebe** (v1.9.3): fire-and-forget em `POST /admin-api/support/:id/reply` (helper `notifyStoreOfReply` em `admin/routes/adminSupport.js`), enviando ao `Store.email` com CTA via `FRONTEND_URL`.
- **Opt-out por loja** (v1.9.4): o lojista pode desativar os e-mails de resposta no toggle do sidebar de Suporte. Guardado em `StoreProfile.data.supportEmailOptOut` (default `false` = recebe). Endpoints `GET`/`PUT /api/support/preferences` (`{ emailNotifications }`); `notifyStoreOfReply` consulta a flag e não envia se desativada.
- Envs: `RESEND_API_KEY` (re_...) e `SUPPORT_FROM_EMAIL` (fallback `APP_EMAIL`). Sem chave configurada, o app funciona normalmente — apenas não envia e-mail.

---

## Arquitetura de Billing (Stripe)

### Fluxo de Sincronização de Planos (3 camadas de auto-heal)

O sistema garante que os `stripePriceIds` no banco estejam sempre corretos:

1. **Admin carrega `/plans/verify-stripe`** → busca por metadata no Stripe (`admin_plan_id`, `plan_key+app_id`) → atualiza DB se IDs desatualizados
2. **Frontend carrega `GET /api/billing/plans`** → para planos sem `stripePriceIds`, chama `syncToStripe` automaticamente
3. **`POST /api/billing/checkout`** → se `priceId` não encontrado no DB, tenta `syncToStripe` antes de falhar

### `StripeService.getSubscriptionStatus(store)` — 3 fases

Detecta troca de plano com trial sem depender de webhook:

1. **Fase 1** — recupera a subscription armazenada no DB pelo `stripeSubscriptionId`
2. **Fase 2** — se a armazenada NÃO está em `trialing`, consulta o Stripe por subscriptions `trialing` do cliente. Uma subscription trialing diferente = novo plano com trial → atualiza DB e retorna ela
3. **Fase 3** — se a armazenada está `canceled`, busca qualquer subscription `active`

**Por que isso existe**: ao assinar um novo plano com `trial_period_days`, a nova subscription fica `trialing`. Sem as fases 2-3, o status cacheado do plano antigo seria retornado indefinidamente até o webhook chegar.

### `POST /api/billing/sync` — fetcha trialing + active

Busca `trialing` e `active` em paralelo, com prioridade:
`trialing` > `active sem cancelamento` > `active com cancelamento`

**Não tem mais early return "already_synced"** — foi removido pois impedia a detecção de novas subscriptions trialing.

### `adminPlanService.syncToStripe(planId)` — Idempotente

- `findOrCreateStripeProduct`: busca por `metadata['admin_plan_id']`, fallback por `metadata['plan_key']+metadata['app_id']`, cria se não existe
- `findOrCreateStripePrice`: busca preço ativo com mesmo `amount+interval`, arquiva preços obsoletos, cria se necessário
- Salva todos os `stripePriceIds` encontrados/criados no DB

### Deativação e exclusão de planos

- **Desativar** (`isActive: false` no admin): chama `archiveInStripe` → arquiva produto e preços no Stripe, depois marca `isActive: false` no DB. O seed nunca reverte `isActive` de planos gerenciados pelo admin.
- **Deletar** (`DELETE /admin-api/plans/:id`): chama `archiveInStripe` + hard-delete no DB.
- `archiveInStripe`: busca produto por `metadata['admin_plan_id']` (fallback: `plan_key+app_id`), arquiva todos os preços ativos, arquiva produto.

### Shape do `billingStatus` (frontend)

```javascript
// GET /api/billing/status retorna:
{
  plan: 'growth',           // string: planKey ativo na Store
  trialEndsAt: null,        // DateTime | null — data de expiração do trial gratuito
  trialMode: 'paid',        // 'none' | 'free' | 'paid' — lido do AdminConfig
  trialDays: 14,            // número de dias do trial — lido do AdminConfig
  trialDaysLeft: 0,         // dias restantes (> 0 apenas quando trial_mode=free e ativo)
  hasAccess: true,          // boolean — se false, App.jsx mostra BillingPage locked
  subscription: {
    status: 'trialing',     // 'active' | 'trialing' | 'canceled' | 'past_due' | 'none'
    planKey: 'growth',
    billingInterval: 'monthly',
    currentPeriodStart: '2026-03-01T...',
    currentPeriodEnd: '2026-04-15T...',  // = data da primeira cobrança quando trialing
    cancelAtPeriodEnd: false,
    stripeSubscriptionId: 'sub_xxx',
  }
}
```

**Atenção**: nunca usar `billingStatus.status` — o campo não existe nesse nível. Sempre `billingStatus.subscription.status`.

### Fluxo de Resubscrição (problema resolvido em v1.3.9)

Quando o usuário cancela e resubscreve via Checkout:
1. Stripe cria nova subscription com `cancel_at_period_end: false`
2. DB pode ainda ter o ID da subscription antiga
3. `POST /billing/sync` detecta a nova sub ativa e atualiza o DB
4. `BillingPage.syncPlan()` após sync bem-sucedido re-busca `/api/billing/status` completo → UI atualiza corretamente

---

## BillingPage — Lógica de Botões

```javascript
// Mostra botão "Cancelar assinatura":
isCurrent && hasActiveSub && !cancelAtEnd && !plan.isFree

// Mostra badge "Cancelamento agendado":
isCurrent && cancelAtEnd

// Mostra botão "Assinar":
isSubscribable && !isCurrent
// onde isSubscribable = !plan.isFree && intervalAvail && plan.configured
```

### Seção "Código do Parceiro" (ao final da BillingPage)

Exibida apenas quando `!locked`. Estados:

| Estado | UI |
|---|---|
| Sem parceiro | Input `partnerInput` + botão "Associar Parceiro" |
| Carregando | Botão desabilitado "Validando..." |
| Parceiro associado | Badge verde `"Parceiro associado: Nome (ID)"` + botão "Alterar" |
| Erro | Texto vermelho com mensagem específica |

Handlers: `loadPartner()` (chamado no `useEffect` inicial), `handlePartnerSave()` (POST + atualiza state).

---

## Arquitetura de Termos de Uso (Gate obrigatório)

O fluxo de aceite de termos bloqueia o app até o tenant aceitar a versão mais recente publicada.

### Fluxo completo

```
1. NexoProvider → GET /api/terms/status
   Resposta: { required, accepted, terms: { id, version, title, content, publishedAt } }

2. Se accepted === false → App.jsx exibe TermsPage com termsData do contexto

3. TermsPage exibe conteúdo real do banco (termsData.content)
   — fallback para seções i18n se não houver termos publicados

4. Usuário rola até o fim → botão "Aceitar" habilitado

5. POST /api/terms/accept com { termsVersionId: termsData.id }
   — OBRIGATÓRIO enviar termsVersionId, senão retorna 400

6. onAccepted() → setTermsAccepted(true) → app liberado
```

### O que o NexoProvider expõe

```javascript
// Contexto NexoProvider:
{
  termsAccepted,      // boolean | null
  setTermsAccepted,   // setter
  termsData,          // { id, version, title, content, publishedAt } | null
}
```

### Admin gerencia os termos

- Criar rascunho: `POST /admin-api/terms` → `{ version, title, content }`
- Editar rascunho: `PUT /admin-api/terms/:id`
- Publicar: `POST /admin-api/terms/:id/publish` (role: proprietario)
- A publicação ativa o gate para todos os tenants que ainda não aceitaram

### Campos no Prisma

- `TermsVersion.isPublished` (não `isActive`) — campo correto para verificar se está ativo
- `TermsAcceptance` — unique em `[storeId, termsVersionId]`

---

## Padrões de Código Obrigatórios

Ver `STANDARDS.md` para checklist completo. Resumo:

- Toda rota usa `try/catch` com `next(err)` e `AppError` para erros conhecidos
- Formato de erro: `{ error, code, status }` — nunca mensagens hardcoded
- Todas as rotas de dados paginados usam `parsePagination` + `paginatedResponse`
- **Frontend admin: sempre `res.data.data` para acessar itens paginados** — nunca `res.data.campo || res.data` (tela branca)
- Toda query de app filtra por `storeId` (isolamento de tenant)
- Rate limiter em todas as rotas públicas
- Strings de UI sempre via i18n (pt-BR, es-AR, es-MX) — nunca hardcoded no JSX

---

## Deploy

| Serviço | Onde | O que sobe | Observação |
|---------|------|------------|------------|
| Backend | Railway | `backend/` | Redeploy via GraphQL API |
| Frontend (app) | Vercel | `frontend/` (via `vercel.json` raiz) | Deploy via API com SHA |
| Admin Frontend | Vercel (projeto separado) | `admin-frontend/` | **rootDirectory obrigatório** |

### ⚠️ Admin Frontend — rootDirectory crítico

O projeto Vercel do admin-frontend DEVE ter `rootDirectory: "admin-frontend"` configurado.
Sem isso, o Vercel usa o `vercel.json` da raiz, que builda o frontend principal (app Nuvemshop),
e o admin exibirá "Este aplicativo deve ser acessado pelo painel da Nuvemshop."

```bash
# Configurar uma vez por projeto:
curl -X PATCH "https://api.vercel.com/v9/projects/PROJ_ID" \
  -H "Authorization: Bearer TOKEN" -H "Content-Type: application/json" \
  -d '{"rootDirectory":"admin-frontend","framework":"vite"}'
```

### vercel.json (raiz do repo — Frontend principal)

```json
{
  "buildCommand": "cd frontend && npm ci && npm run build",
  "outputDirectory": "frontend/dist",
  "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }]
}
```

### admin-frontend/vercel.json (Admin — próprio)

```json
{
  "buildCommand": "npm ci && npm run build",
  "outputDirectory": "dist",
  "installCommand": "echo 'install handled in buildCommand'",
  "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }]
}
```

### railway.json (Backend)

```json
{
  "$schema": "https://railway.app/railway.schema.json",
  "build": { "builder": "NIXPACKS" },
  "deploy": {
    "startCommand": "npm start",
    "restartPolicyType": "ON_FAILURE",
    "restartPolicyMaxRetries": 3
  }
}
```

### git config — Evitar bloqueio Vercel

```bash
# Usar sempre o noreply do GitHub para que Vercel associe o committer
git config user.email "GITHUB_ID+username@users.noreply.github.com"
git config user.name "username"
```

### Deploy via API (Railway + Vercel)

```bash
# Railway — redeploy (requer serviceId e environmentId corretos)
curl -X POST "https://backboard.railway.com/graphql/v2" \
  -H "Authorization: Bearer RAILWAY_TOKEN" -H "Content-Type: application/json" \
  -d '{"query":"mutation { serviceInstanceRedeploy(serviceId: \"SVC_ID\", environmentId: \"ENV_ID\") }"}'

# Railway — upsert variável
curl -X POST "https://backboard.railway.com/graphql/v2" \
  -H "Authorization: Bearer RAILWAY_TOKEN" -H "Content-Type: application/json" \
  -d '{"query":"mutation variableUpsert($input: VariableUpsertInput!) { variableUpsert(input: $input) }","variables":{"input":{"projectId":"PROJ_ID","environmentId":"ENV_ID","serviceId":"SVC_ID","name":"KEY","value":"VAL"}}}'

# Vercel — deploy frontend (SHA do git HEAD)
curl -X POST "https://api.vercel.com/v13/deployments?projectId=PROJ_ID&teamId=TEAM_ID" \
  -H "Authorization: Bearer VERCEL_TOKEN" -H "Content-Type: application/json" \
  -d '{"name":"frontend","gitSource":{"type":"github","repoId":"REPO_ID","ref":"main","sha":"SHA"},"target":"production"}'
```

---

## Histórico de Versões Recentes

| Versão | O que mudou |
|--------|-------------|
| **1.7.3** | Associação de parceiro na BillingPage: valida via Partners API, salva no Store, atualiza Stripe subscription metadata |
| **1.7.2** | FAQ dinâmico do admin no sidebar do app; vídeo principal 16:9 acima do FAQ; VideoModal com autoplay; WhatsApp `web.whatsapp.com` |
| **1.7.1** | Doppler para gestão de env vars; `railway.json`; `npm ci` nos builds; headers de segurança no admin Vercel |
| **1.7.0** | CI com GitHub Actions (build, test, validate-clone); `package-lock.json` commitados |
| **1.6.3** | Aviso de trial ativo na BillingPage: "Trial ativo até {data}", Alert "Nenhuma cobrança até {data}", dica de cancelamento |
| **1.6.2** | Fix: `getSubscriptionStatus` 3 fases detecta subscription trialing de novo plano; `POST /sync` busca trialing+active em paralelo |
| **1.6.1** | Fix: checkout paid trial usa `trial_period_days` nativo (elimina erro com cupom ID); features do seed como arrays de strings legíveis |
| **1.6.0** | Sistema de trial em duas modalidades (`free`/`paid`) configurável no admin; banner countdown; badge "Assine e ganhe X dias grátis" |
| **1.5.5** | Fix: `isCurrent` verifica plano+intervalo; desconto % dinâmico nos botões de período |
| **1.5.3** | Fix crítico: `isFree` não é campo Prisma — calcular via `price` JSON |
| **1.5.0** | Gate de assinatura obrigatória; `allow_promotion_codes: true`; campo `hasAccess` |
| **1.4.1** | Fix: tela branca em Terms/FAQ/Logs/Segurança admin; `isPublished` correto |

---

## Processo de Release (obrigatório a cada mudança)

1. Bumpar `backend/src/lib/version.js` → `TEMPLATE_VERSION`
2. Atualizar `CHANGELOG.md` com seção `## [x.y.z] - YYYY-MM-DD`
3. `git add` arquivos relevantes
4. `git commit -m "tipo: descrição (vX.Y.Z)"`
5. `git push origin main`

---

## Comandos Úteis

```bash
# Iniciar tudo em desenvolvimento (com Doppler — recomendado)
cd backend && doppler run -- npm run dev          # porta 3001
cd frontend && npm run dev                         # porta 5173
cd admin-frontend && npm run dev                   # porta 5174

# Sem Doppler (fallback com .env)
cd backend && npm run dev

# Após mudar schema.prisma:
cd backend
npx prisma db push
npx prisma generate
# reiniciar backend

# Stripe webhook local:
stripe listen --forward-to localhost:3001/webhook

# Rodar testes:
cd backend && npm test
```

---

## Problemas Conhecidos / Decisões de Arquitetura

- **`AdminPlan.name`** é o `planKey` (ex: `"growth"`), não um label de exibição
- **`AdminPlan.stripePriceIds`** é campo `Json` — nunca sobrescrever inteiro; usar spread `{ ...current, ...new }`
- **`cancelAllActiveSubscriptions`** usa `cancel_at_period_end: true`, não cancela imediatamente
- **Webhook Stripe** usa raw body — deve ser registrado ANTES do `express.json()` no `server.js`
- **Nuvemshop** usa header `"Authentication"` (não `"Authorization"`) para o token
- **Nexo SDK** (`@tiendanube/nexo`) gerencia sessão do iframe; `iAmReady()` dispara resize do iframe
- **`window.top.location.href`** usado no checkout para sair do iframe e ir ao Stripe
- **`paginatedResponse`** retorna `{ data, meta }` — no frontend admin usar sempre `res.data.data`, nunca `res.data.campo || res.data`
- **`TermsVersion.isPublished`** é o campo correto (não `isActive`)
- **Admin frontend** é acessado diretamente via URL, sem restrição de iframe — o `NexoProvider` que bloqueia acesso direto existe apenas no `frontend/`, não no `admin-frontend/`
- **`AdminPlan.features`** deve ser array de strings legíveis — nunca objeto JSON com booleanos. Editar pelo admin se plano tiver formato antigo.
- **`AdminPlan.isFree`** NÃO existe no schema Prisma — é calculado: `Object.values(plan.price).every(v => !v || v === 0)`. Nunca usar `select: { isFree: true }` — lança erro Prisma.
- **`trial_period_days`** e **`discounts`/`allow_promotion_codes`**: `trial_period_days` é compatível com `allow_promotion_codes`. `discounts` e `allow_promotion_codes` são mutuamente exclusivos — Stripe rejeita os dois juntos.
- **Subscription `trialing`**: status `trialing` = assinatura com trial ativo no Stripe (não cobrado ainda). `subActive = ['active', 'trialing'].includes(status)` — sempre incluir trialing no check de acesso.
- **Seed não reverte `isActive`**: `seed-admin.js` usa `update` sem `isActive` — admin controla o campo. Se um plano foi desativado no admin, o seed não reativa.
- **`POST /sync` sem early return**: a otimização "already_synced" foi removida — sem ela o sync detecta novas subscriptions trialing. Não reintroduzir.
- **Partners API — metadados da subscription**: o parceiro deve ser associado antes do checkout para entrar no `subscription_data.metadata`. Se associado depois, o endpoint `POST /api/billing/partner` atualiza o Stripe diretamente. A atualização Stripe é best-effort (não falha o request se o Stripe estiver indisponível).
- **`Box` component Nimbus DS**: NÃO suporta `aspectRatio` CSS — usar `div` nativo com `style={{ aspectRatio: '16/9' }}` para vídeos e containers com proporção fixa.
- **Vercel + Cloudflare**: não usar proxy (laranja) para domínios do Vercel — causa conflito SSL e double-proxy. Usar grey cloud (DNS only) para Vercel; pode usar proxy para Railway.
- **Railway project ID**: o ID correto do projeto `nuvempro-app-template` é `e1d7d40f-2909-456b-992f-d9ae28753536` (não confundir com IDs de outros projetos como App-PostaAI, App-RecuperaJa).

---

## Comportamento Pós-Tarefa — Next Actions

> **IMPORTANTE:** Ao concluir qualquer tarefa significativa (feature, bug fix, refactoring, CRUD, deploy, config), SEMPRE apresentar 3 sugestões de acompanhamento contextuais no final da resposta.

As sugestões devem ser **acionáveis** (o usuário pode pedir e o Claude executa), **contextuais** (baseadas no que foi feito) e **progressivas** (segurança, performance, testes, UX, negócio). Seguir o formato da skill `saas-next-actions`.

Formato:
```
---
### Sugestões de acompanhamento
1. **[Categoria] Ação** — Descrição curta do valor.
2. **[Categoria] Ação** — Descrição curta do valor.
3. **[Categoria] Ação** — Descrição curta do valor.
```

---

*Atualizado em: 2026-06-26 | Versão: 1.9.5*
