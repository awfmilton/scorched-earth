#!/bin/bash
# .claude/hooks/triage-enforce.sh — installed by MCP Config Manager
# PreToolUse hook — three-tier triage before JS/JSX/TS edits.
#
# Tier 1 (< 500 chars):     Fast Path — ask user: bypass or delegate
# Tier 2 (500-3,000 chars): Researcher Complexity & Economics Assessment, or delegate
# Tier 3 (> 3,000 chars):   Standard Triage — full workflow mandatory
#
# AUTHORIZATION (write one line to .claude/triage.lock):
#   echo "bypass: <reason>" > .claude/triage.lock   (Tier 1/2 Option A)
#   echo "jules-issue-<n>"  > .claude/triage.lock   (Tier 1/2 Option B / Tier 3)
# The lock is cleared automatically by the Stop hook at each turn boundary.
#
# HARDENING (memory/scaffolding plan Wave 0.1 / Wave 7):
#   * Parses + emits with `node`, NOT `python3`. On Windows `python3` can resolve to the
#     Microsoft Store alias and exit nonzero, silently emptying the parse so the hook FAILED
#     OPEN and triage disappeared. Any parse/runtime failure now FAILS CLOSED (blocks).
#   * SECURITY-CRITICAL files (vault/keychain/mcp-server/license-client/patch-loader/preload/main-index)
#     are NO LONGER exempt — they REQUIRE a bypass:<reason> lock (Orchestrator-only, never
#     delegated), path-anchored so a "*-vault.js" no longer slips through a basename match.
#   * NOTIFY-ON-TRIGGER: a block DENIES the tool call (permissionDecision:"deny") and keeps the
#     turn alive + writes .claude/triage.pending, instead of the old `continue:false` that killed
#     the turn and produced a SILENT STOP. triage-stop-guard.sh (Stop hook) is the backstop.
#   * The lock content must be a valid `bypass:<reason>` or `jules-issue-<n>` line — a malformed
#     or whitespace-only lock no longer authorizes anything (parity with lib/triage-gate.js).

INPUT=$(cat)
LOCK_CONTENT=""
[ -f ".claude/triage.lock" ] && LOCK_CONTENT=$(cat ".claude/triage.lock" | tr -d '\r\n')


# Derive the notification token file at runtime. This hook is committed in managed projects,
# so a path baked in at scaffold time only resolves on the machine that generated it.
# Mirrors Electron app.getPath("userData") per platform; override with MCPM_HOOK_TOKEN_FILE.
if [ -n "$MCPM_HOOK_TOKEN_FILE" ]; then
  HOOK_TOKEN_FILE="$MCPM_HOOK_TOKEN_FILE"
elif [ -n "$APPDATA" ]; then
  HOOK_TOKEN_FILE="$APPDATA/mcp-manager/hook-notify.curlrc"
elif [ "$(uname)" = "Darwin" ]; then
  HOOK_TOKEN_FILE="$HOME/Library/Application Support/mcp-manager/hook-notify.curlrc"
else
  HOOK_TOKEN_FILE="${XDG_CONFIG_HOME:-$HOME/.config}/mcp-manager/hook-notify.curlrc"
