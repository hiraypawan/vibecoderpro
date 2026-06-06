#!/usr/bin/env node
// Test A: Topological Sort Engine — verification harness
// Run AFTER the agent generates topological-sort.js
// Usage: node benchmark/test_A_verify.js

const assert = require('assert');
const { topologicalSort } = require('../topological-sort.js');

let passed = 0;
let failed = 0;

function test(name, fn) {
    try { fn(); passed++; console.log(`  PASS: ${name}`); }
    catch (e) { failed++; console.log(`  FAIL: ${name} — ${e.message}`); }
}

// Case 1: valid DAG
test('valid DAG', () => {
    const g = { nodes: ["A","B","C","D"], edges: [["A","B"],["B","C"],["A","D"],["D","C"]] };
    const r = topologicalSort(g);
    assert(Array.isArray(r), 'should return array');
    assert(r.indexOf("A") < r.indexOf("B"), 'A before B');
    assert(r.indexOf("B") < r.indexOf("C"), 'B before C');
    assert(r.indexOf("A") < r.indexOf("D"), 'A before D');
    assert(r.indexOf("D") < r.indexOf("C"), 'D before C');
});

// Case 2: single node
test('single node', () => {
    assert.deepEqual(topologicalSort({ nodes: ["X"], edges: [] }), ["X"]);
});

// Case 3: 1000-node chain under 100ms
test('1000-node chain under 100ms', () => {
    const nodes = Array.from({length:1000}, (_,i) => `${i}`);
    const edges = nodes.slice(0,-1).map((n,i) => [n, nodes[i+1]]);
    const start = Date.now();
    const r = topologicalSort({ nodes, edges });
    assert(Date.now() - start < 100, `took ${Date.now() - start}ms`);
    assert(r.length === 1000);
});

// Case 4: cycle detection
test('cycle detection', () => {
    const r = topologicalSort({ nodes: ["A","B","C"], edges: [["A","B"],["B","C"],["C","A"]] });
    assert(r.error === "cycle", 'should have error property');
    assert(Array.isArray(r.path), 'path should be array');
    assert(r.path.length >= 2, 'path should have at least 2 nodes');
});

// Case 5: empty
test('empty graph', () => {
    assert.deepEqual(topologicalSort({ nodes: [], edges: [] }), []);
});

// Case 6: invalid input throws TypeError
test('invalid input throws TypeError', () => {
    assert.throws(() => topologicalSort(null), TypeError);
    assert.throws(() => topologicalSort({}), TypeError);
    assert.throws(() => topologicalSort({ nodes: null, edges: [] }), TypeError);
});

console.log(`\n${'='.repeat(40)}`);
console.log(`Results: ${passed} passed, ${failed} failed, ${passed + failed} total`);
if (failed > 0) process.exit(1);
