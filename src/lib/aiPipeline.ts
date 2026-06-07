import { ChatMessage, postChatCompletion } from './api';
import { pickTheme, themeToPromptBlock, DesignTheme } from './designThemes';

// ─── Agent Roles ─────────────────────────────────────────────────────────────

const PLANNER_SYSTEM = `You are a senior software architect. Given a user request, output a BRIEF implementation plan.
Format:
- GOAL: one sentence
- FILES: list each file with one-line description
- APPROACH: 2-3 sentences on architecture/approach
- RISKS: potential issues to watch for

Be specific. Reference exact filenames. No code — just the plan. Keep it under 200 words.`;

const REVIEWER_SYSTEM = `You are a code quality reviewer. Check the AI-generated code for these issues:
1. TRUNCATION: Does any file end abruptly (mid-function, unclosed tags/brackets)?
2. PLACEHOLDERS: Are there "..." or "// rest of code" or "// TODO" comments instead of real code?
3. MISSING DEPS: Are there imports for libraries that aren't included?
4. SYNTAX: Are there unclosed HTML tags, unmatched brackets, or broken CSS?
5. COMPLETENESS: Does the code actually implement what was requested?

Output ONLY:
- If all good: {"status":"pass"}
- If issues found: {"status":"fail","issues":["issue1","issue2"],"fix_instructions":"what to fix"}

Be strict but fair. Only flag real problems.`;

// ─── Truncation Detection ─────────────────────────────────────────────────────
// Detects when the model's output got cut off mid-content. Critical because
// Llama 3.3 70B has an effective ~4800 char output cap that silently truncates.

