const axios = require('axios');
const sharp = require('sharp');

// ─── Google Cloud Vision — OCR de texto embutido em imagem (banners) ─────
// Mesmo espírito do DeepLService/ExchangeRateService: nunca lança. Sem
// chave configurada ou qualquer falha, retorna [] (nenhum bloco de texto
// encontrado) — o widget simplesmente não sobrepõe nada na imagem.

const VISION_URL = 'https://vision.googleapis.com/v1/images:annotate';

function isConfigured() {
  const key = process.env.GOOGLE_VISION_API_KEY || '';
  return key.length > 0 && !key.includes('CHANGE_ME');
}

// Concatena um bloco (paragraphs -> words -> symbols) em texto legível.
// A API não expõe um campo de texto plano por bloco, só a árvore de símbolos.
function blockToText(block) {
  const lines = (block.paragraphs || []).map((p) =>
    (p.words || [])
      .map((w) => (w.symbols || []).map((s) => s.text).join(''))
      .join(' ')
  );
  return lines.join('\n').trim();
}

// vertices podem omitir x/y quando o valor é 0 (comportamento do protobuf/JSON
// da API) — default explícito evita NaN silencioso no cálculo do retângulo.
function boundingRect(boundingBox) {
  const vertices = boundingBox?.vertices || boundingBox?.normalizedVertices || [];
  if (vertices.length === 0) return null;

  const xs = vertices.map((v) => v.x || 0);
  const ys = vertices.map((v) => v.y || 0);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  const width = Math.max(...xs) - x;
  const height = Math.max(...ys) - y;
  if (width <= 0 || height <= 0) return null;
  return { x, y, width, height };
}

// Amostra a cor média de uma faixa fina acima do bloco de texto — aproxima o
// fundo pra desenhar o retângulo de cobertura. Funciona bem em banner de cor
// sólida; em foto com fundo complexo o resultado fica visivelmente impreciso
// (limitação conhecida e aceita — ver CLAUDE.md).
async function sampleBackgroundColor(imageBuffer, rect, imageWidth, imageHeight) {
  try {
    const sampleHeight = Math.max(1, Math.min(10, rect.y));
    const sampleY = Math.max(0, rect.y - sampleHeight);
    const sampleWidth = Math.min(rect.width, imageWidth - rect.x);
    if (sampleWidth <= 0) return 'rgb(255,255,255)';

    // .toColourspace('srgb') força 3 canais (sem alpha) — sem isso, PNG com
    // canal alpha vem como RGBA (4 bytes/pixel) e o loop abaixo (passo 3)
    // desalinha a partir do 2º pixel, gerando NaN (confirmado em teste real).
    const { data, info } = await sharp(imageBuffer)
      .extract({ left: Math.round(rect.x), top: Math.round(sampleY), width: Math.round(sampleWidth), height: Math.round(sampleHeight) })
      .toColourspace('srgb')
      .raw()
      .toBuffer({ resolveWithObject: true });

    const channels = info.channels || 3;
    let r = 0, g = 0, b = 0;
    let pixelCount = 0;
    for (let i = 0; i + channels <= data.length; i += channels) {
      r += data[i];
      g += data[i + 1];
      b += data[i + 2];
      pixelCount += 1;
    }
    if (pixelCount === 0) return 'rgb(255,255,255)';
    return `rgb(${Math.round(r / pixelCount)},${Math.round(g / pixelCount)},${Math.round(b / pixelCount)})`;
  } catch (err) {
    return 'rgb(255,255,255)';
  }
}

const VisionService = {
  isConfigured,

  /**
   * Detecta blocos de texto numa imagem (por URL pública) via
   * DOCUMENT_TEXT_DETECTION. Retorna [{ text, rect: {x,y,width,height},
   * imageWidth, imageHeight, bgColor }] — rect em pixels da imagem ORIGINAL
   * (não normalizado; o chamador normaliza pelo imageWidth/imageHeight pra
   * escalar corretamente independente do tamanho exibido no navegador).
   *
   * IMPORTANTE: lança em erro real (rede, API, chave inválida) — não
   * silencia aqui. Motivo: o chamador (storefront.js) cacheia o resultado
   * (inclusive lista vazia = "sem texto") pra nunca reprocessar a mesma
   * imagem; se erro transitório fosse tratado igual a "sem texto", ficaria
   * cacheado como tal PARA SEMPRE (aconteceu de verdade num teste — ver
   * CLAUDE.md). "Sem texto encontrado" (resposta OK da API, 0 blocos) essa
   * sim retorna [] normalmente — só isso é seguro cachear como vazio. Sem
   * chave configurada também retorna [] (nunca deveria ter sido chamado,
   * mas não é um erro transitório — não faz sentido lançar).
   */
  async detectTextBlocks(imageUrl) {
    if (!isConfigured()) return [];

    // Baixa os bytes uma vez só e manda como `content` (base64) em vez de
    // `imageUri` — a Vision API recusa buscar algumas URLs por conta própria
    // ("We're not allowed to access the URL on your behalf", confirmado em
    // teste real com placehold.co) e isso também evita baixar a imagem 2x
    // (a mesma cópia serve pro OCR e pra amostragem de cor do sharp).
    const imageBuffer = await axios
      .get(imageUrl, { responseType: 'arraybuffer', timeout: 15000 })
      .then((r) => Buffer.from(r.data));

    const visionResponse = await axios.post(
      `${VISION_URL}?key=${process.env.GOOGLE_VISION_API_KEY}`,
      { requests: [{ image: { content: imageBuffer.toString('base64') }, features: [{ type: 'DOCUMENT_TEXT_DETECTION' }] }] },
      { timeout: 15000 }
    );

    // A API retorna 200 mesmo em erro por-imagem (erro fica dentro de
    // responses[0].error) — tratar como falha real, não "sem texto".
    const singleResponse = visionResponse.data?.responses?.[0];
    if (singleResponse?.error) {
      throw new Error(`Vision API: ${singleResponse.error.message || singleResponse.error.code}`);
    }

    const page = singleResponse?.fullTextAnnotation?.pages?.[0];
    if (!page || !Array.isArray(page.blocks) || page.blocks.length === 0) return [];

    const imageWidth = page.width;
    const imageHeight = page.height;

    const blocks = [];
    for (const block of page.blocks) {
      const text = blockToText(block);
      const rect = boundingRect(block.boundingBox);
      if (!text || !rect) continue;

      const bgColor = await sampleBackgroundColor(imageBuffer, rect, imageWidth, imageHeight);
      blocks.push({ text, rect, imageWidth, imageHeight, bgColor });
    }
    return blocks;
  },
};

module.exports = { VisionService };
