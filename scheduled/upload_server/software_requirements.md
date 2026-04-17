# Windows Gateway 自动部署 - 必备软件清单

本文档基于 `upload-opsfactory.bat` 和 `agent_created_1776335562.yaml` 文件分析，列出了完成自动化部署任务所需的所有必备软件。

## 核心开发工具

### 1. Java Development Kit (JDK)
- **版本**: JDK 21.0.10
- **安装路径**: `C:\Program Files\Java\jdk-21.0.10`
- **用途**: Java 项目的运行环境，用于编译和运行 Gateway 项目

### 2. Apache Maven
- **版本**: 3.9.14
- **安装路径**: `C:\zhulin\apache-maven-3.9.14`
- **用途**: Java 项目构建和依赖管理工具
- **编译命令**: `mvn clean package -DskipTests`
- **环境变量配置**: 
  - `MAVEN_OPTS: -Xmx2g -Xms1g`

### 3. Node.js 和 npm
- **用途**: Webapp 前端项目的构建工具
- **编译命令**: `npm run build`

## 网络传输工具

### 4. PuTTY 套件
- **安装方式**: 通过 Chocolatey 安装
- **安装路径**: `C:\ProgramData\chocolatey\lib\putty.portable\tools\`
- **包含工具**:
  - **PSCP.EXE**: 用于文件上传（SCP 协议）
  - **PLINK.EXE**: 用于远程命令执行
- **用途**: 
  - 将编译好的文件上传到服务器（192.168.200.35）
  - 在远程服务器上执行部署脚本

## 版本控制工具

### 5. Git
- **用途**: 代码仓库管理和更新
- **命令**:
  - `git clone https://github.com/your-org/ops-factory.git C:\zhulin\ops-factory`
  - `git pull origin main`
- **代码仓库路径**: `C:\zhulin\ops-factory`

## 系统工具

### 6. PowerShell
- **用途**: 
  - 压缩文件（Compress-Archive 命令）
  - 执行系统级操作
- **系统自带**: Windows 系统内置工具

### 7. Windows 命令行工具
- **用途**: 批处理脚本执行
- **系统自带**: Windows 系统内置工具（cmd.exe）

## 部署目标服务器要求

### 8. Linux 服务器
- **IP 地址**: 192.168.200.35
- **用户**: paas
- **部署路径**: `/home/paas/gateway/`
- **需要的服务器工具**:
  - SSH 服务（端口 22）
  - dos2unix（用于转换 Windows 文件格式）
  - Shell 脚本支持（sh）
  - 文件权限管理（chmod）

## 项目依赖

### 9. Chocolatey（可选但推荐）
- **用途**: Windows 包管理器
- **用于安装**: PuTTY 套件（putty.portable）

## 工作目录结构

部署任务需要以下目录结构：

```
C:\zhulin\
├── ops-factory/                    # 主项目目录
│   ├── gateway/                    # Gateway Java 项目
│   │   ├── gateway-service/
│   │   │   └── target/
│   │   │       └── gateway-service.jar
│   │   └── gateway-common/
│   │       └── target/
│   │           └── gateway-common-1.0.0-SNAPSHOT.jar
│   └── web-app/                    # Webapp 前端项目
│       ├── dist/                   # 构建输出目录
│       └── dist.zip                # 压缩后的部署文件
├── goose/                          # 脚本目录
│   ├── upload-opsfactory.bat       # 上传脚本
│   ├── handle_ops_app.sh           # 远程执行脚本
│   └── handle_ops_app.conf         # 配置文件
└── deployment/                     # 工作目录
```

## 环境变量配置

需要在系统环境变量中配置：

1. **JAVA_HOME**: 指向 JDK 安装目录
2. **MAVEN_HOME**: 指向 Maven 安装目录
3. **MAVEN_OPTS**: `-Xmx2g -Xms1g`
4. **PATH**: 添加以下路径
   - `%JAVA_HOME%\bin`
   - `%MAVEN_HOME%\bin`
   - npm 的路径（如 `C:\Program Files\nodejs`）

## 部署流程

1. **代码更新**: 使用 Git 拉取最新代码
2. **编译 Gateway**: 使用 Maven 编译 Java 项目
3. **编译 Webapp**: 使用 npm 构建前端项目
4. **文件压缩**: 使用 PowerShell 压缩 dist 目录
5. **文件上传**: 使用 PSCP 上传到服务器
6. **远程执行**: 使用 PLINK 在服务器上执行部署脚本

## 注意事项

1. 确保 Java、Maven、Node.js 版本兼容
2. 网络连接需要能够访问 GitHub 和目标服务器
3. 服务器 SSH 连接需要正确的认证信息
4. 磁盘空间足够存放编译产物和压缩文件
5. Windows 脚本需要以管理员权限运行（如果需要写入系统目录）
6. upload-opsfactory.bat和agent_created_1776335562.yaml中涉及到zhulin的部分都可修改为私人工作目录

---

**文档生成时间**: 基于文件 `upload-opsfactory.bat` 和 `agent_created_1776335562.yaml` 分析生成
