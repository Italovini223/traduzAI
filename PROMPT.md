# Prompt para Criar Novo App NuvemPro

> Copie e cole o prompt abaixo no Claude Code, substituindo os valores entre {{chaves}}.

---

## Prompt

```
Preciso criar um novo app para a Nuvemshop chamado "{{NOME_DO_APP}}".

## Contexto
- Slug: {{slug_do_app}} (ex: postai, reviewpro, shippingai)
- Descricao: {{descricao curta do que o app faz}}
- Diretorio: D:\AI\{{nome-do-app}}

## Recursos Obrigatorios

Leia os seguintes documentos ANTES de iniciar qualquer codigo:

1. **Template base**: D:\AI\nuvempro-app-template
   - Copie todo o template para o diretorio do novo app
   - Este template ja tem o backend, frontend e admin-frontend prontos

2. **Documento de referencia**: D:\AI\nuvempro-app-template\ADMIN-PADRAO-NUVEMPRO-v3.0.md
   - Padrao completo v3.0 — siga as 12 fases em ordem

3. **Standards**: D:\AI\nuvempro-app-template\STANDARDS.md
   - Regras obrigatorias de erros, rate limiting, paginacao, seguranca, testes
   - TODA rota deve seguir estes padroes

## Etapas de Execucao

### Etapa 1 — Setup Base
1. Copie D:\AI\nuvempro-app-template para D:\AI\{{nome-do-app}}
2. Renomeie os nomes nos package.json (backend, frontend, admin-frontend)
3. Crie o .env a partir do .env.example e preencha:
   - APP_NAME={{NOME_DO_APP}}
   - APP_SLUG={{slug_do_app}}
   - APP_EMAIL={{email}}
   - Gere JWT_SECRET e ADMIN_JWT_SECRET com: openssl rand -hex 32
   - ADMIN_SEED_EMAIL={{email_admin}}
   - ADMIN_SEED_PASSWORD={{senha_12_chars}}
4. Execute:
   ```bash
   cd backend && npm install
   npx prisma db push && npx prisma generate
   node prisma/seed-admin.js
   ```
5. Inicie os 3 servidores e valide:
   - http://localhost:3001/health → {"ok":true}
   - http://localhost:5173 → frontend carrega
   - http://localhost:5174 → admin login funciona

### Etapa 2 — Configurar Nuvemshop
1. Atualize NUVEMSHOP_APP_ID, CLIENT_ID, CLIENT_SECRET no .env
2. Atualize o clientId no NexoProvider.jsx
3. Teste o fluxo OAuth (ou use dev-token em local)

### Etapa 3 — Configurar Stripe
1. Atualize STRIPE_SECRET_KEY no .env
2. No admin, crie os planos e clique "Sincronizar com Stripe"
3. Configure o webhook: stripe listen --forward-to localhost:3001/webhook
4. Atualize STRIPE_WEBHOOK_SECRET no .env

### Etapa 3.5 — Configurar Trial (obrigatório)

Acesse **Admin → Configurações → Período de Trial** e defina a modalidade:

| Modo | Quando usar |
|------|-------------|
| **Desativado** | App pago imediato — sem período de teste |
| **Trial gratuito** | X dias de acesso sem cartão; banner no app conta regressiva |
| **Trial com assinatura** | Cliente cadastra cartão, não paga por X dias via `trial_period_days` Stripe |

**Passos:**
1. Escolha o modo
2. Defina a quantidade de dias (padrão: 7)
3. Clique "Salvar Configuração de Trial"

**ATENÇÃO para o modo `paid`:**
- Usa `subscription_data.trial_period_days` nativo do Stripe (NÃO usa cupom)
- O cliente vê "14 dias grátis" no checkout e "Nenhuma cobrança até {data}" após assinar
- `allow_promotion_codes` permanece ativo — o cliente pode digitar cupons extras
- **Nunca** substituir por `discounts: [{coupon}]` — incompatível com `allow_promotion_codes`

**Validar:**
- Frontend exibe badge "Assine e ganhe X dias grátis" nos planos pagos (modo paid)
- Após assinar, card de status mostra "Trial ativo até {data}" + Alert azul
- `GET /api/billing/status` retorna `{ trialMode, trialDays, trialDaysLeft, hasAccess }`

### Etapa 4 — Personalizar App
Agora que a base esta rodando, adicione a logica especifica do app:
1. Ajuste os campos do Onboarding (Onboarding.jsx) para o dominio do app
2. Ajuste as traducoes (pt-BR.json, es-AR.json, es-MX.json)
3. Crie as rotas/pages especificas do app no frontend
4. Crie as rotas/services especificas no backend
5. Se precisar de novos modelos Prisma: adicione ao schema.prisma e rode db push + generate

### Etapa 5 — Validar
Execute os testes: npm test (no backend)
Siga o checklist da Fase 12 do documento de referencia.
Siga o checklist de seguranca do STANDARDS.md.

### Etapa 6 — Deploy
Siga a Fase 11 do documento de referencia:
1. Railway (backend)
2. Vercel (frontend + admin-frontend)
3. Stripe webhook (producao)
4. Nuvemshop Partners (redirect URI + app URL)

## Regras Absolutas

1. Nunca pule fases — valide cada etapa antes de avancar
2. Todo erro deve seguir formato { error, code, status }
3. Toda rota paginada usa parsePagination + paginatedResponse
4. Rate limiters em todas as camadas (5 niveis)
5. helmet() obrigatorio no server.js
6. Nenhuma string hardcoded — tudo via i18n
7. Isolamento de tenant — toda query filtra por storeId
8. Admin isolado — JWT, tabelas e middleware separados
9. Webhook raw body ANTES de json parser
10. Nuvemshop usa "Authentication" (nao "Authorization")
11. Apos prisma db push, SEMPRE prisma generate + reiniciar backend
12. Testes minimos passando antes de qualquer deploy
13. **TODA atualizacao do template DEVE terminar com o processo de release** (ver STANDARDS.md seção 6):
    bump version.js → CHANGELOG.md → commit → tag → push → GitHub Release → deploy Railway
14. **AdminPlan.features DEVE ser array de strings** — nunca objeto JSON com booleanos.
    O seed ja cria no formato correto. Se editar plano no admin, usar textarea (uma feature por linha).
15. **isFree nao e campo Prisma** — calcular via `Object.values(plan.price).every(v => !v || v === 0)`.
    NUNCA usar `select: { isFree: true }` — lanca erro Prisma e derruba GET /billing/status.
16. **Trial mode DEVE ser configurado** (Etapa 3.5) antes de publicar o app.
    Default e 'none' (sem trial). Escolha conscientemente — impacta conversao e primeiro acesso.
17. **Subscription trialing = acesso liberado** — `subActive` inclui status 'trialing'.
    Nunca remover 'trialing' do array de status permitidos em hasAccess.
18. **POST /sync sem early return** — nao reintroduzir otimizacao "already_synced".
    Ela impede deteccao de novas subscriptions trialing apos troca de plano.

## Dados do App

- Nome: {{NOME_DO_APP}}
- Slug: {{slug_do_app}}
- Email: {{email}}
- Nuvemshop App ID: {{id}}
- Descricao: {{o que o app faz}}
- Funcionalidades especificas:
  - {{feature 1}}
  - {{feature 2}}
  - {{feature 3}}

Comece pela Etapa 1. Copie o template, configure, inicie os servidores e valide.
Somente apos a base funcionar, avance para as funcionalidades especificas.
```

