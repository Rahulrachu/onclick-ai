# OnClick AI

OnClick AI is a production-grade multi-agent AI orchestration platform featuring a bold Brutalist visual identity, 12 specialized agent roles, a modular tool registry with strict permission tiers (`SAFE`, `CONFIRM`, `RESTRICTED`), real-time Server-Sent Events (SSE) streaming, inspectable memory tiers, persistent Playwright browser automation, computer-use controls, autonomous planning, observation, verification, and automated failure recovery.

---

## Architecture

OnClick AI implements a genuine autonomous execution loop:

```
User Goal → LLM Reasoning → Task Understanding → Planning → Structured Tool Call → Real Tool Execution → Browser / Computer Action → Observation → Result Interpretation → Verification → Success? ──(Yes)──> Complete
  │
  └──(No)──> Diagnose → Recover → Replan → Execute Again
```

---

## Core Features

1. **Autonomous Planning Engine:** Decomposes user goals into structured dependency graphs across specialized collaborating agents.
2. **Real Playwright Browser Automation:** Maintains persistent browser contexts, tabs, navigation, clicks, typing, scrolling, screenshots, and DOM inspection.
3. **Computer-Use Controls:** Real coordinate clicks, mouse movement, keyboard typing, and screen capture.
4. **12 Specialized Agent Roles:** Orchestrator, Planner, Research, Browser, Computer, Coding, File, Data, Reasoning, Verification, Critic, Recovery, and Security.
5. **Strict Security & Permissions:** Safeguarded with path traversal protection, command validation, credential redaction, and `SAFE`, `CONFIRM`, and `RESTRICTED` permission tiers.
6. **Real-Time SSE Streaming:** Streams exact live events (`TASK_STARTED`, `PLAN_CREATED`, `TOOL_STARTED`, `TOOL_COMPLETED`, etc.) to the Brutalist dashboard.
7. **Durable Artifact Storage:** S3-backed workspace storage for generated reports, PDFs, screenshots, and datasets.

---

## Installation & Setup

```bash
# Clone repository
git clone https://github.com/Rahulrachu/onclick-ai.git
cd onclick-ai

# Install dependencies
pnpm install

# Configure environment
cp .env.example .env
```

---

## Environment Variables (`.env.example`)

```env
DATABASE_URL=mysql://user:pass@localhost:3306/onclick_ai
JWT_SECRET=your_jwt_secret_here
OPENAI_API_KEY=your_openai_api_key_here
ANTHROPIC_API_KEY=your_anthropic_api_key_here
```

---

## Running Locally

```bash
# Start development server
pnpm dev
```

---

## Running Tests & Builds

```bash
# Type check
pnpm check

# Run Vitest suite (all unit, security, router, and acceptance tests)
pnpm test

# Build for production
pnpm build
```

---

## Acceptance Benchmarks

OnClick AI includes comprehensive acceptance test benchmarks (`server/acceptanceMissions.test.ts`) covering browser research, document generation, coding utility creation, failure recovery, and multi-step mission execution.

---

## License

MIT License.
