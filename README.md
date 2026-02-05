# courtfinder-akl

Auckland badminton court availability aggregator - deployed on Cloudflare Workers.

## Architecture

| Component | Technology |
|-----------|------------|
| **Runtime** | Cloudflare Workers |
| **Framework** | Hono |
| **Storage** | Cloudflare KV |
| **Scheduling** | Cloudflare Cron Triggers |
| **Alerts** | Cloudflare Email Routing |

## Prerequisites

- Node.js v20+
- pnpm
- Cloudflare account with Workers enabled

## Quick Start

### 1. Install dependencies
```bash
pnpm install
```

### 2. Set up KV namespace
```bash
# Create namespace (or use CF dashboard)
npx wrangler kv:namespace create courtfinder-cache

# Update wrangler.toml with the returned namespace ID
```

### 3. Set secrets
```bash
npx wrangler secret put API_KEY
npx wrangler secret put EVERGREEN_EMAIL
npx wrangler secret put EVERGREEN_PASSWORD
```

### 4. Local development
```bash
pnpm dev
```

### 5. Deploy
```bash
pnpm run deploy
```

## Configuration

### wrangler.toml

| Setting | Description |
|---------|-------------|
| `name` | Worker name |
| `compatibility_date` | Workers runtime version |
| `crons` | Cron schedule (UTC) |
| `[[kv_namespaces]]` | KV binding |
| `[vars]` | Environment variables |

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `FETCH_DAYS_AHEAD` | Days of availability to fetch | `7` |
| `TZ` | Timezone for date calculations | `Pacific/Auckland` |
| `CACHE_TTL_MINUTES` | Cache freshness threshold | `20` |
| `STALE_SERVE_MINUTES` | Max age to serve stale data | `60` |
| `ALERT_COOLDOWN_MINUTES` | Alert cooldown period | `30` |

### Secrets (via `wrangler secret put`)

| Secret | Description |
|--------|-------------|
| `API_KEY` | API authentication key |
| `EVERGREEN_EMAIL` | Evergreen login email |
| `EVERGREEN_PASSWORD` | Evergreen login password |
| `ALERT_FROM` | Alert sender email (optional) |
| `ALERT_TO` | Alert recipient email (optional) |

## Cron Schedule

The cron runs every 15 minutes from **6:00 AM to 11:59 PM Auckland time**.

```toml
crons = ["*/15 17-23,0-11 * * *"]
```

**Why these hours?**
- Auckland is UTC+12 (NZST) or UTC+13 (NZDT)
- 6am Auckland = 17:00-18:00 UTC
- 11:59pm Auckland = 10:59-11:59 UTC
- Cloudflare cron always uses UTC

## API Endpoints

| Endpoint | Method | Auth | Description |
|----------|--------|------|-------------|
| `/` | GET | No | API info |
| `/health` | GET | No | Health status |
| `/venues` | GET | Yes | List venues |
| `/availability` | POST | Yes | Query availability |
| `/refresh` | POST | Yes | Manual data refresh |

**Authentication:** Include `X-API-Key` header for protected routes.

### Example Requests

```bash
# Base URL (change to your deployed URL)
BASE_URL="http://localhost:8787"
API_KEY="your-api-key"

# GET / - API info (no auth)
curl "$BASE_URL/"

# GET /health - Health status (no auth)
curl "$BASE_URL/health"

# GET /venues - List all venues
curl -H "X-API-Key: $API_KEY" "$BASE_URL/venues"

# POST /availability - Query availability (all venues, starting today)
curl -X POST \
  -H "X-API-Key: $API_KEY" \
  -H "Content-Type: application/json" \
  "$BASE_URL/availability"

# POST /availability - Query specific venues and date
curl -X POST \
  -H "X-API-Key: $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"venues": ["evergreen", "active-bond"], "start_date": "2025-01-15"}' \
  "$BASE_URL/availability"

# POST /refresh - Manually trigger data refresh
curl -X POST \
  -H "X-API-Key: $API_KEY" \
  "$BASE_URL/refresh"
```

