# OnClick AI vs. Manus-Class General Autonomous Agent Platform: Parity-Plus Audit & Engineering Blueprint

This document defines the architectural gap analysis and upgrade path to make OnClick AI a robust, highly capable autonomous agent platform inspired by Manus.

## 1. Core Capability Comparison

| Capability Domain | Manus General Agent Architecture | Current OnClick AI Base | Target Parity-Plus Implementation |
|---|---|---|---|
| **Goal Decomposition & Planning** | Dynamic hierarchical task graphs with parallel branches, conditional steps, and real-time replanning | Sequential/tree steps with static fallback | Provider-backed dynamic replanning, sub-task parallelism, and confidence scoring. |
| **Tool Execution & Sandboxing** | Secure containerized/VM sandboxes with rootless execution, network policies, and virtual displays | Local process execution in subdirectories | Isolated VM/sandbox virtualization provider with snapshotting, rollback, and resource limits. |
| **Browser & Computer Use** | Headless/headed Playwright sessions with persistent profiles, DOM accessibility trees, and coordinate interaction | Basic Playwright wrapper | Production browser manager with multi-tab support, cookies/session persistence, downloads/uploads tracking, and visual assertions. |
| **Model Abstraction & Routing** | Dynamic multi-model routing (fast models for extraction, reasoning models for planning, vision models for GUI) | Basic OpenAI/Anthropic/Ollama provider | Model selector router with automatic fallback, token usage tracking, and structured tool-call validation. |
| **Human-in-the-Loop & Approvals** | Granular permission tiers (SAFE, CONFIRM, RESTRICTED) with real-time UI interruption | Basic confirmation state | Stateful approval gates with timeout handling, audit logs, and permission policy overrides. |
| **Artifacts & Memory** | Multi-tier memory (mission, episodic, user preferences) and rich artifact export (PDF, spreadsheets, code) | Database task logs and storage | Tiered memory persistence and verifiable artifact bundles with secure presigned downloads. |

## 2. Implementation Roadmap

1. **Agent Kernel Upgrade:** Dynamic replanning, tool-call validation, token usage accounting, and state persistence.
2. **Browser & Computer Hardening:** Persistent profile storage, accessibility tree extraction, download/upload tracking, and visual verification.
3. **Workspace & Mission Templates:** Pre-configured mission starters (Research & Synthesis, Full-Stack Coding, Automated Web Scraping, Code Debugging & PR Creation).
4. **Dashboard & Observability:** Real-time plan graph visualization, live browser/terminal logs, cost/token tracking, and approval dialogs.
5. **Rigorous Verification:** Acceptance test suites covering complex multi-step workflows.

References:
- OnClick AI Master Specification (`Pasted_content_71.txt`)
- Repository: `Rahulrachu/onclick-ai`
