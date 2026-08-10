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

/** Convert a simple Markdown string to HTML for Word-compatible DOCX output. */
export const markdownToHtml = (md: string): string => {
  const lines = md.split('\n');
  const out: string[] = [];
  let inList = false;

  const closeList = () => { if (inList) { out.push('</ul>'); inList = false; } };

  for (const raw of lines) {
    if (raw.startsWith('#### ')) { closeList(); out.push(`<h4>${raw.slice(5).trim()}</h4>`); }
    else if (raw.startsWith('### ')) { closeList(); out.push(`<h3>${raw.slice(4).trim()}</h3>`); }
    else if (raw.startsWith('## ')) { closeList(); out.push(`<h2>${raw.slice(3).trim()}</h2>`); }
    else if (raw.startsWith('# ')) { closeList(); out.push(`<h1>${raw.slice(2).trim()}</h1>`); }
    else if (raw.startsWith('- ') || raw.startsWith('* ')) {
      if (!inList) { out.push('<ul>'); inList = true; }
      out.push(`<li>${raw.slice(2).trim()}</li>`);
    } else if (raw.trim() === '---') { closeList(); out.push('<hr/>'); }
    else if (raw.trim() === '') { closeList(); }
    else { closeList(); out.push(`<p>${raw.trim()}</p>`); }
  }
  closeList();
  return out.join('\n');
};

/**
 * Create a simple HTML representation of minutes that Word can open as DOCX
 */
export const createDocxBlob = (
  title: string,
  date: string,
  sections: Array<{ title: string; notes: string[] }>,
  actions: Action[],
  matterGroups: MatterGroup[],
  richText?: string,
): Blob => {
  const mainContent = richText
    ? markdownToHtml(richText)
    : `${sections
        .filter((s) => s.notes.length > 0 && s.title !== 'Matters Arising' && s.title !== 'AOB')
        .map((s) => `<h2>${s.title}</h2><ul>${s.notes.map((n) => `<li>${n}</li>`).join('')}</ul>`)
        .join('')}
       ${matterGroups.length > 0 ? `<h2>Matters Arising &amp; Other Business</h2>${matterGroups.map((g) => `<h3>${g.heading}</h3><ul>${g.items.map((item) => `<li>${item.text}${item.isAction ? ' <span class="action-flag">[ACTION]</span>' : ''}</li>`).join('')}</ul>`).join('')}` : ''}`;
  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8"/>
  <style>
    body { font-family: Calibri, Arial; margin: 20px; }
    h1 { font-size: 28pt; font-weight: bold; margin-bottom: 10px; }
    h2 { font-size: 14pt; font-weight: bold; margin-top: 20px; margin-bottom: 8px; border-bottom: 1px solid #ccc; padding-bottom: 4px; }
    h3 { font-size: 12pt; font-weight: bold; margin-top: 14px; margin-bottom: 4px; }
    table { border-collapse: collapse; width: 100%; margin: 15px 0; }
    th, td { border: 1px solid #000; padding: 8px; text-align: left; }
    th { background-color: #D3D3D3; font-weight: bold; }
    .meta { font-size: 11pt; margin-bottom: 20px; }
    .priority-high { color: #d32f2f; font-weight: bold; }
    .priority-medium { color: #f57c00; }
    .priority-low { color: #388e3c; }
    .action-flag { background-color: #fff3e0; padding: 2px 6px; border-radius: 3px; font-size: 9pt; }
  </style>
</head>
<body>
  <h1>${title}</h1>
  <div class="meta">
    <p><strong>Date:</strong> ${date}</p>
    <p><strong>Generated:</strong> ${new Date().toLocaleString('en-GB')}</p>
  </div>

  ${mainContent}

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
</body>
</html>`;

  return new Blob([html], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
};
