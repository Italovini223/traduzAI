# Prompt: Atualizar App a partir do NuvemPro App Template

> Use este prompt com Claude Code dentro do repositório do **app** (ex: BlogAI).
> O template está em: https://github.com/NuvemproApp/nuvempro-app-template

---

## PRINCÍPIO FUNDAMENTAL — LEIA ANTES DE TUDO

O template é dividido em duas camadas com responsabilidades distintas:

```
┌─────────────────────────────────────────────────────────────────┐
│  CAMADA TEMPLATE — Sempre atualizar, nunca customizar           │
│                                                                 │
│  ADMIN (100% template):                                         │
│    Planos, Assinaturas, Clientes, Configurações,                │
│    FAQ, Logs, Segurança, Dashboard de métricas                  │
│                                                                 │
│  FRONTEND — Seções base (template):                             │
│    BillingPage (assinaturas), TermsPage (contrato),             │
│    AppNav (topo + suporte), AppFooter (rodapé + versão),        │
│    NexoProvider, api.js, i18n (chaves base), BillingPage        │
│                                                                 │
├─────────────────────────────────────────────────────────────────┤
│  CAMADA APP — Nunca sobrescrever, preservar sempre              │
│                                                                 │
│  FRONTEND — Seções do app:                                      │
│    Dashboard, páginas específicas (/editor, /posts, etc.),      │
│    componentes do app, itens de nav adicionados                 │
│                                                                 │
│  BACKEND:                                                       │
│    Rotas específicas do app (/api/posts, /api/generate, etc.),  │
│    schema.prisma (models do app), configs do app                │
└─────────────────────────────────────────────────────────────────┘
```

---

## CONTEXTO QUE VOCÊ PRECISA PASSAR AO CLAUDE

```
Tenho dois repositórios:

1. TEMPLATE (fonte das atualizações):
   https://github.com/NuvemproApp/nuvempro-app-template
   — É o boilerplate base. Contém admin, frontend embedado e backend.
   — Nunca tem lógica específica de negócio.

2. APP (meu projeto, que você está editando agora):
   [URL DO SEU REPO AQUI — ex: https://github.com/NuvemproApp/blogai]
   — Baseado no template, mas com páginas, rotas e lógica específicas do app.
   — A versão atual do template neste app está em: backend/src/lib/version.js

Quero atualizar o APP com as melhorias do TEMPLATE.

REGRA CENTRAL:
- Todo o ADMIN é propriedade do template → atualizar sempre ao máximo
- As seções BASE do frontend (billing, termos, suporte, nav, rodapé, i18n base)
  são propriedade do template → atualizar sempre
- As páginas e rotas ESPECÍFICAS DO APP → nunca tocar

Siga o processo abaixo EXATAMENTE, passo a passo, sem pular etapas.
```

---

## PROCESSO COMPLETO — SIGA EXATAMENTE ESTA ORDEM

### FASE 1 — LEITURA E DIAGNÓSTICO

**1.1 — Leia a versão atual do app**
```
Leia: backend/src/lib/version.js
Anote: VERSÃO_ATUAL = valor de TEMPLATE_VERSION
```

**1.2 — Clone o template em um diretório temporário**
```bash
git clone https://github.com/NuvemproApp/nuvempro-app-template /tmp/nuvempro-template
```

**1.3 — Leia a versão do template**
```
Leia: /tmp/nuvempro-template/backend/src/lib/version.js
Anote: VERSÃO_TEMPLATE = valor de TEMPLATE_VERSION
```

**1.4 — Leia o CHANGELOG do template**
```
Leia: /tmp/nuvempro-template/CHANGELOG.md
Liste TODAS as versões entre VERSÃO_ATUAL e VERSÃO_TEMPLATE.
Para cada versão, anote o que foi Adicionado, Corrigido e Modificado.
Apresente este resumo ao usuário antes de continuar.
```

**1.5 — Mapeie SOMENTE os arquivos da Camada App (o que deve ser preservado)**

