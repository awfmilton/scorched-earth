<!-- BEGIN scaffold:ai-cli-reference-guide-md -->
<!-- DOC_VERSION: 1.2.0 | LAST_UPDATED: 2026-04-24 -->
<!--
CHANGE_LOG (last 10 updates — read only when researching past changes to this document):
  v1.2.0 | 2026-04-24 | (pending commit) | Jules Session Monitoring section added (TUI, CLI, Gemini extension, Orchestrator note); Claude model versions updated to claude-sonnet-4-6; version tracking added throughout
  v1.1.0 | 2026-04-22 | de657c4 | Chrome DevTools remote debugging section added; scaffold generator automation documented
  v1.0.2 | 2026-04-13 | 2f14402 | Minor UI spacing note removed
  v1.0.1 | 2026-04-12 | 9920eac | BSL-1.1 license headers and author tags added
  v1.0.0 | 2026-04-11 | ecf7f2c | Initial CLI reference guide — Gemini CLI, Jules, Claude Code, GitHub CLI
-->
# **Ultimate AI CLI Command Reference (April 2026\)**
<!-- Author: Alexander Milton / tbay.tk LLC, Helena, Montana | Contact: alex@tbay.tk | https://tbay.tk -->

This document provides a complete reference for the three major AI coding CLIs: **Gemini CLI**, **Jules Tools**, and **Claude Code**.

<!-- SECTION_LAST_UPDATED: 2026-04-11 | COMMIT: ecf7f2c | CHANGE: Initial section -->
## **1\. Gemini CLI (gemini)**

**Version:** 0.37.0 (April 2026\)

**Default Engine:** gemini-2.5-flash-preview-09-2025 (or gemini-2.0-pro-exp for Pro users)

### **Installation & Setup**

* **Install:** npm install \-g @google/gemini-cli  
* **Update:** gemini update  
* **Login:** gemini login  
* **Version Check:** gemini \--version

### **Primary Commands**

| Command | Description |
| :---- | :---- |
| gemini | Start interactive REPL session |
| gemini "prompt" | Run prompt and enter interactive mode |
| gemini \-p "prompt" | Run prompt and exit (PowerShell/Bash script friendly) |
| gemini \-i "prompt" | Execute command and stay interactive |
| gemini \-r "latest" | Resume the most recent session |
| gemini \-r \<id\> | Resume a specific session by ID |

### **In-Session Slash Commands (Interactive Mode)**

* /chat save \<tag\>: Save current state to a named checkpoint.  
* /chat resume \<tag\>: Load a saved checkpoint.  
* /chat list: List all available checkpoints in this project.  
* /chat share \[file.md\]: Export the transcript to Markdown.  
* /memory add "text": Manually inject information into the agent's long-term memory.  
* /mcp list: List active Model Context Protocol (MCP) servers and tools.  
* /skills list: Show installed agent skills/capabilities.  
* /stats: View token usage, quota, and model performance.  
* /quit or /exit: Terminate the session.

### **Context Controls**

* @\<path\>: Inject file/folder content (e.g., @src/main.ts Explain this).  
* \! \<cmd\>: Execute a shell command directly (e.g., \! git status).  
* \!: Toggle "Shell Mode" where every line is treated as a terminal command.

<!-- SECTION_LAST_UPDATED: 2026-04-24 | COMMIT: (pending) | CHANGE: Session Monitoring subsection added (TUI, CLI, Gemini extension, Orchestrator note) -->
## **2\. Jules Tools (jules)**

**Version:** 1.41.0 (April 2026\)

**Default Engine:** gemini-3.1-pro (Agentic Architecture)

Jules is Google's **asynchronous** agent. Unlike the Gemini CLI, Jules often runs tasks in the cloud and reports back.

### **Installation & Setup**

* **Install:** npm install \-g @google/jules  
* **Login:** jules login  
* **TUI Mode:** jules (Launches the full Terminal User Interface dashboard)

### **Remote Operations (jules remote ...)**

| Command | Description |
| :---- | :---- |
| jules remote new \--session "prompt" | Start a new coding task (auto-infers repo) |
| jules remote new \--repo \<owner/repo\> | Start a task on a specific repository |
| jules remote new \--parallel 3 | Start 3 identical sessions to compare solutions |
| jules remote list \--session | List active and historical cloud sessions |
| jules remote list \--repo | List all GitHub repos connected to your account |
| jules remote pull \--session \<id\> | Download and inspect code changes from a session |
| jules remote pull \--apply | Automatically apply changes to your local branch |

### **Management Commands**

* jules teleport \<id\>: Instantly clone a repo and apply changes from session \<id\>.  
* jules completion \<shell\>: Generate autocompletion for bash or zsh.  
* jules \--theme light: Change TUI visual style.

### **Session Monitoring**

Jules runs asynchronously in the cloud. Three methods are available to check session status and completion. These apply to both label-triggered sessions (via `gh issue edit --add-label jules`) and CLI-started sessions (`jules remote new`).

#### 1\. TUI Dashboard (Interactive)

```bash
jules
```

Opens a full Terminal User Interface with real-time status for all active, queued, and completed sessions. Includes a side-by-side diff viewer and task interaction (approve execution plans, resume paused tasks).

