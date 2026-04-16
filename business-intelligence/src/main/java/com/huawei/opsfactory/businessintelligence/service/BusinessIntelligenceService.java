package com.huawei.opsfactory.businessintelligence.service;

import com.huawei.opsfactory.businessintelligence.config.BusinessIntelligenceRuntimeProperties;
import com.huawei.opsfactory.businessintelligence.datasource.BiDataProvider;
import com.huawei.opsfactory.businessintelligence.datasource.BiRawData;
import com.huawei.opsfactory.businessintelligence.model.BiModels;
import com.huawei.opsfactory.businessintelligence.model.BiModels.ChartConfig;
import com.huawei.opsfactory.businessintelligence.model.BiModels.ChartDatum;
import com.huawei.opsfactory.businessintelligence.model.BiModels.ChartSection;
import com.huawei.opsfactory.businessintelligence.model.BiModels.MetricCard;
import com.huawei.opsfactory.businessintelligence.model.BiModels.Snapshot;
import com.huawei.opsfactory.businessintelligence.model.BiModels.TabContent;
import com.huawei.opsfactory.businessintelligence.model.BiModels.TabMeta;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.YearMonth;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeParseException;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.TreeSet;
import java.util.concurrent.atomic.AtomicReference;
import java.util.function.Function;
import java.util.stream.Collectors;
import org.apache.poi.ss.usermodel.Cell;
import org.apache.poi.ss.usermodel.Row;
import org.apache.poi.xssf.usermodel.XSSFSheet;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

@Service
public class BusinessIntelligenceService {

    private static final Logger log = LoggerFactory.getLogger(BusinessIntelligenceService.class);

    private static final List<TabMeta> TABS = List.of(
        new TabMeta("executive-summary", "执行摘要"),
        new TabMeta("sla-analysis", "SLA分析"),
        new TabMeta("incident-analysis", "事件分析"),
        new TabMeta("change-analysis", "变更分析"),
        new TabMeta("request-analysis", "请求分析"),
        new TabMeta("problem-analysis", "问题分析"),
        new TabMeta("cross-process", "跨流程关联"),
        new TabMeta("personnel-efficiency", "人员与效率")
    );
    private static final List<DateTimeFormatter> DATE_TIME_FORMATTERS = List.of(
        DateTimeFormatter.ISO_DATE_TIME,
        DateTimeFormatter.ofPattern("M/d/yyyy H:mm"),
        DateTimeFormatter.ofPattern("M/d/yyyy H:mm:ss"),
        DateTimeFormatter.ofPattern("M/d/yyyy h:mm:ss a", Locale.ENGLISH),
        DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss"),
        DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm")
    );
    private static final List<String> PRIORITY_ORDER = List.of("P1", "P2", "P3", "P4");

    private final BiDataProvider dataProvider;
    private final BusinessIntelligenceRuntimeProperties runtimeProperties;
    private final AtomicReference<Snapshot> cache = new AtomicReference<>();

    private record IncidentSlaRecord(
        String orderNumber,
        String orderName,
        String priority,
        String category,
        String resolver,
        LocalDateTime beginDate,
        double responseMinutes,
        double resolutionMinutes,
        boolean responseMet,
        boolean resolutionMet
    ) {
        private boolean overallMet() {
            return responseMet && resolutionMet;
        }

        private boolean anyBreached() {
            return !overallMet();
        }

        private String violationType() {
            if (!responseMet && !resolutionMet) {
                return "双违约";
            }
            if (!responseMet) {
                return "响应违约";
            }
            if (!resolutionMet) {
                return "解决违约";
            }
            return "达标";
        }
    }

    public BusinessIntelligenceService(BiDataProvider dataProvider, BusinessIntelligenceRuntimeProperties runtimeProperties) {
        this.dataProvider = dataProvider;
        this.runtimeProperties = runtimeProperties;
    }

    public Snapshot getOverview(String startDate, String endDate) {
        // Always refresh when date range is specified
        if (startDate != null || endDate != null) {
            return refresh(startDate, endDate);
        }
        Snapshot snapshot = cache.get();
        if (snapshot != null && runtimeProperties.isCacheEnabled()) {
            log.debug(
                "Returning cached business intelligence snapshot refreshedAt={} tabCount={}",
                snapshot.refreshedAt(),
                snapshot.tabs().size()
            );
            return snapshot;
        }
        return refresh(null, null);
    }

    public Snapshot getOverview() {
        return getOverview(null, null);
    }

    public synchronized Snapshot refresh(String startDate, String endDate) {
        long startedAt = System.currentTimeMillis();
        try {
            BiRawData rawData = dataProvider.load();
            // Filter data by date range if specified
            BiRawData filteredData = filterByDateRange(rawData, startDate, endDate);
            Snapshot snapshot = buildSnapshot(filteredData);
            // Only cache if no date filter is applied
            if (startDate == null && endDate == null) {
                cache.set(snapshot);
            }
            log.info(
                "Refreshed business intelligence snapshot incidents={} incidentSlaCriteria={} changes={} requests={} problems={} tabCount={} startDate={} endDate={} durationMs={}",
                filteredData.incidents().size(),
                filteredData.incidentSlaCriteria().size(),
                filteredData.changes().size(),
                filteredData.requests().size(),
                filteredData.problems().size(),
                snapshot.tabs().size(),
                startDate,
                endDate,
                System.currentTimeMillis() - startedAt
            );
            return snapshot;
        } catch (RuntimeException ex) {
            log.error(
                "Failed to refresh business intelligence snapshot startDate={} endDate={} durationMs={}",
                startDate,
                endDate,
                System.currentTimeMillis() - startedAt,
                ex
            );
            throw ex;
        }
    }

    public synchronized Snapshot refresh() {
        return refresh(null, null);
    }

    private BiRawData filterByDateRange(BiRawData rawData, String startDate, String endDate) {
        if (startDate == null && endDate == null) {
            return rawData;
        }

        LocalDate start = startDate != null ? LocalDate.parse(startDate) : null;
        LocalDate end = endDate != null ? LocalDate.parse(endDate) : null;

        // Filter incidents
        List<Map<String, String>> filteredIncidents = rawData.incidents().stream()
            .filter(row -> isWithinDateRange(row.get("Begin Date"), start, end))
            .collect(Collectors.toList());

        // Filter incident SLA criteria (keep all, as they are reference data)
        List<Map<String, String>> filteredIncidentSlaCriteria = rawData.incidentSlaCriteria();

        // Filter changes
        List<Map<String, String>> filteredChanges = rawData.changes().stream()
            .filter(row -> isWithinDateRange(row.get("Planned Start"), start, end))
            .collect(Collectors.toList());

        // Filter requests
        List<Map<String, String>> filteredRequests = rawData.requests().stream()
            .filter(row -> isWithinDateRange(row.get("Requested Date"), start, end))
            .collect(Collectors.toList());

        // Filter problems
        List<Map<String, String>> filteredProblems = rawData.problems().stream()
            .filter(row -> isWithinDateRange(row.get("Logged Date"), start, end))
            .collect(Collectors.toList());

        return new BiRawData(filteredIncidents, filteredIncidentSlaCriteria, filteredChanges, filteredRequests, filteredProblems);
    }

    private boolean isWithinDateRange(String dateStr, LocalDate start, LocalDate end) {
        if (dateStr == null || dateStr.isBlank()) {
            return true;
        }
        LocalDateTime dateTime = parseDate(dateStr);
        if (dateTime == null) {
            return true;
        }
        LocalDate date = dateTime.toLocalDate();
        if (start != null && date.isBefore(start)) {
            return false;
        }
        if (end != null && date.isAfter(end)) {
            return false;
        }
        return true;
    }

    public TabContent getTab(String tabId, String granularity) {
        // For incident-analysis with granularity, rebuild dynamically
        if ("incident-analysis".equals(tabId) && granularity != null) {
            BiRawData rawData = dataProvider.load();
            return buildIncidentAnalysis(rawData, granularity);
        }
        // For other tabs or default granularity, use cached snapshot
        Snapshot snapshot = getOverview(null, null);
        TabContent content = snapshot.tabContents().get(tabId);
        if (content == null) {
            throw new IllegalArgumentException("Unknown tab: " + tabId);
        }
        log.debug("Resolved business intelligence tab tabId={} label={} granularity={}", tabId, content.label(), granularity);
        return content;
    }

    public TabContent getTab(String tabId) {
        return getTab(tabId, null);
    }

    public byte[] exportCurrentWorkbook() {
        Snapshot snapshot = getOverview(null, null);
        long startedAt = System.currentTimeMillis();
        try (XSSFWorkbook workbook = new XSSFWorkbook();
             ByteArrayOutputStream outputStream = new ByteArrayOutputStream()) {
            for (TabMeta tab : snapshot.tabs()) {
                TabContent content = snapshot.tabContents().get(tab.id());
                if (content == null) {
                    continue;
                }
                XSSFSheet sheet = workbook.createSheet(safeSheetName(content.label()));
                int rowIndex = 0;
                rowIndex = writeTitle(sheet, rowIndex, content.label(), content.description());
                rowIndex = writeCards(sheet, rowIndex, content.cards());
                rowIndex = writeCharts(sheet, rowIndex, content.charts());
                writeTables(sheet, rowIndex, content.tables());
                for (int columnIndex = 0; columnIndex < 8; columnIndex++) {
                    sheet.autoSizeColumn(columnIndex);
                }
            }
            workbook.write(outputStream);
            byte[] bytes = outputStream.toByteArray();
            log.info(
                "Exported business intelligence workbook refreshedAt={} tabCount={} byteSize={} durationMs={}",
                snapshot.refreshedAt(),
                snapshot.tabs().size(),
                bytes.length,
                System.currentTimeMillis() - startedAt
            );
            return bytes;
        } catch (IOException exception) {
            log.error(
                "Failed to export business intelligence workbook refreshedAt={} tabCount={} durationMs={}",
                snapshot.refreshedAt(),
                snapshot.tabs().size(),
                System.currentTimeMillis() - startedAt,
                exception
            );
            throw new IllegalStateException("Failed to export business intelligence workbook", exception);
        }
    }

    private Snapshot buildSnapshot(BiRawData rawData) {
        Map<String, TabContent> contents = new LinkedHashMap<>();
        contents.put("executive-summary", buildExecutiveSummary(rawData));
        contents.put("sla-analysis", buildSlaAnalysis(rawData));
        contents.put("incident-analysis", buildIncidentAnalysis(rawData));
        contents.put("change-analysis", buildChangeAnalysis(rawData));
        contents.put("request-analysis", buildRequestAnalysis(rawData));
        contents.put("problem-analysis", buildProblemAnalysis(rawData));
        contents.put("cross-process", buildCrossProcess(rawData));
        contents.put("personnel-efficiency", buildPersonnelEfficiency(rawData));
        return new Snapshot(Instant.now(), TABS, contents);
    }

    private TabContent buildExecutiveSummary(BiRawData rawData) {
        long incidentSlaBreached = countByValue(rawData.incidents(), "SLA Compliant", "No");
        long changeFailures = rawData.changes().stream().filter(row -> !isYes(row.get("Success"))).count();
        long requestOpen = rawData.requests().stream().filter(row -> !"Fulfilled".equalsIgnoreCase(clean(row.get("Status")))).count();
        long problemOpen = rawData.problems().stream().filter(row -> !matchesAny(clean(row.get("Status")), List.of("Resolved", "Closed"))).count();

        return new TabContent(
            "executive-summary",
            "执行摘要",
            "聚合四类 ITIL 数据的核心规模与风险摘要。",
            buildExecutiveSummaryContent(rawData, incidentSlaBreached, changeFailures, requestOpen, problemOpen),
            null,
            List.of(
                card("incident-sla-rate", "事件 SLA 达成率", percentage(countByValue(rawData.incidents(), "SLA Compliant", "Yes"), rawData.incidents().size()), toneFromScore(percentageValue(countByValue(rawData.incidents(), "SLA Compliant", "Yes"), rawData.incidents().size()), 0.9, 0.75)),
                card("incident-mttr", "MTTR", formatHours(average(rawData.incidents(), "Resolution Time(m)") / 60.0), toneFromInverse(average(rawData.incidents(), "Resolution Time(m)") / 60.0, 12, 24)),
                card("change-success-rate", "变更成功率", percentage(countByValue(rawData.changes(), "Success", "Yes"), rawData.changes().size()), toneFromScore(percentageValue(countByValue(rawData.changes(), "Success", "Yes"), rawData.changes().size()), 0.9, 0.8)),
                card("change-incident-rate", "变更致事件率", percentage(countByValue(rawData.changes(), "Incident Caused", "Yes"), rawData.changes().size()), toneFromInverse(percentageValue(countByValue(rawData.changes(), "Incident Caused", "Yes"), rawData.changes().size()), 0.05, 0.1)),
                card("request-csat", "请求满意度", formatNumber(average(rawData.requests(), "Satisfaction Score")), toneFromScore(average(rawData.requests(), "Satisfaction Score") / 5.0, 0.8, 0.7)),
                card("problem-closure-rate", "问题关闭率", percentage(rawData.problems().stream().filter(row -> matchesAny(clean(row.get("Status")), List.of("Resolved", "Closed"))).count(), rawData.problems().size()), toneFromScore(percentageValue(rawData.problems().stream().filter(row -> matchesAny(clean(row.get("Status")), List.of("Resolved", "Closed"))).count(), rawData.problems().size()), 0.75, 0.55))
            ),
            List.of(),
            List.of(
                table("summary-risks", "关键关注项", List.of("指标", "当前值", "说明"), List.of(
                    List.of("事件 SLA 违约", String.valueOf(incidentSlaBreached), "基于 incidents 数据中的 SLA Compliant=No"),
                    List.of("失败变更", String.valueOf(changeFailures), "基于 changes 数据中的 Success!=Yes"),
                    List.of("未完成请求", String.valueOf(requestOpen), "基于 requests 的非 Fulfilled 状态"),
                    List.of("未关闭问题", String.valueOf(problemOpen), "基于 problems 的非 Resolved/Closed 状态")
                ))
            )
        );
    }

