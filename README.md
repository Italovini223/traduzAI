# NuvemPro App Template

Template base para criar apps SaaS embedados na Nuvemshop com painel admin.

## Quick Start

```bash
# 1. Backend
cd backend
cp .env.example .env   # preencher variaveis
npm install
npx prisma db push
npx prisma generate
node prisma/seed-admin.js
npm run dev

# 2. Frontend App
cd frontend
npm install
npm run dev

# 3. Admin Frontend
cd admin-frontend
npm install
npm run dev
```

## Portas

| Servico | Porta |
|---------|-------|
| Backend | 3001 |
| Frontend App | 5173 |
| Admin Frontend | 5174 |

## Documentacao

- `STANDARDS.md` — Regras obrigatorias (erros, rate limit, paginacao, seguranca, testes)
- `PROMPT.md` — Prompt ideal para o Claude criar um novo app
- `ADMIN-PADRAO-NUVEMPRO-v3.0.md` — Documento completo de referencia (guia 12 fases)
