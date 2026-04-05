# Bantay 🛡️ (Auth0 Hackathon 2026)

**Security-first secret detection with Auth0 "Authorized to Act" Human-in-the-Loop.**

Bantay is a pre-push hook that prevents accidental credential leakage by combining automated scanning with AI-powered risk assessment and human-initiated authorization.

## Features

- 🔍 **Visibility-Aware Scanning**: Automatically detects repository visibility (Public vs. Private) to adjust risk thresholds dynamically.
- 🧠 **AI Risk Scoring**: Uses Vultr Inference (Qwen 2.5 Coder) to assessFindings based on code context and expliotability.
- 🔐 **Secure Secret Vault**: AES-256-GCM encrypted storage for local credentials in `~/.bantay/secrets`.
- 🏢 **Multi-Tenant Support**: Manage multiple Auth0 tenants or environments using `bantay login --tenant <name>`.
- 🤖 **Auto-Discovery**: User ID is automatically discovered via Auth0 `/userinfo` during login.
- 📱 **ntfy Alerts**: Push notifications to your phone when a high-risk push is detected.

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

# Login to Auth0 (First time setup)
# This will guide you through OAuth flow and master key generation
node packages/cli/dist/index.js login

# Initialize Bantay in your repo (installs pre-push hook)
node packages/cli/dist/index.js init
```

### 3. Configuration

Copy `.env.example` to `.env` and fill in your credentials. Bantay also supports a local `.bantay.yaml` for repo-specific policies.

Required variables (can be set in `.env` or during `login`):

- `BANTAY_AUTH0_DOMAIN`: Your Auth0 tenant domain.
- `BANTAY_AUTH0_CLIENT_ID`: Your Auth0 application client ID.
- `BANTAY_LLM_API_KEY`: API key for Vultr Inference.
- `BANTAY_NTFY_TOPIC`: Your private ntfy topic for alerts.

## Edge Case Handling

- **First Commit**: Handles initial pushes gracefully by diffing against the null tree.
- **Network Failures**: Fail-closed logic ensures that if AI or Auth0 services are unreachable, the push is blocked by default.
- **Buffered Input**: Fixed terminal prompt issues to ensure smooth CLI interaction.

## Project Structure

- `packages/core`: The security engine, encryption service, and LangGraph pipeline.
- `packages/cli`: Terminal UI, git hook manager, and multi-tenant config management.

---

Built for the **Auth0 "Authorized to Act" Hackathon 2026**.
