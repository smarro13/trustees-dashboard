/**
 * Minutes Generator Utilities
 * Handles action parsing, matter summarization, and document generation
 */

export type Action = {
  id: string;
  what: string;
  owner?: string;
  byWhen?: string;
  priority: 'high' | 'medium' | 'low';
  source: string;
};

export type MatterItem = {
  id: string;
  text: string;
  isAction: boolean;
};

export type MatterGroup = {
  heading: string;
  items: MatterItem[];
};

const PRIORITY_KEYWORDS = {
  high: ['urgent', 'critical', 'asap', 'immediate', 'emergency', 'risk', 'escalate', 'deadline'],
  medium: ['important', 'soon', 'before', 'next meeting', 'end of month', 'this month'],
};

const CATEGORY_SUGGESTIONS: Record<string, string[]> = {
  'Facilities': ['gym', 'treadmill', 'facility', 'maintenance', 'repair', 'building', 'premises'],
  'Communications': ['email', 'notify', 'announce', 'message', 'social', 'website', 'post'],
  'Finance': ['budget', 'cost', 'expense', 'payment', 'invoice', 'treasurer', 'financial'],
  'Governance': ['policy', 'procedures', 'governance', 'rules', 'compliance'],
  'Club Social': ['event', 'social', 'gathering', 'summer', 'party', 'celebration', 'dinner'],
  'Membership': ['member', 'renewal', 'signup', 'recruitment', 'retention'],
  'Rugby': ['rugby', 'team', 'fixtures', 'training', 'coaching', 'junior', 'senior'],
  'Commercial': ['sponsorship', 'partnership', 'revenue', 'business', 'commercial'],
};

/**
 * Detect priority level from text
 */
export const detectPriority = (text: string): 'high' | 'medium' | 'low' => {
  const lowerText = text.toLowerCase();
  const highKeywordMatch = PRIORITY_KEYWORDS.high.some(kw => lowerText.includes(kw));
  if (highKeywordMatch) return 'high';
  
  const mediumKeywordMatch = PRIORITY_KEYWORDS.medium.some(kw => lowerText.includes(kw));
  if (mediumKeywordMatch) return 'medium';
  
  return 'low';
};

/**
 * Parse action text to extract structured fields
 * Tries to identify: What, Who, By When
 * Example: "John to review treasury report by end of month"
 * → What: "Review treasury report", Owner: "John", By: "End of month"
 */
