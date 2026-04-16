package com.huawei.opsfactory.knowledge.service;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.regex.Pattern;
import org.apache.tika.Tika;
import org.apache.tika.metadata.Metadata;
import org.apache.tika.parser.AutoDetectParser;
import org.apache.tika.parser.ParseContext;
import org.apache.tika.sax.BodyContentHandler;
import org.apache.tika.sax.TeeContentHandler;
import org.apache.tika.sax.ToXMLContentHandler;
import org.jsoup.Jsoup;
import org.jsoup.nodes.Document;
import org.jsoup.nodes.Element;
import org.jsoup.nodes.Node;
import org.jsoup.nodes.TextNode;
import org.jsoup.parser.Parser;
import org.springframework.stereotype.Service;
import org.xml.sax.SAXException;

@Service
public class TikaConversionService {

    private static final Pattern MULTIPLE_NEWLINES = Pattern.compile("\\n{3,}");
    private static final Pattern MULTIPLE_SPACES = Pattern.compile("[ \\t]{2,}");

    private final Tika tika = new Tika();
    private final AutoDetectParser parser = new AutoDetectParser();

    public ConversionResult convert(Path file) {
        Metadata metadata = new Metadata();
        BodyContentHandler textHandler = new BodyContentHandler(-1);
        ToXMLContentHandler xmlHandler = new ToXMLContentHandler();
        try (var inputStream = Files.newInputStream(file)) {
            parser.parse(inputStream, new TeeContentHandler(textHandler, xmlHandler), metadata, new ParseContext());
            String contentType = Optional.ofNullable(metadata.get(Metadata.CONTENT_TYPE))
                .orElseGet(() -> detectType(file));
            String text = normalizePlainText(Optional.ofNullable(textHandler.toString()).orElse(""));
            String markdown = buildMarkdown(file, contentType, Optional.ofNullable(xmlHandler.toString()).orElse(""), text);
            String title = Optional.ofNullable(metadata.get("title"))
                .filter(s -> !s.isBlank())
                .orElse(file.getFileName().toString());
            return new ConversionResult(title, contentType, text, markdown);
        } catch (IOException | SAXException | org.apache.tika.exception.TikaException e) {
            throw new IllegalStateException("Failed to convert file " + file, e);
        }
    }

    public String detectType(Path file) {
        try {
            return tika.detect(file);
        } catch (IOException e) {
            throw new IllegalStateException("Failed to detect file type " + file, e);
        }
    }

    private String buildMarkdown(Path file, String contentType, String xhtml, String plainText) throws IOException {
        String lowerFileName = file.getFileName().toString().toLowerCase();
        if (lowerFileName.endsWith(".md") || "text/markdown".equalsIgnoreCase(contentType)) {
            return normalizeMarkdown(Files.readString(file));
        }
        if ("text/html".equalsIgnoreCase(contentType) || lowerFileName.endsWith(".html") || lowerFileName.endsWith(".htm")) {
            return toMarkdownFromHtml(Files.readString(file));
        }
        String markdown = toMarkdownFromXhtml(xhtml);
        if (markdown.isBlank()) {
            markdown = normalizeMarkdown(plainText);
        }
        return markdown;
    }

    private String toMarkdownFromXhtml(String xhtml) {
        if (xhtml == null || xhtml.isBlank()) {
            return "";
        }
        return toMarkdown(Jsoup.parse(xhtml, "", Parser.xmlParser()));
    }

    private String toMarkdownFromHtml(String html) {
        if (html == null || html.isBlank()) {
            return "";
        }
        return toMarkdown(Jsoup.parse(html));
    }

    private String toMarkdown(Document document) {
        document.outputSettings().prettyPrint(false);
        document.select("script,style,meta,link,head,title").remove();
        Element body = document.body();
        Element root = body != null && !body.children().isEmpty() ? body : document;
        StringBuilder markdown = new StringBuilder();
        for (Node node : root.childNodes()) {
            appendBlock(node, markdown);
        }
        return normalizeMarkdown(markdown.toString());
    }

    private void appendBlock(Node node, StringBuilder markdown) {
        if (node instanceof TextNode textNode) {
            String text = normalizeInlineText(textNode.text());
            if (!text.isBlank()) {
                markdown.append(text);
            }
            return;
        }
        if (!(node instanceof Element element)) {
            return;
        }

        String tag = element.tagName().toLowerCase();
        switch (tag) {
            case "h1", "h2", "h3", "h4", "h5", "h6" -> {
                ensureParagraphBreak(markdown);
                int level = Integer.parseInt(tag.substring(1));
                markdown.append("#".repeat(level))
                    .append(' ')
                    .append(renderInline(element))
                    .append("\n\n");
            }
            case "p" -> {
                String text = renderInline(element);
                if (!text.isBlank()) {
                    ensureParagraphBreak(markdown);
                    markdown.append(text).append("\n\n");
                }
            }
            case "br" -> markdown.append('\n');
            case "ul" -> {
                ensureParagraphBreak(markdown);
                appendList(element, markdown, false);
                markdown.append('\n');
            }
            case "ol" -> {
                ensureParagraphBreak(markdown);
                appendList(element, markdown, true);
                markdown.append('\n');
            }
            case "table" -> {
                ensureParagraphBreak(markdown);
                appendTable(element, markdown);
                markdown.append("\n\n");
            }
            case "body", "html", "div", "section", "article", "main", "header", "footer", "aside", "tbody", "thead", "tfoot" -> {
                for (Node child : element.childNodes()) {
                    appendBlock(child, markdown);
                }
            }
            default -> {
                if (isBlockLike(element)) {
                    String text = renderInline(element);
                    if (!text.isBlank()) {
                        ensureParagraphBreak(markdown);
                        markdown.append(text).append("\n\n");
                    }
                } else {
                    String text = renderInline(element);
                    if (!text.isBlank()) {
                        markdown.append(text);
                    }
                }
            }
        }
    }

