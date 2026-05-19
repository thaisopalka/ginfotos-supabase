import {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  Header,
  ImageRun,
  Packer,
  PageBreak,
  PageNumber,
  PageOrientation,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  VerticalAlign,
  WidthType
} from 'docx';
import { LOGO_PREFEITURA_RIO } from '../assets/logoPrefeituraRio';

export interface WordReportPhoto {
  name: string;
  caption: string;
  dataUrl?: string;
}

export interface WordReportVisit {
  data: string;
  designacao: string;
  unidade: string;
  endereco: string;
  bairro: string;
  diretorGeral: string;
  representante: string;
  servicos: string;
  observacoes: string;
  conclusao: string;
  fotos: WordReportPhoto[];
}

const BLUE = '1F5795';
const LIGHT_BLUE = 'E8F0FA';
const BORDER = '111827';
const SOFT_BORDER = '8EA8C7';
const FONT = 'Calibri';
const PHOTO_FRAME_WIDTH = 1280;
const PHOTO_FRAME_HEIGHT = 890;
const PHOTO_WORD_WIDTH = 345;
const PHOTO_WORD_HEIGHT = 240;

function clean(value?: string | null) {
  return value && value.trim() ? value.trim() : 'Não informado';
}

function formatDate(value?: string | null) {
  if (!value) return 'Não informado';
  const [year, month, day] = value.slice(0, 10).split('-');
  if (!year || !month || !day) return value;
  return `${day}/${month}/${year}`;
}

function fixText(value: string) {
  return clean(value)
    .replace(/\bVISTORIA TECNICA\b/gi, 'VISTORIA TÉCNICA')
    .replace(/\bSERVICOS\b/gi, 'SERVIÇOS')
    .replace(/\bOBSERVACOES\b/gi, 'OBSERVAÇÕES')
    .replace(/\bCONCLUSAO\b/gi, 'CONCLUSÃO')
    .replace(/ENGA\.\s*MARCIA\s*BRAGA/gi, 'Engenheira Márcia Braga');
}