Leia estes arquivos no APP e liste o que é específico do app:
- `backend/src/server.js` — quais `require` e `app.use()` são rotas do app?
- `backend/prisma/schema.prisma` — quais models são específicos do app? (além dos do template)
- `frontend/src/App.jsx` — quais `<Route>` são específicas do app?
- `frontend/src/components/AppNav.jsx` — há botões/itens de nav adicionados pelo app?
- `frontend/src/i18n/locales/pt-BR.json` — quais chaves de primeiro nível são do app?
- `admin-frontend/src/App.jsx` — há `<Route>` de páginas específicas do app?

Apresente ao usuário a lista do que será PRESERVADO antes de continuar.

---

### FASE 2 — CLASSIFICAÇÃO DOS ARQUIVOS

#### GRUPO 1 — ADMIN (propriedade 100% do template → copiar sempre)

Estes arquivos devem ser **substituídos integralmente** pelo template.
O admin é sempre controlado pelo template — nunca há customização aqui.

```
BACKEND — Rotas admin:
  backend/src/admin/routes/adminPlans.js
  backend/src/admin/routes/adminSubscriptions.js
  backend/src/admin/routes/adminCustomers.js
  backend/src/admin/routes/adminConfig.js
  backend/src/admin/routes/adminFaq.js
  backend/src/admin/routes/adminLogs.js
  backend/src/admin/routes/adminSecurity.js
  backend/src/admin/routes/adminCoupons.js
  backend/src/admin/routes/adminCommissions.js
  backend/src/admin/routes/adminTerms.js
  backend/src/admin/services/adminPlanService.js
  backend/src/admin/middleware/adminAuth.js
  backend/src/admin/middleware/requireRole.js

ADMIN FRONTEND — Todas as páginas base:
  admin-frontend/src/pages/DashboardPage.jsx    ← métricas, metas, margem
  admin-frontend/src/pages/PlansPage.jsx        ← planos + sync Stripe
  admin-frontend/src/pages/SubscriptionsPage.jsx ← assinaturas
  admin-frontend/src/pages/CustomersPage.jsx    ← lojas/clientes
  admin-frontend/src/pages/CustomerDetailPage.jsx
  admin-frontend/src/pages/SettingsPage.jsx     ← trial, metas, senha, suporte
  admin-frontend/src/pages/FaqPage.jsx          ← FAQ + config de suporte
  admin-frontend/src/pages/LogsPage.jsx
  admin-frontend/src/pages/SecurityPage.jsx
  admin-frontend/src/pages/CouponsPage.jsx
  admin-frontend/src/pages/CommissionsPage.jsx
  admin-frontend/src/pages/TermsPage.jsx
  admin-frontend/src/components/StatCard.jsx
  admin-frontend/src/services/adminApi.js
  admin-frontend/vercel.json
```

#### GRUPO 2 — FRONTEND BASE (propriedade do template → copiar sempre)

Estas são as seções base do frontend que o template controla:
billing, contrato, suporte, nav, rodapé, auth e idiomas base.

```
FRONTEND — Seções base:
  frontend/src/pages/BillingPage.jsx       ← assinaturas (planos, checkout, cancel)
  frontend/src/pages/TermsPage.jsx         ← contrato/termos de uso
  frontend/src/providers/NexoProvider.jsx  ← auth Nexo SDK, billingStatus
  frontend/src/services/api.js             ← axios com token refresh
  frontend/src/components/AppFooter.jsx    ← rodapé com versão e assinatura

FRONTEND — Nav/Suporte (merge: template controla o sidebar, app controla os botões de nav):
  frontend/src/components/AppNav.jsx       ← ver regra de merge abaixo

FRONTEND — i18n (merge: adicionar chaves do template, preservar chaves do app):
  frontend/src/i18n/locales/pt-BR.json
  frontend/src/i18n/locales/es-AR.json
  frontend/src/i18n/locales/es-MX.json
```

#### GRUPO 3 — BACKEND BASE (propriedade do template → copiar sempre)

```
  backend/src/routes/billing.js            ← checkout, cancel, sync, status, plans
  backend/src/routes/terms.js              ← aceite de termos
  backend/src/routes/support.js            ← FAQ público + config suporte
  backend/src/routes/auth.js               ← OAuth Nuvemshop
  backend/src/config/stripe.js             ← StripeService
  backend/src/middleware/auth.js           ← requireAuth JWT
  backend/src/middleware/rateLimiter.js    ← 5 níveis de rate limiting
  backend/src/lib/errors.js               ← AppError
  backend/src/lib/paginate.js             ← parsePagination, paginatedResponse
  backend/src/lib/version.js             ← TEMPLATE_VERSION
```

