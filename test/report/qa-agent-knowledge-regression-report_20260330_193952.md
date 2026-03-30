# QA Agent Knowledge Regression Report
- 生成时间：2026-03-30 19:39:52 +08:00
- 状态：failed
- 计划轮次：50
- 已完成轮次：5
- 执行轮次上限：50
- Tool 成功率：100.00%
- Search 成功率：100.00%
- Fetch 成功率：100.00%
- Citation 覆盖率：100.00%
- Markdown 报告路径：`/Users/buyangnie/Documents/GitHub/ops-factory/test/report/qa-agent-knowledge-regression-report_20260330_193952.md`
- JSON 报告路径：`/Users/buyangnie/Documents/GitHub/ops-factory/test/report/qa-agent-knowledge-regression-report_20260330_193952.json`
- 失败原因：[R06] top 3 hits did not match expected doc 部署方案; got ["罗克韦尔自动化从智能制造到智能运维化工行业未来工厂52页.pdf","罗克韦尔自动化从智能制造到智能运维化工行业未来工厂52页.pdf","罗克韦尔自动化从智能制造到智能运维化工行业未来工厂52页.pdf"]
## 逐轮结果
| Round | Search | Fetch | Citations | Top Hits | Answer Preview |
| --- | --- | --- | --- | --- | --- |
| R01 | 1/1 | 1/1 | 1 | 部署方案.pdf / 部署方案.pdf / 部署方案.pdf | 根据《部署方案》，所有的介质和运行内容都放到**数据盘**。  具体路径包括： - `/data/{gateway_home}/docker` - `/data/{gateway_home}/langfuse` - `/data/{gateway_home}/onlyoffice` - `/data/{gateway_home}/logs`  其中 `{gateway_home}` 是网关的根目录占位符。 |
| R02 | 1/1 | 1/1 | 1 | 部署方案.pdf / Major_Incident_Analysis_INC20250115001_EN.docx / 部署方案.pdf | 根据《部署方案》，itsm-01 和 itsm-02 的操作系统均为 **EulerOS 2 SP12 x86**。 |
| R03 | 2/2 | 1/1 | 2 | 腾讯云2025智能化时代数据库自主可靠运维白皮书89页.pdf / 腾讯云2025智能化时代数据库自主可靠运维白皮书89页.pdf / 部署方案.pdf | 根据《部署方案》，ops-agent 的配置如下：  - **操作系统**：EulerOS 2 SP12 x86 - **硬件配置**：16C / 64G / 50G 系统盘 / 2T 数据盘 |
| R04 | 1/1 | 1/1 | 1 | 部署方案.pdf / 华为TMForum2024新一代智能运维白皮书2.0英文版82页.pdf / 华为TMForum2024新一代智能运维白皮书2.0英文版82页.pdf | 根据《部署方案》，llm-service-01 和 llm-service-02 的操作系统均为 **Ubuntu 20.04 x86**。 |
| R05 | 1/1 | 1/1 | 2 | 部署方案.pdf / 部署方案.pdf / 腾讯云2025智能化时代数据库自主可靠运维白皮书89页.pdf | 根据《部署方案》：  - **管理后台**：GDE 26.1 - **部署后台**：GKIT |