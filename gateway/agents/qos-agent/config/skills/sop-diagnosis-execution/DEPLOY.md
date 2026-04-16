# SOP 远程诊断 Skill - Linux 部署指南

## 架构概览

```
用户请求
  ↓
Gateway (Java 21, Spring Boot WebFlux, :3000)
  ↓
goosed (Agent 实例进程)
  ↓ MCP stdio
  ├── sop-executor (Node.js) ──HTTP──→ Gateway REST API ──SSH──→ 目标主机
  └── browser-use  (Python)  ──Playwright──→ Chromium (本地无头浏览器)
```

## 1. 系统要求

| 组件 | 最低版本 | 用途 |
|------|---------|------|
| OS | Ubuntu 22.04+ / CentOS 8+ / EulerOS | 服务器操作系统 |
| Java JDK | **21** | Gateway 后端 |
| Maven | 3.8+ | 构建 Java 项目 |
| Node.js | 18+ | sop-executor MCP |
| npm | 9+ | 安装 Node 依赖 |
| Python | **3.11+** | browser-use MCP |
| pip | 23+ | 安装 Python 依赖 |
| Chromium | 120+ | 无头浏览器自动化 |

## 2. 安装系统依赖

### Ubuntu / Debian

```bash
# 基础工具
sudo apt update
sudo apt install -y curl wget git unzip

# Java 21
sudo apt install -y openjdk-21-jdk
java -version  # 验证

# Node.js 20 (如未安装)
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
node --version && npm --version

# Python 3.11+ (如系统版本低于 3.11)
sudo apt install -y python3.11 python3.11-venv python3-pip
# 或用 uv (推荐，更快)
curl -LsSf https://astral.sh/uv/install.sh | sh

# Chromium + 无头浏览器所需的系统库
sudo apt install -y \
  chromium-browser \
  libnss3 libatk1.0-0 libatk-bridge2.0-0 libcups2 \
  libdrm2 libxkbcommon0 libxcomposite1 libxdamage1 \
  libxrandr2 libgbm1 libpango-1.0-0 libcairo2 \
  libasound2 libxshmfence1 libx11-xcb1
```

### CentOS / RHEL / EulerOS

```bash
# Java 21
sudo yum install -y java-21-openjdk java-21-openjdk-devel

# Node.js 20
curl -fsSL https://rpm.nodesource.com/setup_20.x | sudo bash -
sudo yum install -y nodejs

# Python 3.11+
sudo yum install -y python3.11 python3.11-pip

# Chromium + 依赖库
sudo yum install -y \
  chromium \
  nss atk at-spi2-atk cups-libs libdrm libxkbcommon \
  libXcomposite libXdamage libXrandr mesa-libgbm \
  pango cairo alsa-lib libX11-xcb
```

## 3. 构建与部署

### 3.1 构建 Gateway Java 后端

```bash
cd gateway
mvn package -DskipTests
# 产物: gateway-service/target/gateway-service-1.0.0-SNAPSHOT.jar
```

### 3.2 构建 sop-executor MCP (Node.js)

```bash
cd gateway/agents/qos-agent/config/mcp/sop-executor
npm install
npm run build
# 产物: dist/index.js
```

### 3.3 安装 browser-use MCP (Python)

browser-use 使用官方 Python 包，**不需要构建 Node.js 版本**。

```bash
# 方式一：pip 安装（推荐）
pip install browser-use

# 方式二：uv 安装（更快）
uv pip install browser-use

# 安装 Chromium（browser-use 依赖 Playwright）
python -m browser_use.skill_cli.main install
# 或用 playwright 命令安装
python -m playwright install chromium
```

> **注意**：旧的 `mcp/browser-use/` 目录（Node.js + Puppeteer 版本）不再使用，
> 已被官方 browser-use Python MCP 替代。部署时无需 `npm install` 该目录。

## 4. 配置

### 4.1 目录结构（部署后）