#### GRUPO 4 — INFRAESTRUTURA (propriedade do template → copiar sempre)

```
  backend/railway.json
  backend/doppler.yaml
  frontend/doppler.yaml
  admin-frontend/doppler.yaml
  backend/.env.example
  frontend/.env.example
  admin-frontend/.env.example
  scripts/setup-dev.sh
  scripts/validate-template.sh
```

#### GRUPO 5 — MERGE OBRIGATÓRIO (template evoluiu + app tem partes próprias)

```
backend/src/server.js
  Template controla: imports e app.use() das rotas dos grupos 2, 3 e admin
  App controla: imports e app.use() das rotas específicas do app
  Estratégia:
    1. Copie integralmente o server.js do template
    2. Identifique os requires e app.use() das rotas do APP (anotados na Fase 1.5)
    3. Adicione-os de volta no bloco "APP ROUTES" do server.js
    4. Nunca remover rotas do app

backend/prisma/seed-admin.js
  Template controla: upserts de AdminConfig (trial, goals, support), planos padrão
  App controla: planos específicos do app (podem ter nomes/preços diferentes)
  Estratégia:
    1. Compare bloco a bloco com o template
    2. Adicione novos blocos de AdminConfig que faltam
    3. NÃO substitua os planos se o app tem planos customizados

frontend/src/App.jsx
  Template controla: gates (Terms, Billing, Trial), TrialBanner, estrutura de Layout
  App controla: as <Route> específicas do app dentro do <Layout>
  Estratégia:
    1. Copie integralmente o App.jsx do template
    2. Dentro do bloco <Route element={<Layout />}>, adicione de volta as rotas do app
    3. Preserve imports dos componentes do app

frontend/src/components/AppNav.jsx
  Template controla: TUDO exceto os botões de navegação específicos do app
  App controla: botões de nav adicionados (ex: <Button onClick={() => navigate('/posts')}>)
  Estratégia:
    1. Copie integralmente o AppNav.jsx do template
    2. No bloco "Left nav" (comentário no código), adicione os botões do app
    3. O Sidebar de suporte é 100% template — nunca customizar

frontend/src/i18n/locales/pt-BR.json (e es-AR.json, es-MX.json)
  Template controla: chaves base (nav, billing, trial, support, terms, common)
  App controla: chaves específicas do app (ex: "posts", "editor", "ai")
  Estratégia:
    1. Leia o JSON do template e o JSON do app
    2. Faça um merge: chaves do template + chaves do app
    3. Em caso de conflito de valor na mesma chave, pergunte ao usuário

admin-frontend/src/App.jsx
  Template controla: rotas das páginas base do admin
  App controla: rotas de páginas admin específicas do app (se houver)
  Estratégia:
    1. Copie integralmente o App.jsx do admin do template
    2. Adicione de volta as rotas de páginas admin do app (se houver)

.github/workflows/ci.yml
  Template controla: estrutura dos 3 jobs, bloco env, steps de build e test
  App controla: steps adicionais específicos do app (se houver)
  Estratégia:
    1. Copie integralmente o ci.yml do template
    2. Adicione steps extras do app (se houver)

vercel.json (raiz)
  Template controla: buildCommand, installCommand, outputDirectory
  App controla: rewrites customizados, headers adicionais (se houver)
  Estratégia:
    1. Atualize buildCommand e installCommand do template
    2. Preserve rewrites e headers customizados do app
```

#### GRUPO 6 — NUNCA TOCAR (100% propriedade do app)

```
backend/prisma/schema.prisma              ← NUNCA sobrescrever
backend/src/routes/[rotas do app]         ← ex: posts.js, generate.js, analytics.js
backend/src/config/[configs do app]       ← ex: openai.js, s3.js
frontend/src/pages/Dashboard.jsx         ← dashboard do app
frontend/src/pages/[páginas do app]       ← ex: Editor.jsx, Posts.jsx
frontend/src/components/[do app]         ← componentes específicos
admin-frontend/src/pages/[do app]        ← páginas admin específicas
```