    private TabContent buildSlaAnalysis(BiRawData rawData) {
        List<IncidentSlaRecord> incidents = buildIncidentSlaRecords(rawData);
        BiModels.SlaAnalysisSummary summary = buildSlaAnalysisSummary(incidents);
        return new TabContent(
            "sla-analysis",
            "SLA分析",
            "多维度观察事件SLA履约情况，并进行违约情况分析。",
            null,
            summary,
            List.of(
                card("sla-overall", "综合达成率", summary.hero().overallComplianceRate(), toneFromRate(summary.hero().overallComplianceRate())),
                card("sla-response", "响应达成率", summary.hero().responseComplianceRate(), summary.response().tone()),
                card("sla-resolution", "解决达成率", summary.hero().resolutionComplianceRate(), summary.resolution().tone()),
                card("sla-high-priority", "P1/P2达成率", summary.hero().highPriorityComplianceRate(), toneFromRate(summary.hero().highPriorityComplianceRate())),
                card("sla-response-breached", "响应违约数", summary.violationBreakdown().responseBreached(), summary.violationBreakdown().responseBreached() > 0 ? "warning" : "success"),
                card("sla-resolution-breached", "解决违约数", summary.violationBreakdown().resolutionBreached(), summary.violationBreakdown().resolutionBreached() > 0 ? "warning" : "success")
            ),
            List.of(
                lineChart("sla-trend", "SLA达成率趋势", buildSlaWeeklyTrendData(incidents),
                    List.of("响应达成率", "解决达成率", "P1/P2达成率"),
                    List.of("#10b981", "#5b8db8", "#f59e0b")),
                new ChartSection("priority-comparison", "优先级SLA达成率对比", "grouped-bar",
                    summary.priorityRows().stream()
                        .map(row -> new ChartDatum(
                            row.priority() + "|" + String.format("%.1f", parsePercentage(row.responseComplianceRate())) + "|" + String.format("%.1f", parsePercentage(row.resolutionComplianceRate())),
                            parsePercentage(row.responseComplianceRate())))
                        .toList(),
                    new ChartConfig(List.of("响应达成率", "解决达成率"), null, List.of("#10b981", "#5b8db8"), "优先级", "达成率(%)")),
                pieChart("violation-by-priority", "违约优先级分布",
                    incidents.stream()
                        .filter(IncidentSlaRecord::anyBreached)
                        .collect(Collectors.groupingBy(IncidentSlaRecord::priority, LinkedHashMap::new, Collectors.counting()))
                        .entrySet().stream()
                        .sorted(Map.Entry.<String, Long>comparingByValue().reversed())
                        .map(e -> new ChartDatum(e.getKey(), e.getValue()))
                        .toList(),
                    List.of("#ef4444", "#f59e0b", "#eab308", "#10b981")),
                pieChart("violation-by-category", "违约事件类型分布",
                    incidents.stream()
                        .filter(IncidentSlaRecord::anyBreached)
                        .collect(Collectors.groupingBy(r -> defaultLabel(r.category(), "未标注"), LinkedHashMap::new, Collectors.counting()))
                        .entrySet().stream()
                        .sorted(Map.Entry.<String, Long>comparingByValue().reversed())
                        .limit(8)
                        .map(e -> new ChartDatum(e.getKey(), e.getValue()))
                        .toList(),
                    List.of("#5b8db8", "#10b981", "#f59e0b", "#ef4444", "#8b7fc7", "#c97082", "#5e9bb5", "#7ca65a"))
            ),
            List.of(
                table("sla-violation-samples", "违约样本", List.of("编号", "标题", "优先级", "类别", "处理人", "响应时长", "解决时长", "违约类型"), summary.violationSamples().stream()
                    .map(sample -> List.of(
                        sample.orderNumber(),
                        sample.orderName(),
                        sample.priority(),
                        sample.category(),
                        sample.resolver(),
                        sample.responseDuration(),
                        sample.resolutionDuration(),
                        sample.violationType()
                    )).toList())
            )
        );
    }

    private TabContent buildIncidentAnalysis(BiRawData rawData) {
        return buildIncidentAnalysis(rawData, "weekly");
    }

    private TabContent buildIncidentAnalysis(BiRawData rawData, String granularity) {
        List<Map<String, String>> incidents = rawData.incidents();
        long totalCount = incidents.size();
        long p1p2Count = incidents.stream().filter(row -> matchesAny(clean(row.get("Priority")), List.of("P1", "P2"))).count();
        long openCount = incidents.stream().filter(row -> !matchesAny(clean(row.get("Order Status")), List.of("Completed", "Resolved", "Closed"))).count();

        // Use calculated SLA from IncidentSlaRecord instead of raw "SLA Compliant" field
        List<IncidentSlaRecord> slaRecords = buildIncidentSlaRecords(rawData);
        long slaMetCount = slaRecords.stream().filter(IncidentSlaRecord::overallMet).count();
        long slaTotalCount = slaRecords.size();

        double avgMttrHours = average(incidents, "Resolution Time(m)") / 60.0;
        double avgP1p2MttrHours = incidents.stream()
            .filter(row -> matchesAny(clean(row.get("Priority")), List.of("P1", "P2")))
            .mapToDouble(row -> parseDouble(row.get("Resolution Time(m)")))
            .filter(v -> v > 0)
            .average().orElse(0) / 60.0;

        // Build trend data based on granularity
        List<ChartDatum> volumeTrend = buildVolumeTrend(incidents, slaRecords, granularity);
        List<ChartDatum> mttrTrend = buildMttrTrend(incidents, granularity);

        return new TabContent(
            "incident-analysis",
            "事件分析",
            "基于事件工单数据，分析事件管理的关键KPI、趋势变化以及类型分布。",
            null,
            null,
            List.of(
                card("incident-total", "事件总数", formatNumber(totalCount), "neutral"),
                card("incident-p1p2", "P1/P2 事件", formatNumber(p1p2Count), p1p2Count > totalCount * 0.15 ? "warning" : "success"),
                card("incident-open", "未解决事件", formatNumber(openCount), openCount > totalCount * 0.3 ? "warning" : "success"),
                card("incident-sla", "SLA 达成率", percentage(slaMetCount, slaTotalCount), toneFromScore(percentageValue(slaMetCount, slaTotalCount), 0.9, 0.75)),
                card("incident-p1p2-mttr", "P1/P2 MTTR", formatHours(avgP1p2MttrHours), toneFromInverse(avgP1p2MttrHours, 8, 24)),
                card("incident-mttr", "平均 MTTR", formatHours(avgMttrHours), toneFromInverse(avgMttrHours, 24, 48))
            ),
            List.of(
                comboChart("incident-volume-trend", "事件单量趋势", volumeTrend,
                    List.of("事件单量", "SLA达成率(%)"), List.of("#5b8db8", "#10b981")),
                lineChart("incident-mttr-trend", "处理时长趋势", mttrTrend,
                    List.of("平均MTTR", "P1/P2 MTTR"), List.of("#5b8db8", "#ef4444")),
                pieChart("incident-priority-pie", "优先级分布", topCounts(incidents, "Priority", 4),
                    List.of("#ef4444", "#f59e0b", "#eab308", "#10b981")),
                pieChart("incident-category-pie", "事件类型分布", topCounts(incidents, "Category", 8),
                    List.of("#5b8db8", "#10b981", "#f59e0b", "#ef4444", "#8b7fc7", "#c97082", "#5e9bb5", "#7ca65a"))
            ),
            List.of(
                table("incident-resolver-table", "处理人工作量 TOP10", List.of("处理人", "事件数"), rowsFromChart(topCounts(incidents, "Resolver", 10))),
                table("incident-recent-table", "事件样本", List.of("编号", "标题", "优先级", "处理人", "时长", "SLA"), incidents.stream()
                    .sorted((a, b) -> {
                        int priorityCompare = priorityIndex(clean(a.get("Priority"))) - priorityIndex(clean(b.get("Priority")));
                        if (priorityCompare != 0) return priorityCompare;
                        return Double.compare(parseDouble(b.get("Resolution Time(m)")), parseDouble(a.get("Resolution Time(m)")));
                    })
                    .limit(15)
                    .<List<String>>map(row -> List.of(
                        defaultLabel(row.get("Order Number"), "—"),
                        truncate(defaultLabel(row.get("Order Name"), "—"), 35),
                        defaultLabel(row.get("Priority"), "—"),
                        defaultLabel(row.get("Resolver"), "—"),
                        formatMinutes(parseDouble(row.get("Resolution Time(m)"))),
                        isYes(row.get("SLA Compliant")) ? "✓" : "✗"
                    )).toList())
            )
        );
    }

    private int priorityIndex(String priority) {
        return switch (priority.toUpperCase()) {
            case "P1" -> 1;
            case "P2" -> 2;
            case "P3" -> 3;
            case "P4" -> 4;
            default -> 5;
        };
    }

    private List<ChartDatum> buildVolumeTrend(List<Map<String, String>> incidents, List<IncidentSlaRecord> slaRecords, String granularity) {
        Map<String, Long> totalByPeriod = new LinkedHashMap<>();
        Map<String, Long> slaMetByPeriod = new LinkedHashMap<>();

        for (Map<String, String> row : incidents) {
            LocalDateTime beginDate = parseDate(row.get("Begin Date"));
            if (beginDate == null) continue;

            String periodLabel = formatPeriodLabel(beginDate, granularity);
            totalByPeriod.merge(periodLabel, 1L, Long::sum);
        }

        for (IncidentSlaRecord record : slaRecords) {
            if (record.beginDate() == null) continue;
            String periodLabel = formatPeriodLabel(record.beginDate(), granularity);
            if (record.overallMet()) {
                slaMetByPeriod.merge(periodLabel, 1L, Long::sum);
            }
        }

        Set<String> allPeriods = new TreeSet<>(totalByPeriod.keySet());

        List<ChartDatum> result = new ArrayList<>();
        for (String period : allPeriods) {
            long total = totalByPeriod.getOrDefault(period, 0L);
            long slaMet = slaMetByPeriod.getOrDefault(period, 0L);
            double slaRate = total > 0 ? (slaMet * 100.0 / total) : 0;
            result.add(new ChartDatum(period + "|" + total + "|" + String.format("%.1f", slaRate), total));
        }
        return result;
    }

    private List<ChartDatum> buildMttrTrend(List<Map<String, String>> incidents, String granularity) {
        Map<String, List<Double>> mttrByPeriod = new LinkedHashMap<>();
        Map<String, List<Double>> p1p2MttrByPeriod = new LinkedHashMap<>();

        for (Map<String, String> row : incidents) {
            LocalDateTime beginDate = parseDate(row.get("Begin Date"));
            if (beginDate == null) continue;

            String periodLabel = formatPeriodLabel(beginDate, granularity);
            double resolutionMinutes = parseDouble(row.get("Resolution Time(m)"));
            if (resolutionMinutes <= 0) continue;

            String priority = clean(row.get("Priority"));
            boolean isP1P2 = "P1".equalsIgnoreCase(priority) || "P2".equalsIgnoreCase(priority);

            mttrByPeriod.computeIfAbsent(periodLabel, k -> new ArrayList<>()).add(resolutionMinutes);
            if (isP1P2) {
                p1p2MttrByPeriod.computeIfAbsent(periodLabel, k -> new ArrayList<>()).add(resolutionMinutes);
            }
        }

        Set<String> allPeriods = new TreeSet<>();
        allPeriods.addAll(mttrByPeriod.keySet());
        allPeriods.addAll(p1p2MttrByPeriod.keySet());

        List<ChartDatum> result = new ArrayList<>();
        for (String period : allPeriods) {
            List<Double> mttrs = mttrByPeriod.getOrDefault(period, List.of());
            List<Double> p1p2Mttrs = p1p2MttrByPeriod.getOrDefault(period, List.of());
            double avgMttr = mttrs.isEmpty() ? 0 : mttrs.stream().mapToDouble(Double::doubleValue).average().orElse(0) / 60.0;
            double avgP1p2Mttr = p1p2Mttrs.isEmpty() ? 0 : p1p2Mttrs.stream().mapToDouble(Double::doubleValue).average().orElse(0) / 60.0;
            result.add(new ChartDatum(period + "|" + String.format("%.1f", avgMttr) + "|" + String.format("%.1f", avgP1p2Mttr), avgMttr));
        }
        return result;
    }

