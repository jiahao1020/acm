# acm — Agent Config Manager

一条命令，把 MCP server 同步到所有 AI 智能体客户端。

## 解决什么问题

同一个 MCP server，在 Claude Desktop、Claude Code、Cursor、Cline、Windsurf 里各要配置一遍，格式还略有差异。改了 key、换了路径，又得挨个改。

`acm` 让你只写一次：

```bash
acm mcp add filesystem npx -y @modelcontextprotocol/server-filesystem ~/projects
```

十四个客户端的配置文件同时更新。

## 安装

需要 Node.js 22.12 或更高版本（chalk 6、commander 15、@clack/prompts 等依赖仅提供 ESM，通过 `require` 加载需要该版本以上）。

```bash
# 从本地仓库构建并全局安装
npm install && npm run build && npm install -g .

# 或不安装，直接运行构建产物
node dist/index.js init
```

> Windows 上 `npm install -g .` 需要 Developer Mode 已开启，或以管理员身份运行终端——否则 npm 无法创建 `acm` 命令的 shim（会报 `EPERM` / `operation not permitted`）。不想改全局状态就直接用 `node dist/index.js`。

## 快速开始

```bash
# 1. 扫描本机装了哪些客户端，选择要管理的
acm init

# 2. 看看当前各客户端的 MCP 配置
acm mcp list

# 3. 添加一个 MCP server（stdio）
acm mcp add filesystem npx -y @modelcontextprotocol/server-filesystem ~/projects

# 4. 添加一个远程 MCP server
acm mcp add sentry --url https://mcp.sentry.dev/mcp

# 5. 只加到指定客户端
acm mcp add playwright npx -y @playwright/mcp --client cursor,claude-code

# 6. 带环境变量和自定义工作目录
acm mcp add brave -e BRAVE_API_KEY=sk-xxx --cwd ~/work -- npx -y @modelcontextprotocol/server-brave-search

# 7. 删除
acm mcp remove filesystem

# 8. 检查各客户端配置是否一致，一键补齐差异
acm mcp sync
```

## 日常使用

上面是「怎么下命令」，这里是「实际怎么用」。多数人只需要记住一件事：**先看，再改**。

### 三条只读命令，先摸清现状

刚接触这个项目（或换了一台机器）时先跑这三条，它们**不写任何文件**：

```bash
acm mcp list                    # 所有 server 在哪些客户端有、哪些缺
acm skill list                  # 技能分布，含被隐藏的自带技能计数
acm mcp sync --dry-run          # 差异计划，不落盘
```

### 改任何东西之前先 `--dry-run`

`mcp add` / `mcp remove` / `mcp sync` / `key apply` / `skill remove` 都支持 `--dry-run`：

```bash
acm mcp add foo npx -y pkg --dry-run   # 只打印会改哪些客户端，不写文件
acm mcp remove foo --dry-run           # 只打印将删除的路径
```

干跑的输出用 `→` 而不是 `✓`，因为**什么都没发生**——不会夸大实际结果。

`skill sync` 和 `skill install` **没有** `--dry-run`：它们会先列出计划并要求确认，等价于干跑；加 `-y` 则跳过确认直接执行。

### 收窄作用范围的习惯

不带 `--client` 时，命令会作用于 `acm init` 选中的**全部**客户端。日常操作建议显式指定：

```bash
acm mcp add foo npx -y pkg --client claude-code,workbuddy
```

这样即使某个客户端的 schema 存不下你要的字段，影响面也可控。

### 三个「会报错」的情况，都是故意的

| 输入 | 行为 | 为什么 |
|------|------|--------|
| 同名 server 但内容不同 | 拒绝覆盖，退出码 1，要求 `--force` | 防止误改你已有的配置 |
| `--client cursro`（拼错） | 报错并列出可用 id | 拼错不能静默变成「全部客户端」 |
| `--client ,,,`（空值） | 报错 | 空列表 ≠ 全部，避免作用范围被放大 |

### 已知的行为差异

`mcp sync` 遇到某个客户端配置损坏时**整体中止**（一个字节都不写）；而 `mcp remove` 是**部分成功**——健康的客户端照常删除，坏掉的那个计入失败并把退出码置 1。两者都有测试钉住，改动任一方都会立刻失败。

### 退出码

脚本里可以依赖退出码判断结果：`0` = 全部成功；`1` = 有冲突、有失败项，或客户端配置不可读。`--dry-run` 下若预测到冲突/失败同样返回 `1`。

## 命令参考