---

### FASE 3 — APLICAR AS ATUALIZAÇÕES

**3.1 — Crie uma branch de atualização**
```bash
git checkout -b update/template-vX.Y.Z
```

**3.2 — Grupos 1, 2, 3 e 4: substituição direta**

Para cada arquivo dos grupos 1, 2, 3 e 4 que foi modificado no template:
```bash
cp /tmp/nuvempro-template/[caminho] ./[caminho]
```
Registre cada arquivo copiado. Só copie arquivos que realmente mudaram.

**3.3 — Grupo 5: merge manual**

Para cada arquivo do Grupo 5, execute o protocolo:
1. Leia o arquivo no APP (versão atual com customizações do app anotadas)
2. Leia o arquivo no TEMPLATE (versão nova)
3. Aplique o template integralmente
4. Reinsira SOMENTE as partes identificadas como "do app" na Fase 1.5
5. Confirme que nada do app foi perdido

**3.4 — Verifique arquivos novos no template**

Arquivos que existem no template mas não no app:
```bash
diff -rq --exclude="node_modules" --exclude="*.lock" \
  /tmp/nuvempro-template/backend/src/ ./backend/src/ | grep "Only in /tmp"
```
Copie os novos arquivos dos grupos 1-4. Para o server.js, registre-os na rota.

---

### FASE 4 — BANCO DE DADOS

**4.1 — Verifique models do template no schema do app**

NÃO copie o schema. Apenas compare e adicione campos/models faltantes:

```bash
diff /tmp/nuvempro-template/backend/prisma/schema.prisma ./backend/prisma/schema.prisma
```

Models obrigatórios do template (verifique se existem no app com os campos corretos):
| Model | Campos obrigatórios |
|---|---|
| `AdminConfig` | id, key (unique), value, group, label |
| `AdminFaq` | id, category, question, answer, videoUrl, isPublished, sortOrder |
| `AdminLog` | id, adminId, action, entity, entityId, details, ipAddress |
| `AdminCoupon` | id, name, stripeCouponId, isActive |
| `TermsVersion` | id, version, title, content, **isPublished** (não isActive!) |
| `TermsAcceptance` | id, storeId, termsVersionId — unique([storeId, termsVersionId]) |

Se campos estiverem faltando, adicione ao schema e rode:
```bash
cd backend && npx prisma db push && npx prisma generate
```

**4.2 — AdminConfig: verifique todas as chaves obrigatórias**

Compare o seed do template com o banco do app. Chaves obrigatórias:

| Grupo | Chaves |
|---|---|
| `trial` | trial_mode, trial_days, trial_coupon |
| `goals` | goal_stores, goal_subs, goal_trial, goal_mrr, server_cost |
| `support` | support_video_url, support_whatsapp |

Para chaves faltantes, adicione o upsert no seed e rode:
```bash
cd backend && node prisma/seed-admin.js
```

---

### FASE 5 — VERIFICAÇÃO

**5.1 — Backend compila sem erros**
```bash
cd backend && node -e "require('./src/server.js')" && echo "✓ Backend OK"
```

**5.2 — Builds passam**
```bash
cd frontend && npm run build && echo "✓ Frontend OK"
cd admin-frontend && npm run build && echo "✓ Admin OK"
```

**5.3 — Testes passam**
```bash
cd backend && npm test
# Todos os 15 suites devem passar. Se falhar, corrija antes de continuar.
```

**5.4 — Checklist funcional obrigatório**

Seções do template (verificar obrigatoriamente):
- [ ] Admin → Dashboard (métricas, metas, margem, trends)
- [ ] Admin → Planos (listar, criar, sync Stripe)
- [ ] Admin → Assinaturas (lista com storeName flat, métricas MRR/ARR)
- [ ] Admin → Lojas/Clientes (status computado, detalhe com store)
- [ ] Admin → Configurações (trial, metas, senha, suporte: vídeo + WhatsApp)
- [ ] Admin → FAQ (criar, editar, publicar, config de suporte)
- [ ] Admin → Logs e Segurança
- [ ] Frontend → BillingPage (planos, checkout, cancelar, faturas)
- [ ] Frontend → TermsPage (aceite de termos)
- [ ] Frontend → Sidebar de Suporte (FAQ do banco, vídeo 16:9, WhatsApp)
- [ ] Frontend → Trial banner (se trial_mode=free)