function looksTruncated(content: string, kind: 'html' | 'css' | 'js'): { truncated: boolean; reason: string } {
  const trimmed = content.trim();
  if (kind === 'html') {
    if (!trimmed.includes('</html>')) return { truncated: true, reason: 'missing </html> closing tag' };
    if (!trimmed.includes('</body>')) return { truncated: true, reason: 'missing </body> closing tag' };
    if (trimmed.length < 1200) return { truncated: true, reason: `HTML only ${trimmed.length} chars — too short for a real page` };
  }
  if (kind === 'css') {
    const open = (trimmed.match(/{/g) || []).length;
    const close = (trimmed.match(/}/g) || []).length;
    if (open > close) return { truncated: true, reason: `unbalanced CSS braces (${open} open, ${close} close)` };
    if (trimmed.length < 600) return { truncated: true, reason: `CSS only ${trimmed.length} chars — too short` };
  }
  if (kind === 'js') {
    const open = (trimmed.match(/{/g) || []).length;
    const close = (trimmed.match(/}/g) || []).length;
    if (open > close) return { truncated: true, reason: `unbalanced JS braces (${open} open, ${close} close)` };
    if (trimmed.length < 250) return { truncated: true, reason: `JS only ${trimmed.length} chars — too short` };
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

  // Auto-continue up to 2 times if the file looks truncated
  for (let attempt = 0; attempt < 2; attempt++) {
    const check = looksTruncated(content, kind);
    if (!check.truncated) break;

    try {
      const continuation = await callModel([
        ...messages,
        { role: 'assistant', content: content },
        { role: 'user', content: `The file is INCOMPLETE (${check.reason}). Output ONLY the missing tail of the ${kind.toUpperCase()} file — start EXACTLY where you stopped, no preamble, no repetition, just the remaining content. Use the same <write file="..."> tag format.` },
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

// ─── Stream Reader ───────────────────────────────────────────────────────────

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
      // Handle both "data: {...}" and raw JSON lines
      const jsonStr = trimmed.startsWith('data:') ? trimmed.slice(5).trim() : trimmed;
      if (!jsonStr || !jsonStr.startsWith('{')) continue;
      try {
        const chunk = JSON.parse(jsonStr);
        const delta = chunk.choices?.[0]?.delta?.content;
        if (delta) content += delta;
      } catch {
        // Try to handle partial JSON by appending next chunk
        try {
          const merged = buffer + jsonStr;
          const chunk = JSON.parse(merged);
          const delta = chunk.choices?.[0]?.delta?.content;
          if (delta) content += delta;
        } catch {}
      }
    }
  }
  // Process any remaining buffer
  if (buffer.trim() && buffer.trim() !== 'data: [DONE]' && buffer.trim().startsWith('{')) {
    try {
      const chunk = JSON.parse(buffer.trim().startsWith('data:') ? buffer.trim().slice(5).trim() : buffer.trim());
      const delta = chunk.choices?.[0]?.delta?.content;
      if (delta) content += delta;
    } catch {}
  }
  return content;
}

async function callModel(messages: ChatMessage[], opts?: { maxTokens?: number; temperature?: number }): Promise<string> {
  // Try streaming first (Qwen via /api/chat which handles fallback)
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

  // Fallback: non-streaming
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

// ─── Quality Checker (local, no API call) ────────────────────────────────────

export interface QualityIssue {
  type: 'truncation' | 'placeholder' | 'syntax' | 'incomplete';
  file: string;
  detail: string;
}

export function checkLocalQuality(blocks: Array<{ type: string; path: string; content: string }>): QualityIssue[] {
  const issues: QualityIssue[] = [];
  
  // Separate files by type
  const htmlBlocks = blocks.filter(b => b.path.endsWith('.html'));
  const cssBlocks = blocks.filter(b => b.path.endsWith('.css'));
  const jsBlocks = blocks.filter(b => b.path.endsWith('.js'));
  
  // Cross-file validation: check CSS/JS selectors match HTML classes
  if (htmlBlocks.length > 0 && cssBlocks.length > 0) {
    const htmlContent = htmlBlocks.map(b => b.content).join('\n');
    const cssContent = cssBlocks.map(b => b.content).join('\n');
    
    // Extract classes from HTML
    const htmlClasses = new Set<string>();
    const classMatches = htmlContent.match(/class="([^"]+)"/g) || [];
    for (const match of classMatches) {
      const classList = match.replace('class="', '').replace('"', '').split(/\s+/);
      for (const cls of classList) {
        if (cls && !cls.startsWith('fa') && cls !== 'fas' && cls !== 'far' && cls !== 'fab') {
          htmlClasses.add(cls);
        }
      }
    }
    
    // Check that key HTML classes have CSS rules
    const keyClasses = ['hero', 'features', 'pricing', 'footer', 'nav', 'feature-card', 'pricing-card'];
    for (const cls of keyClasses) {
      if (htmlClasses.has(cls) && !cssContent.includes('.' + cls)) {
        issues.push({ type: 'syntax', file: 'styles.css', detail: `Missing CSS for .${cls} (used in HTML)` });
      }
    }
    
    // Check Font Awesome is imported if icons are used
    if (htmlContent.includes('class="fas ') || htmlContent.includes('class="far ') || htmlContent.includes('class="fab ')) {
      if (!htmlContent.includes('font-awesome') && !htmlContent.includes('cdnjs.cloudflare.com')) {
        issues.push({ type: 'incomplete', file: 'index.html', detail: 'Font Awesome icons used but CDN not imported in <head>' });
      }
    }
  }
  
  // Cross-file validation: check JS selectors match HTML
  if (htmlBlocks.length > 0 && jsBlocks.length > 0) {
    const htmlContent = htmlBlocks.map(b => b.content).join('\n');
    const jsContent = jsBlocks.map(b => b.content).join('\n');
    
    // Check that JS querySelector targets exist in HTML
    const jsSelectors = jsContent.match(/querySelector\(['"]([^'"]+)['"]\)/g) || [];
    for (const sel of jsSelectors) {
      const selector = sel.replace(/querySelector\(['"]/, '').replace(/['"]\)/, '');
      // Skip generic selectors
      if (selector === 'window' || selector === 'document') continue;
      // Check if selector (as class or ID) exists in HTML
      if (selector.startsWith('.') && !htmlContent.includes(selector.substring(1))) {
        issues.push({ type: 'incomplete', file: 'script.js', detail: `JS targets ${selector} but element not found in HTML` });
      }
      if (selector.startsWith('#') && !htmlContent.includes(`id="${selector.substring(1)}"`)) {
        issues.push({ type: 'incomplete', file: 'script.js', detail: `JS targets ${selector} but ID not found in HTML` });
      }
    }
  }

  for (const block of blocks) {
    if (block.type !== 'write' || !block.content) continue;
    const c = block.content;
    const path = block.path;

    // Minimum content thresholds (catch truncated outputs)
    if (path.endsWith('.html') && c.length < 1500) {
      issues.push({ type: 'truncation', file: path, detail: `HTML is only ${c.length} chars — too short, output was likely cut off` });
    }
    if (path.endsWith('.css') && c.length < 600) {
      issues.push({ type: 'truncation', file: path, detail: `CSS is only ${c.length} chars — too short, output was likely cut off` });
    }
    if (path.endsWith('.js') && c.length < 250) {
      issues.push({ type: 'truncation', file: path, detail: `JS is only ${c.length} chars — too short, output was likely cut off` });
    }

    // Check truncation: file ends mid-statement (only for files > 1KB)
    if (c.length > 1000) {
      const lastLine = c.trim().split('\n').pop()?.trim() || '';
      const badEndings = ['{', '(', '[', ',', ':', '&&', '||', '=>', 'function', 'const', 'let', 'var', 'return', 'if', 'else', 'for', 'while'];
      const isTruncated = badEndings.some(ending => lastLine.endsWith(ending));
      if (isTruncated) {
        issues.push({ type: 'truncation', file: path, detail: `File ends abruptly: "${lastLine.substring(0, 60)}"` });
      }
    }

    // Check placeholders (lenient)
    const placeholderPatterns = [/\.{5,}/g, /\/\/\s*(rest of|remaining|similar|etc|TODO|FIXME|HACK)/gi];
    for (const pat of placeholderPatterns) {
      if (pat.test(c)) {
        issues.push({ type: 'placeholder', file: path, detail: `Contains placeholder: ${c.match(pat)?.[0]}` });
        break;
      }
    }

    // Check HTML bracket balance (lenient)
    if (path.endsWith('.html')) {
      const opens = (c.match(/<(html|head|body|div|section|main|header|footer|nav|aside|article|form|ul|ol|table|select)\b/gi) || []).length;
      const closes = (c.match(/<\/(html|head|body|div|section|main|header|footer|nav|aside|article|form|ul|ol|table|select)>/gi) || []).length;
      if (opens > closes + 3) {
        issues.push({ type: 'syntax', file: path, detail: `${opens} opening tags vs ${closes} closing tags` });
      }
    }

    // Check JS/CSS bracket balance (lenient)
    if (path.endsWith('.js') || path.endsWith('.css') || path.endsWith('.ts')) {
      const braces = (c.match(/{/g) || []).length - (c.match(/}/g) || []).length;
      if (Math.abs(braces) > 3) {
        issues.push({ type: 'syntax', file: path, detail: `Unbalanced braces: ${braces > 0 ? '+' : ''}${braces}` });
      }
    }
  }
  return issues;
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
  plan: string | null;
  qualityIssues: QualityIssue[];
  retryCount: number;
}

const COMPLEXITY_KEYWORDS = /\b(build|create|make|design|full|complete|app|website|dashboard|game|system|project|multi|complex)\b/i;

// Detect when user wants multiple files (landing page, app, etc.)
const MULTI_FILE_KEYWORDS = /\b(landing page|website|app|dashboard|portfolio|blog|store|shop|forum|chat|game|calculator|weather|todo|notes|resume|agency|saas)\b/i;

// Extract CSS classes and IDs from HTML content for cross-file consistency
function extractClassesFromHtml(html: string): string {
  if (!html) return '(no HTML generated yet — use standard classes)';
  
  const classMatches = html.match(/class="([^"]+)"/g) || [];
  const classes = new Set<string>();
  for (const match of classMatches) {
    const classList = match.replace('class="', '').replace('"', '').split(/\s+/);
    for (const cls of classList) {
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
  
  const result = [...classes, ...ids].join(', ');
  return result || '(no classes found — use standard semantic classes)';
}

// Extract interactive elements from HTML for JS generation
function extractElementsFromHtml(html: string): string {
  if (!html) return '(no HTML generated yet)';
  
  const lines: string[] = [];
  
  // Find buttons
  const buttons = html.match(/<button[^>]*class="([^"]+)"[^>]*>/g) || [];
  if (buttons.length > 0) {
    lines.push('Buttons: ' + buttons.map(b => {
      const cls = b.match(/class="([^"]+)"/)?.[1] || '';
      return cls ? '.' + cls.split(/\s+/)[0] : '<button>';
    }).join(', '));
  }
  
  // Find nav toggle
  if (html.includes('nav-toggle')) lines.push('Nav toggle: .nav-toggle');
  if (html.includes('nav-links')) lines.push('Nav links container: .nav-links');
  
  // Find scroll-to-top
  if (html.includes('scroll-to-top')) lines.push('Scroll-to-top: .scroll-to-top');
  
  // Find sections with IDs
  const sections = html.match(/id="([^"]+)"/g) || [];
  if (sections.length > 0) {
    lines.push('Sections: ' + sections.map(s => '#' + s.replace('id="', '').replace('"', '')).join(', '));
  }
  
  // Find feature cards
  const featureCards = (html.match(/feature-card/g) || []).length;
  if (featureCards > 0) lines.push(`Feature cards: ${featureCards}x .feature-card`);
  
  return lines.join('\n') || '(standard elements)';
}

export async function runMultiAgentPipeline(opts: PipelineOptions): Promise<PipelineResult> {
  const { systemPrompt, fileContext, history, userMessage, existingFiles, onStreamUpdate, onPhaseChange } = opts;
  const isComplex = COMPLEXITY_KEYWORDS.test(userMessage);
  let retryCount = 0;
  const MAX_RETRIES = 2;

  // ─── Phase 1: Planning (only for complex requests) ───
  let plan: string | null = null;
  if (isComplex) {
    onPhaseChange('planning');
    try {
      const planMessages: ChatMessage[] = [
        { role: 'system', content: PLANNER_SYSTEM },
      ];
      if (fileContext) planMessages.push(fileContext);
      planMessages.push({ role: 'user', content: userMessage });

      plan = await callModel(planMessages, { maxTokens: 1024, temperature: 0.3 });
      onStreamUpdate(plan, 'Planning complete — generating code...');
    } catch (e: any) {
      // Planning failure is non-fatal — proceed without plan
      plan = null;
    }
  }

  // ─── Phase 2: Coding ───
  onPhaseChange('coding');
  
  // Multi-file strategy: generate each file separately for better quality
  const isMultiFile = MULTI_FILE_KEYWORDS.test(userMessage) && !userMessage.includes('<write') && !userMessage.includes('```');
  
  let content = '';
  
  if (isMultiFile) {
    // Generate files one at a time — each gets full output capacity
    // Pick a random theme to make each output feel genuinely different
    const theme: DesignTheme = pickTheme(userMessage);
    onStreamUpdate('', `🎨 Theme: ${theme.name}`);

    const themeBlock = themeToPromptBlock(theme);
    const allContents: string[] = [];

    // Step 1: Generate HTML first
    try {
      const htmlPrompt = `Create a COMPLETE index.html file for this request. Use <write file="index.html"> tags. Output 250+ lines.

${themeBlock}

You have full creative freedom to design the sections, layout, and naming. The theme above dictates the look. Make it feel like a real product from a company that lives this aesthetic.

MANDATORY CONTENT (use REAL product names, prices, descriptions, names — never "Lorem ipsum", "Feature 1", "Product A"):
- A navigation (style it to fit the theme — could be top bar, side rail, or minimal)
- A hero/above-the-fold with a strong headline, supporting copy, and a primary call-to-action
- 2-4 content sections (could be features, showcase, how-it-works, stats, testimonials, integrations, etc. — pick what makes sense for the product)
- A pricing/tiers section IF appropriate for the product type (otherwise skip or replace with something more relevant)
- A footer with copyright, contact links, social links
- Realistic copy throughout — product names, real-sounding company names for testimonials, real feature names

HEAD REQUIREMENTS:
- <meta charset="UTF-8">, <meta name="viewport" content="width=device-width, initial-scale=1.0">
- <meta name="description" content="..."> with a real SEO description (1-2 sentences)
- <title> with the product name
- Google Fonts link: <link rel="stylesheet" href="${theme.fonts.googleFontsUrl}">
- <link rel="stylesheet" href="styles.css">
- Icon library CDN if the theme uses icons (e.g., Font Awesome) — otherwise use SVG inline or skip icons
- <script src="script.js"></script> at end of body

You decide:
- The exact CSS class names (use semantic names that fit the theme, e.g. .crt-frame for terminal, .neon-glow for cyberpunk, .brutal-block for brutalist)
- Whether to use Font Awesome, Lucide, or no icons
- The section structure (don't blindly copy a "hero/features/pricing/testimonials" template — pick what serves the product)
- The number of nav links, their labels, their targets

Output ONLY the <write> tag. No markdown, no commentary, no preamble, no explanations.`;

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

    // Step 2: Generate CSS — must match HTML classes exactly
    try {
      const htmlClasses = extractClassesFromHtml(allContents[0] || '');
      const cssPrompt = `Create a COMPLETE styles.css file for the index.html above. Use <write file="styles.css"> tags. Output 350+ lines.

${themeBlock}

CRITICAL: Style EXACTLY these classes and IDs from the HTML (do not invent new ones, do not skip any):
${htmlClasses}

REQUIREMENTS:
- Universal reset (* { margin: 0; padding: 0; box-sizing: border-box; })
- :root CSS variables from the palette above (use the variable names from the theme spec)
- body uses the theme's body font and bg color
- A 1100-1200px max-width container utility class
- Every section has generous padding (4-6rem top/bottom)
- Responsive: at least 2 breakpoints (tablet 768px, mobile 480px) — at mobile, nav links should be hidden behind a toggle, grids should collapse to 1 column
- Implement the MOTIFS listed in the theme (e.g., offset shadow for brutalist, backdrop-blur for glass, scan lines for cyberpunk)
- Implement the MOTION rules from the theme (snappy vs bouncy vs slow)
- Honor the LAYOUT RULES from the theme
- Honor "DO NOT USE" from the theme (don't introduce things the theme forbids)

Use the theme's exact font names in font-family. Load the Google Fonts URL in HTML (already done). Use the palette colors via CSS variables.

Output ONLY the <write> tag. No markdown, no commentary. Every class from the HTML must have styles.`;

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

    // Step 3: Generate JS — must reference HTML elements exactly
    try {
      const htmlElements = extractElementsFromHtml(allContents[0] || '');
      const jsPrompt = `Create a COMPLETE script.js file for the index.html above. Use <write file="script.js"> tags. Output 100+ lines.

${themeBlock}

CRITICAL: Only reference elements that exist in the HTML (use the selectors extracted below — match them exactly):
${htmlElements}

INCLUDE THESE (adapt to the theme's MOTION style — snappy vs bouncy vs slow):
1. Mobile nav toggle (whatever selectors match the nav pattern in the HTML)
2. Smooth scroll for all internal anchor links
3. Show/hide a "back to top" or scroll-to-top button if one exists
4. Scroll-triggered animations using IntersectionObserver — add an 'in-view' or 'visible' class when elements enter viewport
5. Nav background change on scroll if there's a sticky nav
6. Any other interactive features appropriate to the theme (e.g., typed-out text for terminal, parallax for editorial, etc.)
7. Form validation if there's a form
8. Active section highlighting in nav

DOMContentLoaded wrapper. Use const/let (no var). Use addEventListener (no inline onclick). End with console.log('Loaded').

Output ONLY the <write> tag. No markdown, no commentary.`;

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
    // Single-request mode (for edits, simple requests, or when user provides <write> tags)
    const codingMessages: ChatMessage[] = [{ role: 'system', content: systemPrompt }];

    // Inject plan as context if available
    if (plan) {
      codingMessages.push({ role: 'system', content: `IMPLEMENTATION PLAN (follow this):\n${plan}` });
    }

    if (fileContext) codingMessages.push(fileContext);
    codingMessages.push(...history);
    codingMessages.push({ role: 'user', content: userMessage });

    content = await callModel(codingMessages);
  }
  
  onStreamUpdate(content, 'Code generated — checking quality...');

  // ─── Phase 3: Local Quality Check ───
  onPhaseChange('reviewing');
  const { parseToolBlocks } = await import('./parser');
  let blocks = parseToolBlocks(content, new Set(existingFiles));
  let issues = checkLocalQuality(blocks);

  // ─── Phase 4: Auto-retry if critical issues found ───
  while (issues.length > 0 && retryCount < MAX_RETRIES) {
    retryCount++;
    onPhaseChange('fixing');
    onStreamUpdate(content, `Found ${issues.length} issue(s) — auto-fixing (attempt ${retryCount})...`);

    const fixPrompt = `URGENT: The previous response produced INCOMPLETE files. The AI stopped generating code too early.

Issues found:
${issues.map((i: QualityIssue) => `- ${i.file}: ${i.detail} (${i.type})`).join('\n')}

You MUST now output the COMPLETE files using <write> tags. Requirements:
- index.html: Must include FULL <!DOCTYPE html>, complete <head> with all meta tags, complete <body> with hero section (headline + subtitle + CTA button), features section (6+ feature cards with icons), pricing section (3 pricing tiers with features list), footer (links + copyright). Every section must have real content, not placeholders.
- styles.css: Must include ALL styles — reset, typography, layout grid, responsive breakpoints (mobile/tablet/desktop), color variables, animations, component styles for every section. 300+ lines minimum.
- script.js: Must include ALL interactivity — mobile menu toggle, smooth scroll, pricing toggle, form validation, animations. 100+ lines minimum.

Output the COMPLETE files. Do NOT truncate. Do NOT use placeholders.`;

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
  return { content, plan, qualityIssues: issues, retryCount };
}
