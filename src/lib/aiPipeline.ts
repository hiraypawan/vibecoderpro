import { ChatMessage, postChatCompletion } from './api';
import { pickTheme, themeToPromptBlock, DesignTheme } from './designThemes';
import { parseToolBlocks, ToolBlock } from './parser';

// ─── Stream Reader ───────────────────────────────────────────────────────────
// Handles both 'data: {...}' SSE lines and raw JSON lines from Hyperbolic.

async function readStream(response: Response): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) throw new Error('No response body');
  const decoder = new TextDecoder();
  let content = '';
  let buffer = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed === 'data: [DONE]') continue;
      const jsonStr = trimmed.startsWith('data:') ? trimmed.slice(5).trim() : trimmed;
      if (!jsonStr || !jsonStr.startsWith('{')) continue;
      try {
        const chunk = JSON.parse(jsonStr);
        const delta = chunk.choices?.[0]?.delta?.content;
        if (delta) content += delta;
      } catch {
        // best-effort
      }
    }
  }
  if (buffer.trim() && buffer.trim() !== 'data: [DONE]' && buffer.trim().startsWith('{')) {
    try {
      const jsonStr = buffer.trim().startsWith('data:') ? buffer.trim().slice(5).trim() : buffer.trim();
      const chunk = JSON.parse(jsonStr);
      const delta = chunk.choices?.[0]?.delta?.content;
      if (delta) content += delta;
    } catch {}
  }
  return content;
}

async function callModel(messages: ChatMessage[], opts?: { maxTokens?: number; temperature?: number }): Promise<string> {
  try {
    const response = await postChatCompletion({
      messages,
      stream: true,
      max_tokens: opts?.maxTokens ?? 65536,
      temperature: opts?.temperature ?? 0.3,
    }, 'pipeline');
    if (response.ok) {
      const content = await readStream(response);
      if (content.length > 0) return content;
    }
  } catch {}
  try {
    const response = await postChatCompletion({
      messages,
      stream: false,
      max_tokens: opts?.maxTokens ?? 65536,
      temperature: opts?.temperature ?? 0.3,
    }, 'pipeline');
    if (response.ok) {
      const data = await response.json();
      const content = data.choices?.[0]?.message?.content || '';
      if (content.length > 0) return content;
    }
  } catch {}
  throw new Error('API returned no content — model may be temporarily unavailable');
}

// ─── Truncation Detection ────────────────────────────────────────────────────
// Llama 3.3 70B has an effective ~4800 char output cap. Detect and continue.

function looksTruncated(content: string, kind: 'html' | 'css' | 'js'): { truncated: boolean; reason: string } {
  const trimmed = content.trim();
  if (kind === 'html') {
    if (!trimmed.includes('</html>')) return { truncated: true, reason: 'missing </html>' };
    if (!trimmed.includes('</body>')) return { truncated: true, reason: 'missing </body>' };
    if (trimmed.length < 1200) return { truncated: true, reason: `HTML only ${trimmed.length} chars` };
  }
  if (kind === 'css') {
    const open = (trimmed.match(/{/g) || []).length;
    const close = (trimmed.match(/}/g) || []).length;
    if (open > close) return { truncated: true, reason: 'unbalanced CSS braces' };
    if (trimmed.length < 600) return { truncated: true, reason: `CSS only ${trimmed.length} chars` };
  }
  if (kind === 'js') {
    const open = (trimmed.match(/{/g) || []).length;
    const close = (trimmed.match(/}/g) || []).length;
    if (open > close) return { truncated: true, reason: 'unbalanced JS braces' };
    if (trimmed.length < 250) return { truncated: true, reason: `JS only ${trimmed.length} chars` };
  }
  return { truncated: false, reason: '' };
}

async function generateWithContinuation(
  messages: ChatMessage[],
  kind: 'html' | 'css' | 'js',
  onUpdate: (text: string) => void
): Promise<string> {
  let content = await callModel(messages);
  onUpdate(content);
  for (let attempt = 0; attempt < 2; attempt++) {
    const check = looksTruncated(content, kind);
    if (!check.truncated) break;
    try {
      const continuation = await callModel([
        ...messages,
        { role: 'assistant', content: content },
        { role: 'user', content: `File is INCOMPLETE (${check.reason}). Output ONLY the missing tail of the ${kind.toUpperCase()} — start EXACTLY where you stopped, no preamble, no repetition. Use <write file="..."> tag.` },
      ], { temperature: 0.2 });
      if (continuation.length > 50) {
        content = content.trimEnd() + '\n' + continuation;
        onUpdate(content);
      } else {
        break;
      }
    } catch {
      break;
    }
  }
  return content;
}

// ─── Quality Checker ─────────────────────────────────────────────────────────

export interface QualityIssue {
  type: 'truncation' | 'placeholder' | 'syntax' | 'incomplete';
  file: string;
  detail: string;
}

