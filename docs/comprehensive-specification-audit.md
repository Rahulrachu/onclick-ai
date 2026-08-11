# OnClick AI — Comprehensive Specification Audit & Architecture Mapping

This document audits every requirement from the latest master specification (`Pasted_content_71.txt`) against the OnClick AI repository (`Rahulrachu/onclick-ai`).

## Summary of Audit

| Requirement Area | Specification Target | Current Repository Status | Implementation Action |
|---|---|---|---|
| **Local-First Architecture** | Isolated local Linux VM, no cloud-dependent VM execution | Partially supported via local process execution | Implement `VirtualMachineProvider` abstraction (Linux/Mac/Windows) with strict process/filesystem sandboxing. |
| **Sandbox & Mission Manager** | Isolated workspaces (`workspace/`, `downloads/`, `artifacts/`, `screenshots/`, `logs/`, `browser/`, `state/`) | Partially supported via basic directory creation | Upgrade mission lifecycle with persistent vs. temporary modes, snapshots, and restore. |
| **Agent Computer** | See, Think, Act, Verify, Recover loop with DOM, accessibility, screenshots, and terminal | Supported via basic runtime loops | Strengthen observation (DOM/a11y/screenshots) and verification loops across agent steps. |
| **Browser Operator** | Chromium/Chrome, multi-tab, profiles, downloads/uploads, auth sessions | Supported via Playwright automation | Add persistent profiles, multi-tab management, downloads/uploads tracking, and authentication-aware session storage. |
| **Deep & Parallel Research** | Subquestions, parallel search, source ranking, deduplication, contradiction detection | Supported via search tools | Implement a dedicated parallel research manager with concurrency throttling and synthesis. |
| **Agent Skills System** | `SKILL.md`, scripts, references, templates | Basic documentation | Build an extensible skills execution engine supporting discoverable workflow templates inside the VM. |
| **Full Coding & Web App Builder** | Complete full-stack app creation, running, debugging, testing, packaging | Basic code tools | Implement autonomous project scaffolding, dependency installation, test execution, and auto-debugging. |
| **File & Artifact System** | PDF, DOCX, PPTX, XLSX, CSV, JSON, Markdown, images, source code, ZIP archives | Supported via basic artifacts | Add validation state, mime-type verification, and metadata tracking for all generated artifacts. |
| **Memory Tiers** | Mission memory, persistent workspace memory, agent memory | Basic session memory | Implement tiered memory storage synchronized with persistent VM workspaces. |
| **GitHub Agent** | Clone, branch, commit, push, PR, CI inspection, fix failures | Basic shell integration | Add complete GitHub CLI workflow orchestration for repository maintenance and PR management. |
| **Security & Host Bridge** | VM isolation, network policy, secret management, explicit host bridge permissions | Basic permission checks | Build strict host-to-VM bridge permission gates for clipboard, notifications, and user folders. |
| **Local / Cloud Model Support** | Ollama, OpenAI-compatible local servers, OpenAI, Anthropic, Gemini | Supported via core LLM abstraction | Add first-class Ollama and local OpenAI-compatible inference configuration. |
| **Acceptance Missions** | 4 rigorous missions (MCA research, SaaS app, Failure recovery, Persistent computer) | Partially covered by existing tests | Implement and run end-to-end acceptance test missions verifying the complete loop. |

References:
- OnClick AI Master Specification (`Pasted_content_71.txt`)
- Repository: `Rahulrachu/onclick-ai`
