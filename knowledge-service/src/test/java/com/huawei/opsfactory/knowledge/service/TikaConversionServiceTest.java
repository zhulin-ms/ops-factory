package com.huawei.opsfactory.knowledge.service;

import static org.assertj.core.api.Assertions.assertThat;

import java.lang.reflect.Method;
import java.nio.file.Path;
import org.junit.jupiter.api.Test;

class TikaConversionServiceTest {

    private final TikaConversionService service = new TikaConversionService();

    @Test
    void shouldConvertHtmlInputIntoMarkdownInsteadOfReturningRawHtml() {
        Path htmlFile = Path.of("src/test/resources/inputFiles/SLA_Violation_Analysis_Report_CN.html").toAbsolutePath().normalize();

        TikaConversionService.ConversionResult result = service.convert(htmlFile);

        assertThat(result.contentType()).startsWith("text/html");
        assertThat(result.markdown())
            .contains("# SLA违约归因分析报告")
            .contains("## 执行摘要")
            .doesNotContain("<html")
            .doesNotContain("<style")
            .doesNotContain("<body");
    }

    @Test
    void shouldPreserveHeadingsAndTablesWhenConvertingTikaXhtml() throws Exception {
        Method method = TikaConversionService.class.getDeclaredMethod("toMarkdownFromXhtml", String.class);
        method.setAccessible(true);

        String markdown = (String) method.invoke(service, """
            <html xmlns="http://www.w3.org/1999/xhtml">
            <head><title></title></head>
            <body>
              <a name="sec1"></a>
              <h1>执行安全加固</h1>
              <p>执行安全维护操作前，请确保产品已经实施了安全加固操作。</p>
              <table>
                <thead>
                  <tr><th><p>应用场景</p></th><th><p>手册名称</p></th></tr>
                </thead>
                <tbody>
                  <tr><td><p>安装与配置</p></td><td><p>安全加固指南</p></td></tr>
                </tbody>
              </table>
            </body>
            </html>
            """);

        assertThat(markdown)
            .contains("# 执行安全加固")
            .contains("执行安全维护操作前，请确保产品已经实施了安全加固操作。")
            .contains("| 应用场景 | 手册名称 |")
            .doesNotContain("<h1>")
            .doesNotContain("<table>");
    }
}
