# VIBE CODER PRO v3.0 — DIAGNOSTIC BENCHMARKS

## How to run a test

```
1. Open benchmark/test_X_prompt.txt in a text editor
2. SELECT ALL and COPY the entire file contents
3. At the > prompt: type /clear then /reset
4. PASTE the copied contents at the > prompt (NOT the filename)
5. Wait for agent to generate the file
6. Run: node benchmark/test_X_verify.cjs
7. Record pass/fail in the score sheet below
```

**⚠️ IMPORTANT**: Paste the FILE CONTENTS, not the filename. 
If the agent starts building something unrelated, you pasted the wrong thing.

---

## Tier 1: Algorithmic Logic

### Test A — Topological Sort Engine

Prompt: `benchmark/test_A_prompt.txt`
Verify: `node benchmark/test_A_verify.cjs`
Expected: `benchmark/topological-sort.js`

Edge cases:
- Valid DAG → ordered array
- Single node → [that node]
- 1000-node chain → <100ms
- Cycle → `{ error: "cycle", path: [...] }`
- Empty → `[]`
- Invalid input → `TypeError`

### Test B — Reactive Value Propagation

Prompt: `benchmark/test_B_prompt.txt`
Verify: `node benchmark/test_B_verify.cjs`
Expected: `benchmark/reactive-graph.js`

Edge cases:
- Addition: const(5) + const(3) = 8
- Multiplication: const(4) × const(5) = 20
- Chain: const → add → multiply → display
- Cycle rejection: connect() throws on cycle
- Partial update: changing one input only re-evaluates downstream
- Display node: console.log on value change
- Unconnected input: returns NaN

---

## Tier 2: Code Surgery

### Test C — Fix Broken Wire System

1. Ask the agent to generate the node graph HTML first (paste the original benchmark prompt)
2. Then paste the "Fix" prompt below

**Instructions for agent:**
```
I have the file node-graph.html that was generated earlier.
Read it. Then make these surgical edits:

1. Replace the wire-draw code in handleMouseMove (the temporary connection line)
   to draw a BEZIER CURVE instead of a straight line.
   Current (broken):
     this.ctx.beginPath();
     const startPort = this.getPortPosition(...);
     this.ctx.moveTo(startPort.x, startPort.y);
     this.ctx.lineTo(mouseX, mouseY);
     this.ctx.stroke();
   Should be:
     this.ctx.beginPath();
     const startPort = this.getPortPosition(...);
     this.ctx.moveTo(startPort.x, startPort.y);
     const cp1x = startPort.x + Math.abs(mouseX - startPort.x) * 0.5;
     const cp1y = startPort.y;
     const cp2x = mouseX - Math.abs(mouseX - startPort.x) * 0.5;
     const cp2y = mouseY;
     this.ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, mouseX, mouseY);
     this.ctx.stroke();

2. Add click-to-delete for wires:
   - In handleMouseDown, before the node click detection,
     iterate this.connections and check if the click point is within
     5px of any connection's Bezier curve path.
   - If so, remove that connection and return early.

Do NOT rewrite the file. Only change the specific lines mentioned.
```

### Test D — Add Missing Features

**Instructions for agent:**
```
Read the file node-graph.html. Add these features WITHOUT restructuring
the code:

1. Grid background:
   - In the render() method, BEFORE drawing connections, draw a grid.
   - Spacing: 30px in canvas coordinates (zooms/pan with viewport).
   - Color: rgba(255,255,255,0.05) minor, rgba(255,255,255,0.1) major (every 5th).
   - Grid must translate and scale with the viewport transform.

2. Input Node slider:
   - For input nodes, show an <input type="range" min="0" max="100"
     on the node body (not just in properties panel).
   - Default value: 50. Show current value next to slider.
   - When slider changes, update node.properties.value.

3. localStorage Save/Load:
   - Export button → localStorage key "ng_workspace"
   - Import button → load from that key
   - Auto-save on beforeunload
   - Auto-restore on page load if data exists

Do NOT restructure the code. Only add what's described.
```

---

## Tier 3: Context & Precision

### Test E — Large File Refactor

Create a file `legacy.js` with the following pattern repeated 15+ times, then ask the agent to rename `processData` → `transformDataset`:

**Setup (run this first):**
```bash
node -e "
const fs = require('fs');
let code = \`
function processData(input) {
  return input * 2;
}

function helper() {
  const raw = [1,2,3];
  const result = processData(raw[0]);
  return result;
}

class Processor {
  constructor() { this.cache = {}; }
  run(items) {
    return items.map(item => processData(item));
  }
  // TODO: optimize processData later (LEAVE THIS COMMENT)
}

const processData = (x) => x + 1;

const obj = {
  name: 'test',
  processData: function(x) { return x * 3; },
  transform: function(items) {
    return items.map(i => processData(i));
  }
};

module.exports = { processData, Processor, obj };
\`;
// Repeat to make 2000+ lines
let big = '';
for (let i = 0; i < 30; i++) {
  big += code.replace(/processData/g, (m) => {
    // Keep one real definition, make others call sites
    return i === 0 ? 'processData' : 'processData';
  }) + '\\n';
}
// Add string literals and comments that should NOT be renamed
big += \`
// This comment mentions processData but should be left alone
const msg = \"The processData function is used above\";
console.log(processData(5));  // THIS call site SHOULD be renamed
\`;
// Count processData occurrences
const count = (big.match(/processData/g) || []).length;
console.log('Created legacy.js with', count, 'occurrences of processData');
console.log('Non-rename targets (comments+strings):', (big.match(/\\/\\/.*processData|\".*processData/g) || []).length);
fs.writeFileSync('legacy.js', big);
"
```

