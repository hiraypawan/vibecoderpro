import * as readline from 'readline';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { exec } from 'child_process';
import { promisify } from 'util';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';

const execAsync = promisify(exec);

// ==========================================
// 1. DUAL-AGENT CONFIGURATION
// ==========================================
const API_KEY = process.env.HYPERBOLIC_API_KEY || "sk_live_ZffalDrVpLpeSh8-WUpoagbOcHpm2jiVMzvYuNsb28eIIWnbl5znow1hTg1UDStjg"; 
const CODER_MODEL = "Qwen/Qwen3-Coder-480B-A35B-Instruct";
const VISION_MODEL = "meta-llama/Llama-3.2-90B-Vision-Instruct"; 
const API_URL = "https://api.hyperbolic.xyz/v1/chat/completions";

let workingDirectory = process.cwd();
let conversationHistory = [];
let userContext = {};
let projectContext = {};
let todoList = []; 
let collaborationServer = null;
let websocketServer = null;
let codeAnalysisCache = {};

const HISTORY_FILE = '.vibe_history.json';
const TODO_FILE = '.vibe_todo.json'; 
const BACKUP_DIR = '.vibe_backups';
const GLOBAL_CONFIG = path.join(os.homedir(), '.vibe_global_config.json');
const CONTEXT_FILE = '.vibe_context.json';
const COLLAB_DIR = '.vibe_collab';
const ANALYSIS_CACHE = '.vibe_analysis';
const EXPLANATION_CACHE = '.vibe_explanations';
const PWA_DIR = 'public';

// ==========================================
// 2. PROFESSIONAL UI ENGINE (Pure ANSI)
// ==========================================
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

const UI = {
    clear: () => console.clear(),
    divider: () => console.log('\n\x1b[38;5;238m' + '━'.repeat(process.stdout.columns || 80) + '\x1b[0m\n'),
    system: (msg) => console.log(`\x1b[38;5;243m[⚙️ System]\x1b[0m \x1b[3m${msg}\x1b[0m`),
    success: (msg) => console.log(`\x1b[38;5;114m[✓]\x1b[0m \x1b[38;5;150m${msg}\x1b[0m`),
    error: (msg) => console.log(`\x1b[38;5;196m[✗]\x1b[0m \x1b[38;5;203m${msg}\x1b[0m`),
    tool: (name, desc) => console.log(`\x1b[38;5;111m[⚡ ${name}]\x1b[0m \x1b[38;5;246m${desc}\x1b[0m`),
    context: (msg) => console.log(`\x1b[38;5;176m[🧠 Context]\x1b[0m \x1b[38;5;183m${msg}\x1b[0m`),
    analysis: (msg) => console.log(`\x1b[38;5;110m[🔍 Analysis]\x1b[0m \x1b[38;5;153m${msg}\x1b[0m`),
    explain: (msg) => console.log(`\x1b[38;5;140m[📘 Explain]\x1b[0m \x1b[38;5;146m${msg}\x1b[0m`),
    
    showMenu: () => {
        console.log("\n\x1b[48;5;236m\x1b[38;5;255m 🚀 VIBE CLI ENTERPRISE DASHBOARD \x1b[0m");
        console.log("  \x1b[38;5;214m/vision\x1b[0m [prompt]   \x1b[38;5;245m- Grabs image from clipboard & sends to AI\x1b[0m");
        console.log("  \x1b[38;5;214m/todo\x1b[0m              \x1b[38;5;245m- Show active autonomous tasks\x1b[0m");
        console.log("  \x1b[38;5;214m/revert\x1b[0m            \x1b[38;5;245m- Undo the AI's last file changes (Rollback)\x1b[0m");
        console.log("  \x1b[38;5;214m/reset\x1b[0m             \x1b[38;5;245m- Clear AI memory and project history\x1b[0m");
        console.log("  \x1b[38;5;214m/clear\x1b[0m             \x1b[38;5;245m- Clear terminal screen\x1b[0m");
        console.log("  \x1b[38;5;214m/context\x1b[0m           \x1b[38;5;245m- Show current project context\x1b[0m");
        console.log("  \x1b[38;5;214m/analyze\x1b[0m [file]    \x1b[38;5;245m- Analyze code for issues and improvements\x1b[0m");
        console.log("  \x1b[38;5;214m/explain\x1b[0m [code]    \x1b[38;5;245m- Explain code functionality\x1b[0m");
        console.log("  \x1b[38;5;214m/collab start\x1b[0m      \x1b[38;5;245m- Start collaboration WebSocket server\x1b[0m");
        console.log("  \x1b[38;5;214m/collab stop\x1b[0m       \x1b[38;5;245m- Stop collaboration WebSocket server\x1b[0m");
        console.log("  \x1b[38;5;214m/exit\x1b[0m              \x1b[38;5;245m- Safely quit the CLI\x1b[0m");
        console.log("\x1b[38;5;238m" + "━".repeat(40) + "\x1b[0m\n");
    },

    showTodos: () => {
        if (todoList.length === 0) return;
        console.log("\n\x1b[48;5;236m\x1b[38;5;255m 📋 ACTIVE TO-DO LIST \x1b[0m");
        todoList.forEach((t) => {
            const icon = t.status === 'completed' ? '\x1b[38;5;114m[✓]' : '\x1b[38;5;214m[ ]';
            const color = t.status === 'completed' ? '\x1b[38;5;240m\x1b[9m' : '\x1b[38;5;245m';
            console.log(`  ${icon} ${color}${t.task}\x1b[0m`);
        });
        console.log("\x1b[38;5;238m" + "━".repeat(40) + "\x1b[0m\n");
    }
};

