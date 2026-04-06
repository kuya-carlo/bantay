# Bantay — Project Context Brief

**Version:** 0.1.0 MVP | **Hackathon:** Auth0 "Authorized to Act" 2026
**Deadline:** April 7, 2026 @ 2:40 PM PH time
**Status:** Feature-complete. Testing + submission phase.
**Repo:** private, local only (not yet pushed to remote)

---

## What is Bantay?

A pre-push git hook CLI that intercepts dangerous code before it leaves a
developer's machine. Two-layer detection: regex via Secretlint + content regex,
then LLM-based context-aware risk scoring. Auth0 handles identity and
human-in-the-loop escalation via CIBA. Named "bantay" (Filipino: guard/watch).
**Tagline:** "Bad code doesn't leave your machine."

---

## Core Flow

```
git push → pre-push hook → bantay scan → detect secrets → LLM risk score → decision
```

- **Low risk** → push allowed immediately (~0.71s)
- **Medium risk** → Auth0 CIBA fires → ntfy.sh notification → Guardian push to phone → 60s timeout → auto-block if no response (~4s + human wait)
- **High risk** → auto-block immediately (~4-9s depending on Vultr latency)

---

## What's Working End-to-End ✅

- `bantay login` — prompts for credentials, stores encrypted in `~/.bantay/secrets`, auto-fetches Auth0 user ID via `/userinfo`
- `bantay init` — installs pre-push hook, creates `.bantay.yaml`
- `bantay scan` — full pipeline: diff extraction → Secretlint + regex → LLM scoring → decision
- LOW risk: ~0.71s ✅
- HIGH risk: ~4-9s (Vultr latency) ✅
- MEDIUM risk: CIBA fires → ntfy notification → Guardian push → approve/deny → graph resumes ✅
- Token Vault: GitHub API call via Auth0 Token Vault for repo visibility ✅
- AES-256-GCM encrypted secret storage in `~/.bantay/secrets` ✅
- Multi-tenant config support ✅
- 46 unit tests, 95% coverage ✅
- Bundle size: 14KB core + 13KB CLI ✅

---

## What Triggers a Flag

| Trigger                  | Behavior                                                    |
| ------------------------ | ----------------------------------------------------------- |
| Credentials (Secretlint) | API keys, tokens, passwords — value masked before LLM       |
| Anthropic API Key        | `sk-ant-api03-*` regex pattern                              |
| OpenAI API Key           | `sk-[48 chars]` regex pattern                               |
| GitHub PAT               | `ghp_*` or `ghs_*`                                          |
| AWS Access Key           | `AKIA*`                                                     |
| JWT Token                | `eyJ*.eyJ*.*` — scores MEDIUM                               |
| Sensitive filenames      | `*.pem`, `*.key`, `id_rsa`, `.env`, `*.map` — forces MEDIUM |
| Chungus commits          | >1000 lines on protected branches                           |

---

## Auth0 Integration

| Feature           | Status                                                   |
| ----------------- | -------------------------------------------------------- | ------------------------- |
| **CIBA**          | ✅ Working — direct HTTP polling, no GraphResumer needed |
| **Token Vault**   | ✅ Working — GitHub token retrieved via Management API   |
| **Guardian push** | ✅ Working — user enrolled, push notifications firing    |
| **Tenant**        | `kuyacarlo.jp.auth0.com`                                 |
| **Client ID**     | `zNuS01PgB3suIY9s6qkbUrav4dBu3bP1`                       |
| **User**          | `sjc.71415@gmail.com` / `auth0                           | 69d118aa5bfce3de6abd3e8b` |

---

## ntfy Integration

- **Instance:** `ntfy.kuyacarlo.dev`
- **Test topic:** `mytopic`
- **Auth:** Basic auth, username `karlo`
- Fires simultaneously with CIBA on MEDIUM risk
- ntfy = delivery channel, Auth0 CIBA = auth layer

---

## Tech Stack

| Layer           | Tech                                                           |
| --------------- | -------------------------------------------------------------- |
| Language        | TypeScript, Node.js                                            |
| Package manager | pnpm (monorepo)                                                |
| Build           | tsup (CJS output)                                              |
| Scanner Layer 1 | Secretlint (`@secretlint/core`)                                |
| Scanner Layer 2 | Custom regex (Anthropic, OpenAI, AWS, GitHub, JWT, etc.)       |
| LLM Inference   | Vultr Serverless Inference — `Qwen/Qwen2.5-Coder-32B-Instruct` |
| LLM API style   | OpenAI-compatible (`/chat/completions`) — provider-agnostic    |
| Auth            | Auth0 (CIBA + Token Vault) — direct HTTP, no SDK               |
| Notifications   | ntfy.sh (self-hosted at `ntfy.kuyacarlo.dev`)                  |
| Secret storage  | AES-256-GCM encrypted in `~/.bantay/secrets`                   |
| Hook delivery   | pre-push hook via `bantay init`                                |
| OS target       | Fedora Linux (tested)                                          |
| CI/CD           | GitHub Actions + `act` for local testing                       |
| Tests           | Vitest, 46 tests, 95% coverage                                 |