| 命令 | 说明 |
|------|------|
| `acm init` | 检测已安装客户端，选择要管理的 |
| `acm mcp list` | 以矩阵形式展示所有 server 在各客户端的配置情况 |
| `acm mcp add <name> [command...]` | 添加 server（stdio 或 `--url` 远程） |
| `acm mcp remove <name>` | 删除 server |
| `acm mcp sync` | 展示差异并可选择补齐 |
| `acm key set-gateway <url>` | 配置 API 网关地址和 key |
| `acm key apply` | 把网关配置写入各客户端 |
| `acm key list` | 查看网关配置和各客户端同步状态 |
| `acm key clear` | 清除 acm 存储的网关配置 |
| `acm skill list` | 查看各客户端技能数量和跨客户端差异 |
| `acm skill sync` | 把技能复制到缺失的客户端 |
| `acm skill install <source>` | 从本地目录或 git 仓库安装技能 |
| `acm skill remove <name>` | 从客户端删除技能 |

`add` 的选项：

| 选项 | 说明 |
|------|------|
| `--url <url>` | 远程 MCP server 地址（替代 command） |
| `--client <ids>` | 只写入指定客户端，逗号分隔 |
| `--cwd <dir>` | server 进程的工作目录 |
| `-e, --env <KEY=VALUE>` | 环境变量，可重复 |
| `--force` | 目标客户端已有同名 server 且配置不同时，覆盖它 |
| `--dry-run` | 只预览将发生的改动，不写任何文件 |

以上选项都支持 `--flag value` 和 `--flag=value` 两种写法。若目标客户端已有同名 server：配置完全相同则跳过并提示「已是最新」；配置不同则**默认拒绝覆盖并要求显式 `--force`**，以免误改已有配置。`remove` 和 `sync` 同样支持 `--dry-run`。

`sync` 的选项：`-y, --yes` 跳过交互确认，直接补齐（适合脚本/CI）；`--dry-run` 只展示将推送到哪些客户端。

`--client` 传了不存在的 id 时会直接报错并列出可用 id，而不会被静默忽略。`--client` 传了空值（如 `--client ,,,`）同样报错——它会选中零个客户端，而不是被当成「全部」，避免命令的作用范围被悄悄放大。

## 支持的客户端

共 15 个。

| 客户端 | 配置文件 |
|--------|---------|
| Claude Desktop | `%APPDATA%\Claude\claude_desktop_config.json` |
| Claude Code | `~/.claude.json` 与 `~/.claude/mcp.json`（两者同步维护） |
| Cursor | `~/.cursor/mcp.json` |
| Cline | VS Code globalStorage 下的 `cline_mcp_settings.json` |
| Windsurf | `~/.codeium/windsurf/mcp.json` |
| Workbuddy | `~/.workbuddy/mcp.json` |
| Codex | `~/.codex/config.toml`（TOML 格式） |
| Hermes | 应用数据目录下的 `hermes/config.yaml` 的 `mcp_servers` 键（YAML 格式） |
| ZCode | `~/.zcode/cli/config.json` 的 `mcp.servers` 键 |
| OpenCode | `~/.config/opencode/opencode.json`（非标准格式，见下） |
| QwenCode | `~/.qwen/settings.json` |
| Trae | `~/.trae/settings.json` |
| Roo | `~/.roo/settings.json` |
| Kiro | `~/.kiro/settings.json` |
| CodeBuddy | `~/.codebuddy/mcp.json` |

macOS 和 Linux 使用对应的标准路径，工具会自动适配。

Hermes 的位置与其他客户端不同：它的数据目录不在 `$HOME` 下，而在平台的应用数据目录（Windows 为 `%LOCALAPPDATA%\hermes`，macOS 为 `~/Library/Application Support/hermes`，Linux 为 `~/.local/share/hermes`）。

各客户端的存储格式差异很大，acm 会各自翻译，你只写一次：

| 客户端 | 顶层键 | 命令写法 | 环境变量 | 开关 |
|--------|--------|---------|---------|------|
| 大多数客户端 | `mcpServers` | `command` + `args` 分开 | `env` | `disabled` |
| Codex | `mcp_servers`（TOML） | `command` + `args` 分开 | `env` | — |
| Hermes | `mcp_servers`（YAML） | `command` + `args` 分开 | `env` | `enabled`（语义相反） |
| ZCode | 嵌套 `mcp.servers` | `command` + `args` 分开 | `env` | `disabled` |
| OpenCode | 嵌套 `mcp` | `command` 是**单个数组** | `environment` | `enabled`（语义相反） |

OpenCode 的格式与其他所有客户端都不同，acm 会在读写时自动转换。CodeBuddy 的配置文件里可能有 `//` 注释，也能正确解析。

