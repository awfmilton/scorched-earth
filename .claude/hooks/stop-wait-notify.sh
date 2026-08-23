#!/bin/bash
# .claude/hooks/stop-wait-notify.sh - installed by MCP Config Manager
# Stop hook - if the agent is still waiting after 10s, notify the owner WITH THE QUESTION.
#
# The contract: a notification fires only when an agent needs a response and none has come
# within the wait window, and it carries a summary plus the actual question. Works for any
# agent on the triage workflow and any kodex session, whether it hit the triage gate or simply
# asked something. The transcript is the source of the question - the same transcript
# triage-stop-guard.sh reads for its backstop.
#
# What counts as "needs a response" (2026-08-03 audit - the old "a ? anywhere in the last
# two lines" rule paged the owner for greetings and for long status reports):
#   * the CLOSING line of the last assistant message must END with ? once trailing
#     markdown noise is stripped - a report that mentions a question mid-line is not one;
#   * a conversation whose entire human half is a throwaway ping ("hi") never pages -
#     its greeting reply is a smoke test or an automated spawn, not a question;
#   * triage.pending no longer pages from here - /triage/block already sent its own SMS
#     for the block, so this path double-paged every triage stop.
INPUT=$(cat)
STOP_STATE=".claude/stop-state"
STOP_ID="stop_$(date +%s)_$"
echo "$STOP_ID" > "$STOP_STATE"
(
  sleep 10
  CURRENT="$(cat "$STOP_STATE" 2>/dev/null | tr -d '\r\n')"
  if [ "$CURRENT" = "$STOP_ID" ]; then
    # Derive the token file at runtime: this hook is committed in managed projects, so an
    # absolute path baked in at scaffold time only resolves on the machine that generated it.
    if [ -n "$MCPM_HOOK_TOKEN_FILE" ]; then
      TOKEN_CFG="$MCPM_HOOK_TOKEN_FILE"
    elif [ -n "$APPDATA" ]; then
      TOKEN_CFG="$APPDATA/mcp-manager/hook-notify.curlrc"
    elif [ "$(uname)" = "Darwin" ]; then
      TOKEN_CFG="$HOME/Library/Application Support/mcp-manager/hook-notify.curlrc"
    else
      TOKEN_CFG="${XDG_CONFIG_HOME:-$HOME/.config}/mcp-manager/hook-notify.curlrc"
    fi
    # No unauthenticated fallback: the route requires the master bearer token, so a tokenless
    # POST can only 401, and swallowing that looked identical to a delivered notification.
    if [ ! -f "$TOKEN_CFG" ]; then
      echo "stop-wait-notify: no token file at $TOKEN_CFG - notification skipped (start MCP Config Manager once to create it)" >&2
      exit 0
    fi
    printf '%s' "$INPUT" | MCP_PORT="7329" PROJECT_ID="se3aea9" TOKEN_CFG="$TOKEN_CFG" node -e '
const fs = require("fs");
let input = {}; try { input = JSON.parse(fs.readFileSync(0, "utf8")); } catch (e) {}
// Read the whole exchange, not just the last reply: the question is the last assistant
// text, and the shape of the human half decides whether anyone is actually waiting.
let q = "", model = "", userTurns = 0, lastUserLen = 0, lastUserAt = 0;
try {
  const tp = input.transcript_path;
  if (tp && fs.existsSync(tp)) {
    for (const line of fs.readFileSync(tp, "utf8").trim().split(/\r?\n/)) {
      try {
        const j = JSON.parse(line);
        if (j.type === "assistant" && j.message) {
          const c = j.message.content;
          const t = Array.isArray(c)
            ? c.filter((b) => b && b.type === "text").map((b) => b.text).join(" ")
            : String(c || "");
          if (t && t.trim()) q = t;
          if (j.message.model) model = String(j.message.model);
        } else if (j.type === "user" && j.message) {
          // tool_result blocks also arrive as user entries; only TEXT content counts as
          // a human turn, so an agentic session full of tool results stays at zero.
          const c = j.message.content;
          const t = Array.isArray(c)
            ? c.filter((b) => b && b.type === "text").map((b) => b.text).join(" ")
            : String(c || "");
          if (t && t.trim()) { userTurns += 1; lastUserLen = t.trim().length; lastUserAt = Date.parse(j.timestamp) || lastUserAt; }
        }
      } catch (e) {}
    }
  }
} catch (e) {}
if (!q.trim()) process.exit(0);            // nothing was asked - nothing to page
if (userTurns <= 1 && lastUserLen < 10) process.exit(0);   // throwaway-ping conversation
// PRESENCE GATE. A question is only worth a text when nobody is at the keyboard
// to read it on screen. Detection here is syntactic - the closing line ends in
// "?" - so a finished status report that signs off with a question paged the
// owner while they were sitting in front of it. If a human spoke recently they
// can see the question already; if they have been gone for a while, page them.
if (lastUserAt && (Date.now() - lastUserAt) < 5 * 60 * 1000) process.exit(0);
let fenced = false; const lines = [];
for (const raw of q.split(/\r?\n/)) {
  const l = raw.trim();
  if (l.indexOf("```") === 0) { fenced = !fenced; continue; }
  if (!fenced && l) lines.push(l);
}
if (!lines.length) process.exit(0);
const closing = lines[lines.length - 1].replace(/[*_`~")\]\s]+$/g, "").replace(/^[*_`~"(\[\s]+/g, "");
if (!/\?$/.test(closing)) process.exit(0); // a status report is not a question
if (lines.length === 1 && closing.length < 60 && /^[*_`#> ]*(hi|hello|hey|howdy|greetings)\b/i.test(closing)) process.exit(0);
const body = JSON.stringify({
  question: q.slice(0, 2000),
  summary: closing.slice(0, 200),
  agent: model || null,
  sessionId: (typeof input.session_id === "string" && input.session_id) || null,
  projectId: process.env.PROJECT_ID || null,
});
const a = ["-s", "-X", "POST", "http://127.0.0.1:" + process.env.MCP_PORT + "/notify/agent-waiting"];
// Fail closed: the route requires the master bearer token, so a tokenless POST can only 401.
if (!process.env.TOKEN_CFG || !fs.existsSync(process.env.TOKEN_CFG)) process.exit(0);
a.push("--config", process.env.TOKEN_CFG);
a.push("-H", "Content-Type: application/json", "-d", body, "--max-time", "5");
try { require("child_process").execFileSync("curl", a, { timeout: 6000, stdio: "ignore" }); } catch (e) {}
' 2>/dev/null || true
  fi
) &
disown $! 2>/dev/null || true
