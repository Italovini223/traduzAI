# Changelog

Todas as mudanças notáveis do template NuvemPro são documentadas aqui.
Formato baseado em [Keep a Changelog](https://keepachangelog.com/pt-BR/1.0.0/),
versionado em [Semantic Versioning](https://semver.org/lang/pt-BR/).

---

## [1.9.5] - 2026-06-26

### Adicionado

- **Visibilidade do opt-out no admin** — no detalhe do ticket (`SupportPage`), aviso âmbar quando a loja desativou e-mails de resposta ("sua resposta não será notificada por e-mail"), para a equipe considerar outro canal. `GET /admin-api/support/:id` agora retorna `store.emailOptOut`.
- **Testes do `lib/email.js`** — suite unitária (`email.test.js`, `node:test` + mock do `axios`): cobre os caminhos de no-op (sem key/remetente/destinatário/conteúdo), o payload/headers do Resend no happy path, `to` como array, fallback `APP_EMAIL` e a garantia de **nunca lançar** quando o axios falha.

---

## [1.9.4] - 2026-06-26

### Adicionado

- **Opt-out de e-mail por loja** — o lojista controla se quer receber os e-mails de resposta:
  - App: toggle "Receber e-mails quando respondermos" no sidebar de Suporte (`AppNav.jsx`), com i18n (pt-BR, es-AR, es-MX).
  - Backend: `GET`/`PUT /api/support/preferences` — preferência guardada em `StoreProfile.data.supportEmailOptOut` (merge, sem migração).
  - `notifyStoreOfReply` respeita o opt-out: não envia se a loja desativou (default: ativado).

---

## [1.9.3] - 2026-06-26

### Adicionado

- **E-mail ao lojista quando o suporte responde** — fecha o loop dos dois lados:
  - `POST /admin-api/support/:id/reply` dispara e-mail (fire-and-forget) ao `Store.email` com o texto da resposta e CTA para abrir o app.
  - Reusa `lib/email.js` (Resend, best-effort) — no-op se a loja não tiver e-mail ou se `RESEND_API_KEY` não estiver configurada.
  - Usa `FRONTEND_URL` para o botão "Abrir o app".

---

## [1.9.2] - 2026-06-26

### Adicionado

- **Notificação por e-mail de tickets (admin)** — aviso ao abrir/responder um ticket:
  - Novo serviço `lib/email.js` — envio transacional best-effort via API HTTP do **Resend** (usa o `axios` já presente; sem nova dependência). No-op silencioso se não configurado.
  - `POST /api/support/tickets` e `POST /api/support/tickets/:id/messages` disparam e-mail (fire-and-forget) ao destino configurado.
  - Nova config `support_notify_email` (Admin → FAQ → Configurações de Suporte) + seed default.
  - Novas envs: `RESEND_API_KEY` e `SUPPORT_FROM_EMAIL` (fallback: `APP_EMAIL`).

---

## [1.9.1] - 2026-06-18

### Adicionado

- **Notificações de suporte (in-app)** — sinalização de tickets pendentes:
  - **Admin**: badge com a contagem de tickets **abertos** no item "Suporte" do menu (`GET /admin-api/support/stats`).
  - **App**: badge no botão "Suporte" quando há tickets **respondidos** pela equipe (`GET /api/support/tickets/summary`), some ao abrir o sidebar.

### Segurança

- **Anti-spam de tickets** — novo `ticketLimiter` (10 req / 10 min, chaveado por loja) aplicado a `POST /api/support/tickets` e `POST /api/support/tickets/:id/messages`.

---

## [1.9.0] - 2026-06-18

### Adicionado

- **Módulo de Suporte (tickets)** — canal direto loja ↔ admin, padrão do template.
  - **Schema**: `SupportTicket` (storeId, subject, status `open|answered|closed`, lastMessageAt) + `SupportMessage` (ticketId, author `store|admin`, body), ambos `onDelete: Cascade`. Migration `0005`.
  - **App (tenant)**: no sidebar de Suporte, formulário "Fale com a gente" (assunto + mensagem → abre ticket) e "Minhas conversas" com a thread (respostas abaixo da pergunta) + follow-up. Endpoints `GET/POST /api/support/tickets` e `POST /api/support/tickets/:id/messages` (requireAuth, isolados por storeId). i18n pt-BR/es-AR/es-MX.
  - **Admin**: nova aba **Suporte** (`/support`): lista de tickets com filtro por status, detalhe com a conversa, caixa de resposta (→ `answered`) e fechar/reabrir. Endpoints `GET /admin-api/support`, `GET /:id`, `POST /:id/reply`, `PATCH /:id/status`.

> Requer migração no deploy (`migrate deploy`/`db push`).

- **Padrão de comportamento "Next Actions" no `CLAUDE.md`** — ao concluir uma tarefa significativa, o Claude Code sempre apresenta 3 sugestões de acompanhamento contextuais (formato da skill `saas-next-actions`). Vale para todos os apps baseados no template.

---

## [1.8.3] - 2026-06-03

### Corrigido

- **Checagem de atualização do template com repositório privado** — o card "Template NuvemPro" mostrava "Versão mais recente: —" porque o hook batia na API pública do GitHub **sem autenticação** (404 em repo privado).
  - Novo `GET /admin-api/template/version` (adminAuth): consulta o GitHub **server-side** com `GITHUB_TOKEN` (cache de 30 min), retornando `{ current, latest, outdated, releaseUrl }`. Token nunca vai ao navegador → funciona com repo privado.
  - `useTemplateVersion` passou a consumir esse endpoint em vez de chamar o GitHub direto.
  - `.env.example`: novo `GITHUB_TOKEN`.

> **Operacional**: setar `GITHUB_TOKEN` (PAT com leitura do repo do template) no ambiente de cada app. Sem ele, a versão instalada continua aparecendo, mas a "mais recente" fica indisponível.

---

## [1.8.2] - 2026-06-03

### Adicionado

- **Idioma nas FAQs de Suporte** — cada pergunta/resposta agora tem idioma (`pt` | `es`), e o sidebar de Suporte do app exibe só as FAQs do idioma da loja.
  - **Schema**: `AdminFaq.locale` (default `pt`; migration `0004`). Registros existentes assumem `pt`.
  - **Admin (FaqPage)**: select de **Idioma** (Português/Espanhol) no formulário, badge de idioma em cada card e filtro por idioma na lista.
  - **Backend**: `adminFaq` salva/filtra `locale`; `GET /api/support?lang=<locale>` filtra por idioma (mapeia `pt-BR`→`pt`, `es-AR`/`es-MX`→`es`) com **fallback para `pt`** quando não há FAQ no idioma pedido.
  - **App (AppNav)**: envia o idioma atual ao buscar o suporte e refaz a busca quando o idioma muda.

> Requer aplicar a migração no deploy (`migrate deploy`/`db push`).

---

## [1.8.1] - 2026-06-03

### Segurança / Hardening

- **`trust proxy` ativado** (`server.js`) — atrás de proxy (Railway/Vercel), o `req.ip` agora é o IP real do cliente. Corrige rate limiters por IP (que estavam efetivamente globais) e os IPs gravados nos audit logs.
- **Webhook Stripe fora do rate limit global** — montado antes do `globalLimiter`, evitando que bursts legítimos do Stripe sejam throttled (eventos já são verificados por assinatura).
- **HMAC nos webhooks Nuvemshop** (`nuvemshopWebhooks.js`) — valida `x-linkedstore-hmac-sha256` (HMAC-SHA256 do raw body com `NUVEMSHOP_CLIENT_SECRET`, tolerante a hex/base64, timing-safe). `app/uninstalled` rejeita HMAC inválido; `store/redact` mantém 200 (LGPD) mas não marca em HMAC inválido. `express.json` passou a capturar `req.rawBody`.
- **Toggle de modo Stripe valida a chave** — `POST /admin-api/plans/stripe-mode` recusa ativar um modo cuja chave não está no ambiente (evita cair silenciosamente na chave legada do outro modo).

### Corrigido

- **Delete de tenant** (`adminCustomers.js`) — cancelamento da assinatura no Stripe movido para **depois** do commit da transação local (evita assinatura cancelada com loja ainda no banco se o delete falhar).
- **Comissão duplicada** — `AdminCommission` ganhou `@@unique([invoiceId])` (migration `0003`) e o webhook trata `P2002`, fechando a corrida de reentregas concorrentes.

### Docs

- `CLAUDE.md` atualizado para v1.8.1.

---

## [1.8.0] - 2026-06-03

### Adicionado

- **Controle de app desinstalado** — alerta no admin quando a loja desinstala o app.
  - **Schema**: novo campo `Store.uninstalledAt DateTime?` (migration `0002_store_uninstalled_at`; também adicionado `prisma/migrations/migration_lock.toml`).
  - **Webhooks Nuvemshop** (novo `routes/nuvemshopWebhooks.js`, montado em `/webhooks`): `app/uninstalled` marca `uninstalledAt`; `store/redact` (LGPD) também marca como rede de segurança (~48h); stubs `customers/redact` e `customers/data_request`.
  - **Reinstalação limpa** `uninstalledAt` no callback OAuth (`auth.js`).
  - **Admin**: lista de clientes com badge/filtro "Desinstalado" (`uninstalledAt` no payload); detalhe com alerta "App desinstalado em {data} (há N dias)" e destaque para **> 30 dias** sugerindo remover na Zona de perigo.

> Requer aplicar a migração no deploy (`prisma migrate deploy` ou `db push`). Para receber `app/uninstalled`, ativar o evento no Partner Portal apontando para `https://<backend>/webhooks/app/uninstalled`. HMAC do webhook fica como hardening futuro.

---

## [1.7.9] - 2026-06-03

### Adicionado

- **Remover loja (tenant) no admin** — "Zona de perigo" no detalhe do cliente com exclusão permanente dos dados do tenant.
  - `DELETE /admin-api/customers/:id` (somente **proprietário**): cancela a assinatura ativa no Stripe (best-effort) e, em transação, apaga as tabelas-base sem cascade (`subscription`, `storeProfile`, `invoice`, `termsAcceptance`, `adminCommission`) e a `Store` — cujo delete cascateia os models do app com `onDelete: Cascade`.
  - Auditoria registrada **antes** da exclusão (`delete_store`, severity warning).
  - UI: modal com **type-to-confirm** — é preciso digitar `DELETAR` para habilitar o botão "Apagar dados do tenant".

> Nota: models específicos do app só são apagados se tiverem `onDelete: Cascade` no schema do app. Tabelas de log/evento com `storeId` sem FK podem deixar registros órfãos (não-PII).

---

## [1.7.8] - 2026-06-03

### Adicionado

- **Toggle de modo Stripe (Test / Produção) no admin** — botão na página de Planos alterna o modo ativo sem restart. As duas chaves ficam no ambiente; o banco guarda só o flag `stripe_mode` (`AdminConfig`).
  - `config/stripe.js`: cliente resolvido por Proxy sobre o modo ativo (reavaliado em background ~15s); helpers `getActiveMode`, `getWebhookSecret`, `getStripeKeyStatus`, `refreshStripeMode`. Sem mudança nos call-sites.
  - `POST /admin-api/plans/stripe-mode` (proprietário) grava o flag e reavalia o modo.
  - `GET /admin-api/plans/stripe-account` agora retorna o modo ativo + status das duas chaves (`keys.test`/`keys.live`).
  - Webhook verifica a assinatura com o secret do modo ativo e faz fallback para o outro (suporta test e live no mesmo endpoint).
  - Banner de Planos: status das chaves Test/Live + controle Teste/Produção.
- **Env**: `STRIPE_SECRET_KEY_TEST`, `STRIPE_SECRET_KEY_LIVE`, `STRIPE_WEBHOOK_SECRET_TEST`, `STRIPE_WEBHOOK_SECRET_LIVE` (legado `STRIPE_SECRET_KEY`/`STRIPE_WEBHOOK_SECRET` segue como fallback).
- **Seed**: `stripe_mode` (default `test`).

> Nota: price IDs e customer/subscription IDs são por modo no Stripe. Ao trocar de modo, re-sincronize os planos ("Sincronizar Stripe"); assinaturas/clientes de um modo não existem no outro.

---

## [1.7.7] - 2026-06-02

### Adicionado

- **Editor rich text nos Termos de Uso (admin)** — novo `admin-frontend/src/components/RichTextEditor.jsx` (TipTap) substitui o `<textarea>` do campo Conteúdo. Ao colar, o texto preserva parágrafos/estrutura e é salvo como HTML (resolve o conteúdo "sem espaçamento"). Toolbar: negrito, itálico, H2, H3, lista, lista numerada, link, limpar formatação.
- **Preview de versão (admin)** — botão 👁 em cada versão na lista de Termos abre um modal que renderiza o conteúdo como HTML (igual o app exibe), para conferir a formatação antes de publicar.
- **Dependências** (admin): `@tiptap/react`, `@tiptap/starter-kit`, `@tiptap/extension-link`.

---

## [1.7.6] - 2026-06-02

### Corrigido

- **Moldura branca em volta do app embedado** — novo `frontend/src/index.css` (importado no `main.jsx`) zera a margem padrão do `body` (`margin: 8px` do user-agent). Dentro do iframe (Nexo), essa margem aparecia como espaço vazio no topo, rodapé e laterais, pois o `iAmReady()` dimensiona o iframe pela altura do conteúdo.

---

## [1.7.5] - 2026-06-02

### Adicionado

- **Símbolo da marca Nuvempro** — novo componente `frontend/src/components/BrandSymbol.jsx` (SVG inline, cor `#141414`, decorativo via `aria-hidden`):
  - **Topo (`AppNav`)**: exibido no início da navegação, antes do botão Dashboard.
  - **Rodapé (`AppFooter`)**: exibido antes do texto "Nuvempro".

---

## [1.7.4] - 2026-06-02

### Corrigido

- **Webhook Stripe — comissão duplicada**: `invoice.paid` agora verifica se já existe `AdminCommission` para o `invoiceId` antes de criar. Sem o guard, reentregas do Stripe geravam comissões duplicadas (não há constraint única em `invoiceId`).
- **Webhook Stripe — perda silenciosa de eventos**: erro em handler agora retorna `500` (em vez de `200`), fazendo o Stripe reprocessar. Seguro porque os handlers são idempotentes (upserts por chave única + guard de comissão).
- **`trial_mode` sem validação**: novo helper `backend/src/lib/trial.js` (`normalizeTrialMode`, `normalizeTrialDays`) normaliza valores do `AdminConfig` — qualquer valor fora de `none|free|paid` vira `none`; `trial_days` é limitado a 1–365. Usado em `routes/billing.js`.
- **`PROMPT-UPDATE.md`**: referência de arquivo corrigida (`TermsAdminPage.jsx` → `TermsPage.jsx`) no Grupo 1 — seguir o prompt ao pé da letra falhava o `cp`.

### Frontend (alinhamento às regras do template)

- **`AppNav.jsx`**: vídeo principal do suporte trocou `aspectRatio` CSS por `paddingBottom: 56.25%` (padrão correto, igual ao `VideoModal`); strings hardcoded (`"Ver vídeo"`, `aria-label="Fechar"`) movidas para i18n; accordion do FAQ agora é acessível por teclado (`role`/`tabIndex`/`aria-expanded`/Enter+Espaço, chevron `aria-hidden`).
- **`AppFooter.jsx`**: link de Termos (`<span>`) agora navegável por teclado (`role="button"`, `tabIndex`, `onKeyDown`).
- **`Dashboard.jsx`**: placeholder hardcoded movido para `dashboard.contentPlaceholder` (i18n).
- **i18n**: novas chaves `support.viewVideo`, `common.close`, `dashboard.contentPlaceholder` em pt-BR, es-AR e es-MX.
- **Código morto removido**: `frontend/src/hooks/useApi.js` (não era importado em lugar algum).

### Testes

- `utils.test.js`: novos testes unitários para `normalizeTrialMode`/`normalizeTrialDays` e para a lógica de idempotência/elegibilidade de comissão.

---

## [1.7.3] - 2026-04-01

### Adicionado

- **Associação de Parceiro na BillingPage** — card "Código do Parceiro" no final da página de planos (após faturas):
  - Usuário digita o Partner ID (ex: `E5DCHV87`); backend valida via `GET https://partners.nuvempro.com/api/v1/partners/:id`
  - Se válido: salva `partnerId` + `partnerName` no `Store` (tenant) e atualiza metadados da subscription ativa no Stripe
  - Se já associado: exibe badge verde "Parceiro associado: Nome (ID)" com botão "Alterar"
  - Erros específicos: não encontrado, suspenso, não configurado
- **`GET /api/billing/partner`** — retorna `{ partnerId, partnerName }` do store atual
- **`POST /api/billing/partner`** — valida na Partners API, salva no DB, atualiza Stripe subscription metadata (best-effort)
- **`PARTNERS_API_KEY`** adicionado ao `backend/.env.example`
- **i18n** — chaves `billing.partner.*` em pt-BR, es-AR e es-MX

---

## [1.7.1] - 2026-03-31

### Adicionado

- **`backend/railway.json`** — define builder (Nixpacks), start command e restart policy; elimina ambiguidade de auto-detecção em monorepos
- **Doppler** — `doppler.yaml` em backend/, frontend/ e admin-frontend/ para gestão centralizada de env vars (dev → produção com sync automático Railway/Vercel)
- **`scripts/setup-dev.sh`** — onboarding de novos devs em um comando

### Corrigido

- **`vercel.json` (raiz)** — `npm install` → `npm ci` para builds reproduzíveis
- **`admin-frontend/vercel.json`** — `npm install` → `npm ci`; adicionados headers de segurança (`X-Frame-Options: DENY`, `X-Content-Type-Options`, `Referrer-Policy`)
- **`.github/workflows/ci.yml`** — nomes de variável corrigidos: `CLIENT_ID` → `NUVEMSHOP_CLIENT_ID`, `CLIENT_SECRET` → `NUVEMSHOP_CLIENT_SECRET`, `ADMIN_URL` → `ADMIN_FRONTEND_URL`
- **`.env.example`** (3 arquivos) — header Doppler-first; nota sobre proxy Vite em dev

---

## [1.6.3] - 2026-03-30

### Adicionado

- **Aviso de trial ativo na BillingPage** — quando `subscription.status === 'trialing'`, o card de status exibe:
  - Label "Trial ativo até" (em vez de "Data de renovação") com a data da primeira cobrança
  - Alert informativo: "Nenhuma cobrança até {{date}}. Após essa data, a assinatura será renovada automaticamente."
  - Dica de cancelamento: "Se não quiser ser cobrado, cancele antes de {{date}}."
- **i18n** — chaves `billing.status.trialEnd`, `billing.trialActiveTitle`, `billing.trialActiveNotice`, `billing.trialActiveCancelHint` em pt-BR, es-AR, es-MX

---

## [1.6.2] - 2026-03-30

### Corrigido

- **Plano não atualiza após assinar com trial** — `getSubscriptionStatus` só recuperava a subscription armazenada (plano antigo/active). Nova subscription com `trial_period_days` fica como `trialing` no Stripe e nunca era detectada. Implementadas 3 fases: (1) recupera subscription armazenada, (2) se não está em trialing, verifica se existe uma mais recente em trialing (novo plano), (3) se está canceled, procura uma active
- **`POST /api/billing/sync` ignorava subscriptions trialing** — buscava apenas `status: 'active'`, perdendo novas assinaturas com trial. Agora busca tanto `trialing` quanto `active` em paralelo, priorizando trialing (novo plano) > active sem cancel > active com cancel
- **Otimização "already_synced" muito agressiva** — impedia sync mesmo quando havia nova subscription trialing para plano diferente. Substituída pela lógica baseada em prioridade de status

---

## [1.6.1] - 2026-03-30

### Corrigido

- **"Erro interno do servidor" ao assinar com trial_mode=paid** — `discounts: [{coupon}]` falhava quando o `trial_coupon` no AdminConfig não era o ID exato do cupom Stripe (vs. promotion code). Substituído por `subscription_data.trial_period_days` nativo do Stripe: mais robusto, não requer cupom, compatível com `allow_promotion_codes`
- **Features dos planos exibindo chaves brutas** (`analytics`, `500`, `priority`, `customBranding`) — seed armazenava features como objeto JSON `{maxProducts: 500, support: 'priority'}` em vez de array de strings legíveis. Corrigido para `['Tudo do Starter', 'Até 500 produtos', 'Analytics avançado', 'Suporte prioritário']`
- **Admin Settings > Trial paid** — removido campo `trial_coupon` (não mais necessário); atualizado texto informativo explicando que `trial_period_days` é usado nativamente

---

## [1.6.0] - 2026-03-30

### Adicionado

- **Duas modalidades de Trial configuráveis pelo admin** (Settings → Período de Trial):
  - `none` — sem trial; usuário assina imediatamente para acessar
  - `free` — X dias grátis sem cartão; banner de contagem regressiva no app; ao expirar, redireciona para assinar
  - `paid` — usuário assina mas recebe X dias grátis via cupom Stripe automático; planos exibem badge "Assine e ganhe X dias grátis"; cupom aplicado automaticamente no checkout
- **`GET /api/billing/status`** — retorna `trialMode`, `trialDaysLeft` para o frontend
- **`GET /api/billing/plans`** — retorna `trialMode`, `trialDays` para badges nos cartões de plano
- **`POST /api/billing/checkout`** — aplica cupom automaticamente quando `trial_mode=paid`; `discounts` e `allow_promotion_codes` são mutuamente exclusivos no Stripe — selecionado automaticamente
- **`AdminConfig` com defaults de trial** — seed cria `trial_mode=none`, `trial_days=7`, `trial_coupon=''`
- **Banner de trial no app** — aparece dentro do app (não bloqueia) quando `trial_mode=free`; mostra dias restantes e botão "Ver planos"
- **SettingsPage admin** — seção "Período de Trial" com cards de seleção de modo, input de dias e campo de cupom (com aviso sobre `allow_promotion_codes`)
- **i18n** — chaves `trial.*` adicionadas em pt-BR, es-AR, es-MX

---

## [1.5.5] - 2026-03-30

### Corrigido

- **"Plano atual" aparecia em todas as abas de intervalo** — `isCurrent` agora verifica plano E intervalo (`sub?.billingInterval === interval`); assinante do Scale Mensal não vê "Plano atual" nas abas Semestral e Anual
- **Botão "Assinar" habilitado nos outros intervalos** — permite trocar de intervalo mesmo estando no plano correto
- **"Indisponível neste período"** — exibido quando o intervalo não tem `priceId` configurado no Stripe

### Adicionado

- **Desconto % dinâmico nos botões de período** — Semestral e Anual exibem o percentual de desconto calculado automaticamente comparando com o preço mensal do primeiro plano pago (ex: `Semestral -20%`, `Anual -40%`)

---

## [1.5.2] - 2026-03-30

### Corrigido

- **Plano desativado no admin voltava após deploy** — `seed-admin.js` incluía `isActive` no `update` do upsert, forçando `isActive: true` nos planos padrão a cada seed. Removido `isActive` do `update` (preservado apenas no `create` para novos planos)
- **Desativar plano no admin não arquivava no Stripe** — produtos e preços continuavam ativos no Stripe permitindo novas assinaturas mesmo após desativação

### Adicionado

- **`adminPlanService.archiveInStripe(plan)`** — arquiva o produto Stripe e todos os seus preços ativos; chamado automaticamente ao desativar um plano
- **PUT `/admin-api/plans/:id` com `isActive: false`** — agora chama `archiveInStripe` em vez de `syncToStripe`; `deactivate()` também chama `archiveInStripe`

---

## [1.5.1] - 2026-03-30

### Corrigido

- **Bug crítico: `GET /api/billing/status` retornava 500** — `select: { isFree: true }` no Prisma lançava erro porque `isFree` não é campo do schema `AdminPlan` (é calculado). Causava `loadStatus` falhar silenciosamente, deixando `billingStatus=null` e `termsData=null`
- **Gate de assinatura não bloqueava** — com `billingStatus=null`, `billingStatus?.hasAccess === false` é `undefined === false` = false, gate nunca disparava
- **Termos no rodapé mostravam fallback i18n** — `termsData=null` (mesmo erro acima), TermsPage usava seções estáticas em vez do conteúdo do banco
- **`trialActive` agora respeita `TRIAL_DAYS` do `.env`** — se `TRIAL_DAYS=0` (ou não definido), trial não concede acesso ao app; usuário deve assinar um plano

### Técnico

- `isFree` calculado corretamente: `select: { price: true }` + `Object.values(price).every(v => !v || v === 0)`
- Comentário de aviso no código sobre `isFree` não ser campo Prisma
- `TRIAL_DAYS=0` configurado no Railway (produção) para forçar assinatura imediata

---

## [1.5.0] - 2026-03-30

### Adicionado

- **Gate de assinatura obrigatória** — quando não há plano free e o tenant não tem assinatura ativa, o app bloqueia o acesso e exibe a página de planos
  - `GET /api/billing/status` agora retorna `hasAccess: boolean`
  - `hasAccess = true` quando: assinatura ativa/trialing no Stripe, trial da loja ainda vigente, ou plano atual marcado como `isFree` no banco
  - `App.jsx` Gate 2 usa `billingStatus.hasAccess === false` para bloquear
- **Cupom no checkout Stripe** — `createCheckoutSession` agora inclui `allow_promotion_codes: true`; campo de cupom aparece nativamente na página de pagamento do Stripe
- **BillingPage modo locked melhorado**:
  - Sync automático ao montar: tenta `POST /billing/sync` para detectar assinaturas recém-criadas no Stripe (webhook ainda não processado)
  - Botão "Já assinei — verificar acesso": dispara sync + recarrega `billingStatus` completo via `refreshStatus`
  - Se a assinatura for detectada, `hasAccess` passa a `true` e o gate é liberado automaticamente
- **NexoProvider** expõe `refreshStatus` no contexto (chama `loadStatus` que re-busca billing + terms)

### Corrigido

- **Link do termo no rodapé** — `AppFooter` agora passa `termsData` do contexto para `TermsPage`, exibindo o conteúdo real do banco em vez do fallback i18n
- **Layout do TermsPage no Sidebar** — modo `viewOnly` usa `<Box padding="4">` simples, sem `minHeight="100vh"` e centralização vertical que causavam espaçamento excessivo

---

## [1.4.1] - 2026-03-30

### Corrigido

- **Tela branca em Termos, FAQ, Logs e Segurança no admin** — 3 páginas usavam `res.data.terms/faqs/admins` que é `undefined` pois `paginatedResponse` retorna `{ data, meta }`. Corrigido para `res.data.data`; componentes paravam de chamar `.map()` em objeto e travavam silenciosamente
- **TermsPage admin exibia badge/cor errada** — campo `term.isActive` não existe no banco; corrigido para `term.isPublished`
- **Logs: tabs "Uso" e "Abuso" retornavam 404** — endpoints `GET /admin-api/logs/usage` e `GET /admin-api/logs/abuse` adicionados ao backend

---

## [1.4.0] - 2026-03-30

### Corrigido / Implementado

- **Gate de Termos de Uso funcional** — fluxo completo de aceite de termos agora funciona corretamente:
  - `NexoProvider` agora expõe `termsData` (objeto completo com `id`, `title`, `content`, `version`) além do boolean `termsAccepted`
  - `TermsPage` agora exibe o conteúdo real do banco de dados (gerenciado pelo admin) em vez de texto estático de i18n
  - `POST /api/terms/accept` agora recebe corretamente o `termsVersionId` — bug anterior causava erro 400 sempre
  - Suporte a conteúdo plain text (`white-space: pre-wrap`) e HTML sanitizado (DOMPurify) do banco
  - Fallback para seções estáticas do i18n caso não haja termos publicados no banco
  - Versão e título do termo exibidos na interface

---

## [1.3.9] - 2026-03-30

### Corrigido

- **Botão "Cancelar assinatura" não aparecia após nova assinatura** — `BillingPage.syncPlan` agora re-busca o status completo (`/api/billing/status`) após detectar sync bem-sucedido, garantindo que `subscription.cancelAtPeriodEnd` seja atualizado na UI depois de uma resubscrição

---

## [1.3.8] - 2026-03-30

### Corrigido

- **Checkmarks de preço permanecem vermelhos no admin mesmo após sincronismo** — `PlansPage` agora re-busca os planos do banco após o `verify-stripe` concluir, garantindo que os `stripePriceIds` auto-reparados sejam refletidos na UI
- **Erro "Preco nao configurado" no checkout mesmo com plano existente no Stripe** — `POST /api/billing/checkout` agora tenta `syncToStripe` automaticamente se o `stripePriceId` não for encontrado no banco antes de retornar erro
- **`GET /api/billing/plans` não mostrava planos assinables sem `stripePriceIds`** — endpoint agora faz auto-heal para planos pagos com `stripePriceIds` vazios, buscando e salvando os IDs do Stripe transparentemente

---

## [1.3.7] - 2026-03-30

### Corrigido / Refatorado

- **`BillingPage` completamente refatorado**
  - Corrigido `billingStatus.status` → `billingStatus.subscription.status` (campo inexistente)
  - Corrigido `billingStatus.renewalDate` → `billingStatus.subscription.currentPeriodEnd` (campo inexistente)
  - Corrigido `inv.date` / `inv.amount` → `inv.createdAt` / `inv.amountPaid` (faturas não renderizavam)
  - Adicionado botão **"Ver"** nas faturas com link para recibo no Stripe (`invoiceUrl` / `invoicePdf`)
  - Cancelamento agora abre **modal de confirmação** em vez de UI inline
  - Plano atual exibe badge "Cancelamento agendado" quando `cancelAtPeriodEnd = true`
  - Seletor de intervalo mostra apenas intervalos configurados no Stripe (`plan.intervals`)
  - Plano atual destaca com tag "Plano atual" e exibe botão "Cancelar" em vez de "Assinar"
  - Intervalo `/mês` exibido ao lado do preço
  - i18n atualizado nos 3 locales (pt-BR, es-AR, es-MX) com novas chaves

---

## [1.3.6] - 2026-03-30

### Alterado

- **Fluxo de sincronismo de planos com Stripe completamente refatorado**
  - `verify-stripe` agora busca o produto no Stripe pela **metadata** (`admin_plan_id` / fallback `plan_key+app_id`) em vez de depender dos IDs salvos no banco; se encontrar o produto mas os IDs estiverem desatualizados no banco, corrige automaticamente (**auto-heal**)
  - `syncToStripe` busca preço ativo com mesmo valor e intervalo antes de criar um novo; arquiva preços obsoletos do mesmo intervalo; garante idempotência total
  - Criar ou editar um plano agora **auto-sincroniza com o Stripe** imediatamente (falha silenciosa se Stripe não estiver configurado)
  - Status `mismatch` retornado quando o produto existe no Stripe mas os valores divergem do banco

---

## [1.3.5] - 2026-03-30

### Corrigido

- **Sincronismo de planos com Stripe perde estado ao recarregar a página** — `syncToStripe` pulava silenciosamente a criação de novos preços se já havia um `stripePriceId` salvo, mesmo quando o valor do plano havia sido alterado; agora verifica via Stripe API se o ID ainda é válido e se o valor bate; se divergir ou estiver inativo, cria um novo Stripe Price
- **`verify-stripe` (bulk) retornava sempre "Sincronizado"** — endpoint só checava se `stripePriceIds` existia no banco, sem consultar o Stripe; agora chama `stripe.prices.retrieve()` para cada ID, retornando `missing` se inválido/inativo e `mismatch` se o valor divergir
- **PlansPage sem feedback contextual** — adicionadas dicas de ação nos status `mismatch` ("Preços alterados. Clique em Sincronizar Stripe") e `missing` para orientar o usuário

---

## [1.3.4] - 2026-03-28

### Corrigido

- **`AppNav.jsx`: crash `Cannot read properties of undefined (reading 'Item')`** — `NavTabs` não existe no `@nimbus-ds/components` v5; acesso a `NavTabs.Item` causava TypeError imediato ao renderizar; substituído por `Button` com `appearance="primary|transparent"` baseado em `isActive(path)`, seguindo o padrão correto do Nimbus DS v5

---

## [1.3.3] - 2026-03-28

### Corrigido

- **`requireAuth` não aceitava tokens do Nexo SDK** — o middleware só verificava com `JWT_SECRET` e buscava por `id` interno; tokens do Nexo são assinados com `NUVEMSHOP_CLIENT_SECRET` e têm `storeId` = nuvemshopId (string); adicionada verificação dual-key com fallback e lookup por `nuvemshopId` para tokens Nexo
- **Sincronização de `plan` com assinatura ativa** adicionada ao middleware (garante que `store.plan` reflita a assinatura ativa)

---

## [1.3.2] - 2026-03-28

### Corrigido

- **Nexo SDK: API usada incorretamente** — `NexoProvider` chamava `nexoInstance.connect()` e `nexoInstance.getSessionToken()` como métodos de instância, mas o SDK só exporta estas como **funções standalone** (`connect(instance)`, `getSessionToken(instance)`); a instância criada por `create()` não possui esses métodos
- **`iAmReady()` nunca era chamado** — sem esta chamada a Nuvemshop mantém o iframe com `height=0` e exibe erro; corrigido para chamar `iAmReady(nexoInstance)` ao final da inicialização, justo antes de `setLoading(false)`
- Imports corrigidos: `import nexo, { connect as nexoConnect, iAmReady, getSessionToken as nexoGetSessionToken } from '@tiendanube/nexo'`

---

## [1.3.1] - 2026-03-28

### Corrigido

- **`isNuvemshopReferrer()` não reconhecia lojas brasileiras** — `document.referrer` dentro do iframe aponta para `*.lojavirtualnuvem.com.br` (domínio do painel admin BR), que não estava na lista de verificação; adicionados `lojavirtualnuvem.com.br`, `mitiendanube.com` e `mynuvemshop.com`
- **Variáveis de ambiente Vercel ausentes** — `VITE_API_URL` e `VITE_NUVEMSHOP_APP_ID` não estavam configuradas no projeto Vercel, fazendo o Nexo SDK conectar com clientId `'00000'` (fallback) em vez do ID real do app (`28692`)

---

## [1.3.0] - 2026-03-28

### Corrigido

- **OAuth callback redireciona para o admin da Nuvemshop** — backend agora redireciona para `nuvemshop.com.br/admin/{userId}` (ou `tiendanube.com` para AR) após instalação; antes redirecionava para o frontend causando erro "acesso direto"
- **`InstallSuccess` reescrito** — página de fallback `/auth/callback?token=...` decodifica o JWT, mostra "Instalação concluída!" e redireciona com countdown para o admin correto; detecta país pelo payload do JWT
- **`main.jsx`** — detecta path `/auth/callback` + param `token` e renderiza `InstallSuccess` fora do `NexoProvider` (sem o erro de "acesso direto")
- **Bug #1: dev-token GET→POST** — `NexoProvider.jsx` chamava `api.get('/auth/dev-token')` mas backend tem `POST`; corrigido para `api.post('/auth/dev-token', {})`
- **Bug #4: /api/me não existe** — `NexoProvider.jsx` chamava `/api/me` (rota inexistente); corrigido para `/auth/verify-token` (rota real)

---

## [1.2.0] - 2026-03-28

### Adicionado

- **Sincronização automática de cupons com Stripe** — ao criar um cupom no admin, o sistema cria automaticamente um Stripe Coupon e um Stripe Promotion Code vinculados
- **Isolamento por app via `applies_to.products`** — cada cupom é restrito aos produtos Stripe dos planos deste app; não funciona em checkouts de outros apps na mesma conta Stripe
- **Endpoint `POST /admin-api/coupons/:id/sync-stripe`** — sincroniza um cupom existente com o Stripe (útil para cupons criados antes desta versão)
- **Endpoint `GET /admin-api/coupons/verify-stripe`** — verifica o status de todos os cupons no Stripe (synced / missing / expired / not_synced)
- **Endpoint `PATCH /admin-api/coupons/:id`** — toggle de `isActive` com desativação automática do Promotion Code no Stripe
- **Coluna "Stripe" na tabela de cupons** — badge de status (Stripe OK / Ausente / Expirado / Não sincronizado) com ícones visuais
- **Botão de sincronização por linha** — ícone de refresh em cada cupom para sincronizar individualmente
- **Botão "Verificar Stripe"** no cabeçalho da página de cupons

### Corrigido

- **Tipo de cupom unificado** — backend e frontend agora usam os mesmos tipos: `percent_off`, `amount_off`, `free_period` (antes backend usava "percentage"/"fixed")
- **Modal de edição de cupom** — código e tipo desabilitados ao editar (não podem ser alterados após criação no Stripe)

### Técnico

- Modelo `AdminCoupon` no Prisma recebeu campos `stripeCouponId String?` e `stripePromotionCodeId String?`
- `free_period` mapeado para Stripe como cupom 100% off com `duration: repeating, duration_in_months = ceil(dias/30)`
- Erros de sincronização com Stripe são não-bloqueantes: cupom é criado no banco mesmo se Stripe falhar

---

## [1.1.0] - 2026-03-28

### Corrigido

- **Sync de planos com Stripe não funcionava** — frontend enviava `prices` (plural) mas backend lia `price` (singular); preços nunca eram salvos e o syncToStripe encontrava `{}` sem criar nada no Stripe
- **Modal de edição de plano não abria** — `features` vindo do banco como objeto `{}` causava `TypeError` em `.join()` ao abrir o formulário; corrigido com `Array.isArray()` antes do `.join()`
- **Tela em branco ao acessar Planos** — `VITE_ADMIN_API_URL` não persistido no projeto Vercel fazia o app chamar `/admin-api` relativo ao próprio domínio; Vercel servia HTML pelo SPA fallback; Axios recebia string em vez de JSON → `e.map is not a function` derrubava o React inteiro

### Adicionado

- **Endpoint `GET /admin-api/plans/verify-stripe`** — verifica todos os planos de uma vez; eliminava erro 404 no carregamento da página de Planos
- **`normalizePlan()` nas respostas da API** — todas as rotas de planos agora retornam `prices` como alias de `price` para compatibilidade com o frontend
- **Metadados Stripe completos** — Product e Price criados/sincronizados com `plan_key`, `admin_plan_id`, `app_name`, `app_slug` conforme padrão NuvemPro v2.1
- **`subscription_data.metadata` completo no checkout** — inclui `app_id`, `app_name`, `app_slug`, `partner_id`, `partner_name`, `store_id`, `plan_key`, `billing_interval` para rastreamento de comissões via webhook

---

## [1.0.0] - 2026-03-28

### Adicionado

- Template base completo para apps SaaS na Nuvemshop
- Autenticação via Nuvemshop OAuth + Nexo SDK
- Billing com Stripe (checkout, portal, webhooks)
- Painel admin com gestão de planos, assinaturas, cupons, comissões, logs, FAQ, termos
- Versionamento do template exposto via `/health` e comparado com GitHub Releases
- Badge de versão no rodapé da sidebar com alerta de atualização disponível
- Exibição de conta Stripe (modo teste/produção) na página de Planos