### Response Examples

**GET /health**
```json
{
  "status": "ok",
  "last_refresh": "2025-01-15T10:30:00.000Z",
  "cache_age_seconds": 120,
  "providers": {
    "active": { "status": "ok", "last_fetch": "2025-01-15T10:30:00.000Z" },
    "evergreen": { "status": "ok", "last_fetch": "2025-01-15T10:30:00.000Z" }
  }
}
```

**GET /venues**
```json
{
  "venues": [
    { "id": "active-bond", "name": "Badminton North Harbour - Bond", "address": "..." },
    { "id": "active-corinthian", "name": "Badminton North Harbour - Corinthian", "address": "..." },
    { "id": "evergreen", "name": "Evergreen Sports", "address": "..." }
  ]
}
```

**POST /availability**
```json
{
  "generated_at": "2025-01-15T10:30:00.000Z",
  "week_start": "2025-01-15",
  "week_end": "2025-01-21",
  "venues": {
    "evergreen": {
      "name": "Evergreen Sports",
      "address": "...",
      "dates": {
        "2025-01-15": {
          "slots": {
            "09:00": { "available": true, "available_courts": ["1", "3", "5"] },
            "10:00": { "available": true, "only_premium": true, "available_courts": ["7"] },
            "11:00": { "available": false }
          },
          "summary": { "total_slots": 18, "available_slots": 5 }
        }
      }
    }
  }
}
```

**POST /refresh**
```json
{
  "success": true,
  "message": "Data refreshed successfully",
  "duration_ms": 2500,
  "cache": {
    "generated_at": "2025-01-15T10:30:00.000Z",
    "is_stale": false
  }
}
```

## Project Structure

```
.
├── src/
│   ├── index.ts              # Worker entry point
│   ├── env.ts                # Environment bindings types
│   ├── config.ts             # Static configuration
│   ├── types.ts              # TypeScript types
│   ├── middleware/
│   │   └── auth.ts           # API key authentication
│   ├── routes/
│   │   ├── health.ts
│   │   ├── venues.ts
│   │   ├── availability.ts
│   │   └── refresh.ts
│   ├── services/
│   │   ├── kv-cache.ts       # KV storage wrapper
│   │   ├── refresh.ts        # Data refresh logic
│   │   ├── email-alerter.ts  # Email alerts
│   │   └── transformer.ts    # Data transformation
│   └── providers/
│       ├── active.ts         # Active.com.au API
│       ├── evergreen.ts      # Evergreen Sports API
│       └── http-client.ts    # HTTP client with retry
├── wrangler.toml             # Cloudflare Workers config
├── package.json
└── tsconfig.json
```

## Available Scripts

| Script | Command | Description |
|--------|---------|-------------|
| `pnpm dev` | `wrangler dev` | Local development |
| `pnpm run deploy` | `wrangler deploy` | Deploy to production |
| `pnpm run tail` | `wrangler tail` | Stream live logs |

## Making Changes

### Update cron schedule
1. Edit `crons` in `wrangler.toml`
2. Run `pnpm deploy`

### Update environment variables
1. Edit `[vars]` in `wrangler.toml`
2. Run `pnpm deploy`

### Update secrets
```bash
npx wrangler secret put SECRET_NAME
# Enter new value when prompted
```

### View KV data
```bash
# List keys
npx wrangler kv:key list --namespace-id YOUR_NAMESPACE_ID

# Get value
npx wrangler kv:key get "availability" --namespace-id YOUR_NAMESPACE_ID
```

### View logs
```bash
npx wrangler tail
```

## Tech Stack

- [Cloudflare Workers](https://workers.cloudflare.com/) - Serverless runtime
- [Hono](https://hono.dev/) - Lightweight web framework
- [Cloudflare KV](https://developers.cloudflare.com/kv/) - Key-value storage
- [TypeScript](https://www.typescriptlang.org/) - Type-safe JavaScript
- [Zod](https://zod.dev/) - Runtime validation
- [pnpm](https://pnpm.io/) - Package manager
