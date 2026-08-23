<!-- BEGIN scaffold:chrome-devtools-mcp-md -->
<!-- BEGIN scaffold:chrome-devtools-mcp-md -->
<!-- BEGIN scaffold:chrome-devtools-mcp-md -->
<!-- BEGIN scaffold:chrome-devtools-mcp-md -->
<!-- BEGIN scaffold:chrome-devtools-mcp-md -->
<!-- BEGIN scaffold:chrome-devtools-mcp-md -->
<!-- BEGIN scaffold:chrome-devtools-mcp-md -->
<!-- BEGIN scaffold:chrome-devtools-mcp-md -->
<!-- BEGIN scaffold:chrome-devtools-mcp-md -->
## Chrome DevTools MCP

Chrome DevTools is pre-configured via the `chrome-devtools-mcp` MCP server (global `~/.claude/mcp.json`).
It connects automatically to Chrome's remote debugging port at `localhost:9222`.

### Launching Chrome with remote debugging

Chrome must already be running with `--remote-debugging-port=9222` before using the MCP tools.
Use `--user-data-dir` pointing to a **fresh, empty directory** whenever Chrome is already open in a
normal session — this starts an isolated second instance without conflicts.

**Windows:**
```
"C:\Program Files\Google\Chrome\Application\chrome.exe" --remote-debugging-port=9222 --user-data-dir="C:\temp\chrome-debug"
```

**macOS:**
```
/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome --remote-debugging-port=9222 --user-data-dir="/tmp/chrome-debug"
```

**Linux:**
```
google-chrome --remote-debugging-port=9222 --user-data-dir="/tmp/chrome-debug"
# or: chromium-browser --remote-debugging-port=9222 --user-data-dir="/tmp/chrome-debug"
```

Detect the OS before choosing the command:
- `process.platform === 'win32'` → Windows path
- `process.platform === 'darwin'` → macOS path
- `process.platform === 'linux'` → Linux path

### Parallel agent sessions

Each agent that needs its own isolated Chrome session must use a **different `--user-data-dir`**
and a **different port** (e.g., `9222`, `9223`, `9224`).
Update `CHROME_REMOTE_DEBUGGING_PORT` in `~/.claude/mcp.json` to match the port you launched on
if it differs from `9222`.

Example — two simultaneous agents:
```
# Agent 1
chrome --remote-debugging-port=9222 --user-data-dir="C:\temp\chrome-debug-1"

# Agent 2
chrome --remote-debugging-port=9223 --user-data-dir="C:\temp\chrome-debug-2"
```

### Using the MCP tools

**Do NOT attempt to launch Chrome via tools.** Once Chrome is running, use the MCP tools directly:

- `mcp__chrome-devtools__list_pages` — list open tabs
- `mcp__chrome-devtools__navigate_page` — navigate a tab
- `mcp__chrome-devtools__take_screenshot` — capture a screenshot
- `mcp__chrome-devtools__evaluate_script` — run JS in a page
- `mcp__chrome-devtools__click`, `mcp__chrome-devtools__fill`, `mcp__chrome-devtools__hover` — interact with elements
- `mcp__chrome-devtools__get_console_message` / `mcp__chrome-devtools__list_console_messages` — read console output
- `mcp__chrome-devtools__list_network_requests` — inspect network traffic

If the tools return a connection error, ask the user to start Chrome using the OS-appropriate
command above rather than trying to launch it yourself.

<!-- END scaffold:chrome-devtools-mcp-md -->
<!-- END scaffold:chrome-devtools-mcp-md -->