/*
 * traduzAI — widget de tradução da vitrine + conversão de moeda.
 *
 * Cadastrado como script auto-instalado no Partners Portal — a Nuvemshop
 * injeta a MESMA URL estática em toda loja automaticamente (a Nuvemshop
 * mesma acrescenta "?store=<id>" à URL do script mesmo em modo auto-instalado
 * — confirmado em produção). Roda no navegador do comprador em TODA página
 * da vitrine pública da loja instalada.
 *
 * Além da detecção automática por IP (geoip, no backend), o widget mostra um
 * seletor manual de bandeiras (países com regra configurada pelo lojista) —
 * fallback pra quando o geoip erra ou o comprador prefere trocar na mão.
 *
 * Vanilla JS, sem dependências e sem build step. Servido dinamicamente pelo
 * Express (backend/src/server.js), que substitui o placeholder __API_ORIGIN__
 * pela URL real do backend antes de enviar — necessário porque a Nuvemshop
 * serve o arquivo pelo próprio CDN (apps-scripts.tiendanube.com), então
 * `document.currentScript.src` aponta pro CDN deles, não pro nosso backend.
 * O identificador da loja (nuvemshopId) vem do global `window.LS.store.id`
 * que a Nuvemshop injeta em toda página de vitrine (fallback: query string
 * `?store=` do próprio script, caso algum dia volte a ser suportado).
 *
 * A lógica de detecção/conversão de preço abaixo é uma cópia funcional de
 * backend/src/lib/priceParser.js (testado via node --test) — sem bundler,
 * qualquer mudança ali deve ser replicada aqui manualmente.
 */
