#!/bin/bash

# Gateway JAR文件复制脚本 - 增强版
# 功能：复制JAR文件并设置权限，然后重启gateway服务

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 配置文件路径
CONFIG_FILE="./handle_ops_app.conf"
ADVANCED_CONFIG_FILE="./handle_ops_app_advanced.conf"
timestamp=$(date "+%Y%m%d%H%M")

# 加载配置文件的函数
load_config() {
    local config_file=$1
    
    if [ -f "$config_file" ]; then
        echo -e "${BLUE}正在加载配置文件: $config_file${NC}"
        # 使用source加载配置文件，支持变量和命令替换
        source "$config_file"
        
        # 显示加载的配置信息
        echo -e "${GREEN}配置加载完成:${NC}"
        echo -e "  源目录: ${SOURCE_DIR}"
        echo -e "  目标目录: ${TARGET_DIR}"
        echo -e "  库目录: ${TARGET_LIB_DIR}"
        echo -e "  Gateway JAR: ${GATEWAY_JAR}"
        echo -e "  Common JAR: ${COMMON_JAR}"
        echo -e "  ROOT_PASSWORD: ${ROOT_PASSWORD:0:8}****"
        echo -e "  日志级别: ${LOG_LEVEL}"
        echo ""
    else
        echo -e "${RED}错误：配置文件 $config_file 不存在！${NC}"
        exit 1
    fi
}

# 日志记录函数
log() {
    local level=$1
    local message=$2
    
    if [ "$LOG_LEVEL" = "verbose" ] || [ "$LOG_LEVEL" = "debug" ]; then
        echo -e "$(date '+%Y-%m-%d %H:%M:%S') [$level] $message"
    fi
    
    if [ "$LOG_LEVEL" = "debug" ]; then
        # debug模式下保存到日志文件
        echo "$(date '+%Y-%m-%d %H:%M:%S') [$level] $message" >> /tmp/gateway_copy.log
    fi
}

# 颜色打印函数
print_info() {
    echo -e "${BLUE}[信息]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[成功]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[警告]${NC} $1"
}

print_error() {
    echo -e "${RED}[错误]${NC} $1"
}

# 函数：检查命令是否存在
check_command() {
    if ! command -v $1 &> /dev/null; then
        print_error "命令 $1 未找到，请安装："
        echo "  Ubuntu/Debian: sudo apt-get install $1"
        echo "  CentOS/RHEL: sudo yum install $1"
        exit 1
    fi
}

# 函数：验证源文件
validate_source_files() {
    print_info "验证源文件..."
    
    # 检查源目录是否存在
    if [ ! -d "$SOURCE_DIR" ]; then
        print_error "源目录不存在: $SOURCE_DIR"
        exit 1
    fi
    
    # 检查源文件是否存在
    if [ ! -f "${SOURCE_DIR}${GATEWAY_JAR}" ]; then
        print_error "源文件不存在: ${SOURCE_DIR}${GATEWAY_JAR}"
        exit 1
    fi
    
    if [ ! -f "${SOURCE_DIR}${COMMON_JAR}" ]; then
        print_error "源文件不存在: ${SOURCE_DIR}${COMMON_JAR}"
        exit 1
    fi
    
    print_success "源文件验证通过"
}

# 函数：显示操作计划
show_operations() {
    echo ""
    echo "=========================================="
    echo "    Gateway JAR文件复制操作计划"
    echo "=========================================="
    echo ""
    echo "将要执行的操作："
    echo "  1. 检查并创建目标目录"
    echo "  2. 复制文件:"
    echo "     - ${SOURCE_DIR}${GATEWAY_JAR} -> ${TARGET_DIR}${GATEWAY_JAR}"
    echo "     - ${SOURCE_DIR}${COMMON_JAR} -> ${TARGET_LIB_DIR}${COMMON_JAR}"
    echo "  3. 设置文件权限:"
    echo "     - 设置所有者为root:root"
    echo "     - 文件权限为600"
    echo "  4. 重启Gateway服务"
    echo "  5. 服务启动验证"
    echo ""
}