    private void appendList(Element list, StringBuilder markdown, boolean ordered) {
        int index = 1;
        for (Element item : list.children()) {
            if (!"li".equalsIgnoreCase(item.tagName())) {
                continue;
            }
            String prefix = ordered ? index + ". " : "- ";
            markdown.append(prefix).append(renderInline(item)).append('\n');
            index++;
        }
    }

    private void appendTable(Element table, StringBuilder markdown) {
        List<List<String>> rows = new ArrayList<>();
        for (Element row : table.select("tr")) {
            List<String> cells = new ArrayList<>();
            for (Element cell : row.select("th,td")) {
                cells.add(sanitizeTableCell(renderInline(cell)));
            }
            if (!cells.isEmpty()) {
                rows.add(cells);
            }
        }
        if (rows.isEmpty()) {
            return;
        }
        int columns = rows.stream().mapToInt(List::size).max().orElse(0);
        if (columns == 0) {
            return;
        }
        normalizeColumns(rows, columns);
        markdown.append("| ").append(String.join(" | ", rows.get(0))).append(" |\n");
        markdown.append("| ");
        markdown.append(String.join(" | ", java.util.Collections.nCopies(columns, "---")));
        markdown.append(" |\n");
        for (int i = 1; i < rows.size(); i++) {
            markdown.append("| ").append(String.join(" | ", rows.get(i))).append(" |\n");
        }
    }

    private void normalizeColumns(List<List<String>> rows, int columns) {
        for (List<String> row : rows) {
            while (row.size() < columns) {
                row.add("");
            }
        }
    }

    private String sanitizeTableCell(String text) {
        return text.replace("|", "\\|").replace("\n", "<br>");
    }

    private String renderInline(Element element) {
        StringBuilder markdown = new StringBuilder();
        for (Node child : element.childNodes()) {
            appendInline(child, markdown);
        }
        return normalizeInlineText(markdown.toString());
    }

    private void appendInline(Node node, StringBuilder markdown) {
        if (node instanceof TextNode textNode) {
            markdown.append(textNode.text());
            return;
        }
        if (!(node instanceof Element element)) {
            return;
        }
        String tag = element.tagName().toLowerCase();
        switch (tag) {
            case "strong", "b" -> wrap(markdown, "**", renderInline(element));
            case "em", "i" -> wrap(markdown, "*", renderInline(element));
            case "code" -> wrap(markdown, "`", normalizeInlineText(element.text()));
            case "a" -> {
                String text = renderInline(element);
                String href = element.attr("href").trim();
                if (href.isBlank()) {
                    markdown.append(text);
                } else {
                    markdown.append("[").append(text.isBlank() ? href : text).append("](").append(href).append(")");
                }
            }
            case "br" -> markdown.append('\n');
            case "img" -> {
                String alt = normalizeInlineText(element.attr("alt"));
                String src = element.attr("src").trim();
                if (!src.isBlank()) {
                    markdown.append("![").append(alt).append("](").append(src).append(")");
                }
            }
            case "ul", "ol", "table" -> {
                StringBuilder block = new StringBuilder();
                appendBlock(element, block);
                markdown.append(block);
            }
            default -> {
                for (Node child : element.childNodes()) {
                    appendInline(child, markdown);
                }
            }
        }
    }

    private void wrap(StringBuilder markdown, String wrapper, String value) {
        if (!value.isBlank()) {
            markdown.append(wrapper).append(value).append(wrapper);
        }
    }

    private boolean isBlockLike(Element element) {
        return switch (element.tagName().toLowerCase()) {
            case "pre", "blockquote", "figure", "figcaption", "dl", "dt", "dd" -> true;
            default -> false;
        };
    }

    private void ensureParagraphBreak(StringBuilder markdown) {
        if (markdown.isEmpty()) {
            return;
        }
        int length = markdown.length();
        if (length >= 2 && markdown.charAt(length - 1) == '\n' && markdown.charAt(length - 2) == '\n') {
            return;
        }
        if (markdown.charAt(length - 1) == '\n') {
            markdown.append('\n');
        } else {
            markdown.append("\n\n");
        }
    }

    private String normalizePlainText(String text) {
        return normalizeLineEndings(text).trim();
    }

    private String normalizeMarkdown(String markdown) {
        String normalized = normalizeLineEndings(markdown);
        normalized = normalized.replace('\t', ' ');
        normalized = MULTIPLE_SPACES.matcher(normalized).replaceAll(" ");
        normalized = normalized.replaceAll("(?m)[ ]+$", "");
        normalized = MULTIPLE_NEWLINES.matcher(normalized).replaceAll("\n\n");
        return normalized.trim();
    }

    private String normalizeLineEndings(String text) {
        return text.replace("\r\n", "\n").replace('\r', '\n');
    }

    private String normalizeInlineText(String text) {
        return MULTIPLE_SPACES.matcher(normalizeLineEndings(text).replace('\n', ' ').trim()).replaceAll(" ");
    }

    public record ConversionResult(String title, String contentType, String text, String markdown) {
    }
}
