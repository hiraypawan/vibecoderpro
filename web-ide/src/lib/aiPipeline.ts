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
      if (!trimmed.startsWith('data:') || trimmed === 'data: [DONE]') continue;
      try {
        const chunk = JSON.parse(trimmed.slice(5));
        content += chunk.choices?.[0]?.delta?.content || '';
      } catch {}
    }
  }
  return content;
}

async function callModel(messages: ChatMessage[], opts?: { maxTokens?: number; temperature?: number }): Promise<string> {
  const response = await postChatCompletion({
    messages,
    stream: true,
    max_tokens: opts?.maxTokens ?? 65536,
    temperature: opts?.temperature ?? 0.3,
  }, 'pipeline');
  if (!response.ok) throw new Error(`API ${response.status}`);
  return readStream(response);
}

// ─── Quality Checker (local, no API call) ────────────────────────────────────

export interface QualityIssue {
  type: 'truncation' | 'placeholder' | 'syntax' | 'incomplete' | 'consistency';
  file: string;
  detail: string;
}

export function checkLocalQuality(blocks: Array<{ type: string; path: string; content: string }>): QualityIssue[] {
  const issues: QualityIssue[] = [];
  for (const block of blocks) {
    if (block.type !== 'write' || !block.content) continue;
    const c = block.content;
    const path = block.path;

    // Check truncation: file ends mid-statement
    const lastLine = c.trim().split('\n').pop()?.trim() || '';
    if (c.length > 500 && !lastLine.endsWith('}') && !lastLine.endsWith(';') && !lastLine.endsWith('>') && !lastLine.endsWith('*/') && !lastLine.endsWith("'") && !lastLine.endsWith('"') && !lastLine.endsWith('`')) {
      issues.push({ type: 'truncation', file: path, detail: `File ends abruptly: "${lastLine.substring(0, 60)}"` });
    }

    // Check placeholders
    const placeholderPatterns = [/\.{3,}/g, /\/\/\s*(rest of|remaining|similar|etc|TODO|FIXME|HACK)/gi, /\/\*\s*\.\.\./g, /# TODO/gi];
    for (const pat of placeholderPatterns) {
      if (pat.test(c)) {
        issues.push({ type: 'placeholder', file: path, detail: `Contains placeholder: ${c.match(pat)?.[0]}` });
        break;
      }
    }

    // Check HTML bracket balance
    if (path.endsWith('.html')) {
      const opens = (c.match(/<(html|head|body|div|section|main|header|footer|nav|aside|article|form|ul|ol|table|select)\b/gi) || []).length;
      const closes = (c.match(/<\/(html|head|body|div|section|main|header|footer|nav|aside|article|form|ul|ol|table|select)>/gi) || []).length;
      if (opens > closes + 1) {
        issues.push({ type: 'syntax', file: path, detail: `${opens} opening tags vs ${closes} closing tags` });
      }
    }

    // Check JS/CSS bracket balance
    if (path.endsWith('.js') || path.endsWith('.css') || path.endsWith('.ts')) {
      const braces = (c.match(/{/g) || []).length - (c.match(/}/g) || []).length;
      if (Math.abs(braces) > 1) {
        issues.push({ type: 'syntax', file: path, detail: `Unbalanced braces: ${braces > 0 ? '+' : ''}${braces}` });
      }
    }
  }

  // Cross-file consistency: HTML class names vs CSS selectors
  const htmlBlocks = blocks.filter(b => b.type === 'write' && b.path.endsWith('.html'));
  const cssBlocks = blocks.filter(b => b.type === 'write' && b.path.endsWith('.css'));
  const jsBlocks = blocks.filter(b => b.type === 'write' && (b.path.endsWith('.js') || b.path.endsWith('.ts')));

  for (const html of htmlBlocks) {
    // Extract class names from HTML
    const classNames = new Set<string>();
    const classMatches = html.content.matchAll(/class=["']([^"']+)["']/g);
    for (const m of classMatches) {
      m[1].split(/\s+/).forEach(cls => {
        if (cls.length > 1 && !cls.match(/^(fa[srb]?|fas|fab|active|visible|open|closed|hover|focus|hidden|show|hide|toggle|btn|link|text|font|d-none|d-flex|d-block|container|row|col)$/)) {
          classNames.add(cls);
        }
      });
    }

    if (classNames.size < 3) continue; // Too few classes to validate

    // Check CSS references at least some HTML classes
    for (const css of cssBlocks) {
      let matched = 0;
      let checked = 0;
      for (const cls of classNames) {
        checked++;
        if (css.content.includes(cls)) matched++;
      }
      const matchRate = checked > 0 ? matched / checked : 0;
      if (matchRate < 0.3 && checked >= 5) {
        issues.push({
          type: 'consistency',
          file: css.path,
          detail: `CSS only references ${Math.round(matchRate * 100)}% of HTML class names (${matched}/${checked}). Selectors likely mismatch HTML.`,
        });
      }
    }

    // Check JS references at least some HTML classes
    for (const js of jsBlocks) {
      let matched = 0;
      let checked = 0;
      for (const cls of classNames) {
        checked++;
        if (js.content.includes(cls)) matched++;
      }
      const matchRate = checked > 0 ? matched / checked : 0;
      if (matchRate < 0.2 && checked >= 5) {
        issues.push({
          type: 'consistency',
          file: js.path,
          detail: `JS only references ${Math.round(matchRate * 100)}% of HTML class names (${matched}/${checked}). querySelector calls likely crash.`,
        });
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

export async function runMultiAgentPipeline(opts: PipelineOptions): Promise<PipelineResult> {
  const { systemPrompt, fileContext, history, userMessage, existingFiles, onStreamUpdate, onPhaseChange } = opts;
  const isComplex = COMPLEXITY_KEYWORDS.test(userMessage);
  let retryCount = 0;
  const MAX_RETRIES = 1;

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
  const codingMessages: ChatMessage[] = [{ role: 'system', content: systemPrompt }];

  // Inject plan as context if available
  if (plan) {
    codingMessages.push({ role: 'system', content: `IMPLEMENTATION PLAN (follow this):\n${plan}` });
  }

  if (fileContext) codingMessages.push(fileContext);
  codingMessages.push(...history);
  codingMessages.push({ role: 'user', content: userMessage });

  let content = await callModel(codingMessages);
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

    const fixPrompt = `The previous response had these quality issues:\n${issues.map((i: QualityIssue) => `- ${i.file}: ${i.detail} (${i.type})`).join('\n')}\n\nPlease fix ALL issues and output the COMPLETE corrected files. Do NOT truncate or use placeholders.`;

    const fixMessages: ChatMessage[] = [
      { role: 'system', content: systemPrompt },
      ...codingMessages.slice(1), // include plan + file context + history
      { role: 'assistant', content },
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
