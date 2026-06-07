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
  // Try streaming first
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

  // Final fallback: try non-streaming with explicit model override
  const fallbackModels = ['meta-llama/Llama-3.3-70B-Instruct', 'deepseek-ai/DeepSeek-V3-0324'];
  for (const model of fallbackModels) {
    try {
      const response = await postChatCompletion({
        messages,
        model,
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
  }

  throw new Error('All models failed — no content returned');
}

// ─── Quality Checker (local, no API call) ────────────────────────────────────

export interface QualityIssue {
  type: 'truncation' | 'placeholder' | 'syntax' | 'incomplete';
  file: string;
  detail: string;
}

export function checkLocalQuality(blocks: Array<{ type: string; path: string; content: string }>): QualityIssue[] {
  const issues: QualityIssue[] = [];
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

      plan = await callModel(planMessages, { maxTokens: 1024, temperature: 0.2 });
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
    const fileSpecs = [
      { ext: 'html', prompt: `Create a COMPLETE index.html file for this request. Use <write file="index.html"> tags. Include ALL sections with REAL content — no placeholders. 200+ lines.` },
      { ext: 'css', prompt: `Create a COMPLETE styles.css file for this request. Use <write file="styles.css"> tags. Include ALL styles with CSS variables, responsive design, dark theme. 200+ lines.` },
      { ext: 'js', prompt: `Create a COMPLETE script.js file for this request. Use <write file="script.js"> tags. Include ALL interactivity — mobile menu, smooth scroll, animations. 80+ lines.` },
    ];
    
    const allContents: string[] = [];
    
    for (const spec of fileSpecs) {
      try {
        const fileMessages: ChatMessage[] = [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `${userMessage}\n\n${spec.prompt}` },
        ];
        
        const fileContent = await callModel(fileMessages);
        if (fileContent.length > 50) {
          allContents.push(fileContent);
          onStreamUpdate(allContents.join('\n\n'), `Generated ${spec.ext}...`);
        }
      } catch {
        // If one file fails, continue with others
      }
    }
    
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