export function checkLocalQuality(blocks: ToolBlock[]): QualityIssue[] {
  const issues: QualityIssue[] = [];
  for (const block of blocks) {
    if (block.type !== 'write' || !block.content) continue;
    const c = block.content;
    const path = block.path;

    if (path.endsWith('.html') && c.length < 1500) {
      issues.push({ type: 'truncation', file: path, detail: `HTML only ${c.length} chars` });
    }
    if (path.endsWith('.css') && c.length < 600) {
      issues.push({ type: 'truncation', file: path, detail: `CSS only ${c.length} chars` });
    }
    if (path.endsWith('.js') && c.length < 250) {
      issues.push({ type: 'truncation', file: path, detail: `JS only ${c.length} chars` });
    }

    if (c.length > 1000) {
      const lastLine = c.trim().split('\n').pop()?.trim() || '';
      const badEndings = ['{', '(', '[', ',', ':', '&&', '||', '=>', 'function', 'const', 'let', 'var', 'return', 'if', 'else', 'for', 'while'];
      if (badEndings.some((e) => lastLine.endsWith(e))) {
        issues.push({ type: 'truncation', file: path, detail: `ends abruptly: "${lastLine.substring(0, 60)}"` });
      }
    }

    const placeholderPatterns = [/\.{5,}/g, /\/\/\s*(rest of|remaining|similar|etc|TODO|FIXME|HACK)/gi];
    for (const pat of placeholderPatterns) {
      if (pat.test(c)) {
        issues.push({ type: 'placeholder', file: path, detail: `placeholder found` });
        break;
      }
    }

    if (path.endsWith('.html')) {
      const opens = (c.match(/<(html|head|body|div|section|main|header|footer|nav|aside|article|form|ul|ol|table|select)\b/gi) || []).length;
      const closes = (c.match(/<\/(html|head|body|div|section|main|header|footer|nav|aside|article|form|ul|ol|table|select)>/gi) || []).length;
      if (opens > closes + 3) {
        issues.push({ type: 'syntax', file: path, detail: `${opens} opens vs ${closes} closes` });
      }
    }
    if (path.endsWith('.js') || path.endsWith('.css')) {
      const braces = (c.match(/{/g) || []).length - (c.match(/}/g) || []).length;
      if (Math.abs(braces) > 3) {
        issues.push({ type: 'syntax', file: path, detail: `unbalanced braces: ${braces}` });
      }
    }
  }
  return issues;
}

// ─── Theme-aware HTML class extraction ───────────────────────────────────────

function extractClassesFromHtml(html: string): string {
  if (!html) return '(none)';
  const classMatches = html.match(/class="([^"]+)"/g) || [];
  const classes = new Set<string>();
  for (const match of classMatches) {
    const list = match.replace('class="', '').replace('"', '').split(/\s+/);
    for (const cls of list) {
      if (cls && !cls.startsWith('fa') && cls !== 'fas' && cls !== 'far' && cls !== 'fab') {
        classes.add('.' + cls);
      }
    }
  }
  const idMatches = html.match(/id="([^"]+)"/g) || [];
  const ids = new Set<string>();
  for (const match of idMatches) {
    const id = match.replace('id="', '').replace('"', '');
    if (id) ids.add('#' + id);
  }
  return [...classes, ...ids].join(', ') || '(none)';
}

// ─── Multi-Agent Pipeline ────────────────────────────────────────────────────

export interface PipelineOptions {
  systemPrompt: string;
  fileContext: ChatMessage | null;
  history: ChatMessage[];
  userMessage: string;
  existingFiles: Set<string>;
  onStreamUpdate: (content: string, phase: string) => void;
  onPhaseChange: (phase: 'planning' | 'coding' | 'reviewing' | 'fixing' | 'done') => void;
}

export interface PipelineResult {
  content: string;
  qualityIssues: QualityIssue[];
  retryCount: number;
  themeName: string | null;
}

const MULTI_FILE_KEYWORDS = /\b(landing page|website|app|dashboard|portfolio|blog|store|shop|forum|chat|game|calculator|weather|todo|notes|resume|agency|saas|homepage|webpage)\b/i;

