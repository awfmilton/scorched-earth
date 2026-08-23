#!/bin/bash
# .claude/hooks/cancel-wait-notify.sh â€” installed by MCP Config Manager
# PreToolUse hook (all tools) â€” cancels pending wait-SMS timer.
echo "active" > .claude/stop-state