Seções do app (verificar que não quebraram):
- [ ] [Liste aqui as páginas e fluxos específicos do app]

---

### FASE 6 — COMMIT E DEPLOY

**6.1 — Atualize a versão**
```
Edite: backend/src/lib/version.js
TEMPLATE_VERSION = '[VERSÃO_TEMPLATE]'
```

**6.2 — Atualize o CHANGELOG do app**
```markdown
## [VERSÃO_TEMPLATE] - DATA
### Template Update
Atualizado do NuvemPro App Template vVERSÃO_TEMPLATE:
- Admin: [o que mudou]
- Frontend base: [o que mudou]
- Infraestrutura: [o que mudou]
Preservado do app: [o que foi mantido]
```

**6.3 — Commit**
```bash
git add -A
git commit -m "chore: atualiza template para vX.Y.Z

Admin, billing, termos, suporte e infraestrutura atualizados.
Páginas e rotas específicas do app preservadas.

Template: NuvemproApp/nuvempro-app-template@vX.Y.Z"
```

**6.4 — Pull Request**
```bash
gh pr create \
  --title "chore: template update v[VERSÃO_TEMPLATE]" \
  --body "## Template Update

**De:** v[VERSÃO_ATUAL] → **Para:** v[VERSÃO_TEMPLATE]

## Atualizado (template)
- [ ] Admin completo (planos, assinaturas, clientes, config, faq, logs, segurança)
- [ ] Frontend base (billing, termos, suporte, nav, rodapé, i18n)
- [ ] Infraestrutura (railway.json, doppler.yaml, ci.yml, vercel.json)

## Preservado (app)
- [ ] [listar páginas do app]
- [ ] [listar rotas backend do app]
- [ ] [listar chaves i18n do app]

## Verificações
- [ ] npm test — todos passando
- [ ] Build frontend OK
- [ ] Build admin OK
- [ ] Funcionalidades do app testadas"
```

**6.5 — Após merge: seed em produção**
```bash
# Via Railway shell ou CLI:
cd backend && node prisma/seed-admin.js
```

---

## REGRAS DE OURO — NUNCA VIOLAR

```
1. NUNCA sobrescrever backend/prisma/schema.prisma
2. NUNCA remover rotas do app em server.js
3. NUNCA remover chaves i18n específicas do app
4. NUNCA commitar sem build e testes passando
5. SEMPRE trabalhar em branch separada
6. SEMPRE apresentar o CHANGELOG antes de editar qualquer arquivo
7. SEMPRE perguntar ao usuário em caso de dúvida entre "template" vs "app"
8. Se o merge do Grupo 5 tiver conflito irresolvível → mostrar o diff e aguardar decisão
9. O admin é 100% template — nunca questionar se deve atualizar o admin
10. O sidebar de Suporte (AppNav) é 100% template — nunca preservar customizações nele
```

---

## INFORMAÇÕES QUE VOCÊ DEVE COLETAR DO USUÁRIO ANTES DE COMEÇAR

```
1. URL do repositório do app: _______________
2. Branch principal (main/master): _______________
3. Versão atual do template no app (ou "não sei"): _______________
4. Páginas específicas do app (frontend):
   Ex: /dashboard, /editor, /posts, /analytics
5. Rotas específicas do backend:
   Ex: /api/posts, /api/generate, /api/analytics
6. Itens de nav adicionados no AppNav (botões além do Dashboard/Billing):
   Ex: botão "Posts" → /posts
7. Chaves i18n específicas do app (namespace de primeiro nível):
   Ex: "posts", "editor", "ai"
8. Banco de produção está rodando? (para o seed pós-deploy)
9. Deploy automático (GitHub Actions) ou manual?
```

---

*Template: NuvemproApp/nuvempro-app-template*
*Versão do prompt: 2.0.0 | Compatível com template v1.6.0+*
*Última revisão: 2026-03-31*