### 字段支持与告警

各客户端的 schema 宽窄不一——多数 JSON 客户端根本没有 `cwd` 这个键。acm 不会把写不进去的字段悄悄丢掉，而是在写入后明确标出：

```
  ✓ Workbuddy
      ⚠ ignores cwd — not stored by this client
```

| 字段 | 支持的客户端 |
|------|-------------|
| `env` | 全部 |
| `cwd` | Codex、ZCode |
| `headers` | Codex、OpenCode、ZCode |
| `disabled` | Cline、CodeBuddy、Codex、OpenCode、ZCode |

写入时 acm 会**按条目合并**已有配置，而不是整块替换：你手写的客户端私有键（如 Codex 的 `startup_timeout_ms`、Cursor 的自定义字段）在 acm 改写该文件后依然保留；`env` 和 `headers` 更是逐键合并，不会覆盖你已有的变量。

## 安全设计

写配置文件前会自动备份为 `.bak`，并采用「写临时文件 + 原子重命名」的方式，避免写到一半损坏原文件。临时文件名带随机后缀，并发运行多个 acm 实例不会互相踩踏。各客户端的非 MCP 配置项（如 Claude Desktop 的 `globalShortcut`、Codex 的 `model`、ZCode 的 `storage`、OpenCode 的 `$schema`）会被完整保留。

配置文件存在但无法解析（JSON/JSON5/TOML 语法错误）时，acm 会**报错并保持原文件不动**，绝不会当成空配置覆盖掉——那正是会丢失 `storage`、`theme` 这类无关配置的路径。多个客户端中只要有一个配置文件坏了，`list` 不会整体中断：其余客户端的 server 照常展示，坏掉的那个标为 `config unreadable`（而不是误导性的 `not configured`），并以非零退出码提示。目标文件被客户端占用时会提示「关闭该客户端后重试」，而不是抛出裸的 `EPERM`。读取/写入单个客户端失败不会中断其余客户端，最终以非零退出码提示有失败项。

读取配置时容忍 JSON5 语法（注释、尾逗号），因为部分客户端实际会写这类内容。Codex 的 TOML 配置同样只在能成功解析时才写回。

所有命令输出中的 API key 均以掩码显示（`…1234`），完整 key 仅存储于本地 `~/.acm/config.json`；该文件在 macOS/Linux 上写入时会设置为 `0600`（仅属主可读写）。

## API 网关管理（Omniroute 集成）

> 这一节覆盖的是可选能力。只有当你确实在跑 Omniroute（或某个 OpenAI 兼容网关）时才有意义——它不属于 MCP / 技能那样的日常路径。跳过本节不影响其他功能。

通过 Omniroute（或任意 OpenAI 兼容网关）统一 API 接入，一条命令把网关地址和 key 分发到所有支持的客户端：

```bash
# 1. 配置网关
acm key set-gateway http://localhost:3456/v1 --key sk-your-key

# 2. 写入各客户端
acm key apply

# 3. 查看同步状态
acm key list
```

支持文件化 API 配置的客户端（3 个）：

| 客户端 | 配置位置 | 写入方式 |
|--------|---------|---------|
| Claude Code | `~/.claude/config.json` | 替换 `api.base_url` + `api.api_key` |
| ZCode | `~/.zcode/v2/config.json` | 新增 provider 段（`kind: openai-compatible`） |
| OpenCode | `~/.config/opencode/opencode.json` | 新增 provider 段（`npm: @ai-sdk/openai-compatible`） |

其余客户端（Cursor、Cline、Windsurf、Codex 等）的 API 配置走 UI 设置或环境变量，无法通过文件写入——`acm key list` 会说明这一点。

`acm key apply --dry-run` 可预览改动而不写入。`acm key apply --client zcode` 可只写指定客户端。`acm key set-gateway` 的 `--name` 参数可自定义在 ZCode/OpenCode 中的 provider 名称（默认 `omniroute`）。

key 也可以从环境变量读取，避免留在 shell 历史里：`ACM_GATEWAY_KEY=sk-xxx acm key set-gateway <url>`（`--key` 的优先级更高）。

## 技能管理（Agent Skills）

技能（SKILL.md 文件夹）在所有客户端里结构一致，所以 acm 直接做文件夹分发：

```bash
# 1. 查看各客户端的技能数量和差异
acm skill list

# 2. 把技能复制到缺失的客户端（会先列出计划并确认）
acm skill sync

# 3. 从本地目录安装
acm skill install ~/my-skills/code-review

# 4. 从 git 仓库安装
acm skill install https://github.com/user/my-skill-repo

# 5. 删除技能
acm skill remove code-review

# 6. 某个技能在多个客户端里内容不一致时，列出并用来源客户端覆盖较旧的副本
acm skill sync --update --from claude-code
```