export const parseAction = (text: string, source: string): Action => {
  const cleaned = text.replace(/^[-\s]+/, '').trim();
  
  // Try to extract owner (patterns like "John to...", "Owner: John", "[John]")
  let owner: string | undefined;
  const ownerPatterns = [
    /^(\w+)\s+(?:to|will|must|should)/i,
    /(?:owner|assigned to|responsible):\s*(\w+)/i,
    /\[([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\]/,
  ];
  
  for (const pattern of ownerPatterns) {
    const match = cleaned.match(pattern);
    if (match && match[1]) {
      owner = match[1];
      break;
    }
  }
  
  // Try to extract deadline (patterns like "by X", "before X", "end of X")
  let byWhen: string | undefined;
  const datePatterns = [
    /(?:by|before|until)\s+([^.,]+?)(?:[.,]|$)/i,
    /(?:end of|by end of|EOD|deadline:?)\s+([^.,]+?)(?:[.,]|$)/i,
    /\b(next\s+\w+|in\s+\d+\s+days?|this\s+\w+)\b/i,
  ];
  
  for (const pattern of datePatterns) {
    const match = cleaned.match(pattern);
    if (match && match[1]) {
      byWhen = match[1].trim();
      break;
    }
  }
  
  // Extract "what" - remove owner and date info
  let what = cleaned
    .replace(/^(\w+)\s+(?:to|will|must)\s+/i, '')
    .replace(/(?:by|before|until)\s+[^.,]+/i, '')
    .replace(/\[.*?\]/g, '')
    .trim();
  
  if (what.length > 150) {
    what = what.substring(0, 147) + '...';
  }
  
  return {
    id: `action-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    what,
    owner,
    byWhen,
    priority: detectPriority(text),
    source,
  };
};

/**
 * Suggest category for a matter arising based on keywords
 */
export const suggestCategory = (text: string): string => {
  const lowerText = text.toLowerCase();
  
  for (const [category, keywords] of Object.entries(CATEGORY_SUGGESTIONS)) {
    const matchCount = keywords.filter(kw => lowerText.includes(kw.toLowerCase())).length;
    if (matchCount > 0) {
      return category;
    }
  }
  
  return 'Other Matters';
};

/**
 * Summarize text by extracting key points
 * Removes redundancy and keeps to 1-2 lines
 */
export const summarizeText = (text: string, maxLength: number = 120): string => {
  const cleaned = text
    .replace(/^[-\s]+/, '')
    .trim()
    .split(/[.!?]+/)[0] // Take first sentence
    .trim();
  
  if (cleaned.length <= maxLength) {
    return cleaned;
  }
  
  // Find natural break point
  const truncated = cleaned.substring(0, maxLength);
  const lastSpace = truncated.lastIndexOf(' ');
  return truncated.substring(0, lastSpace > 0 ? lastSpace : maxLength).trim() + '...';
};

/**
 * Combine Matters Arising, AOB, and unmatched items into grouped sections by subject heading.
 */
export const parseMatterItems = (
  mattersText: string[],
  aobText: string[],
  unmatchedText: string[],
): MatterGroup[] => {
  const groupMap = new Map<string, MatterItem[]>();
  const seen = new Set<string>();

  for (const text of [...mattersText, ...aobText, ...unmatchedText]) {
    const cleaned = text.replace(/^[-\s]+/, '').trim();
    if (!cleaned || /^(no discussion|nothing discussed|nothing additional identified)\.?$/i.test(cleaned)) continue;
    const key = cleaned.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);

    const heading = suggestCategory(cleaned);
    const isAction = detectPriority(cleaned) === 'high' || cleaned.toLowerCase().includes('action');
    const existing = groupMap.get(heading) ?? [];
    existing.push({ id: `matter-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`, text: cleaned, isAction });
    groupMap.set(heading, existing);
  }

  return Array.from(groupMap.entries()).map(([heading, items]) => ({ heading, items }));
};

/**
 * MIME type and file extension for the generated minutes document.
 *
 * This MUST be a genuine OOXML (ZIP) package, built with the `docx` package
 * below — not HTML served under a Word MIME type / `.doc` extension.
 *
 * An earlier version of this generator emitted "Word HTML" (an HTML document
 * with the MSO / Word XML namespace preamble) served as `application/msword`
 * with a `.doc` extension. That trick only works via desktop Word's legacy
 * HTML-import filter — it opened fine on a Windows laptop, but Word Mobile
 * (iOS/Android), Word Online, and Google Docs all expect a real OOXML
 * structure and either refuse the file or render it as raw markup, which is
 * why it failed on mobile. A real .docx package opens correctly everywhere.
 */
export const MINUTES_DOC_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
export const MINUTES_DOC_EXTENSION = 'docx';

const PRIORITY_COLOR: Record<Action['priority'], string> = {
  high: 'D32F2F',
  medium: 'F57C00',
  low: '388E3C',
};

/** Turn a simple Markdown string into docx Paragraph blocks (headings, bullets, rules). */
const buildRichTextParagraphs = (md: string, docx: typeof import('docx')): InstanceType<typeof import('docx').Paragraph>[] => {
  const { Paragraph, HeadingLevel, BorderStyle } = docx;
  const out: InstanceType<typeof Paragraph>[] = [];

  for (const raw of md.split('\n')) {
    if (raw.startsWith('#### ')) out.push(new Paragraph({ text: raw.slice(5).trim(), heading: HeadingLevel.HEADING_4 }));
    else if (raw.startsWith('### ')) out.push(new Paragraph({ text: raw.slice(4).trim(), heading: HeadingLevel.HEADING_3 }));
    else if (raw.startsWith('## ')) out.push(new Paragraph({ text: raw.slice(3).trim(), heading: HeadingLevel.HEADING_2 }));
    else if (raw.startsWith('# ')) out.push(new Paragraph({ text: raw.slice(2).trim(), heading: HeadingLevel.HEADING_1 }));
    else if (raw.startsWith('- ') || raw.startsWith('* ')) out.push(new Paragraph({ text: raw.slice(2).trim(), bullet: { level: 0 } }));
    else if (raw.trim() === '---') out.push(new Paragraph({ text: '', border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: 'CCCCCC' } } }));
    else if (raw.trim() === '') continue;
    else out.push(new Paragraph({ text: raw.trim() }));
  }
  return out;
};

/**
 * Create a real Word (.docx) document for the minutes. Returns a Blob typed
 * as {@link MINUTES_DOC_MIME}; save it with a `.${MINUTES_DOC_EXTENSION}`
 * extension. `docx` is imported dynamically so it's only pulled into the
 * bundle when a document is actually being generated.
 */
export const createDocxBlob = async (
  title: string,
  date: string,
  sections: Array<{ title: string; notes: string[] }>,
  actions: Action[],
  matterGroups: MatterGroup[],
  richText?: string,
): Promise<Blob> => {
  const docx = await import('docx');
  const { Document, Packer, Paragraph, TextRun, HeadingLevel, Table, TableRow, TableCell, WidthType, ShadingType } = docx;

  const bullet = (text: string) => new Paragraph({ text, bullet: { level: 0 } });
  const heading = (text: string, level: (typeof HeadingLevel)[keyof typeof HeadingLevel]) =>
    new Paragraph({ text, heading: level, spacing: { before: 240, after: 120 } });

  const children: Array<InstanceType<typeof Paragraph> | InstanceType<typeof Table>> = [
    new Paragraph({ text: title, heading: HeadingLevel.TITLE, spacing: { after: 160 } }),
    new Paragraph({ children: [new TextRun({ text: `Date: ${date}`, bold: true })] }),
    new Paragraph({
      children: [new TextRun({ text: `Generated: ${new Date().toLocaleString('en-GB')}`, bold: true })],
      spacing: { after: 200 },
    }),
  ];

  if (richText) {
    children.push(...buildRichTextParagraphs(richText, docx));
  } else {
    for (const s of sections) {
      if (s.notes.length === 0 || s.title === 'Matters Arising' || s.title === 'AOB') continue;
      children.push(heading(s.title, HeadingLevel.HEADING_2));
      for (const note of s.notes) children.push(bullet(note));
    }

    if (matterGroups.length > 0) {
      children.push(heading('Matters Arising & Other Business', HeadingLevel.HEADING_2));
      for (const group of matterGroups) {
        children.push(heading(group.heading, HeadingLevel.HEADING_3));
        for (const item of group.items) {
          children.push(
            new Paragraph({
              bullet: { level: 0 },
              children: [
                new TextRun(item.text),
                ...(item.isAction ? [new TextRun({ text: '  [ACTION]', bold: true, color: 'B45309' })] : []),
              ],
            }),
          );
        }
      }
    }
  }

  if (actions.length > 0) {
    children.push(heading('Action Items Summary', HeadingLevel.HEADING_2));

    const headerCell = (text: string) =>
      new TableCell({
        shading: { fill: 'D3D3D3', type: ShadingType.CLEAR, color: 'auto' },
        children: [new Paragraph({ children: [new TextRun({ text, bold: true })] })],
      });
    const bodyCell = (text: string, color?: string) =>
      new TableCell({ children: [new Paragraph({ children: [new TextRun({ text, bold: !!color, color })] })] });

    const headerRow = new TableRow({
      tableHeader: true,
      children: [headerCell('Action'), headerCell('Owner'), headerCell('Due Date'), headerCell('Priority')],
    });
    const rows = actions.map(
      (a) =>
        new TableRow({
          children: [
            bodyCell(a.what),
            bodyCell(a.owner || '—'),
            bodyCell(a.byWhen || '—'),
            bodyCell(a.priority.toUpperCase(), PRIORITY_COLOR[a.priority]),
          ],
        }),
    );

    children.push(new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: [headerRow, ...rows] }));
  }

  const doc = new Document({ sections: [{ properties: {}, children }] });
  return Packer.toBlob(doc);
};