    private String formatPeriodLabel(LocalDateTime dateTime, String granularity) {
        if ("monthly".equals(granularity)) {
            return dateTime.format(DateTimeFormatter.ofPattern("yyyy-MM"));
        } else {
            // Weekly: format as "月份-周数" (e.g., "4月-1" for first week of April)
            int month = dateTime.getMonthValue();
            int dayOfMonth = dateTime.getDayOfMonth();
            int weekInMonth = (dayOfMonth - 1) / 7 + 1;
            return month + "月-" + weekInMonth;
        }
    }

    private ChartSection lineChart(String id, String title, List<ChartDatum> items, List<String> seriesNames, List<String> colors) {
        return new ChartSection(id, title, "line", items, new ChartConfig(seriesNames, null, colors, "时间", "数量"));
    }

    private ChartSection comboChart(String id, String title, List<ChartDatum> items, List<String> seriesNames, List<String> colors) {
        return new ChartSection(id, title, "combo", items, new ChartConfig(seriesNames, null, colors, "时间", "数量"));
    }

    private ChartSection pieChart(String id, String title, List<ChartDatum> items, List<String> colors) {
        return new ChartSection(id, title, "pie", items, new ChartConfig(null, null, colors, null, null));
    }

    private TabContent buildChangeAnalysis(BiRawData rawData) {
        List<Map<String, String>> changes = rawData.changes();
        long successCount = countByValue(changes, "Success", "Yes");
        long emergencyCount = countByValue(changes, "Change Type", "Emergency");
        long incidentCount = countByValue(changes, "Incident Caused", "Yes");
        int total = changes.size();

        return new TabContent(
            "change-analysis",
            "变更分析",
            "展示变更成功率趋势、类型分布、风险等级和计划满足度。",
            null,
            null,
            List.of(
                card("change-total", "变更总数", total, "neutral"),
                card("change-success", "成功率", percentage(successCount, total), "success"),
                card("change-emergency", "紧急变更", emergencyCount, emergencyCount > 0 ? "warning" : "success"),
                card("change-incident", "引发事件的变更", incidentCount, incidentCount > 0 ? "warning" : "success")
            ),
            List.of(
                // Row 1: combo chart - weekly change success rate trend
                comboChart("change-success-trend", "变更成功率趋势", buildChangeWeeklyTrendData(changes),
                    List.of("变更数量", "成功率", "引发事件变更"), List.of("#5b8db8", "#10b981", "#ef4444")),
                // Row 2: pie chart (change type distribution)
                pieChart("change-type-pie", "变更等级分布", topCounts(changes, "Change Type", 6),
                    List.of("#5b8db8", "#10b981", "#f59e0b", "#ef4444", "#8b7fc7", "#c97082")),
                // Row 2: stacked bar (category success/failure distribution)
                new ChartSection("change-category-stacked", "变更类别分布", "stacked-bar",
                    buildChangeCategoryDistribution(changes),
                    new ChartConfig(List.of("成功", "失败"), null, List.of("#5b8db8", "#ef4444"), "变更类别", "数量")),
                // Row 3: bar chart (risk level distribution for incident-causing changes)
                pieChart("change-risk-level", "变更引发故障分布", buildRiskLevelDistribution(changes),
                    List.of("#5b8db8", "#10b981", "#f59e0b", "#ef4444", "#8b7fc7", "#c97082")),
                // Row 3: stacked bar (plan deviation by change type)
                new ChartSection("change-plan-deviation", "变更计划满足分布", "stacked-bar",
                    buildPlanDeviation(changes),
                    new ChartConfig(List.of("提前完成", "按时完成", "延期完成"), null, List.of("#10b981", "#5b8db8", "#ef4444"), "变更类型", "数量"))
            ),
            List.of(
                table("change-failed-table", "失败或回退样本", List.of("编号", "标题", "状态", "是否成功", "是否回退"), changes.stream()
                    .filter(row -> !isYes(row.get("Success")) || isYes(row.get("Backout Performed")))
                    .limit(10)
                    .map(row -> List.of(
                        defaultLabel(row.get("Change Number"), "—"),
                        defaultLabel(row.get("Change Title"), "—"),
                        defaultLabel(row.get("Status"), "—"),
                        defaultLabel(row.get("Success"), "—"),
                        defaultLabel(row.get("Backout Performed"), "—")
                    )).toList())
            )
        );
    }

    private List<ChartDatum> buildChangeWeeklyTrendData(List<Map<String, String>> changes) {
        Map<String, Long> totalByPeriod = new LinkedHashMap<>();
        Map<String, Long> successByPeriod = new LinkedHashMap<>();
        Map<String, Long> causedByPeriod = new LinkedHashMap<>();

        for (Map<String, String> row : changes) {
            LocalDateTime date = parseDate(row.get("Planned Start"));
            if (date == null) {
                date = parseDate(row.get("Requested Date"));
            }
            if (date == null) continue;

            String periodLabel = formatPeriodLabel(date, "weekly");
            totalByPeriod.merge(periodLabel, 1L, Long::sum);
            if (isYes(row.get("Success"))) {
                successByPeriod.merge(periodLabel, 1L, Long::sum);
            }
            if (isYes(row.get("Incident Caused"))) {
                causedByPeriod.merge(periodLabel, 1L, Long::sum);
            }
        }

        Set<String> allPeriods = new TreeSet<>(totalByPeriod.keySet());

        List<ChartDatum> result = new ArrayList<>();
        for (String period : allPeriods) {
            long total = totalByPeriod.getOrDefault(period, 0L);
            long success = successByPeriod.getOrDefault(period, 0L);
            double successRate = total > 0 ? (success * 100.0 / total) : 0;
            long caused = causedByPeriod.getOrDefault(period, 0L);
            result.add(new ChartDatum(period + "|" + total + "|" + String.format("%.1f", successRate) + "|" + caused, total));
        }
        return result;
    }

    private List<ChartDatum> buildChangeCategoryDistribution(List<Map<String, String>> changes) {
        return changes.stream()
            .collect(Collectors.groupingBy(
                row -> defaultLabel(row.get("Category"), "未标注"),
                LinkedHashMap::new, Collectors.toList()))
            .entrySet().stream()
            .sorted((a, b) -> Integer.compare(b.getValue().size(), a.getValue().size()))
            .limit(8)
            .map(entry -> {
                long success = entry.getValue().stream().filter(row -> isYes(row.get("Success"))).count();
                long failure = entry.getValue().size() - success;
                return new ChartDatum(entry.getKey() + "|" + success + "|" + failure, success);
            })
            .toList();
    }

    private List<ChartDatum> buildRiskLevelDistribution(List<Map<String, String>> changes) {
        return changes.stream()
            .filter(row -> isYes(row.get("Incident Caused")))
            .collect(Collectors.groupingBy(
                row -> defaultLabel(row.get("Risk Level"), "未标注"),
                LinkedHashMap::new, Collectors.counting()))
            .entrySet().stream()
            .sorted(Map.Entry.<String, Long>comparingByValue().reversed())
            .limit(6)
            .map(entry -> new ChartDatum(entry.getKey(), entry.getValue()))
            .toList();
    }

    private List<ChartDatum> buildPlanDeviation(List<Map<String, String>> changes) {
        return changes.stream()
            .filter(row -> {
                String plannedEnd = row.get("Planned End");
                String actualEnd = row.get("Actual End");
                return plannedEnd != null && !plannedEnd.isBlank() && actualEnd != null && !actualEnd.isBlank();
            })
            .collect(Collectors.groupingBy(
                row -> defaultLabel(row.get("Change Type"), "未标注"),
                LinkedHashMap::new, Collectors.toList()))
            .entrySet().stream()
            .limit(6)
            .map(entry -> {
                long early = 0, onTime = 0, late = 0;
                for (Map<String, String> row : entry.getValue()) {
                    LocalDateTime plannedEnd = parseDate(row.get("Planned End"));
                    LocalDateTime actualEnd = parseDate(row.get("Actual End"));
                    if (plannedEnd == null || actualEnd == null) continue;
                    long diffHours = java.time.Duration.between(plannedEnd, actualEnd).toHours();
                    if (diffHours < -1) early++;
                    else if (diffHours <= 1) onTime++;
                    else late++;
                }
                return new ChartDatum(entry.getKey() + "|" + early + "|" + onTime + "|" + late, early + onTime + late);
            })
            .toList();
    }

    private TabContent buildRequestAnalysis(BiRawData rawData) {
        List<Map<String, String>> requests = rawData.requests();
        long fulfilled = countByValue(requests, "Status", "Fulfilled");
        long slaMet = countByValue(requests, "SLA Met", "Yes");
        double averageCsat = average(requests, "Satisfaction Score");
        int total = requests.size();

        return new TabContent(
            "request-analysis",
            "请求分析",
            "展示请求趋势、SLA达标率、满意度和高频请求分布。",
            null,
            null,
            List.of(
                card("request-total", "请求总数", total, "neutral"),
                card("request-fulfilled", "已完成请求", fulfilled, "success"),
                card("request-sla", "SLA 达成率", percentage(slaMet, total), "success"),
                card("request-csat", "平均满意度", formatNumber(averageCsat), averageCsat >= 4 ? "success" : "warning")
            ),
            List.of(
                // Row 1: combo chart - weekly request volume trend
                comboChart("request-volume-trend", "请求单量趋势", buildRequestWeeklyTrendData(requests),
                    List.of("请求单量", "平均满意度"), List.of("#5b8db8", "#10b981")),
                // Row 2: combo chart - SLA rate & avg fulfillment time by category
                comboChart("request-sla-time", "SLA达成率与平均耗时", buildRequestSlaByCategoryData(requests),
                    List.of("平均耗时(h)", "SLA达成率"), List.of("#5b8db8", "#10b981")),
                // Row 3 left: pie chart - request type distribution
                pieChart("request-type-pie", "请求类型分布", topCounts(requests, "Request Type", 6),
                    List.of("#5b8db8", "#10b981", "#f59e0b", "#ef4444", "#8b7fc7", "#c97082")),
                // Row 3 right: bar chart - department consumption ranking
                new ChartSection("request-dept-ranking", "部门请求单数排名", "column", topCounts(requests, "Requester Dept", 8), new ChartConfig(null, null, List.of("#5b8db8"), "部门", "请求数")),
                // Row 4 left: pie chart - satisfaction distribution
                pieChart("request-satisfaction-pie", "满意度分布", buildSatisfactionDistribution(requests),
                    List.of("#ef4444", "#f59e0b", "#10b981", "#5b8db8")),
                // Row 4 right: bar chart - high-frequency request category TOP8
                new ChartSection("request-category-top", "高频请求目录", "column", topCounts(requests, "Category", 8), new ChartConfig(null, null, List.of("#5b8db8"), "类别", "数量"))
            ),
            List.of(
                table("request-low-csat-table", "低满意度样本", List.of("编号", "标题", "类别", "满足时间", "满意度", "反馈"), requests.stream()
                    .filter(row -> {
                        double score = parseDouble(row.get("Satisfaction Score"));
                        return score > 0 && score <= 3;
                    })
                    .sorted((a, b) -> Double.compare(parseDouble(a.get("Satisfaction Score")), parseDouble(b.get("Satisfaction Score"))))
                    .limit(15)
                    .map(row -> List.of(
                        defaultLabel(row.get("Request Number"), "—"),
                        truncate(defaultLabel(row.get("Request Title"), "—"), 35),
                        defaultLabel(row.get("Category"), "—"),
                        defaultLabel(row.get("Fulfillment Time(h)"), "—"),
                        defaultLabel(row.get("Satisfaction Score"), "—"),
                        truncate(defaultLabel(row.get("Feedback"), "—"), 40)
                    )).toList())
            )
        );
    }

