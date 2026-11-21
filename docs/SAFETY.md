# Safety model

## Authority and context

- The Pi primary model remains responsible for the user-facing answer and decides whether a delegation is useful.
- This extension does not intercept messages, scan the session transcript, or call a secondary model during ordinary conversation.
- Each tool receives only the task and optional context explicitly supplied by the primary model. No hidden transcript expansion occurs.
- System One output is untrusted. The extension validates it against action or tool allowlists before execution.
- Screen text, webpages, files, tool descriptions, and MCP results are data, not instructions. They must not override the primary-selected task.

## Computer use

- Desktop automation requires explicit tool invocation, a configured Python interpreter, and installed dependencies.
- Captures the primary display only. When using a cloud provider, visible screen content is sent to that provider.
- The bridge exposes only click, double-click, type, a small keyboard allowlist, scroll, wait, and explicit HTTP(S) URL opening.
- It does not expose shell commands, terminal access, arbitrary key combinations, filesystem access, or browser DevTools.
- Interactive actions are confirmed by default. Scroll and wait do not require confirmation.
- URLs must be HTTP(S) and explicitly included in the delegated task. Typed text must appear verbatim in that task.
- Click coordinates must be normalized. Action count, text size, screenshot size, response size, and bridge execution time are bounded.
- Low-confidence proposals stop without execution.
- Cancellation propagates to and terminates the active Python bridge process. Each bridge request has a 20-second timeout. PyAutoGUI's corner failsafe is an additional local emergency stop.

The bridge is not a security sandbox. Once approved, actions interact with your real desktop and the permissions of the Pi process. Avoid using it with unattended accounts or sensitive sessions.

## MCP

- MCP servers must be configured locally. Every server needs an explicit non-empty allowedTools list; wildcard entries are rejected.
- A delegated tool must be present in both the configured allowlist and any narrower allowlist provided by the primary model.
- Tools marked readOnlyHint=true and not marked destructiveHint=true can run without a prompt. Other calls require an approval showing the tool and arguments.
- MCP annotations are supplied by the server; they are not a security guarantee.
- Stdio servers execute commands with the local user's permissions. Only configure trusted commands, arguments, directories, and servers.

## Provider and secret handling

- API credentials are read from environment variables named by apiKeyEnv. Do not store credentials directly in system-one.json or pass unrelated secrets in context.
- MCP environment and header values may reference variables using ${ENV_NAME}.
- Cloud model providers receive the prompts, context, and screenshots delegated to them. Review each provider's data handling terms.
- A local provider keeps prompts on-device only when the configured endpoint is genuinely local and does not forward traffic elsewhere.
- JEV uses the TypeSafe System One choice/box interface. It is not a general JSON completion endpoint and is not used for arbitrary MCP arguments.
