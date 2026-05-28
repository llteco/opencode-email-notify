import nodemailer from "nodemailer"
import type SMTPTransport from "nodemailer/lib/smtp-transport"

interface PluginContext {
  project?: { name?: string; path?: string }
  directory: string
  worktree?: string
  client: {
    app: {
      log: (opts: {
        body: {
          service: string
          level: "debug" | "info" | "warn" | "error"
          message: string
          extra?: Record<string, unknown>
        }
      }) => Promise<void>
    }
  }
  $: typeof import("bun").$
}

function parseJsonc(text: string): any {
  text = text.replace(/\/\/.*$/gm, "")
  text = text.replace(/\/\*[\s\S]*?\*\//g, "")
  return JSON.parse(text)
}

async function loadConfig(ctx: PluginContext): Promise<Record<string, string>> {
  const config: Record<string, string> = {}
  const paths: string[] = []

  // 1. Global config
  const home = process.env.HOME || process.env.USERPROFILE
  if (home) {
    paths.push(`${home}/.config/opencode/email-notify.jsonc`)
  }

  // 2. Project config (overrides global)
  paths.push(`${ctx.directory}/.opencode/email-notify.jsonc`)

  for (const path of paths) {
    try {
      const file = Bun.file(path)
      if (await file.exists()) {
        const text = await file.text()
        const parsed = parseJsonc(text)
        if (parsed && typeof parsed === "object") {
          for (const [key, value] of Object.entries(parsed)) {
            if (value !== undefined && value !== null) {
              config[key] = String(value)
            }
          }
        }
      }
    } catch {
      // ignore file read/parse errors
    }
  }

  // 3. Environment variables override everything
  const envKeys = [
    "SMTP_HOST",
    "SMTP_PORT",
    "SMTP_USER",
    "SMTP_PASS",
    "SMTP_OAUTH2_ACCESS_TOKEN",
    "SMTP_PROXY",
    "NOTIFY_TO",
    "NOTIFY_FROM",
    "NOTIFY_MIN_INTERVAL_MS",
    "NOTIFY_DRY_RUN",
  ]
  for (const key of envKeys) {
    const value = process.env[key]
    if (value !== undefined) {
      config[key] = value
    }
  }

  return config
}

function getConfigValue(config: Record<string, string>, key: string): string | undefined {
  return config[key]
}

function parseProxy(
  proxyUrl: string
): { protocol: string; host: string; port: number; auth?: string } | null {
  try {
    const url = new URL(proxyUrl)
    return {
      protocol: url.protocol,
      host: url.hostname,
      port: Number(url.port) || (url.protocol === "http:" ? 80 : 1080),
      auth: url.username ? `${url.username}:${url.password}` : undefined,
    }
  } catch {
    return null
  }
}

function buildMissingConfigMessage(
  host: string | undefined,
  user: string | undefined,
  useOAuth2: boolean,
  usePassword: boolean
): string {
  const missing: string[] = []
  if (!host) missing.push("SMTP_HOST")
  if (!user) missing.push("SMTP_USER")

  if (host && user && !useOAuth2 && !usePassword) {
    return (
      "[opencode-email-notify] 缺少邮件认证凭证。请配置以下其中一种：\n" +
      "  密码认证：SMTP_PASS\n" +
      "  OAuth2：SMTP_OAUTH2_ACCESS_TOKEN"
    )
  }

  if (missing.length > 0) {
    return (
      `[opencode-email-notify] 缺少必要配置：${missing.join(", ")}\n` +
      "请设置环境变量或在配置文件中填写：SMTP_HOST、SMTP_USER，以及认证凭证。"
    )
  }

  return ""
}

async function createTransporter(config: Record<string, string>) {
  const host = getConfigValue(config, "SMTP_HOST")
  const port = Number(getConfigValue(config, "SMTP_PORT") ?? "587")
  const user = getConfigValue(config, "SMTP_USER")
  const pass = getConfigValue(config, "SMTP_PASS")
  const proxyUrl = getConfigValue(config, "SMTP_PROXY")

  const oauth2AccessToken = getConfigValue(config, "SMTP_OAUTH2_ACCESS_TOKEN")

  const useOAuth2 = !!oauth2AccessToken
  const usePassword = !!pass

  const missingMsg = buildMissingConfigMessage(host, user, useOAuth2, usePassword)
  if (missingMsg) {
    throw new Error(missingMsg)
  }

  const transportOpts: SMTPTransport.Options = {
    host: host!,
    port,
    secure: port === 465,
    auth: useOAuth2
      ? {
          type: "OAuth2",
          user: user!,
          accessToken: oauth2AccessToken,
        }
      : { user: user!, pass: pass! },
  }

  if (proxyUrl) {
    const parsed = parseProxy(proxyUrl)
    if (parsed) {
      ;(transportOpts as any).proxy = proxyUrl
    } else {
      throw new Error(
        `[opencode-email-notify] SMTP_PROXY 格式无效: ${proxyUrl}\n` +
          "支持的格式：http://host:port、https://host:port、socks5://host:port"
      )
    }
  }

  return nodemailer.createTransport(transportOpts)
}

function getProjectName(ctx: PluginContext): string {
  if (ctx.project?.name) {
    return ctx.project.name
  }
  const segments = ctx.directory.split(/\//).filter(Boolean)
  return segments[segments.length - 1] || "unknown"
}

export default async function opencodeNotifyPlugin(ctx: PluginContext) {
  const config = await loadConfig(ctx)
  const transporter = await createTransporter(config)

  const notifyTo = getConfigValue(config, "NOTIFY_TO")
  const notifyFrom = getConfigValue(config, "NOTIFY_FROM") || getConfigValue(config, "SMTP_USER")
  const minIntervalMs = Number(getConfigValue(config, "NOTIFY_MIN_INTERVAL_MS") ?? "600000")
  const dryRun = ["true", "1", "yes"].includes(
    getConfigValue(config, "NOTIFY_DRY_RUN")?.toLowerCase() ?? ""
  )

  if (!notifyTo) {
    throw new Error(
      "[opencode-email-notify] 缺少 NOTIFY_TO\n" +
        "请设置环境变量或在配置文件中填写：NOTIFY_TO=admin@example.com"
    )
  }

  let lastSentTime = 0

  await ctx.client.app.log({
    body: {
      service: "opencode-email-notify",
      level: "info",
      message: "Email notify plugin initialized",
      extra: {
        host: getConfigValue(config, "SMTP_HOST"),
        port: getConfigValue(config, "SMTP_PORT"),
        to: notifyTo,
        from: notifyFrom,
        proxy: getConfigValue(config, "SMTP_PROXY"),
        auth: getConfigValue(config, "SMTP_OAUTH2_ACCESS_TOKEN") ? "OAuth2" : "password",
        minIntervalMs,
        dryRun,
      },
    },
  })

  return {
    event: async ({ event }: { event: { type: string } & Record<string, any> }) => {
      if (event?.type !== "session.idle") {
        return
      }

      const now = Date.now()
      const elapsed = now - lastSentTime
      if (elapsed < minIntervalMs) {
        const remaining = Math.ceil((minIntervalMs - elapsed) / 1000)
        await ctx.client.app.log({
          body: {
            service: "opencode-email-notify",
            level: "debug",
            message: "Skipping idle notification due to rate limit",
            extra: {
              elapsedMs: elapsed,
              minIntervalMs,
              remainingSeconds: remaining,
            },
          },
        })
        return
      }

      const projectName = getProjectName(ctx)
      const directory = ctx.directory
      const sessionTitle = event.title || event.session?.title || projectName
      const timestamp = new Date().toLocaleString("zh-CN", {
        timeZone: "Asia/Shanghai",
      })

      try {
        await ctx.client.app.log({
          body: {
            service: "opencode-email-notify",
            level: "debug",
            message: "Sending idle notification email",
            extra: {
              project: projectName,
              sessionTitle,
              eventPayload: event,
              to: notifyTo,
              from: notifyFrom,
            },
          },
        })

        let info: { messageId?: string; response?: string }

        if (dryRun) {
          info = { messageId: "dry-run", response: "skipped" }
          await ctx.client.app.log({
            body: {
              service: "opencode-email-notify",
              level: "info",
              message: "[DRY RUN] Idle notification email skipped",
              extra: {
                project: projectName,
                sessionTitle,
                to: notifyTo,
                from: notifyFrom,
                subject: `[OpenCode] Session idle — ${sessionTitle}`,
              },
            },
          })
        } else {
          info = await transporter.sendMail({
            from: notifyFrom,
            to: notifyTo.split(",").map((s) => s.trim()),
            subject: `[OpenCode] Session idle — ${sessionTitle}`,
            text: `OpenCode session is now idle.

Session: ${sessionTitle}
Project: ${projectName}
Directory: ${directory}
Time: ${timestamp}
`,
            html: `<p>OpenCode session is now idle.</p>
<ul>
  <li><strong>Session:</strong> ${sessionTitle}</li>
  <li><strong>Project:</strong> ${projectName}</li>
  <li><strong>Directory:</strong> ${directory}</li>
  <li><strong>Time:</strong> ${timestamp}</li>
</ul>`,
          })

          await ctx.client.app.log({
            body: {
              service: "opencode-email-notify",
              level: "info",
              message: "Idle notification email sent",
              extra: {
                project: projectName,
                to: notifyTo,
                from: notifyFrom,
                messageId: info.messageId,
                response: info.response,
              },
            },
          })
        }

        lastSentTime = Date.now()
      } catch (err: any) {
        const errorMessage = err?.message || String(err)
        const errorCode = err?.code || "UNKNOWN"
        const errorCommand = err?.command || undefined

        await ctx.client.app.log({
          body: {
            service: "opencode-email-notify",
            level: "error",
            message: `Failed to send idle notification email: ${errorMessage}`,
            extra: {
              code: errorCode,
              command: errorCommand,
              project: projectName,
              to: notifyTo,
              from: notifyFrom,
              smtpHost: getConfigValue(config, "SMTP_HOST"),
              smtpPort: getConfigValue(config, "SMTP_PORT"),
              authType: getConfigValue(config, "SMTP_OAUTH2_ACCESS_TOKEN")
                ? "OAuth2"
                : "password",
            },
          },
        })

        throw new Error(
          `[opencode-email-notify] 邮件发送失败 (${errorCode}): ${errorMessage}\n` +
            `收件人: ${notifyTo}\n` +
            `SMTP: ${getConfigValue(config, "SMTP_HOST")}:${getConfigValue(config, "SMTP_PORT")}\n` +
            `认证方式: ${getConfigValue(config, "SMTP_OAUTH2_ACCESS_TOKEN") ? "OAuth2" : "password"}\n` +
            (errorCommand ? `SMTP 命令: ${errorCommand}` : "")
        )
      }
    },
  }
}