**Instructions for agent:**
```
Read the file legacy.js.
Rename EVERY code occurrence of the function name `processData` to `transformDataset`.
Do NOT rename:
  - String literals like "The processData function is used above"
  - Comments like // TODO: optimize processData later

Only rename actual code references (definitions, call sites, exports).
Use <edit> tags to make the changes surgically.
```

---

### Test F — Truncation Recovery

**Instructions for agent:**
```
Write a 500-line WebSocket collaboration server in a file "collab-server.mjs".
It must include ALL of the following features:

1. WebSocket server (port 8080) using the 'ws' npm package
2. Room management — clients join/leave rooms by name
3. Presence tracking — broadcast who is in each room
4. Cursor awareness — broadcast cursor position to others in the same room
5. Document synchronization — OT/CRDT-like patch-based sync using JSON patches
6. Undo history — each room tracks last 50 operations
7. Heartbeat — ping/pong every 30s, disconnect stale clients after 60s
8. Rate limiting — max 10 messages/second per client
9. Logging — timestamped console output for connect/disconnect/error
10. Graceful shutdown — SIGINT/SIGTERM closes all connections, saves state
11. State persistence — save room state to disk every 60s, restore on startup
12. Health endpoint — HTTP GET /health returns { status: "ok", rooms: N, clients: N }

When you hit the output limit, use <write file="collab-server.mjs" append="true">
to continue. The final file must be COMPLETE and RUNNABLE.
```

---

## Tier 4: Multi-File Coordination

### Test G — Cross-File Feature

Create the 4 starter files first, then ask the agent to add auth.

**Setup files (run this first):**
```bash
mkdir -p auth-project
cat > auth-project/config.js << 'EOF'
module.exports = {
  PORT: 3000,
  DB_PATH: "./data.sqlite"
};
EOF

cat > auth-project/db.js << 'EOF'
const Database = require("better-sqlite3");
const path = require("path");
const config = require("./config");
const db = new Database(path.resolve(config.DB_PATH));
db.pragma("journal_mode = WAL");
module.exports = db;
EOF

cat > auth-project/routes.js << 'EOF'
const express = require("express");
const router = express.Router();
router.get("/items", (req, res) => {
  res.json({ items: [] });
});
module.exports = router;
EOF

cat > auth-project/server.js << 'EOF'
const express = require("express");
const config = require("./config");
const routes = require("./routes");
const app = express();
app.use(express.json());
app.use("/api", routes);
app.listen(config.PORT, () => console.log(`Server on :${config.PORT}`));
EOF
```

**Instructions for agent:**
```
Read ALL 4 files in the auth-project/ directory FIRST.
Then add JWT authentication across all files:

1. config.js: add JWT_SECRET (env var with fallback) and JWT_EXPIRY
2. db.js: add users table, findUserByEmail(), createUser()
3. routes.js: add POST /register, POST /login, authMiddleware
4. server.js: ensure auth routes are loaded + uncaughtException handler

Requirements:
- Use bcrypt for password hashing
- Use jsonwebtoken for JWT
- POST /register: accepts { email, password }, returns { token }
- POST /login: accepts { email, password }, returns { token }
- GET /items: requires Authorization: Bearer <token> header
- Without token: returns 401 { error: "Unauthorized" }

Make surgical edits file by file. Do not rewrite any file completely.
```

Verify: `node auth-project/server.js` should start and respond to curl commands.

---

## Score Sheet

```
┌─────────────────────────────────────────────────────────────────────┐
│                    VIBE CODER PRO BENCHMARK SCORE                   │
├──────────┬────────────────────────────────────┬──────────┬─────────┤
│ Tier     │ Test                               │ Pass/Fail│ Notes   │
├──────────┼────────────────────────────────────┼──────────┼─────────┤
│ ALGORITHM│ A: Topological Sort                │          │         │
│          │ B: Reactive Propagation            │          │         │
├──────────┼────────────────────────────────────┼──────────┼─────────┤
│ SURGERY  │ C: Fix Wire System                 │          │         │
│          │ D: Add Grid + Slider + localStorage │          │         │
├──────────┼────────────────────────────────────┼──────────┼─────────┤
│ CONTEXT  │ E: Large File Refactor             │          │         │
│          │ F: Truncation Recovery             │          │         │
├──────────┼────────────────────────────────────┼──────────┼─────────┤
│ MULTI-   │ G: Cross-File Auth                 │          │         │
│ FILE     │                                    │          │         │
├──────────┴────────────────────────────────────┼──────────┼─────────┤
│ TOTAL PASS RATE                               │   /7     │         │
└───────────────────────────────────────────────┴──────────┴─────────┘
```

## Failure Pattern Tracker

After each test, note which failure pattern occurred:

| Pattern | Test | Description |
|---------|------|-------------|
| META-LOOP | | Analyzes instructions instead of executing |
| SKIP-ALGO | | Generates skeleton but skips hard logic |
| COLLATERAL | | Edits more than requested, breaks things |
| MISS-REF | | Misses rename targets or renames wrong things |
| TRUNCATE | | Fails to recover from output limit |
| SCOPE | | Can't handle multi-file coordination |
| OVERWRITE | | Rewrites whole file instead of surgical edit |