支持的客户端（12 个）及技能目录：

| 客户端 | 技能目录 |
|--------|---------|
| Claude Code | `~/.claude/skills/` |
| ZCode | `~/.zcode/skills/` + `~/.agents/skills/` |
| OpenCode | `~/.config/opencode/skills/` |
| Workbuddy | `~/.workbuddy/skills/` |
| CodeBuddy | `~/.codebuddy/skills-marketplace/skills/` |
| Codex | `~/.codex/skills/` |
| Hermes | 应用数据目录下的 `hermes/skills/<分类>/<技能>/` |
| Windsurf | `~/.codeium/windsurf/skills/` |
| QwenCode | `~/.qwen/skills/` |
| Trae | `~/.trae/skills/` |
| Roo | `~/.roo/skills/` |
| Kiro | `~/.kiro/skills/` |

目录不存在时按需创建。技能文件夹内的所有内容（`references/`、`scripts/`、客户端私有元数据如 `workbuddy.json`）都会原样复制。

**Hermes 的技能目录多一层分类**：其他客户端是 `<根>/<技能>/SKILL.md`，Hermes 是 `<根>/<分类>/<技能>/SKILL.md`（如 `skills/srm-business/pangu-prod-data-fix/`）。acm 会递归一层去发现技能，安装时放进已有副本所在的分类；全新的技能则放在分类根部。删除技能只删技能目录本身，不会动分类目录。

**Hermes 自带的技能默认不参与对比**：Hermes 会把自己的技能目录（实测 113 个，分布在 19 个分类下）和你的技能放在同一个根目录里，其中只有 14 个是你自己的。若全部纳入对比，其他每个客户端都会显示「缺失约 100 个技能」，把真正的问题淹没。acm 逐个技能判定归属，只把属于自己的那些纳入 `list`/`sync`。

判定采用「有证据才算你的」，按以下顺序检查，命中任一即为你的技能：

| 顺序 | 依据 | 说明 |
| --- | --- | --- |
| 1 | 分类在 `USER_CATEGORIES` 内（默认 `srm-business`） | 最强信号，压过其他一切 |
| 2 | 目录含 `_user_meta.json` | Hermes 导入时写入；acm 安装时也会补写 |
| 3 | 目录含 `_skillhub_meta.json` | 市场安装，用户主动选的 |
| 4 | `SKILL.md` frontmatter 有 `agent_created: true` | agent 代建的技能 |

以上都不满足 → 判为自带。这个不对称是刻意的：漏掉一个自带技能只是少显示一行；误判一个自带技能为你的技能，则会让**所有**客户端看起来都缺东西。

判定**不读 `.bundled_manifest`**。那个文件是某个 Hermes 版本的快照（实测它收录 58 个名字，而磁盘上有 113 个技能、还有 1 个名字已不存在），既覆盖不全，又会在重装技能后继续把技能藏起来——名字没变但技能已经是你自己的了。同理，分类必须优先于元数据判定，否则你放进 `srm-business/` 却没有任何元数据的技能（如 `srm-buried-point`）会被误判成自带。

`acm skill list` 的计数会显式标出被隐藏的数量：

```
  Hermes       14 skills  (+99 bundled, hidden) C:\Users\57733\AppData\Local\hermes\skills
```

加 `--include-bundled` 可临时把自带技能也纳入对比（只读，不写任何东西）。`sync` 没有这个开关——它是写路径，自带技能绝不能被复制到别的客户端。

acm 自己安装技能时会补写 `_user_meta.json`（即 `markUserOwned`），否则刚装进去的技能会立刻被判为自带而消失。若源技能已有该文件则原样保留，不覆盖。

**符号链接会被解引用**：某些客户端的技能目录用符号链接指向插件仓库（如 `~/.agents/skills`），acm 复制时会把链接展开成真实文件，保证副本独立可用。

**技能名以文件夹名为准**，因为 `list` / `sync` / `remove` 以及客户端自身的发现逻辑都用文件夹名。`--name` 可显式指定；只有当我们刚 clone 出来的临时目录本身就是技能时（仓库根目录即技能），文件夹名没有意义，才退回使用 SKILL.md 声明的 `name`，其次用仓库名。若 SKILL.md 声明的名字与文件夹名不一致，安装时会提示并给出跟随声明的命令。技能名不允许为空、为 `.` / `..` 或含路径分隔符——`install` 与 `remove` 都会拒绝，避免写到技能根目录之外。