export async function runMultiAgentPipeline(opts: PipelineOptions): Promise<PipelineResult> {
  const { systemPrompt, fileContext, history, userMessage, existingFiles, onStreamUpdate, onPhaseChange } = opts;
  let retryCount = 0;
  const MAX_RETRIES = 2;

  onPhaseChange('coding');

  const isMultiFile = MULTI_FILE_KEYWORDS.test(userMessage) && !userMessage.includes('<write') && !userMessage.includes('```');
  let content = '';
  let themeName: string | null = null;

  if (isMultiFile) {
    const theme: DesignTheme = pickTheme(userMessage);
    themeName = theme.name;
    onStreamUpdate('', `Theme: ${theme.name}`);
    const themeBlock = themeToPromptBlock(theme);
    const allContents: string[] = [];

    // HTML
    try {
      const htmlPrompt = `Create a COMPLETE index.html for this request. Use <write file="index.html"> tags. Output 250+ lines.

${themeBlock}

You have full creative freedom. Make it feel like a real product from a company that lives this aesthetic. Use REAL product names, prices, descriptions — no "Lorem ipsum" or "Feature 1".

MANDATORY CONTENT:
- A navigation styled to fit the theme
- A hero/above-the-fold with strong headline + supporting copy + primary CTA
- 2-4 content sections appropriate to the product (features, showcase, how-it-works, stats, testimonials, etc.)
- Footer with copyright, contact links, social links
- Realistic copy throughout

HEAD: <meta charset>, <meta viewport>, <meta description>, <title>, Google Fonts link (${theme.fonts.googleFontsUrl}), styles.css, script.js
Every <section> should have an id for navigation.

Output ONLY the <write> tag. No markdown, no commentary.`;

      const htmlContent = await generateWithContinuation(
        [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `${userMessage}\n\n${htmlPrompt}` },
        ],
        'html',
        (text) => onStreamUpdate(text, 'Generating HTML...')
      );
      if (htmlContent.length > 50) {
        allContents.push(htmlContent);
        onStreamUpdate(htmlContent, 'Generated HTML — creating CSS...');
      }
    } catch {}

    // CSS
    try {
      const htmlClasses = extractClassesFromHtml(allContents[0] || '');
      const cssPrompt = `Create a COMPLETE styles.css. Use <write file="styles.css"> tags. Output 350+ lines.

${themeBlock}

CRITICAL: Style EXACTLY these classes/IDs from the HTML:
${htmlClasses}

REQUIREMENTS:
- Universal reset (* { margin: 0; padding: 0; box-sizing: border-box; })
- :root CSS variables from the palette
- body uses the theme's body font and bg color
- 1100-1200px max-width container utility
- Every section has generous padding (4-6rem)
- Responsive: 2 breakpoints (768px tablet, 480px mobile)
- Implement the theme's MOTIFS (offset shadow for brutalist, backdrop-blur for glass, etc.)
- Implement the theme's MOTION (snappy vs bouncy vs slow)
- Honor "DO NOT USE" — don't introduce forbidden elements
- Use the theme's font names in font-family

Output ONLY the <write> tag. No commentary.`;

      const cssContent = await generateWithContinuation(
        [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: cssPrompt },
        ],
        'css',
        (text) => onStreamUpdate(text, 'Generating CSS...')
      );
      if (cssContent.length > 50) {
        allContents.push(cssContent);
        onStreamUpdate(allContents.join('\n\n'), 'Generated CSS — creating JS...');
      }
    } catch {}

    // JS
    try {
      const htmlClasses = extractClassesFromHtml(allContents[0] || '');
      const jsPrompt = `Create a COMPLETE script.js. Use <write file="script.js"> tags. Output 100+ lines.

${themeBlock}

CRITICAL: Reference elements from the HTML (use these classes/IDs):
${htmlClasses}

INCLUDE (adapt to theme's MOTION style):
1. Mobile nav toggle (whatever selectors match the nav)
2. Smooth scroll for internal anchor links
3. Show/hide scroll-to-top button if one exists
4. Scroll-triggered animations using IntersectionObserver
5. Nav background change on scroll
6. Any other interactive features appropriate to the theme
7. Form validation if there's a form

DOMContentLoaded wrapper. const/let. addEventListener.

Output ONLY the <write> tag. No commentary.`;

      const jsContent = await generateWithContinuation(
        [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: jsPrompt },
        ],
        'js',
        (text) => onStreamUpdate(text, 'Generating JS...')
      );
      if (jsContent.length > 50) {
        allContents.push(jsContent);
        onStreamUpdate(allContents.join('\n\n'), 'Generated JS — checking quality...');
      }
    } catch {}

    content = allContents.join('\n\n');
  } else {
    // Single-request mode (edits, simple requests, or user provided <write> tags)
    const codingMessages: ChatMessage[] = [{ role: 'system', content: systemPrompt }];
    if (fileContext) codingMessages.push(fileContext);
    codingMessages.push(...history);
    codingMessages.push({ role: 'user', content: userMessage });
    content = await callModel(codingMessages);
  }

  onStreamUpdate(content, 'Code generated — checking quality...');

  onPhaseChange('reviewing');
  let blocks = parseToolBlocks(content, new Set(existingFiles));
  let issues = checkLocalQuality(blocks);

  while (issues.length > 0 && retryCount < MAX_RETRIES) {
    retryCount++;
    onPhaseChange('fixing');
    onStreamUpdate(content, `Found ${issues.length} issue(s) — auto-fixing (attempt ${retryCount})...`);
    const fixPrompt = `URGENT: Previous response produced INCOMPLETE files.
Issues: ${issues.map((i) => `- ${i.file}: ${i.detail} (${i.type})`).join('\n')}

Output the COMPLETE files using <write> tags. No truncation. No placeholders.`;
    const fixMessages: ChatMessage[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: fixPrompt },
    ];
    content = await callModel(fixMessages);
    onStreamUpdate(content, 'Fix applied — re-checking...');
    blocks = parseToolBlocks(content, new Set(existingFiles));
    issues = checkLocalQuality(blocks);
  }

  onPhaseChange('done');
  return { content, qualityIssues: issues, retryCount, themeName };
}
