#!/bin/bash
# scripts/validate-template.sh
# Valida que o template NuvemPro está corretamente configurado após clone.
# Uso: bash scripts/validate-template.sh
# Requer: backend rodando em localhost:3001

set -e

ERRORS=0
WARNINGS=0

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

ok()   { echo -e "${GREEN}✅ $1${NC}"; }
fail() { echo -e "${RED}❌ $1${NC}"; ERRORS=$((ERRORS+1)); }
warn() { echo -e "${YELLOW}⚠️  $1${NC}"; WARNINGS=$((WARNINGS+1)); }
info() { echo -e "${BLUE}ℹ️  $1${NC}"; }

echo -e "${BLUE}"
echo "═══════════════════════════════════════════════"
echo "  NuvemPro App Template — Validação Pós-Clone  "
echo "═══════════════════════════════════════════════"
echo -e "${NC}"

# ─── 1. Arquivos essenciais ───────────────────────────────────────────────────
info "Verificando arquivos essenciais..."

[ -f "backend/.env" ]            && ok ".env encontrado"         || fail "backend/.env não encontrado — copie de .env.example"
[ -f "backend/package.json" ]    && ok "backend/package.json"    || fail "backend/package.json não encontrado"
[ -f "frontend/package.json" ]   && ok "frontend/package.json"   || fail "frontend/package.json não encontrado"
[ -f "admin-frontend/package.json" ] && ok "admin-frontend/package.json" || fail "admin-frontend/package.json não encontrado"

# ─── 2. Variáveis de ambiente obrigatórias ────────────────────────────────────
info "\nVerificando variáveis de ambiente..."

check_env() {
  local VAR=$1
  local IS_CRITICAL=${2:-true}

  if [ ! -f backend/.env ]; then return; fi

  VALUE=$(grep "^${VAR}=" backend/.env 2>/dev/null | cut -d= -f2- | tr -d '"' | tr -d "'")

  if [ -z "$VALUE" ]; then
    $IS_CRITICAL && fail "$VAR não definido" || warn "$VAR não definido (opcional)"
  elif echo "$VALUE" | grep -qE '^\.\.\.|^seu_|^change_me|^sk_test_fake|^placeholder'; then
    fail "$VAR ainda tem valor placeholder: $VALUE"
  else
    ok "$VAR configurado"
  fi
}

check_env "DATABASE_URL"
check_env "JWT_SECRET"
check_env "ADMIN_JWT_SECRET"
check_env "STRIPE_SECRET_KEY"
check_env "STRIPE_WEBHOOK_SECRET"
check_env "NUVEMSHOP_APP_ID"
check_env "CLIENT_ID"
check_env "CLIENT_SECRET"
check_env "APP_NAME"
check_env "APP_SLUG"
check_env "APP_EMAIL"
check_env "ADMIN_SEED_EMAIL"
check_env "ADMIN_SEED_PASSWORD"
check_env "FRONTEND_URL"

# ─── 3. Backend health ────────────────────────────────────────────────────────
info "\nVerificando backend (localhost:3001)..."

HEALTH=$(curl -sf http://localhost:3001/health 2>/dev/null || echo "FAIL")
if echo "$HEALTH" | grep -q '"ok":true'; then
  ok "Backend respondendo — GET /health OK"

  # Verificar versão
  VERSION=$(echo "$HEALTH" | grep -o '"version":"[^"]*"' | cut -d'"' -f4)
  [ -n "$VERSION" ] && ok "Versão do template: $VERSION" || warn "Campo version não encontrado em /health"
else
  fail "Backend não está respondendo em localhost:3001"
  fail "Execute: cd backend && npm run dev"
fi

# ─── 4. Admin health ──────────────────────────────────────────────────────────
ADMIN_HEALTH=$(curl -sf http://localhost:3001/admin-api/health 2>/dev/null || echo "FAIL")
if echo "$ADMIN_HEALTH" | grep -q '"ok":true\|200'; then
  ok "Admin API respondendo — GET /admin-api/health OK"
else
  fail "Admin API não está respondendo"
fi

# ─── 5. Auth guard ────────────────────────────────────────────────────────────
info "\nVerificando auth guards..."

check_401() {
  local PATH=$1
  local STATUS=$(curl -so /dev/null -w "%{http_code}" http://localhost:3001${PATH} 2>/dev/null)
  [ "$STATUS" = "401" ] && ok "AUTH: $PATH → 401" || fail "AUTH: $PATH → $STATUS (esperado 401)"
}

check_401 "/api/billing/status"
check_401 "/api/billing/plans"
check_401 "/admin-api/plans"
check_401 "/admin-api/customers"

# ─── 6. Rodar testes ──────────────────────────────────────────────────────────
info "\nExecutando suite de testes..."

if cd backend && npm test 2>&1; then
  ok "Todos os testes passando"
else
  fail "Testes falhando — corrija antes de continuar"
fi
cd ..

# ─── 7. Build frontends ───────────────────────────────────────────────────────
info "\nVerificando builds dos frontends..."

# Frontend app
if cd frontend && npm run build --silent 2>/dev/null; then
  ok "Frontend app: build OK"
else
  fail "Frontend app: build FALHOU"
fi
cd ..

# Admin frontend
if cd admin-frontend && npm run build --silent 2>/dev/null; then
  ok "Admin frontend: build OK"
else
  fail "Admin frontend: build FALHOU"
fi
cd ..

# ─── 8. i18n completeness ─────────────────────────────────────────────────────
info "\nVerificando i18n..."

PT_KEYS=$(cat frontend/src/i18n/locales/pt-BR.json 2>/dev/null | grep -c '"' || echo 0)
ES_AR_KEYS=$(cat frontend/src/i18n/locales/es-AR.json 2>/dev/null | grep -c '"' || echo 0)
ES_MX_KEYS=$(cat frontend/src/i18n/locales/es-MX.json 2>/dev/null | grep -c '"' || echo 0)

[ "$PT_KEYS" -gt 0 ] && ok "pt-BR.json presente ($PT_KEYS linhas)" || fail "pt-BR.json não encontrado"
[ "$ES_AR_KEYS" -gt 0 ] && ok "es-AR.json presente" || fail "es-AR.json não encontrado"
[ "$ES_MX_KEYS" -gt 0 ] && ok "es-MX.json presente" || fail "es-MX.json não encontrado"

# ─── Resultado ────────────────────────────────────────────────────────────────
echo ""
echo "═══════════════════════════════════════════════"

if [ $ERRORS -eq 0 ] && [ $WARNINGS -eq 0 ]; then
  echo -e "${GREEN}✅ Template 100% válido! Pode iniciar customização.${NC}"
elif [ $ERRORS -eq 0 ]; then
  echo -e "${YELLOW}⚠️  Template válido com $WARNINGS aviso(s). Verifique antes de ir para produção.${NC}"
else
  echo -e "${RED}❌ $ERRORS erro(s) encontrado(s). Corrija antes de continuar.${NC}"
  exit 1
fi

echo "═══════════════════════════════════════════════"
