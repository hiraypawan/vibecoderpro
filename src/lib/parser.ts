export interface ToolBlock {
  type: 'write' | 'edit' | 'read' | 'run';
  path: string;
  content: string;
  search?: string;
  replace?: string;
  cmd?: string;
}

const WRITE_PATTERN = /<write\s+file=["']([^"']+)["'][^>]*>([\s\S]*?)<\/write>/g;
const EDIT_PATTERN = /<edit\s+file=["']([^"']+)["'][^>]*>([\s\S]*?)<\/edit>/g;
const READ_PATTERN = /<read\s+file=["']([^"']+)["'][^>]*\/>/g;
const RUN_PATTERN = /<run\s+cmd=["']([^"']+)["']\s*\/>/g;

// Markdown code block: ```lang\n...\n```
const MD_CODE_BLOCK = /```(\w+)?\n([\s\S]*?)```/g;

const LANG_EXT_MAP: Record<string, string> = {
  html: 'html', htm: 'html', css: 'css', js: 'javascript', javascript: 'javascript',
  ts: 'typescript', typescript: 'typescript', jsx: 'jsx', tsx: 'tsx',
  json: 'json', py: 'python', python: 'python', rb: 'ruby', go: 'go',
  rs: 'rust', java: 'java', md: 'markdown', sh: 'shell', bash: 'shell',
  yaml: 'yaml', yml: 'yaml', xml: 'xml', sql: 'sql', php: 'php',
};

// Standard filenames for each language
const STANDARD_NAMES: Record<string, string> = {
  html: 'index.html',
  css: 'styles.css',
  javascript: 'script.js',
  typescript: 'main.ts',
  jsx: 'App.jsx',
  tsx: 'App.tsx',
  json: 'package.json',
  python: 'main.py',
  ruby: 'main.rb',
  go: 'main.go',
  java: 'Main.java',
};

function inferFilename(lang: string, content: string, index: number, existingPaths: Set<string>): string | null {
  const ext = LANG_EXT_MAP[lang.toLowerCase()];
  if (!ext) return null;

  const standardName = STANDARD_NAMES[ext];

  // If standard name exists, UPDATE it (don't create new)
  if (standardName && existingPaths.has(standardName)) {
    return standardName;
  }

  // If standard name doesn't exist, use it
  if (standardName && !existingPaths.has(standardName)) {
    return standardName;
  }

  // Fallback: use lang + number
  const base = lang.toLowerCase();
  let candidate = `${base}_${index}.${ext === 'javascript' ? 'js' : ext === 'typescript' ? 'ts' : ext}`;
  let counter = 1;
  while (existingPaths.has(candidate)) {
    candidate = `${base}_${index}_${counter++}.${ext === 'javascript' ? 'js' : ext === 'typescript' ? 'ts' : ext}`;
  }
  return candidate;
}

// Fuzzy match: find the best match for search text in content
function fuzzyFind(content: string, search: string): number {
  // Try exact match first
  let idx = content.indexOf(search);
  if (idx !== -1) return idx;

  // Try with normalized whitespace
  const normalizedSearch = search.replace(/\s+/g, ' ').trim();
  const normalizedContent = content.replace(/\s+/g, ' ');
  idx = normalizedContent.indexOf(normalizedSearch);
  if (idx !== -1) return idx;

  // Try line-by-line matching
  const searchLines = search.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  if (searchLines.length > 0) {
    const contentLines = content.split('\n');
    for (let i = 0; i <= contentLines.length - searchLines.length; i++) {
      let match = true;
      for (let j = 0; j < searchLines.length; j++) {
        if (!contentLines[i + j]?.trim().includes(searchLines[j].substring(0, 50))) {
          match = false;
          break;
        }
      }
      if (match) {
        // Find the actual position in original content
        let pos = 0;
        for (let k = 0; k < i; k++) {
          pos = content.indexOf('\n', pos) + 1;
        }
        return pos;
      }
    }
  }

  return -1;
}

// Validate that edit won't delete too much code
function validateEdit(content: string, search: string, replace: string): { valid: boolean; reason?: string } {
  const searchLen = search.length;
  const replaceLen = replace.length;
  
  // If we're removing more than 50% of the search text, warn
  if (replaceLen < searchLen * 0.3 && searchLen > 100) {
    return { valid: false, reason: 'Edit would remove too much code' };
  }
  
  // If replace is empty and search is substantial, reject
  if (replaceLen === 0 && searchLen > 50) {
    return { valid: false, reason: 'Cannot delete code block' };
  }
  
  return { valid: true };
}

