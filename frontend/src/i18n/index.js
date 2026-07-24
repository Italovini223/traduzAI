import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import ptBR from './locales/pt-BR.json';
import esAR from './locales/es-AR.json';
import esMX from './locales/es-MX.json';

export const NUVEMSHOP_LANG_MAP = {
  pt: 'pt-BR',
  es: 'es-AR',
  'es-ar': 'es-AR',
  'es-mx': 'es-MX',
  'pt-br': 'pt-BR',
};

export const SUPPORTED_LANGS = ['pt-BR', 'es-AR', 'es-MX'];
export const DEFAULT_LANG = 'pt-BR';

function detectLanguage() {
  // Check URL params
  const params = new URLSearchParams(window.location.search);
  const langParam = params.get('lang');
  if (langParam) {
    const mapped = NUVEMSHOP_LANG_MAP[langParam.toLowerCase()] || langParam;
    if (SUPPORTED_LANGS.includes(mapped)) return mapped;
  }

  // Check localStorage
  const stored = localStorage.getItem('app_language');
  if (stored && SUPPORTED_LANGS.includes(stored)) return stored;

  // Check browser language
  const browserLang = navigator.language;
  const mapped = NUVEMSHOP_LANG_MAP[browserLang.toLowerCase()];
  if (mapped && SUPPORTED_LANGS.includes(mapped)) return mapped;

  return DEFAULT_LANG;
}

i18n.use(initReactI18next).init({
  resources: {
    'pt-BR': { translation: ptBR },
    'es-AR': { translation: esAR },
    'es-MX': { translation: esMX },
  },
  lng: detectLanguage(),
  fallbackLng: DEFAULT_LANG,
  interpolation: {
    escapeValue: false,
  },
});

// Persist language changes
i18n.on('languageChanged', (lng) => {
  localStorage.setItem('app_language', lng);
});

export default i18n;
