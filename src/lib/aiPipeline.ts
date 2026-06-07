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
    // CRITICAL: CSS and JS must use the EXACT classes/IDs from the HTML
    const allContents: string[] = [];
    
    // Step 1: Generate HTML first
    try {
      const htmlPrompt = `Create a COMPLETE index.html file for this request. Use <write file="index.html"> tags. Output 250+ lines.

MANDATORY SECTIONS (use REAL product names, prices, descriptions — never "Lorem ipsum" or "Feature 1"):
1. <nav class="navbar"> with logo, 3-4 nav links, and a CTA button (.btn-nav). Include hamburger <button class="nav-toggle"> for mobile.
2. <section class="hero"> with .hero-badge, .hero-headline (h1), .hero-subtitle (p), .hero-actions (primary + secondary buttons), and .hero-stats (3 stat cards).
3. <section id="features" class="features"> with .section-badge, .section-title, .section-subtitle, and .features-grid containing 6 .feature-card items — each with .feature-icon (Font Awesome), h3, p.
4. <section id="pricing" class="pricing"> with .pricing-grid containing 3 .pricing-card items (Starter $0, Pro $19, Enterprise Custom). Middle one has class "featured" and a .popular-badge. Each card has h3, .price, .price-desc, .pricing-features (ul of 4-5 features with <i class="fas fa-check">), and a CTA link.
5. <section id="testimonials" class="testimonials"> with 2 .testimonial-card items — each with 5-star .stars, p quote, .testimonial-author (avatar + name + role).
6. <section id="cta" class="cta-section"> with h2, p, and a .btn-primary .btn-large.
7. <footer class="footer"> with .footer-grid (4 columns: brand+desc, Product links, Company links, Legal links), .footer-bottom (copyright + .social-links with GitHub/Twitter/Discord icons).
8. <button class="scroll-to-top" aria-label="Scroll to top"> at the end of body.

HEAD requirements:
- <meta charset="UTF-8">, <meta name="viewport">, <meta name="description"> (real SEO description, not generic), <title> with the product name
- <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css"> (Font Awesome CDN)
- <link rel="stylesheet" href="styles.css">
- <script src="script.js"></script> at the end of body
- Every <section> must have an id for anchor navigation.

Use these CSS class names EXACTLY (CSS and JS will reference them):
.navbar .nav-container .nav-logo .nav-toggle .nav-links .btn-nav
.hero .hero-container .hero-badge .hero-headline .hero-subtitle .hero-actions .hero-stats .stat .stat-number .stat-label
.btn-primary .btn-secondary .btn-outline .btn-large
.gradient-text
.section-badge .section-title .section-subtitle .container
.features .features-grid .feature-card .feature-icon
.pricing .pricing-grid .pricing-card .pricing-card.featured .popular-badge .price .price-desc .pricing-features
.testimonials .testimonials-grid .testimonial-card .stars .testimonial-author .avatar
.cta-section
.footer .footer-grid .footer-brand .footer-col .footer-bottom .social-links
.scroll-to-top

Output ONLY the <write> tag. No markdown, no commentary, no preamble.`;

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
      const cssPrompt = `Create a COMPLETE styles.css file. Use <write file="styles.css"> tags. Output 350+ lines.

CRITICAL: Style EXACTLY these classes and IDs from the HTML (do not invent new ones):
${htmlClasses}

DESIGN SYSTEM (use CSS variables at the top):
:root {
  --primary-color: #0070f3;
  --background-color: #0a0a0a;
  --card-bg: #111111;
  --card-border: #1a1a1a;
  --text-color: #ffffff;
  --text-muted: #cccccc;
  --border-color: #333333;
  --gradient-end: #00bfff;
}

REQUIREMENTS:
- Universal reset (* { margin: 0; padding: 0; box-sizing: border-box; })
- body: font-family: 'Inter', -apple-system, sans-serif; background: var(--background-color); color: var(--text-color); line-height: 1.7
- .container: width: 90%; max-width: 1200px; margin: 0 auto; padding: 4rem 0
- .section-title: font-size: clamp(2rem, 4vw, 3rem); line-height: 1.2; margin-bottom: 1rem
- .gradient-text: background: linear-gradient(90deg, var(--primary-color), var(--gradient-end)); -webkit-background-clip: text; -webkit-text-fill-color: transparent
- Buttons (.btn-primary .btn-secondary .btn-outline): padding 1rem 2.5rem; border-radius 30px; transition: all 0.3s ease; cursor pointer
- .btn-primary: background linear-gradient(90deg, primary, gradient-end); color white; box-shadow 0 4px 15px rgba(0,112,243,0.2); :hover { transform: translateY(-4px); box-shadow glow }
- Cards (.feature-card, .pricing-card, .testimonial-card): background var(--card-border); border 1px solid var(--border-color); border-radius 12px; padding 2rem; :hover { transform: translateY(-8px); box-shadow glow }
- .pricing-card.featured: transform: scale(1.05); border-color: var(--primary-color); box-shadow: 0 0 30px rgba(0,112,243,0.3)
- .popular-badge: position absolute; top -15px; left 50%; transform translateX(-50%); background var(--primary-color); color white; padding 0.3rem 1rem; border-radius 20px
- Grids (.features-grid, .pricing-grid, .testimonials-grid): display grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 2rem
- .navbar: position sticky; top 0; z-index 100; background rgba(10,10,10,0.8); backdrop-filter: blur(10px); display flex; justify-content space-between
- .nav-toggle: display none (shown on mobile via @media)
- .hero: min-height 80vh; display flex; align-items center; text-align center; background linear-gradient(180deg, var(--background-color), var(--gradient-end))
- .stat-number: font-size 2rem; font-weight 700
- .footer: background #111; border-top 1px solid var(--border-color); padding 4rem 0 2rem
- .footer-grid: display grid; grid-template-columns: repeat(4, 1fr); gap 2rem
- .scroll-to-top: position fixed; bottom 30px; right 30px; background var(--primary-color); width 50px; height 50px; border-radius 50%; display none
- .scroll-to-top.visible: display block; opacity 1
- Animations: hover transitions 0.3s ease, transform translateY(-4px to -8px) on card hover
- .stars: color var(--gradient-end); margin-bottom 1rem
- .avatar: width 50px; height 50px; border-radius 50%; background var(--primary-color); display flex; align-items center; justify-content center; font-weight 600

RESPONSIVE (mobile-first):
@media (max-width: 992px) { grids → 2 columns; .pricing-card.featured { transform: none; } }
@media (max-width: 768px) { .nav-links { display: none; } .nav-toggle { display: block; } .features-grid, .pricing-grid, .testimonials-grid { grid-template-columns: 1fr; } .footer-grid { grid-template-columns: repeat(2,1fr); } }
@media (max-width: 480px) { .hero h1 { font-size: 2.2rem; } .footer-grid { grid-template-columns: 1fr; } }

Output ONLY the <write> tag. No markdown, no commentary, no preamble. Every class from the HTML must have styles.`;

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
      const jsPrompt = `Create a COMPLETE script.js file. Use <write file="script.js"> tags. Output 100+ lines.

CRITICAL: Only reference elements that exist in the HTML:
${htmlElements}

INCLUDE ALL OF THESE (vanilla JS, no libraries):
1. MOBILE NAV TOGGLE: Click .nav-toggle to toggle 'nav-open' class on .nav-links. Close menu when a link is clicked. Hide toggle if screen width > 768px on resize.
2. SMOOTH SCROLL: All anchor links (a[href^="#"]) scroll smoothly to target section. Account for sticky navbar height (~80px) using scroll-margin-top or offset calculation.
3. SCROLL-TO-TOP: Show .scroll-to-top button (add 'visible' class) when window.scrollY > 300. Click scrolls smoothly to top. Hide when scrolled back to top.
4. SCROLL ANIMATIONS: Use IntersectionObserver to add 'visible' class to .feature-card, .pricing-card, .testimonial-card when they enter viewport. Use unobserve after triggering. Add a fadeInUp keyframe (opacity 0 → 1, translateY 30px → 0) over 0.6s ease-out.
5. NAVBAR BACKGROUND: Add 'scrolled' class to .navbar (or .page-header) when window.scrollY > 50, removing when back at top. CSS variable transition: background-color 0.3s ease.
6. STAT COUNTER ANIMATION: Animate .stat-number from 0 to its final value over 2 seconds when in viewport (use requestAnimationFrame, easeOutCubic easing). Parse the value (handle '50K+', '99.9%', '4.9/5' formats).
7. ACTIVE NAV LINK HIGHLIGHT: Use IntersectionObserver to track which section is currently in view and add 'active' class to corresponding .nav-links a. Remove from others.

DOMContentLoaded wrapper around all code. Add event listeners (not inline onclick). Use const/let (no var). Add a small console.log('Vibe Coder Pro loaded') at the end.

Output ONLY the <write> tag. No markdown, no commentary, no preamble.`;

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
