#!/usr/bin/env node
// Test B: Reactive Value Propagation — verification harness
// Run AFTER the agent generates reactive-graph.js
// Usage: node benchmark/test_B_verify.js

const assert = require('assert');
const { ReactiveGraph } = require('../reactive-graph.js');

let passed = 0;
let failed = 0;

function test(name, fn) {
    try { fn(); passed++; console.log(`  PASS: ${name}`); }
    catch (e) { failed++; console.log(`  FAIL: ${name} — ${e.message}`); }
}

// Basic propagation: const(5) + const(3) = 8
test('basic addition', () => {
    const g = new ReactiveGraph();
    g.addNode("a", "const",  { value: 5 });
    g.addNode("b", "const",  { value: 3 });
    g.addNode("c", "add",    {});
    g.connect("a", "c", 0);
    g.connect("b", "c", 1);
    assert(g.getValue("c") === 8);
});

// Multiplication
test('multiplication', () => {
    const g = new ReactiveGraph();
    g.addNode("a", "const", { value: 4 });
    g.addNode("b", "const", { value: 5 });
    g.addNode("c", "multiply", {});
    g.connect("a", "c", 0);
    g.connect("b", "c", 1);
    assert(g.getValue("c") === 20);
});

// Chain: const(10) → add(10+3=13) → multiply(13*3=39) → display
test('multi-step chain', () => {
    const g = new ReactiveGraph();
    g.addNode("a", "const",  { value: 5 });
    g.addNode("b", "const",  { value: 3 });
    g.addNode("c", "add",    {});
    g.addNode("d", "multiply", {});
    g.addNode("e", "display", {});
    g.connect("a", "c", 0);
    g.connect("b", "c", 1);
    g.connect("c", "d", 0);
    g.connect("c", "d", 1);
    g.connect("d", "e", 0);

    g.setInput("a", 10);
    assert(g.getValue("c") === 13, `expected 13 got ${g.getValue("c")}`);
    assert(g.getValue("d") === 39, `expected 39 got ${g.getValue("d")}`);
});

// Cycle rejection
test('cycle rejection', () => {
    const g = new ReactiveGraph();
    g.addNode("x", "const", { value: 1 });
    g.addNode("y", "add", {});
    g.addNode("z", "add", {});
    g.connect("x", "y", 0);
    g.connect("y", "z", 0);
    assert.throws(() => g.connect("z", "y", 1), /cycle/i);
});

// Partial update: changing b should NOT re-evaluate nodes above b
test('partial update (no unnecessary re-eval)', () => {
    const g = new ReactiveGraph();
    let logCount = 0;
    const origLog = console.log;
    console.log = () => logCount++;
    g.addNode("a", "const", { value: 1 });
    g.addNode("b", "const", { value: 2 });
    g.addNode("c", "add", {});
    g.addNode("d", "display", {});
    g.connect("a", "c", 0);
    g.connect("b", "c", 1);
    g.connect("c", "d", 0);
    logCount = 0;
    g.setInput("b", 5); // only c and d re-evaluate
    assert(logCount <= 2, `expected <=2 logs got ${logCount}`); // c evaluates (no log), d displays (1 log)
    console.log = origLog;
});

// Display node logs on value change
test('display node logs', () => {
    const g = new ReactiveGraph();
    let lastLog = null;
    const origLog = console.log;
    console.log = (msg) => { lastLog = msg; };
    g.addNode("a", "const", { value: 42 });
    g.addNode("b", "display", {});
    g.connect("a", "b", 0);
    g.setInput("a", 99);
    assert(lastLog !== null, 'display should have logged');
    assert(lastLog.toString().includes('99'), `expected 99 in log, got ${lastLog}`);
    console.log = origLog;
});

// NaN for unconnected inputs
test('unconnected input returns NaN', () => {
    const g = new ReactiveGraph();
    g.addNode("a", "add", {});
    assert(isNaN(g.getValue("a")));
});

console.log(`\n${'='.repeat(40)}`);
console.log(`Results: ${passed} passed, ${failed} failed, ${passed + failed} total`);
if (failed > 0) process.exit(1);