```
/opt/ops-factory/
├── gateway/
│   ├── gateway-service/target/gateway-service-1.0.0-SNAPSHOT.jar
│   └── agents/qos-agent/config/
│       ├── config.yaml              ← Agent 主配置
│       ├── secrets.yaml             ← API Key（需手动创建）
│       ├── prompts/system.md
│       ├── custom_providers/
│       ├── mcp/
│       │   ├── sop-executor/
│       │   │   ├── dist/index.js    ← 已编译
│       │   │   └── node_modules/
│       │   └── browser-use/         ← 保留但不再使用
│       └── skills/
│           └── sop-diagnosis-execution/
│               ├── SKILL.md
│               └── references/
└── output/                          ← 诊断报告和截图输出目录
```

### 4.2 secrets.yaml

```bash
cd /opt/ops-factory/gateway/agents/qos-agent/config/
cp secrets.yaml.sample secrets.yaml
```

编辑 `secrets.yaml`：

```yaml
LITELLM_API_KEY: your-actual-api-key-here
```

### 4.3 config.yaml 关键配置

browser-use MCP 配置已更新为使用官方 Python MCP：

```yaml
  browser-use:
    enabled: true
    type: stdio
    name: browser-use
    description: Browser automation via browser-use official MCP
    cmd: python
    args:
    - -m
    - browser_use.mcp.server
    envs: {}
    env_keys: []
    timeout: 120
    bundled: null
    available_tools: []
```

sop-executor MCP 配置：

```yaml
  sop-executor:
    enabled: true
    type: stdio
    name: sop-executor
    description: SOP workflow executor
    cmd: node
    args:
    - /opt/ops-factory/gateway/agents/qos-agent/config/mcp/sop-executor/dist/index.js
    envs:
      GATEWAY_URL: http://127.0.0.1:3000
      GATEWAY_SECRET_KEY: your-secret-key
      OUTPUT_DIR: /opt/ops-factory/output
    env_keys: []
    timeout: 300
```

> **注意**：Linux 部署时需要将 `args` 中的路径改为绝对路径。

### 4.4 Gateway application.yml 环境变量

```bash
export GATEWAY_PORT=3000
export GATEWAY_SECRET_KEY=your-secret-key
export CORS_ORIGIN=http://your-frontend:5173
export GOOSED_BIN=/usr/local/bin/goosed
export PROJECT_ROOT=/opt/ops-factory/gateway
```

## 5. 启动服务

### 5.1 创建 output 目录

```bash
mkdir -p /opt/ops-factory/output
```

### 5.2 启动 Gateway

```bash
cd /opt/ops-factory/gateway
java -jar gateway-service/target/gateway-service-1.0.0-SNAPSHOT.jar
```

### 5.3 验证各组件

```bash
# 1. 验证 Gateway 启动
curl http://localhost:3000/actuator/health

# 2. 验证 sop-executor MCP
echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1.0"}}}' | \
  node gateway/agents/qos-agent/config/mcp/sop-executor/dist/index.js

# 3. 验证 browser-use MCP
echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1.0"}}}' | \
  python -m browser_use.mcp.server

# 4. 列出 browser-use 工具
printf '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1.0"}}}\n{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}\n' | \
  python -m browser_use.mcp.server 2>/dev/null | grep '"name"'
```

## 6. 验证浏览器功能

### 6.1 快速验证 Chromium

```bash
python -c "
import asyncio
from browser_use.mcp.server import BrowserSession

async def test():
    s = BrowserSession(headless=True)
    await s.start()
    page = await s.get_current_page()
    await s.navigate_to('https://example.com')
    title = await s.get_current_page_title()
    print(f'OK: title={title}')
    await s.kill()

asyncio.run(test())
"
```

预期输出：`OK: title=Example Domain`

### 6.2 通过 MCP 协议完整测试

