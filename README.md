# AgentKanban

AgentKanban 是一个基于 React + Vite + Rust + Tauri 的本地 AI 任务看板。

当前仓库同时支持两种运行形态：

- 桌面版：Tauri 桌面应用
- 网页版：Axum 后端 + Vite 前端，或通过 Docker Compose 启动前后端

## 1. 环境要求

### 通用要求

- Node.js 20+
- pnpm 10+
- Rust stable，建议使用 MSVC toolchain

安装依赖：

```bash
pnpm install
```

### Windows 下桌面版额外要求

Tauri 在 Windows 下还需要：

- Microsoft C++ Build Tools
- Visual Studio Installer 中的 `Desktop development with C++`
- Microsoft Edge WebView2 Runtime

如果你的系统是较新的 Windows 10 / Windows 11，通常已经自带 WebView2。

建议确认 Rust 使用的是 MSVC toolchain：

```bash
rustup default stable-x86_64-pc-windows-msvc
```

## 2. 安装依赖

首次进入项目后执行：

```bash
pnpm install
```

如果还没有 Rust：

```bash
rustup show
```

## 3. 桌面版如何启动

### 开发模式启动

项目已经封装了 Tauri 命令，直接运行：

```bash
pnpm tauri dev
```

这个命令会：

- 启动 Vite 开发服务器，默认端口 `5173`
- 编译并启动 Tauri 桌面应用

说明：

- 仓库中的 `scripts/tauri-wrapper.mjs` 会在 Windows 下自动补上 `~/.cargo/bin`，避免 VS Code 终端里找不到 `cargo`
- 前端开发地址来自 `src-tauri/tauri.conf.json` 中的 `http://localhost:5173`

### 不打包只构建桌面可执行文件

如果你只想先验证桌面版能否编译，不生成安装包，可以执行：

```bash
pnpm tauri build --debug --no-bundle
```

或发布模式：

```bash
pnpm tauri build --no-bundle
```

常见产物位置：

- Debug 可执行文件：`src-tauri/target/debug/app.exe`
- Release 可执行文件：`src-tauri/target/release/app.exe`

## 4. 桌面版如何打包

### 生成正式安装包

执行：

```bash
pnpm tauri build
```

这个命令会先执行前端构建，再由 Tauri 进行桌面打包。

当前配置来自 `src-tauri/tauri.conf.json`：

- `beforeBuildCommand`: `pnpm build`
- `frontendDist`: `../dist`
- `bundle.targets`: `all`

通常打包产物会出现在 `src-tauri/target/release/bundle/` 目录下，里面会包含当前平台对应的安装包或分发文件。

### 仅构建前端静态资源

如果只是想确认前端生产构建是否正常：

```bash
pnpm build
```

构建结果输出到：

```text
dist/
```

## 5. 网页版如何启动

网页版有两种启动方式：

- 本地开发模式：前后端分开启动
- Docker Compose：一次性启动前后端容器

### 方式 A：本地开发模式

#### 启动后端

```bash
pnpm dev:server
```

等价于：

```bash
cargo run -p agentkanban-server
```

后端默认监听：

```text
http://127.0.0.1:5577
```

端口可通过环境变量覆盖：

```bash
$env:AGENTKANBAN_SERVER_PORT=5578
pnpm dev:server
```

#### 启动前端

另开一个终端执行：

```bash
pnpm dev
```

前端默认地址：

```text
http://127.0.0.1:5173
```

浏览器访问该地址即可。

#### 一条命令同时启动前后端开发服务

项目已经提供了合并脚本：

```bash
pnpm dev:axum
```

这个脚本会同时启动：

- Rust 后端 `agentkanban-server`
- Vite 前端开发服务

适合本地联调。

### 方式 B：Docker Compose 启动前后端

执行：

```bash
docker compose up --build
```

启动后：

- 前端地址：`http://127.0.0.1:8080`
- 后端地址：`http://127.0.0.1:5577`

Compose 中包含三个服务：

- `backend`: Rust + Axum 服务
- `frontend`: Nginx 托管前端静态文件
- `e2e`: 用于 Playwright 冒烟测试，不是日常开发必须启动的服务

如果你只想启动前后端，不跑 e2e，可以直接使用上面的 `docker compose up --build`，默认只会启动 `backend` 和 `frontend`。

## 6. 数据目录与环境变量

后端默认会把本地数据写入用户目录下：

```text
~/.aitask
```

Windows 下通常对应：

```text
C:\Users\<你的用户名>\.aitask
```

可通过环境变量修改：

```bash
$env:AGENTKANBAN_STORAGE_ROOT="D:\agentkanban-data"
pnpm dev:server
```

常用环境变量：

- `AGENTKANBAN_SERVER_PORT`：后端端口，默认 `5577`
- `AGENTKANBAN_STORAGE_ROOT`：本地存储根目录，默认 `~/.aitask`
- `AGENTKANBAN_VITE_PORT`：`pnpm dev:axum` 启动的 Vite 端口，默认 `5173`

## 7. 常用命令速查

```bash
# 安装依赖
pnpm install

# 前端开发
pnpm dev

# 后端开发
pnpm dev:server

# 同时启动前后端
pnpm dev:axum

# 桌面版开发
pnpm tauri dev

# 前端生产构建
pnpm build

# 桌面版打包
pnpm tauri build

# 单元测试
pnpm test

# Rust 测试
cargo test
```

## 8. 常见问题

### `pnpm tauri dev` 或 `pnpm tauri build` 找不到 `cargo`

这个仓库已经通过 `scripts/tauri-wrapper.mjs` 处理了大部分 Windows 场景。如果仍然报错，先确认：

```bash
cargo --version
rustup --version
```

并确保 `C:\Users\<你的用户名>\.cargo\bin` 在 `PATH` 中。

### 桌面版打包太慢或先想验证是否能编译

先用：

```bash
pnpm tauri build --debug --no-bundle
```

这样只生成可执行文件，不生成安装包，排错更快。

### 网页版前端打不开，但后端已经启动

先确认你是否启动了前端：

```bash
pnpm dev
```

或者直接用：

```bash
pnpm dev:axum
```

## 9. 推荐启动方式

如果你的目标是：

- 开发桌面版：使用 `pnpm tauri dev`
- 开发网页版联调：使用 `pnpm dev:axum`
- 打正式桌面包：使用 `pnpm tauri build`
- 起容器化网页环境：使用 `docker compose up --build`