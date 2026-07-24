import { ptBR } from 'date-fns/locale/pt-BR';
import { es } from 'date-fns/locale/es';

const localeMap = {
  'pt-BR': ptBR,
  'es-AR': es,
  'es-MX': es,
};

export function getDateFnsLocale(lang) {
  return localeMap[lang] || ptBR;
}
