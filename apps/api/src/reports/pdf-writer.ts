/**
 * Penulis PDF minimal tanpa dependency: teks berbungkus dengan font standar
 * Helvetica (WinAnsi), pindah halaman otomatis, garis pemisah, dan tautan
 * yang bisa diklik. Cukup untuk dokumen laporan; tidak untuk gambar atau
 * tabel. Karakter di luar WinAnsi diganti padanan ASCII atau `?`.
 */

const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const MARGIN = 50;
const FOOTER_SPACE = 36;

/** Lebar glyph Helvetica (AFM, per 1000 unit) untuk ASCII 32–126. */
const HELVETICA_WIDTHS = [
  278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556, 1015, 667,
  667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556, 333, 556, 556, 500,
  556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556, 556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584,
];
/** Helvetica-Bold sedikit lebih lebar; dipakai faktor aman supaya teks tidak keluar margin. */
const BOLD_FACTOR = 1.1;

/** Karakter Unicode yang punya tempat di WinAnsi (selain Latin-1), atau padanan ASCII-nya. */
const WIN_ANSI: Record<string, number | string> = {
  '€': 0x80,
  '‚': 0x82,
  '„': 0x84,
  '…': 0x85,
  '‘': 0x91,
  '’': 0x92,
  '“': 0x93,
  '”': 0x94,
  '•': 0x95,
  '–': 0x96,
  '—': 0x97,
  '™': 0x99,
  '→': '->',
  '←': '<-',
  '≥': '>=',
  '≤': '<=',
};

/** Ubah teks ke byte WinAnsi; karakter yang tidak ada diganti. */
export function toWinAnsi(text: string): number[] {
  const bytes: number[] = [];
  for (const char of text.normalize('NFC')) {
    const code = char.codePointAt(0)!;
    const mapped = WIN_ANSI[char];
    if (typeof mapped === 'number') bytes.push(mapped);
    else if (typeof mapped === 'string') bytes.push(...[...mapped].map((item) => item.charCodeAt(0)));
    else if (code === 0x09) bytes.push(0x20);
    else if ((code >= 0x20 && code <= 0x7e) || (code >= 0xa0 && code <= 0xff)) bytes.push(code);
    else bytes.push(0x3f);
  }
  return bytes;
}

function glyphWidth(byte: number): number {
  return byte >= 32 && byte <= 126 ? HELVETICA_WIDTHS[byte - 32] : 556;
}

export function textWidth(text: string, size: number, bold = false): number {
  const units = toWinAnsi(text).reduce((sum, byte) => sum + glyphWidth(byte), 0);
  return (units / 1000) * size * (bold ? BOLD_FACTOR : 1);
}

/** Bungkus teks agar muat lebar tertentu; kata yang terlalu panjang (mis. hash) dipotong per karakter. */
export function wrapText(text: string, width: number, size: number, bold = false): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split(/\r?\n/)) {
    let line = '';
    for (const word of paragraph.split(/\s+/).filter((item) => item !== '')) {
      const candidate = line === '' ? word : `${line} ${word}`;
      if (textWidth(candidate, size, bold) <= width) {
        line = candidate;
        continue;
      }
      if (line !== '') lines.push(line);
      line = '';
      let rest = word;
      while (textWidth(rest, size, bold) > width) {
        let cut = rest.length - 1;
        while (cut > 1 && textWidth(rest.slice(0, cut), size, bold) > width) cut -= 1;
        lines.push(rest.slice(0, cut));
        rest = rest.slice(cut);
      }
      line = rest;
    }
    lines.push(line);
  }
  return lines;
}

function pdfString(text: string): string {
  return `(${toWinAnsi(text)
    .map((byte) => {
      if (byte === 0x28 || byte === 0x29 || byte === 0x5c) return `\\${String.fromCharCode(byte)}`;
      if (byte < 0x20 || byte > 0x7e) return `\\${byte.toString(8).padStart(3, '0')}`;
      return String.fromCharCode(byte);
    })
    .join('')})`;
}

interface Page {
  ops: string[];
  links: Array<{ rect: [number, number, number, number]; url: string }>;
}

export interface TextOptions {
  size?: number;
  bold?: boolean;
  /** Abu-abu 0 (hitam) – 1 (putih). */
  gray?: number;
  indent?: number;
  /** Jarak setelah blok teks. */
  after?: number;
  /** Seluruh teks menjadi tautan ke URL ini. */
  link?: string | null;
}

export class PdfDocument {
  private readonly pages: Page[] = [];
  private y = 0;

  constructor(private readonly footer: string) {
    this.addPage();
  }