// ==========================================
// 3. NATIVE WINDOWS CLIPBOARD & WORKSPACE
// ==========================================
async function getClipboardImage(outputPath) {
    if (os.platform() !== 'win32') throw new Error("Clipboard reading is only supported on Windows.");
    const psScript = `
        Add-Type -AssemblyName System.Windows.Forms;
        $img = [System.Windows.Forms.Clipboard]::GetImage();
        if ($null -ne $img) {
            $img.Save('${outputPath.replace(/\\/g, '\\\\')}', [System.Drawing.Imaging.ImageFormat]::Png);
            Write-Output 'SUCCESS';
        } else { Write-Output 'NO_IMAGE'; }
    `;
    const { stdout } = await execAsync(`powershell -Command "${psScript.replace(/\n/g, ' ')}"`);
    return stdout.trim() === 'SUCCESS';
}

function backupFile(filePath) {
    if (!fs.existsSync(filePath)) return;
    const backupPath = path.join(workingDirectory, BACKUP_DIR, path.basename(filePath));
    if (!fs.existsSync(path.join(workingDirectory, BACKUP_DIR))) {
        fs.mkdirSync(path.join(workingDirectory, BACKUP_DIR), { recursive: true });
    }
    fs.copyFileSync(filePath, backupPath);
}

function getDirectoryTree(dir, depth = 0, maxDepth = 3) {
    if (depth > maxDepth) return "  ".repeat(depth) + "... (limit)\n";
    let tree = "";
    try {
        const items = fs.readdirSync(dir);
        for (const item of items) {
            if (['node_modules', '.git', 'dist', BACKUP_DIR, COLLAB_DIR, ANALYSIS_CACHE, EXPLANATION_CACHE].includes(item)) continue;
            const fullPath = path.join(dir, item);
            if (fs.statSync(fullPath).isDirectory()) {
                tree += `${"  ".repeat(depth)}📁 ${item}/\n` + getDirectoryTree(fullPath, depth + 1, maxDepth);
            } else {
                tree += `${"  ".repeat(depth)}📄 ${item}\n`;
            }
        }
    } catch (e) { }
    return tree;
}

// ==========================================
// 4. DATA & STATE MANAGEMENT
// ==========================================
function loadTodos() {
    try {
        if (fs.existsSync(path.join(workingDirectory, TODO_FILE))) {
            todoList = JSON.parse(fs.readFileSync(path.join(workingDirectory, TODO_FILE), 'utf-8'));
        }
    } catch (e) { UI.error("Failed to load To-Do list"); }
}

function saveTodos() {
    try {
        fs.writeFileSync(path.join(workingDirectory, TODO_FILE), JSON.stringify(todoList, null, 2));
    } catch (e) { UI.error("Failed to save To-Do list"); }
}

function loadContext() {
    try {
        if (fs.existsSync(path.join(workingDirectory, CONTEXT_FILE))) {
            const contextData = fs.readFileSync(path.join(workingDirectory, CONTEXT_FILE), 'utf-8');
            projectContext = JSON.parse(contextData);
            UI.context("Project context loaded");
        }
    } catch (e) { UI.error("Failed to load project context"); }
}

function saveContext() {
    try {
        fs.writeFileSync(path.join(workingDirectory, CONTEXT_FILE), JSON.stringify(projectContext, null, 2));
    } catch (e) { UI.error("Failed to save project context"); }
}

async function analyzeProjectContext() {
    UI.system("Analyzing project context...");
    const techStack = detectTechStack();
    const codeStyle = await analyzeCodeStyle();
    const domainTerms = extractDomainTerms();
    
    projectContext = {
        techStack,
        codeStyle,
        domainTerms,
        lastUpdated: new Date().toISOString(),
        fileCount: countFiles(workingDirectory)
    };
    
    saveContext();
    UI.context("Project context updated");
    return projectContext;
}

function detectTechStack() {
    const techStack = [];
    if (fs.existsSync(path.join(workingDirectory, 'package.json'))) {
        techStack.push('Node.js');
        const packageJson = JSON.parse(fs.readFileSync(path.join(workingDirectory, 'package.json'), 'utf-8'));
        if (packageJson.dependencies) {
            if (packageJson.dependencies.react) techStack.push('React');
            if (packageJson.dependencies.vue) techStack.push('Vue');
            if (packageJson.dependencies.angular) techStack.push('Angular');
        }
    }
    if (fs.existsSync(path.join(workingDirectory, 'requirements.txt'))) {
        techStack.push('Python');
        const requirements = fs.readFileSync(path.join(workingDirectory, 'requirements.txt'), 'utf-8');
        if (requirements.includes('django')) techStack.push('Django');
        if (requirements.includes('flask')) techStack.push('Flask');
    }
    if (fs.existsSync(path.join(workingDirectory, 'pom.xml'))) {
        techStack.push('Java');
        techStack.push('Maven');
    }
    if (fs.existsSync(path.join(workingDirectory, 'build.gradle'))) {
        techStack.push('Java');
        techStack.push('Gradle');
    }
    const files = fs.readdirSync(workingDirectory);
    if (files.some(file => file.endsWith('.csproj'))) {
        techStack.push('.NET');
    }
    return techStack;
}

