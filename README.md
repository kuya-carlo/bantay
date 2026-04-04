# Bantay 🛡️ (Auth0 Hackathon 2026)

**Security-first secret detection with Auth0 "Authorized to Act" Human-in-the-Loop.**

Bantay is a pre-push hook that prevents accidental credential leakage by combining automated scanning with AI-powered risk assessment and human-initiated authorization.

## Features

- 🔍 **Secret Scanning**: Scans staged changes using `secretlint`.
- 🧠 **AI Risk Scoring**: Uses Vultr Inference (Qwen 2.5 Coder 32B) to categorize findings (LOW/MEDIUM/HIGH).
- 🔐 **Auth0 CIBA**: Medium-risk pushes trigger a cross-device authorization request via Auth0.
- 📱 **ntfy Alerts**: Push notifications to your phone when a push is interrupted.
- 🏗️ **Library-First**: Core logic is a standalone TypeScript library.

## Getting Started

### 1. Prerequisites
- [pnpm](https://pnpm.io/)
- Node.js 20+

### 2. Installation
```bash
# Install dependencies
pnpm install

# Build the monorepo
pnpm build

# Initialize Bantay in your repo
node packages/cli/dist/index.js init
```

### 3. Configuration
Copy `.env.example` to `.env` and fill in your credentials:
```bash
cp .env.example .env
```

Required variables:
- `AUTH0_DOMAIN`: Your Auth0 tenant domain.
- `AUTH0_CLIENT_ID`: A Client Credentials M2M or Native App client ID.
- `VULTR_API_KEY`: API key for Vultr Inference.
- `NTFY_TOPIC`: Your private ntfy topic for alerts.

## How it Works

1. **Pre-push**: Every push triggers `bantay scan`.
2. **Detection**: The tool extracts the staged diff and runs Secretlint and filename pattern matching in-process.
3. **Scoring**: A LangGraph state machine calls Qwen 2.5 Coder to assess the risk.
4. **Decision**:
   - **LOW**: Push allowed automatically.
   - **MEDIUM**: Push **pauses**. You receive an alert on `ntfy`. Authorization requested via Auth0 CIBA.
   - **HIGH**: Push **blocked** immediately.
5. **Fail-Closed**: If any service (Vultr, Auth0, ntfy) is unreachable, the push is blocked by default.

## Project Structure
- `packages/core`: The security engine and LangGraph pipeline.
- `packages/cli`: Terminal UI and git hook manager.

---
Built for the **Auth0 "Authorized to Act" Hackathon 2026**.
