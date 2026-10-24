# Flowix 接入：WebGUI 改造背景与待办

> 本文档只描述背景与待办，不包含代码改动。
> 关联仓库：`/code/outer/fast-note-sync-webgui`（前端源码）、`/code/outer/fast-note-sync-service`（Go 服务端 + 构建产物）

## 背景

Flowix 桌面端已经接入 Fast Note Sync Service，作为笔记与附件的同步后端：

- 客户端实现：`flowix/app/flowix-fns`（Rust）
- 绑定模型：一个笔记本绑定一个 token 和一个 vault
- 客户端 `clientType` 固定为 `flowix`
- 服务端 token 的 scope 需要满足 `p:rest,ws c:flowix f:*`

当前 WebGUI 创建令牌时，“客户端维度”是自由输入框，placeholder 只写了 `ObsidianPlugin`，
用户很容易把它填成 `obsidianPlugin`，再配 Flowix 客户端就会得到 315：

```
NoteSyncAck 315 Auth token Scope restricted
Vault access restricted: <vault>
```

服务端本身不限制客户端类型，只是对 scope 里的 `c:` 做字符串匹配，所以问题完全在前端引导。

## 当前实现（关键位置）

文件：`src/components/user/token-manager.tsx`

| 内容 | 位置 |
|---|---|
| 表单状态 | 124-126 行：`newClientType`（备注名，默认 `"Other"`）、`newProtocols`（默认 `rest,ws`）、`newClientDim`（scope c:，默认 `*`） |
| 编辑时解析 scope | 235-247 行：从 `p:` / `c:` / `f:` 还原字段 |
| 提交 | 278-322 行 `onSubmitToken`：调用 `handleCreateToken` / `handleUpdateToken` |
| 关闭重置 | 334-348 行 |
| 备注名输入 | 525-531 行 |
| 客户端维度输入 | 543-550 行（自由 Input，placeholder `e.g. ObsidianPlugin, *`） |
| 协议复选框 | 557-575 行 |
| 功能限制 | 595 行以后 |
| i18n | `src/i18n/locales/{zh-CN,en,ja,ko,zh-TW}.ts` |

提交时字段映射：

```
clientType  → auth_token.client_type   （仅备注/标识）
protocol    → scope p:
client      → scope c:                 （Flowix 需要 flowix 或 *）
function    → scope f:
vaults      → auth_token.vaults        （逗号分隔，留空表示不限）
```

## 待办

### P0 — 让 Web 端能正确生成 Flowix 令牌

- [ ] **客户端维度加预设**
  - 在 `newClientDim` 输入框上方增加预设按钮或下拉：`Flowix` / `Obsidian 插件` / `任意 (*)` / 自定义
  - 选择预设时写入 `newClientDim`
- [ ] **预设联动**
  - 选择 `flowix` 或 `obsidianPlugin` 时自动勾选 `rest` + `ws`
  - 备注名仍为默认 `Other` 时，自动填成 `Flowix` / `Obsidian`
  - 作用范围：创建和编辑两个模式
- [ ] **提示文案**
  - 客户端维度旁说明：“Flowix 客户端需要使用 `flowix`（或 `*`）”
  - Vault 限制旁说明：“留空表示不限制；Flowix 每个笔记本绑定一个 vault”
- [ ] **i18n**
  - 新增 `ui.token.presetFlowix`、`ui.token.presetObsidian`、`ui.token.presetAny`、
    `ui.token.flowixHint`，至少补齐 `zh-CN` 与 `en`

### P1 — 降低误配概率

- [ ] 令牌列表展示 scope 里的 `c:` 维度，而不是只展示备注名（当前 856-861 行显示 `token.clientType`）
- [ ] 创建/编辑时校验备注名与客户端维度不同，避免把备注名误当成权限维度
- [ ] `vaults` 输入做基本校验：逗号分隔、去除空白、非空项
- [ ] 轮换令牌时保留原 scope（当前轮换逻辑需要确认是否复用 `client`）

### P2 — 可选增强

- [ ] “一键创建 Flowix 令牌”：固定 `protocol=rest,ws`、`client=flowix`、`function=*`，只让用户填备注名与 vault
- [ ] 创建成功后提供“复制 Flowix 配置”按钮，输出：
  ```json
  { "api": "https://…", "apiToken": "…", "vault": "…" }
  ```
- [ ] 在 WebGUI 的令牌详情里显示完整 scope，便于排查 315

## 构建与替换产物

WebGUI 构建产物需要复制到 service 仓库的 `frontend/`，因为 Go 通过 `//go:embed frontend` 打包。

`package.json` 里已有脚本：

```json
"build": "tsc && vite build",
"dist": "npx tsx scripts/copy-dist.ts"
```

`scripts/copy-dist.ts` 会读取 `.env` 里的 `DIST_PATH_WIN` / `DIST_PATH_MAC`，
清空目标目录后复制 `dist/`。脚本只区分 `win` 与非 `win` 两种目标，**在 WSL/Linux 下请使用 `mac` 这个 key**。

`.env` 示例（放在 webgui 根目录，不要提交）：

```ini
DIST_PATH_MAC=/code/outer/fast-note-sync-service/frontend
DIST_PATH_WIN=C:/Code/outer/fast-note-sync-service/frontend
```

命令（WSL）：

```bash
cd /code/outer/fast-note-sync-webgui
pnpm install
pnpm build
pnpm dist mac        # 非 Windows 目标；指向 DIST_PATH_MAC

cd /code/outer/fast-note-sync-service
go build ./...
```

## 验证清单

- [ ] 创建令牌时选择 `Flowix`，服务端返回的 `scope` 为 `p:rest,ws c:flowix f:*`
- [ ] 备注名默认变为 `Flowix`，协议自动勾选 `rest` + `ws`
- [ ] `vaults` 填中文 vault 名后，响应中的 `vaults` 与输入一致（UTF-8 未损坏）
- [ ] Flowix 客户端绑定该令牌与对应 vault，`NoteSync` 返回 `code=1`
- [ ] 用 `obsidianPlugin` 令牌配 Flowix 客户端时，客户端显示明确的 315 提示（不是卡住）
- [ ] 编辑已有令牌时，预设能根据当前 `c:` 维度正确高亮

## 相关代码位置

| 内容 | 位置 |
|---|---|
| 令牌创建表单 | `src/components/user/token-manager.tsx` |
| 令牌 API 封装 | `src/components/api-handle/token-handle.ts` |
| 服务端令牌签发 | `/code/outer/fast-note-sync-service/internal/service/token_service.go` |
| Scope 解析与校验 | `/code/outer/fast-note-sync-service/pkg/app/permission.go` |
| Vault 白名单校验 | `/code/outer/fast-note-sync-service/pkg/util/vault_access.go` |
| WS 权限拦截 | `/code/outer/fast-note-sync-service/internal/routers/websocket_router/interceptor.go` |
| Flowix 客户端 | `flowix/app/flowix-fns` |