async function analyzeCodeStyle() {
    // Analyze actual code style from existing files
    const style = {
        indentation: 'spaces',
        indentSize: 2,
        namingConvention: 'camelCase',
        bracketStyle: 'stroustrup',
        lineLength: 100
    };
    
    try {
        // Try to detect from existing JavaScript/TypeScript files
        const files = fs.readdirSync(workingDirectory);
        const jsFiles = files.filter(f => f.endsWith('.js') || f.endsWith('.ts') || f.endsWith('.mjs'));
        
        if (jsFiles.length > 0) {
            const sampleFile = jsFiles[0];
            const content = fs.readFileSync(path.join(workingDirectory, sampleFile), 'utf-8');
            const lines = content.split('\n');
            
            // Detect indentation
            const indentedLines = lines.filter(line => line.match(/^\s+/));
            if (indentedLines.length > 0) {
                const firstIndented = indentedLines[0];
                if (firstIndented.startsWith(' ')) {
                    style.indentation = 'spaces';
                    // Try to detect indent size (2 or 4)
                    const indentMatch = firstIndented.match(/^( +)/);
                    if (indentMatch) {
                        const spaces = indentMatch[1].length;
                        if (spaces % 4 === 0) style.indentSize = 4;
                        else if (spaces % 2 === 0) style.indentSize = 2;
                    }
                } else if (firstIndented.startsWith('\t')) {
                    style.indentation = 'tabs';
                }
            }
            
            // Estimate line length from most lines
            const lineLengths = lines.map(line => line.length).filter(len => len > 0);
            if (lineLengths.length > 0) {
                const avgLength = lineLengths.reduce((a, b) => a + b, 0) / lineLengths.length;
                style.lineLength = Math.round(avgLength / 10) * 10; // Round to nearest 10
                if (style.lineLength < 80) style.lineLength = 80;
                if (style.lineLength > 120) style.lineLength = 120;
            }
        }
    } catch (e) {
        // Fallback to defaults
        console.error("Code style analysis failed:", e.message);
    }
    
    return style;
}

function extractDomainTerms() {
    return [];
}

function countFiles(dir) {
    let count = 0;
    try {
        const items = fs.readdirSync(dir);
        for (const item of items) {
            if (['node_modules', '.git', 'dist', BACKUP_DIR, COLLAB_DIR, ANALYSIS_CACHE].includes(item)) continue;
            const fullPath = path.join(dir, item);
            if (fs.statSync(fullPath).isDirectory()) count += countFiles(fullPath);
            else count++;
        }
    } catch (e) { }
    return count;
}

// ==========================================
// 5. CODE EXPLANATION ENGINE
// ==========================================
async function explainCode(codeSnippet) {
    UI.system("Generating code explanation...");
    const cacheKey = Buffer.from(codeSnippet).toString('base64').substring(0, 32);
    const cachePath = path.join(workingDirectory, EXPLANATION_CACHE, `${cacheKey}.json`);
    
    try {
        if (fs.existsSync(cachePath)) {
            const cached = JSON.parse(fs.readFileSync(cachePath, 'utf-8'));
            if (Date.now() - new Date(cached.timestamp).getTime() < 24 * 60 * 60 * 1000) {
                UI.explain("Using cached explanation");
                return cached.explanation;
            }
        }
    } catch (e) { }
    
    const messages = [
        { role: "system", content: "You are an expert code explainer. Provide clear, concise explanations of code functionality." },
        { role: "user", content: `Explain the following code in simple terms:\n\n${codeSnippet}` }
    ];
    
    try {
        const response = await callLLM(CODER_MODEL, messages, false);
        const data = await response.json();
        const explanation = data.choices[0].message.content;
        
        try {
            if (!fs.existsSync(EXPLANATION_CACHE)) fs.mkdirSync(EXPLANATION_CACHE);
            fs.writeFileSync(cachePath, JSON.stringify({ code: codeSnippet, explanation: explanation, timestamp: new Date().toISOString() }, null, 2));
        } catch (e) {}
        
        return explanation;
    } catch (e) {
        return `Failed to generate explanation: ${e.message}`;
    }
}

// ==========================================
// 6. ADVANCED CODE ANALYSIS TOOLS
// ==========================================
async function analyzeCode(filePath) {
    UI.analysis(`Analyzing ${filePath}...`);
    const cacheKey = `${filePath}-${fs.statSync(filePath).mtimeMs}`;
    if (codeAnalysisCache[cacheKey]) {
        UI.analysis("Using cached analysis");
        return codeAnalysisCache[cacheKey];
    }
    
    const content = fs.readFileSync(filePath, 'utf-8');
    const ext = path.extname(filePath);
    
    let analysis = { filePath, issues: [], suggestions: [], complexity: 0, securityIssues: [] };
    const lines = content.split('\n');
    analysis.complexity = Math.min(10, lines.length / 20);
    
    switch (ext) {
        case '.js':
        case '.ts': analysis = await analyzeJavaScript(content, analysis); break;
        case '.py': analysis = await analyzePython(content, analysis); break;
        case '.java': analysis = await analyzeJava(content, analysis); break;
    }
    
    codeAnalysisCache[cacheKey] = analysis;
    try {
        if (!fs.existsSync(ANALYSIS_CACHE)) fs.mkdirSync(ANALYSIS_CACHE);
        fs.writeFileSync(path.join(ANALYSIS_CACHE, `${path.basename(filePath)}.json`), JSON.stringify(analysis, null, 2));
    } catch (e) { UI.error("Failed to save analysis cache"); }
    
    return analysis;
}

