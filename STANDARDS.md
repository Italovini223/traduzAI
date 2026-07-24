# STANDARDS.md — Regras Obrigatorias NuvemPro

> Checklist rapido de conformidade. Todo app DEVE seguir estas regras.
> Validar antes de qualquer deploy.

---

## 1. Padrao de Erros

### Formato Unico de Resposta de Erro

```json
{
  "error": "Mensagem legivel para o usuario",
  "code": "ERROR_CODE_SNAKE_CASE",
  "status": 400
}
```

### Classe AppError (backend)

```javascript
// src/lib/errors.js
class AppError extends Error {
  constructor(message, status = 500, code = 'INTERNAL_ERROR') {
    super(message);
    this.status = status;
    this.code = code;
  }
}
```

### Uso

```javascript
// Em qualquer rota ou service:
throw new AppError('Plano nao encontrado', 404, 'PLAN_NOT_FOUND');
throw new AppError('Email ja cadastrado', 409, 'EMAIL_ALREADY_EXISTS');
throw new AppError('Permissao insuficiente', 403, 'FORBIDDEN');
```

### Error Handler Global (server.js)

```javascript
app.use((err, req, res, next) => {
  // AppError → responde com status + code
  if (err.status && err.code) {
    return res.status(err.status).json({
      error: err.message,
      code: err.code,
      status: err.status,
    });
  }

  // Prisma P2002 (unique constraint)
  if (err.code === 'P2002') {
    return res.status(409).json({
      error: 'Registro ja existe',
      code: 'DUPLICATE_ENTRY',
      status: 409,
    });
  }

  // Prisma P2025 (not found)
  if (err.code === 'P2025') {
    return res.status(404).json({
      error: 'Registro nao encontrado',
      code: 'NOT_FOUND',
      status: 404,
    });
  }

  // Erro generico
  console.error('[ERROR]', err);
  res.status(500).json({
    error: process.env.NODE_ENV === 'production' ? 'Erro interno' : err.message,
    code: 'INTERNAL_ERROR',
    status: 500,
  });
});
```

### Codigos Padrao

| Codigo | Status | Quando usar |
|--------|--------|-------------|
| VALIDATION_ERROR | 400 | Input invalido |
| UNAUTHORIZED | 401 | Token ausente ou invalido |
| FORBIDDEN | 403 | Sem permissao (role) |
| NOT_FOUND | 404 | Recurso inexistente |
| DUPLICATE_ENTRY | 409 | Unique constraint violada |
| RATE_LIMIT_EXCEEDED | 429 | Rate limit atingido |
| INTERNAL_ERROR | 500 | Erro nao tratado |
| STRIPE_ERROR | 502 | Falha na API Stripe |
| SERVICE_UNAVAILABLE | 503 | Servico externo fora |

---

## 2. Rate Limiting

### Camadas Obrigatorias