  get contentWidth(): number {
    return PAGE_WIDTH - MARGIN * 2;
  }

  private addPage(): void {
    this.pages.push({ ops: [], links: [] });
    this.y = PAGE_HEIGHT - MARGIN;
  }

  private ensure(height: number): void {
    if (this.y - height < MARGIN + FOOTER_SPACE) this.addPage();
  }

  /** Tulis teks berbungkus. */
  text(value: string, options: TextOptions = {}): void {
    const size = options.size ?? 10;
    const bold = options.bold ?? false;
    const indent = options.indent ?? 0;
    const leading = size * 1.35;
    const page = () => this.pages[this.pages.length - 1];
    for (const line of wrapText(value, this.contentWidth - indent, size, bold)) {
      this.ensure(leading);
      this.y -= leading;
      const x = MARGIN + indent;
      const gray = options.gray ?? 0;
      page().ops.push(`BT /${bold ? 'F2' : 'F1'} ${size} Tf ${gray} g ${x.toFixed(2)} ${this.y.toFixed(2)} Td ${pdfString(line)} Tj ET`);
      if (options.link && line !== '') {
        page().links.push({ rect: [x, this.y - size * 0.25, x + textWidth(line, size, bold), this.y + size * 0.9], url: options.link });
      }
    }
    this.y -= options.after ?? 0;
  }

  /** Pindah halaman bila sisa ruang kurang dari `height`, supaya judul tidak terpisah dari isinya. */
  keep(height: number): void {
    this.ensure(height);
  }

  space(height: number): void {
    this.y -= height;
  }

  rule(): void {
    this.ensure(10);
    this.y -= 6;
    this.pages[this.pages.length - 1].ops.push(`0.8 G 0.5 w ${MARGIN} ${this.y.toFixed(2)} m ${(PAGE_WIDTH - MARGIN).toFixed(2)} ${this.y.toFixed(2)} l S`);
    this.y -= 6;
  }

  /** Susun berkas PDF lengkap. */
  toBuffer(info: { title: string; createdAt: Date }): Buffer {
    const objects: string[] = [];
    const add = (body: string) => objects.push(body) - 1;
    const catalog = add('');
    const pagesRef = add('');
    const regular = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
    const bold = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');
    const total = this.pages.length;
    const pageRefs = this.pages.map((page, index) => {
      const footer = `BT /F1 8 Tf 0.45 g ${MARGIN} ${(MARGIN - 4).toFixed(2)} Td ${pdfString(`${this.footer} Halaman ${index + 1}/${total}.`)} Tj ET`;
      const stream = [...page.ops, footer].join('\n');
      const content = add(`<< /Length ${Buffer.byteLength(stream, 'latin1')} >>\nstream\n${stream}\nendstream`);
      const annots = page.links.map((link) =>
        add(`<< /Type /Annot /Subtype /Link /Rect [${link.rect.map((item) => item.toFixed(2)).join(' ')}] /Border [0 0 0] /A << /S /URI /URI ${pdfString(link.url)} >> >>`),
      );
      return add(
        `<< /Type /Page /Parent ${pagesRef + 1} 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] /Resources << /Font << /F1 ${regular + 1} 0 R /F2 ${bold + 1} 0 R >> >> /Contents ${content + 1} 0 R${
          annots.length > 0 ? ` /Annots [${annots.map((ref) => `${ref + 1} 0 R`).join(' ')}]` : ''
        } >>`,
      );
    });
    objects[catalog] = `<< /Type /Catalog /Pages ${pagesRef + 1} 0 R >>`;
    objects[pagesRef] = `<< /Type /Pages /Kids [${pageRefs.map((ref) => `${ref + 1} 0 R`).join(' ')}] /Count ${total} >>`;
    const stamp = info.createdAt.toISOString().replace(/[-:T]/g, '').slice(0, 14);
    const infoRef = add(`<< /Title ${pdfString(info.title)} /Producer (OpenChain Intelligence) /CreationDate (D:${stamp}Z) >>`);

    let output = '%PDF-1.4\n%\xe2\xe3\xcf\xd3\n';
    const offsets: number[] = [];
    objects.forEach((body, index) => {
      offsets.push(Buffer.byteLength(output, 'latin1'));
      output += `${index + 1} 0 obj\n${body}\nendobj\n`;
    });
    const xref = Buffer.byteLength(output, 'latin1');
    output += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`).join('')}`;
    output += `trailer\n<< /Size ${objects.length + 1} /Root ${catalog + 1} 0 R /Info ${infoRef + 1} 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
    return Buffer.from(output, 'latin1');
  }
}