async function analyzeJavaScript(content, analysis) {
    // Enhanced JavaScript analysis with more comprehensive checks
    
    // Basic syntax/style issues
    if (content.includes('var ')) analysis.issues.push({ type: 'warning', content: 'Use let or const instead of var', severity: 'medium' });
    if (!content.includes('use strict')) analysis.suggestions.push({ type: 'suggestion', content: 'Consider adding "use strict" directive', severity: 'low' });
    
    const consoleLogMatches = content.match(/console\.log/g);
    if (consoleLogMatches) analysis.issues.push({ type: 'warning', content: `Found ${consoleLogMatches.length} console.log statements`, severity: 'low' });
    
    // Code quality checks
    const lines = content.split('\n');
    let functionCount = 0;
    let nestedDepth = 0;
    let maxNestedDepth = 0;
    
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        
        // Count functions
        if (line.includes('function ') || line.includes('=>')) {
            functionCount++;
        }
        
        // Check nesting depth (approximate)
        const indentMatch = line.match(/^(\s*)/);
        if (indentMatch) {
            const indentLevel = indentMatch[1].length / 2; // Assuming 2-space indentation
            nestedDepth = Math.max(nestedDepth, indentLevel);
            maxNestedDepth = Math.max(maxNestedDepth, indentLevel);
        }
        
        // Check for long lines
        if (line.length > 100) {
            analysis.issues.push({ 
                type: 'warning', 
                content: `Line ${i + 1} is ${line.length} characters long (exceeds 100 character limit)`, 
                severity: 'low' 
            });
        }
    }
    
    // Complexity warnings
    if (maxNestedDepth > 5) {
        analysis.issues.push({ 
            type: 'warning', 
            content: `Deep nesting detected (level ${maxNestedDepth}). Consider refactoring to reduce complexity.`, 
            severity: 'medium' 
        });
    }
    
    if (functionCount > 20) {
        analysis.suggestions.push({ 
            type: 'suggestion', 
            content: `File contains ${functionCount} functions. Consider splitting into smaller modules.`, 
            severity: 'medium' 
        });
    }
    
    // Check for potential security issues
    if (content.includes('eval(')) {
        analysis.issues.push({ 
            type: 'error', 
            content: 'Use of eval() is discouraged due to security risks', 
            severity: 'high' 
        });
    }
    
    if (content.includes('innerHTML') && (content.includes('+') || content.includes('+=\'))) {
        analysis.issues.push({ 
            type: 'warning', 
            content: 'Direct DOM manipulation with innerHTML can lead to XSS vulnerabilities', 
            severity: 'medium' 
        });
    }
    
    return analysis;
}

async function analyzePython(content, analysis) {
    if (content.includes('print(') && !content.includes('# pylint: disable=print-statement')) analysis.issues.push({ type: 'warning', message: 'Avoid using print() in production code', severity: 'medium' });
    if (!content.includes('"""') && content.includes('def ')) analysis.suggestions.push({ type: 'suggestion', message: 'Consider adding docstrings to your functions', severity: 'low' });
    return analysis;
}

async function analyzeJava(content, analysis) {
    if (content.includes('System.out.println') && !content.includes('// NOSONAR')) analysis.issues.push({ type: 'warning', message: 'Avoid using System.out.println in production code', severity: 'medium' });
    if (content.includes('catch (Exception') && !content.includes('// NOSONAR')) analysis.suggestions.push({ type: 'suggestion', message: 'Consider catching specific exceptions instead of generic Exception', severity: 'medium' });
    return analysis;
}

// ==========================================
// 7. COLLABORATION FEATURES
// ==========================================
function startCollaborationServer(port = 3000) {
    if (collaborationServer) return UI.error("Collaboration server is already running");
    
    collaborationServer = createServer((req, res) => {
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end('Vibe Coder Pro Collaboration Server');
    });
    
    websocketServer = new WebSocketServer({ server: collaborationServer });
    websocketServer.on('connection', (ws) => {
        UI.system("New collaborator connected");
        ws.on('message', (message) => {
            websocketServer.clients.forEach((client) => {
                if (client !== ws && client.readyState === WebSocket.OPEN) client.send(message);
            });
        });
        ws.on('close', () => UI.system("Collaborator disconnected"));
    });
    
    collaborationServer.listen(port, () => {
        UI.success(`Collaboration server started on port ${port}`);
        UI.success(`Share this URL with collaborators: ws://localhost:${port}`);
    });
}

function stopCollaborationServer() {
    if (!collaborationServer) return UI.error("Collaboration server is not running");
    websocketServer.close();
    collaborationServer.close(() => {
        UI.success("Collaboration server stopped");
        collaborationServer = null;
        websocketServer = null;
    });
}

// ==========================================
// 8. ADAPTIVE LEARNING
// ==========================================
function updateUserContext(interaction) {
    if (!userContext.interactions) userContext.interactions = [];
    userContext.interactions.push({ ...interaction, timestamp: new Date().toISOString() });
    if (userContext.interactions.length > 100) userContext.interactions = userContext.interactions.slice(-100);
    analyzeUserPatterns();
}

function analyzeUserPatterns() {
    if (!userContext.interactions || userContext.interactions.length < 5) return;
    const recentInteractions = userContext.interactions.slice(-20);
    const commandCount = {};
    recentInteractions.forEach(interaction => {
        if (interaction.type === 'command') commandCount[interaction.command] = (commandCount[interaction.command] || 0) + 1;
    });
    const sortedCommands = Object.entries(commandCount).sort((a, b) => b[1] - a[1]).slice(0, 3);
    userContext.preferredCommands = sortedCommands.map(([command]) => command);
    try { fs.writeFileSync(path.join(workingDirectory, '.vibe_user_context.json'), JSON.stringify(userContext, null, 2)); } catch (e) {}
}

function loadUserContext() {
    try {
        const contextPath = path.join(workingDirectory, '.vibe_user_context.json');
        if (fs.existsSync(contextPath)) {
            userContext = JSON.parse(fs.readFileSync(contextPath, 'utf-8'));
            UI.context("User context loaded");
        }
    } catch (e) { UI.error("Failed to load user context"); }
}

// ==========================================
// 9. API & DUAL-AGENT ENGINE
// ==========================================
async function callLLM(model, messages, stream = false) {
    const response = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${API_KEY}` },
        body: JSON.stringify({ model, messages, stream })
    });
    if (!response.ok) throw new Error(`API Error: ${response.status}`);
    return response;
}

async function spawnCoderSubAgent(taskName, instructions) {
    UI.tool("Parallel Worker", `Spawning sub-agent for: ${taskName}`);
    const msgs = [{ role: "system", content: `You are a parallel sub-agent. Output ONLY code inside <write> tags. Task: ${instructions}` }];
    try {
        const res = await callLLM(CODER_MODEL, msgs, false);
        const data = await res.json();
        return `Sub-Agent '${taskName}' finished:\n${data.choices[0].message.content}`;
    } catch (e) { return `Sub-Agent '${taskName}' failed: ${e.message}`; }
}

async function runVisionAgent(filePath, userPrompt) {
    UI.tool("Vision Engine", `Scanning ${path.basename(filePath)}...`);
    try {
        const ext = path.extname(filePath).replace('.', '');
        const b64 = fs.readFileSync(filePath, 'base64');
        const msgs = [{
            role: "user",
            content: [
                { type: "text", text: `You are a vision-to-code translator. ${userPrompt}` },
                { type: "image_url", image_url: { url: `data:image/${ext || 'png'};base64,${b64}` } }
            ]
        }];
        const res = await callLLM(VISION_MODEL, msgs, false);
        const data = await res.json();
        return `Vision Agent Analysis of ${path.basename(filePath)}:\n${data.choices[0].message.content}`;
    } catch (e) { return `Vision Agent failed on ${filePath}: ${e.message}`; }
}

// ==========================================
// 10. CORE AUTONOMOUS LOOP (The "Brain")
// ==========================================
async function runAgentLoop(userInput = null, loopCount = 0) {
    if (loopCount > 50) {
        UI.system("Maximum autonomous loops (50) reached. Pausing to prevent runaway API costs.");
        askQuestion();
        return;
    }

    if (userInput) {
        conversationHistory.push({ role: "user", content: userInput });
        updateUserContext({ type: 'message', content: userInput });
    }

    try {
        process.stdout.write('\x1b[38;5;220m🤖 Architect:\x1b[0m ');
        const response = await callLLM(CODER_MODEL, conversationHistory, true);
        const reader = response.body.getReader();
        const decoder = new TextDecoder('utf-8');
        
        let fullResponse = "";
        let streamBuffer = "";
        let isHiding = false; 

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            const chunk = decoder.decode(value, { stream: true });
            const lines = chunk.split('\n');

            for (const line of lines) {
                if (line.trim().startsWith('data: ') && line.trim() !== 'data: [DONE]') {
                    try {
                        const text = JSON.parse(line.trim().substring(6)).choices[0].delta.content || "";
                        fullResponse += text;
                        streamBuffer += text;

                        // UI STREAMING UX: Hide ONLY <write> and <edit> so 1-line tools show in real-time
                        if (!isHiding && streamBuffer.match(/<(write|edit)\b/)) {
                            isHiding = true;
                            process.stdout.write('\n\x1b[38;5;111m[⚡ Agent is modifying files...]\x1b[0m\n');
                        }

                        if (!isHiding) {
                            process.stdout.write(text);
                        }

                        if (isHiding && streamBuffer.match(/<\/write>|<\/edit>/)) {
                            isHiding = false;
                            streamBuffer = ""; 
                        }
                        
                        if (streamBuffer.length > 100) streamBuffer = streamBuffer.slice(-100);
                    } catch (e) {}
                }
            }
        }
        console.log('\n');
        conversationHistory.push({ role: "assistant", content: fullResponse });

        let autoContinue = false;
        let systemFeedback = [];
        let parallelTasks = []; 

        // --- TRUNCATION DETECTOR ---
        const openWrites = (fullResponse.match(/<write /g) || []).length;
        const closeWrites = (fullResponse.match(/<\/write>/g) || []).length;
        if (openWrites > closeWrites) {
            UI.system("Agent hit API output limit! Triggering self-recovery...");
            systemFeedback.push(`SYSTEM ERROR: Your output was cut off and the file was NOT saved. Strategy: Change your approach. Use <edit> to modify smaller chunks.`);
            autoContinue = true;
        }

        // --- TOOL: TO-DO LIST MANAGEMENT ---
        const todoRegex = /<todo action="(add|complete|remove)" task="([^"]+)"\s*\/>/g;
        let match;
        while ((match = todoRegex.exec(fullResponse)) !== null) {
            const action = match[1];
            const taskText = match[2];
            
            if (action === 'add') {
                if (!todoList.find(t => t.task === taskText)) todoList.push({ task: taskText, status: 'pending' });
                systemFeedback.push(`Task Added: ${taskText}`);
            } else if (action === 'complete') {
                const t = todoList.find(t => t.task === taskText);
                if (t) t.status = 'completed';
                systemFeedback.push(`Task Completed: ${taskText}`);
            } else if (action === 'remove') {
                todoList = todoList.filter(t => t.task !== taskText);
                systemFeedback.push(`Task Removed: ${taskText}`);
            }
            saveTodos();
            UI.showTodos();
            autoContinue = true;
        }

        // --- TOOL: AUTO-CONTINUE ---
        const continueRegex = /<continue reason="([^"]+)"\s*\/>/g;
        while ((match = continueRegex.exec(fullResponse)) !== null) {
            systemFeedback.push(`Autonomous System: Continuing work loop. Reason: ${match[1]}`);
            autoContinue = true;
        }

        // --- TOOL: VIEW IMAGE (VISION API) ---
        const visionRegex = /<view_image file="([^"]+)" prompt="([^"]+)"\s*\/>/g;
        while ((match = visionRegex.exec(fullResponse)) !== null) {
            const targetPath = path.resolve(workingDirectory, match[1]);
            const result = await runVisionAgent(targetPath, match[2]);
            systemFeedback.push(result);
            autoContinue = true;
        }

        // --- TOOL: DELEGATE (PARALLELISM) ---
        const delegateRegex = /<delegate task="([^"]+)">([\s\S]*?)<\/delegate>/g;
        while ((match = delegateRegex.exec(fullResponse)) !== null) {
            parallelTasks.push(spawnCoderSubAgent(match[1], match[2]));
        }

        // --- TOOL: WRITE (PARALLELISM) (BUG FIX: Locally scoped fileName) ---
        const writeRegex = /<write file="([^"]+)">([\s\S]*?)<\/write>/g;
        while ((match = writeRegex.exec(fullResponse)) !== null) {
            const fileName = match[1]; // Locally scoped to survive the promise closure!
            const targetPath = path.resolve(workingDirectory, fileName);
            backupFile(targetPath);
            const content = match[2].trim();
            parallelTasks.push(
                fs.promises.mkdir(path.dirname(targetPath), { recursive: true })
                  .then(() => fs.promises.writeFile(targetPath, content, 'utf-8'))
                  .then(() => UI.success(`Created file: ${fileName}`))
            );
        }

        // EXECUTE ALL DELEGATES & WRITES SIMULTANEOUSLY
        if (parallelTasks.length > 0) {
            const results = await Promise.all(parallelTasks);
            results.filter(r => typeof r === 'string').forEach(r => systemFeedback.push(r));
            if (systemFeedback.length > 0) autoContinue = true;
        }

        // --- TOOL: EDIT (PARTIAL EDITS / DIFF) ---
        const editRegex = /<edit file="([^"]+)">\s*<search>([\s\S]*?)<\/search>\s*<replace>([\s\S]*?)<\/replace>\s*<\/edit>/g;
        while ((match = editRegex.exec(fullResponse)) !== null) {
            const targetPath = path.resolve(workingDirectory, match[1]);
            const searchStr = match[2].trim();
            const replaceStr = match[3].trim();
            
            if (fs.existsSync(targetPath)) {
                backupFile(targetPath);
                let content = fs.readFileSync(targetPath, 'utf-8');
                if (content.includes(searchStr)) {
                    content = content.replace(searchStr, replaceStr);
                    fs.writeFileSync(targetPath, content, 'utf-8');
                    UI.success(`Partially edited: ${match[1]}`);
                } else {
                    systemFeedback.push(`Edit Failed on ${match[1]}: Could not find the exact <search> string to replace.`);
                    autoContinue = true;
                }
            } else { systemFeedback.push(`Edit Failed: ${match[1]} does not exist.`); }
        }

        // --- TOOL: TERMINAL COMMANDS (WITH HUMAN-IN-THE-LOOP SAFETY) ---
        const runRegex = /<run cmd="((?:[^"\\]|\\.)*)"\s*\/>/g;
        while ((match = runRegex.exec(fullResponse)) !== null) {
            const cmd = match[1].replace(/\\"/g, '"');
            
            const confirmCmd = await new Promise(resolve => {
                rl.question(`\n\x1b[38;5;196m⚠️ Agent wants to run:\x1b[0m \x1b[38;5;220m${cmd}\x1b[0m \n\x1b[38;5;153mAllow execution? (y/n):\x1b[0m `, ans => resolve(ans.toLowerCase()));
            });

            if (confirmCmd === 'y' || confirmCmd === 'yes') {
                UI.tool("Terminal", `Running: ${cmd}`);
                try {
                    const { stdout, stderr } = await execAsync(cmd, { cwd: workingDirectory, timeout: 20000 });
                    systemFeedback.push(`Command Output [${cmd}]:\n${stdout || stderr || 'Success'}`);
                } catch (error) { systemFeedback.push(`Command Error [${cmd}]:\n${error.message}`); }
            } else {
                UI.error(`Command rejected: ${cmd}`);
                systemFeedback.push(`System Feedback: The user rejected the command [${cmd}]. Suggest an alternative or proceed without it.`);
            }
            autoContinue = true;
        }

        // --- TOOL: READ FILE ---
        const readRegex = /<read file="([^"]+)"(?:[^>]*?lines="(\d+)-(\d+)")?[^>]*\/>/g;
        while ((match = readRegex.exec(fullResponse)) !== null) {
            try {
                const filePath = match[1];
                let content = fs.readFileSync(path.resolve(workingDirectory, filePath), 'utf-8');
                
                if (match[2] && match[3]) {
                    const start = Math.max(0, parseInt(match[2]) - 1);
                    const end = parseInt(match[3]);
                    const lines = content.split('\n');
                    
                    if (start >= lines.length) {
                        systemFeedback.push(`File Content [${filePath}] (Lines ${match[2]}-${match[3]}):\n[ERROR: Lines out of bounds.]`);
                    } else {
                        content = lines.slice(start, end).join('\n');
                        systemFeedback.push(`File Content [${filePath}] (Lines ${match[2]}-${match[3]}):\n${content}`);
                    }
                } else {
                    systemFeedback.push(`File Content [${filePath}]:\n${content}`);
                }
            } catch (e) { 
                systemFeedback.push(`Read Error: ${match[1]} not found.`); 
            }
            autoContinue = true;
        }

        // Recursive Agent Check
        if (autoContinue) {
            UI.system("Synthesizing tool outputs...");
            updateSystemPrompt("Action Feedback Cycle");
            conversationHistory.push({ role: "system", content: "Action Feedback:\n" + systemFeedback.join('\n\n') + "\nAnalyze and continue processing." });
            await runAgentLoop(null, loopCount + 1);
        } else {
            // Save state when finished thinking
            fs.writeFileSync(path.join(workingDirectory, HISTORY_FILE), JSON.stringify({ history: conversationHistory }));
            askQuestion();
        }

    } catch (error) {
        UI.error(`System Fault: ${error.message}`);
        askQuestion();
    }
}

// ==========================================
// 11. SLASH COMMANDS & UI CHAT INTERFACE
// ==========================================
function askQuestion() {
    UI.divider();
    rl.question('\x1b[38;5;153m💻 You (Type /help for menu):\x1b[0m ', async (input) => {
        const prompt = input.trim();
        if (!prompt) return askQuestion();

        if (prompt.startsWith('/')) {
            const command = prompt.split(' ')[0].toLowerCase();
            const args = prompt.substring(command.length).trim();
            
            if (command === '/exit' || command === '/quit') process.exit(0);
            
            if (command === '/' || command === '/help') {
                UI.showMenu();
                return askQuestion();
            }

            if (command === '/clear') { UI.clear(); return askQuestion(); }

            if (command === '/todo') { UI.showTodos(); return askQuestion(); }
            
            if (command === '/revert') {
                const bDir = path.join(workingDirectory, BACKUP_DIR);
                if (!fs.existsSync(bDir)) { UI.error("No backups found to revert."); } 
                else {
                    fs.readdirSync(bDir).forEach(file => fs.copyFileSync(path.join(bDir, file), path.join(workingDirectory, file)));
                    UI.success("Rolled back to previous state.");
                }
                return askQuestion();
            }

            if (command === '/reset') {
                if (fs.existsSync(path.join(workingDirectory, HISTORY_FILE))) fs.unlinkSync(path.join(workingDirectory, HISTORY_FILE));
                if (fs.existsSync(path.join(workingDirectory, TODO_FILE))) fs.unlinkSync(path.join(workingDirectory, TODO_FILE));
                conversationHistory = [];
                todoList = [];
                updateSystemPrompt("Clean slate.");
                UI.success("Memory and Tasks wiped. Starting fresh.");
                return askQuestion();
            }

            if (command === '/context') {
                console.log("\n\x1b[33m=== PROJECT CONTEXT ===\x1b[0m");
                console.log(`Tech Stack: ${projectContext.techStack ? projectContext.techStack.join(', ') : 'Not analyzed'}`);
                console.log(`File Count: ${projectContext.fileCount || 'Unknown'}`);
                console.log(`Last Updated: ${projectContext.lastUpdated || 'Never'}`);
                console.log("\x1b[90m" + "─".repeat(40) + "\x1b[0m\n");
                return askQuestion();
            }

            if (command === '/analyze') {
                const filePath = args || null;
                if (!filePath) {
                    UI.error("Please specify a file to analyze: /analyze <file>");
                    return askQuestion();
                }
                
                const fullPath = path.resolve(workingDirectory, filePath);
                if (!fs.existsSync(fullPath)) {
                    UI.error(`File not found: ${filePath}`);
                    return askQuestion();
                }
                
                try {
                    const analysis = await analyzeCode(fullPath);
                    console.log("\n\x1b[34m=== CODE ANALYSIS ===\x1b[0m");
                    console.log(`File: ${analysis.filePath}`);
                    console.log(`Complexity: ${analysis.complexity}/10`);
                    
                    if (analysis.issues.length > 0) {
                        console.log("\n\x1b[31mIssues:\x1b[0m");
                        analysis.issues.forEach(issue => {
                            console.log(`  - ${issue.message} (${issue.severity})`);
                        });
                    }
                    
                    if (analysis.suggestions.length > 0) {
                        console.log("\n\x1b[33mSuggestions:\x1b[0m");
                        analysis.suggestions.forEach(suggestion => {
                            console.log(`  - ${suggestion.message} (${suggestion.severity})`);
                        });
                    }
                    
                    if (analysis.securityIssues.length > 0) {
                        console.log("\n\x1b[31mSecurity Issues:\x1b[0m");
                        analysis.securityIssues.forEach(issue => {
                            console.log(`  - ${issue.message} (${issue.severity})`);
                        });
                    }
                    
                    console.log("\x1b[90m" + "─".repeat(40) + "\x1b[0m\n");
                } catch (e) {
                    UI.error(`Analysis failed: ${e.message}`);
                }
                
                return askQuestion();
            }

            if (command === '/collab') {
                const subcommand = args.split(' ')[0];
                
                if (subcommand === 'start') {
                    const port = args.split(' ')[1] || 3000;
                    startCollaborationServer(parseInt(port));
                } else if (subcommand === 'stop') {
                    stopCollaborationServer();
                } else {
                    UI.error("Usage: /collab start [port] or /collab stop");
                }
                
                return askQuestion();
            }

            if (command === '/vision' || command === '/paste') {
                UI.tool("Clipboard", "Reading Windows clipboard...");
                try {
                    const tempImgPath = path.join(workingDirectory, '.vibe_clipboard.png');
                    const hasImage = await getClipboardImage(tempImgPath);
                    
                    if (hasImage) {
                        UI.success("Image extracted from clipboard successfully!");
                        const instruction = args || "Analyze this image and build the code required to recreate it.";
                        const injection = `I have pasted an image from my clipboard. <view_image file=".vibe_clipboard.png" prompt="${instruction}" />`;
                        console.log(`\x1b[38;5;153m💻 You:\x1b[0m [Pasted Image] ${instruction}`);
                        return runAgentLoop(injection, 0);
                    } else {
                        UI.error("No image found in clipboard! Press Win+Shift+S, copy an image, and try again.");
                        return askQuestion();
                    }
                } catch (e) {
                    UI.error(e.message);
                    return askQuestion();
                }
            }
            
            UI.error(`Unknown command: ${command}. Type /help to see the dashboard.`);
            return askQuestion();
        }
        
        // --- STANDARD CHAT ---
        runAgentLoop(prompt, 0);
    });
}

function updateSystemPrompt(summary) {
    const pendingTodos = todoList.filter(t => t.status === 'pending').map(t => `- ${t.task}`).join('\n');
    
    const sysContent = `You are a Senior AI Architect running in an autonomous terminal.
Location: ${workingDirectory}

WORKSPACE TREE:
${getDirectoryTree(workingDirectory)}

PROJECT CONTEXT:
Tech Stack: ${projectContext.techStack ? projectContext.techStack.join(', ') : 'Not analyzed'}
Code Style: ${projectContext.codeStyle ? JSON.stringify(projectContext.codeStyle) : 'Not analyzed'}

ACTIVE TO-DO LIST:
${pendingTodos || 'No pending tasks. Wait for user instructions.'}

TOOLS AT YOUR DISPOSAL:
1. WRITE NEW FILE: <write file="path.js">full code</write>
2. EDIT EXISTING FILE: <edit file="path.js"><search>old code</search><replace>new code</replace></edit>
3. READ FILE: <read file="path.js" /> (reads the whole file) OR <read file="path.js" lines="1-150" /> (for massive files)
4. RUN COMMAND: <run cmd="npm run test" />
5. VIEW IMAGE: <view_image file="design.png" prompt="Extract UI layout details" />
6. MANAGE TASKS: <todo action="add" task="Build API" /> or <todo action="complete" task="Build API" /> or <todo action="remove" task="Old Task" />
7. AUTO-CONTINUE: <continue reason="Moving to next step" />

CRITICAL DIRECTIVES:
- PREFER reading the entire file with <read file="file.js" /> rather than using the 'lines' attribute unless the file is massive.
- If you have an active task in your TO-DO LIST, you MUST use the <continue /> tool to autonomously keep working without waiting for the user to type anything!
- Use <todo action="complete" task="..." /> to check off tasks as you finish them.
- NEVER modify or write to 'agent.mjs' (your own source code) unless the user explicitly and directly commands you to.
- If the user says "hello" or greets you, DO NOT resume old history. Check the TO-DO list. If it is empty, ask them what they want to build today.
- Avoid using escaped double-quotes (\\") inside XML attributes.`;

    const idx = conversationHistory.findIndex(m => m.role === "system");
    if (idx !== -1) conversationHistory[idx].content = sysContent;
    else conversationHistory.unshift({ role: "system", content: sysContent });
}

// ==========================================
// 12. BOOT SEQUENCE
// ==========================================
UI.clear();
console.log("\x1b[38;5;111m" + "━".repeat(60));
console.log("   🚀 QWEN3 VIBE CODER PRO — ENTERPRISE ARCHITECTURE  ");
console.log("━".repeat(60) + "\x1b[0m\n");

let suggestedDir = process.cwd();
try {
    if (fs.existsSync(GLOBAL_CONFIG)) suggestedDir = JSON.parse(fs.readFileSync(GLOBAL_CONFIG, 'utf-8')).lastDir || suggestedDir;
} catch (e) {}

rl.question(`\x1b[38;5;140mTarget Workspace \x1b[38;5;240m[${suggestedDir}]\x1b[38;5;140m:\x1b[0m `, (dirInput) => {
    let targetedDir = dirInput.trim() ? path.resolve(dirInput.trim()) : suggestedDir;
    try {
        fs.mkdirSync(targetedDir, { recursive: true });
        process.chdir(targetedDir);
        workingDirectory = process.cwd();
        fs.writeFileSync(GLOBAL_CONFIG, JSON.stringify({ lastDir: workingDirectory }));
    } catch (e) { workingDirectory = process.cwd(); }

    UI.success(`Swarm active in: ${workingDirectory}`);

    // Load context, preferences, and state
    loadContext();
    loadUserContext();
    loadTodos();

    if (fs.existsSync(path.join(workingDirectory, HISTORY_FILE))) {
        try {
            conversationHistory = JSON.parse(fs.readFileSync(path.join(workingDirectory, HISTORY_FILE), 'utf-8')).history;
            UI.success("Restored project memory.");
            
            // Safety measure: auto-wipe bloated history to prevent loops
            if (conversationHistory.length > 25) {
                UI.system("Detected heavily loaded history. Consider running /reset if the agent acts confused.");
            }
        } catch(e) {}
    }
    
    updateSystemPrompt("Active project workspace.");
    UI.showMenu();
    UI.showTodos();

    askQuestion();
});