#### 2\. CLI Status Check (Non-Interactive / Scriptable)

| Command | Description |
| :---- | :---- |
| jules remote list \--session | List all sessions (active, queued, completed) with status |
| jules remote list \--task | Alternative flag (supported in some CLI versions) |
| jules remote pull \--session \<id\> | Download and inspect code changes from a completed session |
| jules remote pull \--session \<id\> \--apply | Apply changes directly to the local branch |

#### 3\. Gemini CLI Extension Query

If running Jules via the Gemini CLI extension rather than the standalone `@google/jules` tool:

```bash
/jules what is the status of my last task?
```

#### Orchestrator Note (Claude Code)

Prefer `ScheduleWakeup` + `jules remote list --session` over a persistent `Monitor` loop for Jules tasks. Schedule an initial wakeup at an interval matching the expected task duration (270s to stay within the 5-minute prompt cache window), run a one-shot status check each wakeup, and reschedule if not yet complete. Once a PR is detected, switch to a short `ScheduleWakeup(120s)` polling `gh pr checks <n>` until CI resolves. This avoids a persistent background process and minimises context reconstitution cost compared to `Monitor + jules-monitor.sh`.

<!-- SECTION_LAST_UPDATED: 2026-04-24 | COMMIT: (pending) | CHANGE: Default engine updated to claude-sonnet-4-6 -->
## **3\. Claude Code (claude)**

**Version:** 0.3.0 (April 2026\)

**Default Engine:** claude-sonnet-4-6

### **Installation & Setup**

* **Install:** npm install \-g @anthropic-ai/claude-code  
* **Login:** claude auth login  
* **Check Auth:** claude auth status

### **Core Commands**

| Command | Description |
| :---- | :---- |
| claude | Start a new session in the current directory |
| claude "prompt" | Start session with a specific instruction |
| claude \-p "prompt" | Run instruction and exit immediately |
| claude \-c | Continue the most recent session in this directory |
| claude \-r \<id\> | Resume session by ID or Name |
| claude update | Update the tool to the latest version |

### **Interactive Slash Commands**

* /add-dir \<path\>: Add an external directory to the file access scope.  
* /bug: Open a bug reporting interface for Claude Code.  
* /compact: Summarize the chat history to save context window tokens.  
* /mcp serve \<name\>: Start a specific MCP server for the session.  
* /plugin install \<name\>: Install a plugin from the Claude marketplace.  
* /remote-control: Enable a server mode to control this session from Claude.ai.  
* /settings: Open the interactive configuration menu.

### **Advanced Flags**

* \--bare: Start without hooks/plugins for maximum speed (ideal for CI).  
* \--allow-dangerously-skip-permissions: Run tools without asking for confirmation.  
* \--betas \<header\>: Enable experimental Anthropic API features.

<!-- SECTION_LAST_UPDATED: 2026-04-24 | COMMIT: (pending) | CHANGE: Claude model IDs updated to current Claude 4.x family -->
## **4\. Model Version Reference Table**

| Tool | Latest Stable Model Code | Context Window |
| :---- | :---- | :---- |
| **Gemini CLI** | gemini-2.5-flash-preview-09-2025 | 1M+ Tokens |
| **Jules** | gemini-3.1-pro | N/A (Cloud Managed) |
| **Claude Code** | claude-sonnet-4-6 (default) / claude-opus-4-7 / claude-haiku-4-5-20251001 | 200K Tokens |

<!-- SECTION_LAST_UPDATED: 2026-04-11 | COMMIT: ecf7f2c | CHANGE: Initial section -->
## **5\. GitHub CLI (gh)**

**Version:** 2.70+ (April 2026\)

### **Installation \& Setup**

* **Install:** Download from https://cli.github.com/ or `winget install GitHub.cli` (Windows) / `brew install gh` (macOS)
* **Login:** gh auth login
* **Check Auth:** gh auth status
* **Set Default Repo:** gh repo set-default \<owner/repo\>

### **Issue Management**

| Command | Description |
| :---- | :---- |
| gh issue create \--title "..." \--body "..." | Create a new issue |
| gh issue create \--title "..." \--body "..." \--label "\<label\>" | Create issue with label |
| gh issue list | List open issues |
| gh issue list \--label "\<label\>" | List issues by label |
| gh issue view \<n\> | View issue details |
| gh issue view \<n\> \--comments | View issue with all comments |
| gh issue edit \<n\> \--add-label \<label\> | Add a label to an issue |
| gh issue edit \<n\> \--remove-label \<label\> | Remove a label from an issue |
| gh issue edit \<n\> \--add-assignee \<user\> | Assign an issue |
| gh issue close \<n\> | Close an issue |
| gh issue reopen \<n\> | Reopen an issue |
| gh issue comment \<n\> \--body "..." | Add a comment to an issue |

### **Pull Request Management**

