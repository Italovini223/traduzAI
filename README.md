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
- `CLAUDE.md` — Contexto completo do projeto (arquitetura, modelos, decisoes)

## Storefront: Traducao Automatica + Conversao de Moeda

Feature central deste app — roda na vitrine publica (nao no iframe admin),
traduzindo texto e convertendo preco exibido conforme o pais do visitante.

### Arquitetura ponta a ponta

```
1. Script cadastrado no Partners Portal (auto-instalado, evento onload) —
   Nuvemshop injeta em toda pagina de vitrine de toda loja com o app:
   <script src="https://apps-scripts.tiendanube.com/traduzai/.../N.js?versionId=...&store=ID">

2. Essa URL e um proxy/CDN (CloudFront) da Nuvemshop na frente do nosso
   proprio GET /widget.js (server.js serve backend/public/widget.js)

3. widget.js roda no navegador do comprador:
   a. Descobre STORE_ID via window.LS.store.id (global injetado pela
      Nuvemshop em toda pagina de vitrine; fallback: query string ?store=)
   b. GET /storefront/config?store=X[&country=XX] — geoip por IP detecta o
      pais (ou ?country= forca, usado em teste/selecao manual)
   c. Se active:true — traduz texto visivel em lote via POST /storefront/translate
      e converte preco via regex (copia manual de lib/priceParser.js)
   d. MutationObserver reaplica em conteudo inserido depois (carrinho, SPA)
   e. Seletor manual de bandeiras: GET /storefront/rules lista paises
      configurados; clique forca o pais sem depender do geoip
```

### Rotas

| Rota | Auth | Uso |
|---|---|---|
| `GET /storefront/config?store=X[&country=XX]` | Publica | Resolve idioma/moeda/taxa alvo pro visitante |
| `GET /storefront/rules?store=X` | Publica | Lista paises configurados (seletor de bandeiras) |
| `POST /storefront/translate` | Publica | Traduz lote de textos, com cache |
| `GET/PUT /api/translations/config` | App | Liga/desliga a feature, idioma/moeda de origem |
| `POST/PUT/DELETE /api/translations/rules` | App | Regras pais → idioma/moeda |

### Cache — evita gastar API paga a cada load de pagina

Cache e **Postgres via Prisma** (nao Redis, nao memoria de processo) —
persistente entre restarts, e **global entre lojas** (texto e taxa de
cambio nao sao sensiveis a tenant).

| O que | Tabela | Chave | TTL |
|---|---|---|---|
| Traducao de texto | `TranslationCache` | `sha256(texto)` + `sourceLang` + `targetLang` | sem expiracao |
| Taxa de cambio | `ExchangeRate` | `baseCurrency` + `quoteCurrency` | 12h (`config/exchangeRate.js`) |

`POST /storefront/translate` so chama o DeepL para os textos que nao
bateram no cache. `ExchangeRateService.getRate` so chama a API externa
quando o cache expira, e usa o valor expirado em vez de quebrar a exibicao
se a API estiver fora do ar. Ambos os servicos (`config/deepl.js`,
`config/exchangeRate.js`) nunca lancam erro — sem chave configurada, o
widget so nao traduz/converte, sem quebrar a vitrine.

**Custo real de API**: cada texto unico do catalogo consome DeepL uma unica
vez na vida util do texto; cambio consome no maximo 1x/12h por par de
moeda. Um load de pagina comum e leitura pura de banco.

### Limitacoes conhecidas da plataforma Nuvemshop

- **CDN do script cacheado por 1 ano** (`Cache-Control: immutable,
  max-age=31536000`) — deploy do backend nao muda o que a loja real recebe
  até a Nuvemshop gerar um `versionId` novo, e isso passa por fila de
  revisao propria da plataforma (duracao indeterminada).
- **Evento do script** pode ser exigido `onfirstinteraction` (nao `onload`)
  ate a revisao ser aprovada — so carrega apos o 1o clique/scroll do
  comprador enquanto isso.
- **Script auto-instalado nao aceita associacao manual por loja** — a
  Nuvemshop injeta `?store=<id>` automaticamente em toda loja.
- **Checkout nao e traduzivel** — usa mecanismo separado (`location:
  checkout`), sendo migrado obrigatoriamente pro NubeSDK, que roda em Web
  Worker sem acesso a DOM (so pontos fixos de insercao, sem API de
  preco/moeda). Vitrine traduz normalmente; checkout fica no idioma/moeda
  original da loja. Nao afeta o script atual (`location: store`).

Detalhes completos (decisoes, testes, gotchas) em `CLAUDE.md`.

### Roadmap: Proximas Funcionalidades

Levantamento comparando o traduzAI aos apps de traducao mais populares do
Shopify (Translate & Adapt, Weglot, Transcy, langify, Hextom, LangShop,
Interlingue, Bablic, GTranslate) — ordem de prioridade:

1. ✅ Implementado — URLs indexaveis por idioma + tags `hreflang`
2. Traducao do checkout (reconfirmar viabilidade — ver limitacao NubeSDK acima)
3. ✅ Implementado — Adaptacao por dialeto/tom por pais (glossario de termos)
4. Arredondamento de preco convertido (preco psicologico, ex. R$19,90)
5. Exportar/importar traducoes em CSV
6. Multiplos motores de traducao / ajuste de tom de marca (hoje so DeepL)
7. Regras globais de exclusao/glossario (mais amplo que a correcao manual atual)
8. ✅ Implementado — Editor visual in-context (corrigir traducao clicando na propria vitrine)
9. ✅ Implementado — Personalizacao visual do seletor de bandeiras

Baixa prioridade pro nosso mercado: idioma RTL, traducao de e-mail
transacional, marketplace de traducao humana. Detalhes de cada item, apps
de referencia e por que ja cobrimos alguns gaps (alt de imagem, conteudo
dinamico) em `CLAUDE.md`.
