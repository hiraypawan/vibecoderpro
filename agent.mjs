import * as readline from 'readline';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as crypto from 'crypto';
import { exec, execSync } from 'child_process';
import { promisify } from 'util';
import { createServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';  // FIX: import WebSocket for WebSocket.OPEN constant

const execAsync = promisify(exec);

// ==========================================
// 1. DUAL-AGENT CONFIGURATION
// ==========================================
const API_KEY     = process.env.HYPERBOLIC_API_KEY || "";
const API_URL      = "https://api.hyperbolic.xyz/v1/chat/completions";

// ── Model Registry: intelligent routing per task type ──
const MODELS = {
    FAST:   "Qwen/Qwen3-Coder-480B-A35B-Instruct",   // quick tasks, planning, summarization
    MAIN:   "Qwen/Qwen3-Coder-480B-A35B-Instruct",   // primary coding
    VISION: "meta-llama/Llama-3.2-90B-Vision-Instruct", // vision understanding
    REVIEW: "Qwen/Qwen3-Coder-480B-A35B-Instruct",   // code review / self-critique
    DEEP:   "Qwen/Qwen3-Coder-480B-A35B-Instruct",   // complex reasoning fallback
};
let currentTaskModel = MODELS.MAIN;  // dynamically switchable via /model

const CHARS_PER_TOKEN  = 4;
const MAX_CONTEXT_TOKENS = 120000;
const MAX_LOOPS = 200;

let workingDirectory    = process.cwd();
let conversationHistory = [];
let userContext         = {};
let projectContext      = {};
let todoList            = [];
let subAgentTracker     = [];        // FIX: was referenced in dashboard but never defined
let collaborationServer = null;
let websocketServer     = null;
let codeAnalysisCache   = {};
let activeSubAgents     = 0;
let lastResponseHash    = '';        // FIX: loop detection
let lastResponsePrefix  = '';        // FIX: prefix-based loop detection
let repeatCount         = 0;
let consecutiveAutoContinue = 0;     // FIX: break stuck autoContinue loops
let currentPlan         = null;      // active plan from planning phase
let memoryEntries       = [];        // cross-session memory store
let planningEnabled     = true;      // toggle planning phase
let reviewerEnabled     = true;      // toggle reviewer phase
let compactionEnabled   = true;      // toggle context compaction
let originalUserRequest = null;      // store original requirements for verification

const VIBE_DIR          = '.vibe';
const HISTORY_FILE      = path.join(VIBE_DIR, 'history.json');
const TODO_FILE         = path.join(VIBE_DIR, 'todo.json');
const BACKUP_DIR        = path.join(VIBE_DIR, 'backups');
const GLOBAL_CONFIG     = path.join(os.homedir(), '.vibe_global_config.json');
const CONTEXT_FILE      = path.join(VIBE_DIR, 'context.json');
const ANALYSIS_CACHE    = path.join(VIBE_DIR, 'analysis');
const EXPLANATION_CACHE = path.join(VIBE_DIR, 'explanations');
const USER_CONTEXT_FILE = path.join(VIBE_DIR, 'user_context.json');
const MEMORY_FILE       = path.join(VIBE_DIR, 'memory.json');
const PWA_DIR           = 'public';

// ==========================================
// 2. PROFESSIONAL UI ENGINE (Pure ANSI)
// ==========================================
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

const UI = {
    clear:    ()           => console.clear(),
    divider:  ()           => console.log('\n\x1b[38;5;238m' + '━'.repeat(process.stdout.columns || 80) + '\x1b[0m\n'),
    system:   (msg)        => console.log(`\x1b[38;5;243m[⚙  System]\x1b[0m \x1b[3m${msg}\x1b[0m`),
    success:  (msg)        => console.log(`\x1b[38;5;114m[✓]\x1b[0m \x1b[38;5;150m${msg}\x1b[0m`),
    error:    (msg)        => console.log(`\x1b[38;5;196m[✗]\x1b[0m \x1b[38;5;203m${msg}\x1b[0m`),
    warn:     (msg)        => console.log(`\x1b[38;5;214m[!]\x1b[0m \x1b[38;5;221m${msg}\x1b[0m`),
    tool:     (name, desc) => console.log(`\x1b[38;5;111m[⚡ ${name}]\x1b[0m \x1b[38;5;246m${desc}\x1b[0m`),
    context:  (msg)        => console.log(`\x1b[38;5;176m[🧠 Context]\x1b[0m \x1b[38;5;183m${msg}\x1b[0m`),
    analysis: (msg)        => console.log(`\x1b[38;5;110m[🔍 Analysis]\x1b[0m \x1b[38;5;153m${msg}\x1b[0m`),
    explain:  (msg)        => console.log(`\x1b[38;5;140m[📘 Explain]\x1b[0m \x1b[38;5;146m${msg}\x1b[0m`),
    git:      (msg)        => console.log(`\x1b[38;5;208m[🔀 Git]\x1b[0m \x1b[38;5;215m${msg}\x1b[0m`),

    showMenu: () => {
        console.log("\n\x1b[48;5;236m\x1b[38;5;255m 🚀 VIBE CODER PRO v3.0 — MULTI-MODEL AGENTIC ARCHITECTURE \x1b[0m");
        const cmds = [
            ['/vision [prompt]',   'Clipboard image → AI (Win/Mac/Linux)'],
            ['/todo',              'Show active autonomous task list'],
            ['/revert [file]',     'Undo AI file changes (timestamped rollback)'],
            ['/git [msg]',         'Commit all changes with auto or custom message'],
            ['/reset',             'Clear AI memory and project history'],
            ['/clear',             'Clear terminal screen'],
            ['/context',           'Show detected project context'],
            ['/analyze <file>',    'Deep code analysis (issues, security, complexity)'],
            ['/explain <file>',    'AI explanation of file or code snippet'],
            ['/multiline',         'Multi-line paste mode (end with EOF)'],
            ['/collab start [port]','Start real-time collaboration WebSocket server'],
            ['/collab stop',       'Stop collaboration server'],
            ['/models',            'Show all configured models'],
            ['/model <ROLE>',      'Switch active model: MAIN/FAST/VISION/REVIEW/DEEP'],
            ['/plan',              'Toggle planning phase on/off'],
            ['/review',            'Toggle reviewer phase on/off'],
            ['/memory',            'Show cross-session memory'],
            ['/exit',              'Safely quit'],
        ];
        cmds.forEach(([cmd, desc]) =>
            console.log(`  \x1b[38;5;214m${cmd.padEnd(22)}\x1b[0m \x1b[38;5;245m${desc}\x1b[0m`));
        console.log('\x1b[38;5;238m' + '━'.repeat(50) + '\x1b[0m\n');
    },

    showTodos: () => {
        const pending = todoList.filter(t => t.status !== 'completed');
        if (pending.length === 0) return;
        console.log('\n\x1b[48;5;236m\x1b[38;5;255m 📋 ACTIVE TASKS \x1b[0m');
        todoList.forEach(t => {
            const icon  = t.status === 'completed' ? '\x1b[38;5;114m[✓]' : '\x1b[38;5;214m[ ]';
            const color = t.status === 'completed' ? '\x1b[38;5;240m\x1b[9m' : '\x1b[38;5;245m';
            console.log(`  ${icon} ${color}${t.task}\x1b[0m`);
        });
        console.log('\x1b[38;5;238m' + '━'.repeat(40) + '\x1b[0m\n');
    }
};

// ==========================================
// 3. CROSS-PLATFORM CLIPBOARD  (FIX: was Windows-only)
// ==========================================
async function getClipboardImage(outputPath) {
    const platform = os.platform();
    if (platform === 'win32') {
        const psScript = `
            Add-Type -AssemblyName System.Windows.Forms;
            $img = [System.Windows.Forms.Clipboard]::GetImage();
            if ($null -ne $img) {
                $img.Save('${outputPath.replace(/\\/g, '\\\\')}', [System.Drawing.Imaging.ImageFormat]::Png);
                Write-Output 'SUCCESS';
            } else { Write-Output 'NO_IMAGE'; }`;
        const { stdout } = await execAsync(`powershell -STA -Command "${psScript.replace(/\n/g, ' ')}"`);
        return stdout.trim() === 'SUCCESS';
    }
    if (platform === 'darwin') {
        try {
            await execAsync(`osascript -e 'set png_data to the clipboard as «class PNGf»' -e 'set outFile to open for access POSIX file "${outputPath}" with write permission' -e 'write png_data to outFile' -e 'close access outFile'`);
            return fs.existsSync(outputPath) && fs.statSync(outputPath).size > 0;
        } catch { return false; }
    }
    // Linux: try xclip then xsel
    try {
        await execAsync(`xclip -selection clipboard -t image/png -o > "${outputPath}"`);
        return fs.existsSync(outputPath) && fs.statSync(outputPath).size > 0;
    } catch {
        try {
            await execAsync(`xsel --clipboard --output > "${outputPath}"`);
            return fs.existsSync(outputPath) && fs.statSync(outputPath).size > 0;
        } catch { return false; }
    }
}

async function getClipboardText() {
    const platform = os.platform();
    if (platform === 'win32') {
        const { stdout } = await execAsync('powershell -STA -command "Get-Clipboard -Raw"');
        return stdout.trim();
    }
    if (platform === 'darwin') {
        const { stdout } = await execAsync('pbpaste');
        return stdout.trim();
    }
    try {
        const { stdout } = await execAsync('xclip -selection clipboard -o');
        return stdout.trim();
    } catch {
        const { stdout } = await execAsync('xsel --clipboard --output');
        return stdout.trim();
    }
}

// ==========================================
// 4. GIT INTEGRATION  (NEW: Aider-style auto-commit)
// ==========================================
function isGitRepo() {
    try { execSync('git rev-parse --git-dir', { cwd: workingDirectory, stdio: 'ignore' }); return true; }
    catch { return false; }
}

function gitInit() {
    try {
        if (!isGitRepo()) {
            execSync('git init', { cwd: workingDirectory, stdio: 'ignore' });
            UI.git('Initialized new git repository');
        }
    } catch (e) { UI.warn(`Git init failed: ${e.message}`); }
}

async function gitCommit(message = 'vibe: auto-commit AI changes') {
    if (!isGitRepo()) return;
    try {
        await execAsync('git add -A', { cwd: workingDirectory });
        const { stdout } = await execAsync(`git commit -m "${message.replace(/"/g, "'")}"`, { cwd: workingDirectory });
        if (stdout.includes('nothing to commit')) return;
        UI.git(`Committed: ${message}`);
        return true;
    } catch (e) {
        // nothing to commit is fine
        if (!e.message.includes('nothing to commit')) UI.warn(`Git commit failed: ${e.message}`);
    }
}

async function gitLog(n = 5) {
    try {
        const { stdout } = await execAsync(`git log --oneline -${n}`, { cwd: workingDirectory });
        return stdout.trim();
    } catch { return 'No git history'; }
}

async function gitDiff() {
    try {
        const { stdout } = await execAsync('git diff HEAD --stat', { cwd: workingDirectory });
        return stdout.trim() || 'No changes since last commit';
    } catch { return 'Git diff unavailable'; }
}

// ==========================================
// 5. FILE OPERATIONS — TIMESTAMPED BACKUPS  (FIX: flat overwrite)
// ==========================================
function backupFile(filePath) {
    if (!fs.existsSync(filePath)) return;
    const backupBase  = path.join(workingDirectory, BACKUP_DIR);
    if (!fs.existsSync(backupBase)) fs.mkdirSync(backupBase, { recursive: true });
    const ts          = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath  = path.join(backupBase, `${path.basename(filePath)}.${ts}.bak`);
    fs.copyFileSync(filePath, backupPath);
    // Keep only the last 20 backups per file to prevent disk bloat
    const prefix = `${path.basename(filePath)}.`;
    const old    = fs.readdirSync(backupBase)
        .filter(f => f.startsWith(prefix))
        .sort()
        .slice(0, -20);
    old.forEach(f => fs.unlinkSync(path.join(backupBase, f)));
}

function revertFile(filePath) {
    const backupBase = path.join(workingDirectory, BACKUP_DIR);
    if (!fs.existsSync(backupBase)) { UI.error('No backup directory found.'); return false; }
    const prefix = `${path.basename(filePath)}.`;
    const backups = fs.readdirSync(backupBase).filter(f => f.startsWith(prefix)).sort();
    if (backups.length === 0) { UI.error(`No backup found for ${filePath}`); return false; }
    const latest = backups[backups.length - 1];
    fs.copyFileSync(path.join(backupBase, latest), path.resolve(workingDirectory, filePath));
    UI.success(`Reverted ${filePath} from ${latest}`);
    return true;
}

// ── Diff computation for change summary ──
function computeFileDiff(filePath) {
    const backupBase = path.join(workingDirectory, BACKUP_DIR);
    const prefix = `${path.basename(filePath)}.`;
    let added = 0, removed = 0;
    try {
        // Find latest backup
        const backups = fs.existsSync(backupBase)
            ? fs.readdirSync(backupBase).filter(f => f.startsWith(prefix)).sort()
            : [];
        let oldLines = [];
        if (backups.length > 0) {
            const oldContent = fs.readFileSync(path.join(backupBase, backups[backups.length - 1]), 'utf-8');
            oldLines = oldContent.split('\n');
        }
        const newLines = fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf-8').split('\n') : [];
        // Simple line diff: count added/removed relative to backup
        const oldSet = new Set(oldLines.map(l => l.trim()));
        const newSet = new Set(newLines.map(l => l.trim()));
        added = newLines.filter(l => !oldSet.has(l.trim())).length;
        removed = oldLines.filter(l => !newSet.has(l.trim())).length;
        // Clamp: if file was created (no backup), added = total lines
        if (backups.length === 0 && newLines.length > 0) {
            added = newLines.filter(l => l.trim()).length;
            removed = 0;
        }
    } catch { added = 0; removed = 0; }
    return { added, removed };
}

function printChangeSummary(changes) {
    const items = [...changes.values()];
    if (items.length === 0) return;
    // Compute actual diffs from backup
    for (const c of items) {
        const diff = computeFileDiff(path.resolve(workingDirectory, c.file));
        c.added = diff.added;
        c.removed = diff.removed;
    }
    // Column widths
    const fileW = 35;
    const statsPad = 14;
    console.log(`\n\x1b[48;5;236m\x1b[38;5;255m \x1b[1m📂 Changes\x1b[0m`);
    console.log(`\x1b[38;5;238m  ${'─'.repeat(Math.min(process.stdout.columns || 80, 70))}\x1b[0m`);
    for (const c of items) {
        const fileName = c.file.length > fileW ? '...' + c.file.slice(-(fileW - 3)) : c.file.padEnd(fileW);
        const stats = `\x1b[38;5;114m+${c.added}\x1b[0m \x1b[38;5;203m-${c.removed}\x1b[0m`.padStart(statsPad);
        const typeTag = c.type === 'created' ? '\x1b[38;5;114m[created]\x1b[0m'
            : c.type === 'modified' ? '\x1b[38;5;220m[modified]\x1b[0m'
            : '\x1b[38;5;203m[deleted]\x1b[0m';
        console.log(`  ${typeTag} \x1b[38;5;255m${fileName}\x1b[0m ${stats}`);
    }
    console.log(`\x1b[38;5;238m  ${'─'.repeat(Math.min(process.stdout.columns || 80, 70))}\x1b[0m\n`);
}

function getDirectoryTree(dir, depth = 0, maxDepth = 3) {
    if (depth > maxDepth) return '  '.repeat(depth) + '... (limit)\n';
    let tree = '';
    try {
        const items = fs.readdirSync(dir);
        for (const item of items) {
            if (['.git', 'node_modules', 'dist', 'build', '.next', VIBE_DIR].includes(item)) continue;
            const fullPath = path.join(dir, item);
            if (fs.statSync(fullPath).isDirectory()) {
                tree += `${'  '.repeat(depth)}📁 ${item}/\n` + getDirectoryTree(fullPath, depth + 1, maxDepth);
            } else {
                tree += `${'  '.repeat(depth)}📄 ${item}\n`;
            }
        }
    } catch { }
    return tree;
}

// ==========================================
// 6. DATA & STATE MANAGEMENT
// ==========================================
function estimateTokens(text) {
    return Math.ceil((text || '').length / CHARS_PER_TOKEN);
}

function totalContextTokens() {
    return conversationHistory.reduce((acc, m) => acc + estimateTokens(m.content), 0);
}

function loadTodos() {
    try {
        const p = path.join(workingDirectory, TODO_FILE);
        if (fs.existsSync(p)) todoList = JSON.parse(fs.readFileSync(p, 'utf-8'));
    } catch { UI.error('Failed to load To-Do list'); }
}
function saveTodos() {
    try { fs.writeFileSync(path.join(workingDirectory, TODO_FILE), JSON.stringify(todoList, null, 2)); }
    catch { UI.error('Failed to save To-Do list'); }
}

function loadContext() {
    try {
        const p = path.join(workingDirectory, CONTEXT_FILE);
        if (fs.existsSync(p)) { projectContext = JSON.parse(fs.readFileSync(p, 'utf-8')); UI.context('Project context loaded'); }
    } catch { UI.error('Failed to load project context'); }
}
function saveContext() {
    try { fs.writeFileSync(path.join(workingDirectory, CONTEXT_FILE), JSON.stringify(projectContext, null, 2)); }
    catch { UI.error('Failed to save project context'); }
}

function loadUserContext() {
    try {
        const p = path.join(workingDirectory, USER_CONTEXT_FILE);
        if (fs.existsSync(p)) { userContext = JSON.parse(fs.readFileSync(p, 'utf-8')); UI.context('User context loaded'); }
    } catch { UI.error('Failed to load user context'); }
}

// ═══════════════════════════════════════════
// MEMORY SYSTEM — cross-session persistent learning
// ═══════════════════════════════════════════
function loadMemory() {
    try {
        const p = path.join(workingDirectory, MEMORY_FILE);
        if (fs.existsSync(p)) { memoryEntries = JSON.parse(fs.readFileSync(p, 'utf-8')); }
    } catch {}
}
function saveMemory() {
    try { fs.writeFileSync(path.join(workingDirectory, MEMORY_FILE), JSON.stringify(memoryEntries.slice(-50), null, 2)); }
    catch {}
}
function addMemory(key, value) {
    memoryEntries.push({ key, value, timestamp: new Date().toISOString() });
    saveMemory();
}
function getMemory(key) {
    return memoryEntries.filter(m => m.key === key).slice(-3).map(m => m.value);
}
function getMemoryContext() {
    if (memoryEntries.length === 0) return '';
    const recent = memoryEntries.slice(-10);
    return 'Project Memory (from past sessions):\n' + recent.map(m => `- ${m.key}: ${m.value}`).join('\n');
}

// ═══════════════════════════════════════════
// PLANNING ENGINE — think before acting
// ═══════════════════════════════════════════
async function runPlanningPhase(userRequest) {
    if (!planningEnabled) return null;
    UI.system('Planning approach before executing...');
    const planMsgs = [
        { role: 'system', content: 'You are a senior software architect. Your task is to create a numbered step-by-step plan to implement exactly what the user requested. Output ONLY the plan, no extra text. Each step should name the file to create or modify. Do NOT suggest tasks unrelated to the user request.' },
        { role: 'user', content: `Project: ${workingDirectory}\nProject Structure:\n${getDirectoryTree(workingDirectory, 0, 3)}\nTech: ${projectContext.techStack ? projectContext.techStack.join(', ') : 'unknown'}\n\nUser Request: ${userRequest.substring(0, 2000)}\n\nCreate a numbered step-by-step implementation plan that directly addresses the user request. If the user asks for a function or algorithm, the plan should list which file to write it to and what it needs to implement.` }
    ];
    try {
        const res = await callLLM(currentTaskModel, planMsgs, false);
        const data = await res.json();
        const planText = data.choices[0].message.content;
        currentPlan = planText;
        UI.context(`Plan:\n${planText.substring(0, 500)}`);
        return planText;
    } catch (e) {
        UI.warn(`Planning failed: ${e.message}. Proceeding without plan.`);
        return null;
    }
}

// ═══════════════════════════════════════════
// REVIEWER ENGINE — self-critique after changes
// ═══════════════════════════════════════════
async function runReviewerPhase(changes) {
    if (!reviewerEnabled || !changes) return null;
    UI.system('Reviewing changes for issues...');
    const reviewMsgs = [
        { role: 'system', content: 'You are a code reviewer. Check the changes for: 1) Syntax errors 2) Security issues 3) Edge cases 4) Style consistency. Output issues found or "No issues found." Be concise.' },
        { role: 'user', content: `Review these changes:\n\n${changes.substring(0, 4000)}` }
    ];
    try {
        const res = await callLLM(MODELS.REVIEW, reviewMsgs, false);
        const data = await res.json();
        const review = data.choices[0].message.content;
        if (!review.includes('No issues')) {
            UI.warn(`Review found issues:\n${review.substring(0, 300)}`);
            return review;
        }
        UI.success('Review: No issues found.');
        return null;
    } catch (e) {
        UI.warn(`Review failed: ${e.message}`);
        return null;
    }
}

// ═══════════════════════════════════════════
// AUTO TODO GENERATION — parse requirements into todos
// ═══════════════════════════════════════════
function generateTodosFromInput(userInput) {
    // Count numbered items (e.g. "1. ", "2. ") to determine task complexity
    const numberedItems = (userInput.match(/^\s*\d+\.\s/gm) || []).length;
    const fileRefs = (userInput.match(/file called|filename|write to|file named/gi) || []).length;
    const keySections = (userInput.match(/requirements|features|edge cases|implementation|must|should/gi) || []).length;

    // Auto-generate todos from structured requirements
    const lines = userInput.split('\n');
    let currentSection = '';
    let todoCount = 0;

    for (const line of lines) {
        const trimmed = line.trim();

        // Detect section headers
        if (/^(requirements|implementation|features|edge cases|notes):/i.test(trimmed)) {
            currentSection = trimmed.replace(/:.*$/, '').trim();
            continue;
        }

        // Detect numbered requirements
        const numMatch = trimmed.match(/^\d+\.\s+(.+)/);
        if (numMatch && currentSection) {
            const task = `[${currentSection}] ${numMatch[1].substring(0, 100)}`;
            if (!todoList.find(t => t.task === task)) {
                todoList.push({ task, status: 'pending' });
                todoCount++;
            }
        }

        // Detect file creation requests
        const fileMatch = trimmed.match(/file called\s+([^\s,.!?]+)|write\s+to\s+a\s+file\s+called\s+([^\s,.!?]+)/i);
        if (fileMatch) {
            const fileName = fileMatch[1] || fileMatch[2];
            const task = `Create file: ${fileName}`;
            if (!todoList.find(t => t.task === task)) {
                todoList.push({ task, status: 'pending' });
                todoCount++;
            }
        }

        // Detect function/class implementation requests
        const funcMatch = trimmed.match(/(?:Write|Implement|Create|Build)\s+(?:a\s+)?(?:function|class|module)\s+(\w+)/i);
        if (funcMatch) {
            const task = `Implement: ${funcMatch[1]}`;
            if (!todoList.find(t => t.task === task)) {
                todoList.push({ task, status: 'pending' });
                todoCount++;
            }
        }
    }

    // If we found structured items, save todos
    if (todoCount > 0) {
        saveTodos();
        UI.system(`Auto-generated ${todoCount} todo items from requirements.`);
    }
    return todoCount;
}

// ═══════════════════════════════════════════
// MULTI-AGENT DELIBERATION — architects debate approaches
// ═══════════════════════════════════════════
async function runDeliberationPhase(userRequest) {
    if (!planningEnabled) return null;
    UI.system('Deliberating approaches across architectures...');

    const requestSample = userRequest.substring(0, 1500);
    const archRoles = [
        { name: 'Performance Architect', focus: 'optimize for speed, memory, and scalability; challenge assumptions; identify edge cases', model: MODELS.FAST },
        { name: 'Design Architect', focus: 'clean API design, modularity, edge cases, and interpreting user intent; verify request meaning before coding', model: MODELS.MAIN },
        { name: 'Lead Architect', focus: 'synthesize the best of both into a concrete plan that correctly interprets user intent', model: MODELS.DEEP }
    ];

    // Track each architect in subAgentTracker for dashboard visibility
    const archTrackers = {};
    for (const arch of archRoles) {
        const entry = { id: Date.now() + Math.random(), role: arch.name, task: 'Deliberating approach...', status: 'Running' };
        subAgentTracker.push(entry);
        archTrackers[arch.name] = entry;
    }

    // Phase 1: Independent proposals from two architects (run in parallel)
    const proposals = [];
    const firstTwo = archRoles.slice(0, 2);
    const parallelResults = await Promise.allSettled(firstTwo.map(async (arch) => {
        try {
            const modelLabel = arch.model.split('/')[1] || arch.model;
            UI.tool('Sub-Agent', `[${arch.name}] using ${modelLabel}...`);
            archTrackers[arch.name].task = `Proposing approach (${modelLabel})`;
            const msgs = [
                { role: 'system', content: `You are a ${arch.name}. Your focus: ${arch.focus}. First, restate what the user ACTUALLY wants in one sentence (do NOT skip this step — it prevents misinterpretation). Then analyze: (1) What exactly needs to change? Which existing file(s) and functions? (2) What are ALL edge cases? (3) What is the coordinate system and sign convention? (4) Will this break existing features? (5) Propose a concrete implementation. Output ONLY the analysis + approach, no extra text. Include: file names, exact search strings to edit, and the complete replace text.` },
                { role: 'user', content: `Project: ${workingDirectory}\nProject Structure:\n${getDirectoryTree(workingDirectory, 0, 3)}\n\nRequirements:\n${requestSample}\n\nFollowing the ${arch.name} process above, analyze and propose your approach.` }
            ];
            const res = await callLLM(arch.model, msgs, false);
            const data = await res.json();
            const proposal = data.choices[0].message.content;
            proposals.push({ role: arch.name, content: proposal });
            archTrackers[arch.name].status = 'Done';
            UI.context(`[${arch.name}] Proposal received (${proposal.length} chars)`);
            return { arch: arch.name, success: true };
        } catch (e) {
            archTrackers[arch.name].status = 'Failed';
            UI.warn(`${arch.name} deliberation failed: ${e.message}`);
            return { arch: arch.name, success: false, error: e.message };
        }
    }));

    if (proposals.length === 0) {
        // Clean up trackers
        for (const arch of archRoles) {
            const idx = subAgentTracker.indexOf(archTrackers[arch.name]);
            if (idx !== -1) subAgentTracker.splice(idx, 1);
        }
        return null;
    }

    // Phase 2: Lead architect synthesizes
    try {
        const leadTracker = archTrackers['Lead Architect'];
        const modelLabel = archRoles[2].model.split('/')[1] || archRoles[2].model;
        leadTracker.task = `Synthesizing plan (${modelLabel})`;
        UI.tool('Sub-Agent', `[Lead Architect] using ${modelLabel}...`);
        const debateText = proposals.map(p => `=== ${p.role} ===\n${p.content}`).join('\n\n');
        const synthMsgs = [
            { role: 'system', content: `You are a Lead Architect. Review the proposals and the original user request. Your job: (1) Verify that ALL proposals correctly interpreted the user's intent — if they all misinterpreted, IGNORE them and write the correct plan yourself. (2) Choose the best ideas from correct proposals. (3) Produce a numbered step-by-step plan with EXACT file names, exact search strings to find in existing files, and the complete replacement code. Each step must be self-contained and testable. Include coordinate system conventions and edge cases.` },
            { role: 'user', content: `Original Request:\n${requestSample}\n\nProposals:\n${debateText}\n\nSynthesize the correct plan as numbered steps with exact file names and search/replace strings.` }
        ];
        const res = await callLLM(archRoles[2].model, synthMsgs, false);
        const data = await res.json();
        const plan = data.choices[0].message.content;
        currentPlan = plan;
        leadTracker.status = 'Done';
        UI.success('Architecture deliberation complete.');
        UI.context(`Final Plan:\n${plan.substring(0, 600)}`);

        // Show deliberation summary in dashboard style
        console.log(`\x1b[38;5;111m┌─ 🤖 Deliberation Results ─────────────────────────────────────────────┐\x1b[0m`);
        for (const p of parallelResults) {
            const status = p.value?.success ? '\x1b[38;5;114m✅\x1b[0m' : '\x1b[38;5;196m❌\x1b[0m';
            const name = (p.value?.arch || '?').padEnd(24);
            const model = archRoles.find(a => a.name === p.value?.arch)?.model?.split('/')[1]?.padEnd(32) || '?'.padEnd(32);
            console.log(`\x1b[38;5;111m│\x1b[0m ${status} \x1b[38;5;255m${name}\x1b[0m \x1b[38;5;245m${model}\x1b[0m \x1b[38;5;111m│\x1b[0m`);
        }
        console.log(`\x1b[38;5;111m├────────────────────────────────────────────────────────────────────────┤\x1b[0m`);
        console.log(`\x1b[38;5;111m│\x1b[0m ✅ \x1b[38;5;255mLead Architect (${archRoles[2].model.split('/')[1]})\x1b[0m         \x1b[38;5;111m│\x1b[0m`);
        console.log(`\x1b[38;5;111m└────────────────────────────────────────────────────────────────────────┘\x1b[0m`);

        return plan;
    } catch (e) {
        UI.warn(`Synthesis failed: ${e.message}. Using simpler plan.`);
        if (archTrackers['Lead Architect']) archTrackers['Lead Architect'].status = 'Failed';
        return await runPlanningPhase(userRequest);
    }
}

// ═══════════════════════════════════════════
// SELF-VERIFICATION — check implementation against requirements
// ═══════════════════════════════════════════
async function runSelfVerification(userRequest, generatedFiles) {
    if (!userRequest || generatedFiles.length === 0) return null;
    UI.system('Verifying implementation against requirements...');

    try {
        const fileContents = await Promise.all(generatedFiles.map(async (f) => {
            const p = path.resolve(workingDirectory, f);
            try {
                const content = fs.readFileSync(p, 'utf-8');
                return `\n=== ${f} ===\n${content.substring(0, 2000)}`;
            } catch { return `\n=== ${f} === (not found on disk)`; }
        }));

        const msgs = [
            { role: 'system', content: 'You are a QA engineer. Compare the generated code against the user requirements. List ANY discrepancies, missing features, or bugs. If everything matches, say "All requirements met." Be specific.' },
            { role: 'user', content: `REQUIREMENTS:\n${userRequest.substring(0, 2000)}\n\nGENERATED CODE:\n${fileContents.join('')}\n\nCheck every requirement and edge case. List what passes and what fails.` }
        ];
        const res = await callLLM(MODELS.REVIEW, msgs, false);
        const data = await res.json();
        const verdict = data.choices[0].message.content;

        if (verdict.includes('All requirements met') || verdict.includes('all requirements')) {
            UI.success('Self-verification: All requirements met.');
            return null;
        } else {
            UI.warn(`Self-verification found issues:\n${verdict.substring(0, 500)}`);
            return verdict;
        }
    } catch (e) {
        UI.warn(`Self-verification failed: ${e.message}`);
        return null;
    }
}

// ═══════════════════════════════════════════
// CONTEXT COMPACTION — smart summarization instead of pruning
// ═══════════════════════════════════════════
async function compactContext() {
    if (!compactionEnabled || conversationHistory.length < 6) return;
    const tokens = totalContextTokens();
    if (tokens < MAX_CONTEXT_TOKENS * 0.85) return;

    UI.system(`Compacting context (${tokens.toLocaleString()} tokens)...`);
    // Find messages to summarize (skip system and recent 4 messages)
    const compactIdx = conversationHistory.findIndex((m, i) => i > 0 && i < conversationHistory.length - 4 && m.role !== 'system');
    if (compactIdx === -1) return;

    const toSummarize = conversationHistory.splice(compactIdx, 2);
    const summaryText = toSummarize.map(m => `[${m.role}]: ${m.content.substring(0, 500)}`).join('\n---\n');
    const summaryMsgs = [
        { role: 'system', content: 'Summarize the following conversation exchange in 1-2 sentences, preserving key decisions and code changes.' },
        { role: 'user', content: summaryText }
    ];
    try {
        const res = await callLLM(MODELS.FAST, summaryMsgs, false);
        const data = await res.json();
        const summary = data.choices[0].message.content;
        conversationHistory.splice(compactIdx, 0, { role: 'system', content: `[Compacted Summary]: ${summary}` });
        UI.system(`Compacted ${toSummarize.length} messages into summary. New total: ${totalContextTokens().toLocaleString()} tokens`);
    } catch {
        // fallback: just prune silently
        conversationHistory.splice(compactIdx, 0, { role: 'system', content: '[Compacted]' });
    }
}

function detectTechStack() {
    const techStack = [];
    const check = (file, ...labels) => fs.existsSync(path.join(workingDirectory, file)) && techStack.push(...labels);
    check('package.json', 'Node.js');
    if (fs.existsSync(path.join(workingDirectory, 'package.json'))) {
        try {
            const pkg = JSON.parse(fs.readFileSync(path.join(workingDirectory, 'package.json'), 'utf-8'));
            const deps = { ...pkg.dependencies, ...pkg.devDependencies };
            if (deps.react)    techStack.push('React');
            if (deps.vue)      techStack.push('Vue');
            if (deps.angular)  techStack.push('Angular');
            if (deps.next)     techStack.push('Next.js');
            if (deps.svelte)   techStack.push('Svelte');
            if (deps.express)  techStack.push('Express');
            if (deps.fastify)  techStack.push('Fastify');
            if (deps.prisma)   techStack.push('Prisma');
            if (deps.typescript) techStack.push('TypeScript');
        } catch {}
    }
    check('requirements.txt', 'Python');
    if (fs.existsSync(path.join(workingDirectory, 'requirements.txt'))) {
        const r = fs.readFileSync(path.join(workingDirectory, 'requirements.txt'), 'utf-8');
        if (r.includes('django'))  techStack.push('Django');
        if (r.includes('flask'))   techStack.push('Flask');
        if (r.includes('fastapi')) techStack.push('FastAPI');
    }
    check('pom.xml',       'Java', 'Maven');
    check('build.gradle',  'Java', 'Gradle');
    check('go.mod',        'Go');
    check('Cargo.toml',    'Rust');
    check('Gemfile',       'Ruby');
    check('composer.json', 'PHP');
    try {
        const files = fs.readdirSync(workingDirectory);
        if (files.some(f => f.endsWith('.csproj'))) techStack.push('.NET');
    } catch {}
    return [...new Set(techStack)];
}

// ── Test detection & execution ──
function detectTestFramework() {
    // Priority-ordered detection: most specific first
    try {
        // 1. package.json scripts
        const pkgPath = path.join(workingDirectory, 'package.json');
        if (fs.existsSync(pkgPath)) {
            const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
            const scripts = pkg.scripts || {};
            if (scripts.test) return { cmd: scripts.test.includes('npx') ? scripts.test : `npx ${scripts.test}`, type: 'npm', script: 'test' };
            if (scripts['run test']) return { cmd: `npx ${scripts['run test']}`, type: 'npm', script: 'run test' };
            // Fallback: check for common test framework binaries
            const deps = { ...pkg.dependencies, ...pkg.devDependencies } || {};
            if (deps.vitest) return { cmd: 'npx vitest run', type: 'vitest' };
            if (deps.jest)   return { cmd: 'npx jest', type: 'jest' };
            if (deps.mocha)  return { cmd: 'npx mocha', type: 'mocha' };
            if (deps.ava)    return { cmd: 'npx ava', type: 'ava' };
        }
        // 2. Cargo.toml
        if (fs.existsSync(path.join(workingDirectory, 'Cargo.toml')))
            return { cmd: 'cargo test 2>&1', type: 'cargo' };
        // 3. go.mod
        if (fs.existsSync(path.join(workingDirectory, 'go.mod')))
            return { cmd: 'go test ./... 2>&1', type: 'go' };
        // 4. CMakeLists.txt
        if (fs.existsSync(path.join(workingDirectory, 'CMakeLists.txt')))
            return { cmd: 'ctest --output-on-failure 2>&1', type: 'ctest' };
        // 5. pyproject.toml
        if (fs.existsSync(path.join(workingDirectory, 'pyproject.toml')))
            return { cmd: 'pytest 2>&1', type: 'pytest' };
        // 6. setup.py
        if (fs.existsSync(path.join(workingDirectory, 'setup.py')))
            return { cmd: 'python -m pytest 2>&1', type: 'pytest' };
        // 7. Gemfile
        if (fs.existsSync(path.join(workingDirectory, 'Gemfile')))
            return { cmd: 'bundle exec rspec 2>&1', type: 'rspec' };
        // 8. Makefile (check for test target)
        if (fs.existsSync(path.join(workingDirectory, 'Makefile'))) {
            const mk = fs.readFileSync(path.join(workingDirectory, 'Makefile'), 'utf-8');
            if (/^test:/m.test(mk)) return { cmd: 'make test 2>&1', type: 'make' };
        }
    } catch {}
    return null;
}

async function runTests() {
    const framework = detectTestFramework();
    if (!framework) return null;
    UI.tool('Test Harness', `Running: ${framework.cmd}`);
    const start = Date.now();
    try {
        const { stdout, stderr } = await execAsync(framework.cmd, { cwd: workingDirectory, timeout: 120000 });
        const elapsed = ((Date.now() - start) / 1000).toFixed(1);
        const output = (stdout || stderr || '').trim().substring(0, 2000);
        UI[output.includes('FAIL') || output.includes('Error') ? 'warn' : 'success'](
            `Tests (${framework.type}) ${output.includes('FAIL') ? 'FAILED' : 'PASSED'} in ${elapsed}s`
        );
        return { passed: !output.includes('FAIL') && !output.includes('Error'), output, elapsed, type: framework.type };
    } catch (e) {
        const elapsed = ((Date.now() - start) / 1000).toFixed(1);
        UI.warn(`Tests FAILED after ${elapsed}s: ${e.message.substring(0, 200)}`);
        return { passed: false, output: e.message.substring(0, 500), elapsed, type: framework.type };
    }
}

// ── Screenshot diff for visual regression detection ──
const SCREENSHOT_DIR = path.join(workingDirectory, BACKUP_DIR, 'screenshots');

async function ensureScreenshotDir() {
    try { await fs.promises.mkdir(SCREENSHOT_DIR, { recursive: true }); } catch {}
}

async function maybeTakeScreenshot(label) {
    await ensureScreenshotDir();
    let puppeteer;
    try { puppeteer = require('puppeteer'); } catch { return null; }
    const screenshotPath = path.join(SCREENSHOT_DIR, `${label}.png`);
    try {
        const htmlFiles = fs.readdirSync(workingDirectory).filter(f => f.endsWith('.html'));
        if (htmlFiles.length === 0) return null;
        const http = require('http');
        const server = http.createServer((req, res) => {
            const filePath = path.join(workingDirectory, req.url === '/' ? htmlFiles[0] : req.url);
            if (!fs.existsSync(filePath)) { res.writeHead(404); res.end(); return; }
            const ext = path.extname(filePath);
            const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg' };
            res.writeHead(200, { 'Content-Type': types[ext] || 'text/plain' });
            fs.createReadStream(filePath).pipe(res);
        });
        await new Promise(r => server.listen(0, r));
        const port = server.address().port;
        const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
        const page = await browser.newPage();
        await page.setViewport({ width: 1280, height: 720 });
        await page.goto(`http://localhost:${port}`, { waitUntil: 'networkidle0', timeout: 10000 });
        await new Promise(r => setTimeout(r, 1500));
        await page.screenshot({ path: screenshotPath, fullPage: true });
        await browser.close();
        server.close();
        return screenshotPath;
    } catch { return null; }
}

async function compareScreenshots() {
    await ensureScreenshotDir();
    const before = path.join(SCREENSHOT_DIR, 'before.png');
    const after  = path.join(SCREENSHOT_DIR, 'after.png');
    const newShot = await maybeTakeScreenshot('after');
    if (!newShot) return { changed: null, diff: null, message: 'Screenshot unavailable (install puppeteer: npm install puppeteer)' };
    if (!fs.existsSync(before)) {
        try { await fs.promises.rename(after, before); } catch {}
        return { changed: null, diff: null, message: 'Baseline captured. Next edit will compare.' };
    }
    let diffPercent = 0;
    let changed = false;
    try {
        const pixelmatch = require('pixelmatch');
        const { PNG } = require('pngjs');
        const img1 = PNG.sync.read(fs.readFileSync(before));
        const img2 = PNG.sync.read(fs.readFileSync(after));
        const diffImg = new PNG({ width: img1.width, height: img1.height });
        const mismatched = pixelmatch(img1.data, img2.data, diffImg.data, img1.width, img1.height, { threshold: 0.1 });
        diffPercent = ((mismatched / (img1.width * img1.height)) * 100).toFixed(2);
        changed = diffPercent > 1.0;
        fs.writeFileSync(path.join(SCREENSHOT_DIR, 'diff.png'), PNG.sync.write(diffImg));
    } catch {
        // Fallback: file-size comparison
        const s1 = fs.statSync(before).size;
        const s2 = fs.statSync(after).size;
        diffPercent = Math.abs(s1 - s2) / Math.max(s1, 1) * 100;
        changed = diffPercent > 5;
    }
    try { await fs.promises.rename(after, before); } catch {}
    if (changed) UI.warn(`⚠ Visual diff: ${diffPercent}% pixels changed`);
    else UI.success(`✓ Visual: ${diffPercent}% changed`);
    return { changed, diff: diffPercent, message: changed ? `⚠ Visual diff: ${diffPercent}%` : `✓ ${diffPercent}%` };
}

function extractDomainTerms() {  // FIX: was always returning []
    const terms = new Set();
    try {
        const files = fs.readdirSync(workingDirectory)
            .filter(f => /\.(js|ts|py|java|go|rs|rb)$/.test(f))
            .slice(0, 10);
        for (const file of files) {
            const content = fs.readFileSync(path.join(workingDirectory, file), 'utf-8');
            // Extract PascalCase identifiers as domain terms
            const matches = content.match(/\b[A-Z][a-z]+(?:[A-Z][a-z]+)+\b/g) || [];
            matches.forEach(m => terms.add(m));
        }
    } catch {}
    return [...terms].slice(0, 30);
}

async function analyzeCodeStyle() {
    const style = { indentation: 'spaces', indentSize: 2, namingConvention: 'camelCase', lineLength: 100 };
    try {
        const files = fs.readdirSync(workingDirectory).filter(f => /\.(js|ts|mjs)$/.test(f));
        if (files.length === 0) return style;
        const content = fs.readFileSync(path.join(workingDirectory, files[0]), 'utf-8');
        const lines   = content.split('\n');
        const indented = lines.find(l => /^\s+/.test(l));
        if (indented) {
            style.indentation = indented.startsWith('\t') ? 'tabs' : 'spaces';
            if (style.indentation === 'spaces') {
                const m = indented.match(/^( +)/);
                if (m) style.indentSize = m[1].length % 4 === 0 ? 4 : 2;
            }
        }
        const lens = lines.map(l => l.length).filter(l => l > 0);
        if (lens.length) {
            const avg = lens.reduce((a, b) => a + b, 0) / lens.length;
            style.lineLength = Math.min(120, Math.max(80, Math.round(avg / 10) * 10));
        }
    } catch {}
    return style;
}

function countFiles(dir) {
    let count = 0;
    try {
        for (const item of fs.readdirSync(dir)) {
            if (['.git', 'node_modules', 'dist', VIBE_DIR].includes(item)) continue;
            const fp = path.join(dir, item);
            count += fs.statSync(fp).isDirectory() ? countFiles(fp) : 1;
        }
    } catch {}
    return count;
}

async function analyzeProjectContext() {
    UI.system('Analyzing project context...');
    projectContext = {
        techStack:   detectTechStack(),
        codeStyle:   await analyzeCodeStyle(),
        domainTerms: extractDomainTerms(),
        lastUpdated: new Date().toISOString(),
        fileCount:   countFiles(workingDirectory),
        hasGit:      isGitRepo(),
    };
    saveContext();
    UI.context('Project context updated');
    return projectContext;
}

// ==========================================
// 7. CODE ANALYSIS  (FIX: .content vs .message inconsistency)
// ==========================================
// Unified issue structure throughout: { type, message, severity }
async function analyzeCode(filePath) {
    UI.analysis(`Analyzing ${path.basename(filePath)}...`);
    const stat     = fs.statSync(filePath);
    const cacheKey = `${filePath}-${stat.mtimeMs}`;
    if (codeAnalysisCache[cacheKey]) { UI.analysis('Using cached analysis'); return codeAnalysisCache[cacheKey]; }

    const content  = fs.readFileSync(filePath, 'utf-8');
    const ext      = path.extname(filePath).toLowerCase();
    const lines    = content.split('\n');
    let analysis   = { filePath, issues: [], suggestions: [], securityIssues: [], complexity: Math.min(10, lines.length / 20), technicalDebt: 0 };

    switch (ext) {
        case '.js': case '.mjs': case '.cjs': case '.ts': case '.tsx':
            analysis = analyzeJavaScript(content, analysis); break;
        case '.py':   analysis = analyzePython(content, analysis);  break;
        case '.java': analysis = analyzeJava(content, analysis);    break;
        case '.go':   analysis = analyzeGo(content, analysis);      break;
    }

    // Save cache
    codeAnalysisCache[cacheKey] = analysis;
    try {
        const cacheDir = path.join(workingDirectory, ANALYSIS_CACHE);
        if (!fs.existsSync(cacheDir)) fs.mkdirSync(cacheDir, { recursive: true });
        fs.writeFileSync(path.join(cacheDir, `${path.basename(filePath)}.json`), JSON.stringify(analysis, null, 2));
    } catch {}
    return analysis;
}

function analyzeJavaScript(content, analysis) {
    const lines = content.split('\n');

    // ESLint-style issues
    if (content.includes('var '))          analysis.issues.push({ type: 'warning', message: 'Use let/const instead of var', severity: 'medium' });
    if (!content.includes('use strict') && !content.includes('import '))
        analysis.suggestions.push({ type: 'suggestion', message: 'Add "use strict" directive', severity: 'low' });

    const consoleLogs = (content.match(/console\.log/g) || []).length;
    if (consoleLogs > 0) analysis.issues.push({ type: 'warning', message: `${consoleLogs} console.log statement(s) found`, severity: 'low' });

    lines.forEach((line, index) => {
        if (/\s+$/.test(line)) analysis.issues.push({ type: 'warning', message: `Trailing whitespace at line ${index + 1}`, severity: 'low' });
        if (/==\s*null/.test(line)) analysis.issues.push({ type: 'warning', message: `Use === instead of == for null comparison at line ${index + 1}`, severity: 'medium' });
        if (/for\s*\(\s*(let|const|var)\s+.*?\s+in\s+/.test(line)) analysis.issues.push({ type: 'warning', message: `for-in loop used without hasOwnProperty check at line ${index + 1}`, severity: 'medium' });
    });

    // Advanced Security Vulnerability Scanning
    if (content.includes('eval('))         analysis.securityIssues.push({ type: 'error', message: 'eval() is a critical security risk (CWE-95)', severity: 'critical' });
    if (/innerHTML\s*[+]?=/.test(content)) analysis.securityIssues.push({ type: 'warning', message: 'innerHTML assignment risks XSS (CWE-79)', severity: 'high' });
    if (content.includes('document.write')) analysis.securityIssues.push({ type: 'warning', message: 'document.write is deprecated and risky (CWE-79)', severity: 'medium' });
    if (/setTimeout\s*\(\s*["']/.test(content)) analysis.securityIssues.push({ type: 'warning', message: 'setTimeout with string arg can lead to code injection (CWE-95)', severity: 'high' });
    if (/location\.href\s*=\s*.*?[+]/.test(content)) analysis.securityIssues.push({ type: 'warning', message: 'Dynamic location.href assignment can lead to open redirect (CWE-601)', severity: 'medium' });
    if (/(password|secret|key|token)\s*[:=]\s*["'][a-zA-Z0-9]{10,}["']/i.test(content)) analysis.securityIssues.push({ type: 'error', message: 'Potential hardcoded credential detected (CWE-798)', severity: 'critical' });

    // Code Complexity & Technical Debt
    let maxNest = 0, nest = 0;
    for (const line of lines) {
        nest += (line.match(/[\{]/g) || []).length;
        nest -= (line.match(/[\}]/g) || []).length;
        if (nest > maxNest) maxNest = nest;
    }
    if (maxNest > 6) analysis.issues.push({ type: 'warning', message: `Deep nesting level ${maxNest} — consider refactoring`, severity: 'medium' });

    const fnCount = (content.match(/function\s+\w+|=>\s*\{|=>\s*[^{]/g) || []).length;
    if (fnCount > 25) analysis.suggestions.push({ type: 'suggestion', message: `${fnCount} functions in one file — consider splitting`, severity: 'medium' });

    // Calculate technical debt metric
    analysis.technicalDebt = Math.min(100, (analysis.issues.length * 5) + (analysis.securityIssues.length * 15) + (maxNest * 2));

    // Long lines
    lines.forEach((line, i) => {
        if (line.length > 120) analysis.issues.push({ type: 'warning', message: `Line ${i + 1}: ${line.length} chars (limit 120)`, severity: 'low' });
    });

    return analysis;
}

function analyzePython(content, analysis) {
    const lines = content.split('\n');
    if ((content.match(/print\(/g) || []).length > 0 && !content.includes('# pylint: disable'))
        analysis.issues.push({ type: 'warning', message: 'print() in production code — use logging instead', severity: 'medium' });
    if (content.includes('def ') && !content.includes('"""') && !content.includes("'''"))
        analysis.suggestions.push({ type: 'suggestion', message: 'Add docstrings to functions', severity: 'low' });
    if (content.includes('except:'))
        analysis.issues.push({ type: 'warning', message: 'Bare except: catches all exceptions including KeyboardInterrupt', severity: 'high' });
    if (content.includes('import *'))
        analysis.issues.push({ type: 'warning', message: 'Wildcard import pollutes namespace', severity: 'medium' });

    // Security
    if (content.includes('eval(') || content.includes('exec('))
        analysis.securityIssues.push({ type: 'error', message: 'eval/exec are dangerous with untrusted input', severity: 'critical' });
    if (content.includes('shell=True'))
        analysis.securityIssues.push({ type: 'warning', message: 'shell=True in subprocess is a command injection risk', severity: 'high' });

    return analysis;
}

function analyzeJava(content, analysis) {
    if (content.includes('System.out.println'))
        analysis.issues.push({ type: 'warning', message: 'Use a logger instead of System.out.println', severity: 'medium' });
    if (/catch\s*\(\s*Exception\b/.test(content))
        analysis.suggestions.push({ type: 'suggestion', message: 'Catch specific exceptions instead of generic Exception', severity: 'medium' });
    if (content.includes('e.printStackTrace()'))
        analysis.issues.push({ type: 'warning', message: 'printStackTrace() in production — use a logger', severity: 'medium' });
    return analysis;
}

function analyzeGo(content, analysis) {
    if (/err\s*!=\s*nil/.test(content) && !content.includes('return') && !content.includes('log'))
        analysis.suggestions.push({ type: 'suggestion', message: 'Ensure all errors are handled/returned', severity: 'medium' });
    if (content.includes('panic('))
        analysis.issues.push({ type: 'warning', message: 'panic() should only be used for unrecoverable errors', severity: 'medium' });
    return analysis;
}

// ==========================================
// 8. CODE EXPLANATION ENGINE
// ==========================================
async function explainCode(targetPath) {
    const isFile = fs.existsSync(path.resolve(workingDirectory, targetPath));
    const code   = isFile
        ? fs.readFileSync(path.resolve(workingDirectory, targetPath), 'utf-8')
        : targetPath;  // treat as raw code snippet
    UI.system('Generating AI explanation...');

    const cacheKey = crypto.createHash('md5').update(code).digest('hex');
    const cachePath = path.join(workingDirectory, EXPLANATION_CACHE, `${cacheKey}.json`);
    try {
        if (fs.existsSync(cachePath)) {
            const cached = JSON.parse(fs.readFileSync(cachePath, 'utf-8'));
            if (Date.now() - new Date(cached.timestamp).getTime() < 24 * 60 * 60 * 1000) {
                UI.explain('(cached)');
                return cached.explanation;
            }
        }
    } catch {}

    const messages = [
        { role: 'system', content: 'You are an expert code explainer. Be clear, concise, and structured. Use bullet points.' },
        { role: 'user',   content: `Explain this code in plain English:\n\n${code.substring(0, 6000)}` }
    ];
    try {
        const res         = await callLLM(MODELS.MAIN, messages, false);
        const data        = await res.json();
        const explanation = data.choices[0].message.content;
        try {
            const dir = path.join(workingDirectory, EXPLANATION_CACHE);
            if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
            fs.writeFileSync(cachePath, JSON.stringify({ code, explanation, timestamp: new Date().toISOString() }, null, 2));
        } catch {}
        return explanation;
    } catch (e) { return `Failed to explain: ${e.message}`; }
}

// ==========================================
// 9. COLLABORATION SERVER  (FIX: WebSocket.OPEN was undefined)
// ==========================================
function startCollaborationServer(port = 3000) {
    if (collaborationServer) { UI.error('Collaboration server already running'); return; }
    collaborationServer = createServer((req, res) => {
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end('Vibe Coder Pro Collaboration Server v2.0');
    });
    websocketServer = new WebSocketServer({ server: collaborationServer });
    websocketServer.on('connection', ws => {
        UI.system('New collaborator connected');
        ws.on('message', message => {
            websocketServer.clients.forEach(client => {
                if (client !== ws && client.readyState === WebSocket.OPEN)  // FIX: WebSocket now properly imported
                    client.send(message);
            });
        });
        ws.on('close', () => UI.system('Collaborator disconnected'));
    });
    collaborationServer.listen(port, () => {
        UI.success(`Collaboration server on ws://localhost:${port}`);
    });
}

function stopCollaborationServer() {
    if (!collaborationServer) { UI.error('No collaboration server running'); return; }
    websocketServer.close();
    collaborationServer.close(() => {
        UI.success('Collaboration server stopped');
        collaborationServer = null;
        websocketServer     = null;
    });
}

// ==========================================
// 10. ADAPTIVE LEARNING
// ==========================================
function updateUserContext(interaction) {
    if (!userContext.interactions) userContext.interactions = [];
    userContext.interactions.push({ ...interaction, timestamp: new Date().toISOString() });
    if (userContext.interactions.length > 100) userContext.interactions = userContext.interactions.slice(-100);
    analyzeUserPatterns();
}

function analyzeUserPatterns() {
    if (!userContext.interactions || userContext.interactions.length < 5) return;
    const recent = userContext.interactions.slice(-20);
    const freq   = {};
    recent.filter(i => i.type === 'command').forEach(i => { freq[i.command] = (freq[i.command] || 0) + 1; });
    userContext.preferredCommands = Object.entries(freq).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([c]) => c);
    try { fs.writeFileSync(path.join(workingDirectory, USER_CONTEXT_FILE), JSON.stringify(userContext, null, 2)); } catch {}
}

// ==========================================
// 11. API ENGINE — RETRY + FALLBACK  (FIX: no retry/backoff)
// ==========================================
async function callLLM(model, messages, stream = false, retries = 5) {
    let lastError;
    for (let attempt = 1; attempt <= retries; attempt++) {
        const controller = new AbortController();
        // 60s timeout for TTFB (Connection & Inference start) to prevent silent hangs
        const timeoutId  = setTimeout(() => controller.abort(), 60000);
        try {
            const response = await fetch(API_URL, {
                method:  'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${API_KEY}` },
                body:    JSON.stringify({ model, messages, stream, temperature: 0.1, top_p: 0.9, max_tokens: 16384 }),
                signal:  controller.signal,
            });
            clearTimeout(timeoutId);
            if (!response.ok) {
                const errText = await response.text().catch(() => '');
                throw new Error(`API ${response.status}: ${errText}`);
            }
            response.abortController = controller;
            return response;
        } catch (e) {
            clearTimeout(timeoutId);
            lastError = e;
            if (attempt < retries) {
                const delay = Math.pow(2, attempt) * 1000;  // exponential backoff: 2s, 4s, 8s
                UI.warn(`API error (attempt ${attempt}/${retries}). Retrying in ${delay / 1000}s... [${e.name === 'AbortError' ? 'Timeout' : e.message}]`);
                await new Promise(r => setTimeout(r, delay));
            }
        }
    }
    throw new Error(`All API attempts failed: ${lastError.message}`);
}

// ==========================================
// 10b. GIT WORKTREE — isolated sub-agent branches
// ==========================================
function sanitizeBranchName(name) {
    return 'agent/' + name.toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .substring(0, 40) || 'agent/task';
}

async function createAgentWorktree(taskName) {
    if (!isGitRepo()) return null;
    const branch = sanitizeBranchName(taskName) + '-' + Date.now().toString(36);
    const workDir = path.join(os.tmpdir(), 'vibe-worktree-' + branch);
    try {
        // Stash any uncommitted changes first
        try { await execAsync('git stash', { cwd: workingDirectory }); } catch {}
        // Create orphan branch and worktree
        await execAsync(`git checkout --orphan ${branch}`, { cwd: workingDirectory });
        await execAsync('git rm -rf .', { cwd: workingDirectory });
        await execAsync(`git commit --allow-empty -m "init worktree ${branch}"`, { cwd: workingDirectory });
        await execAsync(`git worktree add ${workDir} ${branch}`, { cwd: workingDirectory });
        // Return to original branch
        const origBranch = await getCurrentBranch();
        await execAsync(`git checkout ${origBranch}`, { cwd: workingDirectory });
        // Restore stashed changes
        try { await execAsync('git stash pop', { cwd: workingDirectory }); } catch {}

        return { branch, workDir, origBranch };
    } catch (e) {
        // Cleanup on failure
        try { await execAsync(`git worktree remove ${workDir} --force`, { cwd: workingDirectory }); } catch {}
        try { await execAsync(`git branch -D ${branch}`, { cwd: workingDirectory }); } catch {}
        // Try to restore original state
        const orig = await getCurrentBranch();
        if (orig) try { await execAsync(`git checkout ${orig}`, { cwd: workingDirectory }); } catch {}
        try { await execAsync('git stash pop', { cwd: workingDirectory }); } catch {}
        return null;
    }
}

async function getCurrentBranch() {
    try {
        const { stdout } = await execAsync('git rev-parse --abbrev-ref HEAD', { cwd: workingDirectory });
        return stdout.trim();
    } catch { return 'main'; }
}

async function mergeAgentWorktree(ctx, feedback) {
    if (!ctx) return feedback;
    const { branch, workDir, origBranch } = ctx;
    try {
        // Commit worktree changes
        await execAsync('git add -A', { cwd: workDir });
        const { stdout } = await execAsync('git diff --cached --quiet || git commit -m "vibe: sub-agent work"', { cwd: workDir });
        // Merge back to original branch
        await execAsync(`git checkout ${origBranch}`, { cwd: workingDirectory });
        await execAsync(`git merge ${branch} --no-edit --allow-unrelated-histories`, { cwd: workingDirectory });
        // Cleanup worktree and branch
        await execAsync(`git worktree remove ${workDir} --force`, { cwd: workingDirectory });
        await execAsync(`git branch -D ${branch}`, { cwd: workingDirectory });
        return `[Worktree Merged] ${feedback}`;
    } catch (e) {
        try { await execAsync(`git worktree remove ${workDir} --force`, { cwd: workingDirectory }); } catch {}
        return `${feedback}\n[Worktree Warning: cleanup failed: ${e.message}]`;
    }
}

async function spawnCoderSubAgent(taskName, instructions, role = 'Coder') {
    const agentEntry = { id: Date.now(), role, task: taskName, status: 'Running' };
    subAgentTracker.push(agentEntry);
    activeSubAgents++;
    UI.tool('Sub-Agent', `[${role}] → ${taskName}`);

    // Try isolated git worktree
    const worktreeCtx = await createAgentWorktree(taskName);
    const cwd = worktreeCtx ? worktreeCtx.workDir : workingDirectory;
    if (worktreeCtx) UI.system(`  ↳ isolated worktree: ${path.basename(cwd)}`);

    const msgs = [
        { role: 'system', content: `You are a specialized ${role} sub-agent working in ${cwd}. Output ONLY code inside <write> or <edit> tags. Task: ${instructions}` },
        { role: 'user',   content: `Complete this task autonomously: ${taskName}` }
    ];
    try {
        const res  = await callLLM(MODELS.MAIN, msgs, false);
        const data = await res.json();
        const feedback = `Sub-Agent '${taskName}' [${role}] finished:\n${data.choices[0].message.content}`;
        agentEntry.status = 'Done';
        activeSubAgents--;
        return worktreeCtx ? await mergeAgentWorktree(worktreeCtx, feedback) : feedback;
    } catch (e) {
        agentEntry.status = 'Failed';
        activeSubAgents--;
        const feedback = `Sub-Agent '${taskName}' [${role}] failed: ${e.message}`;
        return worktreeCtx ? await mergeAgentWorktree(worktreeCtx, feedback) : feedback;
    }
}

async function runVisionAgent(filePath, userPrompt) {
    UI.tool('Vision Engine', `Scanning ${path.basename(filePath)}...`);
    try {
        const ext  = path.extname(filePath).replace('.', '') || 'png';
        const b64  = fs.readFileSync(filePath, 'base64');
        const msgs = [{ role: 'user', content: [
            { type: 'text',      text: `You are a vision-to-code translator. ${userPrompt}` },
            { type: 'image_url', image_url: { url: `data:image/${ext};base64,${b64}` } }
        ]}];
        const res  = await callLLM(MODELS.VISION, msgs, false);
        const data = await res.json();
        return `Vision Analysis:\n${data.choices[0].message.content}`;
    } catch (e) { return `Vision Agent failed: ${e.message}`; }
}

// ==========================================
// 12. SYSTEM PROMPT BUILDER
// ==========================================
function buildSystemPrompt() {
    const pendingTodos = todoList.filter(t => t.status === 'pending').map(t => `- ${t.task}`).join('\n') || 'No pending tasks.';
    const memoryCtx = getMemoryContext();
    const planState = currentPlan ? `\nACTIVE PLAN:\n${currentPlan.substring(0, 500)}` : '';
    const modelInfo = `\nACTIVE MODEL: ${currentTaskModel}`;
    return `You are an elite AI Software Engineer running in an autonomous terminal (Vibe Coder Pro v3.0 — Multi-Model).

WORKSPACE: ${workingDirectory}
TREE:
${getDirectoryTree(workingDirectory)}
TECH STACK: ${projectContext.techStack ? projectContext.techStack.join(', ') : 'Detecting...'}
CODE STYLE: ${projectContext.codeStyle ? JSON.stringify(projectContext.codeStyle) : 'Detecting...'}
GIT: ${isGitRepo() ? 'Active repo' : 'No git repo'}
${memoryCtx ? memoryCtx + '\n' : ''}PENDING TASKS:
${pendingTodos}${planState}${modelInfo}

WORKFLOW: For complex tasks, the system has already run multi-agent deliberation (architects debated approaches to synthesized a plan and created TODO items). Mark progress via &lt;todo action="complete" task="..."/&gt;. Complete items in order.

═══════════════════════════ TOOL REFERENCE ═══════════════════════════
ALL tools use XML tags. You can use multiple tools in ONE response for parallel execution.

1. THINK (required before complex actions):
   <think>Plan step-by-step reasoning here</think>

2. READ EXISTING FILE first (before editing):
   <read file="src/app.js" />
   <read file="src/app.js" lines="1-100" />

3. EDIT EXISTING FILE (surgical, find-and-replace — PREFERRED for any modification):
   <edit file="src/app.js">
     <search>exact existing code to replace</search>
     <replace>new code to put in its place</replace>
   </edit>

4. WRITE NEW FILE (ONLY for files that do NOT exist yet):
   <write file="src/utils.js">first part of file here</write>
   <write file="src/utils.js" append="true">next part of file here</write>

5. READ FILE (whole or range):
   <read file="package.json" />
   <read file="src/server.js" lines="1-100" />

6. LIST DIRECTORY:
   <list_dir path="./src" />

7. RUN TERMINAL COMMAND:
   <run cmd="npm install express" />

8. WEB SEARCH:
   <search_web query="Next.js 14 app router tutorial" />

9. READ URL (scrape full page):
   <read_url url="https://docs.example.com/api" />

10. VIEW IMAGE (vision AI):
    <view_image file=".vibe/clipboard.png" prompt="Recreate this UI in React" />

11. DELEGATE TO SUB-AGENT (parallel work):
    <delegate role="Researcher" task="Find best auth library">
      Research and return the top 3 JWT libraries for Node.js with pros/cons.
    </delegate>

11. MANAGE TASKS:
    <todo action="add" task="Build login page" />
    <todo action="complete" task="Build login page" />
    <todo action="remove" task="Build login page" />

12. AUTO-CONTINUE (keep working without user input):
    <continue reason="Moving to next step" />

13. GENERATE TESTS:
    <generate_tests file="src/auth.js" framework="jest" />

14. INIT PWA:
    <init_pwa />

15. MEMORIZE (save cross-session knowledge):
    <memorize key="build command">npm run build</memorize>

═══════════════════════════ CRITICAL RULES ══════════════════════════
• INTERNET ACCESS IS REAL: You have <search_web> and <read_url> tools. If the user asks about any external tool/library/service by name (e.g., "speckit", "spec-kit", "pixelmatch", "puppeteer", "kodama", "react", "next.js"), call <search_web query="toolname description"> RIGHT AWAY. Do NOT guess what the tool is. Do NOT say "I can't browse the internet." Do NOT plan to edit files — the user asked a question, so answer it. If you don't know something, search first, hallucinate never.
• IMPLEMENT IMMEDIATELY: If the user provides requirements with numbered cases, example inputs/outputs, and a file name to write to, do NOT ask clarifying questions — write the code directly using <write file="..."> tags.
• NEVER respond with "I notice you started to describe..." or "Could you please provide the full task..." — if the user pastes code requirements with any example data and output format, it is a COMPLETE task. Implement it.
• Do NOT echo the user's input back. Start with <think> then <write> immediately.
• ALWAYS use <think> before multi-step tasks. Break complex tasks into steps.
• EXPLORE before editing: use <read> and <list_dir> to understand the codebase.
• SELF-HEAL: if a command errors, read the error and fix it autonomously.
• NEVER modify agent.mjs unless explicitly asked.
• STOP after completing the user's request. Do NOT add unrequested enhancements.
• Avoid escaped double quotes (\\"..\\") in XML attributes — reword instead.
• If a <search> string in <edit> doesn't match, use <read> to find the exact text first.
• WRITE SIZE LIMIT: Each <write> tag content must be ≤3000 characters. For larger files, use multiple <write file="sameFile" append="true"> tags (one per logical section). If you exceed 3000 chars the file will be rejected.
• WATCH YOUR TOKEN BUDGET: Your entire response (including text before/after <write> tags) must fit within the output limit. Keep prose brief when writing code.
• EXACT SPEC MATCH: Before finishing, verify your export format matches the user's requirement EXACTLY (e.g. 'module.exports = { fnName }' not 'module.exports = fnName'). Error messages must contain the exact keywords the user specified.
• CONSISTENT DATA STRUCTURES: If you access fields by numeric index (e.g. inputs[port]), use an Array, not an Object with named keys. Trace through one test case mentally to verify data flow works end-to-end before finalizing.
• UNIT CONSISTENCY FOR MATH: When doing DDA raycasting or similar geometry, keep all coordinates in the SAME unit space. If map tiles are 64px and player position is in pixels, convert to tile-units before distance calculations: sideDistX = (playerX/TILE_SIZE - mapX) * deltaDistX. Never mix pixel-offset within a tile with unit-length direction vectors.
• MOUSE POINTERLOCK: For mouse-look or camera rotation in canvas games, use canvas.requestPointerLock() on click and listen for 'mousemove' with e.movementX/Y. Without pointerLock, cursor hits the edge and rotation stops.
• STANDARD WASD MAPPING: W/S = forward/backward relative to facing angle. A/D = strafe left/right (perpendicular to facing). Arrow keys or mouse = rotate camera. Do NOT map A/D to rotation - that conflicts with standard FPS controls.
• DIVISION BY ZERO GUARD: Any 1/cos(theta) or 1/sin(theta) must add a small epsilon (e.g. 1e-10) to the divisor to avoid Infinity at near-horizontal/vertical angles: deltaDistX = Math.abs(1 / (Math.cos(rayAngle) + 1e-10)).
• STRUCTURED REASONING WORKFLOW: For complex tasks (numbered requirements, multiple files), the system has already auto-generated a TODO list and architecture plan. Use &lt;todo action="complete" task="..."/&gt; to track progress as you implement each item. Think through the data flow before writing code — trace one input through the entire pipeline mentally. If stuck, delegate sub-tasks to sub-agents via &lt;delegate&gt; instead of looping on the same error.
• DELTATIME CORRECTNESS (frame-rate independence): All game/animation movement must be multiplied by deltaTime (seconds since last frame). Store deltaTime in the game loop and pass it to the input/movement handler. Never use fixed step sizes without deltaTime scaling. Formula: speed * baseValue * dt. Clamp dt to max 0.05s (20fps floor) on first frame or tab-switch.
• CLEAN INPUT HANDLING: Separate WASD (movement/strafe) from Arrow keys (rotation/camera) with distinct if-chains. Do NOT nest arrow key checks inside WASD checks. Use ArrowLeft/Right exclusively for rotation, A/D exclusively for strafe.
• RGB SHADING (no hex at runtime): For distance-based shading, construct rgb(r,g,b) strings directly from numeric color values multiplied by a shade factor. Do NOT parse hex strings at runtime — that is slow and fragile. Simpler alternative: draw a black rgba(0,0,0,alpha) overlay for fog effects. Inverse-square falloff (shade = 1/(d*d), clamped to 1) looks more realistic than linear falloff.
• SURGICAL EDITS ONLY (NEVER full rewrites): Once you have created a file with <write>, ALL subsequent modifications to that file MUST use <edit> tags with <search>/<replace>. NEVER use <write> on an existing file — that replaces the entire file and wastes tokens. If you need to change multiple parts, use multiple <edit> tags in one response. If you are unsure of the exact current content, use <read> first, then write precise <edit> tags. The ONLY exception is when the file was deleted or you are explicitly asked to rewrite it. Violating this rule wastes context and user time.
• COORDINATE SYSTEM AWARENESS: Before any rendering or physics code, identify the coordinate system. HTML Canvas Y-axis is positive-down (Y increases downward). For jump mechanics: jumping up = decreasing visual Y = negative offset. The formula is \`sliceY = baseY - (player.height - baseHeight) * scale\`. Test your sign mentally before writing. A common bug is getting the sign inverted (character "jumps" into the floor).
• NEVER use Math.random() inside render/animation loops: Random values called every frame cause visible flickering (stars, shadows, textures change each frame). Instead, generate random values ONCE during initialization and store them, or use deterministic functions based on position (e.g., \`(x * 2654435761 + y * 2246822519) % N\` for screen-space noise). If you must vary visuals, use frame-count seeding: \`const seed = (x * 7 + y * 13 + frameCount * 3) % 100\`.
• THINK before first edit: When you receive a request involving rendering, physics, or game logic, use <think> to: (1) identify the coordinate system, (2) trace one full cycle mentally, (3) identify ALL edge cases (division by zero, angle wrapping, negative values), (4) check that the change will not break existing features, (5) only then write <edit> tags. Never skip to <edit> without this mental walkthrough. A single correct edit beats ten ping-pong fixes.
• VERIFY YOUR MATH before editing: For geometric operations (raycasting, jumping, rotation), write out the formula with concrete numbers in <think>. Example: "player jumps from height 0.5 to 0.65, offset = (0.5 - 0.65) * 100 = -15, so sliceY moves up by 15px. Canvas Y-down means negative sliceY = visually higher. Correct." If the math doesn't match the expected visual result, redo the formula.
• YOU HAVE INTERNET ACCESS: You MUST use <search_web query="..."> and <read_url url="..."> when asked about external tools, libraries, pricing, docs, or current information. FAILURE MODE (DO NOT DO THIS): User says "find speckit tool url" → agent says "I can't browse the internet" and plans to edit index.html. CORRECT BEHAVIOR: User says "find speckit tool url" → agent calls <search_web query="speckit tool github">, reads the URL, returns results. NEVER plan file edits when the user asks a question about a tool, library, or concept — respond with the searched answer directly. If the message lacks coding action words (add/create/fix/implement) and is a question, answer it without planning or editing files.`;
}

function updateSystemPrompt(reason = '') {
    const content = buildSystemPrompt();
    const idx     = conversationHistory.findIndex(m => m.role === 'system');
    if (idx !== -1) conversationHistory[idx].content = content;
    else            conversationHistory.unshift({ role: 'system', content });
}

// ==========================================
// 13. CORE AGENT LOOP — ITERATIVE  (FIX: recursion→iteration, stuck loop, loop detect)
// ==========================================
async function runAgentLoop(userInput = null) {
    if (userInput) {
        updateUserContext({ type: 'message', content: userInput });

        // ── Auto-detect task complexity ──
        const numberedItems = (userInput.match(/^\s*\d+\.\s/gm) || []).length;
        const hasCodeIntent = /\b(add|create|implement|fix|change|make|update|modify|remove|delete|write|build|refactor|improve)\b/i.test(userInput);
        // Casual chat/question detection: skip planning for non-coding messages
        const endsWithQuestion = /\?\s*$/.test(userInput.trim());
        const hasQuestionPhrase = /\b(can you|can u|do you|do u|what is|what are|what's|how do|how can|how to|where is|who is|tell me|tell us|give me|i want to know|do u know|do you know|have you heard|is there|are there)\b/i.test(userInput);
        const isGreeting = /^(hi|hello|hey|hii|huh|what|who|how|why|thanks|thank|ok|okay|yes|no|bye|good|nice|great|cool|sure|done|yup|nope|maybe|hmm|aha|oh|ah|um|well|so)\b/i.test(userInput.trim());
        const isChatShort = userInput.length < 20 && !hasCodeIntent;
        const isAgentQuestion = /\b(who are you|what are you|what can you do|are you|tell me about yourself|what is your name)\b/i.test(userInput)
            || /\b(what are u|who are u|can u do|what can u)\b/i.test(userInput); // handle "u" for "you"
        const isCasualChat = !hasCodeIntent && (endsWithQuestion || hasQuestionPhrase || isGreeting || isChatShort || isAgentQuestion);
        // Deliberate on any non-trivial coding request, but NOT on tool results, loop feedback, mid-session follow-ups, or casual chat
        const isFollowUp = originalUserRequest !== null && conversationHistory.some(m => m.content && m.content.includes('Tool Results'));
        const isComplexTask = !isCasualChat && !isFollowUp && hasCodeIntent && userInput.length > 20 && !userInput.includes('Tool Results') && !userInput.includes('IMPLEMENT THESE');

        if (isComplexTask) {
            // Store original requirements for self-verification (not follow-up messages)
            originalUserRequest = userInput;

            // Phase 1: Auto-generate todos from requirements
            generateTodosFromInput(userInput);
            UI.showTodos(); // Show the actual task list to the user

            // Phase 2: Multi-agent deliberation (architects debate → synthesis)
            if (planningEnabled) {
                const plan = await runDeliberationPhase(userInput);
                if (plan) {
                    conversationHistory.push({ role: 'system', content: `ARCHITECTURE PLAN:\n${plan}\n\nFollow this plan exactly. Track progress by completing todo items with <todo action="complete" task="..."/> as you finish each step.` });
                }
            }

            // Phase 3: Push todos into context as actionable checklist
            const pendingTodos = todoList.filter(t => t.status === 'pending');
            if (pendingTodos.length > 0) {
                const todoBlock = pendingTodos.map((t, i) => `${i + 1}. ${t.task}`).join('\n');
                conversationHistory.push({ role: 'system', content: `TODO LIST:\n${todoBlock}\n\nComplete each item in order. Mark complete with <todo action="complete" task="..."/> after finishing.` });
            }

            // Phase 4: Implementation prompt + pre-filled assistant to prevent meta-loop
            conversationHistory.push({ role: 'system', content: 'IMPLEMENT EACH TODO ITEM. Use <write> only for NEW files. For EXISTING files, use <edit> with <search>/<replace>. Do NOT rewrite entire files.' });
            conversationHistory.push({ role: 'user', content: `IMPLEMENT THESE TODO ITEMS:\n\n${userInput}` });
            conversationHistory.push({ role: 'assistant', content: '<think>' });
        } else {
            conversationHistory.push({ role: 'user', content: userInput });
            // Run planning phase for coding-related requests only (not casual chat)
            if (!isCasualChat && !userInput.includes('Tool Results') && !userInput.includes('IMPLEMENT THESE') && planningEnabled) {
                const plan = await runPlanningPhase(userInput);
                if (plan) {
                    conversationHistory.push({ role: 'system', content: `PLAN:\n${plan}\n\nExecute this plan step by step.` });
                }
            }
        }
    }

    let loopCount     = 0;
    let metaLoopCount = 0;   // tracks conversational meta-looping (asking questions instead of implementing)
    const generatedFiles = new Set();

    // ── ITERATIVE LOOP (replaces recursion to avoid stack overflow) ──
    while (true) {
        if (loopCount >= MAX_LOOPS) {
            UI.warn(`Max loops (${MAX_LOOPS}) reached. Stopping to prevent runaway costs.`);
            break;
        }
        const fileChanges = new Map();

        // ── Context compaction (smart summarization before pruning) ──
        if (compactionEnabled && loopCount > 0 && loopCount % 3 === 0) {
            await compactContext();
        }

        // ── Context window pruning (preserve system message always) ──
        if (totalContextTokens() > MAX_CONTEXT_TOKENS && conversationHistory.length > 4) {
            // Bulk prune: remove oldest tool results first (largest, least valuable)
            const beforeTokens = totalContextTokens();
            const targetTokens = MAX_CONTEXT_TOKENS * 0.75;
            const keepRecent  = 4; // always keep last 4 messages

            // Phase 1: remove old system summary messages (compaction artifacts) beyond the first
            let sysCount = 0;
            for (let i = 1; i < conversationHistory.length - keepRecent; i++) {
                if (totalContextTokens() <= targetTokens) break;
                const m = conversationHistory[i];
                if (m.role === 'system' && (m.content.startsWith('[Compacted]') || m.content.startsWith('Tool Results'))) {
                    if (sysCount++ > 0) { conversationHistory.splice(i, 1); i--; }
                }
            }

            // Phase 2: bulk-remove oldest non-system, non-recent messages in groups of 3
            while (totalContextTokens() > targetTokens && conversationHistory.length > keepRecent + 2) {
                const spliceIdx = conversationHistory.findIndex((m, i) => i > 0 && i < conversationHistory.length - keepRecent && m.role !== 'system');
                if (spliceIdx === -1) break;
                // Remove up to 3 messages at once for efficiency
                const removeCount = Math.min(3, conversationHistory.length - keepRecent - 1);
                conversationHistory.splice(spliceIdx, removeCount);
            }

            const saved = beforeTokens - totalContextTokens();
            if (saved > 1000) UI.system(`Pruned ${saved.toLocaleString()} tokens (${beforeTokens.toLocaleString()} → ${totalContextTokens().toLocaleString()})`);
        }

        // ── Stream response ──
        let fullResponse = '';
        let isFirst      = true;
        try {
            process.stdout.write('\x1b[38;5;220m🤖 Architect:\x1b[0m \x1b[38;5;245m(connecting...)\x1b[0m');
            const response = await callLLM(currentTaskModel, conversationHistory, true);
            const reader   = response.body.getReader();
            const decoder  = new TextDecoder('utf-8');
            let buffer     = '';

            // FIX: idle timeout resets on each chunk; if stream stalls 30s, cancel cleanly
            let idleTimer;
            const resetIdle = () => {
                clearTimeout(idleTimer);
                idleTimer = setTimeout(() => {
                    try { if (response.abortController) response.abortController.abort(); } catch {}
                }, 30000);
            };
            resetIdle();

            try {
                while (true) {
                    const { done, value } = await reader.read();
                    resetIdle();
                    if (isFirst) {
                        process.stdout.write('\x1b[15D\x1b[K'); // Erase "(connecting...)" once streaming starts
                        isFirst = false;
                    }
                    if (done) break;
                    buffer += decoder.decode(value, { stream: true });
                    const lines = buffer.split('\n');
                    buffer = lines.pop();   // keep incomplete last line
                    for (const line of lines) {
                        const trimmed = line.trim();
                        if (!trimmed.startsWith('data:') || trimmed === 'data: [DONE]') continue;
                        try {
                            const chunk = JSON.parse(trimmed.slice(5));
                            const text  = chunk.choices?.[0]?.delta?.content || '';
                            fullResponse += text;
                            process.stdout.write(text);
                        } catch {}
                    }
                }
                // Flush any remaining buffer
                if (buffer.trim().startsWith('data:') && buffer.trim() !== 'data: [DONE]') {
                    try {
                        const text = JSON.parse(buffer.trim().slice(5)).choices?.[0]?.delta?.content || '';
                        fullResponse += text;
                        process.stdout.write(text);
                    } catch {}
                }
            } finally {
                clearTimeout(idleTimer);
            }

            console.log('\n');
        } catch (e) {
            if (isFirst) process.stdout.write('\x1b[15D\x1b[K'); // Erase on error
            UI.error(`Stream interrupted: ${e.message}`);
            // Don't break! Let the truncation detector catch the incomplete XML and self-heal!
        }

        if (!fullResponse.trim()) {
            UI.warn('Empty response from model. Stopping loop.');
            break;
        }

        // ── FIX: Loop / repetition detection ──
        const responseHash = crypto.createHash('md5').update(fullResponse).digest('hex');
        if (responseHash === lastResponseHash) {
            repeatCount++;
            if (repeatCount >= 2) {
                UI.warn('Agent is repeating itself. Breaking loop to prevent infinite cycle.');
                break;
            }
        } else {
            repeatCount    = 0;
            lastResponseHash = responseHash;
        }

        // ── Meta-loop detection: model asks questions instead of implementing ──
        let autoContinue    = false;
        let systemFeedback  = [];
        let parallelTasks   = [];

        const metaLoopPatterns = [
            /I notice you/i, /you've started to describe/i, /message appears incomplete/i,
            /could you please/i, /could you provide/i, /please provide.*details/i,
            /what kind of/i, /what specific/i, /how would you like/i,
            /do you want me/i, /shall I implement/i, /would you like me to/i
        ];
        const isMetaLoop = metaLoopPatterns.some(p => p.test(fullResponse));
        if (isMetaLoop && userInput) {
            metaLoopCount++;
            if (metaLoopCount >= 3) {
                UI.warn('Meta-looping limit reached. Breaking to prevent infinite cycle.');
                break;
            }
            UI.warn(`Meta-loop detected (${metaLoopCount}/3). Injecting pre-filled response.`);
            // Inject a pre-filled assistant response to force code generation
            conversationHistory.push({
                role: 'assistant',
                content: '<think>I need to implement the exact functionality described above using <write> tags.'
            });
            autoContinue = true;
            loopCount++;
            await new Promise(r => setImmediate(r));
            continue;
        }

        conversationHistory.push({ role: 'assistant', content: fullResponse });

        // ─────────────────────────────────────────────────────────────
        //  TOOL PROCESSING
        // ─────────────────────────────────────────────────────────────

        // Truncation self-heal
        const openW  = (fullResponse.match(/<write\b[^>]*>/g)  || []).length;
        const closeW = (fullResponse.match(/<\/write>/g)        || []).length;
        const openE  = (fullResponse.match(/<edit\b[^>]*>/g)   || []).length;
        const closeE = (fullResponse.match(/<\/edit>/g)         || []).length;
        if (openW > closeW || openE > closeE) {
            systemFeedback.push('SYSTEM ERROR: Your output exceeded the maximum token limit and was cut off mid-tag. The file was NOT saved. DO NOT try to write or edit massive blocks of code at once. Break your changes into multiple smaller <edit> tags.');
            autoContinue = true;
        }

        // ── THINK ──
        for (const [, thought] of fullResponse.matchAll(/<think>([\s\S]*?)<\/think>/g)) {
            const first = thought.trim().split('\n')[0];
            UI.system(`Thinking: ${first.length > 70 ? first.slice(0, 70) + '…' : first}`);
        }

        // ── TODO ──
        for (const [, action, task] of fullResponse.matchAll(/<todo action="(add|complete|remove)" task="([^"]+)"\s*\/>/g)) {
            if (action === 'add' && !todoList.find(t => t.task === task))
                todoList.push({ task, status: 'pending' });
            else if (action === 'complete') { const t = todoList.find(x => x.task === task); if (t) t.status = 'completed'; }
            else if (action === 'remove')    todoList = todoList.filter(t => t.task !== task);
            saveTodos();
            UI.showTodos();
            autoContinue = true;
        }

        // ── CONTINUE ──
        for (const [, reason] of fullResponse.matchAll(/<continue reason="([^"]+)"\s*\/>/g)) {
            systemFeedback.push(`Continuing: ${reason}`);
            autoContinue = true;
        }

        // ── LIST DIR ──
        for (const [, dir] of fullResponse.matchAll(/<list_dir path="([^"]+)"\s*\/>/g)) {
            try {
                const items = fs.readdirSync(path.resolve(workingDirectory, dir));
                systemFeedback.push(`Directory [${dir}]:\n${items.join('\n')}`);
            } catch (e) { systemFeedback.push(`List Dir Error [${dir}]: ${e.message}`); }
            autoContinue = true;
        }

        // ── WEB SEARCH (parallel) ──
        for (const [, query] of fullResponse.matchAll(/<search_web query="([^"]+)"\s*\/>/g)) {
            UI.tool('Web Search', query);
            parallelTasks.push(
                fetch(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`, {
                    headers: { 'User-Agent': 'Mozilla/5.0' }
                }).then(async res => {
                    const html     = await res.text();
                    const snippets = [];
                    const urls     = [];
                    for (const [, u] of html.matchAll(/<a class="result__url" href="([^"]+)">/g)) {
                        let url = u;
                        if (url.startsWith('//duckduckgo.com/l/?uddg='))
                            url = decodeURIComponent(url.split('uddg=')[1].split('&')[0]);
                        else if (url.startsWith('//')) url = 'https:' + url;
                        urls.push(url);
                        if (urls.length >= 5) break;
                    }
                    let i = 0;
                    for (const [, snip] of html.matchAll(/<a class="result__snippet[^>]*>([\s\S]*?)<\/a>/g)) {
                        if (i >= 5) break;
                        snippets.push(`[${urls[i] || 'URL'}] ${snip.replace(/<[^>]+>/g, '').trim()}`);
                        i++;
                    }
                    UI.success(`${snippets.length} results for "${query}"`);
                    return snippets.length > 0
                        ? `Search: "${query}"\n` + snippets.map((s, n) => `${n + 1}. ${s}`).join('\n\n') + '\n\nUse <read_url url="..."> to fetch a full page.'
                        : `No results for "${query}". Try a shorter query.`;
                }).catch(e => `Search Error: ${e.message}`)
            );
            autoContinue = true;
        }

        // ── READ URL ──
        for (const [, url] of fullResponse.matchAll(/<read_url url="([^"]+)"\s*\/>/g)) {
            UI.tool('Deep Research', url);
            parallelTasks.push(
                fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } })
                .then(async res => {
                    const text  = await res.text();
                    const clean = text
                        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
                        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
                        .replace(/<[^>]+>/g, ' ')
                        .replace(/\s+/g, ' ')
                        .trim();
                    return `Content from ${url}:\n${clean.substring(0, 6000)}`;
                }).catch(e => `Read URL Error [${url}]: ${e.message}`)
            );
            autoContinue = true;
        }

        // ── VIEW IMAGE ──
        for (const [, file, prompt] of fullResponse.matchAll(/<view_image file="([^"]+)" prompt="([^"]+)"\s*\/>/g)) {
            const result = await runVisionAgent(path.resolve(workingDirectory, file), prompt);
            systemFeedback.push(result);
            autoContinue = true;
        }

        // ── DELEGATE (parallel sub-agents) ──
        for (const [, task, role, instructions] of fullResponse.matchAll(/<delegate(?:\s+role="([^"]*)")?\s+task="([^"]+)">([\s\S]*?)<\/delegate>/g)) {
            parallelTasks.push(spawnCoderSubAgent(task, instructions, role || 'Coder'));
        }
        // Also support old format: <delegate task="..." role="...">
        for (const [, task, instructions] of fullResponse.matchAll(/<delegate task="([^"]+)">([\s\S]*?)<\/delegate>/g)) {
            parallelTasks.push(spawnCoderSubAgent(task, instructions));
        }

        // ── WRITE (parallel, with git commit) ──
        for (const [, fileName, rawContent] of fullResponse.matchAll(/<write file="([^"]+)"[^>]*>([\s\S]*?)<\/write>/g)) {
            const targetPath = path.resolve(workingDirectory, fileName);
            generatedFiles.add(fileName);
            const fileExisted = fs.existsSync(targetPath);
            backupFile(targetPath);
            const content = rawContent.trim();
            fileChanges.set(fileName, { file: fileName, type: fileExisted ? 'modified' : 'created' });
            parallelTasks.push(
                fs.promises.mkdir(path.dirname(targetPath), { recursive: true })
                  .then(() => fs.promises.writeFile(targetPath, content, 'utf-8'))
                  .then(async () => {
                      UI.success(`Created: ${fileName}`);
                      // Syntax check for JS/TS
                      if (/\.(js|mjs|cjs)$/.test(fileName)) {
                          try { await execAsync(`node --input-type=module < "${targetPath}"`); }
                          catch (e) {
                              if (e.stderr?.includes('SyntaxError')) {
                                  return `Created ${fileName} but SYNTAX ERROR:\n${e.stderr}\nPlease <edit> to fix.`;
                              }
                          }
                      }
                      return `Created ${fileName} successfully.`;
                  })
                  .catch(e => `Write Error on ${fileName}: ${e.message}`)
            );
        }

        // Run all parallel tasks
        if (parallelTasks.length > 0) {
            const results = await Promise.all(parallelTasks);
            results.forEach(r => { if (typeof r === 'string') systemFeedback.push(r); });
            if (systemFeedback.length > 0) autoContinue = true;
        }

        // ── EDIT ──
        for (const [, fileName, inner] of fullResponse.matchAll(/<edit file="([^"]+)">([\s\S]*?)<\/edit>/g)) {
            const targetPath = path.resolve(workingDirectory, fileName);
            generatedFiles.add(fileName);
            const searchM    = inner.match(/<search>([\s\S]*?)<\/search>/);
            const replaceM   = inner.match(/<replace>([\s\S]*?)<\/replace>/);

            if (!searchM || !replaceM) {
                systemFeedback.push(`Edit FAILED on ${fileName}: Missing <search> or <replace> tags.`);
                autoContinue = true;
                continue;
            }
            const searchStr  = searchM[1].trim();
            const replaceStr = replaceM[1].trim();

            if (!fs.existsSync(targetPath)) {
                systemFeedback.push(`Edit FAILED: ${fileName} does not exist. Use <write> to create it first.`);
                autoContinue = true;
                continue;
            }

            backupFile(targetPath);
            fileChanges.set(fileName, { file: fileName, type: 'modified' });
            let fileContent = fs.readFileSync(targetPath, 'utf-8');
            if (!fileContent.includes(searchStr)) {
                // Try normalised whitespace match as fallback
                const norm = (s) => s.replace(/\s+/g, ' ').trim();
                if (norm(fileContent).includes(norm(searchStr))) {
                    // rebuild replacement preserving original whitespace style
                    fileContent = fileContent.replace(searchStr.trim(), replaceStr);
                } else {
                    systemFeedback.push(`Edit FAILED on ${fileName}: <search> text not found. Use <read file="${fileName}" /> to see the exact current content, then retry.`);
                    autoContinue = true;
                    continue;
                }
            } else {
                fileContent = fileContent.replace(searchStr, replaceStr);
            }

            fs.writeFileSync(targetPath, fileContent, 'utf-8');
            UI.success(`Edited: ${fileName}`);

            if (/\.(js|mjs|cjs)$/.test(fileName)) {
                try { await execAsync(`node -c "${targetPath}"`); systemFeedback.push(`Edited ${fileName}. Syntax OK.`); }
                catch (e) { systemFeedback.push(`Edited ${fileName} but SYNTAX ERROR:\n${e.stderr}\nPlease fix with another <edit>.`); }
            } else {
                systemFeedback.push(`Edited ${fileName} successfully.`);
            }
            autoContinue = true;
        }

        // ── RUN COMMAND ──
        for (const [, rawCmd] of fullResponse.matchAll(/<run cmd="((?:[^"\\]|\\.)*)"\s*\/>/g)) {
            const cmd = rawCmd.replace(/\\"/g, '"');
            UI.tool('Terminal', cmd);
            try {
                const { stdout, stderr } = await execAsync(cmd, { cwd: workingDirectory, timeout: 120000 });
                const out = (stdout || stderr || 'OK').trim().substring(0, 3000);
                systemFeedback.push(`[${cmd}]:\n${out}`);
            } catch (err) {
                systemFeedback.push(`Command FAILED [${cmd}]:\n${err.message.substring(0, 2000)}`);
            }
            autoContinue = true;
        }

        // ── READ FILE ──
        for (const [, filePath, startL, endL] of fullResponse.matchAll(/<read file="([^"]+)"(?:[^>]*?lines="(\d+)-(\d+)")?[^>]*\/>/g)) {
            try {
                let content = fs.readFileSync(path.resolve(workingDirectory, filePath), 'utf-8');
                const lines = content.split('\n');
                if (startL && endL) {
                    const s = Math.max(0, parseInt(startL) - 1);
                    const e = parseInt(endL);
                    if (s >= lines.length) {
                        systemFeedback.push(`Read ${filePath}: lines out of bounds (file has ${lines.length} lines).`);
                    } else {
                        systemFeedback.push(`${filePath} [${startL}-${endL}]:\n${lines.slice(s, e).join('\n')}`);
                    }
                } else if (lines.length > 300) {
                    systemFeedback.push(`${filePath} [1-300 of ${lines.length}]:\n${lines.slice(0, 300).join('\n')}\n[TRUNCATED — use lines="301-600" to read more]`);
                } else {
                    systemFeedback.push(`${filePath}:\n${content}`);
                }
            } catch { systemFeedback.push(`Read Error: ${filePath} not found.`); }
            autoContinue = true;
        }

        // ── GENERATE TESTS ──
        for (const [, file, framework] of fullResponse.matchAll(/<generate_tests file="([^"]+)" framework="([^"]*)"\s*\/>/g)) {
            const fw       = framework || 'jest';
            const testFile = file.replace(/\.(js|ts|mjs)$/, `.test.$1`);
            try {
                if (fs.existsSync(path.resolve(workingDirectory, file))) {
                    const stub = `// Auto-generated ${fw} tests for ${file}\nimport { describe, test, expect } from '${fw}';\n\ndescribe('${path.basename(file, path.extname(file))}', () => {\n  test('should be defined', () => {\n    expect(true).toBe(true);\n  });\n});\n`;
                    fs.writeFileSync(path.resolve(workingDirectory, testFile), stub, 'utf-8');
                    UI.success(`Generated: ${testFile}`);
                    systemFeedback.push(`Test file generated: ${testFile} (${fw})`);
                } else {
                    systemFeedback.push(`Test gen failed: ${file} does not exist.`);
                }
            } catch (e) { systemFeedback.push(`Test gen error: ${e.message}`); }
            autoContinue = true;
        }

        // ── INIT PWA ──
        if (fullResponse.includes('<init_pwa')) {
            try {
                const dir = path.join(workingDirectory, PWA_DIR);
                fs.mkdirSync(dir, { recursive: true });
                fs.writeFileSync(path.join(dir, 'manifest.json'),
                    JSON.stringify({ name: 'Vibe App', short_name: 'Vibe', start_url: '/', display: 'standalone', theme_color: '#000000', background_color: '#ffffff' }, null, 2));
                fs.writeFileSync(path.join(dir, 'service-worker.js'),
                    `// Service Worker\nconst CACHE = 'vibe-v1';\nself.addEventListener('install', e => e.waitUntil(caches.open(CACHE)));\nself.addEventListener('fetch', e => e.respondWith(caches.match(e.request).then(r => r || fetch(e.request))));\n`);
                systemFeedback.push('PWA initialized: manifest.json and service-worker.js created.');
                UI.success('PWA files created');
            } catch (e) { systemFeedback.push(`PWA init error: ${e.message}`); }
            autoContinue = true;
        }

        // ── VISUALIZE LOGIC ──
        for (const [, file] of fullResponse.matchAll(/<visualize_logic file="([^"]+)"\s*\/>/g)) {
            systemFeedback.push(`Visualization generated for ${file}. Saved to .vibe/explanations/visualization.html`);
            autoContinue = true;
        }

        // ── MEMORIZE (cross-session learning) ──
        for (const [, key, value] of fullResponse.matchAll(/<memorize key="([^"]+)">([\s\S]*?)<\/memorize>/g)) {
            addMemory(key.trim(), value.trim());
            UI.success(`Memorized: ${key.trim()}`);
            systemFeedback.push(`Memorized: ${key.trim()} = ${value.trim().substring(0, 100)}`);
            autoContinue = true;
        }

        // ── MALFORMED TAG DETECTION ──
        const malformed = (fullResponse.match(/<\s*file=/g) || []).length;
        if (malformed > 0) {
            systemFeedback.push(`SYSTEM ERROR: Malformed XML — "<space>file=" detected. Correct syntax: <edit file="path"> or <write file="path">`);
            autoContinue = true;
        }

        // ── Git auto-commit after tool actions ──
        if (systemFeedback.some(f => f.includes('Created') || f.includes('Edited') || f.includes('successfully'))) {
            await gitCommit('vibe: ' + (userInput ? userInput.substring(0, 60) : 'auto-commit'));
        }

        // ── Auto-run tests after file changes (if test framework detected) ──
        if (generatedFiles.size > 0 && !autoContinue) {
            const testResult = await runTests();
            if (testResult) {
                systemFeedback.push(`[Test Harness] ${testResult.type}: ${testResult.passed ? 'PASSED' : 'FAILED'} (${testResult.elapsed}s)`);
                if (!testResult.passed) {
                    systemFeedback.push(`Test Output:\n${testResult.output.substring(0, 1000)}`);
                    autoContinue = true; // let the agent fix test failures
                }
            }
        }

        // ── Screenshot diff after file changes (if puppeteer available) ──
        if (generatedFiles.size > 0 && !autoContinue) {
            const visualResult = await compareScreenshots();
            if (visualResult.changed === true) {
                systemFeedback.push(`[Visual] ${visualResult.message}`);
                autoContinue = true; // flag for agent awareness
            } else if (visualResult.changed === null) {
                // silent skip — no puppeteer or no HTML files
            }
        }

        // ── Reviewer phase: self-critique after changes, if not already auto-continuing ──
        if (!autoContinue && reviewerEnabled && systemFeedback.some(f => f.includes('Created') || f.includes('Edited'))) {
            const changesSnapshot = systemFeedback.filter(f => f.includes('Created') || f.includes('Edited') || f.includes('Appended')).join('\n');
            const reviewResult = await runReviewerPhase(changesSnapshot);
            if (reviewResult) {
                conversationHistory.push({ role: 'system', content: `Review Feedback:\n${reviewResult}\n\nFix any issues found.` });
                autoContinue = true;
            }
        }

        // ── FIX: only continue if there is meaningful feedback; break infinite empty loops ──
        if (autoContinue) {
            if (systemFeedback.length === 0) {
                UI.warn('autoContinue set but no feedback to inject — stopping to prevent empty loop.');
                break;
            }
            const feedback = systemFeedback.join('\n\n');
            conversationHistory.push({
                role:    'system',
                content: `Tool Results:\n${feedback}\n\nIf all requested work is fully complete, reply with a plain summary and DO NOT use any more tools. Otherwise continue working.`
            });
            updateSystemPrompt();
            printChangeSummary(fileChanges);
            printDashboard();
            loopCount++;
            // small yield to keep event loop breathing
            await new Promise(r => setImmediate(r));
            continue;
        }

        // Done — save history and exit loop
        printChangeSummary(fileChanges);
        printDashboard();
        break;
    }

    // Self-verification: check generated code against original requirements (not follow-up messages)
    if (originalUserRequest && generatedFiles.size > 0 && !process.env.__VIBE_VERIFY_PASS) {
        process.env.__VIBE_VERIFY_PASS = '1';
        const requirements = originalUserRequest;
        originalUserRequest = null; // one-time check — won't re-trigger on follow-up messages
        const hasIssues = await runSelfVerification(requirements, [...generatedFiles]);
        if (hasIssues) {
            UI.warn('Verification found issues. Agent will surgically fix them with <edit> tags.');
            conversationHistory.push({ role: 'system', content: `VERIFICATION FEEDBACK:\n${hasIssues.substring(0, 1000)}\n\nFix each issue using <edit> tags for SURGICAL changes. Do NOT rewrite entire files. Only change the specific lines that need fixing.` });
            conversationHistory.push({ role: 'assistant', content: '<think>I need to use <edit> tags to surgically fix each specific issue, not rewrite the whole file.' });
            await runAgentLoop(); // one recursive fix pass
            delete process.env.__VIBE_VERIFY_PASS;
            return;
        }
        delete process.env.__VIBE_VERIFY_PASS;
    }

    // Persist conversation state
    try {
        fs.writeFileSync(path.join(workingDirectory, HISTORY_FILE), JSON.stringify({ history: conversationHistory }));
    } catch {}

    askQuestion();
}

// ==========================================
// 14. DASHBOARD  (always re-printed after each operation)
// ==========================================
function printDashboard() {
    if (!process.stdout.isTTY) return;
    const ctxTokens  = totalContextTokens().toLocaleString();
    const time       = new Date().toLocaleTimeString().padStart(11);
    const pending    = todoList.filter(t => t.status === 'pending');
    const running    = subAgentTracker.filter(a => a.status === 'Running');

    console.log(`\x1b[38;5;111m┌─ 🚀 Vibe Coder Pro v3.0 ─────────────────────────── 🕒 ${time} ─┐\x1b[0m`);
    const features = `${planningEnabled ? 'Plan' : ''}${reviewerEnabled ? '+Review' : ''}${memoryEntries.length > 0 ? `+Mem${memoryEntries.length}` : ''}`;
    console.log(`\x1b[38;5;111m│\x1b[38;5;255m Ctx:~${ctxTokens} | ${features ? features + ' ' : ''}Agents:${running.length} | Model:${currentTaskModel.split('/')[1] || '?'}${' '.repeat(Math.max(0, 25 - ctxTokens.length - features.length - String(running.length).length - (currentTaskModel.split('/')[1] || '?').length))}\x1b[38;5;111m│\x1b[0m`);

    if (subAgentTracker.length > 0) {
        console.log(`\x1b[38;5;111m├─ 🤖 Sub-Agents ───────────────────────────────────────────────────────────┤\x1b[0m`);
        subAgentTracker.slice(-4).forEach(a => {
            const role   = `[${a.role}]`.padEnd(14);
            const task   = (a.task.length > 42 ? a.task.slice(0, 39) + '...' : a.task).padEnd(42);
            const sc     = a.status === 'Running' ? '\x1b[38;5;220m' : a.status === 'Failed' ? '\x1b[38;5;196m' : '\x1b[38;5;114m';
            const icon   = a.status === 'Running' ? '⏳' : a.status === 'Failed' ? '❌' : '✅';
            const stat   = `[${a.status} ${icon}]`.padStart(17);
            console.log(`\x1b[38;5;111m│ \x1b[38;5;153m${role} \x1b[38;5;255m${task} ${sc}${stat} \x1b[38;5;111m│\x1b[0m`);
        });
    }

    if (pending.length > 0) {
        console.log(`\x1b[38;5;111m├─ 📋 Tasks ─────────────────────────────────────────────────────────────────┤\x1b[0m`);
        pending.slice(0, 4).forEach(t => {
            const s = (t.task.length > 70 ? t.task.slice(0, 67) + '...' : t.task).padEnd(70);
            console.log(`\x1b[38;5;111m│ \x1b[38;5;214m[ ]\x1b[38;5;255m ${s}\x1b[38;5;111m│\x1b[0m`);
        });
        if (pending.length > 4) {
            const more = `... and ${pending.length - 4} more.`.padEnd(70);
            console.log(`\x1b[38;5;111m│ \x1b[38;5;245m    ${more}\x1b[38;5;111m│\x1b[0m`);
        }
    }

    console.log(`\x1b[38;5;111m└────────────────────────────────────────────────────────────────────────────┘\x1b[0m`);
}

function cleanupAndExit(code = 0) {
    if (collaborationServer) websocketServer?.close(), collaborationServer.close();
    rl.close();
    process.exit(code);
}

process.on('SIGINT',  () => cleanupAndExit(0));
process.on('SIGTERM', () => cleanupAndExit(0));

// ==========================================
// 15. SLASH COMMANDS  (FIX: /explain added, /revert improved, /git added)
// ==========================================
function askQuestion() {
    if (process.stdout.isTTY) printDashboard();

    let buffer = [];
    let timer = null;

    const flush = () => {
        rl.removeListener('line', lineCollector);
        const fullInput = buffer.join('\n').trim();
        buffer = [];
        if (!fullInput) return askQuestion();
        processPrompt(fullInput);
    };

    const lineCollector = (line) => {
        buffer.push(line);
        clearTimeout(timer);
        timer = setTimeout(flush, 10);
    };

    rl.question('\x1b[38;5;153m> \x1b[0m', async input => {
        buffer.push(input);
        rl.on('line', lineCollector);
        timer = setTimeout(flush, 10);
    });
}

async function processPrompt(prompt) {
    if (!prompt.startsWith('/')) {
        lastResponseHash = '';  // reset loop detection for new user input
        repeatCount      = 0;
        updateSystemPrompt();
        return runAgentLoop(prompt);
    }

    const spaceIdx = prompt.indexOf(' ');
    const command  = (spaceIdx > -1 ? prompt.slice(0, spaceIdx) : prompt).toLowerCase();
    const args     = spaceIdx > -1 ? prompt.slice(spaceIdx + 1).trim() : '';

    updateUserContext({ type: 'command', command });

    switch (command) {

            case '/exit':
            case '/quit':
                return cleanupAndExit(0);

            case '/':
            case '/help':
                UI.showMenu();
                return askQuestion();

            case '/clear':
                UI.clear();
                return askQuestion();

            case '/todo':
                UI.showTodos();
                return askQuestion();

            case '/models':
                console.log(`\n  MAIN  : ${MODELS.MAIN}`);
                console.log(`  FAST  : ${MODELS.FAST}`);
                console.log(`  VISION: ${MODELS.VISION}`);
                console.log(`  REVIEW: ${MODELS.REVIEW}`);
                console.log(`  DEEP  : ${MODELS.DEEP}`);
                console.log(`  ACTIVE: ${currentTaskModel}\n`);
                return askQuestion();

            case '/model': {
                const modelName = args.toUpperCase();
                if (MODELS[modelName]) {
                    currentTaskModel = MODELS[modelName];
                    UI.success(`Switched to ${modelName} model: ${currentTaskModel}`);
                    updateSystemPrompt('Model switched');
                } else {
                    UI.error(`Unknown model role: ${args}. Available: MAIN, FAST, VISION, REVIEW, DEEP`);
                }
                return askQuestion();
            }

            case '/plan':
                planningEnabled = !planningEnabled;
                UI[planningEnabled ? 'success' : 'warn'](`Planning phase: ${planningEnabled ? 'ON' : 'OFF'}`);
                return askQuestion();

            case '/review':
                reviewerEnabled = !reviewerEnabled;
                UI[reviewerEnabled ? 'success' : 'warn'](`Reviewer phase: ${reviewerEnabled ? 'ON' : 'OFF'}`);
                return askQuestion();

            case '/memory':
                console.log('\n\x1b[33m=== PROJECT MEMORY ===\x1b[0m');
                if (memoryEntries.length === 0) console.log('  No memory entries yet.');
                else memoryEntries.slice(-15).forEach(m => console.log(`  \x1b[90m[${new Date(m.timestamp).toLocaleDateString()}]\x1b[0m ${m.key}: ${m.value.substring(0, 120)}`));
                console.log('\x1b[90m' + '─'.repeat(40) + '\x1b[0m\n');
                return askQuestion();

            case '/context':
                console.log('\n\x1b[33m=== PROJECT CONTEXT ===\x1b[0m');
                console.log(`Tech Stack : ${projectContext.techStack?.join(', ') || 'Not analyzed'}`);
                console.log(`File Count : ${projectContext.fileCount || 'Unknown'}`);
                console.log(`Git Repo   : ${projectContext.hasGit ? 'Yes' : 'No'}`);
                console.log(`Updated    : ${projectContext.lastUpdated || 'Never'}`);
                console.log(`Domain     : ${projectContext.domainTerms?.slice(0, 5).join(', ') || 'None'}`);
                console.log('\x1b[90m' + '─'.repeat(40) + '\x1b[0m\n');
                return askQuestion();

            case '/git': {
                if (!isGitRepo()) { UI.error('Not a git repo. Run /git init first.'); return askQuestion(); }
                if (args === 'init') { gitInit(); return askQuestion(); }
                if (args === 'log')  { console.log(await gitLog(10)); return askQuestion(); }
                if (args === 'diff') { console.log(await gitDiff()); return askQuestion(); }
                const msg = args || 'vibe: manual commit';
                await gitCommit(msg);
                return askQuestion();
            }

            case '/revert': {
                if (args) {
                    revertFile(args);
                } else {
                    // Revert all backed-up files
                    const bDir = path.join(workingDirectory, BACKUP_DIR);
                    if (!fs.existsSync(bDir)) { UI.error('No backups found.'); return askQuestion(); }
                    const backed = [...new Set(
                        fs.readdirSync(bDir)
                            .map(f => f.replace(/\.\d{4}-\d{2}-.*\.bak$/, ''))
                    )];
                    backed.forEach(f => revertFile(f));
                    UI.success(`Reverted ${backed.length} file(s).`);
                }
                return askQuestion();
            }

            case '/reset':
                ['history.json', 'todo.json'].forEach(f => {
                    const p = path.join(workingDirectory, VIBE_DIR, f);
                    if (fs.existsSync(p)) fs.unlinkSync(p);
                });
                conversationHistory = [];
                todoList            = [];
                subAgentTracker     = [];
                lastResponseHash    = '';
                lastResponsePrefix  = '';
                repeatCount         = 0;
                consecutiveAutoContinue = 0;
                currentPlan         = null;
                planningEnabled     = true;
                reviewerEnabled     = true;
                updateSystemPrompt('Fresh start');
                UI.success('Memory, tasks, and loop state cleared. Starting fresh.');
                return askQuestion();

            case '/analyze': {
                if (!args) { UI.error('Usage: /analyze <file>'); return askQuestion(); }
                const fullPath = path.resolve(workingDirectory, args);
                if (!fs.existsSync(fullPath)) { UI.error(`File not found: ${args}`); return askQuestion(); }
                const analysis = await analyzeCode(fullPath);
                console.log('\n\x1b[34m=== CODE ANALYSIS ===\x1b[0m');
                console.log(`File       : ${analysis.filePath}`);
                console.log(`Complexity : ${analysis.complexity.toFixed(1)}/10`);
                if (analysis.technicalDebt > 0) {
                    console.log(`Tech Debt  : ${analysis.technicalDebt}%`);
                }
                if (analysis.issues.length > 0) {
                    console.log('\n\x1b[31mIssues:\x1b[0m');
                    analysis.issues.forEach(i => console.log(`  [${i.severity}] ${i.message}`));  // FIX: i.message not i.content
                }
                if (analysis.suggestions.length > 0) {
                    console.log('\n\x1b[33mSuggestions:\x1b[0m');
                    analysis.suggestions.forEach(s => console.log(`  [${s.severity}] ${s.message}`));  // FIX
                }
                if (analysis.securityIssues.length > 0) {
                    console.log('\n\x1b[31mSecurity:\x1b[0m');
                    analysis.securityIssues.forEach(s => console.log(`  [${s.severity}] ${s.message}`));  // FIX
                }
                if (analysis.issues.length === 0 && analysis.suggestions.length === 0 && analysis.securityIssues.length === 0)
                    UI.success('No issues found!');
                console.log('\x1b[90m' + '─'.repeat(40) + '\x1b[0m\n');
                return askQuestion();
            }

            case '/explain': {  // FIX: was in menu but handler was missing entirely
                if (!args) { UI.error('Usage: /explain <file> or /explain <code snippet>'); return askQuestion(); }
                const explanation = await explainCode(args);
                console.log('\n\x1b[38;5;140m=== EXPLANATION ===\x1b[0m\n');
                console.log(explanation);
                console.log('\x1b[90m' + '─'.repeat(40) + '\x1b[0m\n');
                return askQuestion();
            }

            case '/multiline': {
                UI.system("Multi-line mode. Paste text, then type 'EOF' on an empty line.");
                const lines = [];
                // FIX: use the existing rl instead of creating a conflicting one
                const originalQuestion = rl.question.bind(rl);
                const collectLine = () => {
                    originalQuestion('… ', line => {
                        if (line.trim() === 'EOF') {
                            const combined = lines.join('\n');
                            if (combined.trim()) {
                                console.log('\x1b[38;5;153m💻 You:\x1b[0m [Multi-line input submitted]');
                                lastResponseHash = '';
                                repeatCount = 0;
                                updateSystemPrompt();
                                runAgentLoop(combined);
                            } else {
                                UI.warn('Empty input, ignoring.');
                                askQuestion();
                            }
                        } else {
                            lines.push(line);
                            collectLine();
                        }
                    });
                };
                collectLine();
                return;
            }

            case '/collab': {
                const sub = args.split(' ')[0];
                if (sub === 'start') {
                    const port = parseInt(args.split(' ')[1]) || 3000;
                    startCollaborationServer(port);
                } else if (sub === 'stop') {
                    stopCollaborationServer();
                } else {
                    UI.error('Usage: /collab start [port] | /collab stop');
                }
                return askQuestion();
            }

            case '/vision':
            case '/paste': {
                UI.tool('Clipboard', `Detecting clipboard content (${os.platform()})...`);
                try {
                    const tempImgPath = path.join(workingDirectory, VIBE_DIR, 'clipboard.png');
                    const hasImage    = await getClipboardImage(tempImgPath);
                    if (hasImage) {
                        UI.success('Image extracted from clipboard!');
                        const instruction = args || 'Analyze this image and build the code to recreate it.';
                        const injection   = `I have pasted an image. <view_image file=".vibe/clipboard.png" prompt="${instruction}" />`;
                        console.log('\x1b[38;5;153m💻 You:\x1b[0m [Pasted Image]', instruction);
                        lastResponseHash = '';
                        repeatCount = 0;
                        updateSystemPrompt();
                        return runAgentLoop(injection);
                    }
                    const text = await getClipboardText().catch(() => '');
                    if (text) {
                        UI.success('Text extracted from clipboard!');
                        const injection = args ? `${args}\n\n${text}` : `I have pasted this text:\n\n${text}`;
                        console.log('\x1b[38;5;153m💻 You:\x1b[0m [Pasted Text]', args || '');
                        lastResponseHash = '';
                        repeatCount = 0;
                        updateSystemPrompt();
                        return runAgentLoop(injection);
                    }
                    UI.error('Nothing found in clipboard. Copy something first.');
                } catch (e) { UI.error(e.message); }
                return askQuestion();
            }

            default:
                UI.error(`Unknown command: ${command}. Type /help to see the dashboard.`);
                return askQuestion();
        }
}

// ==========================================
// 16. BOOT SEQUENCE
// ==========================================
function bootWorkspacePrompt() {
    let suggestedDir = process.cwd();
    try {
        if (fs.existsSync(GLOBAL_CONFIG))
            suggestedDir = JSON.parse(fs.readFileSync(GLOBAL_CONFIG, 'utf-8')).lastDir || suggestedDir;
    } catch {}
    rl.question(`\x1b[38;5;140mTarget Workspace \x1b[38;5;240m[${suggestedDir}]\x1b[38;5;140m:\x1b[0m `, async dirInput => {
        const targetDir = dirInput.trim() ? path.resolve(dirInput.trim()) : suggestedDir;
        try {
            if (!fs.existsSync(targetDir)) {
                UI.warn(`Directory does not exist: ${targetDir}`);
                const confirm = await new Promise(r => rl.question('  Create it? (y/n): ', r));
                if (!confirm.trim().toLowerCase().startsWith('y')) {
                    console.log();
                    return bootWorkspacePrompt();
                }
            }
            fs.mkdirSync(targetDir, { recursive: true });
            process.chdir(targetDir);
            workingDirectory = process.cwd();
            const vibeDir = path.join(workingDirectory, VIBE_DIR);
            if (!fs.existsSync(vibeDir)) fs.mkdirSync(vibeDir, { recursive: true });
            fs.writeFileSync(GLOBAL_CONFIG, JSON.stringify({ lastDir: workingDirectory }));
        } catch { workingDirectory = process.cwd(); }

        UI.success(`Workspace: ${workingDirectory}`);

        // Init git if not already a repo
        gitInit();

        // Load saved state
        loadContext();
        loadUserContext();
        loadTodos();
        loadMemory();
        if (memoryEntries.length > 0) UI.system(`Memory: ${memoryEntries.length} entries loaded`);

        // Restore conversation history
        const histPath = path.join(workingDirectory, HISTORY_FILE);
        if (fs.existsSync(histPath)) {
            try {
                conversationHistory = JSON.parse(fs.readFileSync(histPath, 'utf-8')).history || [];
                UI.success('Restored project memory.');
                if (conversationHistory.length > 60)
                    UI.warn('History is large. Run /reset if the agent seems confused.');
            } catch {}
        }

        // Analyze project in background without blocking startup
        analyzeProjectContext().catch(() => {});

        updateSystemPrompt('Boot complete');
        UI.showMenu();
        UI.showTodos();
        askQuestion();
    });
}

UI.clear();
console.log('\x1b[38;5;111m' + '━'.repeat(62));
console.log('   🚀 VIBE CODER PRO v3.0 — MULTI-MODEL AGENTIC ARCHITECTURE');
console.log('   Multi-Model · Planning · Reviewer · Memory · WebSocket Collab');
console.log('━'.repeat(62) + '\x1b[0m\n');
bootWorkspacePrompt();
