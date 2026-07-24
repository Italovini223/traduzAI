import React from 'react';

/**
 * Símbolo da marca Nuvempro (versão preto e branco).
 * viewBox 800x530 (proporção ~1.51). Decorativo por padrão (aria-hidden) —
 * usado ao lado de texto/label que já identifica o contexto.
 *
 * @param {number} height - altura em px (largura é calculada pela proporção)
 * @param {string} color  - cor do preenchimento (default: preto da marca)
 */
export default function BrandSymbol({ height = 24, color = '#141414' }) {
  const width = Math.round((height * 800) / 530);
  return (
    <svg
      width={width}
      height={height}
      viewBox="0 0 800 530"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      focusable="false"
      style={{ display: 'block', flexShrink: 0 }}
    >
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        fill={color}
        d="M642.47,259.15c16.45,21.65,26.26,48.61,26.26,77.9c0,71.22-57.73,128.95-128.95,128.95c-34.34,0-65.52-13.45-88.62-35.33l-22.66,22.66c28.92,27.67,68.1,44.72,111.28,44.72c88.92,0,161-72.08,161-161c0-38.14-13.31-73.15-35.48-100.73L642.47,259.15z"
      />
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        fill={color}
        d="M561,254.31l13.81,63.98c13.44-16.39,26.75-32.89,40.31-49.17c6.98-8.38,8.62-13.93,7.43-24l-2.07-15.79c51.11-37.16,89.14-119.87,88.26-145.35c-25.48-0.88-108.19,37.15-145.35,88.26l-15.79-2.07c-10.07-1.18-15.61,0.45-24,7.43c-16.28,13.57-32.78,26.87-49.17,40.31l63.82,13.78L341.12,428.83c-23.23,22.68-54.98,36.68-90.03,36.68c-71.22,0-128.95-57.73-128.95-128.95s57.73-128.95,128.95-128.95c33.7,0,64.34,12.95,87.31,34.12l22.67-22.67c-25.01-23.45-57.51-38.98-93.53-42.64c8.02-63.51,62.19-112.65,127.89-112.65c56.51,0,104.49,36.36,121.9,86.95l24.63-24.63c-25.34-55.64-81.38-94.37-146.53-94.37c-83.39,0-151.94,63.41-160.15,144.64c-81.5,7.94-145.19,76.64-145.19,160.22c0,88.92,72.08,161,161,161c43.77,0,83.46-17.49,112.47-45.84l0.01,0.01l0.3-0.3c0.04-0.04,0.1-0.09,0.14-0.14l0,0L561,254.31z M593.72,168.69c5.86-10.88,19.43-14.95,30.31-9.09c10.88,5.86,14.95,19.43,9.09,30.31c-5.86,10.88-19.43,14.95-30.31,9.09C591.93,193.15,587.87,179.57,593.72,168.69z"
      />
    </svg>
  );
}
