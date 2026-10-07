import { AlignmentType, Document, Footer, HeadingLevel, Packer, Paragraph, Table, TableCell, TableRow, TextRun, WidthType } from 'docx';
import { GENERATOR, normalizeZip, provenance } from './shared.mjs';

const tableOf = ({ columns, rows }) => new Table({
  width: { size: 100, type: WidthType.PERCENTAGE },
  rows: [
    new TableRow({ tableHeader: true, children: columns.map((column) => new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: column, bold: true })] })] })) }),
    ...rows.map((row) => new TableRow({ children: row.map((value) => new TableCell({ children: [new Paragraph(value ?? '')] })) })),
  ],
});

export async function buildDocx(artifact, meta) {
  const children = [new Paragraph({ text: artifact.title, heading: HeadingLevel.TITLE })];
  if (artifact.subtitle) children.push(new Paragraph({ children: [new TextRun({ text: artifact.subtitle, italics: true, size: 28 })] }));
  for (const section of artifact.sections) {
    if (section.heading) children.push(new Paragraph({ text: section.heading, heading: HeadingLevel.HEADING_1 }));
    for (const paragraph of section.paragraphs) children.push(new Paragraph(paragraph));
    for (const bullet of section.bullets) children.push(new Paragraph({ text: bullet, bullet: { level: 0 } }));
    // An empty paragraph after a table keeps Word from merging it with the next one.
    if (section.table) children.push(tableOf(section.table), new Paragraph(''));
  }
  if (meta.notes.length) {
    children.push(new Paragraph({ text: 'Generation notes', heading: HeadingLevel.HEADING_2 }));
    for (const note of meta.notes) children.push(new Paragraph({ text: note, bullet: { level: 0 } }));
  }
  const document = new Document({
    creator: GENERATOR, lastModifiedBy: GENERATOR, title: artifact.title, description: `Generated from ${meta.source} with ${meta.model}.`,
    styles: { default: { document: { run: { font: 'Calibri', size: 22 } } } },
    sections: [{
      footers: { default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: provenance(meta), size: 16, color: '666666' })] })] }) },
      children,
    }],
  });
  return { bytes: normalizeZip(await Packer.toBuffer(document), meta.createdAt), notes: [], pages: null };
}