fi
OUT=$(printf '%s' "$INPUT" | TRIAGE_LOCK="$LOCK_CONTENT" MCP_PORT="7329" PROJECT_ID="se3aea9" MCP_TOKEN_FILE="$HOOK_TOKEN_FILE" node -e '
const input = require("fs").readFileSync(0, "utf8");
const lock = process.env.TRIAGE_LOCK || "";
const H = "PreToolUse";
let curSize = 0, curTier = 0, curBlock = "", curFile = "", curSession = "";
function notify(){
  try {
    const port = process.env.MCP_PORT, pid = process.env.PROJECT_ID;
    const cfg = process.env.MCP_TOKEN_FILE || "";
    if (port && /^[0-9]+$/.test(port)) {
      const a = ["-s","-X","POST","http://127.0.0.1:"+port+"/triage/block"];
      if (cfg && require("fs").existsSync(cfg)) a.push("--config", cfg);
      a.push("-H","Content-Type: application/json","-d",JSON.stringify({projectId:pid,tier:curTier,size:curSize,userBlock:curBlock,file:curFile,sessionId:curSession||null}),"--max-time","2");
      require("child_process").execFileSync("curl", a, {timeout:2500, stdio:"ignore"});
    }
  } catch(e){}
}
// Tell the app the block is OVER.
//
// The app used to infer this from the presence of .claude/triage.lock — but the Stop hook
// deletes that file at every turn boundary, so a block resolved in one turn looked unresolved
// by the time the delayed notification fired, and the owner was texted about a decision they
// had already made. Only the hook knows for certain, because the hook is what authorized the
// edit. Best-effort: a failure here costs a redundant text, never a missed block.
function notifyResolved(){
  try {
    const port = process.env.MCP_PORT, pid = process.env.PROJECT_ID;
    const cfg = process.env.MCP_TOKEN_FILE || "";
    if (!port || !/^[0-9]+$/.test(port) || !pid) return;
    const a = ["-s","-X","POST","http://127.0.0.1:"+port+"/triage/resolved"];
    if (cfg && require("fs").existsSync(cfg)) a.push("--config", cfg);
    a.push("-H","Content-Type: application/json","-d",JSON.stringify({projectId:pid}),"--connect-timeout","0.4","--max-time","1");
    require("child_process").execFileSync("curl", a, {timeout:2500, stdio:"ignore"});
  } catch(e){}
}
// Is a full-autonomy run in flight for this project? The app owns the run
// lifecycle, so it is the only thing that knows for the exact window the bypass
// should last. A lock FILE cannot express that: cleared each Stop it dies
// mid-run (blocking every other turn), cleared only at SessionEnd it outlives
// the run and silently un-gates later human edits.
//
// FAIL-CLOSED: unreachable, unauthorized, or any non-true answer means NO
// bypass and normal triage proceeds. The gate must fire whenever full autonomy
// is not actually active, so every uncertain case has to resolve to "block".
function autonomyActive(){
  try {
    const port = process.env.MCP_PORT, pid = process.env.PROJECT_ID;
    const cfg = process.env.MCP_TOKEN_FILE || "";
    if (!port || !/^[0-9]+$/.test(port) || !pid) return false;
    if (!cfg || !require("fs").existsSync(cfg)) return false;
    const a = ["-s","-m","2","--config",cfg,"http://127.0.0.1:"+port+"/triage/autonomy?projectId="+encodeURIComponent(pid)];
    const out = require("child_process").execFileSync("curl", a, {timeout:2500, encoding:"utf8"});
    return JSON.parse(out).active === true;
  } catch(e){ return false; }
}
function pass(ctx){ const o={continue:true,hookSpecificOutput:{hookEventName:H}}; if(ctx) o.hookSpecificOutput.additionalContext=ctx; process.stdout.write(JSON.stringify(o)); process.exit(0); }
function block(userBlock, modelDirective){
  // NOTIFY-ON-TRIGGER: deny the TOOL CALL, never the turn. The old `continue:false` stopped the
  // model outright, so the "present this to the user" directive reached a dead turn → a SILENT
  // STOP. `permissionDecision:"deny"` blocks only the Edit/Write and keeps the turn alive so the
  // model can present the choice; `systemMessage` is rendered to the user by the harness regardless
  // of what the model does; a `.claude/triage.pending` breadcrumb lets the Stop guard catch a model
  // that still forgets.
  var directive=(modelDirective||"TRIAGE BLOCK.")+"\n\nYour turn is STILL ACTIVE — only the tool call was denied. Immediate next action: output the user-facing block below to the user VERBATIM, present the choice, then end your message and WAIT for their reply. Do NOT retry the edit, do NOT write the lock yourself, do NOT switch to other work, and NEVER end the turn without presenting this.\n\n"+userBlock;
  try{ require("fs").writeFileSync(".claude/triage.pending", userBlock); }catch(e){}
  curBlock = userBlock;
  notify();
  process.stdout.write(JSON.stringify({systemMessage:userBlock,hookSpecificOutput:{hookEventName:H,permissionDecision:"deny",permissionDecisionReason:directive,additionalContext:userBlock}}));
  process.exit(0);
}

let inp;
try { const _p = JSON.parse(input); inp = _p.tool_input || {}; curSession = (typeof _p.session_id === "string" && _p.session_id) || ""; }
catch(e){ block("[TRIAGE HOOK] Could not parse tool input — failing closed. Write .claude/triage.lock (bypass:<reason> or jules-issue-<n>) to proceed.", "TRIAGE HOOK: input parse failed — failing closed."); }

// Tolerate both Edit/Write (file_path,old_string,new_string,content) and mcpm_tools
// edit_file/write_file (path,content) tool_input shapes.
const fp = String(inp.file_path || inp.path || inp.file || "");
curFile = fp;
const size = String(inp.old_string || "").length + String(inp.new_string || inp.content || inp.text || "").length;
curSize = size;

if(!fp) pass();                                                   // not a file edit
if(!/\.(jsx?|tsx?)$/i.test(fp)) pass();                           // only JS/TS
if(/(^|[/\\])\.claude[/\\]/.test(fp)) pass();                     // .claude/ (hooks, settings, lock)
if(/[/\\]AppData[/\\]Local[/\\]Temp[/\\]|[/\\]cdp-[A-Za-z0-9_.-]+\.(jsx?|tsx?)$/i.test(fp)) pass(); // scratch/cdp helpers
if(/(build\.js|jest\.config|\.eslintrc|tsconfig|vite\.config|webpack\.config)(\..*)?$/.test(fp)) pass(); // build/config

// SECURITY-CRITICAL: inverted — require an explicit bypass:<reason> lock (never delegated),
// path-anchored so a "*-vault.js" basename cannot slip through.
const securityCritical = /(^|[/\\])(lib[/\\](vault|keychain|mcp-server|license-client|patch-loader)|main[/\\](preload|index))\.js$/i.test(fp);

if(lock){
  if(securityCritical && !/^bypass:/i.test(lock)){
    block("[TRIAGE HOOK] `"+fp+"` is security-critical (Orchestrator-only). It requires a **bypass:<reason>** lock, not a jules-issue delegation. Write: echo \"bypass: <reason>\" > .claude/triage.lock", "TRIAGE HOOK: security-critical file requires a bypass:<reason> lock.");
  }
  if(!/^(bypass:|jules-issue-[0-9]+$)/.test(lock)){
    block("[TRIAGE HOOK] Malformed `.claude/triage.lock` — content must be `bypass: <reason>` or `jules-issue-<n>`. Rewrite it, then retry.", "TRIAGE HOOK: malformed lock content — failing closed.");
  }
  try{ require("fs").unlinkSync(".claude/triage.pending"); }catch(e){}   // resolved: clear the Stop-guard breadcrumb
  notifyResolved();
  pass("[TRIAGE HOOK] Edit authorized: " + lock);
}

// No lock:
if(securityCritical){
  block("🔒 **Triage Hook — security-critical file.** `"+fp+"` is Orchestrator-only and is never delegated. Authorize with a reason then retry:\n\n`echo \"bypass: <reason>\" > .claude/triage.lock`", "!!! ACTION REQUIRED — DO NOT END THIS TURN !!! Security-critical file needs a bypass:<reason> lock. Show the user the block and wait.");
}

// Full autonomy authorizes its own work: the orchestrator IS the reviewer, and
// there is no human in the loop to answer an A/B choice. Checked here, after the
// security-critical guard, so an autonomous run gets exactly the reach a human
// bypass lock would have and no more.
if(autonomyActive()){ notifyResolved(); pass("[TRIAGE HOOK] Edit authorized: full-autonomy run (app-confirmed)"); }
const tier = size < 500 ? 1 : (size < 3000 ? 2 : 3);
curTier = tier;
let userBlock;
if(tier === 1){
  userBlock = "🔒 **Triage Hook — Tier 1 Fast Path:** approval needed for this edit (~"+size+" chars).\n\n**Option A — Implement directly (bypass):** I make the change now as the Orchestrator.\n**Option B — Delegate to Implementer:** GitHub Issue, dispatched correctly (`gh issue create` → `gh issue edit <n> --add-label jules`) → arm the Watch Monitor.\n\nWhich would you prefer? **(A to bypass / B to delegate)**";
} else if(tier === 2){
  userBlock = "🔒 **Triage Hook — Tier 2 Researcher Assessment** (~"+size+" chars).\n\n**Option A — Researcher Complexity & Economics Assessment first**, then route on its recommendation.\n**Option B — Delegate directly to Implementer** (Issue → `gh issue create` → `gh issue edit <n> --add-label jules` → monitor).\n\nWhich would you prefer? **(A for assessment / B to delegate)**";
} else {
  userBlock = "🔒 **Triage Hook — Tier 3 Standard Triage** (~"+size+" chars) — exceeds the Orchestrator direct-edit threshold.\n\n**Required path:** `gh issue create` → `gh issue edit <n> --add-label jules` → arm the Implementer Watch Monitor (TRIAGE_WORKFLOW.md §3.3).\n\nCreate the GitHub Issue now to proceed.";
}
const stop = "!!! ACTION REQUIRED — DO NOT END THIS TURN !!!\nTRIAGE HOOK (Tier "+tier+"): no triage.lock. You are PROHIBITED from ending the turn until you display the block below to the user and receive a reply. Copy it verbatim as your response, then wait.\n\n"+userBlock;
block(userBlock, stop);
' 2>/dev/null)
RC=$?

# node missing / crashed / produced nothing → FAIL CLOSED (never silently allow).
if [ $RC -ne 0 ] || [ -z "$OUT" ]; then
  printf '%s' '{"systemMessage":"[TRIAGE HOOK] Enforcement runtime unavailable — failing closed. Authorize with a triage.lock (bypass:<reason> or jules-issue-<n>) then retry.","hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"TRIAGE HOOK runtime unavailable — failing closed. Present the block to the user and wait; do not retry or end the turn silently.","additionalContext":"[TRIAGE HOOK] Enforcement runtime unavailable — failing closed; write a triage.lock to proceed."}}'
  exit 0
fi

printf '%s' "$OUT"
exit 0
