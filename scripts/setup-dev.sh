#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# setup-dev.sh — Configura o ambiente de desenvolvimento com Doppler
#
# Execute uma vez após clonar o repositório:
#   bash scripts/setup-dev.sh
# ─────────────────────────────────────────────────────────────────────────────

set -e

# Cores
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
BOLD='\033[1m'
NC='\033[0m'

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

echo ""
echo -e "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BOLD}  NuvemPro App Template — Setup de Desenvolvimento${NC}"
echo -e "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

# ─── 1. Verificar Doppler CLI ────────────────────────────────────────────────
echo -e "${BLUE}[1/4]${NC} Verificando Doppler CLI..."

if ! command -v doppler &> /dev/null; then
  echo ""
  echo -e "${RED}✗ Doppler CLI não encontrado.${NC}"
  echo ""
  echo "  Instale com:"
  echo ""
  echo "  macOS/Linux:"
  echo "    brew install dopplerhq/cli/doppler"
  echo ""
  echo "  Linux (apt):"
  echo "    sudo apt-get update && sudo apt-get install -y apt-transport-https"
  echo "    curl -sLf --retry 3 --tlsv1.2 --proto \"=https\" \\"
  echo "      'https://packages.doppler.com/public/cli/gpg.DE2A7741A397C129.key' | \\"
  echo "      sudo apt-key add -"
  echo "    echo \"deb https://packages.doppler.com/public/cli/deb/debian any-version main\" | \\"
  echo "      sudo tee /etc/apt/sources.list.d/doppler-cli.list"
  echo "    sudo apt-get update && sudo apt-get install doppler"
  echo ""
  echo "  Windows (scoop):"
  echo "    scoop bucket add doppler https://github.com/DopplerHQ/scoop-doppler.git"
  echo "    scoop install doppler"
  echo ""
  echo "  Documentação: https://docs.doppler.com/docs/install-cli"
  echo ""
  exit 1
fi

DOPPLER_VERSION=$(doppler --version 2>/dev/null | head -1)
echo -e "  ${GREEN}✓${NC} Doppler CLI encontrado: ${DOPPLER_VERSION}"

# ─── 2. Verificar autenticação ───────────────────────────────────────────────
echo ""
echo -e "${BLUE}[2/4]${NC} Verificando autenticação..."

if ! doppler me &> /dev/null; then
  echo ""
  echo -e "${YELLOW}⚠  Você não está autenticado no Doppler.${NC}"
  echo ""
  echo "  Execute: ${BOLD}doppler login${NC}"
  echo "  (Abre o navegador para autenticação OAuth)"
  echo ""
  read -p "  Deseja autenticar agora? [s/N] " -n 1 -r
  echo ""
  if [[ $REPLY =~ ^[Ss]$ ]]; then
    doppler login
  else
    echo -e "${RED}Autenticação necessária. Execute 'doppler login' e rode este script novamente.${NC}"
    exit 1
  fi
fi

DOPPLER_USER=$(doppler me --json 2>/dev/null | grep -o '"email":"[^"]*"' | cut -d'"' -f4 || echo "autenticado")
echo -e "  ${GREEN}✓${NC} Autenticado como: ${DOPPLER_USER}"

# ─── 3. Configurar doppler.yaml em cada serviço ──────────────────────────────
echo ""
echo -e "${BLUE}[3/4]${NC} Configurando projetos Doppler..."
echo ""

SERVICES=("backend" "frontend" "admin-frontend")
FAILED=()

for SERVICE in "${SERVICES[@]}"; do
  DIR="$ROOT_DIR/$SERVICE"
  echo -e "  Configurando ${BOLD}$SERVICE${NC}..."

  if [ ! -f "$DIR/doppler.yaml" ]; then
    echo -e "    ${RED}✗ doppler.yaml não encontrado em $SERVICE/${NC}"
    FAILED+=("$SERVICE")
    continue
  fi

  if (cd "$DIR" && doppler setup --no-interactive 2>/dev/null); then
    echo -e "    ${GREEN}✓${NC} $SERVICE configurado"
  else
    echo -e "    ${YELLOW}⚠${NC}  Falha ao configurar $SERVICE automaticamente."
    echo -e "       Execute manualmente: ${BOLD}cd $SERVICE && doppler setup${NC}"
    FAILED+=("$SERVICE")
  fi
done

# ─── 4. Verificar .env locais (aviso se existirem) ──────────────────────────
echo ""
echo -e "${BLUE}[4/4]${NC} Verificando arquivos .env locais..."
echo ""

for SERVICE in "${SERVICES[@]}"; do
  ENV_FILE="$ROOT_DIR/$SERVICE/.env"
  if [ -f "$ENV_FILE" ]; then
    echo -e "  ${YELLOW}⚠  $SERVICE/.env encontrado.${NC}"
    echo -e "     Com Doppler, este arquivo não é necessário e pode causar conflitos."
    echo -e "     Considere removê-lo: ${BOLD}rm $SERVICE/.env${NC}"
  fi
done

# ─── Resumo ──────────────────────────────────────────────────────────────────
echo ""
echo -e "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

if [ ${#FAILED[@]} -eq 0 ]; then
  echo -e "${GREEN}${BOLD}✓ Setup concluído!${NC}"
  echo ""
  echo -e "  Para iniciar o desenvolvimento, abra ${BOLD}3 terminais${NC}:"
  echo ""
  echo -e "  ${BOLD}Terminal 1 — Backend (porta 3001):${NC}"
  echo -e "    cd backend && doppler run -- npm run dev"
  echo ""
  echo -e "  ${BOLD}Terminal 2 — Frontend (porta 5173):${NC}"
  echo -e "    cd frontend && doppler run -- npm run dev"
  echo ""
  echo -e "  ${BOLD}Terminal 3 — Admin (porta 5174):${NC}"
  echo -e "    cd admin-frontend && doppler run -- npm run dev"
  echo ""
  echo -e "  Para validar o ambiente: ${BOLD}bash scripts/validate-template.sh${NC}"
else
  echo -e "${YELLOW}${BOLD}⚠  Setup parcialmente concluído.${NC}"
  echo ""
  echo -e "  Configure manualmente os serviços com falha:"
  for SERVICE in "${FAILED[@]}"; do
    echo -e "    cd $SERVICE && doppler setup"
  done
fi

echo -e "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
