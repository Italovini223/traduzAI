import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ComposableMap, Geographies, Geography } from 'react-simple-maps';
import { Box, Text } from '@nimbus-ds/components';
import worldTopo from 'world-atlas/countries-110m.json';
import { NUMERIC_TO_ALPHA2 } from '../lib/countryNumericCodes.js';

const COLOR_NO_DATA = '#e5e7eb';
const COLOR_MIN = '#bfdbfe';
const COLOR_MAX = '#1d4ed8';

function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function rgbToHex(rgb) {
  return '#' + rgb.map((c) => Math.round(c).toString(16).padStart(2, '0')).join('');
}

function interpolateColor(t) {
  const a = hexToRgb(COLOR_MIN);
  const b = hexToRgb(COLOR_MAX);
  return rgbToHex(a.map((v, i) => v + (b[i] - v) * t));
}

// Mapa de calor de vendas por pais — mesmo padrao visual do CountryMapSelector
// (react-simple-maps + world-atlas + NUMERIC_TO_ALPHA2), mas colorindo pela
// intensidade de `metric` (quantidade de vendas ou faturamento) em vez de
// habilitado/desabilitado.
export default function SalesMap({ byCountry, metric, formatValue, countryLabels }) {
  const { t } = useTranslation();
  const [hovered, setHovered] = useState(null);

  const dataByCountry = useMemo(() => new Map(byCountry.map((c) => [c.country, c])), [byCountry]);
  const maxValue = useMemo(
    () => byCountry.reduce((max, c) => Math.max(max, c[metric] || 0), 0),
    [byCountry, metric]
  );

  const fillFor = (code) => {
    const entry = code && dataByCountry.get(code);
    if (!entry || !entry[metric] || maxValue === 0) return COLOR_NO_DATA;
    return interpolateColor(entry[metric] / maxValue);
  };

  return (
    <Box display="flex" flexDirection="column" gap="2">
      <Box style={{ border: '1px solid #e5e7eb', borderRadius: '8px', overflow: 'hidden' }}>
        <ComposableMap projectionConfig={{ scale: 140 }} width={800} height={420} style={{ width: '100%', height: 'auto' }}>
          <Geographies geography={worldTopo}>
            {({ geographies }) =>
              geographies.map((geo) => {
                const alpha2 = NUMERIC_TO_ALPHA2[Number(geo.id)] || null;
                const entry = alpha2 ? dataByCountry.get(alpha2) : null;
                const fill = fillFor(alpha2);
                const label = (alpha2 && countryLabels?.[alpha2]) || geo.properties.name;
                return (
                  <Geography
                    key={geo.rsmKey}
                    geography={geo}
                    onMouseEnter={() => setHovered(entry ? { label, ...entry } : { label, salesCount: 0, revenue: 0 })}
                    onMouseLeave={() => setHovered(null)}
                    style={{
                      default: { fill, stroke: '#ffffff', strokeWidth: 0.5, outline: 'none' },
                      hover: { fill, stroke: '#ffffff', strokeWidth: 0.5, outline: 'none' },
                      pressed: { fill, outline: 'none' },
                    }}
                  />
                );
              })
            }
          </Geographies>
        </ComposableMap>
      </Box>

      {hovered ? (
        <Text fontSize="caption" color="neutral-textLow">
          {hovered.label}: {hovered.salesCount} {t('dashboard.salesMap.salesUnit')} — {formatValue(hovered.revenue || 0)}
        </Text>
      ) : (
        <Text fontSize="caption" color="neutral-textDisabled">{t('dashboard.salesMap.hoverHint')}</Text>
      )}
    </Box>
  );
}
