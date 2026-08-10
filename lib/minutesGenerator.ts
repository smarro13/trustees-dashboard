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

export type MattersArising = {
  id: string;
  title: string;
  summary: string;
  suggestedCategory: string;
  isAction: boolean;
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
 * Parse Matters Arising items from sections
 * Combines Matters Arising and AOB items with smart summarization
 */
export const parseMatterItems = (mattersText: string[], aobText: string[]): MattersArising[] => {
  const items: MattersArising[] = [];
  const seen = new Set<string>();
  
  const processItems = (texts: string[], category: string) => {
    for (const text of texts) {
      const cleaned = text.replace(/^[-\s]+/, '').trim();
      if (!cleaned || cleaned.toLowerCase() === 'no discussion.') continue;
      
      const key = cleaned.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      
      const suggestedCategory = suggestCategory(cleaned);
      const summary = summarizeText(cleaned);
      
      items.push({
        id: `matter-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        title: suggestedCategory,
        summary,
        suggestedCategory,
        isAction: detectPriority(cleaned) === 'high' || cleaned.toLowerCase().includes('action'),
      });
    }
  };
  
  processItems(mattersText, 'Matters Arising');
  processItems(aobText, 'AOB');
  
  return items.sort((a, b) => {
    // Sort by whether it's an action first, then by priority
    if (a.isAction && !b.isAction) return -1;
    if (!a.isAction && b.isAction) return 1;
    return 0;
  });
};

/**
 * Generate DOCX-compatible XML format (for browser-side generation)
 * Uses base64 encoding to create a downloadable Word document
 */
export const generateDocxXml = (
  title: string,
  date: string,
  sections: Array<{ title: string; notes: string[] }>,
  actions: Action[],
  mattersArising: MattersArising[],
): string => {
  const escapeXml = (str: string): string => {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  };

  const actionRows = actions
    .map(
      (a) =>
        `<w:tr>
        <w:tc><w:tcPr><w:tcW w:w="2400" w:type="dxa"/></w:tcPr><w:p><w:pPr><w:pStyle w:val="Normal"/></w:pPr><w:r><w:t>${escapeXml(a.what)}</w:t></w:r></w:p></w:tc>
        <w:tc><w:tcPr><w:tcW w:w="1600" w:type="dxa"/></w:tcPr><w:p><w:pPr><w:pStyle w:val="Normal"/></w:pPr><w:r><w:t>${escapeXml(a.owner || '—')}</w:t></w:r></w:p></w:tc>
        <w:tc><w:tcPr><w:tcW w:w="1400" w:type="dxa"/></w:tcPr><w:p><w:pPr><w:pStyle w:val="Normal"/></w:pPr><w:r><w:t>${escapeXml(a.byWhen || '—')}</w:t></w:r></w:p></w:tc>
        <w:tc><w:tcPr><w:tcW w:w="1000" w:type="dxa"/></w:tcPr><w:p><w:pPr><w:pStyle w:val="Normal"/></w:pPr><w:r><w:t>${escapeXml(a.priority.toUpperCase())}</w:t></w:r></w:p></w:tc>
      </w:tr>`,
    )
    .join('');

  const mattersRows = mattersArising
    .map(
      (m) =>
        `<w:tr>
        <w:tc><w:tcPr><w:tcW w:w="2400" w:type="dxa"/></w:tcPr><w:p><w:pPr><w:pStyle w:val="Normal"/></w:pPr><w:r><w:rPr><w:b/></w:rPr><w:t>${escapeXml(m.title)}:</w:t></w:r></w:p></w:tc>
        <w:tc><w:tcPr><w:tcW w:w="5600" w:type="dxa"/></w:tcPr><w:p><w:pPr><w:pStyle w:val="Normal"/></w:pPr><w:r><w:t>${escapeXml(m.summary)}${m.isAction ? ' [ACTION]' : ''}</w:t></w:r></w:p></w:tc>
      </w:tr>`,
    )
    .join('');

  const sectionsContent = sections
    .filter((s) => s.notes.length > 0)
    .map(
      (s) =>
        `<w:p><w:pPr><w:pStyle w:val="Heading2"/><w:b/><w:sz w:val="24"/></w:pPr><w:r><w:t>${escapeXml(s.title)}</w:t></w:r></w:p>
      ${s.notes.map((n) => `<w:p><w:r><w:t>• ${escapeXml(n)}</w:t></w:r></w:p>`).join('')}`,
    )
    .join('');

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
            xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"
            xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing">
  <w:body>
    <w:p><w:pPr><w:pStyle w:val="Title"/><w:sz w:val="48"/><w:b/></w:pPr><w:r><w:t>${escapeXml(title)}</w:t></w:r></w:p>
    <w:p><w:pPr><w:pStyle w:val="Normal"/></w:pPr><w:r><w:t>Date: ${escapeXml(date)}</w:t></w:r></w:p>
    <w:p><w:pPr><w:pStyle w:val="Normal"/></w:pPr><w:r><w:t>Generated: ${escapeXml(new Date().toLocaleString('en-GB'))}</w:t></w:r></w:p>
    <w:p></w:p>
    
    ${sectionsContent}
    
    ${
      actions.length > 0
        ? `<w:p><w:pPr><w:pStyle w:val="Heading2"/><w:b/><w:sz w:val="24"/></w:pPr><w:r><w:t>Action Items Summary</w:t></w:r></w:p>
      <w:tbl>
        <w:tblPr><w:tblW w:w="9400" w:type="dxa"/></w:tblPr>
        <w:tr>
          <w:tc><w:tcPr><w:tcW w:w="2400" w:type="dxa"/><w:shd w:fill="D3D3D3"/></w:tcPr><w:p><w:pPr><w:pStyle w:val="Normal"/><w:b/></w:pPr><w:r><w:t>Action</w:t></w:r></w:p></w:tc>
          <w:tc><w:tcPr><w:tcW w:w="1600" w:type="dxa"/><w:shd w:fill="D3D3D3"/></w:tcPr><w:p><w:pPr><w:pStyle w:val="Normal"/><w:b/></w:pPr><w:r><w:t>Owner</w:t></w:r></w:p></w:tc>
          <w:tc><w:tcPr><w:tcW w:w="1400" w:type="dxa"/><w:shd w:fill="D3D3D3"/></w:tcPr><w:p><w:pPr><w:pStyle w:val="Normal"/><w:b/></w:pPr><w:r><w:t>Due Date</w:t></w:r></w:p></w:tc>
          <w:tc><w:tcPr><w:tcW w:w="1000" w:type="dxa"/><w:shd w:fill="D3D3D3"/></w:tcPr><w:p><w:pPr><w:pStyle w:val="Normal"/><w:b/></w:pPr><w:r><w:t>Priority</w:t></w:r></w:p></w:tc>
        </w:tr>
        ${actionRows}
      </w:tbl>`
        : ''
    }
    
    ${
      mattersArising.length > 0
        ? `<w:p></w:p>
      <w:p><w:pPr><w:pStyle w:val="Heading2"/><w:b/><w:sz w:val="24"/></w:pPr><w:r><w:t>Matters Arising & Other Business</w:t></w:r></w:p>
      <w:tbl>
        <w:tblPr><w:tblW w:w="9400" w:type="dxa"/></w:tblPr>
        <w:tr>
          <w:tc><w:tcPr><w:tcW w:w="2400" w:type="dxa"/><w:shd w:fill="D3D3D3"/></w:tcPr><w:p><w:pPr><w:pStyle w:val="Normal"/><w:b/></w:pPr><w:r><w:t>Category</w:t></w:r></w:p></w:tc>
          <w:tc><w:tcPr><w:tcW w:w="5600" w:type="dxa"/><w:shd w:fill="D3D3D3"/></w:tcPr><w:p><w:pPr><w:pStyle w:val="Normal"/><w:b/></w:pPr><w:r><w:t>Summary</w:t></w:r></w:p></w:tc>
        </w:tr>
        ${mattersRows}
      </w:tbl>`
        : ''
    }
  </w:body>
</w:document>`;
};

/**
 * Create a simple HTML table representation for DOCX export
 * This creates a standalone DOCX file data URI
 */
export const createDocxBlob = (
  title: string,
  date: string,
  sections: Array<{ title: string; notes: string[] }>,
  actions: Action[],
  mattersArising: MattersArising[],
): Blob => {
  // For simplicity without docx library, create an HTML representation
  // that Word can open
  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8"/>
  <style>
    body { font-family: Calibri, Arial; margin: 20px; }
    h1 { font-size: 28pt; font-weight: bold; margin-bottom: 10px; }
    h2 { font-size: 14pt; font-weight: bold; margin-top: 15px; margin-bottom: 8px; }
    table { border-collapse: collapse; width: 100%; margin: 15px 0; }
    th, td { border: 1px solid #000; padding: 8px; text-align: left; }
    th { background-color: #D3D3D3; font-weight: bold; }
    .meta { font-size: 11pt; margin-bottom: 20px; }
    .priority-high { color: #d32f2f; font-weight: bold; }
    .priority-medium { color: #f57c00; }
    .priority-low { color: #388e3c; }
    .action-flag { background-color: #fff3e0; padding: 2px 6px; border-radius: 3px; }
  </style>
</head>
<body>
  <h1>${title}</h1>
  <div class="meta">
    <p><strong>Date:</strong> ${date}</p>
    <p><strong>Generated:</strong> ${new Date().toLocaleString('en-GB')}</p>
  </div>

  ${sections
    .filter((s) => s.notes.length > 0)
    .map(
      (s) => `
    <h2>${s.title}</h2>
    <ul>
      ${s.notes.map((n) => `<li>${n}</li>`).join('')}
    </ul>
  `,
    )
    .join('')}

  ${
    actions.length > 0
      ? `
    <h2>Action Items Summary</h2>
    <table>
      <thead>
        <tr>
          <th>Action</th>
          <th>Owner</th>
          <th>Due Date</th>
          <th>Priority</th>
        </tr>
      </thead>
      <tbody>
        ${actions
          .map(
            (a) => `
          <tr>
            <td>${a.what}</td>
            <td>${a.owner || '—'}</td>
            <td>${a.byWhen || '—'}</td>
            <td class="priority-${a.priority}">${a.priority.toUpperCase()}</td>
          </tr>
        `,
          )
          .join('')}
      </tbody>
    </table>
  `
      : ''
  }

  ${
    mattersArising.length > 0
      ? `
    <h2>Matters Arising & Other Business</h2>
    <table>
      <thead>
        <tr>
          <th>Category</th>
          <th>Summary</th>
        </tr>
      </thead>
      <tbody>
        ${mattersArising
          .map(
            (m) => `
          <tr>
            <td><strong>${m.title}</strong></td>
            <td>${m.summary}${m.isAction ? ' <span class="action-flag">[ACTION]</span>' : ''}</td>
          </tr>
        `,
          )
          .join('')}
      </tbody>
    </table>
  `
      : ''
  }
</body>
</html>`;

  return new Blob([html], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
};
