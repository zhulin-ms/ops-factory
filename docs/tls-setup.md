# TLS 配置指南

本文档说明 Ops Factory 各服务的 HTTPS/TLS 配置方式。

## 架构概览

```
浏览器 ──HTTPS──▶ Gateway (:3000)
                     │
                     │ HTTPS (trust-all)
                     ▼
                  goosed (动态端口)

OnlyOffice (:8080) ──HTTPS──▶ Gateway (:3000)
  (Docker 容器)                  (获取文件用于预览)
```

- **Gateway** 作为 HTTPS 服务端，使用 PKCS12 证书
- **goosed** 自带 TLS（1.27+），Gateway 作为客户端以 trust-all 方式连接
- **OnlyOffice** Docker 容器需要信任 Gateway 的证书才能下载文件进行预览

## 快速开始

### 方式一：自动生成自签名证书（零配置）

Gateway 启动时会自动用 `keytool` 生成自签名证书，无需手动操作。

```bash
# gateway/config.yaml
gatewayTls: true
gatewayKeyStore: ""              # 留空 = 自动生成
gatewayKeyStorePassword: ""      # 留空 = 默认 changeit
```

启动 Gateway 后，会自动生成：
- `.gateway-keystore.p12` — PKCS12 证书库
- `.gateway-keystore.pem` — 导出的 PEM 证书（供 OnlyOffice 容器信任）

OnlyOffice 的 `ctl.sh` 会自动检测 `.gateway-keystore.pem` 并挂载到容器中。

**注意**：浏览器会提示"不安全的连接"，需手动点击"继续访问"。

### 方式二：使用 mkcert（浏览器零警告）

[mkcert](https://github.com/FiloSottile/mkcert) 能生成本地信任的证书，浏览器不会报警告。

#### 1. 安装 mkcert

```bash
# macOS
brew install mkcert
mkcert -install          # 安装本地 CA 到系统信任库

# Linux (Ubuntu/Debian)
sudo apt install libnss3-tools
brew install mkcert      # 或从 GitHub 下载
mkcert -install
```

#### 2. 生成证书

```bash
cd gateway
mkcert -pkcs12 -p12-file .gateway-keystore.p12 \
    localhost 127.0.0.1 0.0.0.0 host.docker.internal
```

生成的证书包含 4 个 SAN，覆盖所有访问场景：
- `localhost` / `127.0.0.1` / `0.0.0.0` — 浏览器和本机访问
- `host.docker.internal` — Docker 容器访问宿主机

#### 3. 配置 Gateway

```yaml
# gateway/config.yaml
gatewayTls: true
gatewayKeyStore: .gateway-keystore.p12
gatewayKeyStorePassword: changeit     # mkcert 默认密码
```

#### 4. OnlyOffice 自动信任

OnlyOffice `ctl.sh` 会按以下顺序自动查找 CA 证书：

1. `gateway/.gateway-keystore.pem`（Gateway 启动时自动导出）
2. `mkcert -CAROOT` 命令输出的路径（如果 mkcert 在 PATH 中）
3. 常见 mkcert CA 路径：
   - macOS: `~/Library/Application Support/mkcert/rootCA.pem`
   - Linux: `~/.local/share/mkcert/rootCA.pem`

也可以在 `onlyoffice/config.yaml` 中手动指定：

```yaml
# onlyoffice/config.yaml
caCert: "/path/to/rootCA.pem"
```

## 配置参考

### gateway/config.yaml

| 字段 | 说明 | 默认值 |
|------|------|--------|
| `gatewayTls` | 启用 HTTPS | `true` |
| `gatewayKeyStore` | PKCS12 证书库路径（空=自动生成） | `""` |
| `gatewayKeyStorePassword` | 证书库密码 | `changeit` |

### onlyoffice/config.yaml

| 字段 | 说明 | 默认值 |
|------|------|--------|
| `caCert` | CA 证书 PEM 路径（空=自动检测） | `""` |

### 环境变量覆盖

```bash
GATEWAY_TLS=true
GATEWAY_KEY_STORE=/path/to/keystore.p12
GATEWAY_KEY_STORE_PASSWORD=mypassword
MKCERT_CA_CERT=/path/to/rootCA.pem      # 直接指定 OnlyOffice 使用的 CA 证书
```

## 关闭 TLS

如果不需要 HTTPS（如内网部署或有前置反向代理）：

```yaml
# gateway/config.yaml
gatewayTls: false

# web-app/config.yaml
gatewayUrl: "http://127.0.0.1:3000"

# gateway/config.yaml 中 officePreview.fileBaseUrl 也改为 http
officePreview:
  fileBaseUrl: "http://host.docker.internal:3000"
```

## 故障排查

### 浏览器报 ERR_CERT_AUTHORITY_INVALID

- **方式一用户**：正常现象，点击"高级" → "继续访问"
- **方式二用户**：确认已运行 `mkcert -install`，并重启浏览器

### OnlyOffice 预览"下载失败"

1. 检查 `fileBaseUrl` 是否为 `https://`：
   ```bash
   curl -k -H "x-secret-key: test" https://127.0.0.1:3000/config | python3 -m json.tool
   ```

2. 从容器内测试连接：
   ```bash
   docker exec onlyoffice curl -s -o /dev/null -w "%{http_code}" https://host.docker.internal:3000/status
   ```
   返回 `401` = TLS 正常；返回 `000` 或 SSL 错误 = 证书问题

3. 手动更新容器 CA 信任：
   ```bash
   docker exec onlyoffice update-ca-certificates
   ```

### 监控页面显示"监控未启用"

检查 `gateway/config.yaml` 中 `langfuse` 配置是否为**多行缩进格式**（不能用 `{key: value}` 行内格式）：

```yaml
# 正确
langfuse:
  host: "http://127.0.0.1:3100"
  publicKey: pk-lf-opsfactory
  secretKey: sk-lf-opsfactory

# 错误（ctl.sh 无法解析）
langfuse: {host: 'http://127.0.0.1:3100', publicKey: pk-lf-opsfactory}
```

## 证书 SAN 说明

自动生成的证书包含以下 Subject Alternative Names：

| SAN | 用途 |
|-----|------|
| `dns:localhost` | 浏览器 localhost 访问 |
| `dns:host.docker.internal` | Docker 容器访问宿主机 |
| `ip:127.0.0.1` | 浏览器 IP 访问 |
| `ip:0.0.0.0` | 绑定所有网卡 |

如需添加其他域名（如内网 IP），使用 mkcert 重新生成：

```bash
mkcert -pkcs12 -p12-file .gateway-keystore.p12 \
    localhost 127.0.0.1 0.0.0.0 host.docker.internal 192.168.1.100
```
