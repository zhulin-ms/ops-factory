# QA Agent Knowledge Regression Report
- 生成时间：2026-03-30 20:07:17 +08:00
- 状态：passed
- 计划轮次：20
- 已完成轮次：20
- 执行轮次上限：20
- Tool 成功率：100.00%
- Search 成功率：100.00%
- Fetch 成功率：100.00%
- Citation 覆盖率：100.00%
- Markdown 报告路径：`/Users/buyangnie/Documents/GitHub/ops-factory/test/report/qa-agent-knowledge-regression-report_20260330_195922.md`
- JSON 报告路径：`/Users/buyangnie/Documents/GitHub/ops-factory/test/report/qa-agent-knowledge-regression-report_20260330_195922.json`
## 逐轮结果
| Round | Generated | Search | Fetch | Citations | Top Hits | Answer Preview |
| --- | --- | --- | --- | --- | --- | --- |
| R01 | yes | 1/1 | 1/1 | 1 | 部署方案.pdf / 部署方案.pdf / 部署方案.pdf | 根据《部署方案》，所有的介质和运行内容都放在**数据盘**。  具体路径为： - `/data/{gateway_home}/docker` - `/data/{gateway_home}/langfuse` - `/data/{gateway_home}/onlyoffice` - `/data/{gateway_home}/logs`  其中 `{gateway_home}` 是网关的根目录变量。 |
| R02 | yes | 1/1 | 1/1 | 1 | 部署方案.pdf / Major_Incident_Analysis_INC20250115001_EN.docx / 部署方案.pdf | 根据《部署方案》，itsm-01 和 itsm-02 的操作系统均为 **EulerOS 2 SP12 x86**。 |
| R03 | yes | 1/1 | 1/1 | 1 | 腾讯云2025智能化时代数据库自主可靠运维白皮书89页.pdf / 腾讯云2025智能化时代数据库自主可靠运维白皮书89页.pdf / 部署方案.pdf | 根据《部署方案》，ops-agent 的配置如下：  - **操作系统**：EulerOS 2 SP12 x86 - **硬件配置**：16C / 64G / 50G 系统盘 / 2T 数据盘 |
| R04 | yes | 1/1 | 1/1 | 1 | 华为TMForum2024新一代智能运维白皮书2.0英文版82页.pdf / 部署方案.pdf / 华为TMForum2024新一代智能运维白皮书2.0英文版82页.pdf | 根据《部署方案》，llm-service-01 和 llm-service-02 的操作系统均为 **Ubuntu 20.04 x86**。 |
| R05 | yes | 1/1 | 1/1 | 2 | 部署方案.pdf / 部署方案.pdf / 腾讯云2025智能化时代数据库自主可靠运维白皮书89页.pdf | 根据《部署方案》：  - **管理后台**：GDE 26.1 - **部署后台**：GKIT |
| R06 | yes | 1/1 | 1/1 | 1 | 部署方案.pdf / 罗克韦尔自动化从智能制造到智能运维化工行业未来工厂52页.pdf / 罗克韦尔自动化从智能制造到智能运维化工行业未来工厂52页.pdf | 根据《部署方案》，运维智能体网关对应的组件名和版本为：  - **组件名**：Gateway - **版本**：0.1 |
| R07 | yes | 1/1 | 1/1 | 2 | Qwen3-32+模型服务性能测试结果（Agent场景）.pdf / 部署方案.pdf / 罗克韦尔自动化从智能制造到智能运维化工行业未来工厂52页.pdf | 根据《部署方案》：  - **QA 模型**：Qwen3.5-35B-A3B (qa) - **Embedding 模型**：Qwen3-Embedding-0.6B |
| R08 | yes | 2/2 | 2/2 | 1 | Qwen3-32+模型服务性能测试结果（Agent场景）.pdf / Qwen3-32+模型服务性能测试结果（Agent场景）.pdf / 腾讯云2025智能化时代数据库自主可靠运维白皮书89页.pdf | 根据《部署方案》，Universal 推理服务的配置为：  - **GPU 分配**：GPU0-3 - **TP**：4 - **MaxLen**：65536 |
| R09 | yes | 1/1 | 1/1 | 1 | Major_Incident_Analysis_INC20250115001_EN.docx / Comprehensive_Quality_Report.xlsx / Comprehensive_Quality_Report.xlsx | 根据《Major Incident Analysis Report》，事件编号是 **INC20250115001**。 |
| R10 | yes | 1/1 | 1/1 | 1 | Major_Incident_Analysis_INC20250115001_EN.docx / Major_Incident_Analysis_INC20250115001_EN.docx / Comprehensive_Quality_Report.xlsx | 根据《Major Incident Analysis Report》，该事件的优先级、类别和状态分别为：  - **优先级 (Priority)**：P1 - **类别 (Category)**：Database - **状态 (Status)**：Resolved |
| R11 | yes | 1/1 | 1/1 | 1 | Comprehensive_Quality_Report.xlsx / Comprehensive_Quality_Report.xlsx / Comprehensive_Quality_Report.xlsx | 根据《Major Incident Analysis Report》，事件的创建时间和解决时间分别为：  - **创建时间 (Created At)**：2025-01-15 09:15 - **解决时间 (Resolved At)**：2025-01-15 12:45 |
| R12 | yes | 1/1 | 1/1 | 1 | Major_Incident_Analysis_INC20250115001_EN.docx / Comprehensive_Quality_Report.xlsx / Major_Incident_Analysis_INC20250115001_EN.docx | 根据《Major Incident Analysis Report》，事件的持续时间和 SLA 状态分别为：  - **持续时间 (Duration)**：3.5 hours - **Response Time SLA**：Met - **Resolution Time SLA**：Violated |
| R13 | yes | 1/1 | 1/1 | 1 | Major_Incident_Analysis_INC20250115001_EN.docx / Major_Incident_Analysis_INC20250115001_EN.docx / Comprehensive_Quality_Report.xlsx | 根据《Major Incident Analysis Report》，受影响的系统包括：  - 交易系统 - 订单服务 - 支付网关 - 用户中心 - 商户后台 |
| R14 | yes | 1/1 | 1/1 | 1 | Major_Incident_Analysis_INC20250115001_EN.docx / 腾讯云2025智能化时代数据库自主可靠运维白皮书89页.pdf / 腾讯云2025智能化时代数据库自主可靠运维白皮书89页.pdf | 根据《Major Incident Analysis Report》，09:15 的自动告警发现的异常为：  - **核心交易数据库连接失败率 > 90%** - **主节点无响应** |
| R15 | yes | 1/1 | 1/1 | 1 | 腾讯云2025智能化时代数据库自主可靠运维白皮书89页.pdf / Major_Incident_Analysis_INC20250115001_EN.docx / 腾讯云2025智能化时代数据库自主可靠运维白皮书89页.pdf | 根据《Major Incident Analysis Report》，09:16 工单被自动分配给了：  - **人员**：李明 - **角色**：L1 值班 |
| R16 | yes | 1/1 | 1/1 | 1 | Major_Incident_Analysis_INC20250115001_EN.docx / 罗克韦尔自动化从智能制造到智能运维化工行业未来工厂52页.pdf / 腾讯云2025智能化时代数据库自主可靠运维白皮书89页.pdf | 根据《Major Incident Analysis Report》，09:25 从 L1 运维升级到 L2 DBA 团队的原因是：  **需要 DBA 专家介入处理数据库故障切换**  L1 运维人员李明在 09:22 尝试连接主节点失败，SSH 无响应，确认需要专业的数据库管理员来处理数据库故障切换操作。 |
| R17 | yes | 1/1 | 1/1 | 1 | 腾讯云2025智能化时代数据库自主可靠运维白皮书89页.pdf / 腾讯云2025智能化时代数据库自主可靠运维白皮书89页.pdf / 腾讯云2025智能化时代数据库自主可靠运维白皮书89页.pdf | 根据《Major Incident Analysis Report》，09:35 发现的数据同步问题是：  **从节点数据同步延迟约 5 分钟，需要评估数据丢失风险** |
| R18 | yes | 1/1 | 1/1 | 1 | Major_Incident_Analysis_INC20250115001_EN.docx / 腾讯云2025智能化时代数据库自主可靠运维白皮书89页.pdf / 腾讯云2025智能化时代数据库自主可靠运维白皮书89页.pdf | 根据《Major Incident Analysis Report》，09:45 业务负责人（王总监）的决策依据和决定为：  - **业务影响**：当前每分钟损失约 50 万交易额 - **决定**：接受切换风险 |
| R19 | yes | 1/1 | 1/1 | 1 | Major_Incident_Analysis_INC20250115001_EN.docx / 腾讯云2025智能化时代数据库自主可靠运维白皮书89页.pdf / 腾讯云2025智能化时代数据库自主可靠运维白皮书89页.pdf | 根据《Major Incident Analysis Report》，10:15 发现了：  **约 2000 笔交易数据不一致，需要从备份恢复** |
| R20 | yes | 1/1 | 1/1 | 1 | 腾讯云2025智能化时代数据库自主可靠运维白皮书89页.pdf / Major_Incident_Analysis_INC20250115001_EN.docx / 腾讯云2025智能化时代数据库自主可靠运维白皮书89页.pdf | 根据《Major Incident Analysis Report》，10:20 数据恢复工作转交给了：  - **转交给**：陈芳 (数据恢复专家) - **目的**：数据恢复工作交给专业人员处理 |