| Command | Description |
| :---- | :---- |
| gh pr create \--base master \--title "..." \--body "..." | Create a PR |
| gh pr create \--fill | Create PR, auto-fill title/body from commits |
| gh pr list | List open PRs |
| gh pr list \--author \<user\> \--state open | List open PRs by author |
| gh pr list \--author google-labs-jules\[bot\] \--state open | List Jules bot PRs |
| gh pr view \<n\> | View PR details |
| gh pr view \<n\> \--json statusCheckRollup | Get CI check status as JSON |
| gh pr checks \<n\> | View CI check status |
| gh pr checks \<n\> \--watch | Watch CI status (blocks until complete) |
| gh pr merge \<n\> \--squash \--delete-branch | Squash merge and delete branch |
| gh pr merge \<n\> \--merge | Standard merge |
| gh pr merge \<n\> \--rebase | Rebase merge |
| gh pr comment \<n\> \--body "..." | Comment on a PR |
| gh pr review \<n\> \--approve | Approve a PR |
| gh pr review \<n\> \--request-changes \--body "..." | Request changes |
| gh pr diff \<n\> | View PR diff |
| gh pr checkout \<n\> | Checkout PR branch locally |

### **Repository Commands**

| Command | Description |
| :---- | :---- |
| gh repo clone \<owner/repo\> | Clone a repository |
| gh repo view \<owner/repo\> | View repo details |
| gh repo fork \<owner/repo\> | Fork a repository |
| gh repo sync | Sync fork with upstream |

### **GitHub Actions**

| Command | Description |
| :---- | :---- |
| gh workflow list | List all workflows |
| gh workflow run \<workflow\> | Trigger a workflow |
| gh run list | List recent workflow runs |
| gh run view \<id\> | View a specific run |
| gh run watch \<id\> | Watch a running workflow |
| gh run rerun \<id\> | Re-run a failed workflow |

### **Other Useful Commands**

| Command | Description |
| :---- | :---- |
| gh release create \<tag\> \--title "..." \--notes "..." | Create a release |
| gh release list | List releases |
| gh api \<endpoint\> | Direct GitHub API call |
| gh secret set \<name\> | Set a repository secret |
| gh variable set \<name\> \--body "..." | Set a repository variable |

<!-- SECTION_LAST_UPDATED: 2026-04-22 | COMMIT: de657c4 | CHANGE: Section added with launch commands and MCP integration note -->
## **6\. Chrome DevTools Remote Debugging**

Launching Chrome with `--remote-debugging-port=9222` lets AI agents control a live browser session via the Chrome DevTools Protocol (CDP) at `http://localhost:9222`, or through the MCP chrome-devtools server when configured.

### **Launch Commands**

**Windows (PowerShell):**
```powershell
& "C:\Program Files\Google\Chrome\Application\chrome.exe" --remote-debugging-port=9222 --user-data-dir="C:\chrome-debug-profile"
```

**Windows (CMD):**
```cmd
"C:\Program Files\Google\Chrome\Application\chrome.exe" --remote-debugging-port=9222 --user-data-dir="C:\chrome-debug-profile"
```

**macOS:**
```bash
/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome --remote-debugging-port=9222 --user-data-dir=/tmp/chrome-debug-profile
```

**Linux:**
```bash
google-chrome --remote-debugging-port=9222 --user-data-dir=/tmp/chrome-debug-profile
# Chromium alternative:
chromium-browser --remote-debugging-port=9222 --user-data-dir=/tmp/chrome-debug-profile
```

### **Accessing the Debug Session**

| URL | Description |
| :---- | :---- |
| `http://localhost:9222` | DevTools landing page — lists open tabs |
| `http://localhost:9222/json` | JSON list of debuggable targets |
| `http://localhost:9222/json/version` | Browser version and WebSocket URL |

### **MCP chrome-devtools Server (when configured)**

If the `chrome-devtools` MCP server is active in your session, use its tools directly instead of raw CDP — no manual launch required for navigation and interaction. The Orchestrator can verify availability with:

```bash
# Check if MCP chrome-devtools is active (Claude Code)
/mcp
```

If not available, launch Chrome with the command above first, then connect via `http://localhost:9222`.

### **Notes**

- The `--user-data-dir` flag is required — Chrome refuses remote debugging on the default profile.
- Use a dedicated debug profile path (not your normal Chrome profile) to avoid session conflicts.
- Port 9222 is the conventional default; use `--remote-debugging-port=<n>` to change it.
- On Windows the Orchestrator can run the PowerShell launch command directly via Bash without user intervention.

<!-- SECTION_LAST_UPDATED: 2026-04-24 | COMMIT: (pending) | CHANGE: Claude model IDs updated to current Claude 4.x family -->
## **7\. Model Version Reference Table**

| Tool | Latest Stable Model Code | Context Window |
| :---- | :---- | :---- |
| **Gemini CLI** | gemini-2.5-flash-preview-09-2025 | 1M+ Tokens |
| **Jules** | gemini-3.1-pro | N/A (Cloud Managed) |
| **Claude Code** | claude-sonnet-4-6 (default) / claude-opus-4-7 / claude-haiku-4-5-20251001 | 200K Tokens |
| **Codex CLI** | codex-mini-latest | 200K Tokens |

*Last Updated: April 13, 2026*
<!-- END scaffold:ai-cli-reference-guide-md -->