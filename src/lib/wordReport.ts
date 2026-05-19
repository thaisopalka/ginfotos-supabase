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
const BORDER = '8EA8C7';
const FONT = 'Calibri';

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

function getImageType(dataUrl: string): 'jpg' | 'png' | 'gif' | 'bmp' {
  if (dataUrl.includes('image/png')) return 'png';
  if (dataUrl.includes('image/gif')) return 'gif';
  if (dataUrl.includes('image/bmp')) return 'bmp';
  return 'jpg';
}

async function getFittedImageSize(dataUrl: string, maxWidth = 350, maxHeight = 270) {
  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Imagem inválida'));
    img.src = dataUrl;
  });
  const scale = Math.min(maxWidth / image.width, maxHeight / image.height);
  return { width: Math.max(1, Math.round(image.width * scale)), height: Math.max(1, Math.round(image.height * scale)) };
}

function text(value: string, options: { bold?: boolean; size?: number; color?: string } = {}) {
  return new TextRun({ text: value, font: FONT, bold: options.bold, size: options.size ?? 22, color: options.color ?? '111827' });
}

const noBorders = {
  top: { style: BorderStyle.NONE }, bottom: { style: BorderStyle.NONE }, left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE }, insideHorizontal: { style: BorderStyle.NONE }, insideVertical: { style: BorderStyle.NONE }
};

function heading(value: string) {
  return new Paragraph({
    spacing: { before: 170, after: 65 },
    children: [text(value, { bold: true, size: 25, color: BLUE })],
    border: { bottom: { style: BorderStyle.SINGLE, color: BORDER, size: 8 } }
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

function pageHeader() {
  return new Header({ children: [
    new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, borders: noBorders, rows: [
      new TableRow({ children: [
        new TableCell({ width: { size: 34, type: WidthType.PERCENTAGE }, shading: { type: ShadingType.CLEAR, fill: BLUE }, verticalAlign: VerticalAlign.CENTER, margins: { top: 80, bottom: 80, left: 120, right: 120 }, children: [
          new Paragraph({ alignment: AlignmentType.LEFT, children: [text('P R E F E I T U R A', { bold: true, size: 15, color: 'FFFFFF' })] }),
          new Paragraph({ alignment: AlignmentType.LEFT, children: [text('RIO', { bold: true, size: 35, color: 'FFFFFF' }), text('  Educação', { size: 18, color: 'FFFFFF' })] })
        ] }),
        new TableCell({ width: { size: 66, type: WidthType.PERCENTAGE }, verticalAlign: VerticalAlign.CENTER, margins: { top: 80, bottom: 80, left: 140, right: 80 }, children: [
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

async function photoCell(photo?: WordReportPhoto) {
  const children: Paragraph[] = [];
  if (photo?.dataUrl) {
    try {
      const size = await getFittedImageSize(photo.dataUrl);
      children.push(new Paragraph({ alignment: AlignmentType.CENTER, children: [new ImageRun({ data: dataUrlToUint8Array(photo.dataUrl), transformation: size, type: getImageType(photo.dataUrl) })] }));
    } catch { children.push(new Paragraph({ alignment: AlignmentType.CENTER, children: [text('Imagem não carregada', { color: '64748B' })] })); }
  } else {
    children.push(new Paragraph({ alignment: AlignmentType.CENTER, children: [text('Imagem não incorporada', { color: '64748B' })] }));
  }
  children.push(new Paragraph({ spacing: { before: 50 }, alignment: AlignmentType.LEFT, children: [text(clean(photo?.caption || 'Sem legenda.'), { size: 20 })] }));
  return new TableCell({ width: { size: 50, type: WidthType.PERCENTAGE }, verticalAlign: VerticalAlign.TOP, margins: { top: 65, bottom: 65, left: 65, right: 65 }, children });
}

async function photoRows(fotos: WordReportPhoto[]) {
  if (fotos.length === 0) return [new TableRow({ children: [new TableCell({ columnSpan: 2, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [text('Nenhuma foto incorporada neste relatório.', { color: '64748B' })] })] })] })];
  const rows: TableRow[] = [];
  for (let index = 0; index < fotos.length; index += 2) rows.push(new TableRow({ cantSplit: true, children: [await photoCell(fotos[index]), await photoCell(fotos[index + 1])] }));
  return rows;
}

async function photoSectionElements(fotos: WordReportPhoto[]) {
  const chunks: WordReportPhoto[][] = [];
  for (let index = 0; index < fotos.length; index += 4) chunks.push(fotos.slice(index, index + 4));
  if (chunks.length === 0) chunks.push([]);
  const elements: Array<Paragraph | Table> = [];
  for (let chunkIndex = 0; chunkIndex < chunks.length; chunkIndex += 1) {
    if (chunkIndex > 0) elements.push(new Paragraph({ children: [new PageBreak()] }));
    elements.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 70 }, children: [text('REGISTRO FOTOGRÁFICO', { bold: true, size: 28, color: BLUE })] }));
    elements.push(new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: await photoRows(chunks[chunkIndex]) }));
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
  const doc = new Document({ sections: [{ properties: { page: { size: { orientation: PageOrientation.PORTRAIT, width: 11906, height: 16838 }, margin: { top: 760, right: 560, bottom: 780, left: 560 } } }, headers: { default: pageHeader() }, footers: { default: pageFooter() }, children: [
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 120, after: 230 }, children: [text('RELATÓRIO DE VISITA TÉCNICA', { bold: true, size: 34, color: BLUE })] }),
    infoTable,
    heading('Serviços Verificados'), paragraph(visit.servicos), heading('Observações'), paragraph(visit.observacoes), heading('Conclusão'), paragraph(visit.conclusao), new Paragraph({ children: [new PageBreak()] }), ...(await photoSectionElements(visit.fotos))
  ] }] });
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
