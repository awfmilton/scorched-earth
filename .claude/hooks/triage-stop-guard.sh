#!/bin/bash
# .claude/hooks/triage-stop-guard.sh
# Stop-hook backstop for the triage NOTIFY-ON-TRIGGER contract.
#
# If a triage block fired this turn (breadcrumb .claude/triage.pending) and the assistant's last
# message never presented it, refuse the stop ONCE and force the model to present the reason + the
# [A] bypass / [B] triage-workflow choice, then wait. This is the deterministic net under the
# permissionDecision:"deny" mechanism in triage-enforce.sh — a mute model still cannot silently stop.
#
# Loop-safe: fires at most once per block (stop_hook_active guard + the breadcrumb is removed before
# we ever emit a block). Must be registered SYNCHRONOUSLY (an async hook cannot return a decision).
PENDING=".claude/triage.pending"
[ -f "$PENDING" ] || exit 0
INPUT=$(cat)
OUT=$(printf '%s' "$INPUT" | PENDING="$PENDING" node -e '
const fs=require("fs");
let input={}; try{ input=JSON.parse(fs.readFileSync(0,"utf8")); }catch(e){}
const pendingFile=process.env.PENDING;
let block=""; try{ block=fs.readFileSync(pendingFile,"utf8"); }catch(e){}
// Loop guard: a continuation we already forced → stand down.
if(input.stop_hook_active){ try{fs.unlinkSync(pendingFile);}catch(e){} process.exit(0); }
// Did the assistant already present the block? Inspect the last assistant text in the transcript.
let presented=false;
try{
  const tp=input.transcript_path;
  if(tp && fs.existsSync(tp)){
    const lines=fs.readFileSync(tp,"utf8").trim().split(/\r?\n/);
    let last="";
    for(const l of lines){ try{ const j=JSON.parse(l);
      if(j.type==="assistant" && j.message){ const c=j.message.content;
        last=Array.isArray(c)?c.filter(b=>b&&b.type==="text").map(b=>b.text).join(" "):String(c||""); } }catch(e){} }
    if(/Triage Hook/i.test(last)) presented=true;
  }
}catch(e){}
try{ fs.unlinkSync(pendingFile); }catch(e){}   // at-most-once, regardless of outcome
if(presented) process.exit(0);                 // model behaved → allow the stop (it is waiting on the user)
const reason="A triage block occurred this turn and was NEVER presented to the user. Reply NOW with the block below VERBATIM, present the [A] bypass / [B] triage-workflow choice, then WAIT for the user answer:\n\n"+block;
process.stdout.write(JSON.stringify({decision:"block",reason:reason,hookSpecificOutput:{hookEventName:"Stop",additionalContext:reason}}));
' 2>/dev/null)
RC=$?
if [ $RC -ne 0 ]; then rm -f "$PENDING"; exit 0; fi   # node failed → never wedge the stop
[ -n "$OUT" ] && printf '%s' "$OUT"
exit 0
