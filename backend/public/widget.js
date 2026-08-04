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
        mutations.forEach(function (m) {
          m.addedNodes.forEach(function (added) {
            if (added.nodeType === 1) newNodes = newNodes.concat(collectTextNodes(added));
            else if (added.nodeType === 3 && added.nodeValue && added.nodeValue.trim()) newNodes.push(added);
          });
        });
        if (newNodes.length > 0) applyToNodes(newNodes, CURRENT_CONFIG);
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
    }
  }

  function fetchJson(url) {
    return fetch(url).then(function (r) { return r.json(); });
  }

  // ─── Seletor manual de país (bandeiras) — fallback do geoip por IP ────────
  function buildCountryPicker(countries, initialCode) {
    if (!countries || countries.length === 0) return;

    var activeCode = null;
    var buttons = {};

    var container = document.createElement('div');
    container.setAttribute('data-notranslate', '');
    container.style.cssText = 'position:fixed;bottom:16px;left:16px;z-index:2147483000;' +
      'display:flex;gap:6px;background:#fff;padding:6px;border-radius:8px;' +
      'box-shadow:0 2px 8px rgba(0,0,0,.2);font-family:sans-serif;';

    function highlight(code) {
      activeCode = code;
      Object.keys(buttons).forEach(function (key) {
        buttons[key].style.borderColor = key === code ? '#1a73e8' : 'transparent';
      });
    }

    function selectCountry(code) {
      if (!code) {
        highlight(null);
        applyCountry({ active: false });
        return;
      }
      fetchJson(API_ORIGIN + '/storefront/config?store=' + encodeURIComponent(STORE_ID) + '&country=' + encodeURIComponent(code))
        .then(function (config) {
          highlight(code);
          applyCountry(config);
        })
        .catch(function () { /* falha silenciosa */ });
    }

    countries.forEach(function (c) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.title = c.name;
      btn.style.cssText = 'border:2px solid transparent;border-radius:4px;padding:0;' +
        'width:28px;height:20px;cursor:pointer;background:none;overflow:hidden;';

      var img = document.createElement('img');
      img.src = 'https://flagcdn.com/28x21/' + c.code.toLowerCase() + '.png';
      img.alt = c.code;
      img.style.cssText = 'width:100%;height:100%;display:block;';
      btn.appendChild(img);

      btn.addEventListener('click', function () {
        selectCountry(c.code === activeCode ? null : c.code);
      });

      buttons[c.code] = btn;
      container.appendChild(btn);
    });

    document.body.appendChild(container);

    if (initialCode) selectCountry(initialCode);
  }

  function init() {
    ensureObserver();

    // ?country=US na URL da vitrine (não do script) força o país inicial —
    // útil pra teste manual, contornando geoip por IP.
    var countryOverride = null;
    try { countryOverride = new URL(window.location.href).searchParams.get('country'); } catch (e) { /* ignore */ }

    fetchJson(API_ORIGIN + '/storefront/rules?store=' + encodeURIComponent(STORE_ID))
      .then(function (data) {
        buildCountryPicker((data && data.countries) || [], countryOverride);
      })
      .catch(function () { /* falha silenciosa */ });

    if (countryOverride) return; // seletor já aplica a config pro país forçado

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