---

## Exemplo Preenchido

```
Preciso criar um novo app para a Nuvemshop chamado "ReviewPro".

## Contexto
- Slug: reviewpro
- Descricao: App de gestao de avaliacoes de produtos com IA
- Diretorio: D:\AI\ReviewPro

## Recursos Obrigatorios
(... mesmo texto acima ...)

## Dados do App
- Nome: ReviewPro
- Slug: reviewpro
- Email: contato@weethub.com
- Nuvemshop App ID: 25000
- Descricao: Gestao inteligente de avaliacoes de produtos. Coleta, modera com IA, responde automaticamente e exibe widgets otimizados.
- Funcionalidades especificas:
  - Widget de avaliacoes embedado nas paginas de produto
  - Moderacao automatica com IA (spam, linguagem, relevancia)
  - Respostas automaticas personalizadas por tom da marca
  - Email automatico solicitando avaliacao apos compra
  - Dashboard de reputacao (NPS, media, tendencias)
  - Exportacao de avaliacoes para Google Rich Snippets

Comece pela Etapa 1.
```

---

## Dicas

- **Nao tente fazer tudo de uma vez.** A base (Etapas 1-3) deve funcionar perfeita antes de adicionar features.
- **Teste cada etapa.** Use os checklists do documento de referencia.
- **O template ja funciona.** Se algo quebrar, o problema e na configuracao (.env), nao no codigo.
- **Stripe local:** Use `stripe listen --forward-to localhost:3001/webhook` durante desenvolvimento.
- **Prisma:** Apos qualquer mudanca no schema, SEMPRE: db push → generate → reiniciar backend.