// Check if file content appears complete
function isFileComplete(path: string, content: string): boolean {
  if (!content || content.length === 0) return false;
  
  const ext = path.split('.').pop()?.toLowerCase() || '';
  
  // Check HTML files have closing tags
  if (ext === 'html' || ext === 'htm') {
    const hasClosingHtml = content.includes('</html>');
    const hasClosingBody = content.includes('</body>');
    // Lenient: at least one major closing tag present, or file is substantial
    if (!hasClosingHtml && !hasClosingBody && content.length < 200) return false;
  }
  
  // Check CSS files have balanced braces
  if (ext === 'css') {
    const openBraces = (content.match(/{/g) || []).length;
    const closeBraces = (content.match(/}/g) || []).length;
    // Allow up to 5 unbalanced braces for partial content
    if (Math.abs(openBraces - closeBraces) > 5) return false;
  }
  
  // Check JS/TS files have balanced braces
  if (ext === 'js' || ext === 'javascript' || ext === 'jsx' || ext === 'tsx' || ext === 'ts') {
    const openBraces = (content.match(/{/g) || []).length;
    const closeBraces = (content.match(/}/g) || []).length;
    // Allow up to 5 unbalanced braces
    if (Math.abs(openBraces - closeBraces) > 5) return false;
  }
  
  return true;
}

export function parseToolBlocks(text: string, existingPaths?: Set<string>): ToolBlock[] {
  const blocks: ToolBlock[] = [];
  const paths = existingPaths || new Set<string>();

  // 1. Parse explicit <write> tags
  for (const match of text.matchAll(WRITE_PATTERN)) {
    const path = match[1];
    const content = match[2].trim();
    // Validate write content is complete and not truncated
    if (content.length > 0 && !content.endsWith('...') && isFileComplete(path, content)) {
      blocks.push({ type: 'write', path, content });
      paths.add(path);
    }
  }

  // 2. Parse <edit> tags
  for (const match of text.matchAll(EDIT_PATTERN)) {
    const inner = match[2];
    const searchMatch = inner.match(/<search>([\s\S]*?)<\/search>/);
    const replaceMatch = inner.match(/<replace>([\s\S]*?)<\/replace>/);
    if (searchMatch && replaceMatch) {
      const search = searchMatch[1].trim();
      const replace = replaceMatch[1].trim();
      
      // Validate edit won't delete too much
      const validation = validateEdit('', search, replace);
      if (validation.valid && search.length > 0) {
        blocks.push({ type: 'edit', path: match[1], content: '', search, replace });
      }
    } else {
      // AI put full content inside <edit> without <search>/<replace> — treat as write
      const content = inner.trim();
      if (content.length > 0 && !content.endsWith('...') && isFileComplete(match[1], content)) {
        blocks.push({ type: 'write', path: match[1], content });
        paths.add(match[1]);
      }
    }
  }

  // 3. Parse <read> tags
  for (const match of text.matchAll(READ_PATTERN)) {
    blocks.push({ type: 'read', path: match[1], content: '' });
  }

  // 4. Parse <run> tags
  for (const match of text.matchAll(RUN_PATTERN)) {
    blocks.push({ type: 'run', path: '', content: '', cmd: match[1] });
  }

  // 5. Parse markdown code blocks as file writes (only if no <write> tags were found)
  const hasExplicitWrites = blocks.some((b) => b.type === 'write');
  if (!hasExplicitWrites) {
    let blockIndex = 0;
    for (const match of text.matchAll(MD_CODE_BLOCK)) {
      const lang = (match[1] || '').toLowerCase();
      const code = match[2].trim();
      if (!lang || !code || code.length < 10) continue;
      if (['json', 'yaml', 'yml', 'toml'].includes(lang)) continue;
      // Skip truncated code
      if (code.endsWith('...') || code.endsWith('// rest')) continue;

      const filename = inferFilename(lang, code, blockIndex, paths);
      if (filename) {
        blocks.push({ type: 'write', path: filename, content: code });
        paths.add(filename);
        blockIndex++;
      }
    }
  }

  return blocks;
}

export function buildSystemPrompt(files: Map<string, string>, graphDeps: boolean = false): string {
  const fileList = Array.from(files.keys()).join('\n');
  let prompt = `You are an elite AI Software Engineer in Vibe Coder Pro Cloud IDE.\n\nAvailable files:\n${fileList || '(no files)'}\n\nCreate/modify files using XML tags:\n<write file="path">content</write>\n<edit file="path"><search>code</search><replace>new code</replace></edit>`;
  if (graphDeps) {
    prompt += `\n\nGRAPHICAL PROJECT:\n- HTML Canvas Y-axis is positive-down\n- Use requestPointerLock() for mouse-look\n- WASD for movement, arrows for rotation\n- Multiply movement by deltaTime\n- Guard division by zero with epsilon (1e-10)`;
  }
  return prompt;
}

export function detectGraphicalDeps(files: Map<string, string>): boolean {
  const patterns = [/canvas/i, /requestAnimationFrame/i, /getContext\s*\(\s*['"]2d['"]\s*\)/i, /WebGL/i, /pointerLock/i];
  for (const [, content] of files) {
    for (const p of patterns) { if (p.test(content)) return true; }
  }
  return false;
}