```bash
python -c "
import asyncio, json, sys, os

async def send_and_read(proc, msg_id, method, params=None):
    req = {'jsonrpc': '2.0', 'id': msg_id, 'method': method}
    if params: req['params'] = params
    proc.stdin.write((json.dumps(req) + '\n').encode())
    await proc.stdin.drain()
    while True:
        data = await proc.stdout.readline()
        if not data: return None
        line = data.decode('utf-8', errors='replace').strip()
        if not line: continue
        try: return json.loads(line)
        except: continue

async def main():
    proc = await asyncio.create_subprocess_exec(
        sys.executable, '-m', 'browser_use.mcp.server',
        stdin=asyncio.subprocess.PIPE, stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.DEVNULL)

    await send_and_read(proc, 1, 'initialize', {
        'protocolVersion': '2024-11-05', 'capabilities': {},
        'clientInfo': {'name': 'test', 'version': '1.0'}})
    proc.stdin.write(b'{\"jsonrpc\":\"2.0\",\"method\":\"notifications/initialized\",\"params\":{}}\n')
    await proc.stdin.drain()

    resp = await send_and_read(proc, 2, 'tools/call', {
        'name': 'browser_navigate', 'arguments': {'url': 'https://example.com'}})
    print('Navigate:', resp.get('result', {}).get('content', [{}])[0].get('text', 'N/A')[:100])

    resp = await send_and_read(proc, 3, 'tools/call', {
        'name': 'browser_screenshot', 'arguments': {'full_page': False}})
    has_img = any(c.get('type') == 'image' for c in resp.get('result', {}).get('content', []))
    print('Screenshot:', 'OK' if has_img else 'NO IMAGE')

    resp = await send_and_read(proc, 4, 'tools/call', {
        'name': 'browser_close_all', 'arguments': {}})
    print('Close:', resp.get('result', {}).get('content', [{}])[0].get('text', 'N/A'))

    proc.terminate()
    print('ALL TESTS DONE')

asyncio.run(main())
"
```

## 7. 依赖汇总

### Python 包 (browser-use)

```
browser-use >= 0.12.5
  ├── cdp-use >= 1.4.0        (CDP 客户端)
  ├── pydantic                 (数据模型)
  ├── httpx                    (HTTP 客户端)
  ├── websockets               (WebSocket)
  ├── mcp                      (MCP SDK)
  ├── pillow                   (截图处理)
  └── ... (其他依赖自动安装)
```

安装命令：
```bash
pip install browser-use
python -m playwright install chromium --with-deps
```

> `--with-deps` 会自动安装 Linux 系统库（需要 sudo 权限）。

### Node.js 包 (sop-executor)

```
@modelcontextprotocol/sdk ^1.12.0
```

安装命令：
```bash
cd gateway/agents/qos-agent/config/mcp/sop-executor
npm install
npm run build
```

### Java (Gateway)

```
Spring Boot 2.7.18
  ├── Spring WebFlux (响应式 HTTP)
  ├── JSch 0.2.16 (SSH 远程命令执行)
  └── Log4j2
```

构建命令：
```bash
cd gateway
mvn package -DskipTests
```

## 8. 环境变量速查

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `GATEWAY_PORT` | 3000 | Gateway 端口 |
| `GATEWAY_SECRET_KEY` | test | Gateway 认证密钥 |
| `GATEWAY_URL` | http://127.0.0.1:3000 | sop-executor 连接 Gateway |
| `OUTPUT_DIR` | ./output | 诊断报告/截图输出目录 |
| `GOOSED_BIN` | goosed | goosed 二进制路径 |
| `CORS_ORIGIN` | http://127.0.0.1:5173 | 前端跨域地址 |
| `LITELLM_API_KEY` | - | LLM API Key (secrets.yaml) |

## 9. 常见问题

### Q: Chromium 启动失败 "No usable sandbox"

```bash
# 需要 --no-sandbox，browser-use 已内置此参数
# 或关闭 Chrome sandbox：
sudo sysctl -w kernel.unprivileged_userns_clone=1
```

### Q: Python 找不到 browser_use.mcp.server

```bash
# 确认安装
pip show browser-use
# 重新安装
pip install --force-reinstall browser-use
```

### Q: sop-executor 连接 Gateway 失败

```bash
# 检查 Gateway 是否运行
curl http://localhost:3000/actuator/health
# 检查 config.yaml 中 GATEWAY_URL 和 GATEWAY_SECRET_KEY
```

### Q: SSH 远程命令执行失败

- 确认目标主机 SSH 可达（端口 22）
- 确认 Gateway 中配置了正确的 host 信息（IP、用户名、密码/密钥）
- 确认命令在白名单内（ps, tail, grep, cat, ls, df, free, netstat, top 等）

### Q: browser-use 截图无图片数据

确保 Chromium 正常安装：
```bash
which chromium-browser || which chromium || which google-chrome
python -m playwright install chromium --with-deps
```
