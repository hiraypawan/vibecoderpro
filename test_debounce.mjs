const { debounce } = require('./src/utils.js');

let passed = 0, failed = 0;
function test(name, fn) { try { fn(); passed++; console.log('  PASS:', name); } catch (e) { failed++; console.log('  FAIL:', name, '—', e.message); } }

function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

test('leading fires immediately', async () => {
  let callCount = 0;
  const d = debounce(() => { callCount++; }, 100, { leading: true, trailing: false });
  d.invoke();
  if (callCount !== 1) throw new Error('expected 1 call got ' + callCount);
  await delay(50);
  d.invoke();
  if (callCount !== 1) throw new Error('second invoke should NOT fire');
});

test('trailing fires after delay', async () => {
  let val = 0;
  const d = debounce((x) => { val = x; }, 50, { leading: false, trailing: true });
  d.invoke(1);
  d.invoke(2);
  d.invoke(3);
  if (val !== 0) throw new Error('should not fire yet');
  await delay(80);
  if (val !== 3) throw new Error('expected 3 got ' + val);
});

test('cancel prevents execution', async () => {
  let fired = false;
  const d = debounce(() => { fired = true; }, 50);
  d.invoke();
  d.cancel();
  await delay(80);
  if (fired) throw new Error('should not have fired');
});

test('flush executes immediately', async () => {
  let val = 0;
  const d = debounce((x) => { val = x; }, 500);
  d.invoke(42);
  await d.flush();
  if (val !== 42) throw new Error('expected 42 got ' + val);
});

test('maxWait forces execution', async () => {
  let callCount = 0;
  const d = debounce(() => { callCount++; }, 200, { maxWait: 100 });
  d.invoke();
  await delay(50);
  d.invoke();
  await delay(70);
  if (callCount !== 1) throw new Error('expected 1 got ' + callCount);
});

test('delay=0 fires on next microtask', (done) => {
  let fired = false;
  const d = debounce(() => { fired = true; }, 0);
  d.invoke();
  setTimeout(() => { if (!fired) done(new Error('should have fired')); else done(); }, 10);
});

test('invalid delay < 0', () => {
  try { debounce(() => {}, -1); throw new Error('should throw'); }
  catch (e) { if (!e.message.includes('>= 0')) throw new Error('wrong message: ' + e.message); }
});

test('no leading+trailing throws', () => {
  try { debounce(() => {}, 100, { leading: false, trailing: false }); throw new Error('should throw'); }
  catch (e) { if (!e.message.includes('at least one')) throw new Error('wrong message: ' + e.message); }
});

test('maxWait < delay throws', () => {
  try { debounce(() => {}, 100, { maxWait: 50 }); throw new Error('should throw'); }
  catch (e) { if (!e.message.includes('>= delay')) throw new Error('wrong message: ' + e.message); }
});

test('this context preserved', () => {
  const d = debounce(function() { if (this !== expected) throw new Error('wrong this'); }, 50);
  const expected = {};
  d.invoke.call(expected);
});

setTimeout(() => console.log('\nResults:', passed, 'passed,', failed, 'failed,', passed + failed, 'total'), 200);
