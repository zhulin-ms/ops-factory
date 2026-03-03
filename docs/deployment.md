# Ops Factory 分离部署指南

本文档描述 Web App 与 Gateway + Goosed 分开部署的方案。

## 部署架构

```
服务器 A（前端）                    服务器 B（后端）
┌────────────────────┐             ┌──────────────────────────┐
│  静态文件服务        │             │  Gateway (:3000)          │
│  (Nginx / CDN)     │── HTTPS ──▶│  ├─ 内置 TLS（可选）       │
│  └─ web-app/dist/  │             │  ├─ goosed:54321 (user A) │
└────────────────────┘             │  ├─ goosed:54322 (user B) │
                                   │  └─ goosed:54323 (sys)    │
                                   └──────────────────────────┘
```

Web App 是纯静态 SPA，构建后生成 HTML/JS/CSS，可部署在任意静态服务器或 CDN 上。Gateway 和 Goosed 保持同机部署，Gateway 管理 goosed 进程的生命周期。

Gateway 内置可选的 TLS 支持，可以直接对外提供 HTTPS 服务，无需 Nginx 反向代理。

---

## 一、后端部署（Gateway + Goosed）

### 1.1 环境准备

```bash
# 安装 Node.js >= 18
node -v

# 确保 goosed 二进制可用
goosed --version
# 或指定自定义路径
export GOOSED_BIN=/usr/local/bin/goosed
```

### 1.2 构建 Gateway

```bash
cd gateway
npm install
npm run build
```

### 1.3 环境变量

创建 `gateway/.env` 或通过 systemd/docker 注入：

```bash
# 必填
GATEWAY_HOST=0.0.0.0
GATEWAY_PORT=3000
GATEWAY_SECRET_KEY=<生成一个强密钥>

# CORS：限制为前端域名
CORS_ORIGIN=https://app.example.com

# TLS（可选，设置后 Gateway 直接提供 HTTPS）
TLS_CERT=/etc/ssl/certs/gateway.example.com.pem
TLS_KEY=/etc/ssl/private/gateway.example.com.key

# 可选
IDLE_TIMEOUT_MS=900000          # goosed 空闲回收时间，默认 15 分钟
GOOSED_BIN=goosed               # goosed 二进制路径
```

> **安全提示**：生产环境务必替换默认的 `GATEWAY_SECRET_KEY=test`。

### 1.4 TLS 配置说明

Gateway 支持两种 HTTPS 模式，选其一即可：

#### 模式 A：Gateway 内置 TLS（推荐，无需额外组件）

设置 `TLS_CERT` 和 `TLS_KEY` 环境变量指向证书文件，Gateway 启动后直接监听 HTTPS：

```bash
TLS_CERT=/etc/ssl/certs/gateway.example.com.pem
TLS_KEY=/etc/ssl/private/gateway.example.com.key
GATEWAY_PORT=443
```

#### 模式 B：云负载均衡器 TLS 终止

如使用阿里云 SLB、AWS ALB 等，在负载均衡器上配置证书，Gateway 保持 HTTP 即可。不需要设置 `TLS_CERT` / `TLS_KEY`。

#### 内网部署

如果 Gateway 仅在内网访问（通过 VPN），且前端也是 HTTP，可以不配置 TLS。

### 1.5 启动 Gateway

**直接运行：**

```bash
cd gateway
node dist/index.js
```

**使用 systemd（推荐）：**

```ini
# /etc/systemd/system/ops-gateway.service
[Unit]
Description=Ops Factory Gateway
After=network.target

[Service]
Type=simple
WorkingDirectory=/opt/ops-factory/gateway
ExecStart=/usr/bin/node dist/index.js
Restart=always
RestartSec=5
EnvironmentFile=/opt/ops-factory/gateway/.env

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl enable ops-gateway
sudo systemctl start ops-gateway
```

---

## 二、前端部署（Web App）

### 2.1 构建

```bash
cd web-app

# 配置 Gateway 地址（构建时注入）
cat > .env <<EOF
GATEWAY_URL=https://gateway.example.com
GATEWAY_SECRET_KEY=<与 Gateway 一致的密钥>
EOF

npm install
npm run build
```

构建产物在 `web-app/dist/` 目录。

### 2.2 部署方式

#### 方式 A：Nginx 静态服务

