# pi-system-one

Selective System One delegation for Pi: decision support, visual desktop automation, and MCP tool orchestration with interchangeable secondary models.

> **Prototype / early release.** The original System-One-Computer-Use project is experimental. This Pi integration is independently implemented and is not production-certified. Review the source and test with harmless tasks before enabling desktop or MCP actions.

## Design

The Pi primary model is always in charge. This extension does not intercept ordinary messages, classify every prompt, or automatically forward conversation history. Only when the primary model decides delegation is useful does it call one of the three tools below, supplying a concise task and relevant context. The secondary model's result returns to the primary, which validates and produces the user-facing answer.

User -> Pi primary model (full conversation) -> selects whether to delegate and curates context -> System One extension -> validated result -> primary model -> user.

Delegation routes:
- Decision support
- Computer use: screenshot -> proposed action -> approval -> execute -> observe again
- MCP planning and execution against a configured server

## Install

Requires Pi and Node.js 22.19 or newer.

    pi install git:github.com/okillsee08-oss/pi-system-one

Restart Pi or run /reload. For local development:

    git clone https://github.com/okillsee08-oss/pi-system-one.git
    cd pi-system-one
    npm install
    npm run check
    npm test
    pi -e ./src/index.ts

## Providers

Set the default provider in ~/.pi/agent/system-one.json to openai, gemini, jev, or local. Each tool can override the provider for that delegation only.

| Provider | Authentication / endpoint | Supported delegation |
|---|---|---|
| OpenAI | OPENAI_API_KEY, OpenAI API | decisions, vision, MCP |
| Gemini | GEMINI_API_KEY, Gemini API | decisions, vision, MCP |
| JEV | TYPESAFE_API_KEY, TypeSafe System One API | choice-based decisions and computer use |
| Local | optional LOCAL_MODEL_API_KEY, OpenAI-compatible endpoint | decisions, vision, MCP |

ChatGPT subscription access is not an OpenAI API key. The OpenAI adapter uses the API and its billing. Local endpoints can be served by Ollama, LM Studio, vLLM, or compatible runtimes. Configure the exact base URL and model ID for your server.

JEV exposes a constrained choice/box interaction rather than free-form JSON chat. It is supported for shortlist decisions and visual computer-use decisions, but not arbitrary MCP argument generation or open-ended rationales. The extension reports this limitation rather than silently switching providers.

## Configuration

Copy system-one.example.json to ~/.pi/agent/system-one.json. Provide credentials through the environment; do not put API keys in the JSON config:

    export OPENAI_API_KEY="..."
    export GEMINI_API_KEY="..."
    export TYPESAFE_API_KEY="..."
    export LOCAL_MODEL_API_KEY="..." # optional for local inference

The example config documents provider, desktop, timeout, and MCP settings. Override the config path with PI_SYSTEM_ONE_CONFIG.

## Desktop computer use

Install the isolated Python requirements:

    python3 -m venv .venv
    . .venv/bin/activate
    python -m pip install -r python/requirements.txt

Set computerUse.python to the virtual environment's interpreter path (on Windows use .venv\Scripts\python.exe). The bridge captures the primary monitor and exposes only click, double-click, type, a small key allowlist, scroll, wait, and explicitly named HTTP(S) URL navigation. It does not expose a shell, arbitrary hotkeys, filesystem, or terminal.

Safety defaults:
- Confirmation for interactive actions is enabled by default. Scroll and wait do not require approval.
- Click coordinates must be normalized; typed text must occur verbatim in the delegated task.
- URLs must be HTTP(S) and explicitly appear in that task.
- Action count, text size, screenshot dimensions, bridge response size, and request duration are bounded.
- Low-confidence proposals stop; Pi cancellation terminates the active Python bridge process.

Platform caveats: grant Screen Recording and Accessibility permissions on macOS; secure/UAC screens may not be accessible on Windows; Linux needs a working graphical session. Wayland support depends on the compositor, portals, and XWayland setup and is not guaranteed. Android/iOS automation from upstream is not integrated here.

## MCP delegation

MCP servers are configured locally in system-one.json. Every server must declare a non-empty allowedTools list; wildcards are rejected. The primary tool call can narrow that list but can never expand it.

Example configuration:

    {
      "mcpServers": {
        "filesystem": {
          "transport": "stdio",
          "command": "npx",
          "args": ["-y", "@modelcontextprotocol/server-filesystem", "/home/me/project"],
          "allowedTools": ["list_allowed_directories", "list_directory", "read_file", "search_files"]
        },
        "team-api": {
          "transport": "http",
          "url": "https://mcp.example.com/mcp",
          "headers": { "Authorization": "Bearer ${TEAM_MCP_TOKEN}" },
          "allowedTools": ["search_records", "get_record"]
        }
      }
    }

Tools annotated read-only can run without confirmation. Other tools require approval and show the proposed arguments. Server-provided annotations are not a security guarantee. Stdio servers execute with your local user permissions: only configure commands you trust.

## Pi tools

| Tool | Use |
|---|---|
| system_one_decide | Secondary opinion or shortlist ranking |
| system_one_computer_use | Screenshot-based, approved desktop actions |
| system_one_mcp | Bounded tool planning and calls against one configured MCP server |

Run /system-one to view the selected provider, computer-use state, and config path.

## Development and limits

Run npm install, npm run check, npm test, and python -m py_compile python/bridge.py for the local checks. Automated checks do not replace end-to-end testing against your Pi version, model endpoint, desktop environment, and MCP servers.

The original upstream prototype was tested primarily on macOS. This separately implemented bridge aims to be portable but still needs real desktop testing on each OS. Read docs/SAFETY.md before enabling automation.

## License

MIT. The upstream repository remains untouched and is not vendored by this extension.