**`list` 不只看名字，也比内容**（对每个技能目录取内容摘要）：同名但内容不同的技能会单独列出，并按版本分组显示各客户端。`sync` 默认只补齐缺失的技能；遇到同名不同内容会列出并返回非零退出码，**加 `--update` 才会用来源客户端的版本覆盖较旧的副本**（覆盖前明确提示，来源可用 `--from` 指定）。

`sync` 的选项：`-y` 跳过确认，`--client <ids>` 限定目标，`--from <ids>` 限定来源，`--update` 覆盖同名但内容不同的副本。`install` 的选项：`--name <name>` 指定技能名（多技能仓库必需），`--force` 覆盖已存在的同名技能，`--client <ids>` 限定目标。`remove` 的选项：`--dry-run` 预览将删除的路径，`-y` 跳过确认。

为避免污染，**技能市场类目录（CodeBuddy 的 295 个市场技能）整体默认不参与差异对比和同步**，需要时用 `--all` 或 `--from codebuddy` 显式纳入。这与 Hermes 的逐技能过滤是两种机制：CodeBuddy 的市场技能独占一个根目录，可以整个目录排除；Hermes 的自带技能和你的技能混在同一个根目录里，只能逐个判定。

## 开发

```bash
npm install
npm run build      # 构建到 dist/
npm run typecheck  # 全量类型检查（tsc --noEmit）
npm test           # 先类型检查，再运行单元测试
npm run test:e2e   # 端到端：先构建，再用真实 dist/index.js 跑一遍主链路
npm run test:all   # 单元测试 + 端到端
npm run dev        # 监听模式
```

测试覆盖三类容易出问题的地方：纯函数（参数解析、客户端筛选、技能命名与内容摘要），各客户端的配置往返（读 → 改 → 写，断言无关配置项没有丢失），以及技能目录的安装/删除边界（拒绝会逃出技能根目录的名字）。

### 端到端测试

单元测试都是**进程内函数调用**，覆盖不到只有打包之后才存在的东西：tsup 产物能不能解析依赖、构建时注入的版本号有没有落地、commander 和手写的 `parseAddArgs` 会不会打架、以及脚本和 CI 依赖的退出码。而 acm 的全部职责就是改写别的应用的配置文件，最要命的两个事故——往配置里写进 `undefined`、把整个文件覆盖式重写——在单元测试里看不出来，在真实的文件 diff 里一眼就能看见。

所以 `test:e2e` 会 spawn 真实子进程跑 `dist/index.js`，主链路六步：

1. `add` 写入后，各客户端按自己的格式（JSON / TOML / YAML / OpenCode 嵌套）都能读到；
2. 重复 `add` 同一个条目必须是 `unchanged`，且**文件字节不变**；
3. `list` 能从每个客户端读回来，缺失的显示为“未配置”而非省略；
4. 某个客户端配置损坏时，`list` 报 `config unreadable` 但仍列出其余客户端；`sync` 直接拒绝运行而不是基于残缺视图做同步；
5. `remove` 删掉目标条目，**邻居条目原封不动**；
6. 全流程跑完后逐文件比对初始快照，只允许 acm 声明过的那些文件发生变化。

夹具由 `scripts/make-sandbox.js` 生成：一个临时目录冒充 `$HOME`（`HOME` / `USERPROFILE` / `LOCALAPPDATA` / `APPDATA` 四个变量一起指过去），里面造出若干客户端的配置——**故意不是干净的**，每个文件都带着与 MCP 无关的设置，因为“这些设置有没有活下来”正是要断言的东西。脚本同时输出每个文件的 sha256 快照，第 6 步就是拿它来比。

这个脚本也可以**手工跑**，用来手动试命令而不碰你自己的配置：

```bash
# 造一个假 HOME（含 MCP 配置和技能树），最后打印路径与文件快照
node scripts/make-sandbox.js --out /tmp/acm-sandbox --mcp

# 然后指过去运行，随便折腾
HOME=/tmp/acm-sandbox/home USERPROFILE=/tmp/acm-sandbox/home \
  node dist/index.js mcp list
```

不带 `--out` 时仍写到仓库内的 `.sandbox/`（已被 gitignore），不带 `--mcp` 时只造技能树——这是 E2E 出现之前就有的默认行为，保持不变。

## 后续规划

- 项目级配置（`.mcp.json` / `.cursor/mcp.json` / 项目内 `.zcode/skills`）支持
- API key 轮换和 Omniroute 用量查询（`acm key rotate` / `acm key status`）
- 技能市场浏览与版本更新（`acm skill search` / `acm skill update`）
