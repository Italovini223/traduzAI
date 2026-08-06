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
│   │   │   ├── stripe.js       # StripeService (checkout, cancel, status, portal)
│   │   │   ├── deepl.js        # DeepLService — tradução em lote, nunca lança
│   │   │   └── exchangeRate.js # ExchangeRateService — câmbio, cache 12h, nunca lança
│   │   ├── lib/
│   │   │   ├── version.js      # TEMPLATE_VERSION — bumpar a cada release
│   │   │   ├── prisma.js       # Instância Prisma singleton
│   │   │   ├── errors.js       # AppError class
│   │   │   ├── priceParser.js  # regex de detecção de preço (cópia manual em widget.js)
│   │   │   └── localeOptions.js # países/idiomas/moedas suportados (fonte única)
│   │   ├── middleware/
│   │   │   ├── auth.js         # requireAuth (JWT Nuvemshop)
│   │   │   └── rateLimiter.js  # 5 níveis de rate limiting
│   │   ├── routes/
│   │   │   ├── billing.js      # /plans, /checkout, /cancel, /sync, /status, /invoices, /partner
│   │   │   ├── auth.js         # OAuth Nuvemshop + dev-token
│   │   │   ├── webhook.js      # Stripe webhooks
│   │   │   ├── support.js      # GET /api/support (FAQs + vídeo + whatsapp — público)
│   │   │   ├── profile.js      # Perfil da loja
│   │   │   ├── terms.js        # Termos de uso
│   │   │   ├── translations.js # Config/regras de tradução (app iframe, autenticado)
│   │   │   └── storefront.js   # /storefront/config|rules|translate (público, vitrine)
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
│   ├── public/
│   │   └── widget.js           # Script da vitrine (vanilla JS, sem build) — ver seção própria
│   └── prisma/
│       ├── schema.prisma
│       └── seed-admin.js
├── frontend/                   # React + Vite + Nimbus DS (app embedado)
│   └── src/
│       ├── providers/
│       │   └── NexoProvider.jsx    # Auth Nexo SDK, billingStatus, termsAccepted
│       ├── pages/
│       │   ├── BillingPage.jsx     # Planos, checkout, cancelar, faturas, parceiro
│       │   ├── Settings.jsx        # Config de tradução/moeda + regras por país
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

# Tradução automática + conversão de moeda da vitrine (traduzAI)
DEEPL_API_KEY=...            # opcional — sem chave, widget não traduz (falha silenciosa)
EXCHANGERATE_API_KEY=...     # opcional — sem chave, widget não converte preço (falha silenciosa)
GOOGLE_VISION_API_KEY=...    # opcional — sem chave, tradução de texto em imagem fica no-op (falha silenciosa)
```

**`NUVEMSHOP_SCRIPT_ID`** (ainda presente em `.env.example`) **não é mais usado
pelo código** — era pra associação manual de script por loja (`POST /scripts`),
removida porque o script é auto-instalado (Nuvemshop rejeita essa associação
com 422). Só serve hoje como anotação de qual script foi cadastrado no
Partners Portal; pode remover do `.env` sem quebrar nada.

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
| `StoreTranslationConfig` | 1:1 com Store. `enabled`, `sourceLanguage`, `baseCurrency` |
| `StoreLocaleRule` | Por loja+país. `country`, `language`, `currency` — unique em `[storeId, country]` |
| `TranslationCache` | **Global** (não por loja). `sourceHash` (sha256), `sourceLang`, `targetLang`, `translatedText` — sem expiração |
| `ExchangeRate`    | **Global**. `baseCurrency`+`quoteCurrency` únicos, `rate`, `fetchedAt` — TTL de 12h no código, não no schema |
| `OrderRecord`     | Por loja. Pedido pago gravado via webhook `order/paid` — `country`, `amount`, `currency`, `paidAt`. Unique em `[storeId, nuvemshopOrderId]` |
| `ImageTextCache`  | **Global**. Blocos de texto de imagem detectados via OCR + traduzidos. Unique em `[imageUrlHash, targetLang]`, sem expiração |

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

## Storefront: Tradução Automática + Conversão de Moeda

Feature central do traduzAI — diferente do resto do template, **não roda no
iframe admin**: roda no navegador do comprador anônimo, na vitrine pública,
traduzindo texto e convertendo preço exibido conforme o país do visitante
(ou seleção manual).

### Arquitetura ponta a ponta

```
1. Script cadastrado no Partners Portal (auto-instalado, evento onload) —
   Nuvemshop injeta em TODA página de vitrine de TODA loja com o app:
   <script src="https://apps-scripts.tiendanube.com/traduzai/.../N.js?versionId=...&store=ID">

