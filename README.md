# opencode-email-notify

EN | [中文](README_ZH.md)

An OpenCode plugin that listens for the `session.idle` event and sends email notifications.

## Features

- Supports **SMTP password authentication** and **OAuth2 authentication**
- Supports **HTTP / HTTPS / SOCKS5 / SOCKS4** proxies
- Supports multiple recipients
- Uses OpenCode structured logging

## Installation

### Method 1: Local Development

Clone this repository to any directory, install dependencies, and OpenCode will automatically load the plugin from `.opencode/plugins/`:

```bash
git clone https://github.com/your-org/opencode-email-notify.git
cd opencode-email-notify
bun install   # or npm install, to install nodemailer, socks, etc.
```

### Method 2: Install via npm

Add to your `opencode.json`:

```json
{
  "plugin": ["opencode-email-notify"]
}
```

## Configuration

Supports both **configuration files** and **environment variables**. **Environment variables take precedence over configuration files.**

### Configuration File

Configuration files use the JSON with Comments (JSONC) format and support the following locations (project-level overrides global):

- Global: `~/.config/opencode/email-notify.jsonc`
- Project-level: `.opencode/email-notify.jsonc`

Example:

```jsonc
{
  // SMTP settings
  "SMTP_HOST": "smtp.gmail.com",
  "SMTP_PORT": "587",
  "SMTP_USER": "your@gmail.com",
  "SMTP_PASS": "your-app-password",

  // OAuth2 authentication (choose one)
  // "SMTP_OAUTH2_ACCESS_TOKEN": "ya29.xxx",

  // Proxy (optional)
  // "SMTP_PROXY": "socks5://127.0.0.1:1080",

  // Notification settings
  "NOTIFY_TO": "admin@example.com",
  "NOTIFY_FROM": "noreply@example.com",
  "NOTIFY_MIN_INTERVAL_MS": "600000",
  "NOTIFY_DRY_RUN": "false"
}
```

> **Multiple recipients**: Use commas to separate multiple email addresses in `NOTIFY_TO`, e.g. `"admin@example.com,ops@example.com"`.

### Environment Variables

All configuration items can be set via environment variables, **which will override values in configuration files**:

```bash
export SMTP_HOST=smtp.gmail.com
export SMTP_PORT=587
export SMTP_USER=your@gmail.com
export SMTP_PASS=your-app-password
export SMTP_OAUTH2_ACCESS_TOKEN=xxx
export SMTP_PROXY=socks5://127.0.0.1:1080
export NOTIFY_TO=admin@example.com,ops@example.com
export NOTIFY_FROM=noreply@example.com
export NOTIFY_MIN_INTERVAL_MS=600000
export NOTIFY_DRY_RUN=false
```

## Events

Subscribes to the `session.idle` event and sends an email notification when an OpenCode session becomes idle.

The email includes:
- Session title
- Project name
- Working directory
- Trigger time

## Logging

The plugin uses `client.app.log()` for structured logging. You can view initialization, send success/failure, and other information through the OpenCode logging system.

## License

MIT