| Camada | Limite | Janela | Aplicar em |
|--------|--------|--------|-----------|
| Global | 60 req | 1 min | Todas as rotas |
| Auth App | 15 req | 15 min | /auth/* |
| Checkout | 5 req | 1 min | /api/billing/checkout |
| Admin Login | 5 req | 15 min | /admin-api/auth/login |
| Admin API | 30 req | 1 min | /admin-api/* (exceto auth) |

### Implementacao

```javascript
// src/middleware/rateLimiter.js
const rateLimit = require('express-rate-limit');

const globalLimiter = rateLimit({
  windowMs: 60 * 1000,        // 1 min
  max: 60,
  standardHeaders: true,       // RateLimit-* headers
  legacyHeaders: false,
  message: { error: 'Muitas requisicoes.', code: 'RATE_LIMIT_EXCEEDED', status: 429 },
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,   // 15 min
  max: 15,
  message: { error: 'Muitas tentativas. Aguarde 15 minutos.', code: 'AUTH_RATE_LIMIT', status: 429 },
});

const checkoutLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  message: { error: 'Muitas tentativas de checkout.', code: 'CHECKOUT_RATE_LIMIT', status: 429 },
});

const adminLoginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { error: 'Muitas tentativas de login.', code: 'ADMIN_LOGIN_RATE_LIMIT', status: 429 },
});

module.exports = { globalLimiter, authLimiter, checkoutLimiter, adminLoginLimiter };
```

### Aplicacao no server.js

```javascript
const { globalLimiter, authLimiter } = require('./middleware/rateLimiter');

// Global (ANTES de todas as rotas)
app.use(globalLimiter);

// Auth-specific
app.use('/auth', authLimiter, require('./routes/auth'));

// Checkout-specific (dentro de billing.js)
router.post('/checkout', checkoutLimiter, async (req, res, next) => { ... });

// Admin login (dentro de adminAuth.js)
router.post('/login', adminLoginLimiter, async (req, res, next) => { ... });
```

---

## 3. Padrao de Paginacao

### Contrato de Request

```
GET /admin-api/customers?page=1&limit=20&search=texto&tab=active
```

| Param | Tipo | Default | Max |
|-------|------|---------|-----|
| page | int | 1 | — |
| limit | int | 20 | 100 |
| search | string | — | — |
| tab | string | all | — |

### Contrato de Response

```json
{
  "data": [ { "id": 1, "name": "..." }, ... ],
  "meta": {
    "page": 1,
    "limit": 20,
    "total": 150,
    "totalPages": 8
  }
}
```

### Helper (backend)

```javascript
// src/lib/paginate.js
function parsePagination(query, defaults = {}) {
  const page = Math.max(1, parseInt(query.page) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(query.limit) || defaults.limit || 20));
  const skip = (page - 1) * limit;
  return { page, limit, skip };
}

function paginatedResponse(data, total, { page, limit }) {
  return {
    data,
    meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
}
```

### Uso em Rotas

```javascript
const { parsePagination, paginatedResponse } = require('../../lib/paginate');

router.get('/', async (req, res) => {
  const { page, limit, skip } = parsePagination(req.query);
  const where = {}; // filtros

  const [data, total] = await Promise.all([
    prisma.model.findMany({ where, skip, take: limit, orderBy: { createdAt: 'desc' } }),
    prisma.model.count({ where }),
  ]);

  res.json(paginatedResponse(data, total, { page, limit }));
});
```

### Frontend (DataTable)

```javascript
// O componente DataTable recebe meta e onPageChange:
<DataTable
  columns={columns}
  rows={data}
  meta={meta}
  onPageChange={(newPage) => setPage(newPage)}
/>
```

### ⚠️ Consumo Correto no Frontend (Admin)

`paginatedResponse` sempre retorna `{ data: [], meta: {} }`.
**NUNCA** use `res.data.items || res.data` — isso retorna o objeto inteiro e `.map()` nele causa crash silencioso (tela branca).

```javascript
// ✅ CORRETO — sempre usar res.data.data
const fetchItems = async () => {
  const res = await adminApi.get('/endpoint');
  setItems(res.data.data || []);          // array de itens
  setMeta(res.data.meta || {});           // { page, limit, total, totalPages }
};

// ❌ ERRADO — res.data é { data:[], meta:{} }, não um array
setItems(res.data.items || res.data || []); // crash: {}.map is not a function
setItems(res.data || []);                   // crash: idem
```

**Por que isso causa tela branca?**
`res.data` é um objeto `{ data: [], meta: {} }`. É truthy, então o `|| []` nunca é atingido.
O estado recebe um objeto. Quando o componente chama `.map()` no estado → `TypeError` → React renderiza nada (sem ErrorBoundary = tela branca).

---

## 4. Seguranca

### 4.1 Headers HTTP (helmet)

```javascript
// server.js — ANTES de qualquer rota
const helmet = require('helmet');

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'", "https://api.stripe.com"],
      frameSrc: ["'self'", "https://js.stripe.com"],
      frameAncestors: ["'self'",
        "https://*.nuvemshop.com.br",
        "https://*.tiendanube.com",
        "https://*.mitiendanube.com",
        "https://*.mynuvemshop.com",
      ],
    },
  },
  crossOriginEmbedderPolicy: false,  // necessario para iframe
}));
```

### 4.2 CSP no Frontend (Vercel)

```json
// vercel.json
{
  "headers": [{
    "source": "/(.*)",
    "headers": [{
      "key": "Content-Security-Policy",
      "value": "frame-ancestors 'self' https://*.nuvemshop.com.br https://*.tiendanube.com https://*.mitiendanube.com https://*.mynuvemshop.com"
    }]
  }],
  "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }]
}
```

### 4.3 Sanitizacao de Input

```javascript
// Nunca confiar em dados do usuario:
// 1. Strings: .trim() antes de salvar
// 2. HTML: DOMPurify no frontend antes de renderizar
// 3. IDs: parseInt() ou validacao de formato
// 4. Email: regex basica antes de salvar
// 5. JSON: try/catch ao parsear

// No frontend (qualquer HTML do usuario):
import DOMPurify from 'dompurify';
const clean = DOMPurify.sanitize(userHtml);
```

### 4.4 Protecoes Obrigatorias

| Protecao | Como | Onde |
|----------|------|------|
| XSS | DOMPurify + helmet CSP | Frontend + Backend |
| CSRF | Token-based (JWT no header) | Automatico com Bearer token |
| SQL Injection | Prisma ORM (parameterized) | Automatico |
| CORS | allowedOrigins whitelist | server.js |
| Rate Limiting | express-rate-limit | 5 camadas |
| Webhook tampering | Stripe signature verify | webhook.js |
| Password hashing | bcryptjs cost=12 | adminAuth |
| Session hijacking | AdminSession + expiresAt | adminAuth middleware |
| Brute force | Rate limiter + account lockout | Login endpoints |
| Token expiry | JWT expiresIn: '8h' (admin), '24h' (app) | Auth routes |

### 4.5 Checklist de Seguranca Pre-Deploy

- [ ] helmet() configurado com CSP
- [ ] CORS com whitelist de origens
- [ ] Rate limiters em todas as camadas
- [ ] Webhook com verificacao de assinatura
- [ ] Senhas com bcrypt cost >= 12
- [ ] JWT com expiracao definida
- [ ] AdminSession validada por request
- [ ] DOMPurify em todo HTML renderizado
- [ ] .env nao commitado no git
- [ ] ADMIN_JWT_SECRET diferente de JWT_SECRET
- [ ] CSP frame-ancestors inclui dominios Nuvemshop
- [ ] Acesso direto (fora do iframe) bloqueado

---

## 5. Testes Minimos

### Smoke Tests Obrigatorios

Todo app DEVE ter pelo menos estes testes passando antes do deploy:

```javascript
// src/__tests__/health.test.js
const { describe, it } = require('node:test');
const assert = require('node:assert');

const BASE = process.env.TEST_URL || 'http://localhost:3001';

describe('Health', () => {
  it('GET /health → 200', async () => {
    const r = await fetch(`${BASE}/health`);
    assert.strictEqual(r.status, 200);
    const b = await r.json();
    assert.strictEqual(b.ok, true);
  });

  it('GET /admin-api/health → 200', async () => {
    const r = await fetch(`${BASE}/admin-api/health`);
    assert.strictEqual(r.status, 200);
  });
});

describe('Auth', () => {
  it('Protected app routes → 401 without token', async () => {
    const routes = ['/api/billing/status', '/api/terms/status', '/api/profile'];
    for (const route of routes) {
      const r = await fetch(`${BASE}${route}`);
      assert.strictEqual(r.status, 401, `${route} should be 401`);
    }
  });

  it('Protected admin routes → 401 without token', async () => {
    const routes = ['/admin-api/plans', '/admin-api/customers', '/admin-api/config'];
    for (const route of routes) {
      const r = await fetch(`${BASE}${route}`);
      assert.strictEqual(r.status, 401, `${route} should be 401`);
    }
  });

  it('Admin login → 400 without body', async () => {
    const r = await fetch(`${BASE}/admin-api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });
    assert.strictEqual(r.status, 400);
    const b = await r.json();
    assert(b.code, 'Should have error code');
  });
});

describe('Webhook', () => {
  it('POST /webhook → 400 without Stripe signature', async () => {
    const r = await fetch(`${BASE}/webhook`, {
      method: 'POST',
      body: '{}',
      headers: { 'Content-Type': 'application/json' },
    });
    assert.strictEqual(r.status, 400);
  });
});

describe('Error Format', () => {
  it('Errors return { error, code, status } format', async () => {
    const r = await fetch(`${BASE}/admin-api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });
    const b = await r.json();
    assert(typeof b.error === 'string', 'error should be string');
    assert(typeof b.code === 'string', 'code should be string');
  });
});
```

### Como Executar

```bash
# 1. Backend rodando
npm run dev

# 2. Em outro terminal
npm test

# Ou com URL customizada (producao)
TEST_URL=https://backend.railway.app npm test
```

### Cobertura Minima

| Area | Testes | Status |
|------|--------|--------|
| Health check | 2 | Obrigatorio |
| Auth protection (app) | 3 routes | Obrigatorio |
| Auth protection (admin) | 3 routes | Obrigatorio |
| Admin login validation | 1 | Obrigatorio |
| Webhook signature | 1 | Obrigatorio |
| Error format | 1 | Obrigatorio |
| **Total minimo** | **~10** | **Obrigatorio** |

### Adicionar Testes Especificos do App

Apos a base, cada app adiciona testes para suas funcionalidades:

```javascript
// src/__tests__/app-specific.test.js
describe('App: [NomeDoApp]', () => {
  // Testes especificos da logica do app
});
```

---

---

## 6. Versionamento e Release (OBRIGATORIO apos toda atualizacao)

### Regra Geral

**Toda alteracao no template — seja bug fix, nova feature ou melhoria — DEVE seguir este processo de release antes de ser considerada concluida.**

### Quando Incrementar

| Tipo de mudanca | Versao | Exemplo |
|-----------------|--------|---------|
| Bug fix, melhoria pequena | PATCH (x.x.**+1**) | 1.1.0 → 1.1.1 |
| Nova funcionalidade, nova rota, nova tela | MINOR (x.**+1**.0) | 1.1.0 → 1.2.0 |
| Breaking change, migration de banco, refactor arquitetural | MAJOR (**+1**.0.0) | 1.1.0 → 2.0.0 |

### Processo Obrigatorio (executar sempre)

#### Passo 1 — Atualizar versao
```javascript
// backend/src/lib/version.js
const TEMPLATE_VERSION = 'X.Y.Z'; // novo numero
```

#### Passo 2 — Atualizar CHANGELOG.md
```markdown
## [X.Y.Z] - YYYY-MM-DD

### Corrigido
- Descricao do bug fix

### Adicionado
- Descricao da nova feature
```

#### Passo 3 — Commit + Tag + Push
```bash
git add backend/src/lib/version.js CHANGELOG.md
git commit -m "chore: bump versao para vX.Y.Z"
git tag vX.Y.Z
git push origin main
git push origin vX.Y.Z
```

#### Passo 4 — Criar Release no GitHub
```bash
# Via API (substituir X.Y.Z e DESCRICAO)
curl -X POST https://api.github.com/repos/NuvemproApp/nuvempro-app-template/releases \
  -H "Authorization: Bearer $GH_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"tag_name":"vX.Y.Z","name":"vX.Y.Z - DESCRICAO","body":"...","draft":false,"prerelease":false}'
```

#### Passo 5 — Deploy Railway (backend)
```bash
# Via API Railway (obtem COMMIT_SHA do ultimo commit)
# Necessario para templateVersion atualizar no /health e na sidebar do admin
```

#### Passo 6 — Verificar no admin
- Sidebar mostra `vX.Y.Z` no rodape
- `/admin-api/health` retorna `"templateVersion": "X.Y.Z"`

### Por que isso importa

O badge de versao na sidebar compara a versao local com o GitHub Releases via API. Se o template nao for tagueado + release criado, apps que usam este template nao saberao que existe uma atualizacao disponivel.

### Checklist de Release

```
[ ] version.js atualizado com novo numero
[ ] CHANGELOG.md atualizado com o que mudou
[ ] commit com mensagem "chore: bump versao para vX.Y.Z"
[ ] git tag vX.Y.Z criada e pushed
[ ] Release publicado no GitHub com notas
[ ] Deploy Railway feito (backend)
[ ] /admin-api/health retorna versao nova
[ ] Sidebar do admin exibe versao nova
```

---

## 7. Deploy — Regras Críticas

### 7.1 Git — Autor de Commit

O Vercel usa o email do committer para associar ao GitHub. Email errado = **deploy bloqueado**.

```bash
# Configurar SEMPRE antes de commitar neste repo:
git config user.email "6935080+eriveltoncabral@users.noreply.github.com"
git config user.name "eriveltoncabral"
```

> O ID `6935080` é o ID GitHub do usuário. Para encontrar: `GET https://api.github.com/users/{username}`

---

### 7.2 Vercel — Dois Projetos Separados

O monorepo tem **dois** projetos Vercel distintos. Cada um **deve** ter seu `rootDirectory` configurado corretamente:

| Projeto | rootDirectory | Build | URL |
|---------|--------------|-------|-----|
| `frontend` | *(raiz)* | usa `vercel.json` raiz | `frontend-eriveltoncabral.vercel.app` |
| `admin-frontend` | **`admin-frontend`** | usa `admin-frontend/vercel.json` | `admin-frontend-six-nu.vercel.app` |

#### ⚠️ Problema crítico: rootDirectory ausente no admin-frontend

Se `rootDirectory` do projeto `admin-frontend` no Vercel for `null`:
- Vercel usa o `vercel.json` da **raiz** do repo
- A raiz builda o **frontend principal** (app Nuvemshop)
- O admin-frontend servirá o app e mostrará: *"Este aplicativo deve ser acessado pelo painel da Nuvemshop."*

**Correção via API:**
```bash
curl -X PATCH "https://api.vercel.com/v9/projects/PROJETO_ID" \
  -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"rootDirectory":"admin-frontend","framework":"vite"}'
```

O `admin-frontend/vercel.json` deve ter:
```json
{
  "buildCommand": "npm install && npm run build",
  "outputDirectory": "dist",
  "installCommand": "npm install",
  "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }]
}
```

---

### 7.3 Deploy Manual via API (sem auto-deploy GitHub)

Os projetos Vercel deste template não têm link automático com GitHub.
**Todo deploy requer chamada manual à API.**

```bash
SHA=$(git rev-parse HEAD)

# Frontend principal
curl -X POST "https://api.vercel.com/v13/deployments?projectId=PROJ_FRONTEND_ID" \
  -H "Authorization: Bearer VERCEL_TOKEN" -H "Content-Type: application/json" \
  -d "{\"name\":\"frontend\",\"target\":\"production\",\"gitSource\":{\"type\":\"github\",\"repoId\":REPO_ID,\"ref\":\"main\",\"sha\":\"$SHA\"}}"

# Admin frontend
curl -X POST "https://api.vercel.com/v13/deployments?projectId=PROJ_ADMIN_ID" \
  -H "Authorization: Bearer VERCEL_TOKEN" -H "Content-Type: application/json" \
  -d "{\"name\":\"admin-frontend\",\"target\":\"production\",\"gitSource\":{\"type\":\"github\",\"repoId\":REPO_ID,\"ref\":\"main\",\"sha\":\"$SHA\"}}"

# Backend (Railway)
curl -X POST "https://backboard.railway.com/graphql/v2" \
  -H "Authorization: Bearer RAILWAY_TOKEN" -H "Content-Type: application/json" \
  -d '{"query":"mutation { serviceInstanceRedeploy(serviceId: \"SERVICE_ID\", environmentId: \"ENV_ID\") }"}'
```

---

### 7.4 Admin Frontend — Acesso Direto (sem iframe)

O admin frontend é uma aplicação **separada** do app embedado na Nuvemshop.
- **Não tem** restrição de iframe
- **Não usa** Nexo SDK
- Acessado diretamente via URL do navegador
- Autenticado por login próprio (`/login`) com JWT admin

O `NexoProvider` (que bloqueia acesso direto com "Este aplicativo deve ser acessado...") existe **apenas no `frontend/`**, não no `admin-frontend/`.

---

### Checklist de Deploy

```
[ ] git config user.email correto (noreply GitHub)
[ ] version.js e CHANGELOG.md atualizados
[ ] commit e push para main
[ ] Vercel frontend: deploy via API com SHA correto
[ ] Vercel admin-frontend: rootDirectory="admin-frontend" configurado
[ ] Vercel admin-frontend: deploy via API com SHA correto
[ ] Railway backend: serviceInstanceRedeploy disparado
[ ] Verificar STATUS: READY nos 3 serviços
```

---

## Resumo — Validacao Rapida

Antes de fazer deploy, confirme:

```
[ ] Erros seguem formato { error, code, status }
[ ] AppError usado em todas as rotas
[ ] Rate limiters configurados (5 camadas)
[ ] Paginacao usa parsePagination + paginatedResponse
[ ] Frontend admin usa res.data.data (nunca res.data.campo || res.data)
[ ] Respostas paginadas retornam { data, meta }
[ ] helmet() no server.js com CSP
[ ] DOMPurify no frontend
[ ] CORS whitelist configurado
[ ] 10+ smoke tests passando
[ ] .env nao esta no git
[ ] git config user.email com noreply GitHub (evita bloqueio Vercel)
[ ] Vercel admin-frontend tem rootDirectory="admin-frontend"
[ ] Deploy dos 3 serviços: frontend, admin-frontend, backend (Railway)
```

---

## 8. QA — Arquitetura de Testes e Release Gates

### 8.1 Pirâmide de Testes do Template

```
         [E2E — futuro]
        /              \
    [Build Gate]  [Contrato API]
   /                            \
[Utils/Puras]          [Auth Guards]
```

| Camada | Ferramentas | Localização | O que cobre |
|--------|-------------|-------------|-------------|
| **Unit** | `node:test` | `__tests__/utils.test.js` | isFree, pagination, AppError, regras de negócio |
| **Contract** | `node:test` + fetch | `__tests__/admin-api.test.js` | Shape de todas as respostas da API |
| **Auth Guards** | `node:test` + fetch | `__tests__/auth-guard.test.js` | Toda rota retorna 401 sem token |
| **Build Gate** | `npm run build` | GitHub Actions | Frontend e admin-frontend compilam sem erro |
| **Smoke** | `node:test` + fetch | `__tests__/health.test.js` | Endpoints básicos sobem e respondem |

### 8.2 Contrato de API — Regras Obrigatórias

Toda resposta de API DEVE ser testada em `admin-api.test.js`. Requisitos mínimos:

- **Listas paginadas**: `{ data: [], meta: { page, limit, total, totalPages } }` — nunca array direto
- **Features de plano**: sempre array de strings — nunca objeto com booleanos
- **storeName**: sempre flat no item — nunca aninhado como `item.store.name`
- **isFree**: calculado no código — nunca `select: { isFree: true }` no Prisma
- **status de loja**: sempre um de: `active | trial | expired | canceled | no_plan | past_due`
- **Erros**: sempre `{ error, code, status }` — nunca mensagem hardcoded

### 8.3 CI — GitHub Actions

Todo push para `main` dispara automaticamente:

1. **backend-tests** — Postgres efêmero + seed + `npm test`
2. **build-frontend** — `npm run build` do frontend app
3. **build-admin-frontend** — `npm run build` do admin frontend

**Regra**: Deploy para Railway/Vercel SÓ ocorre se todos os 3 jobs estiverem ✅

### 8.4 Release Gate — Checklist Obrigatório

Antes de qualquer commit em `main`:

- [ ] `cd backend && npm test` — todos os testes passando localmente
- [ ] `cd frontend && npm run build` — build sem erros
- [ ] `cd admin-frontend && npm run build` — build sem erros
- [ ] `backend/src/lib/version.js` — versão bumped
- [ ] `CHANGELOG.md` — seção adicionada

```bash
# Comando completo de validação pré-commit:
cd backend && npm test && cd ../frontend && npm run build && cd ../admin-frontend && npm run build
```

### 8.5 Adicionando Novos Testes

Ao criar **nova rota de API**:
1. Adicionar auth guard em `auth-guard.test.js` (se protegida)
2. Adicionar shape test em `admin-api.test.js` (se admin) ou novo arquivo
3. Verificar que o shape está no padrão de paginação

Ao criar **nova função de negócio pura**:
1. Adicionar unit test em `utils.test.js`

Ao mudar **schema de resposta de API**:
1. Atualizar o teste correspondente ANTES de fazer o merge

### 8.6 Template Clone — Validação Pós-Clone

Após clonar o template para um novo app:

```bash
# 1. Setup inicial
cd backend && npm install && npx prisma db push && npx prisma generate && node prisma/seed-admin.js

# 2. Iniciar backend
npm run dev &

# 3. Validar tudo
cd .. && bash scripts/validate-template.sh
```

O script `validate-template.sh` verifica:
- `.env` configurado sem placeholders
- Backend respondendo
- Auth guards funcionando
- Suite de testes passando
- Builds dos frontends OK
- Arquivos i18n presentes

### 8.7 Consistência Visual — Regras de Design

| Camada | Design System | Regra |
|--------|---------------|-------|
| **Frontend (app)** | Nimbus DS `@nimbus-ds/components` | NUNCA usar Tailwind ou CSS customizado |
| **Admin Frontend** | Tailwind CSS + Lucide React | NUNCA importar Nimbus DS |
| **Cores admin** | Palette definida no `tailwind.config.js` | Não usar cores hexadecimais hardcoded no JSX |

**StatCard, DataTable, TemplateVersionCard** = componentes compartilhados do admin. Toda mudança visual DEVE ser feita no componente, nunca inline.
