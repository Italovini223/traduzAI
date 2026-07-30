/*
 * traduzAI — widget de tradução da vitrine + conversão de moeda.
 *
 * Registrado via Nuvemshop Script API (backend/src/config/nuvemshop.js,
 * hook em backend/src/routes/auth.js). Roda no navegador do comprador em
 * TODA página da vitrine pública da loja instalada.
 *
 * Vanilla JS, sem dependências e sem build step. Servido dinamicamente pelo
 * Express (backend/src/server.js), que substitui o placeholder __API_ORIGIN__
 * pela URL real do backend antes de enviar — necessário porque a Nuvemshop
 * serve o arquivo pelo próprio CDN (apps-scripts.tiendanube.com), então
 * `document.currentScript.src` aponta pro CDN deles, não pro nosso backend.
 * O identificador da loja (nuvemshopId) continua vindo da query string do
 * próprio <script src="...?store=123">, que a Nuvemshop preserva ao servir.
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

  var PRICE_REGEX = new RegExp(
    '(' + Object.keys(CURRENCY_SYMBOLS).map(escapeRegExp).join('|') + ')' +
    '\\s?(\\d{1,3}(?:[.,]\\d{3})*(?:[.,]\\d{1,2})?)',
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
      var amount = parseLocalizedNumber(m[2]);
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

  // ─── Tradução + conversão de preço, em lote ───────────────────────────────
  function applyToNodes(nodes, config) {
    var texts = nodes.map(function (n) { return n.nodeValue; });
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

  function run(config) {
    var nodes = collectTextNodes(document.body);
    for (var i = 0; i < nodes.length; i += TEXT_BATCH_SIZE) {
      applyToNodes(nodes.slice(i, i + TEXT_BATCH_SIZE), config);
    }

    // Reaplica em conteúdo inserido dinamicamente (ex: carrinho abrindo,
    // temas com comportamento SPA).
    var pending = null;
    var observer = new MutationObserver(function (mutations) {
      clearTimeout(pending);
      pending = setTimeout(function () {
        var newNodes = [];
        mutations.forEach(function (m) {
          m.addedNodes.forEach(function (added) {
            if (added.nodeType === 1) newNodes = newNodes.concat(collectTextNodes(added));
            else if (added.nodeType === 3 && added.nodeValue && added.nodeValue.trim()) newNodes.push(added);
          });
        });
        if (newNodes.length > 0) applyToNodes(newNodes, config);
      }, 300);
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  function init() {
    fetch(API_ORIGIN + '/storefront/config?store=' + encodeURIComponent(STORE_ID))
      .then(function (r) { return r.json(); })
      .then(function (config) {
        if (!config || !config.active) return;
        run(config);
      })
      .catch(function () { /* falha silenciosa */ });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