---

## Monorepo Structure

```
packages/
  core/          — @bantay/core: scanner, LLM scoring, config, ntfy, github
    src/
      graph/
        index.ts       — buildGraph() pipeline: scan → score → decide
        nodes/
          score.ts     — LLM risk scoring via Vultr (direct axios)
          decide.ts    — policy decision (low/medium/high)
      services/
        scanner.ts     — Secretlint + regex scanning
        config.ts      — .bantay.yaml loader + multi-tenant
        ntfy.ts        — ntfy notification service
        github.ts      — GitHub API via Token Vault
      types/
        schemas.ts     — Zod schemas (Finding, RiskAssessment)
  cli/           — @bantay/cli: terminal UI, commands
    src/
      commands/
        scan.ts        — main scan command + CIBA polling loop
        init.ts        — hook installation
        login.ts       — credential setup + Auth0 login
      formatters.ts    — terminal output formatting
      index.ts         — CLI entry (commander.js)
    bin/bantay         — binary entry point
```

---

## Key Config Files

**`.bantay.yaml`** (repo-level):

```yaml
ntfy:
  topic: "mytopic"
git:
  protectedBranches: ["main", "master", "prod"]
thresholds:
  highRiskLineCount: 1000
```

**`~/.bantay/config`** (global, auto-created by `bantay login`):

- Stores Auth0 domain, client ID, user ID, ntfy URL
- Multi-tenant: `activeTenant` pointer + `tenants` map
- Secrets stored separately in `~/.bantay/secrets` (AES-256-GCM)
  **`.env.example`**:

```bash
AUTH0_DOMAIN=your-tenant.jp.auth0.com
AUTH0_CLIENT_ID=your-client-id
AUTH0_CLIENT_SECRET=your-client-secret
AUTH0_USER_ID=auth0|your-user-id
LLM_BASE_URL=https://api.vultrinference.com/v1
LLM_API_KEY=your-api-key
LLM_MODEL=Qwen/Qwen2.5-Coder-32B-Instruct
NTFY_URL=https://ntfy.sh
NTFY_USERNAME=your-username
NTFY_PASSWORD=your-password
NTFY_TOPIC=your-topic
```

---

## CIBA Flow (Direct HTTP, No SDK)

```
bantay scan → MEDIUM risk detected
  → ntfy POST to ntfy.kuyacarlo.dev/mytopic (out-of-band alert)
  → POST /bc-authorize with login_hint (user ID) → get auth_req_id
  → poll POST /oauth/token every 5s with auth_req_id
  → user taps Approve on Auth0 Guardian app
  → poll returns access_token
  → push allowed
  → timeout after 60s → push blocked
```

---

## Token Vault Flow

```
bantay scan → score node
  → GET Auth0 Management API token (client_credentials)
  → GET /api/v2/users/{user_id}/federated-connections/github/tokens
  → use GitHub token to GET /repos/{owner}/{repo}
  → include repo visibility (public/private) in LLM prompt
```

---

## Competitive Positioning

| Tool        | Speed     | Human-in-Loop  | Auth           | Context-aware |
| ----------- | --------- | -------------- | -------------- | ------------- |
| Gitleaks    | ~ms       | ❌             | ❌             | ❌            |
| TruffleHog  | 2-10s     | ❌             | ❌             | ❌            |
| GitGuardian | post-push | ❌ alerts only | ❌             | ❌            |
| **Bantay**  | 0.71-9s   | ✅ Auth0 CIBA  | ✅ Token Vault | ✅ LLM        |

## **Key differentiator:** Only tool with identity-backed human approval. Exceptions are explicit and auditable — not skippable with `--no-verify`.

## Hackathon Submission Requirements

- [x] Token Vault usage (mandatory)
- [ ] Demo video (~3 min, YouTube/Vimeo)
- [ ] Public repo URL
- [ ] Text description on Devpost
- [ ] Published link (note: CLI tool, no web app)
- [ ] Optional: bonus blog post (250+ words, $250 prize)

---

## Team Roles

| Role                       | Responsibility                                  |
| -------------------------- | ----------------------------------------------- |
| **Karlo**                  | Final judgment, testing, server ops, submission |
| **Claude**                 | Architecture guidance, decision-making          |
| **Gemini**                 | Architecture guidance, cross-checking           |
| **Antigravity + spec-kit** | Implementation                                  |

---

## Constitution (Non-Negotiable)

1. Zero raw secrets in code
2. Core = TS library, CLI = thin wrapper
3. Human-in-the-loop for MEDIUM risk via Auth0 CIBA
4. ntfy.kuyacarlo.dev for out-of-band alerts
5. Fedora Linux, Podman, pnpm, uv (removed), act
6. TDD mandatory
7. CLI: stdin/args → stdout, errors → stderr
