# opencode-email-notify

[EN](README.md) | 中文

OpenCode 插件，监听 `session.idle` 事件并发送邮件通知。

## 功能

- 支持 **SMTP 密码认证** 和 **OAuth2 授权码认证**
- 支持 **HTTP / HTTPS / SOCKS5 / SOCKS4** 代理
- 支持多个收件人
- 使用 OpenCode 结构化日志记录

## 安装

### 方式一：本地调试（开发）

将本仓库克隆到任意目录，先在根目录安装依赖，OpenCode 会自动加载 `.opencode/plugins/` 下的插件：

```bash
git clone https://github.com/your-org/opencode-email-notify.git
cd opencode-email-notify
bun install   # 或 npm install，安装 nodemailer、socks 等依赖
```

### 方式二：通过 npm 安装

在 `opencode.json` 中添加：

```json
{
  "plugin": ["opencode-email-notify"]
}
```

## 配置

支持 **配置文件** 和 **环境变量** 两种方式，**环境变量优先级高于配置文件**。

### 配置文件

配置文件使用 JSON with Comments (JSONC) 格式，支持以下两个位置（项目级覆盖全局）：

- 全局：`~/.config/opencode/email-notify.jsonc`
- 项目级：`.opencode/email-notify.jsonc`

示例：

```jsonc
{
  // SMTP 配置
  "SMTP_HOST": "smtp.gmail.com",
  "SMTP_PORT": "587",
  "SMTP_USER": "your@gmail.com",
  "SMTP_PASS": "your-app-password",

  // OAuth2 认证（二选一）
  // "SMTP_OAUTH2_ACCESS_TOKEN": "ya29.xxx",

  // 代理（可选）
  // "SMTP_PROXY": "socks5://127.0.0.1:1080",

  // 通知配置
  "NOTIFY_TO": "admin@example.com",
  "NOTIFY_FROM": "noreply@example.com",
  "NOTIFY_MIN_INTERVAL_MS": "600000",
  "NOTIFY_DRY_RUN": "false"
}
```

> **多收件人**：`NOTIFY_TO` 中可用逗号分隔多个邮箱，如 `"admin@example.com,ops@example.com"`。

### 环境变量

所有配置项都支持通过环境变量设置，**会覆盖配置文件中的同名配置**：

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

## 事件

订阅 `session.idle` 事件，当 OpenCode 会话进入空闲状态时发送邮件通知。

邮件内容包含：
- 项目名称
- 工作目录
- 触发时间

## 日志

插件使用 `client.app.log()` 输出结构化日志，可通过 OpenCode 日志系统查看初始化、发送成功/失败等信息。

## License

MIT