# 主函数
main() {
    echo ""
    echo "=========================================="
    echo "  Gateway JAR文件复制脚本"
    echo "=========================================="
    echo ""
    
    # 检查配置文件
    if [ -f "$ADVANCED_CONFIG_FILE" ]; then
        load_config "$ADVANCED_CONFIG_FILE"
    elif [ -f "$CONFIG_FILE" ]; then
        load_config "$CONFIG_FILE"
    else
        print_error "未找到配置文件！"
        echo "请确保以下文件之一存在："
        echo "  - $CONFIG_FILE"
        echo "  - $ADVANCED_CONFIG_FILE"
        exit 1
    fi
    
    # 检查必需的命令
    check_command expect
    
    # 验证源文件
    validate_source_files
    
    # 显示操作计划
    show_operations
    print_info "开始执行..."
    
    # 创建expect脚本
    expect_script=$(mktemp)
    cat << EOF > "$expect_script"
#!/usr/bin/expect -f

set timeout 60

# 启动su命令切换到root
spawn su - root

# 等待密码提示并输入密码
expect {
    "Password:" {
        send "${ROOT_PASSWORD}\r"
    }
    timeout {
        puts "错误：等待密码提示超时"
        exit 1
    }
}

expect {
    "# " {
        # 创建目标目录
        send "echo \"正在创建目标目录...\"\r"
        send "mkdir -p ${TARGET_DIR}\r"
        send "mkdir -p ${TARGET_LIB_DIR}\r"
		send "mkdir -p ${TARGET_WEBAPP_DIR}\r"
		send "mkdir -p ${BACKUP_DIR}\r"
        
		# 备份文件
        send "echo \"创建备份到: ${BACKUP_DIR}\"\r"
		send "mkdir -p ${BACKUP_DIR}\r"
		send "cd ${TARGET_HOME_DIR}\r"
		send "tar zcvf backup_${timestamp}.tar.gz webapp gateway/gateway/gateway-service.jar gateway/gateway/lib/gateway-common-1.0.0-SNAPSHOT.jar\r"
		send "mv backup_${timestamp}.tar.gz ${BACKUP_DIR}\r"
		
		send "echo \"保留最近5个备份文件...\"\r"
		send "ls -t *.tar.gz | tail -n +6 | xargs rm -f\r"
		
        # 复制gateway-service.jar
        send "echo \"正在复制 ${GATEWAY_JAR}...\"\r"
        send "echo \"yes\"|cp \"${SOURCE_DIR}${GATEWAY_JAR}\" \"${TARGET_DIR}${GATEWAY_JAR}\"\r"
        
        # 复制gateway-common-1.0.0-SNAPSHOT.jar
        send "echo \"正在复制 ${COMMON_JAR}...\"\r"
        send "echo \"yes\"|cp \"${SOURCE_DIR}${COMMON_JAR}\" \"${TARGET_LIB_DIR}${COMMON_JAR}\"\r"
		
		 # 复制webapp
        send "echo \"正在复制 webapp...\"\r"
		send "rm -rf ${TARGET_WEBAPP_DIR}/assets/*.js ${TARGET_WEBAPP_DIR}/assets/*.css\r"
		send "cd ${TARGET_WEBAPP_DIR}\r"
        send "echo \"A\"|unzip ${SOURCE_DIR}${WEBAPP_ZIP}\r"
        
        # 设置文件权限为600，所有者为root:root
        send "echo \"设置文件权限...\"\r"
        send "echo \"正在设置 ${GATEWAY_JAR} 权限...\"\r"
        send "chown root:root \"${TARGET_DIR}${GATEWAY_JAR}\"\r"
        send "chmod 600 \"${TARGET_DIR}${GATEWAY_JAR}\"\r"
        
        send "echo \"正在设置 ${COMMON_JAR} 权限...\"\r"
        send "chown root:root \"${TARGET_LIB_DIR}${COMMON_JAR}\"\r"
        send "chmod 600 \"${TARGET_LIB_DIR}${COMMON_JAR}\"\r"
        
        # 重启服务
        send "echo \"重启服务...\"\r"
        
        send "echo \"正在停止gateway进程...\"\r"
        send "${KILL_GATAWAY_COMMAND}\r"
        send "echo \"正在停止WEBAPP进程...\"\r"
        send "${KILL_WEBAPP_COMMAND}\r"
        
        # 启动gateway服务
        send "echo \"正在启动gateway服务...\"\r"
        send "cd ${TARGET_DIR}\r"
        send "export GATEWAY_API_PASSWORD=ms@123\r"
        send "nohup java -Dloader.path=lib -jar ${GATEWAY_JAR} --spring.config.location=config.yaml --server.port=3000 --gateway.cors-origin=* > gateway.log 2>&1 &\r"
        send "sleep 5\r"
        
		# 启动webapp服务
        send "echo \"正在启动webapp服务...\"\r"
        send "cd ${TARGET_WEBAPP_DIR}\r"
        send "nohup python -m http.server 5173 > webapp.log 2>&1 &\r"
        send "sleep 5\r"

        # 退出root会话
        send "exit\r"
        expect eof
    }
    timeout {
        puts "错误：获取root权限超时"
        exit 1
    }
}
EOF
    
    chmod +x "$expect_script"
	
    # 执行expect脚本
    echo ""
    print_info "正在执行权限切换和文件操作..."
    if "$expect_script"; then
        echo ""
        print_success "文件复制和权限设置完成！"

        # 检查服务状态
        print_info "检查Gateway服务状态..."
        if pgrep -f "gateway-service.jar" > /dev/null; then
            print_success "Gateway服务正在运行"
            echo "进程信息："
            ps -ef | grep "gateway-service.jar" | grep -v grep
        else
            print_warning "Gateway服务未运行，请检查日志"
        fi
		
        print_info "检查webapp服务状态..."
        if pgrep -f "http.server" > /dev/null; then
            print_success "Webapp服务正在运行"
            echo "进程信息："
            ps -ef | grep "http.server" | grep -v grep
        else
            print_warning "Webapp服务未运行，请检查日志"
        fi
    else
        echo ""
        print_error "操作失败！"
        exit 1
    fi
    
    # 清理临时文件
    rm -f "$expect_script"
    
    echo ""
    print_success "脚本执行完成"
}

# 处理命令行参数
CONFIG_FILE_ARG=""
BACKUP_MODE_ARG=""

while [[ $# -gt 0 ]]; do
    case $1 in
        --config)
            CONFIG_FILE_ARG="$2"
            shift 2
            ;;
        --verbose)
            LOG_LEVEL="verbose"
            shift
            ;;
        --debug)
            LOG_LEVEL="debug"
            shift
            ;;
        *)
            print_error "未知选项: $1"
            show_help
            exit 1
            ;;
    esac
done

# 应用命令行参数
if [ -n "$CONFIG_FILE_ARG" ]; then
    CONFIG_FILE="$CONFIG_FILE_ARG"
fi

# 执行主函数
main