```nginx
server {
    listen 443 ssl http2;
    server_name app.example.com;

    ssl_certificate     /etc/ssl/certs/app.example.com.pem;
    ssl_certificate_key /etc/ssl/private/app.example.com.key;

    root /var/www/ops-factory/dist;
    index index.html;

    # SPA 路由：所有路径回退到 index.html
    location / {
        try_files $uri $uri/ /index.html;
    }

    # 静态资源长缓存（Vite 构建产物带 hash）
    location /assets/ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
}
```

#### 方式 B：CDN 部署

将 `dist/` 目录上传至 CDN（如阿里云 OSS、AWS S3 + CloudFront）：

```bash
# 示例：AWS S3
aws s3 sync web-app/dist/ s3://ops-factory-web --delete
```

CDN 回源规则需配置：所有非静态资源请求回退到 `index.html`。

---

## 三、环境变量速查

### Gateway 环境变量

| 变量 | 必填 | 默认值 | 说明 |
|------|:----:|--------|------|
| `GATEWAY_HOST` | | `0.0.0.0` | 监听地址 |
| `GATEWAY_PORT` | | `3000` | 监听端口 |
| `GATEWAY_SECRET_KEY` | 是 | `test` | 鉴权密钥，生产环境必须修改 |
| `CORS_ORIGIN` | 是 | `*` | 允许的前端域名，如 `https://app.example.com` |
| `TLS_CERT` | | 空 | TLS 证书路径，与 `TLS_KEY` 同时设置启用 HTTPS |
| `TLS_KEY` | | 空 | TLS 私钥路径，与 `TLS_CERT` 同时设置启用 HTTPS |
| `GOOSED_BIN` | | `goosed` | goosed 二进制路径 |
| `IDLE_TIMEOUT_MS` | | `900000` | goosed 空闲回收时间（毫秒） |
| `MAX_UPLOAD_FILE_SIZE_MB` | | `10` | 上传文件大小限制 |

### Web App 构建变量

| 变量 | 必填 | 默认值 | 说明 |
|------|:----:|--------|------|
| `GATEWAY_URL` | 是 | `http://127.0.0.1:3000` | Gateway 地址（构建时注入） |
| `GATEWAY_SECRET_KEY` | 是 | `test` | 鉴权密钥 |

> 注意：Web App 的变量是**构建时**注入的，修改后需要重新 `npm run build`。

---

## 四、验证部署

### 4.1 检查 Gateway

```bash
# 从前端服务器测试连通性
curl -s https://gateway.example.com/status
# 预期输出: "ok"

# 检查 CORS 头
curl -s -I -X OPTIONS https://gateway.example.com/agents \
  -H "Origin: https://app.example.com" \
  -H "Access-Control-Request-Method: GET"
# 预期看到: Access-Control-Allow-Origin: https://app.example.com
```

### 4.2 检查 Web App

```bash
# 访问前端页面
curl -s -o /dev/null -w "%{http_code}" https://app.example.com
# 预期: 200
```

### 4.3 端到端验证

1. 浏览器打开 `https://app.example.com`
2. 检查浏览器 Console 无 CORS 报错
3. 选择一个 Agent，发送一条消息，确认 SSE 流式响应正常
4. 上传一个文件，确认上传成功

---

## 五、常见问题

### CORS 报错

**现象**：浏览器 Console 出现 `Access to fetch has been blocked by CORS policy`

**排查**：
1. 确认 Gateway 的 `CORS_ORIGIN` 与前端域名完全匹配（包括协议和端口）
2. 如果前端是 `https://`，Gateway 也必须通过 `https://` 暴露（不能 mixed content）

### SSE 流式响应中断

**现象**：对话消息卡住或中途断开

**排查**：
1. 如有 CDN 或 WAF，确认未对 SSE 响应做缓冲或超时切断
2. 检查网络层是否有代理超时设置（Gateway 自身的 proxy timeout 已设为 5 分钟）

### GATEWAY_SECRET_KEY 安全风险

当前 `GATEWAY_SECRET_KEY` 以明文形式嵌入在前端 JS 中。这意味着任何能访问前端页面的人都可以在浏览器 DevTools 中看到这个密钥。

**当前阶段的缓解措施**：

- 将 Gateway 部署在内网，通过 VPN 访问
- 或通过防火墙限制 Gateway 的访问来源 IP

**长期方案**：引入用户登录机制，用 JWT/Session Token 替代静态密钥。