2. Essa URL é um proxy/CDN (CloudFront) da Nuvemshop na frente do nosso
   próprio GET /widget.js (server.js serve backend/public/widget.js,
   substituindo o placeholder da URL do backend antes de enviar)

3. widget.js roda no navegador do comprador:
   a. Descobre STORE_ID via window.LS.store.id (global que a Nuvemshop
      injeta em toda página de vitrine — confirmado em produção; fallback:
      query string ?store= da própria tag <script>)
   b. GET /storefront/config?store=X[&country=XX] — geoip por IP detecta
      país (ou ?country= força, usado em teste/seletor manual) → retorna
      idioma/moeda alvo SE existir StoreLocaleRule pra esse país
   c. Se active:true — percorre nós de texto visíveis (TreeWalker), manda em
      lote pra POST /storefront/translate, aplica conversão de preço via
      regex (lógica de backend/src/lib/priceParser.js copiada manualmente em
      widget.js — sem bundler, mudança ali exige replicar aqui também)
   d. MutationObserver reaplica em conteúdo inserido depois (carrinho, SPA)
   e. Seletor manual de bandeiras (buildCountryPicker): GET /storefront/rules
      lista países configurados pelo lojista; clique força o país via a
      mesma rota /config, sem depender do geoip
```

### Rotas públicas — sem auth (`routes/storefront.js`)

CORS aberto (`origin: *`) especificamente pra `/storefront/*` — vitrine é
domínio de loja desconhecido de antemão, requisição sem cookies/credenciais.

| Rota | Uso |
|---|---|
| `GET /storefront/config?store=X[&country=XX]` | Resolve idioma/moeda/taxa alvo pro visitante |
| `GET /storefront/rules?store=X` | Lista países com regra configurada (seletor de bandeiras) |
| `POST /storefront/translate` | Traduz lote de textos, com cache |

### Rotas autenticadas — app iframe (`routes/translations.js`)

- `GET /api/translations/options` — países/idiomas/moedas suportados (dropdowns da Settings.jsx)
- `GET/PUT /api/translations/config` — liga/desliga a feature, idioma/moeda de origem da loja
- `POST/PUT/DELETE /api/translations/rules` — regras país → idioma/moeda (uma por país, `StoreLocaleRule`)

### Cache — o que evita gastar API paga a cada load de página

Cache é **Postgres via Prisma (não Redis, não memória de processo)** —
persistente entre restarts, e **global entre lojas** (o mesmo texto/par de
moeda serve pra qualquer tenant, já que texto e câmbio não são sensíveis a
tenant).

| O quê | Tabela | Chave | TTL |
|---|---|---|---|
| Tradução de texto | `TranslationCache` | `sha256(texto)` + `sourceLang` + `targetLang` | **sem expiração** — texto igual = tradução igual pra sempre |
| Taxa de câmbio | `ExchangeRate` | `baseCurrency` + `quoteCurrency` | **12h** (`CACHE_TTL_MS` em `config/exchangeRate.js`) |

Fluxo em `POST /storefront/translate`: hash cada texto recebido, busca no
`TranslationCache` os hashes já conhecidos, chama `DeepLService.translateBatch`
**só** pros textos que não bateram no cache (`missTexts`), grava o resultado
novo no cache antes de responder.

Fluxo em `ExchangeRateService.getRate`: se tem linha fresca (< 12h) no
`ExchangeRate`, usa ela sem chamar a API externa. Se expirou (ou não existe),
chama `exchangerate-api.com` e faz upsert do novo valor. **Se a API externa
falhar por qualquer motivo, usa o cache existente mesmo expirado** em vez de
quebrar a exibição de preço.

Ambos os serviços (`config/deepl.js`, `config/exchangeRate.js`) seguem o
mesmo princípio do `StripeService`: **nunca lançam**. Sem chave configurada
ou com a API externa fora do ar, retornam o texto/preço original — o widget
degrada graciosamente, nunca quebra a vitrine.

**Custo real de API**: cada texto único do catálogo consome DeepL **uma
única vez na vida útil daquele texto exato** (novo texto = novo hash = nova
chamada). Câmbio consome no máximo 1x/12h por par de moeda, independente de
quantas lojas ou visitantes. Um load de página comum, na prática, não bate
em nenhuma API externa — é leitura de banco.

### Seletor manual de país (bandeiras)

Fallback do geoip por IP — `geoip-lite` (banco MaxMind offline, empacotado no
deploy) é impreciso justamente pra IP de VPN/datacenter (testado e
confirmado: IP de VPN real localizado em Portland/US não foi reconhecido
como país nenhum); IP residencial de comprador real é bem mais confiável.

Renderizado por `buildCountryPicker` em `public/widget.js`: barra fixa no
canto inferior esquerdo (`position:fixed; bottom:16px; left:16px`), bandeiras
via `https://flagcdn.com` (imagem, sem asset local nem build step — emoji de
bandeira foi descartado por render inconsistente em Windows/Chrome). O
container tem `data-notranslate` (não `id`/classe) pra não se auto-traduzir.

**Preservação do texto original**: `ORIGINAL_TEXT` (WeakMap) guarda o
`nodeValue` de cada nó de texto na primeira vez que é visto. Toda tradução
subsequente — troca de bandeira, re-seleção — usa esse original como fonte,
nunca o texto já traduzido em tela (evita dupla-tradução e dupla-conversão de
preço ao alternar países repetidamente). `restoreOriginals()` devolve o texto
original quando a bandeira é desmarcada (clique de novo) ou quando o país
selecionado resolve pra "sem diferença" (mesmo idioma/moeda da loja).

`?country=XX` na URL da própria vitrine (não do script) força o país inicial
— usado pra testar sem depender do geoip real; a Nuvemshop não permite isso
via query da tag `<script>` em modo auto-instalado.

### Limitações da plataforma Nuvemshop (fora do nosso controle)

- **CDN do script cacheado por 1 ano**: `apps-scripts.tiendanube.com`
  responde `Cache-Control: public, max-age=31536000, immutable`. Deploy do
  backend NÃO muda o que a loja real recebe — só muda quando a Nuvemshop
  gera um `versionId` novo pro script. Confirmado por teste: nem re-salvar o
  script nem criar/ativar uma nova versão no Partners Portal propagou na
  hora — há fila de revisão própria da Nuvemshop, de duração indeterminada.
  **Não re-diagnosticar como bug** se um deploy de `widget.js` não aparecer
  de imediato numa loja real.
- **Evento do script**: pode ser exigido `onfirstinteraction` (não `onload`)
  inicialmente por política de revisão da plataforma — nesse caso o widget só
  carrega depois do primeiro clique/scroll do comprador (flash de conteúdo
  original até lá). Trocar pra `onload` no Partners Portal depois de aprovado.
- **Script auto-instalado não aceita associação manual por loja**
  (`POST /scripts` retorna 422 "Script is auto installed. Does not support
  store association") — por isso `registerScript`/`deleteScript` foram
  removidos do código; a Nuvemshop mesma injeta `?store=<id>` na URL do
  script mesmo em modo auto-instalado (confirmado em produção).
- **Checkout NÃO é traduzível com a arquitetura atual — limitação de
  plataforma, não é bug.** O checkout usa um mecanismo separado
  (`Scripts API` com `location: checkout`), que a Nuvemshop está
  descontinuando obrigatoriamente em favor do **NubeSDK**. O NubeSDK roda em
  Web Worker **sem acesso a DOM** — só expõe pontos fixos de inserção
  (formulário customizado, rótulo de frete, info de pagamento, cupons,
  overlays), sem nenhuma API de preço/moeda documentada. A abordagem usada na
  vitrine (TreeWalker + regex de preço em texto livre) é estruturalmente
  incompatível com isso. Na prática: o comprador vê a vitrine toda
  traduzida/convertida, mas o checkout continua no idioma/moeda original da
  loja. Não ameaça o script atual (`location: store`, fora dessa migração
  forçada) — só significa que não há caminho suportado pra estender a
  tradução até o checkout hoje. Mitigação parcial possível (não implementada):
  inserir avisos/textos customizados traduzidos nos slots fixos do NubeSDK,
  sem cobrir a tradução da página em si.

### Tradução de texto embutido em imagem (banner) — feature opt-in

Detecta e traduz texto que faz parte da IMAGEM (ex.: banner "Frete Grátis"
como JPG/PNG), não capturável pelo TreeWalker de texto normal. Desligado por
padrão (`StoreTranslationConfig.translateImages`) — usa API externa paga.

**Arquitetura**: `config/vision.js` (Google Cloud Vision, `DOCUMENT_TEXT_DETECTION`)
detecta blocos de texto + bounding box na imagem; `sharp` amostra a cor de
fundo perto do bloco (aproximação, não é sampling perfeito); o texto do
bloco passa pelo mesmo `DeepLService.translateBatch` já usado no resto do
app (reaproveitado, não duplicado). Cache global `ImageTextCache` (por
`sha256(imageUrl)` + `targetLang`, sem expiração — mesmo princípio do
`TranslationCache`: imagem repetida nunca reprocessa, inclusive resultado
"sem texto encontrado" fica cacheado, senão foto de produto sem texto
nenhum reprocessaria a cada load de página, gastando API de graça).

No navegador (`widget.js`): `<canvas>` desenha a imagem original + um
retângulo (cor amostrada) cobrindo o texto original + o texto traduzido em
cima, e troca `img.src` pelo `data:` URL resultante. Só processa imagem com
`naturalWidth`/`naturalHeight` ≥ 200px (ignora ícone/thumbnail) e só depois
de carregada (`img.complete`). Restauração ao voltar pro nativo reaproveita
o mecanismo `ORIGINAL_ATTR`/`restoreOriginalAttrs()` já existente (trata
`src` como qualquer outro atributo rastreado).

**Limitação de qualidade aceita** (decisão consciente, não bug): funciona
bem em banner de fundo de cor sólida. Em foto com fundo complexo/textura, o
retângulo de cobertura fica visivelmente artificial — não há inpainting/IA
generativa aqui, só cobrir+escrever. Aceito como troca deliberada por
custo/complexidade (ver decisão registrada quando a feature foi proposta).

**Risco real de CORS**: `canvas.toDataURL()` lança `SecurityError` se a
imagem for carregada sem cabeçalho `Access-Control-Allow-Origin` (canvas
"tainted"). Código trata isso com try/catch — se der erro, a imagem
original é mantida sem overlay, silenciosamente. Não testado ainda contra
o CDN real de imagens da Nuvemshop; se o overlay nunca aparecer em produção
mesmo com blocos detectados, suspeitar disso primeiro.

**Setup necessário** (ação do usuário, não código):
1. Criar projeto no Google Cloud Console, habilitar "Cloud Vision API".
2. Gerar uma API key (Credenciais → Criar credenciais → Chave de API).
3. Configurar `GOOGLE_VISION_API_KEY` no Railway (backend).
4. Tier grátis: ~1000 unidades de `DOCUMENT_TEXT_DETECTION`/mês; depois disso,
   cobra por uso (consultar pricing atual do Google Cloud Vision antes de
   habilitar em produção pra lojas com catálogo grande de imagens).
5. Habilitar o toggle "Tradução de texto em imagens" na Settings do app —
   sem isso, `/storefront/translate-image` sempre retorna `{ images: {} }`
   (no-op), mesmo com a chave configurada.

**⚠️ Pegadinha real que já aconteceu**: `sharp` (dependência de
`config/vision.js`) na versão mais recente (`^0.34`) exige **Node ≥20.9** —
o Railway desse projeto roda **Node 18.20.5**, e isso NÃO dá erro de install,
só quebra no `require()` em runtime, **derrubando o backend inteiro** (não
só essa feature) com 502 em produção. Fixado instalando `sharp@0.33.5`
explicitamente (`engines: node ^18.17.0 || ^20.3.0 || >=21.0.0` — compatível).
**Nunca rodar `npm update sharp` sem checar a versão do Node do Railway
primeiro.**

---

## Dashboard: Vendas por País (mapa + histórico)

Feature do painel admin (app iframe) — mapa de calor com vendas/faturamento
por país + gráfico de histórico com filtro de data. Não tem relação com a
feature de tradução da vitrine; é um dado novo (pedidos) que o app não
coletava antes.

### ⚠️ Ação necessária: permissão de Pedidos no Partners Portal

O app precisa da permissão de **Pedidos** (leitura) habilitada no Partners
Portal pra conseguir chamar `GET /orders/:id` e `POST/GET /webhooks`. Sem
isso, o webhook de pedido pago é registrado (best-effort, não falha o
install) mas a busca do pedido completo retorna 403 e nada é gravado.
**Lojas já instaladas antes dessa permissão ser habilitada podem precisar
reautorizar o app** (OAuth da Nuvemshop não expande escopo de token existente
automaticamente) — se o mapa ficar vazio numa loja antiga, esse é o motivo
mais provável, testar reinstalação antes de investigar outra causa.

### Arquitetura ponta a ponta

```
1. No install (auth.js), ensureOrderPaidWebhook regista best-effort a
   subscription do evento order/paid via POST /{storeId}/webhooks — só cria
   se ainda não existir (checa via GET /webhooks primeiro, evita duplicar
   subscription a cada reinstalação)

2. Nuvemshop dispara POST /webhooks/order/paid quando um pedido é pago.
   Payload é minimo: { store_id, event, id } — NÃO inclui valor/país do
   pedido, só o id. HMAC validado (header x-linkedstore-hmac-sha256, mesmo
   helper checkHmac() já usado pelos webhooks de LGPD)

3. recordPaidOrder() busca o pedido completo via GET /orders/:id (token da
   loja) e extrai, via orderSync.js#extractOrderFields: total (valor —
   NÃO total_paid_by_customer, que a doc geral cita mas não existe na
   resposta real; total_paid também não usar, fica "0.00" em pedido manual
   marcado como pago sem Transaction real), currency, país
   (shipping_address.country — objeto aninhado, confirmado —, fallback
   billing_country — campo PLANO, não billing_address.country como a doc
   geral sugere), paid_at. Nomes de campo confirmados inspecionando pedido
   real, não só a doc — a doc da Nuvemshop nem sempre bate com a resposta
   de verdade, revalidar se o comportamento parecer errado de novo.

4. Upsert em OrderRecord (unique por storeId+nuvemshopOrderId — pedido
   duplicado do webhook, ex. reentrega, não duplica a linha)

5. GET /api/analytics/sales?from=&to= (autenticado, requireAuth) agrega
   OrderRecord da loja por país (count+revenue) e por dia (timeseries) —
   agregação feita em JS após fetch filtrado por data, não em SQL
   (aceitável pro volume esperado; revisar se algum store tiver volume alto)

6. Dashboard.jsx renderiza SalesMap.jsx (mapa de calor, mesmo padrão de
   CountryMapSelector.jsx: react-simple-maps + world-atlas +
   NUMERIC_TO_ALPHA2, mas colorindo por intensidade de venda/faturamento em
   vez de habilitado/desabilitado) + SalesHistoryChart.jsx (recharts, com
   presets de 7/30/90 dias + range customizado via <input type="date">)

7. POST /api/analytics/sync (autenticado) — backfill manual: garante o
   webhook (ensureOrderPaidWebhook, idempotente) e busca TODOS os pedidos
   pagos via GET /orders?payment_status=paid (paginado, orderSync.js#
   syncPaidOrders) pra cobrir pedidos que existiam antes do webhook ser
   registrado, ou pedidos manuais (storefront:"form") que a Nuvemshop pode
   não disparar order/paid pra eles de forma confiável (não confirmado se
   dispara ou não — o backfill cobre os dois casos independente disso).
   Botão "Sincronizar pedidos" no Dashboard chama essa rota.
```

**Escopo obrigatório**: `read_orders` (habilitar no Partners Portal). Sem
ele, tanto `GET /webhooks` quanto `GET /orders` retornam 403 `"Missing
required scope: read_orders"`. Habilitar a permissão no portal NÃO atualiza
tokens já emitidos — loja instalada antes disso precisa **reinstalar** pra
ganhar token novo com o escopo. Confirmado na prática: erro 403 sumiu só
depois de reinstalar a loja de teste.

### Modelo `OrderRecord`

Por loja (não é global como `TranslationCache`/`ExchangeRate` — pedido É
sensível a tenant). `amount` assume que todo pedido da loja é registrado na
mesma moeda (`currency` do pedido, tipicamente igual ao `baseCurrency` da
loja) — se uma loja um dia operar em múltiplas moedas, a soma direta em
`revenue` (sem conversão) ficaria incorreta; não é o caso hoje, mas é uma
limitação a rever se surgir.

### Decisão: agregação em JS, não SQL

`GET /api/analytics/sales` busca as linhas filtradas por data e agrega
(`Map` por país, `Map` por dia) em JavaScript, não via `groupBy`/SQL raw do
Prisma. Mais simples e correto sem risco de bug em SQL manual; troque por
`$queryRaw` com `DATE_TRUNC` se o volume de pedidos de alguma loja crescer
o suficiente pra isso pesar.

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
- **traduzAI usa projeto Railway próprio** (`luminous-enjoyment`), não o `e1d7d40f...` do template genérico — CLI já vem linkado localmente (`railway status` mostra serviço `backend`, ambiente `production`). Deploy direto via `railway up --service backend` funciona sem precisar de `RAILWAY_TOKEN`/GraphQL manual.
- **`TranslationCache`/`ExchangeRate` são globais**, não por `storeId` — ao contrário de quase todo outro modelo do template, não isolar por tenant aqui é intencional (texto/câmbio não são sensíveis a loja).
- **`geoip-lite` não reconhece IP de VPN/datacenter de forma confiável** — testado com VPN real (IP confirmado via serviço externo como Portland/US) e retornou sem país. Não é bug do app; ver seção "Storefront: Tradução Automática" pro fallback (seletor manual de bandeiras).
- **CDN da Nuvemshop cacheia o script da vitrine por 1 ano** (`immutable`) — mudança em `public/widget.js` só chega em loja real depois que a Nuvemshop gera novo `versionId` (fila de revisão deles, sem prazo). Ver seção própria.

---

## Roadmap: Funcionalidades Futuras (gap analysis vs. apps Shopify)

Levantamento feito em 2026-08-06 comparando o traduzAI aos apps mais
populares da coleção "Apps for Store Languages" da Shopify (Translate &
Adapt, Weglot, Transcy, langify, Hextom, LangShop, Interlingue, Bablic,
GTranslate) — ver fontes no fim da seção. Objetivo: registrar gaps reais
antes de esquecer, não implementar ainda. Ordem = prioridade sugerida.

**Já cobrimos e por isso não entram na lista**: tradução de `alt` de
imagem (`img[alt]` já está no `ATTR_SELECTOR` de `widget.js`) e
re-tradução de conteúdo dinâmico/AJAX (o `MutationObserver` de
`ensureObserver()` já cobre isso).

1. **URLs indexáveis por idioma + tags `hreflang`** — hoje traduzimos via
   JS na MESMA URL; o Google não indexa a versão em outro idioma como
   página separada. Maior gap real de SEO internacional. Pelo menos
   adicionar `hreflang` sem reestruturar URL já ajudaria, mesmo sem ir até
   o fim (subpasta/subdomínio por idioma).
2. **Tradução do checkout** — reconfirmar viabilidade antes de tentar de
   novo: já documentado que o checkout usa NubeSDK (Web Worker, sem acesso
   a DOM), o que provavelmente inviabiliza isso com a arquitetura atual
   (ver "Limitações da plataforma Nuvemshop" na seção de Storefront).
3. **Adaptação por variação de dialeto/tom por país**, não só idioma — ex.:
   espanhol da Argentina vs. México vs. Espanha têm termos/tom diferentes
   que o DeepL sozinho não pega. Encaixa bem no modelo de regra por país
   (`StoreLocaleRule`) que já existe — seria um override por país em cima
   da tradução base.
4. **Arredondamento de preço convertido** — conversão de moeda pura gera
   número feio (R$19,34); concorrentes deixam o lojista arredondar pra
   preço psicológico (R$19,90/,99). Esforço baixo.
5. **Exportar/importar traduções em CSV** — complementa
   `StoreTranslationOverride` (edição individual) permitindo edição em
   lote ou terceirização pra um tradutor humano revisar offline.
6. **Múltiplos motores de tradução / ajuste de tom de marca** — hoje só
   `DeepLService`; concorrentes oferecem GPT/Claude/Gemini com glossário
   de marca/tom configurável, o que melhora qualidade de copy de marketing
   além da tradução literal.
7. **Regras globais de exclusão/glossário** — mais amplo que a correção
   string-a-string do `StoreTranslationOverride` atual: regra por
   padrão/palavra-chave (ex.: "nunca traduzir SKU", "sempre manter 'Nossa
   Marca' no original em qualquer lugar que apareça").
8. **Editor visual in-context** — clicar no elemento na própria vitrine
   pra corrigir a tradução, em vez de digitar o texto original manualmente
   no admin (UX melhor pra `StoreTranslationOverride`).
9. **Personalização visual do seletor de bandeiras** — hoje é
   posição/estilo fixo (`buildCountryPicker` em `widget.js`); concorrentes
   deixam o lojista reposicionar/re-estilizar pra bater com a marca.

**Baixa prioridade pro nosso mercado** (LatAm, pt-BR/es/en): idioma RTL
(não se aplica, sem idioma RTL no público-alvo), tradução de e-mail
transacional (exigiria integração separada com o sistema de e-mail da
Nuvemshop, não é o widget de storefront), marketplace de tradução humana
(custo alto pra fase beta), integração com "Markets" nativo (Nuvemshop não
tem equivalente direto hoje — reavaliar se a plataforma lançar algo
parecido), tradução de metafields/metaobjects (Nuvemshop não tem um
equivalente claro aos metafields do Shopify — investigar antes de
priorizar).

**Fontes da pesquisa**: coleção
`https://apps.shopify.com/collections/apps-for-store-languages?locale=pt-BR`
+ páginas individuais de Shopify Translate & Adapt, Transcy, langify,
Hextom (Translate My Store), LangShop, Interlingue, Bablic Translation,
Weglot, GTranslate.

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
