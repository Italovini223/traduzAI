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

  // ─── Atributos traduzíveis: placeholder de input/textarea e o texto de
  // botões renderizados como <input type="submit|button|reset" value="...">
  // (padrão comum em temas Nuvemshop pra "Comprar"/"Iniciar Compra"/etc).
  // Não inclui inputs de texto/email/hidden — só os que exibem o value como
  // rótulo visível, nunca como dado digitado/enviado pelo comprador.
  var ORIGINAL_ATTR = new WeakMap();
  var KNOWN_ATTR_ELS = [];
  var BUTTON_INPUT_TYPES = { submit: 1, button: 1, reset: 1 };
  var ATTR_SELECTOR = '[placeholder], input[type="submit"], input[type="button"], input[type="reset"]';

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
    });
    return items;
  }

  function applyToAttrs(items, config) {
    var texts = items.map(function (item) { return rememberOriginalAttr(item.el, item.attr); });
    if (texts.length === 0) return;

    fetch(API_ORIGIN + '/storefront/translate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        store: STORE_ID,
        texts: texts,
        sourceLang: config.sourceLanguage,
        targetLang: config.targetLanguage,
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
      .catch(function () { /* falha silenciosa */ });
  }

  // ─── Tradução + conversão de preço, em lote ───────────────────────────────
  function applyToNodes(nodes, config) {
    var texts = nodes.map(rememberOriginal);
    if (texts.length === 0) return;

    fetch(API_ORIGIN + '/storefront/translate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        store: STORE_ID,
        texts: texts,
        sourceLang: config.sourceLanguage,
        targetLang: config.targetLanguage,
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
      .catch(function () { /* falha silenciosa — nunca quebra a vitrine */ });
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
        mutations.forEach(function (m) {
          m.addedNodes.forEach(function (added) {
            if (added.nodeType === 1) {
              newNodes = newNodes.concat(collectTextNodes(added));
              newAttrItems = newAttrItems.concat(collectTranslatableAttrs(added));
            } else if (added.nodeType === 3 && added.nodeValue && added.nodeValue.trim()) {
              newNodes.push(added);
            }
          });
        });
        if (newNodes.length > 0) applyToNodes(newNodes, CURRENT_CONFIG);
        if (newAttrItems.length > 0) applyToAttrs(newAttrItems, CURRENT_CONFIG);
      }, 300);
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  function applyCountry(config) {
    CURRENT_CONFIG = config && config.active ? config : null;
    if (CURRENT_CONFIG) {
      translateVisibleNodes(CURRENT_CONFIG);
    } else {
      restoreOriginals();
      restoreOriginalAttrs();
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

  // ─── Seletor manual de país (bandeiras) — fallback do geoip por IP ────────
  function makeFlagButton(code, title) {
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.title = title;
    btn.style.cssText = 'border:2px solid transparent;border-radius:4px;padding:0;' +
      'width:28px;height:20px;cursor:pointer;background:none;overflow:hidden;';

    var img = document.createElement('img');
    img.src = 'https://flagcdn.com/28x21/' + code.toLowerCase() + '.png';
    img.alt = code;
    img.style.cssText = 'width:100%;height:100%;display:block;';
    btn.appendChild(img);
    return btn;
  }

  function buildCountryPicker(countries, initialCode, home) {
    if ((!countries || countries.length === 0) && !home) return;

    var activeCode = null; // null = idioma/moeda de origem (home) em exibição
    var buttons = {};
    var homeBtn = null;

    var container = document.createElement('div');
    container.setAttribute('data-notranslate', '');
    container.style.cssText = 'position:fixed;bottom:16px;left:16px;z-index:2147483000;' +
      'display:flex;gap:6px;background:#fff;padding:6px;border-radius:8px;' +
      'box-shadow:0 2px 8px rgba(0,0,0,.2);font-family:sans-serif;';

    function setActiveStyle(btn, isActive) {
      btn.style.borderColor = isActive ? '#1a73e8' : 'transparent';
      btn.style.boxShadow = isActive ? '0 0 0 2px rgba(26,115,232,0.35)' : 'none';
      btn.style.opacity = isActive ? '1' : '0.6';
    }

    function highlight(code) {
      activeCode = code;
      if (homeBtn) setActiveStyle(homeBtn, code === null);
      Object.keys(buttons).forEach(function (key) {
        setActiveStyle(buttons[key], key === code);
      });
    }

    function goHome() {
      persistCountry(null);
      highlight(null);
      applyCountry({ active: false });
    }

    function selectCountry(code) {
      if (!code) {
        goHome();
        return;
      }
      fetchJson(API_ORIGIN + '/storefront/config?store=' + encodeURIComponent(STORE_ID) + '&country=' + encodeURIComponent(code))
        .then(function (config) {
          persistCountry(code);
          highlight(code);
          applyCountry(config);
        })
        .catch(function () { /* falha silenciosa */ });
    }

    if (home) {
      homeBtn = makeFlagButton(home.code, home.name + ' (idioma original da loja)');
      homeBtn.addEventListener('click', goHome);
      container.appendChild(homeBtn);

      if (countries && countries.length > 0) {
        var separator = document.createElement('div');
        separator.style.cssText = 'width:1px;align-self:stretch;background:#ddd;margin:2px 1px;';
        container.appendChild(separator);
      }
    }

    countries.forEach(function (c) {
      var btn = makeFlagButton(c.code, c.name);
      btn.addEventListener('click', function () {
        selectCountry(c.code === activeCode ? null : c.code);
      });
      buttons[c.code] = btn;
      container.appendChild(btn);
    });

    document.body.appendChild(container);
    highlight(null);

    if (initialCode === HOME_SENTINEL) goHome();
    else if (initialCode) selectCountry(initialCode);
  }

  function init() {
    ensureObserver();

    // ?country=US na URL da vitrine (não do script) força o país inicial —
    // útil pra teste manual, contornando geoip por IP. Prioridade: URL >
    // escolha manual persistida (localStorage) > geoip automático.
    var countryOverride = null;
    try { countryOverride = new URL(window.location.href).searchParams.get('country'); } catch (e) { /* ignore */ }
    var effectiveInitial = countryOverride || getPersistedCountry();

    fetchJson(API_ORIGIN + '/storefront/rules?store=' + encodeURIComponent(STORE_ID))
      .then(function (data) {
        buildCountryPicker((data && data.countries) || [], effectiveInitial, data && data.home);
      })
      .catch(function () { /* falha silenciosa */ });

    if (effectiveInitial) return; // seletor já aplica a config pro país forçado/persistido

    fetchJson(API_ORIGIN + '/storefront/config?store=' + encodeURIComponent(STORE_ID))
      .then(applyCountry)
      .catch(function () { /* falha silenciosa */ });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