    private List<ChartDatum> buildRequestWeeklyTrendData(List<Map<String, String>> requests) {
        Map<String, Long> totalByPeriod = new LinkedHashMap<>();
        Map<String, List<Double>> csatByPeriod = new LinkedHashMap<>();

        for (Map<String, String> row : requests) {
            LocalDateTime date = parseDate(row.get("Requested Date"));
            if (date == null) continue;

            String periodLabel = formatPeriodLabel(date, "weekly");
            totalByPeriod.merge(periodLabel, 1L, Long::sum);

            double score = parseDouble(row.get("Satisfaction Score"));
            if (score > 0) {
                csatByPeriod.computeIfAbsent(periodLabel, k -> new ArrayList<>()).add(score);
            }
        }

        Set<String> allPeriods = new TreeSet<>(totalByPeriod.keySet());

        List<ChartDatum> result = new ArrayList<>();
        for (String period : allPeriods) {
            long total = totalByPeriod.getOrDefault(period, 0L);
            List<Double> scores = csatByPeriod.getOrDefault(period, List.of());
            double avgCsat = scores.isEmpty() ? 0 : scores.stream().mapToDouble(Double::doubleValue).average().orElse(0);
            result.add(new ChartDatum(period + "|" + total + "|" + String.format("%.2f", avgCsat), total));
        }
        return result;
    }

    private List<ChartDatum> buildRequestSlaByCategoryData(List<Map<String, String>> requests) {
        return requests.stream()
            .collect(Collectors.groupingBy(
                row -> defaultLabel(row.get("Category"), "未标注"),
                LinkedHashMap::new, Collectors.toList()))
            .entrySet().stream()
            .sorted((a, b) -> Integer.compare(b.getValue().size(), a.getValue().size()))
            .limit(8)
            .map(entry -> {
                List<Map<String, String>> rows = entry.getValue();
                long slaCount = rows.stream().filter(row -> isYes(row.get("SLA Met"))).count();
                double slaRate = percentageValue(slaCount, rows.size()) * 100.0;
                double avgTime = rows.stream()
                    .mapToDouble(row -> parseDouble(row.get("Fulfillment Time(h)")))
                    .filter(v -> v > 0)
                    .average().orElse(0);
                return new ChartDatum(
                    entry.getKey() + "|" + String.format("%.1f", avgTime) + "|" + String.format("%.1f", slaRate),
                    avgTime);
            })
            .toList();
    }

    private List<ChartDatum> buildSatisfactionDistribution(List<Map<String, String>> requests) {
        Map<String, Long> dist = new LinkedHashMap<>();
        dist.put("非常不满意(1-2)", 0L);
        dist.put("不满意(3)", 0L);
        dist.put("满意(4)", 0L);
        dist.put("非常满意(5)", 0L);

        for (Map<String, String> row : requests) {
            double score = parseDouble(row.get("Satisfaction Score"));
            if (score <= 2) dist.merge("非常不满意(1-2)", 1L, Long::sum);
            else if (score <= 3) dist.merge("不满意(3)", 1L, Long::sum);
            else if (score <= 4) dist.merge("满意(4)", 1L, Long::sum);
            else dist.merge("非常满意(5)", 1L, Long::sum);
        }

        return dist.entrySet().stream()
            .filter(e -> e.getValue() > 0)
            .map(e -> new ChartDatum(e.getKey(), e.getValue()))
            .toList();
    }

    private TabContent buildProblemAnalysis(BiRawData rawData) {
        List<Map<String, String>> problems = rawData.problems();
        long closed = problems.stream().filter(row -> matchesAny(clean(row.get("Status")), List.of("Resolved", "Closed"))).count();
        long rcaComplete = problems.stream().filter(row -> !clean(row.get("Root Cause")).isBlank()).count();
        long knownError = countByValue(problems, "Known Error", "No");
        int total = problems.size();

        return new TabContent(
            "problem-analysis",
            "问题分析",
            "展示问题趋势、根因分析、解决方案健康度和根因类别分布。",
            null,
            null,
            List.of(
                card("problem-total", "问题总数", total, "neutral"),
                card("problem-closed", "已关闭问题", closed, "success"),
                card("problem-rca", "已完成 RCA", rcaComplete, "success"),
                card("problem-known-error", "未知错误", knownError, "warning")
            ),
            List.of(
                // Row 1: combo chart - weekly problem volume + cumulative unresolved
                comboChart("problem-volume-trend", "问题单量趋势", buildProblemWeeklyTrendData(problems),
                    List.of("问题单量", "累积未解决"), List.of("#5b8db8", "#ef4444")),
                // Row 2 left: pie chart - root cause category distribution
                pieChart("problem-root-cause-pie", "问题根因类型分布", topCounts(problems, "Root Cause Category", 6),
                    List.of("#5b8db8", "#10b981", "#f59e0b", "#ef4444", "#8b7fc7", "#c97082")),
                // Row 2 right: column chart - incident count by root cause category
                new ChartSection("problem-incident-ranking", "问题引发故障数排名", "column",
                    buildProblemIncidentRanking(problems),
                    new ChartConfig(null, null, List.of("#5b8db8"), "根因类别", "故障数")),
                // Row 3 left: pie chart - status distribution
                pieChart("problem-status-pie", "问题状态分布", topCounts(problems, "Status", 6),
                    List.of("#10b981", "#5b8db8", "#f59e0b", "#ef4444", "#8b7fc7", "#c97082")),
                // Row 3 right: stacked bar - resolution health
                new ChartSection("problem-resolution-health", "已关闭问题单的解决方案健康度分析", "stacked-bar",
                    buildResolutionHealth(problems),
                    new ChartConfig(List.of("已永久修复", "有临时方案", "未解决"), null, List.of("#10b981", "#5b8db8", "#ef4444"), "根因类别", "数量")),
                // Row 4: grouped bar - tech debt distribution
                new ChartSection("problem-tech-debt", "系统模块薄弱点分析", "grouped-bar",
                    buildTechDebtDistribution(problems),
                    new ChartConfig(topRootCauseCategories(problems, 4), null, List.of("#5b8db8", "#10b981", "#f59e0b", "#ef4444"), "Category", "数量"))
            ),
            List.of(
                table("problem-open-table", "未关闭问题", List.of("编号", "标题", "状态", "关联事件"), problems.stream()
                    .filter(row -> !matchesAny(clean(row.get("Status")), List.of("Resolved", "Closed")))
                    .limit(10)
                    .map(row -> List.of(
                        defaultLabel(row.get("Problem Number"), "—"),
                        truncate(defaultLabel(row.get("Problem Title"), "—"), 35),
                        defaultLabel(row.get("Status"), "—"),
                        defaultLabel(row.get("Related Incidents"), "0")
                    )).toList())
            )
        );
    }

    private List<ChartDatum> buildProblemWeeklyTrendData(List<Map<String, String>> problems) {
        // Group by week: count total and track cumulative unresolved
        List<Map<String, String>> sorted = new ArrayList<>(problems);
        sorted.sort((a, b) -> {
            LocalDateTime da = parseDate(a.get("Logged Date"));
            LocalDateTime db = parseDate(b.get("Logged Date"));
            if (da == null && db == null) return 0;
            if (da == null) return 1;
            if (db == null) return -1;
            return da.compareTo(db);
        });

        Map<String, Long> totalByPeriod = new LinkedHashMap<>();
        Map<String, Long> resolvedByPeriod = new LinkedHashMap<>();

        for (Map<String, String> row : sorted) {
            LocalDateTime date = parseDate(row.get("Logged Date"));
            if (date == null) continue;
            String period = formatPeriodLabel(date, "weekly");
            totalByPeriod.merge(period, 1L, Long::sum);
            if (matchesAny(clean(row.get("Status")), List.of("Resolved", "Closed"))) {
                resolvedByPeriod.merge(period, 1L, Long::sum);
            }
        }

        Set<String> allPeriods = new TreeSet<>(totalByPeriod.keySet());
        long cumulativeUnresolved = 0;
        List<ChartDatum> result = new ArrayList<>();
        for (String period : allPeriods) {
            long total = totalByPeriod.getOrDefault(period, 0L);
            long resolved = resolvedByPeriod.getOrDefault(period, 0L);
            cumulativeUnresolved += (total - resolved);
            result.add(new ChartDatum(period + "|" + total + "|" + cumulativeUnresolved, total));
        }
        return result;
    }

    private List<ChartDatum> buildProblemIncidentRanking(List<Map<String, String>> problems) {
        return problems.stream()
            .filter(row -> !clean(row.get("Related Incidents")).isBlank())
            .collect(Collectors.groupingBy(
                row -> defaultLabel(row.get("Root Cause Category"), "未标注"),
                LinkedHashMap::new, Collectors.toList()))
            .entrySet().stream()
            .map(entry -> {
                long incidentCount = entry.getValue().stream()
                    .mapToLong(row -> parseLong(row.get("Related Incidents")))
                    .sum();
                return new ChartDatum(entry.getKey(), incidentCount);
            })
            .sorted((a, b) -> Double.compare(b.value(), a.value()))
            .limit(8)
            .toList();
    }

    private List<ChartDatum> buildResolutionHealth(List<Map<String, String>> problems) {
        return problems.stream()
            .filter(row -> matchesAny(clean(row.get("Status")), List.of("Resolved", "Closed")))
            .collect(Collectors.groupingBy(
                row -> defaultLabel(row.get("Root Cause Category"), "未标注"),
                LinkedHashMap::new, Collectors.toList()))
            .entrySet().stream()
            .limit(6)
            .map(entry -> {
                long green = 0, blue = 0, red = 0;
                for (Map<String, String> row : entry.getValue()) {
                    boolean workaround = isYes(row.get("Workaround Available"));
                    boolean permanentFix = isYes(row.get("Permanent Fix Implemented"));
                    if (workaround && permanentFix) green++;
                    else if (workaround && !permanentFix) blue++;
                    else red++;
                }
                return new ChartDatum(entry.getKey() + "|" + green + "|" + blue + "|" + red, green + blue + red);
            })
            .toList();
    }

    private List<String> topCategories(List<Map<String, String>> problems, int limit) {
        return problems.stream()
            .map(row -> defaultLabel(row.get("Category"), "未标注"))
            .collect(Collectors.groupingBy(Function.identity(), LinkedHashMap::new, Collectors.counting()))
            .entrySet().stream()
            .sorted(Map.Entry.<String, Long>comparingByValue().reversed())
            .limit(limit)
            .map(Map.Entry::getKey)
            .toList();
    }

    private List<String> topRootCauseCategories(List<Map<String, String>> problems, int limit) {
        return problems.stream()
            .map(row -> defaultLabel(row.get("Root Cause Category"), "未标注"))
            .collect(Collectors.groupingBy(Function.identity(), LinkedHashMap::new, Collectors.counting()))
            .entrySet().stream()
            .sorted(Map.Entry.<String, Long>comparingByValue().reversed())
            .limit(limit)
            .map(Map.Entry::getKey)
            .toList();
    }

    private List<ChartDatum> buildTechDebtDistribution(List<Map<String, String>> problems) {
        List<String> topCats = topCategories(problems, 4);
        List<String> rccSeries = topRootCauseCategories(problems, 4);

        return topCats.stream()
            .map(cat -> {
                long[] counts = new long[rccSeries.size()];
                List<Map<String, String>> matching = problems.stream()
                    .filter(row -> defaultLabel(row.get("Category"), "未标注").equals(cat))
                    .toList();
                for (Map<String, String> row : matching) {
                    String rcc = defaultLabel(row.get("Root Cause Category"), "未标注");
                    int idx = rccSeries.indexOf(rcc);
                    if (idx >= 0) counts[idx]++;
                }
                StringBuilder label = new StringBuilder(cat);
                for (long count : counts) {
                    label.append("|").append(count);
                }
                return new ChartDatum(label.toString(), matching.size());
            })
            .toList();
    }

