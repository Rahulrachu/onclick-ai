# OnClick AI Computer-Use & Browser Architecture

## Overview

OnClick AI integrates real browser automation via Playwright and system control capabilities alongside its 12-agent orchestrator. Rather than relying on simulated responses, the runtime opens headless Chromium contexts to execute real web navigation, URL extraction, element clicking, form typing, and screenshot capture.

## Key Subsystems

1. **Browser Engine (`server/browserEngine.ts`)**:
   - Launches shared Chromium instances in container-safe headless mode (`--no-sandbox`).
   - Supports `open_url`, `search_web`, `extract_page`, `screenshot_page`, `click_element`, and `type_form`.
   - Automatically handles timeouts, viewport settings, and screenshot artifact persistence.

2. **Computer-Use Controls**:
   - Provides hooks for screenshot capture, mouse movement, clicks, and keyboard typing.
   - Enforces strict security boundaries (SAFE, CONFIRM, RESTRICTED).

3. **Secure LLM Provider Abstraction (`server/llmProvider.ts`)**:
   - Abstracts OpenAI, Anthropic, and Built-in Forge API calls with secure environment variable injection.
   - Provides automatic fallback parsing when external API keys are omitted.

4. **Observation & Verification Loop**:
   - Every tool execution inspects return state and logs execution status to both database tables and live SSE event streams.