(function () {
  'use strict';

  var CURRENT_SCRIPT = document.currentScript;
  var SCRIPT_URL = CURRENT_SCRIPT ? CURRENT_SCRIPT.src : '';

  var API_ORIGIN = '__API_ORIGIN__';
  var STORE_ID = (function () {
    try {
      if (window.LS && window.LS.store && window.LS.store.id) return String(window.LS.store.id);
    } catch (e) { /* ignore */ }
    try { return new URL(SCRIPT_URL).searchParams.get('store'); } catch (e) { return null; }
  })();

  if (!STORE_ID || !API_ORIGIN) return;

  var SKIP_TAGS = { SCRIPT: 1, STYLE: 1, NOSCRIPT: 1, TEXTAREA: 1, INPUT: 1 };
  var TEXT_BATCH_SIZE = 100;

  // ─── Indicador visual de "traduzindo" ─────────────────────────────────────
  // Sem isso, o comprador via o texto mudar de idioma "do nada" alguns
  // segundos depois do carregamento, sem nenhum sinal de que algo estava
  // acontecendo — sensação de app lento/quebrado. Contador global de
  // requisições em voo (config/rules/texto/imagem); um pequeno spinner
  // aparece junto do seletor de bandeiras enquanto o contador > 0.
  var PENDING_COUNT = 0;
  var PICKER_SPINNER_EL = null;

  function updatePendingIndicator() {
    if (PICKER_SPINNER_EL) PICKER_SPINNER_EL.style.display = PENDING_COUNT > 0 ? 'inline-block' : 'none';
  }

  function incPending() {
    PENDING_COUNT += 1;
    updatePendingIndicator();
  }

  function decPending() {
    PENDING_COUNT = Math.max(0, PENDING_COUNT - 1);
    updatePendingIndicator();
  }

  function ensureSpinnerStyle() {
    if (document.getElementById('traduzai-spinner-style')) return;
    var style = document.createElement('style');
    style.id = 'traduzai-spinner-style';
    style.textContent = '@keyframes traduzai-spin{to{transform:rotate(360deg)}}';
    document.head.appendChild(style);
  }

  function makeSpinner() {
    ensureSpinnerStyle();
    var el = document.createElement('div');
    el.title = 'Traduzindo...';
    el.setAttribute('data-notranslate', '');
    el.style.cssText = 'display:none;width:14px;height:14px;flex:none;' +
      'border:2px solid rgba(0,0,0,.15);border-top-color:#555;border-radius:50%;' +
      'animation:traduzai-spin .6s linear infinite;';
    return el;
  }

  // ─── Detecção/conversão de preço por regex ───────────────────────────────
  var CURRENCY_SYMBOLS = {
    'R$': 'BRL', 'US$': 'USD', 'U$S': 'USD', '$': 'USD',
    '€': 'EUR', '£': 'GBP', '¥': 'JPY', '₩': 'KRW', '₹': 'INR', '₺': 'TRY',
  };

  function escapeRegExp(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  // Símbolo antes OU depois do número — o DeepL reposiciona o símbolo pro
  // final da frase em alguns idiomas de destino (ex.: "R$179,90" ->
  // "179,90 R$" ao traduzir pra espanhol); sem a 2a alternativa o preço
  // traduzido nunca é detectado/convertido.
  var SYMBOLS_PATTERN = Object.keys(CURRENCY_SYMBOLS).map(escapeRegExp).join('|');
  var NUMBER_PATTERN = '\\d{1,3}(?:[.,]\\d{3})*(?:[.,]\\d{1,2})?';
  var PRICE_REGEX = new RegExp(
    '(?:(' + SYMBOLS_PATTERN + ')\\s?(' + NUMBER_PATTERN + ')' +
    '|(' + NUMBER_PATTERN + ')\\s?(' + SYMBOLS_PATTERN + '))',
    'g'
  );

  function parseLocalizedNumber(raw) {
    var hasComma = raw.indexOf(',') !== -1;
    var hasDot = raw.indexOf('.') !== -1;

    if (hasComma && hasDot) {
      var lastComma = raw.lastIndexOf(',');
      var lastDot = raw.lastIndexOf('.');
      var decimalSep = lastComma > lastDot ? ',' : '.';
      var thousandSep = decimalSep === ',' ? '.' : ',';
      return parseFloat(raw.split(thousandSep).join('').replace(decimalSep, '.'));
    }
    if (hasComma) {
      var parts = raw.split(',');
      if (parts[parts.length - 1].length <= 2) return parseFloat(raw.replace(',', '.'));
      return parseFloat(raw.split(',').join(''));
    }
    if (hasDot) {
      var partsD = raw.split('.');
      if (partsD[partsD.length - 1].length <= 2) return parseFloat(raw);
      return parseFloat(raw.split('.').join(''));
    }
    return parseFloat(raw);
  }

  function findPriceMatches(text) {
    var matches = [];
    var m;
    PRICE_REGEX.lastIndex = 0;
    while ((m = PRICE_REGEX.exec(text)) !== null) {
      var amount = parseLocalizedNumber(m[2] || m[3]);
      if (isNaN(amount)) continue;
      matches.push({ fullMatch: m[0], amount: amount, index: m.index });
    }
    return matches;
  }

  function formatPrice(amount, currencyCode) {
    try {
      return new Intl.NumberFormat('en-US', { style: 'currency', currency: currencyCode }).format(amount);
    } catch (e) {
      return currencyCode + ' ' + amount.toFixed(2);
    }
  }

  function replacePricesInText(text, rate, targetCurrencyCode) {
    var matches = findPriceMatches(text);
    if (matches.length === 0) return text;

    var result = '';
    var lastIndex = 0;
    for (var i = 0; i < matches.length; i++) {
      var match = matches[i];
      result += text.slice(lastIndex, match.index);
      result += formatPrice(match.amount * rate, targetCurrencyCode);
      lastIndex = match.index + match.fullMatch.length;
    }
    result += text.slice(lastIndex);
    return result;
  }

  // ─── Coleta de nós de texto visíveis ──────────────────────────────────────
  function collectTextNodes(root) {
    var nodes = [];
    var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode: function (node) {
        if (!node.nodeValue || !node.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
        var parent = node.parentElement;
        if (!parent || SKIP_TAGS[parent.tagName]) return NodeFilter.FILTER_REJECT;
        if (parent.closest && parent.closest('[data-notranslate]')) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      },
    });
    var n;
    while ((n = walker.nextNode())) nodes.push(n);
    return nodes;
  }

  // ─── Texto original por nó ────────────────────────────────────────────────
  // Guardado pra permitir trocar de país várias vezes sem re-traduzir um
  // texto que já foi traduzido (perderia o idioma fonte real na 2a troca).
  var ORIGINAL_TEXT = new WeakMap();
  var KNOWN_NODES = [];

  function rememberOriginal(node) {
    if (!ORIGINAL_TEXT.has(node)) {
      ORIGINAL_TEXT.set(node, node.nodeValue);
      KNOWN_NODES.push(node);
    }
    return ORIGINAL_TEXT.get(node);
  }

  function restoreOriginals() {
    KNOWN_NODES.forEach(function (node) {
      node.nodeValue = ORIGINAL_TEXT.get(node);
    });
  }

  // ─── Atributos traduzíveis: placeholder de input/textarea, texto de
  // botões renderizados como <input type="submit|button|reset" value="...">
  // (padrão comum em temas Nuvemshop pra "Comprar"/"Iniciar Compra"/etc), e
  // alt de imagem (acessibilidade + SEO de busca de imagem). Não inclui
  // inputs de texto/email/hidden — só os que exibem o value como rótulo
  // visível, nunca como dado digitado/enviado pelo comprador.
  var ORIGINAL_ATTR = new WeakMap();
  var KNOWN_ATTR_ELS = [];
  var BUTTON_INPUT_TYPES = { submit: 1, button: 1, reset: 1 };
  var ATTR_SELECTOR = '[placeholder], input[type="submit"], input[type="button"], input[type="reset"], img[alt]';

  function rememberOriginalAttr(el, attr) {
    var entry = ORIGINAL_ATTR.get(el);
    if (!entry) {
      entry = {};
      ORIGINAL_ATTR.set(el, entry);
      KNOWN_ATTR_ELS.push(el);
    }
    if (!(attr in entry)) entry[attr] = el.getAttribute(attr);
    return entry[attr];
  }

  function restoreOriginalAttrs() {
    KNOWN_ATTR_ELS.forEach(function (el) {
      var entry = ORIGINAL_ATTR.get(el);
      if (!entry) return;
      Object.keys(entry).forEach(function (attr) { el.setAttribute(attr, entry[attr]); });
    });
  }

  function collectTranslatableAttrs(root) {
    var elements = [];
    if (root.matches && root.matches(ATTR_SELECTOR)) elements.push(root);
    if (root.querySelectorAll) {
      var found = root.querySelectorAll(ATTR_SELECTOR);
      for (var i = 0; i < found.length; i++) elements.push(found[i]);
    }

    var items = [];
    elements.forEach(function (el) {
      if (el.closest && el.closest('[data-notranslate]')) return;
      var placeholder = el.getAttribute('placeholder');
      if (placeholder && placeholder.trim()) items.push({ el: el, attr: 'placeholder' });
      if (el.tagName === 'INPUT' && BUTTON_INPUT_TYPES[(el.getAttribute('type') || '').toLowerCase()]) {
        var val = el.getAttribute('value');
        if (val && val.trim()) items.push({ el: el, attr: 'value' });
      }
      if (el.tagName === 'IMG') {
        var alt = el.getAttribute('alt');
        if (alt && alt.trim()) items.push({ el: el, attr: 'alt' });
      }
    });
    return items;
  }

  function applyToAttrs(items, config) {
    var texts = items.map(function (item) { return rememberOriginalAttr(item.el, item.attr); });
    if (texts.length === 0) return;

    incPending();
    fetch(API_ORIGIN + '/storefront/translate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        store: STORE_ID,
        texts: texts,
        sourceLang: config.sourceLanguage,
        targetLang: config.targetLanguage,
        country: config.country,
      }),
    })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        var translations = data.translations || texts;
        items.forEach(function (item, i) {
          var translated = translations[i] || texts[i];
          if (config.rate && config.rate !== 1) {
            translated = replacePricesInText(translated, config.rate, config.targetCurrency);
          }
          item.el.setAttribute(item.attr, translated);
        });
      })
      .catch(function () { /* falha silenciosa */ })
      .then(decPending, decPending);
  }

  // ─── SEO: <title> e meta tags — ficam no <head>, fora da árvore de texto
  // do <body> (por isso precisam de coleta própria, não passam pelo
  // TreeWalker nem pelo ATTR_SELECTOR de cima). Sem tradução aqui, buscador
  // indexa a página em idioma diferente do texto visível pro visitante.
  var ORIGINAL_HEAD = new WeakMap();
  var KNOWN_HEAD_ITEMS = [];
  var HEAD_META_SELECTORS = ['meta[name="description"]', 'meta[property="og:title"]', 'meta[property="og:description"]'];

  function collectHeadTranslatables() {
    var items = [];
    var titleEl = document.querySelector('title');
    if (titleEl && titleEl.textContent.trim()) items.push({ el: titleEl, kind: 'text' });

    HEAD_META_SELECTORS.forEach(function (sel) {
      var el = document.querySelector(sel);
      if (el && el.getAttribute('content') && el.getAttribute('content').trim()) {
        items.push({ el: el, kind: 'attr', attr: 'content' });
      }
    });
    return items;
  }

  function rememberHeadOriginal(item) {
    if (!ORIGINAL_HEAD.has(item.el)) {
      var value = item.kind === 'text' ? item.el.textContent : item.el.getAttribute(item.attr);
      ORIGINAL_HEAD.set(item.el, value);
      KNOWN_HEAD_ITEMS.push(item);
    }
    return ORIGINAL_HEAD.get(item.el);
  }

  function restoreHeadOriginals() {
    KNOWN_HEAD_ITEMS.forEach(function (item) {
      var value = ORIGINAL_HEAD.get(item.el);
      if (item.kind === 'text') item.el.textContent = value;
      else item.el.setAttribute(item.attr, value);
    });
  }

  function applyHeadTranslation(config) {
    var items = collectHeadTranslatables();
    var texts = items.map(rememberHeadOriginal);
    if (texts.length === 0) return;

    incPending();
    fetch(API_ORIGIN + '/storefront/translate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        store: STORE_ID,
        texts: texts,
        sourceLang: config.sourceLanguage,
        targetLang: config.targetLanguage,
        country: config.country,
      }),
    })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        var translations = data.translations || texts;
        items.forEach(function (item, i) {
          var translated = translations[i] || texts[i];
          if (item.kind === 'text') item.el.textContent = translated;
          else item.el.setAttribute(item.attr, translated);
        });
      })
      .catch(function () { /* falha silenciosa */ })
      .then(decPending, decPending);
  }

  // ─── Banner personalizado por idioma (upload manual do lojista) ──────────
  // Tradução automática de texto em imagem (OCR + overlay via canvas) foi
  // removida — nenhum concorrente relevante do ecossistema Shopify faz isso
  // de verdade (o mecanismo nativo de "media translation" é upload manual
  // por idioma), e o caminho OCR tinha bugs estruturais sem solução boa:
  // carrossel trocava a imagem antes da resposta do backend voltar, CDN sem
  // CORS quebrava o canvas silenciosamente, e OCR+DeepL em série era lento.
  // Ver CLAUDE.md. Fica só a troca direta por banner cadastrado manualmente
  // (StoreBannerOverride) — sem OCR, sem canvas, sem esses problemas.
  var IMAGE_BATCH_SIZE = 15; // bate com MAX_IMAGES_PER_REQUEST do backend

  function withLoadedImage(img, cb) {
    if (img.complete && img.naturalWidth > 0) { cb(true); return; }
    if (img.complete) { cb(false); return; } // completou sem dimensão = imagem quebrada
    var done = false;
    function finish(ok) {
      if (done) return;
      done = true;
      cb(ok);
    }
    img.addEventListener('load', function () { finish(true); }, { once: true });
    img.addEventListener('error', function () { finish(false); }, { once: true });
    // Carrossel que troca a src continuamente pode abandonar um carregamento
    // em voo sem nunca disparar load nem error — sem esse limite, essa única
    // imagem trava o contador "pending" pra sempre e o LOTE INTEIRO (todas as
    // outras imagens também) nunca é enviado pro backend (confirmado em teste
    // real: troca de bandeira às vezes não traduzia banner nenhum).
    setTimeout(function () { finish(img.complete && img.naturalWidth > 0); }, 2500);
  }

  // Usa a propriedade currentSrc/src (resolvida pelo navegador), nunca
  // getAttribute('src') — temas Nuvemshop servem banner com URL
  // protocol-relative ("//cdn.../img.webp") e/ou via srcset com um
  // placeholder no atributo src; getAttribute('src') devolve esse valor
  // literal (não-absoluto ou ainda placeholder), o que faz o backend
  // (axios) rejeitar como "Invalid URL" ou pedir texto numa imagem errada
  // — confirmado em teste real contra a loja de produção.
  //
  // Guarda a última URL "real" (não data:) vista pra cada <img> — depois que
  // swapImage troca o src pelo data: URL do banner cadastrado, currentSrc
  // passa a devolver ESSE data: URL; sem esse cache, toda re-tradução (ex.: troca de
  // país de novo) mandaria o data: URL pro backend (que falha, não é uma
  // imagem buscável) e o banner ficava travado pra sempre na 1ª tradução
  // aplicada, nunca acompanhando a troca de idioma (confirmado em teste
  // real). Se o carrossel trocar pra uma imagem realmente nova (URL real,
  // não data:), o cache atualiza normalmente.
  var LAST_REAL_URL = new WeakMap();

  function resolveImageUrl(img) {
    var live = img.currentSrc || img.src;
    if (live.indexOf('data:') !== 0) {
      LAST_REAL_URL.set(img, live);
      return live;
    }
    return LAST_REAL_URL.get(img) || live;
  }

  // Banner enviado manualmente pelo lojista pra esse idioma — troca direta,
  // sem OCR/canvas (é uma imagem de verdade, não uma sobreposição em cima da
  // original).
  function swapImage(img, replacementImage) {
    rememberOriginalAttr(img, 'src');
    rememberOriginalAttr(img, 'srcset');
    img.setAttribute('src', replacementImage);
    img.removeAttribute('srcset');
  }

  function requestImageTranslation(imgs, config) {
    var urls = imgs.map(resolveImageUrl);
    incPending();
    fetch(API_ORIGIN + '/storefront/translate-image', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        store: STORE_ID,
        imageUrls: urls,
        targetLang: config.targetLanguage,
      }),
    })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        var images = data.images || {};
        imgs.forEach(function (img, i) {
          var entry = images[urls[i]];
          if (!entry || !entry.replacementImage) return;
          // Carrossel pode já ter trocado essa imagem pra outra enquanto a
          // tradução ia e voltava do backend — sobrepor conteúdo de uma
          // imagem antiga na foto nova que está lá agora fica errado.
          if (resolveImageUrl(img) !== urls[i]) return;
          swapImage(img, entry.replacementImage);
        });
      })
      .catch(function () { /* falha silenciosa */ })
      .then(decPending, decPending);
  }

  function collectEligibleImages(root) {
    var imgs = [];
    if (root.tagName === 'IMG') imgs.push(root);
    if (root.querySelectorAll) {
      var found = root.querySelectorAll('img');
      for (var i = 0; i < found.length; i++) imgs.push(found[i]);
    }
    return imgs.filter(function (img) {
      return !(img.closest && img.closest('[data-notranslate]'));
    });
  }

  // Tentativas extras pra imagem que ainda não tinha carregado no instante da
  // coleta (comum em carrossel com autoplay/troca contínua de src) — sem
  // isso, ela só ganharia outra chance se a src mudasse de novo depois (via
  // observer de atributo), o que pode não acontecer tão rápido (confirmado
  // em teste real: banner às vezes só traduzia as cópias fora de tela do
  // carrossel, nunca a que estava visível no momento da troca de país).
  var IMAGE_RETRY_DELAYS_MS = [800, 2000];

  function processImages(imgs, config, retriesLeft) {
    if (imgs.length === 0) return;
    if (retriesLeft === undefined) retriesLeft = IMAGE_RETRY_DELAYS_MS.length;

    var pending = imgs.length;
    var loaded = [];
    var notReady = [];
    imgs.forEach(function (img) {
      withLoadedImage(img, function (ok) {
        if (ok) loaded.push(img); else notReady.push(img);
        pending -= 1;
        if (pending === 0) {
          // Sem filtro de tamanho mínimo: a checagem agora é só um lookup de
          // hash contra banner cadastrado manualmente (custo quase zero, sem
          // API externa), diferente de quando existia OCR e valia a pena
          // pular ícone/thumbnail pequeno pra economizar chamada da Vision.
          // Um lojista pode ter cadastrado override pra um banner pequeno
          // também — pular ele pelo tamanho bloquearia essa configuração sem
          // motivo.
          for (var i = 0; i < loaded.length; i += IMAGE_BATCH_SIZE) {
            requestImageTranslation(loaded.slice(i, i + IMAGE_BATCH_SIZE), config);
          }
          if (notReady.length > 0 && retriesLeft > 0) {
            setTimeout(function () {
              processImages(notReady, config, retriesLeft - 1);
            }, IMAGE_RETRY_DELAYS_MS[IMAGE_RETRY_DELAYS_MS.length - retriesLeft]);
          }
        }
      });
    });
  }

  function translateImageText(root, config) {
    var candidates = collectEligibleImages(root);
    processImages(candidates, config);
  }

  // ─── Tradução + conversão de preço, em lote ───────────────────────────────
  function applyToNodes(nodes, config) {
    var texts = nodes.map(rememberOriginal);
    if (texts.length === 0) return;

    incPending();
    fetch(API_ORIGIN + '/storefront/translate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        store: STORE_ID,
        texts: texts,
        sourceLang: config.sourceLanguage,
        targetLang: config.targetLanguage,
        country: config.country,
      }),
    })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        var translations = data.translations || texts;
        nodes.forEach(function (node, i) {
          var translated = translations[i] || texts[i];
          if (config.rate && config.rate !== 1) {
            translated = replacePricesInText(translated, config.rate, config.targetCurrency);
          }
          node.nodeValue = translated;
        });
      })
      .catch(function () { /* falha silenciosa — nunca quebra a vitrine */ })
      .then(decPending, decPending);
  }

  function translateVisibleNodes(config) {
    var nodes = collectTextNodes(document.body);
    for (var i = 0; i < nodes.length; i += TEXT_BATCH_SIZE) {
      applyToNodes(nodes.slice(i, i + TEXT_BATCH_SIZE), config);
    }

    var attrItems = collectTranslatableAttrs(document.body);
    for (var j = 0; j < attrItems.length; j += TEXT_BATCH_SIZE) {
      applyToAttrs(attrItems.slice(j, j + TEXT_BATCH_SIZE), config);
    }

    applyHeadTranslation(config);
    translateImageText(document.body, config);
  }

  // ─── País/config atualmente aplicado (geoip OU seleção manual) ───────────
  var CURRENT_CONFIG = null;
  var OBSERVER_STARTED = false;

  function ensureObserver() {
    if (OBSERVER_STARTED) return;
    OBSERVER_STARTED = true;

    // Reaplica em conteúdo inserido dinamicamente (ex: carrinho abrindo,
    // temas com comportamento SPA) usando o país atualmente selecionado.
    var pending = null;
    var observer = new MutationObserver(function (mutations) {
      if (!CURRENT_CONFIG) return;
      clearTimeout(pending);
      pending = setTimeout(function () {
        var newNodes = [];
        var newAttrItems = [];
        var newRoots = [];
        var lazyImages = [];
        mutations.forEach(function (m) {
          if (m.type === 'attributes') {
            var el = m.target;
            if (el.tagName === 'IMG' && lazyImages.indexOf(el) === -1) {
              var src = el.getAttribute('src') || '';
              if (src && src.indexOf('data:') !== 0) lazyImages.push(el);
            }
            return;
          }
          m.addedNodes.forEach(function (added) {
            if (added.nodeType === 1) {
              newNodes = newNodes.concat(collectTextNodes(added));
              newAttrItems = newAttrItems.concat(collectTranslatableAttrs(added));
              newRoots.push(added);
            } else if (added.nodeType === 3 && added.nodeValue && added.nodeValue.trim()) {
              newNodes.push(added);
            }
          });
        });
        if (newNodes.length > 0) applyToNodes(newNodes, CURRENT_CONFIG);
        if (newAttrItems.length > 0) applyToAttrs(newAttrItems, CURRENT_CONFIG);
        newRoots.forEach(function (root) { translateImageText(root, CURRENT_CONFIG); });
        // Sliders lazy (Swiper etc.) recebem a URL real da imagem via mutação
        // do atributo src, não inserção de nó novo — sem isso, o banner nunca
        // é re-tentado: no load inicial o <img> ainda está com src vazio, o
        // withLoadedImage já resolve ok=false na hora e o elemento é
        // descartado pra sempre (confirmado em teste real: banner de texto
        // ficava sempre de fora do lote enviado pro backend).
        lazyImages.forEach(function (img) { translateImageText(img, CURRENT_CONFIG); });
        if (isEditMode()) styleEditableTargets();
      }, 300);
    });
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['src'] });
  }

  // ─── Modo de edição in-context — corrigir tradução clicando na própria
  // vitrine, sem digitar o texto original manualmente no admin. Ativado via
  // ?traduzai_edit=TOKEN na URL (token de curta duração emitido pelo admin
  // em POST /api/translations/edit-session — ver widget.js não tem acesso
  // ao JWT do admin, domínio diferente, por isso o token separado).
  var EDIT_TOKEN = null;
  var EDIT_STYLED = typeof WeakSet !== 'undefined' ? new WeakSet() : null;

  function isEditMode() {
    return !!EDIT_TOKEN;
  }

  function closeEditPopup() {
    var existing = document.getElementById('traduzai-edit-popup');
    if (existing && existing.parentNode) existing.parentNode.removeChild(existing);
  }

  function openEditPopup(el, node) {
    closeEditPopup();
    var original = ORIGINAL_TEXT.get(node) || node.nodeValue;
    var current = node.nodeValue;
    var rect = el.getBoundingClientRect();

    var popup = document.createElement('div');
    popup.id = 'traduzai-edit-popup';
    popup.setAttribute('data-notranslate', '');
    var top = Math.max(8, Math.min(rect.bottom + 8, window.innerHeight - 220));
    var left = Math.max(8, Math.min(rect.left, window.innerWidth - 300));
    popup.style.cssText = 'position:fixed;top:' + top + 'px;left:' + left + 'px;z-index:2147483001;' +
      'background:#fff;border-radius:8px;box-shadow:0 4px 16px rgba(0,0,0,.3);padding:12px;' +
      'width:280px;font-family:sans-serif;font-size:13px;color:#222;';

    var label1 = document.createElement('div');
    label1.textContent = 'Texto original:';
    label1.style.cssText = 'font-weight:bold;margin-bottom:4px;';
    var originalEl = document.createElement('div');
    originalEl.textContent = original;
    originalEl.style.cssText = 'color:#666;margin-bottom:8px;max-height:60px;overflow:auto;white-space:pre-wrap;';

    var label2 = document.createElement('div');
    label2.textContent = 'Tradução:';
    label2.style.cssText = 'font-weight:bold;margin-bottom:4px;';
    var textarea = document.createElement('textarea');
    textarea.value = current;
    textarea.style.cssText = 'width:100%;box-sizing:border-box;min-height:50px;margin-bottom:8px;' +
      'font-family:sans-serif;font-size:13px;';

    var saveBtn = document.createElement('button');
    saveBtn.type = 'button';
    saveBtn.textContent = 'Salvar';
    saveBtn.style.cssText = 'background:#1a73e8;color:#fff;border:none;border-radius:4px;' +
      'padding:6px 12px;margin-right:6px;cursor:pointer;';
    var cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.textContent = 'Cancelar';
    cancelBtn.style.cssText = 'background:#eee;color:#222;border:none;border-radius:4px;padding:6px 12px;cursor:pointer;';

    var statusEl = document.createElement('div');
    statusEl.style.cssText = 'margin-top:6px;font-size:12px;color:#666;';

    saveBtn.addEventListener('click', function () {
      var newText = textarea.value;
      if (!newText || !newText.trim()) return;
      saveBtn.disabled = true;
      statusEl.textContent = 'Salvando...';
      fetch(API_ORIGIN + '/storefront/edit-override', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          store: STORE_ID,
          editToken: EDIT_TOKEN,
          sourceText: original,
          targetLang: CURRENT_CONFIG.targetLanguage,
          overrideText: newText,
        }),
      })
        .then(function (r) { if (!r.ok) throw new Error('http ' + r.status); return r.json(); })
        .then(function () {
          node.nodeValue = newText;
          statusEl.textContent = 'Salvo!';
          setTimeout(closeEditPopup, 900);
        })
        .catch(function () {
          statusEl.textContent = 'Erro ao salvar — tente de novo.';
          statusEl.style.color = '#c0392b';
          saveBtn.disabled = false;
        });
    });
    cancelBtn.addEventListener('click', closeEditPopup);

    popup.appendChild(label1);
    popup.appendChild(originalEl);
    popup.appendChild(label2);
    popup.appendChild(textarea);
    popup.appendChild(saveBtn);
    popup.appendChild(cancelBtn);
    popup.appendChild(statusEl);
    document.body.appendChild(popup);
    textarea.focus();
  }

  // Marca cada elemento que tem um nó de texto traduzido como clicável —
  // roda de novo a cada tradução (inicial + conteúdo dinâmico), mas cada
  // elemento só recebe os listeners uma vez (EDIT_STYLED).
  function styleEditableTargets() {
    KNOWN_NODES.forEach(function (node) {
      var el = node.parentElement;
      if (!el || (EDIT_STYLED && EDIT_STYLED.has(el))) return;
      if (EDIT_STYLED) EDIT_STYLED.add(el);

      el.addEventListener('mouseenter', function () {
        el.setAttribute('data-traduzai-edit-outline', el.style.outline || '');
        el.style.outline = '2px dashed #1a73e8';
        el.style.outlineOffset = '2px';
        el.style.cursor = 'pointer';
      });
      el.addEventListener('mouseleave', function () {
        el.style.outline = el.getAttribute('data-traduzai-edit-outline') || '';
      });
      el.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        openEditPopup(el, node);
      });
    });
  }

  function applyCountry(config) {
    CURRENT_CONFIG = config && config.active ? config : null;
    if (CURRENT_CONFIG) {
      translateVisibleNodes(CURRENT_CONFIG);
      if (isEditMode()) styleEditableTargets();
    } else {
      restoreOriginals();
      restoreOriginalAttrs();
      restoreHeadOriginals();
    }
  }

  function fetchJson(url) {
    return fetch(url).then(function (r) { return r.json(); });
  }

  // ─── Persistência da escolha manual entre páginas ─────────────────────────
  // Sem isso, a seleção de bandeira só existe em memória daquele carregamento
  // — ao navegar pra outra página ou recarregar, a tradução "desliga" mesmo
  // sem o comprador ter pedido. localStorage guarda a escolha; toda página
  // nova restaura automaticamente antes do geoip entrar em ação. HOME_SENTINEL
  // marca "escolheu ficar no idioma nativo" como escolha explícita também —
  // sem isso, o geoip poderia re-traduzir na página seguinte mesmo depois do
  // comprador ter clicado pra voltar ao original.
  var STORAGE_KEY = 'traduzai_country';
  var HOME_SENTINEL = '__home__';

  function getPersistedCountry() {
    try { return window.localStorage.getItem(STORAGE_KEY); } catch (e) { return null; }
  }

  function persistCountry(code) {
    try { window.localStorage.setItem(STORAGE_KEY, code || HOME_SENTINEL); } catch (e) { /* ignore — modo privado/storage bloqueado */ }
  }

  // ─── Cache de sessão da deteccao automatica (geoip) ───────────────────────
  // Sem isso, cada pagina nova da MESMA visita refaz geoip + traducao do
  // zero — perceptivel como demora em quem navega por varias paginas.
  // sessionStorage (nao localStorage): expira ao fechar a aba, diferente da
  // escolha manual que deve "colar" pra sempre — aqui e so uma otimizacao de
  // latencia dentro da mesma visita, nao uma preferencia do comprador. TTL
  // curto por cima do sessionStorage pra nao prender uma aba aberta por
  // horas numa deteccao que a loja pode ter corrigido nesse meio tempo.
  var AUTO_CONFIG_CACHE_KEY = 'traduzai_auto_config_cache';
  var AUTO_CONFIG_CACHE_TTL_MS = 20 * 60 * 1000; // 20min

  function getCachedAutoConfig() {
    try {
      var raw = window.sessionStorage.getItem(AUTO_CONFIG_CACHE_KEY);
      if (!raw) return null;
      var parsed = JSON.parse(raw);
      if (!parsed || (Date.now() - parsed.savedAt) > AUTO_CONFIG_CACHE_TTL_MS) return null;
      return parsed.config;
    } catch (e) { return null; }
  }

  function setCachedAutoConfig(config) {
    try {
      window.sessionStorage.setItem(AUTO_CONFIG_CACHE_KEY, JSON.stringify({ config: config, savedAt: Date.now() }));
    } catch (e) { /* ignore — modo privado/storage bloqueado */ }
  }

  // ─── hreflang — sinaliza pro Google que existem variantes traduzidas ──────
  // Limitação real e aceita: a tradução é client-side (JS), não uma URL
  // servida diferente por idioma — não é o ideal (SSR por URL seria melhor,
  // mas exigiria a Nuvemshop rotear URL por idioma, fora do nosso controle).
  // Ainda assim, cada `?country=XX` É funcional quando visitado direto (o
  // próprio widget lê o param e aplica a tradução), o que é o requisito
  // mínimo do hreflang — só depende do Googlebot executar o JS pra indexar
  // certo, o que não é garantido. Ver CLAUDE.md.
  function injectHreflangTags(countries, home) {
    var currentUrl = window.location.href.split('#')[0];
    var urlNoCountry = currentUrl.replace(/([?&])country=[^&]*/, '$1').replace(/[?&]$/, '').replace(/\?$/, '');
    var separator = urlNoCountry.indexOf('?') === -1 ? '?' : '&';

    // remove tags de uma injeção anterior (evita duplicar se init() rodar 2x)
    var existing = document.head.querySelectorAll('link[data-traduzai-hreflang]');
    for (var i = 0; i < existing.length; i++) existing[i].parentNode.removeChild(existing[i]);

    function addLink(hreflang, href) {
      var link = document.createElement('link');
      link.setAttribute('rel', 'alternate');
      link.setAttribute('hreflang', hreflang);
      link.setAttribute('href', href);
      link.setAttribute('data-traduzai-hreflang', '');
      document.head.appendChild(link);
    }

    function toHreflang(language, countryCode) {
      return language.indexOf('-') === -1 ? language + '-' + countryCode : language;
    }

    addLink('x-default', urlNoCountry);
    if (home) addLink(toHreflang(home.language, home.code), urlNoCountry);

    (countries || []).forEach(function (c) {
      addLink(toHreflang(c.language, c.code), urlNoCountry + separator + 'country=' + c.code);
    });
  }

  // ─── Seletor manual de país (dropdown) — fallback do geoip por IP ─────────
  function makeFlagImg(code, dims) {
    var img = document.createElement('img');
    img.src = 'https://flagcdn.com/48x36/' + code.toLowerCase() + '.png'; // bucket fixo — CSS faz o downscale por preset
    img.alt = code;
    img.style.cssText = 'width:' + (dims ? dims.w : '20px') + ';height:' + (dims ? dims.h : '15px') + ';display:block;border-radius:2px;flex:none;';
    return img;
  }

  // Converte "#1a73e8" -> "rgba(26,115,232,ALPHA)" pro fundo de destaque —
  // não dá pra usar a cor sólida direto no highlight da linha ativa.
  function hexToRgba(hex, alpha) {
    var m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex || '');
    if (!m) return 'rgba(26,115,232,' + alpha + ')';
    return 'rgba(' + parseInt(m[1], 16) + ',' + parseInt(m[2], 16) + ',' + parseInt(m[3], 16) + ',' + alpha + ')';
  }

  var PICKER_POSITION_CSS = {
    'bottom-left': 'bottom:16px;left:16px;',
    'bottom-right': 'bottom:16px;right:16px;',
    'top-left': 'top:16px;left:16px;',
    'top-right': 'top:16px;right:16px;',
  };

  var PICKER_SIZE_CSS = {
    small: { padding: '4px 8px', gap: '4px', flag: { w: '16px', h: '12px' }, chevron: '9px', rowFont: '12px', panelWidth: '150px' },
    medium: { padding: '6px 10px', gap: '6px', flag: { w: '20px', h: '15px' }, chevron: '10px', rowFont: '13px', panelWidth: '170px' },
    large: { padding: '8px 14px', gap: '8px', flag: { w: '24px', h: '18px' }, chevron: '12px', rowFont: '14px', panelWidth: '190px' },
  };

  // Ponte entre a deteccao automatica por geoip (init) e o seletor de
  // bandeiras (buildCountryPicker) — os dois buscam dados em paralelo
  // (/storefront/config e /storefront/rules), sem ordem garantida. Sem essa
  // ponte, quando NAO ha selecao manual, a bandeira ativa fica sempre em
  // "origem" mesmo com o conteudo ja traduzido pro pais detectado (bug real
  // confirmado: geoip funcionando, bandeira nao acompanhava).
  var PICKER_SET_ACTIVE = null; // setado por buildCountryPicker quando o seletor termina de montar
  var AUTO_DETECTED_COUNTRY; // undefined = geoip ainda nao resolveu; null = resolveu sem pais; "US" etc = resolveu com pais

  function buildCountryPicker(countries, initialCode, home, appearance) {
    if ((!countries || countries.length === 0) && !home) return;

    var color = (appearance && appearance.color) || '#1a73e8';
    var bgColor = (appearance && appearance.bgColor) || '#fff';
    var borderRadius = (appearance && appearance.borderRadius != null) ? appearance.borderRadius : 8;
    var sizeCss = PICKER_SIZE_CSS[(appearance && appearance.size)] || PICKER_SIZE_CSS.medium;
    var positionKey = (appearance && appearance.position) || 'bottom-left';
    var positionCss = PICKER_POSITION_CSS[positionKey] || PICKER_POSITION_CSS['bottom-left'];
    var opensDown = positionKey.indexOf('top') === 0; // painel abre pro lado livre da tela

    var activeCode = null; // null = idioma/moeda de origem (home) em exibição
    var rows = {}; // '__home__' | code -> { row, code, flagCode }
    var isOpen = false;

    var container = document.createElement('div');
    container.setAttribute('data-notranslate', '');
    container.style.cssText = 'position:fixed;' + positionCss + 'z-index:2147483000;font-family:sans-serif;';

    var trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.style.cssText = 'display:flex;align-items:center;gap:' + sizeCss.gap + ';background:' + bgColor + ';border:none;' +
      'padding:' + sizeCss.padding + ';border-radius:' + borderRadius + 'px;box-shadow:0 2px 8px rgba(0,0,0,.2);cursor:pointer;';

    var triggerFlag = makeFlagImg('un', sizeCss.flag); // placeholder até highlight() setar a bandeira real
    trigger.appendChild(triggerFlag);

    var chevron = document.createElement('span');
    chevron.textContent = '▾';
    chevron.style.cssText = 'font-size:' + sizeCss.chevron + ';color:#666;line-height:1;transition:transform .15s;flex:none;';
    trigger.appendChild(chevron);

    PICKER_SPINNER_EL = makeSpinner();
    trigger.appendChild(PICKER_SPINNER_EL);
    updatePendingIndicator(); // sincroniza com PENDING_COUNT ja acumulado antes do seletor terminar de montar

    var panel = document.createElement('div');
    panel.style.cssText = 'position:absolute;' + (opensDown ? 'top:calc(100% + 6px);' : 'bottom:calc(100% + 6px);') +
      (positionKey.indexOf('right') !== -1 ? 'right:0;' : 'left:0;') +
      'display:none;flex-direction:column;background:#fff;border-radius:' + borderRadius + 'px;' +
      'box-shadow:0 4px 16px rgba(0,0,0,.25);min-width:' + sizeCss.panelWidth + ';max-height:260px;overflow-y:auto;padding:4px;';

    function setOpen(open) {
      isOpen = open;
      panel.style.display = open ? 'flex' : 'none';
      chevron.style.transform = open ? 'rotate(180deg)' : 'none';
    }

    trigger.addEventListener('click', function (ev) {
      ev.stopPropagation();
      setOpen(!isOpen);
    });
    document.addEventListener('click', function () {
      if (isOpen) setOpen(false);
    });

    function setRowActiveStyles() {
      Object.keys(rows).forEach(function (key) {
        var entry = rows[key];
        entry.row.style.background = entry.code === activeCode ? hexToRgba(color, 0.12) : 'none';
      });
    }

    function highlight(code) {
      activeCode = code;
      var entry = rows[code === null ? '__home__' : code];
      if (entry) triggerFlag.src = 'https://flagcdn.com/48x36/' + entry.flagCode.toLowerCase() + '.png';
      setRowActiveStyles();
    }

    function goHome() {
      persistCountry(null);
      highlight(null);
      applyCountry({ active: false });
      setOpen(false);
    }

    function selectCountry(code) {
      if (!code) {
        goHome();
        return;
      }
      incPending();
      fetchJson(API_ORIGIN + '/storefront/config?store=' + encodeURIComponent(STORE_ID) + '&country=' + encodeURIComponent(code))
        .then(function (config) {
          persistCountry(code);
          highlight(code);
          applyCountry(config);
        })
        .catch(function () { /* falha silenciosa */ })
        .then(decPending, decPending);
      setOpen(false);
    }

    function makeRow(key, flagCode, label) {
      var row = document.createElement('button');
      row.type = 'button';
      row.title = label;
      row.style.cssText = 'display:flex;align-items:center;gap:8px;width:100%;border:none;' +
        'background:none;padding:6px 8px;border-radius:6px;cursor:pointer;text-align:left;' +
        'font-size:' + sizeCss.rowFont + ';color:#222;white-space:nowrap;';
      row.appendChild(makeFlagImg(flagCode, sizeCss.flag));
      var text = document.createElement('span');
      text.textContent = label;
      text.style.cssText = 'overflow:hidden;text-overflow:ellipsis;';
      row.appendChild(text);
      row.addEventListener('mouseenter', function () { row.style.background = hexToRgba(color, rows[key].code === activeCode ? 0.12 : 0.06); });
      row.addEventListener('mouseleave', function () { row.style.background = rows[key].code === activeCode ? hexToRgba(color, 0.12) : 'none'; });
      panel.appendChild(row);
      return row;
    }

    if (home) {
      var homeRow = makeRow('__home__', home.code, home.name + ' (idioma original da loja)');
      homeRow.addEventListener('click', goHome);
      rows['__home__'] = { row: homeRow, code: null, flagCode: home.code };
      triggerFlag.src = 'https://flagcdn.com/48x36/' + home.code.toLowerCase() + '.png';
    } else if (countries.length > 0) {
      triggerFlag.src = 'https://flagcdn.com/48x36/' + countries[0].code.toLowerCase() + '.png';
    }

    countries.forEach(function (c) {
      var row = makeRow(c.code, c.code, c.name);
      row.addEventListener('click', function () {
        selectCountry(c.code === activeCode ? null : c.code);
      });
      rows[c.code] = { row: row, code: c.code, flagCode: c.code };
    });

    container.appendChild(trigger);
    container.appendChild(panel);
    document.body.appendChild(container);
    highlight(null);
    PICKER_SET_ACTIVE = highlight;

    if (initialCode === HOME_SENTINEL) goHome();
    else if (initialCode) selectCountry(initialCode);
    // Sem selecao manual/URL: se a deteccao automatica ja resolveu antes do
    // seletor terminar de montar, aplica o destaque agora — senao fica preso
    // em "origem" pra sempre nesse carregamento (so o init() chamaria depois
    // e nao teria mais efeito, pois PICKER_SET_ACTIVE ainda seria null antes
    // dessa linha rodar).
    else if (AUTO_DETECTED_COUNTRY !== undefined) highlight(AUTO_DETECTED_COUNTRY);
  }

  function init() {
    ensureObserver();

    // ?country=US na URL da vitrine (não do script) força o país inicial —
    // útil pra teste manual, contornando geoip por IP. Prioridade: URL >
    // escolha manual persistida (localStorage) > geoip automático.
    var countryOverride = null;
    try {
      var urlParams = new URL(window.location.href).searchParams;
      countryOverride = urlParams.get('country');
      EDIT_TOKEN = urlParams.get('traduzai_edit') || null;
    } catch (e) { /* ignore */ }
    var effectiveInitial = countryOverride || getPersistedCountry();

    fetchJson(API_ORIGIN + '/storefront/rules?store=' + encodeURIComponent(STORE_ID))
      .then(function (data) {
        buildCountryPicker((data && data.countries) || [], effectiveInitial, data && data.home, {
          position: data && data.pickerPosition,
          color: data && data.pickerColor,
          size: data && data.pickerSize,
          bgColor: data && data.pickerBgColor,
          borderRadius: data && data.pickerBorderRadius,
        });
        injectHreflangTags((data && data.countries) || [], data && data.home);
      })
      .catch(function () { /* falha silenciosa */ });

    if (effectiveInitial) return; // seletor já aplica a config pro país forçado/persistido

    var cachedAutoConfig = getCachedAutoConfig();
    if (cachedAutoConfig) {
      AUTO_DETECTED_COUNTRY = (cachedAutoConfig.active && cachedAutoConfig.country) ? cachedAutoConfig.country : null;
      if (PICKER_SET_ACTIVE) PICKER_SET_ACTIVE(AUTO_DETECTED_COUNTRY);
      applyCountry(cachedAutoConfig);
      return;
    }

    incPending();
    fetchJson(API_ORIGIN + '/storefront/config?store=' + encodeURIComponent(STORE_ID))
      .then(function (config) {
        setCachedAutoConfig(config);
        AUTO_DETECTED_COUNTRY = (config && config.active && config.country) ? config.country : null;
        if (PICKER_SET_ACTIVE) PICKER_SET_ACTIVE(AUTO_DETECTED_COUNTRY);
        applyCountry(config);
      })
      .catch(function () { /* falha silenciosa */ })
      .then(decPending, decPending);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
