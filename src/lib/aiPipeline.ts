import { ChatMessage, postChatCompletion } from './api';

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
    // CRITICAL: CSS and JS must use the EXACT classes/IDs from the HTML
    const allContents: string[] = [];
    
    // Step 1: Generate HTML first
    try {
      const htmlPrompt = `Create a COMPLETE index.html file for this request. Use <write file="index.html"> tags.
Include ALL sections with REAL content — no placeholders. 200+ lines.
Use these CSS classes EXACTLY (CSS and JS will reference them):
- nav: .navbar, .nav-container, .nav-logo, .nav-toggle, .nav-links
- hero: .hero, .hero-container, .hero-headline, .hero-subtitle, .hero-cta
- features: .features, .features-container, .section-title, .features-grid, .feature-card, .feature-icon, .feature-title, .feature-description
- pricing: .pricing, .pricing-container, .pricing-grid, .pricing-card, .pricing-tier, .pricing-price, .pricing-features, .pricing-cta, .pricing-badge
- footer: .footer, .footer-container, .footer-grid, .footer-col, .footer-bottom
- scroll-to-top: .scroll-to-top
- Use Font Awesome icons: <i class="fas fa-icon-name"></i> (include CDN in <head>)
- IDs: #features, #pricing, #contact`;

      const htmlContent = await callModel([
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `${userMessage}\n\n${htmlPrompt}` },
      ]);
      if (htmlContent.length > 50) {
        allContents.push(htmlContent);
        onStreamUpdate(htmlContent, 'Generated HTML — creating CSS...');
      }
    } catch {}

    // Step 2: Generate CSS — must match HTML classes exactly
    try {
      const htmlClasses = extractClassesFromHtml(allContents[0] || '');
      const cssPrompt = `Create a COMPLETE styles.css file. Use <write file="styles.css"> tags.
CRITICAL: You MUST style EXACTLY these classes and IDs from the HTML (no other classes):
${htmlClasses}

Requirements:
- CSS variables for colors (--primary-color, --background-color, etc.)
- Dark theme: #0a0a0a background, white text, #0070f3 accent
- Responsive: mobile-first with breakpoints at 768px and 480px
- Flexbox/Grid layouts for cards
- Smooth transitions and hover effects
- 200+ lines. Every class from the HTML must have styles.`;

      const cssContent = await callModel([
        { role: 'system', content: systemPrompt },
        { role: 'user', content: cssPrompt },
      ]);
      if (cssContent.length > 50) {
        allContents.push(cssContent);
        onStreamUpdate(allContents.join('\n\n'), 'Generated CSS — creating JS...');
      }
    } catch {}

    // Step 3: Generate JS — must reference HTML elements exactly
    try {
      const htmlElements = extractElementsFromHtml(allContents[0] || '');
      const jsPrompt = `Create a COMPLETE script.js file. Use <write file="script.js"> tags.
CRITICAL: Only reference elements that exist in the HTML:
${htmlElements}

Include:
- Mobile nav toggle (use .nav-toggle and .nav-links classes)
- Smooth scroll for anchor links
- Scroll-to-top button visibility toggle (use .scroll-to-top class)
- Scroll animations for feature cards (use .feature-card class)
- 80+ lines. Only use selectors that match the HTML above.`;

      const jsContent = await callModel([
        { role: 'system', content: systemPrompt },
        { role: 'user', content: jsPrompt },
      ]);
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
