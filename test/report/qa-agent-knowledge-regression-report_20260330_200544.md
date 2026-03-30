# QA Agent Knowledge Regression Report
- 生成时间：2026-03-30 20:05:44 +08:00
- 状态：failed
- 计划轮次：20
- 已完成轮次：17
- 执行轮次上限：20
- Tool 成功率：100.00%
- Search 成功率：100.00%
- Fetch 成功率：100.00%
- Citation 覆盖率：100.00%
- Markdown 报告路径：`/Users/buyangnie/Documents/GitHub/ops-factory/test/report/qa-agent-knowledge-regression-report_20260330_200544.md`
- JSON 报告路径：`/Users/buyangnie/Documents/GitHub/ops-factory/test/report/qa-agent-knowledge-regression-report_20260330_200544.json`
- 失败原因：[R18] expected at least one search tool request
## 逐轮结果
| Round | Generated | Search | Fetch | Citations | Top Hits | Answer Preview |
| --- | --- | --- | --- | --- | --- | --- |
| R01 | yes | 1/1 | 1/1 | 1 | 部署方案.pdf / 部署方案.pdf / 部署方案.pdf | 根据《部署方案》，所有的介质和运行内容都放在**数据盘**。  具体路径为： - `/data/{gateway_home}/docker` - `/data/{gateway_home}/langfuse` - `/data/{gateway_home}/onlyoffice` - `/data/{gateway_home}/logs`  其中 `{gateway_home}` 是网关的根目录变量。 |
| R02 | yes | 1/1 | 1/1 | 1 | 部署方案.pdf / Major_Incident_Analysis_INC20250115001_EN.docx / 部署方案.pdf | 根据《部署方案》，itsm-01 和 itsm-02 的操作系统均为 **EulerOS 2 SP12 x86**。 |
| R03 | yes | 2/2 | 1/1 | 1 | 腾讯云2025智能化时代数据库自主可靠运维白皮书89页.pdf / 腾讯云2025智能化时代数据库自主可靠运维白皮书89页.pdf / 部署方案.pdf | 根据《部署方案》，ops-agent 的配置如下：  - **操作系统**：EulerOS 2 SP12 x86 - **硬件配置**：16C / 64G / 50G 系统盘 + 2T 数据盘  该节点用于智能体编排与平台配套服务。 |
| R04 | yes | 2/2 | 1/1 | 1 | 华为TMForum2024新一代智能运维白皮书2.0英文版82页.pdf / 部署方案.pdf / 华为TMForum2024新一代智能运维白皮书2.0英文版82页.pdf | 根据《部署方案》，llm-service-01 和 llm-service-02 的操作系统均为 **Ubuntu 20.04 x86**。 |
| R05 | yes | 1/1 | 1/1 | 1 | 部署方案.pdf / 部署方案.pdf / 腾讯云2025智能化时代数据库自主可靠运维白皮书89页.pdf | 根据《部署方案》：  - **管理后台**：GDE 26.1 - **部署后台**：GKIT  这两个后台的 IP 地址为 192.168.161.248，VIP 为 192.168.161.236。 |
| R06 | yes | 1/1 | 1/1 | 1 | 部署方案.pdf / 罗克韦尔自动化从智能制造到智能运维化工行业未来工厂52页.pdf / 罗克韦尔自动化从智能制造到智能运维化工行业未来工厂52页.pdf | 根据《部署方案》，运维智能体网关对应的组件名和版本是：  - **组件名**：Gateway - **版本**：0.1  即 **Gateway 0.1**。 |
| R07 | yes | 1/1 | 1/1 | 1 | Qwen3-32+模型服务性能测试结果（Agent场景）.pdf / 部署方案.pdf / 罗克韦尔自动化从智能制造到智能运维化工行业未来工厂52页.pdf | 根据《部署方案》：  - **QA 模型**：Qwen3.5-35B-A3B (qa) - **Embedding 模型**：Qwen3-Embedding-0.6B  这两个模型部署在 llm-service-01 节点上，使用 vLLM 推理服务。 |
| R08 | yes | 2/2 | 1/1 | 3 | Qwen3-32+模型服务性能测试结果（Agent场景）.pdf / Qwen3-32+模型服务性能测试结果（Agent场景）.pdf / 腾讯云2025智能化时代数据库自主可靠运维白皮书89页.pdf | 根据《部署方案》中的信息，Universal 推理服务的配置如下：  - **GPU 分配**: GPU0-3 -> Universal  - **TP**: 4  - **MaxLen**: 65536   该服务使用 Qwen3.5-35B-A3B (universal) 模型，部署在 llm-service-02 节点上，配备 4 张 Tesla V100S-PCIE-32GB GPU。 |
| R09 | yes | 2/2 | 2/2 | 1 | Major_Incident_Analysis_INC20250115001_EN.docx / Comprehensive_Quality_Report.xlsx / Comprehensive_Quality_Report.xlsx | 根据《Major Incident Analysis Report》，事件编号是：  **INC20250115001**   该事件标题为"核心交易数据库主节点宕机导致全站交易中断"。 |
| R10 | yes | 1/1 | 1/1 | 3 | Major_Incident_Analysis_INC20250115001_EN.docx / Major_Incident_Analysis_INC20250115001_EN.docx / Comprehensive_Quality_Report.xlsx | 根据《Major Incident Analysis Report》，该事件的优先级、类别和状态分别是：  - **优先级 (Priority)**: P1  - **类别 (Category)**: Database  - **状态 (Status)**: Resolved  |
| R11 | yes | 1/1 | 1/1 | 2 | Major_Incident_Analysis_INC20250115001_EN.docx / Comprehensive_Quality_Report.xlsx / Major_Incident_Analysis_INC20250115001_EN.docx | 根据《Major Incident Analysis Report》，事件的创建时间和解决时间分别是：  - **创建时间 (Created At)**: 2025-01-15 09:15  - **解决时间 (Resolved At)**: 2025-01-15 12:45   事件持续时长为 3.5 小时。 |
| R12 | yes | 1/1 | 1/1 | 3 | Major_Incident_Analysis_INC20250115001_EN.docx / Comprehensive_Quality_Report.xlsx / Major_Incident_Analysis_INC20250115001_EN.docx | 根据《Major Incident Analysis Report》，事件的持续时间和 SLA 状态如下：  - **持续时间 (Duration)**: 3.5 小时  - **Response Time SLA**: Met (满足)  - **Resolution Time SLA**: Violated (违反)   响应时间为 1 分钟（满足 15 分钟 SLA 目标），但解决时间 3.5 小时超过了 2 小时的 SLA 目标 |
| R13 | yes | 1/1 | 1/1 | 1 | Major_Incident_Analysis_INC20250115001_EN.docx / Major_Incident_Analysis_INC20250115001_EN.docx / Comprehensive_Quality_Report.xlsx | 根据《Major Incident Analysis Report》，受影响的系统包括：  - 交易系统 - 订单服务 - 支付网关 - 用户中心 - 商户后台   |
| R14 | yes | 1/1 | 1/1 | 1 | Major_Incident_Analysis_INC20250115001_EN.docx / 腾讯云2025智能化时代数据库自主可靠运维白皮书89页.pdf / 腾讯云2025智能化时代数据库自主可靠运维白皮书89页.pdf | 根据《Major Incident Analysis Report》，09:15 的自动告警发现的具体异常是：  **核心交易数据库连接失败率 > 90%，主节点无响应**  |
| R15 | yes | 1/1 | 1/1 | 2 | 华为TMForum2024新一代智能运维白皮书2.0英文版82页.pdf / Major_Incident_Analysis_INC20250115001_EN.docx / 华为TMForum2024新一代智能运维白皮书2.0英文版82页.pdf | 根据《Major Incident Analysis Report》，09:16 工单被自动分配给了：  - **人员**: 李明  - **角色**: L1 值班 (L1 运维值班人员)  |
| R16 | yes | 1/1 | 1/1 | 1 | Major_Incident_Analysis_INC20250115001_EN.docx / 罗克韦尔自动化从智能制造到智能运维化工行业未来工厂52页.pdf / 腾讯云2025智能化时代数据库自主可靠运维白皮书89页.pdf | 根据《Major Incident Analysis Report》，09:25 从 L1 运维升级到 L2 DBA 团队的原因是：  **需要 DBA 专家介入处理数据库故障切换**   在此之前，李明（L1 值班）在 09:22 尝试连接主节点失败，SSH 无响应，确认问题超出 L1 运维能力范围，需要 DBA 专家处理。 |
| R17 | yes | 1/1 | 1/1 | 1 | 腾讯云2025智能化时代数据库自主可靠运维白皮书89页.pdf / 腾讯云2025智能化时代数据库自主可靠运维白皮书89页.pdf / Major_Incident_Analysis_INC20250115001_EN.docx | 根据《Major Incident Analysis Report》的 Timeline 记录：  **09:35 发现的数据同步问题：**  高级 DBA 张伟在准备执行主从切换时，**发现从节点数据同步延迟约 5 分钟，需要评估数据丢失风险**。  这一发现导致后续在 09:40 将事件升级至架构师和业务负责人，需要业务方决策是否接受可能的数据丢失进行切换。最终业务负责人评估每分钟损失约 50 万交易额后，决定接受切换风险。 |