function dataUrlToUint8Array(dataUrl: string) {
  const base64 = dataUrl.split(',')[1] || '';
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

function text(value: string, options: { bold?: boolean; size?: number; color?: string } = {}) {
  return new TextRun({ text: value, font: FONT, bold: options.bold, size: options.size ?? 22, color: options.color ?? '111827' });
}

const noBorders = {
  top: { style: BorderStyle.NONE },
  bottom: { style: BorderStyle.NONE },
  left: { style: BorderStyle.NONE },
  right: { style: BorderStyle.NONE },
  insideHorizontal: { style: BorderStyle.NONE },
  insideVertical: { style: BorderStyle.NONE }
};

const tableBorders = {
  top: { style: BorderStyle.SINGLE, color: BORDER, size: 8 },
  bottom: { style: BorderStyle.SINGLE, color: BORDER, size: 8 },
  left: { style: BorderStyle.SINGLE, color: BORDER, size: 8 },
  right: { style: BorderStyle.SINGLE, color: BORDER, size: 8 },
  insideHorizontal: { style: BorderStyle.SINGLE, color: BORDER, size: 8 },
  insideVertical: { style: BorderStyle.SINGLE, color: BORDER, size: 8 }
};

function heading(value: string) {
  return new Paragraph({
    spacing: { before: 170, after: 65 },
    children: [text(value, { bold: true, size: 25, color: BLUE })],
    border: { bottom: { style: BorderStyle.SINGLE, color: SOFT_BORDER, size: 8 } }
  });
}

function paragraph(value: string) {
  return new Paragraph({ spacing: { after: 60 }, children: [text(fixText(value), { size: 22 })] });
}

function infoRow(label: string, value: string) {
  return new TableRow({ children: [
    new TableCell({ width: { size: 31, type: WidthType.PERCENTAGE }, shading: { type: ShadingType.CLEAR, fill: LIGHT_BLUE }, margins: { top: 125, bottom: 125, left: 135, right: 135 }, children: [new Paragraph({ children: [text(label, { bold: true, size: 22, color: '10243F' })] })] }),
    new TableCell({ width: { size: 69, type: WidthType.PERCENTAGE }, margins: { top: 125, bottom: 125, left: 155, right: 155 }, children: [new Paragraph({ children: [text(fixText(value), { size: 22 })] })] })
  ] });
}

function logoCellParagraph() {
  if (!LOGO_PREFEITURA_RIO) {
    return new Paragraph({ alignment: AlignmentType.LEFT, children: [text('PREFEITURA RIO | Educação', { bold: true, size: 20, color: BLUE })] });
  }

  return new Paragraph({
    alignment: AlignmentType.LEFT,
    children: [new ImageRun({
      data: dataUrlToUint8Array(LOGO_PREFEITURA_RIO),
      transformation: { width: 190, height: 60 },
      type: 'png'
    })]
  });
}

function pageHeader() {
  return new Header({ children: [
    new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, borders: noBorders, rows: [
      new TableRow({ children: [
        new TableCell({ width: { size: 34, type: WidthType.PERCENTAGE }, verticalAlign: VerticalAlign.CENTER, margins: { top: 55, bottom: 55, left: 70, right: 120 }, children: [logoCellParagraph()] }),
        new TableCell({ width: { size: 66, type: WidthType.PERCENTAGE }, verticalAlign: VerticalAlign.CENTER, margins: { top: 55, bottom: 55, left: 140, right: 70 }, children: [
          new Paragraph({ alignment: AlignmentType.CENTER, children: [text('SECRETARIA MUNICIPAL DE EDUCAÇÃO', { bold: true, size: 20, color: '111827' })] }),
          new Paragraph({ alignment: AlignmentType.CENTER, children: [text('6ª COORDENADORIA REGIONAL DE EDUCAÇÃO', { bold: true, size: 20, color: '111827' })] }),
          new Paragraph({ alignment: AlignmentType.CENTER, children: [text('E/6ª CRE/GIN', { bold: true, size: 20, color: '111827' })] })
        ] })
      ] })
    ] })
  ] });
}

function pageFooter() {
  return new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [text('Página ', { size: 18, color: '64748B' }), new TextRun({ children: [PageNumber.CURRENT], font: FONT, size: 18, color: '64748B' }), text(' de ', { size: 18, color: '64748B' }), new TextRun({ children: [PageNumber.TOTAL_PAGES], font: FONT, size: 18, color: '64748B' })] })] });
}

async function makeStandardPhotoDataUrl(dataUrl: string) {
  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Imagem inválida'));
    img.src = dataUrl;
  });

  const canvas = document.createElement('canvas');
  canvas.width = PHOTO_FRAME_WIDTH;
  canvas.height = PHOTO_FRAME_HEIGHT;
  const context = canvas.getContext('2d');
  if (!context) return dataUrl;

  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, PHOTO_FRAME_WIDTH, PHOTO_FRAME_HEIGHT);

  const scale = Math.min(PHOTO_FRAME_WIDTH / image.width, PHOTO_FRAME_HEIGHT / image.height);
  const width = Math.round(image.width * scale);
  const height = Math.round(image.height * scale);
  const x = Math.round((PHOTO_FRAME_WIDTH - width) / 2);
  const y = Math.round((PHOTO_FRAME_HEIGHT - height) / 2);
  context.drawImage(image, x, y, width, height);
  return canvas.toDataURL('image/jpeg', 0.9);
}