    private TabContent buildCrossProcess(BiRawData rawData) {
        List<Map<String, String>> changes = rawData.changes();
        List<Map<String, String>> incidents = rawData.incidents();
        List<Map<String, String>> problems = rawData.problems();
        List<Map<String, String>> requests = rawData.requests();

        int totalChanges = changes.size();
        int totalIncidents = incidents.size();

        // KPI 1: Change-Caused Incident Rate
        long causedCount = countByValue(changes, "Incident Caused", "Yes");
        double causedRate = totalChanges > 0 ? (causedCount * 100.0 / totalChanges) : 0;

        // KPI 2: P1/P2 incidents within 48h post-change
        long p1p2Count = changes.stream()
            .filter(ch -> isYes(ch.get("Incident Caused")))
            .flatMap(ch -> findIncidentsWithin48h(incidents, parseDate(ch.get("Actual End"))).stream())
            .map(inc -> inc.get("Order Number"))
            .distinct()
            .count();

        // KPI 3: Request-to-Incident Ratio
        double requestRatio = totalIncidents > 0 ? (double) requests.size() / totalIncidents : 0;

        // KPI 4: System Fragility Score (0-100, higher=healthier)
        double changeFailureWeight = (causedRate / 100.0) * 40;
        double avgAging = problems.stream()
            .filter(row -> !matchesAny(clean(row.get("Status")), List.of("Resolved", "Closed")))
            .mapToLong(row -> {
                LocalDateTime logged = parseDate(row.get("Logged Date"));
                return logged != null ? java.time.Duration.between(logged, LocalDateTime.now()).toDays() : 0;
            }).average().orElse(0);
        double agingWeight = Math.min(avgAging / 90.0, 1.0) * 30;
        double ratioWeight = Math.min(requestRatio / 8.0, 1.0) * 30;
        double fragilityScore = Math.round(100 - (changeFailureWeight + agingWeight + ratioWeight));

        String causedTone = causedRate < 5 ? "success" : causedRate < 10 ? "warning" : "danger";
        String p1p2Tone = p1p2Count == 0 ? "success" : "warning";
        String ratioTone = requestRatio < 3 ? "success" : requestRatio < 5 ? "warning" : "danger";
        String fragTone = fragilityScore > 75 ? "success" : fragilityScore > 50 ? "warning" : "danger";

        return new TabContent(
            "cross-process",
            "跨流程关联",
            "展示变更、事件、请求和问题之间的深度关联与风险传导路径。",
            null,
            null,
            List.of(
                card("cross-change-incident-rate", "变更致事件率", formatNumber(causedRate) + "%", causedTone),
                card("cross-48h-p1p2", "48h窗口P1/P2事件", p1p2Count, p1p2Tone),
                card("cross-request-incident-ratio", "请求-事件比", formatNumber(requestRatio), ratioTone),
                card("cross-fragility-score", "系统脆弱性评分", (int) fragilityScore + "分", fragTone)
            ),
            List.of(
                comboChart("cross-change-incident-trend", "变更致事件趋势",
                    buildChangeIncidentTrendData(rawData),
                    List.of("变更数量", "致事件P1/P2数"), List.of("#5b8db8", "#ef4444")),
                new ChartSection("cross-change-heatmap", "变更风险热力图", "heatmap",
                    buildChangeHeatmapData(rawData),
                    new ChartConfig(List.of("变更密度", "事件热点"), null, List.of("#5b8db8", "#ef4444"), "时段", "星期")),
                new ChartSection("cross-tech-debt-bubble", "系统脆弱性气泡图", "bubble",
                    buildTechDebtBubbleData(rawData),
                    new ChartConfig(topRootCauseCategories(problems, 6), null, List.of("#5b8db8", "#10b981", "#f59e0b", "#ef4444", "#8b7fc7", "#c97082"), "平均积压天数", "未关闭问题数")),
                comboChart("cross-request-incident-overlap", "请求与事件时间重叠",
                    buildRequestIncidentOverlap(rawData),
                    List.of("请求数", "事件数"), List.of("#5b8db8", "#ef4444"))
            ),
            List.of(
                table("cross-change-incident-detail", "变更致事件关联明细",
                    List.of("变更编号", "变更标题", "完成时间", "48h内P1/P2事件", "风险等级"),
                    changes.stream()
                        .filter(ch -> isYes(ch.get("Incident Caused")))
                        .limit(15)
                        .map(ch -> {
                            LocalDateTime actualEnd = parseDate(ch.get("Actual End"));
                            String linkedIncidents = findIncidentsWithin48h(incidents, actualEnd).stream()
                                .map(inc -> defaultLabel(inc.get("Order Number"), ""))
                                .filter(s -> !s.isBlank())
                                .reduce((a, b) -> a + "," + b)
                                .orElse("—");
                            return List.of(
                                defaultLabel(ch.get("Change Number"), "—"),
                                truncate(defaultLabel(ch.get("Change Title"), "—"), 30),
                                actualEnd != null ? actualEnd.format(DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm")) : "—",
                                linkedIncidents,
                                defaultLabel(ch.get("Risk Level"), "—")
                            );
                        }).toList()),
                table("cross-aging-problems", "老化问题清单",
                    List.of("问题编号", "根因类别", "老化天数", "关联事件数", "优先级", "状态"),
                    problems.stream()
                        .map(row -> {
                            LocalDateTime logged = parseDate(row.get("Logged Date"));
                            long agingDays = 0;
                            if (logged != null) {
                                LocalDateTime resolved = parseDate(row.get("Resolution Date"));
                                LocalDateTime end = resolved != null ? resolved : LocalDateTime.now();
                                agingDays = java.time.Duration.between(logged, end).toDays();
                            }
                            return new Object[]{row, agingDays};
                        })
                        .sorted((a, b) -> Long.compare((long) b[1], (long) a[1]))
                        .limit(15)
                        .map(obj -> {
                            Map<String, String> row = (Map<String, String>) obj[0];
                            long agingDays = (long) obj[1];
                            return List.of(
                                defaultLabel(row.get("Problem Number"), "—"),
                                defaultLabel(row.get("Root Cause Category"), "未标注"),
                                String.valueOf(agingDays),
                                defaultLabel(row.get("Related Incidents"), "0"),
                                defaultLabel(row.get("Priority"), "—"),
                                defaultLabel(row.get("Status"), "—")
                            );
                        }).toList()),
                table("cross-request-surge", "请求激增预警",
                    List.of("请求类别", "本周请求数", "上周请求数", "环比增长", "同期事件数"),
                    buildRequestSurgeData(rawData))
            )
        );
    }

    private List<Map<String, String>> findIncidentsWithin48h(List<Map<String, String>> incidents, LocalDateTime changeEnd) {
        if (changeEnd == null) return List.of();
        return incidents.stream()
            .filter(inc -> {
                LocalDateTime incBegin = parseDate(inc.get("Begin Date"));
                if (incBegin == null) return false;
                String priority = clean(inc.get("Priority"));
                if (!"P1".equalsIgnoreCase(priority) && !"P2".equalsIgnoreCase(priority)) return false;
                long hours = java.time.Duration.between(changeEnd, incBegin).toHours();
                return hours > 0 && hours <= 48;
            })
            .collect(Collectors.toList());
    }

    private List<ChartDatum> buildChangeIncidentTrendData(BiRawData rawData) {
        List<Map<String, String>> changes = rawData.changes();
        List<Map<String, String>> incidents = rawData.incidents();

        Map<String, Long> changeByWeek = new LinkedHashMap<>();
        Map<String, Long> causedByWeek = new LinkedHashMap<>();

        for (Map<String, String> ch : changes) {
            LocalDateTime date = parseDate(ch.get("Planned Start"));
            if (date == null) date = parseDate(ch.get("Actual End"));
            if (date == null) continue;
            String week = formatPeriodLabel(date, "weekly");
            changeByWeek.merge(week, 1L, Long::sum);
            if (isYes(ch.get("Incident Caused"))) {
                LocalDateTime actualEnd = parseDate(ch.get("Actual End"));
                long p1p2 = findIncidentsWithin48h(incidents, actualEnd).size();
                causedByWeek.merge(week, p1p2, Long::sum);
            }
        }

        Set<String> allWeeks = new TreeSet<>(changeByWeek.keySet());
        List<ChartDatum> result = new ArrayList<>();
        for (String week : allWeeks) {
            long total = changeByWeek.getOrDefault(week, 0L);
            long caused = causedByWeek.getOrDefault(week, 0L);
            result.add(new ChartDatum(week + "|" + total + "|" + caused, total));
        }
        return result;
    }

    private List<ChartDatum> buildChangeHeatmapData(BiRawData rawData) {
        List<Map<String, String>> changes = rawData.changes();
        List<Map<String, String>> incidents = rawData.incidents();

        // Build 7x24 grid: key = "dow|hour", value = [changeCount, incidentCount]
        Map<String, long[]> grid = new LinkedHashMap<>();
        for (int dow = 1; dow <= 7; dow++) {
            for (int hour = 0; hour < 24; hour++) {
                grid.put(dow + "|" + hour, new long[]{0, 0});
            }
        }

        for (Map<String, String> ch : changes) {
            LocalDateTime date = parseDate(ch.get("Actual Start"));
            if (date == null) continue;
            int dow = date.getDayOfWeek().getValue(); // 1=Mon, 7=Sun
            int hour = date.getHour();
            String key = dow + "|" + hour;
            grid.get(key)[0]++;
            if (isYes(ch.get("Incident Caused"))) {
                LocalDateTime actualEnd = parseDate(ch.get("Actual End"));
                List<Map<String, String>> linked = findIncidentsWithin48h(incidents, actualEnd);
                for (Map<String, String> inc : linked) {
                    LocalDateTime incBegin = parseDate(inc.get("Begin Date"));
                    if (incBegin == null) continue;
                    int incDow = incBegin.getDayOfWeek().getValue();
                    int incHour = incBegin.getHour();
                    grid.get(incDow + "|" + incHour)[1]++;
                }
            }
        }

        return grid.entrySet().stream()
            .map(e -> new ChartDatum(
                e.getKey() + "|" + e.getValue()[0] + "|" + e.getValue()[1],
                e.getValue()[0]))
            .toList();
    }

    private List<ChartDatum> buildTechDebtBubbleData(BiRawData rawData) {
        List<Map<String, String>> problems = rawData.problems();

        // Group problems by CI Affected
        Map<String, List<Map<String, String>>> byCi = problems.stream()
            .collect(Collectors.groupingBy(
                row -> defaultLabel(row.get("CI Affected"), "未标注"),
                LinkedHashMap::new, Collectors.toList()));

        List<ChartDatum> result = new ArrayList<>();
        for (Map.Entry<String, List<Map<String, String>>> entry : byCi.entrySet()) {
            String ci = entry.getKey();
            List<Map<String, String>> probs = entry.getValue();

            // Count open problems and compute average aging for open ones
            long openCount = probs.stream()
                .filter(row -> !matchesAny(clean(row.get("Status")), List.of("Resolved", "Closed")))
                .count();
            double avgAging = probs.stream()
                .filter(row -> !matchesAny(clean(row.get("Status")), List.of("Resolved", "Closed")))
                .mapToLong(row -> {
                    LocalDateTime logged = parseDate(row.get("Logged Date"));
                    if (logged == null) return 0;
                    LocalDateTime resolved = parseDate(row.get("Resolution Date"));
                    LocalDateTime end = resolved != null ? resolved : LocalDateTime.now();
                    return java.time.Duration.between(logged, end).toDays();
                }).average().orElse(0);

            // Sum of all related incidents
            long totalIncidents = probs.stream()
                .mapToLong(row -> parseLong(row.get("Related Incidents")))
                .sum();

            // Dominant root cause category
            String dominantRcc = probs.stream()
                .collect(Collectors.groupingBy(r -> defaultLabel(r.get("Root Cause Category"), "未标注"), Collectors.counting()))
                .entrySet().stream()
                .max(Map.Entry.comparingByValue())
                .map(Map.Entry::getKey).orElse("未标注");

            // Label: "ciName|dominantRcc|avgAging|openCount|totalIncidents"
            String label = ci + "|" + dominantRcc + "|" + String.format("%.1f", avgAging) + "|" + openCount + "|" + totalIncidents;
            result.add(new ChartDatum(label, totalIncidents));
        }

        // Sort by total incidents descending, take top 20
        result.sort((a, b) -> Double.compare(b.value(), a.value()));
        return result.stream().limit(20).toList();
    }

    private List<ChartDatum> buildRequestIncidentOverlap(BiRawData rawData) {
        Map<String, Long> requestByWeek = new LinkedHashMap<>();
        for (Map<String, String> req : rawData.requests()) {
            LocalDateTime date = parseDate(req.get("Requested Date"));
            if (date == null) continue;
            String week = formatPeriodLabel(date, "weekly");
            requestByWeek.merge(week, 1L, Long::sum);
        }

        Map<String, Long> incidentByWeek = new LinkedHashMap<>();
        for (Map<String, String> inc : rawData.incidents()) {
            LocalDateTime date = parseDate(inc.get("Begin Date"));
            if (date == null) continue;
            String week = formatPeriodLabel(date, "weekly");
            incidentByWeek.merge(week, 1L, Long::sum);
        }

        Set<String> allWeeks = new TreeSet<>();
        allWeeks.addAll(requestByWeek.keySet());
        allWeeks.addAll(incidentByWeek.keySet());

        List<ChartDatum> result = new ArrayList<>();
        for (String week : allWeeks) {
            long reqCount = requestByWeek.getOrDefault(week, 0L);
            long incCount = incidentByWeek.getOrDefault(week, 0L);
            result.add(new ChartDatum(week + "|" + reqCount + "|" + incCount, reqCount));
        }
        return result;
    }

    private List<List<String>> buildRequestSurgeData(BiRawData rawData) {
        LocalDateTime now = LocalDateTime.now();
        String thisWeek = formatPeriodLabel(now, "weekly");
        String lastWeek = formatPeriodLabel(now.minusDays(7), "weekly");

        Map<String, Long> thisWeekReqs = rawData.requests().stream()
            .filter(r -> parseDate(r.get("Requested Date")) != null && formatPeriodLabel(parseDate(r.get("Requested Date")), "weekly").equals(thisWeek))
            .collect(Collectors.groupingBy(r -> defaultLabel(r.get("Category"), "未标注"), Collectors.counting()));

        Map<String, Long> lastWeekReqs = rawData.requests().stream()
            .filter(r -> parseDate(r.get("Requested Date")) != null && formatPeriodLabel(parseDate(r.get("Requested Date")), "weekly").equals(lastWeek))
            .collect(Collectors.groupingBy(r -> defaultLabel(r.get("Category"), "未标注"), Collectors.counting()));

        long thisWeekIncidents = rawData.incidents().stream()
            .filter(inc -> parseDate(inc.get("Begin Date")) != null && formatPeriodLabel(parseDate(inc.get("Begin Date")), "weekly").equals(thisWeek))
            .count();

        Set<String> allCats = new TreeSet<>(thisWeekReqs.keySet());
        allCats.addAll(lastWeekReqs.keySet());

        return allCats.stream()
            .map(cat -> {
                long tw = thisWeekReqs.getOrDefault(cat, 0L);
                long lw = lastWeekReqs.getOrDefault(cat, 0L);
                String growth = lw > 0 ? String.format("%.0f%%", (tw - lw) * 100.0 / lw) : (tw > 0 ? "+∞" : "0%");
                return List.of(cat, String.valueOf(tw), String.valueOf(lw), growth, String.valueOf(thisWeekIncidents));
            })
            .sorted((a, b) -> Long.compare(Long.parseLong(b.get(1)), Long.parseLong(a.get(1))))
            .limit(10)
            .toList();
    }

    private TabContent buildPersonnelEfficiency(BiRawData rawData) {
        return new TabContent(
            "personnel-efficiency",
            "人员与效率",
            "聚焦处理人、实施人和负责人工作量分布。",
            null,
            null,
            List.of(
                card("resolver-count", "事件处理人数", distinctCount(rawData.incidents(), "Resolver"), "neutral"),
                card("implementer-count", "变更实施人数", distinctCount(rawData.changes(), "Implementer"), "neutral"),
                card("assignee-count", "请求处理人数", distinctCount(rawData.requests(), "Assignee"), "neutral"),
                card("problem-owner-count", "问题处理人数", distinctCount(rawData.problems(), "Resolver"), "neutral")
            ),
            List.of(
                chart("resolver-workload-chart", "事件处理人工作量", topCounts(rawData.incidents(), "Resolver", 10)),
                chart("request-assignee-workload-chart", "请求处理人工作量", topCounts(rawData.requests(), "Assignee", 10))
            ),
            List.of(
                table("change-implementer-table", "变更实施人工作量", List.of("实施人", "变更数"), rowsFromChart(topCounts(rawData.changes(), "Implementer", 10))),
                table("problem-resolver-table", "问题处理人工作量", List.of("处理人", "问题数"), rowsFromChart(topCounts(rawData.problems(), "Resolver", 10)))
            )
        );
    }

    private MetricCard card(String id, String label, Object value, String tone) {
        return new MetricCard(id, label, String.valueOf(value), tone);
    }

    private BiModels.ExecutiveSummary buildExecutiveSummaryContent(BiRawData rawData, long incidentSlaBreached, long changeFailures, long requestOpen, long problemOpen) {
        double incidentSlaRate = percentageValue(countByValue(rawData.incidents(), "SLA Compliant", "Yes"), rawData.incidents().size());
        double incidentMttrHours = average(rawData.incidents(), "Resolution Time(m)") / 60.0;
        double changeSuccessRate = percentageValue(countByValue(rawData.changes(), "Success", "Yes"), rawData.changes().size());
        double changeIncidentRate = percentageValue(countByValue(rawData.changes(), "Incident Caused", "Yes"), rawData.changes().size());
        double requestSlaRate = percentageValue(countByValue(rawData.requests(), "SLA Met", "Yes"), rawData.requests().size());
        double requestCsat = average(rawData.requests(), "Satisfaction Score");
        double problemClosureRate = percentageValue(rawData.problems().stream().filter(row -> matchesAny(clean(row.get("Status")), List.of("Resolved", "Closed"))).count(), rawData.problems().size());
        double backlogRate = percentageValue(problemOpen + requestOpen, rawData.problems().size() + rawData.requests().size());

        double incidentHealth = weightedAverage(List.of(
            scoreHigherBetter(incidentSlaRate, 0.95, 0.85),
            scoreLowerBetter(incidentMttrHours, 12, 24),
            scoreLowerBetter(percentageValue(rawData.incidents().stream().filter(row -> matchesAny(clean(row.get("Priority")), List.of("P1", "P2"))).count(), rawData.incidents().size()), 0.12, 0.22)
        ));
        double changeHealth = weightedAverage(List.of(
            scoreHigherBetter(changeSuccessRate, 0.95, 0.85),
            scoreLowerBetter(changeIncidentRate, 0.05, 0.12)
        ));
        double requestHealth = weightedAverage(List.of(
            scoreHigherBetter(requestSlaRate, 0.9, 0.75),
            scoreHigherBetter(requestCsat / 5.0, 0.82, 0.7)
        ));
        double problemHealth = weightedAverage(List.of(
            scoreHigherBetter(problemClosureRate, 0.75, 0.55),
            scoreLowerBetter(backlogRate, 0.25, 0.45)
        ));

        double healthScore = weightedScore(Map.of(
            "incident", incidentHealth,
            "change", changeHealth,
            "request", requestHealth,
            "problem", problemHealth
        ));
        String grade = gradeForScore(healthScore);

        List<BiModels.ExecutiveRisk> risks = buildExecutiveRisks(incidentSlaBreached, changeFailures, requestOpen, problemOpen, changeIncidentRate, requestCsat, problemClosureRate);
        BiModels.RiskSummary riskSummary = new BiModels.RiskSummary(
            (int) risks.stream().filter(risk -> "Critical".equals(risk.priority())).count(),
            (int) risks.stream().filter(risk -> "Warning".equals(risk.priority())).count(),
            (int) risks.stream().filter(risk -> "Attention".equals(risk.priority())).count(),
            risks.stream().limit(5).toList()
        );

        List<BiModels.ProcessHealth> processHealths = List.of(
            new BiModels.ProcessHealth("incident", "事件", formatScore(incidentHealth), toneFromNormalizedScore(incidentHealth), incidentHealthSummary(incidentSlaRate, incidentMttrHours)),
            new BiModels.ProcessHealth("change", "变更", formatScore(changeHealth), toneFromNormalizedScore(changeHealth), "成功率 " + percentage(changeSuccessRate) + "，致事件率 " + percentage(changeIncidentRate)),
            new BiModels.ProcessHealth("request", "请求", formatScore(requestHealth), toneFromNormalizedScore(requestHealth), "SLA " + percentage(requestSlaRate) + "，满意度 " + formatNumber(requestCsat)),
            new BiModels.ProcessHealth("problem", "问题", formatScore(problemHealth), toneFromNormalizedScore(problemHealth), "关闭率 " + percentage(problemClosureRate) + "，积压 " + (requestOpen + problemOpen))
        );

        List<BiModels.TrendPoint> trendPoints = buildTrendPoints(rawData);
        String summary = buildExecutiveSummarySentence(grade, riskSummary, processHealths);
        String changeHint = buildTrendHint(trendPoints);
        String periodLabel = buildPeriodLabel(rawData);

        return new BiModels.ExecutiveSummary(
            new BiModels.ExecutiveHero(formatScore(healthScore), grade, summary, changeHint, periodLabel),
            processHealths,
            riskSummary,
            new BiModels.TrendSection("月度健康趋势", "健康分与高优先级事件同步观察。", trendPoints)
        );
    }

    private ChartSection chart(String id, String title, List<ChartDatum> items) {
        return new ChartSection(id, title, "bar", items);
    }

    private BiModels.TableSection table(String id, String title, List<String> columns, List<List<String>> rows) {
        return new BiModels.TableSection(id, title, columns, rows);
    }

    private BiModels.SlaAnalysisSummary buildSlaAnalysisSummary(List<IncidentSlaRecord> incidents) {
        long responseBreached = incidents.stream().filter(record -> !record.responseMet()).count();
        long resolutionBreached = incidents.stream().filter(record -> !record.resolutionMet()).count();
        long bothBreached = incidents.stream().filter(record -> !record.responseMet() && !record.resolutionMet()).count();
        long overallBreached = incidents.stream().filter(IncidentSlaRecord::anyBreached).count();
        double overallRate = percentageValue(incidents.stream().filter(IncidentSlaRecord::overallMet).count(), incidents.size());
        double responseRate = percentageValue(incidents.stream().filter(IncidentSlaRecord::responseMet).count(), incidents.size());
        double resolutionRate = percentageValue(incidents.stream().filter(IncidentSlaRecord::resolutionMet).count(), incidents.size());
        List<IncidentSlaRecord> highPriority = incidents.stream().filter(record -> matchesAny(record.priority(), List.of("P1", "P2"))).toList();
        double highPriorityRate = percentageValue(highPriority.stream().filter(IncidentSlaRecord::overallMet).count(), highPriority.size());

        List<BiModels.SlaPriorityRow> priorityRows = PRIORITY_ORDER.stream()
            .map(priority -> buildPriorityRow(priority, incidents.stream().filter(record -> priority.equalsIgnoreCase(record.priority())).toList()))
            .filter(Objects::nonNull)
            .toList();

        List<BiModels.SlaRiskRow> categoryRisks = rankSlaRisks(incidents, IncidentSlaRecord::category);
        List<BiModels.SlaRiskRow> resolverRisks = rankSlaRisks(incidents, IncidentSlaRecord::resolver);
        List<BiModels.SlaTrendPoint> trends = buildSlaTrendPoints(incidents);

        String summary = buildSlaSummarySentence(responseRate, resolutionRate, priorityRows, categoryRisks);
        return new BiModels.SlaAnalysisSummary(
            new BiModels.SlaHero(
                summary,
                percentage(overallRate),
                percentage(responseRate),
                percentage(resolutionRate),
                overallBreached,
                percentage(highPriorityRate)
            ),
            buildSlaDimensionCard("响应 SLA", responseRate, incidents.stream().mapToDouble(IncidentSlaRecord::responseMinutes).average().orElse(0), percentile(incidents.stream().map(IncidentSlaRecord::responseMinutes).toList(), 0.9), responseBreached),
            buildSlaDimensionCard("解决 SLA", resolutionRate, incidents.stream().mapToDouble(IncidentSlaRecord::resolutionMinutes).average().orElse(0), percentile(incidents.stream().map(IncidentSlaRecord::resolutionMinutes).toList(), 0.9), resolutionBreached),
            priorityRows,
            new BiModels.SlaComparisonChart("优先级响应 vs 解决对比", priorityRows.stream()
                .map(row -> new BiModels.SlaComparisonDatum(
                    row.priority(),
                    parsePercentage(row.responseComplianceRate()),
                    parsePercentage(row.resolutionComplianceRate())
                )).toList()),
            categoryRisks,
            resolverRisks,
            trends,
            new BiModels.SlaViolationBreakdown(responseBreached, resolutionBreached, bothBreached),
            incidents.stream()
                .filter(IncidentSlaRecord::anyBreached)
                .sorted(Comparator
                    .comparing((IncidentSlaRecord record) -> priorityRank(record.priority()))
                    .thenComparing((IncidentSlaRecord record) -> violationSeverity(record.violationType()))
                    .thenComparing(IncidentSlaRecord::resolutionMinutes, Comparator.reverseOrder()))
                .limit(12)
                .map(record -> new BiModels.SlaViolationSample(
                    defaultLabel(record.orderNumber(), "—"),
                    defaultLabel(record.orderName(), "—"),
                    defaultLabel(record.priority(), "—"),
                    defaultLabel(record.category(), "未标注"),
                    defaultLabel(record.resolver(), "未分配"),
                    formatMinutes(record.responseMinutes()),
                    formatHours(record.resolutionMinutes() / 60.0),
                    record.violationType()
                )).toList()
        );
    }

    private List<IncidentSlaRecord> buildIncidentSlaRecords(BiRawData rawData) {
        Map<String, Double> responseCriteria = buildIncidentCriteriaMap(rawData.incidentSlaCriteria(), List.of("Response （minutes）", "Response (minutes)", "Response"));
        Map<String, Double> resolutionCriteria = buildIncidentCriteriaMap(rawData.incidentSlaCriteria(), List.of("Resolution （hours）", "Resolution (hours)", "Resolution"));
        return rawData.incidents().stream()
            .map(row -> {
                String priority = clean(row.get("Priority"));
                Double responseTarget = responseCriteria.get(priority);
                Double resolutionTarget = resolutionCriteria.get(priority);
                if (priority.isBlank() || responseTarget == null || resolutionTarget == null) {
                    return null;
                }
                double responseMinutes = parseDouble(row.get("Response Time(m)"));
                double resolutionMinutes = parseDouble(row.get("Resolution Time(m)"));
                return new IncidentSlaRecord(
                    row.get("Order Number"),
                    row.get("Order Name"),
                    priority,
                    row.get("Category"),
                    row.get("Resolver"),
                    parseDate(row.get("Begin Date")),
                    responseMinutes,
                    resolutionMinutes,
                    responseMinutes <= responseTarget,
                    resolutionMinutes / 60.0 <= resolutionTarget
                );
            })
            .filter(Objects::nonNull)
            .toList();
    }

    private Map<String, Double> buildIncidentCriteriaMap(List<Map<String, String>> rows, List<String> candidateKeys) {
        return rows.stream()
            .filter(row -> !clean(row.get("Priority")).isBlank())
            .collect(Collectors.toMap(
                row -> clean(row.get("Priority")),
                row -> parseDouble(findFirstValue(row, candidateKeys)),
                (left, right) -> right,
                LinkedHashMap::new
            ));
    }

    private String findFirstValue(Map<String, String> row, List<String> candidateKeys) {
        for (String key : candidateKeys) {
            String value = clean(row.get(key));
            if (!value.isBlank()) {
                return value;
            }
        }
        return "";
    }

    private BiModels.SlaPriorityRow buildPriorityRow(String priority, List<IncidentSlaRecord> rows) {
        if (rows.isEmpty()) {
            return null;
        }
        return new BiModels.SlaPriorityRow(
            priority,
            rows.size(),
            percentage(percentageValue(rows.stream().filter(IncidentSlaRecord::responseMet).count(), rows.size())),
            percentage(percentageValue(rows.stream().filter(IncidentSlaRecord::resolutionMet).count(), rows.size())),
            rows.stream().filter(IncidentSlaRecord::anyBreached).count(),
            formatHours(rows.stream().mapToDouble(IncidentSlaRecord::resolutionMinutes).average().orElse(0) / 60.0)
        );
    }

    private BiModels.SlaDimensionCard buildSlaDimensionCard(String title, double complianceRate, double averageMinutes, double p90Minutes, long breachedCount) {
        return new BiModels.SlaDimensionCard(
            title,
            percentage(complianceRate),
            title.contains("响应") ? formatMinutes(averageMinutes) : formatHours(averageMinutes / 60.0),
            title.contains("响应") ? formatMinutes(p90Minutes) : formatHours(p90Minutes / 60.0),
            breachedCount,
            toneFromScore(complianceRate, 0.9, 0.75),
            complianceRate >= 0.9 ? "整体稳定" : (complianceRate >= 0.75 ? "需重点关注" : "当前主要风险")
        );
    }

    private List<BiModels.SlaRiskRow> rankSlaRisks(List<IncidentSlaRecord> incidents, Function<IncidentSlaRecord, String> classifier) {
        return incidents.stream()
            .collect(Collectors.groupingBy(record -> defaultLabel(classifier.apply(record), "未标注"), LinkedHashMap::new, Collectors.toList()))
            .entrySet()
            .stream()
            .map(entry -> {
                List<IncidentSlaRecord> rows = entry.getValue();
                long breachedCount = rows.stream().filter(IncidentSlaRecord::anyBreached).count();
                double resolutionRate = percentageValue(rows.stream().filter(IncidentSlaRecord::resolutionMet).count(), rows.size());
                return Map.entry(
                    breachedCount * 1000 + Math.round((1 - resolutionRate) * 100) + rows.size(),
                    new BiModels.SlaRiskRow(
                        entry.getKey(),
                        rows.size(),
                        percentage(percentageValue(rows.stream().filter(IncidentSlaRecord::responseMet).count(), rows.size())),
                        percentage(resolutionRate),
                        breachedCount,
                        formatHours(rows.stream().mapToDouble(IncidentSlaRecord::resolutionMinutes).average().orElse(0) / 60.0)
                    )
                );
            })
            .sorted((left, right) -> Long.compare(right.getKey(), left.getKey()))
            .limit(5)
            .map(Map.Entry::getValue)
            .toList();
    }

    private List<BiModels.SlaTrendPoint> buildSlaTrendPoints(List<IncidentSlaRecord> incidents) {
        return incidents.stream()
            .filter(record -> record.beginDate() != null)
            .collect(Collectors.groupingBy(record -> YearMonth.from(record.beginDate()), LinkedHashMap::new, Collectors.toList()))
            .entrySet()
            .stream()
            .sorted(Map.Entry.comparingByKey())
            .map(entry -> {
                List<IncidentSlaRecord> rows = entry.getValue();
                return new BiModels.SlaTrendPoint(
                    entry.getKey().toString(),
                    parsePercentage(percentage(percentageValue(rows.stream().filter(IncidentSlaRecord::overallMet).count(), rows.size()))),
                    parsePercentage(percentage(percentageValue(rows.stream().filter(IncidentSlaRecord::responseMet).count(), rows.size()))),
                    parsePercentage(percentage(percentageValue(rows.stream().filter(IncidentSlaRecord::resolutionMet).count(), rows.size()))),
                    rows.stream().filter(IncidentSlaRecord::anyBreached).count()
                );
            })
            .toList();
    }

    private List<ChartDatum> buildSlaWeeklyTrendData(List<IncidentSlaRecord> incidents) {
        return incidents.stream()
            .filter(record -> record.beginDate() != null)
            .collect(Collectors.groupingBy(
                record -> formatPeriodLabel(record.beginDate(), "weekly"),
                LinkedHashMap::new, Collectors.toList()))
            .entrySet().stream()
            .sorted(Map.Entry.comparingByKey())
            .map(entry -> {
                List<IncidentSlaRecord> rows = entry.getValue();
                List<IncidentSlaRecord> p1p2Rows = rows.stream().filter(r -> matchesAny(r.priority(), List.of("P1", "P2"))).toList();
                double p1p2Rate = percentageValue(p1p2Rows.stream().filter(IncidentSlaRecord::overallMet).count(), p1p2Rows.size()) * 100.0;
                double responseRate = percentageValue(rows.stream().filter(IncidentSlaRecord::responseMet).count(), rows.size()) * 100.0;
                double resolutionRate = percentageValue(rows.stream().filter(IncidentSlaRecord::resolutionMet).count(), rows.size()) * 100.0;
                return new ChartDatum(
                    entry.getKey() + "|" + String.format("%.1f", responseRate) + "|" + String.format("%.1f", resolutionRate) + "|" + String.format("%.1f", p1p2Rate),
                    responseRate
                );
            }).toList();
    }

    private String buildSlaSummarySentence(double responseRate, double resolutionRate, List<BiModels.SlaPriorityRow> priorityRows, List<BiModels.SlaRiskRow> categoryRisks) {
        BiModels.SlaPriorityRow weakestPriority = priorityRows.stream()
            .min(Comparator.comparingDouble(row -> parsePercentage(row.resolutionComplianceRate())))
            .orElse(null);
        String priorityLabel = weakestPriority == null ? "高优先级" : weakestPriority.priority();
        String categoryLabel = categoryRisks.isEmpty() ? "重点类别" : categoryRisks.getFirst().label();
        if (resolutionRate < 0.75 && responseRate >= 0.9) {
            return "响应履约整体稳定，但解决履约在" + priorityLabel + "与" + categoryLabel + "上持续承压。";
        }
        if (responseRate < 0.9 && resolutionRate < 0.75) {
            return "响应与解决双环节均存在压力，当前需优先收敛" + priorityLabel + "工单的履约风险。";
        }
        return "整体履约可控，建议持续盯防" + priorityLabel + "和" + categoryLabel + "的波动。";
    }

    private List<ChartDatum> topCounts(List<Map<String, String>> rows, String key, int limit) {
        return rows.stream()
            .map(row -> defaultLabel(row.get(key), "未标注"))
            .collect(Collectors.groupingBy(Function.identity(), LinkedHashMap::new, Collectors.counting()))
            .entrySet()
            .stream()
            .sorted(Map.Entry.<String, Long>comparingByValue().reversed())
            .limit(limit)
            .map(entry -> new ChartDatum(entry.getKey(), entry.getValue()))
            .toList();
    }

    private List<ChartDatum> topCharts(Map<String, Double> values) {
        return values.entrySet().stream()
            .map(entry -> new ChartDatum(entry.getKey(), entry.getValue()))
            .toList();
    }

    private List<List<String>> rowsFromChart(List<ChartDatum> items) {
        return items.stream()
            .map(item -> List.of(item.label(), formatNumber(item.value())))
            .toList();
    }

    private long distinctCount(List<Map<String, String>> rows, String key) {
        return rows.stream().map(row -> clean(row.get(key))).filter(value -> !value.isBlank()).distinct().count();
    }

    private long countByValue(List<Map<String, String>> rows, String key, String value) {
        return rows.stream().filter(row -> clean(row.get(key)).equalsIgnoreCase(value)).count();
    }

    private boolean isYes(String value) {
        return clean(value).equalsIgnoreCase("Yes");
    }

    private boolean matchesAny(String value, List<String> candidates) {
        return candidates.stream().anyMatch(candidate -> candidate.equalsIgnoreCase(value));
    }

    private String percentage(double value) {
        return String.format(Locale.ROOT, "%.1f%%", value * 100.0);
    }

    private String percentage(long numerator, long denominator) {
        if (denominator <= 0) {
            return "0.0%";
        }
        return String.format(Locale.ROOT, "%.1f%%", numerator * 100.0 / denominator);
    }

    private double percentageValue(long numerator, long denominator) {
        if (denominator <= 0) {
            return 0;
        }
        return numerator * 1.0 / denominator;
    }

    private double average(List<Map<String, String>> rows, String key) {
        return rows.stream()
            .map(row -> parseDouble(row.get(key)))
            .filter(value -> value > 0)
            .mapToDouble(Double::doubleValue)
            .average()
            .orElse(0);
    }

    private String formatNumber(double value) {
        return String.format(Locale.ROOT, "%.2f", value);
    }

    private String formatScore(double value) {
        return String.format(Locale.ROOT, "%.0f", value);
    }

    private String formatHours(double value) {
        return String.format(Locale.ROOT, "%.1fh", value);
    }

    private String formatMinutes(double value) {
        return String.format(Locale.ROOT, "%.1fm", value);
    }

    private double percentile(List<Double> values, double percentile) {
        List<Double> filtered = values.stream().filter(value -> value >= 0).sorted().toList();
        if (filtered.isEmpty()) {
            return 0;
        }
        int index = Math.min(filtered.size() - 1, (int) Math.floor((filtered.size() - 1) * percentile));
        return filtered.get(index);
    }

    private double parsePercentage(String percentageText) {
        return parseDouble(percentageText.replace("%", ""));
    }

    private long parseLong(String value) {
        try {
            return Math.round(Double.parseDouble(clean(value)));
        } catch (NumberFormatException exception) {
            return 0;
        }
    }

    private double parseDouble(String value) {
        try {
            return Double.parseDouble(clean(value));
        } catch (NumberFormatException exception) {
            return 0;
        }
    }

    private String clean(String value) {
        return value == null ? "" : value.trim();
    }

    private String defaultLabel(String value, String fallback) {
        String normalized = clean(value);
        return normalized.isBlank() ? fallback : normalized;
    }

    private String truncate(String value, int maxLength) {
        if (value == null || value.length() <= maxLength) {
            return value;
        }
        return value.substring(0, maxLength - 3) + "...";
    }

    private double scoreHigherBetter(double value, double goodThreshold, double warningThreshold) {
        if (value >= goodThreshold) {
            return 90 + Math.min((value - goodThreshold) / Math.max(1 - goodThreshold, 0.0001) * 10, 10);
        }
        if (value >= warningThreshold) {
            return 65 + (value - warningThreshold) / Math.max(goodThreshold - warningThreshold, 0.0001) * 25;
        }
        return Math.max(value / Math.max(warningThreshold, 0.0001) * 65, 10);
    }

    private double scoreLowerBetter(double value, double goodThreshold, double warningThreshold) {
        if (value <= goodThreshold) {
            return 95;
        }
        if (value <= warningThreshold) {
            return 65 + (warningThreshold - value) / Math.max(warningThreshold - goodThreshold, 0.0001) * 25;
        }
        return Math.max(20, 65 - Math.min((value - warningThreshold) / Math.max(warningThreshold, 0.0001) * 40, 45));
    }

    private double weightedAverage(List<Double> values) {
        return values.stream().mapToDouble(Double::doubleValue).average().orElse(0);
    }

    private double weightedScore(Map<String, Double> scores) {
        return scores.getOrDefault("incident", 0.0) * 0.35
            + scores.getOrDefault("change", 0.0) * 0.25
            + scores.getOrDefault("request", 0.0) * 0.2
            + scores.getOrDefault("problem", 0.0) * 0.2;
    }

    private String gradeForScore(double score) {
        if (score >= 85) {
            return "Stable";
        }
        if (score >= 70) {
            return "Watch";
        }
        return "Risk";
    }

    private String toneFromNormalizedScore(double score) {
        if (score >= 85) {
            return "success";
        }
        if (score >= 70) {
            return "warning";
        }
        return "danger";
    }

    private String toneFromScore(double score, double goodThreshold, double warningThreshold) {
        if (score >= goodThreshold) {
            return "success";
        }
        if (score >= warningThreshold) {
            return "warning";
        }
        return "danger";
    }

    private String toneFromRate(String percentageText) {
        return toneFromScore(parsePercentage(percentageText) / 100.0, 0.9, 0.75);
    }

    private int priorityRank(String priority) {
        int index = PRIORITY_ORDER.indexOf(priority.toUpperCase(Locale.ROOT));
        return index >= 0 ? index : PRIORITY_ORDER.size();
    }

    private int violationSeverity(String violationType) {
        return switch (violationType) {
        case "双违约" -> 0;
        case "解决违约" -> 1;
        case "响应违约" -> 2;
        default -> 3;
        };
    }

    private String toneFromInverse(double value, double goodThreshold, double warningThreshold) {
        if (value <= goodThreshold) {
            return "success";
        }
        if (value <= warningThreshold) {
            return "warning";
        }
        return "danger";
    }

    private String incidentHealthSummary(double slaRate, double mttrHours) {
        return "SLA " + percentage(slaRate) + "，MTTR " + formatHours(mttrHours);
    }

    private List<BiModels.ExecutiveRisk> buildExecutiveRisks(long incidentSlaBreached, long changeFailures, long requestOpen, long problemOpen, double changeIncidentRate, double requestCsat, double problemClosureRate) {
        List<BiModels.ExecutiveRisk> risks = new ArrayList<>();
        if (changeFailures >= 5) {
            risks.add(new BiModels.ExecutiveRisk("change-failure", "Critical", "变更失败率偏高", "发布稳定性下降，需优先排查高风险变更。", "变更", String.valueOf(changeFailures)));
        }
        if (problemClosureRate < 0.55) {
            risks.add(new BiModels.ExecutiveRisk("problem-closure", "Warning", "问题关闭率不足", "根因与永久修复积压，风险会持续放大。", "问题", percentage(problemClosureRate)));
        }
        if (requestOpen >= 15) {
            risks.add(new BiModels.ExecutiveRisk("request-open", "Warning", "未完成请求积压", "履约体验承压，用户等待时间会拉长。", "请求", String.valueOf(requestOpen)));
        }
        if (changeIncidentRate >= 0.1) {
            risks.add(new BiModels.ExecutiveRisk("change-incident", "Warning", "变更引发事件偏多", "上线质量与变更验证存在薄弱点。", "变更", percentage(changeIncidentRate)));
        }
        if (requestCsat > 0 && requestCsat < 3.8) {
            risks.add(new BiModels.ExecutiveRisk("request-csat", "Attention", "请求满意度下滑", "服务体验有波动，建议复盘高频诉求。", "请求", formatNumber(requestCsat)));
        }
        if (incidentSlaBreached > 0) {
            risks.add(new BiModels.ExecutiveRisk("incident-sla", "Attention", "事件 SLA 出现违约", "核心事件响应存在超时情况。", "事件", String.valueOf(incidentSlaBreached)));
        }
        if (problemOpen >= 20) {
            risks.add(new BiModels.ExecutiveRisk("problem-open", "Attention", "未关闭问题偏多", "问题池持续扩大，会拖累稳定性治理。", "问题", String.valueOf(problemOpen)));
        }
        return risks.stream().sorted(Comparator.comparingInt(this::riskPriorityOrder)).toList();
    }

    private int riskPriorityOrder(BiModels.ExecutiveRisk risk) {
        return switch (risk.priority()) {
        case "Critical" -> 0;
        case "Warning" -> 1;
        default -> 2;
        };
    }

    private String buildExecutiveSummarySentence(String grade, BiModels.RiskSummary riskSummary, List<BiModels.ProcessHealth> processHealths) {
        BiModels.ProcessHealth weakest = processHealths.stream().min(Comparator.comparingDouble(process -> parseDouble(process.score()))).orElse(null);
        if ("Stable".equals(grade)) {
            return "整体运行稳定，但仍需持续关注" + (weakest != null ? weakest.label() : "重点流程") + "的波动。";
        }
        if ("Watch".equals(grade)) {
            return "整体运行可控，但" + (weakest != null ? weakest.label() : "部分流程") + "已进入重点关注区，建议优先处理前列风险。";
        }
        return "整体健康存在风险，当前需优先收敛" + (riskSummary.topRisks().isEmpty() ? "关键问题" : riskSummary.topRisks().getFirst().title()) + "。";
    }

    private String buildTrendHint(List<BiModels.TrendPoint> trendPoints) {
        if (trendPoints.size() < 2) {
            return "趋势数据正在准备中。";
        }
        BiModels.TrendPoint previous = trendPoints.get(trendPoints.size() - 2);
        BiModels.TrendPoint current = trendPoints.getLast();
        double delta = current.score() - previous.score();
        if (delta > 2) {
            return "较上期提升 " + String.format(Locale.ROOT, "%.1f", delta) + " 分。";
        }
        if (delta < -2) {
            return "较上期下降 " + String.format(Locale.ROOT, "%.1f", Math.abs(delta)) + " 分。";
        }
        return "整体趋势基本持平。";
    }

    private String buildPeriodLabel(BiRawData rawData) {
        List<LocalDateTime> dates = collectDates(rawData);
        if (dates.isEmpty()) {
            return "固定样例数据";
        }
        LocalDate min = dates.stream().min(LocalDateTime::compareTo).orElseThrow().toLocalDate();
        LocalDate max = dates.stream().max(LocalDateTime::compareTo).orElseThrow().toLocalDate();
        return min + " 至 " + max;
    }

    private List<BiModels.TrendPoint> buildTrendPoints(BiRawData rawData) {
        Map<YearMonth, List<Map<String, String>>> incidentsByMonth = groupByMonth(rawData.incidents(), "Begin Date");
        Map<YearMonth, List<Map<String, String>>> changesByMonth = groupByMonth(rawData.changes(), "Requested Date");
        Map<YearMonth, List<Map<String, String>>> requestsByMonth = groupByMonth(rawData.requests(), "Requested Date");
        Map<YearMonth, List<Map<String, String>>> problemsByMonth = groupByMonth(rawData.problems(), "Logged Date");

        List<YearMonth> months = new ArrayList<>();
        months.addAll(incidentsByMonth.keySet());
        months.addAll(changesByMonth.keySet());
        months.addAll(requestsByMonth.keySet());
        months.addAll(problemsByMonth.keySet());

        return months.stream()
            .distinct()
            .sorted()
            .limit(Math.max(months.size(), 6))
            .map(month -> {
                List<Map<String, String>> monthIncidents = incidentsByMonth.getOrDefault(month, List.of());
                List<Map<String, String>> monthChanges = changesByMonth.getOrDefault(month, List.of());
                List<Map<String, String>> monthRequests = requestsByMonth.getOrDefault(month, List.of());
                List<Map<String, String>> monthProblems = problemsByMonth.getOrDefault(month, List.of());
                double score = weightedScore(Map.of(
                    "incident", weightedAverage(List.of(
                        scoreHigherBetter(percentageValue(countByValue(monthIncidents, "SLA Compliant", "Yes"), monthIncidents.size()), 0.95, 0.85),
                        scoreLowerBetter(average(monthIncidents, "Resolution Time(m)") / 60.0, 12, 24)
                    )),
                    "change", weightedAverage(List.of(
                        scoreHigherBetter(percentageValue(countByValue(monthChanges, "Success", "Yes"), monthChanges.size()), 0.95, 0.85),
                        scoreLowerBetter(percentageValue(countByValue(monthChanges, "Incident Caused", "Yes"), monthChanges.size()), 0.05, 0.12)
                    )),
                    "request", weightedAverage(List.of(
                        scoreHigherBetter(percentageValue(countByValue(monthRequests, "SLA Met", "Yes"), monthRequests.size()), 0.9, 0.75),
                        scoreHigherBetter(average(monthRequests, "Satisfaction Score") / 5.0, 0.82, 0.7)
                    )),
                    "problem", scoreHigherBetter(percentageValue(monthProblems.stream().filter(row -> matchesAny(clean(row.get("Status")), List.of("Resolved", "Closed"))).count(), monthProblems.size()), 0.75, 0.55)
                ));
                double signal = monthIncidents.stream().filter(row -> matchesAny(clean(row.get("Priority")), List.of("P1", "P2"))).count();
                return new BiModels.TrendPoint(month.toString(), score, signal);
            })
            .sorted(Comparator.comparing(BiModels.TrendPoint::label))
            .toList();
    }

    private Map<YearMonth, List<Map<String, String>>> groupByMonth(List<Map<String, String>> rows, String key) {
        return rows.stream()
            .map(row -> {
                LocalDateTime parsedDate = parseDate(row.get(key));
                if (parsedDate == null) {
                    return null;
                }
                return Map.entry(parsedDate, row);
            })
            .filter(Objects::nonNull)
            .collect(Collectors.groupingBy(entry -> YearMonth.from(entry.getKey()), LinkedHashMap::new, Collectors.mapping(Map.Entry::getValue, Collectors.toList())));
    }

    private List<LocalDateTime> collectDates(BiRawData rawData) {
        List<LocalDateTime> dates = new ArrayList<>();
        addDates(dates, rawData.incidents(), "Begin Date");
        addDates(dates, rawData.changes(), "Requested Date");
        addDates(dates, rawData.requests(), "Requested Date");
        addDates(dates, rawData.problems(), "Logged Date");
        return dates;
    }

    private void addDates(List<LocalDateTime> target, List<Map<String, String>> rows, String key) {
        rows.stream().map(row -> parseDate(row.get(key))).filter(Objects::nonNull).forEach(target::add);
    }

    private LocalDateTime parseDate(String value) {
        String normalized = clean(value);
        if (normalized.isBlank()) {
            return null;
        }
        for (DateTimeFormatter formatter : DATE_TIME_FORMATTERS) {
            try {
                return LocalDateTime.parse(normalized, formatter);
            } catch (DateTimeParseException ignored) {
            }
        }
        try {
            return LocalDate.parse(normalized).atStartOfDay();
        } catch (DateTimeParseException ignored) {
        }
        try {
            double excelDate = Double.parseDouble(normalized);
            return LocalDateTime.ofInstant(java.time.Instant.ofEpochMilli(Math.round((excelDate - 25569) * 86400000L)), ZoneOffset.UTC);
        } catch (NumberFormatException ignored) {
        }
        return null;
    }

    private String safeSheetName(String value) {
        return value.replace("/", "-");
    }

    private int writeTitle(XSSFSheet sheet, int rowIndex, String title, String description) {
        Row titleRow = sheet.createRow(rowIndex++);
        titleRow.createCell(0).setCellValue(title);
        Row descriptionRow = sheet.createRow(rowIndex++);
        descriptionRow.createCell(0).setCellValue(description);
        return rowIndex + 1;
    }

    private int writeCards(XSSFSheet sheet, int rowIndex, List<MetricCard> cards) {
        if (cards.isEmpty()) {
            return rowIndex;
        }
        Row header = sheet.createRow(rowIndex++);
        header.createCell(0).setCellValue("指标");
        header.createCell(1).setCellValue("值");
        for (MetricCard card : cards) {
            Row row = sheet.createRow(rowIndex++);
            row.createCell(0).setCellValue(card.label());
            row.createCell(1).setCellValue(card.value());
        }
        return rowIndex + 1;
    }

    private int writeCharts(XSSFSheet sheet, int rowIndex, List<ChartSection> charts) {
        for (ChartSection chart : charts) {
            Row titleRow = sheet.createRow(rowIndex++);
            titleRow.createCell(0).setCellValue(chart.title());
            Row headerRow = sheet.createRow(rowIndex++);
            headerRow.createCell(0).setCellValue("标签");
            headerRow.createCell(1).setCellValue("值");
            for (ChartDatum item : chart.items()) {
                Row row = sheet.createRow(rowIndex++);
                row.createCell(0).setCellValue(item.label());
                Cell valueCell = row.createCell(1);
                valueCell.setCellValue(item.value());
            }
            rowIndex++;
        }
        return rowIndex;
    }

    private int writeTables(XSSFSheet sheet, int rowIndex, List<BiModels.TableSection> tables) {
        for (BiModels.TableSection table : tables) {
            Row titleRow = sheet.createRow(rowIndex++);
            titleRow.createCell(0).setCellValue(table.title());
            Row headerRow = sheet.createRow(rowIndex++);
            for (int index = 0; index < table.columns().size(); index++) {
                headerRow.createCell(index).setCellValue(table.columns().get(index));
            }
            for (List<String> values : table.rows()) {
                Row row = sheet.createRow(rowIndex++);
                for (int index = 0; index < values.size(); index++) {
                    row.createCell(index).setCellValue(values.get(index));
                }
            }
            rowIndex++;
        }
        return rowIndex;
    }
}
