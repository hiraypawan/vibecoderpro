# Vibe Coder Pro — Diagnostic Test Runner
# Usage: Run each step below in order

Write-Output "=== VIBE CODER PRO DIAGNOSTIC TESTS ==="
Write-Output ""

Write-Output "Step 1: Create setup files"
node benchmark/setup_E.cjs
node benchmark/setup_G.cjs

Write-Output ""
Write-Output "=== READY ==="
Write-Output ""
Write-Output "Now paste each test prompt at the '> ' prompt:"
Write-Output ""
Write-Output "  Test A: type /clear, then /reset, then paste benchmark/test_A_prompt.txt"
Write-Output "          After agent finishes: node benchmark/test_A_verify.js"
Write-Output ""
Write-Output "  Test B: type /clear, then /reset, then paste benchmark/test_B_prompt.txt"
Write-Output "          After agent finishes: node benchmark/test_B_verify.js"
Write-Output ""
Write-Output "  Test C: (requires node-graph.html first)"
Write-Output "          Paste the original benchmark prompt to generate HTML,"
Write-Output "          then paste the Test C fix instructions"
Write-Output ""
Write-Output "  Test D: same file as Test C, paste the Test D add-feature instructions"
Write-Output ""
Write-Output "  Test E: paste the legacy.js rename instructions at '> '"
Write-Output "          Verify: grep -n 'processData' legacy.js (should show 0 code refs)"
Write-Output ""
Write-Output "  Test F: paste collab-server.mjs instructions at '> '"
Write-Output ""
Write-Output "  Test G: paste auth-project instructions at '> '"
Write-Output "          Verify: cd auth-project && npm install && node server.js"