async function photoCell(photo?: WordReportPhoto) {
  const children: Paragraph[] = [];

  if (photo?.dataUrl) {
    try {
      const standardized = await makeStandardPhotoDataUrl(photo.dataUrl);
      children.push(new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [new ImageRun({ data: dataUrlToUint8Array(standardized), transformation: { width: PHOTO_WORD_WIDTH, height: PHOTO_WORD_HEIGHT }, type: 'jpg' })]
      }));
    } catch {
      children.push(new Paragraph({ alignment: AlignmentType.CENTER, children: [text('Imagem não carregada', { color: '64748B' })] }));
    }
  } else {
    children.push(new Paragraph({ alignment: AlignmentType.CENTER, children: [text('Imagem não incorporada', { color: '64748B' })] }));
  }

  children.push(new Paragraph({ spacing: { before: 55 }, alignment: AlignmentType.LEFT, children: [text(clean(photo?.caption || 'Sem legenda.'), { bold: true, size: 20 })] }));

  return new TableCell({
    width: { size: 50, type: WidthType.PERCENTAGE },
    verticalAlign: VerticalAlign.TOP,
    margins: { top: 70, bottom: 70, left: 70, right: 70 },
    children
  });
}

async function photoPairTable(left?: WordReportPhoto, right?: WordReportPhoto) {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: tableBorders,
    rows: [new TableRow({ cantSplit: true, children: [await photoCell(left), await photoCell(right)] })]
  });
}

async function photoSectionElements(fotos: WordReportPhoto[]) {
  const chunks: WordReportPhoto[][] = [];
  for (let index = 0; index < fotos.length; index += 4) chunks.push(fotos.slice(index, index + 4));
  if (chunks.length === 0) chunks.push([]);

  const elements: Array<Paragraph | Table> = [];
  for (let chunkIndex = 0; chunkIndex < chunks.length; chunkIndex += 1) {
    const chunk = chunks[chunkIndex];
    if (chunkIndex > 0) elements.push(new Paragraph({ children: [new PageBreak()] }));

    elements.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 105 }, children: [text('REGISTRO FOTOGRÁFICO', { bold: true, size: 28, color: BLUE })] }));
    elements.push(await photoPairTable(chunk[0], chunk[1]));

    if (chunk.length > 2) {
      elements.push(new Paragraph({ spacing: { after: 260 }, children: [text('', { size: 2 })] }));
      elements.push(await photoPairTable(chunk[2], chunk[3]));
    }
  }
  return elements;
}

export async function downloadWordReport(visit: WordReportVisit) {
  const infoTable = new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: [
    infoRow('Data', formatDate(visit.data)),
    infoRow('Designação + Unidade Escolar', `${clean(visit.designacao)} - ${clean(visit.unidade)}`),
    infoRow('Endereço + Bairro', `${clean(visit.endereco)} - ${clean(visit.bairro)}`),
    infoRow('Diretor(a) Geral', clean(visit.diretorGeral)),
    infoRow('Representante E/GIN/6ª CRE', 'Engenheira Márcia Braga.')
  ] });

  const doc = new Document({ sections: [{
    properties: { page: { size: { orientation: PageOrientation.PORTRAIT, width: 11906, height: 16838 }, margin: { top: 700, right: 500, bottom: 730, left: 500 } } },
    headers: { default: pageHeader() },
    footers: { default: pageFooter() },
    children: [
      new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 110, after: 225 }, children: [text('RELATÓRIO DE VISITA TÉCNICA', { bold: true, size: 34, color: BLUE })] }),
      infoTable,
      heading('Serviços Verificados'), paragraph(visit.servicos), heading('Observações'), paragraph(visit.observacoes), heading('Conclusão'), paragraph(visit.conclusao),
      new Paragraph({ children: [new PageBreak()] }),
      ...(await photoSectionElements(visit.fotos))
    ]
  }] });

  const blob = await Packer.toBlob(doc);
  const url = URL.createObjectURL(blob);
  const fileName = `RELATORIO_${clean(visit.designacao)}_${formatDate(visit.data).replace(/\//g, '-')}.docx`.replace(/[^a-zA-Z0-9_.-]/g, '_');
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
