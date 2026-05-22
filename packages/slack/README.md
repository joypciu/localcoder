# LocalCoder Slack Bot

Slack integration that creates threaded LocalCoder sessions.

## Setup

1. Create a Slack app at https://api.slack.com/apps
2. Enable Socket Mode
3. OAuth scopes: `chat:write`, `app_mentions:read`, `channels:history`, `groups:history`
4. Set in `.env`:
   - `SLACK_BOT_TOKEN`
   - `SLACK_SIGNING_SECRET`
   - `SLACK_APP_TOKEN`

## Run

```bash
bun run --cwd packages/slack dev
```

Each Slack thread gets its own LocalCoder session.
