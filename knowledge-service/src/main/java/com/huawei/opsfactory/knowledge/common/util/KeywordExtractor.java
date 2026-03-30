package com.huawei.opsfactory.knowledge.common.util;

import java.io.IOException;
import java.io.StringReader;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

import org.apache.lucene.analysis.Analyzer;
import org.apache.lucene.analysis.TokenStream;
import org.apache.lucene.analysis.cn.smart.SmartChineseAnalyzer;
import org.apache.lucene.analysis.tokenattributes.CharTermAttribute;

public final class KeywordExtractor {

    private static final Set<String> STOP_WORDS_EN = Set.of(
        "the", "and", "for", "with", "that", "this", "from", "was", "are", "but",
        "have", "has", "had", "been", "were", "will", "would", "could", "should",
        "can", "may", "might", "shall", "must", "need", "does", "did", "done",
        "not", "nor", "also", "just", "only", "very", "too", "more", "most",
        "some", "any", "all", "each", "every", "both", "few", "many", "much",
        "such", "than", "then", "when", "where", "which", "while", "what", "who",
        "whom", "how", "why", "its", "his", "her", "our", "your", "their",
        "into", "onto", "upon", "about", "after", "before", "between", "through",
        "during", "without", "within", "along", "among", "since", "until",
        "above", "below", "over", "under", "around", "against",
        "they", "them", "these", "those", "here", "there", "other", "another",
        "being", "having", "doing", "going", "using", "including",
        "etc", "yes", "yet", "still", "already", "even", "well",
        "like", "get", "got", "set", "let", "put", "make", "take",
        "come", "give", "keep", "see", "use", "new", "one", "two"
    );

    private static final Set<String> STOP_WORDS_ZH = Set.of(
        "此外", "另外", "同时", "因此", "所以", "但是", "然而", "而且", "并且",
        "或者", "以及", "如果", "虽然", "因为", "由于", "不过", "尽管", "即使",
        "当前", "目前", "现在", "已经", "正在", "可以", "能够", "需要", "应该",
        "其中", "之间", "之后", "之前", "以下", "以上", "对于", "关于", "通过",
        "进行", "实现", "使用", "提供", "包括", "相关", "主要", "基于", "根据",
        "以便", "从而", "为了", "这些", "那些", "其他", "一些", "部分", "方面",
        "情况", "问题", "方式", "过程", "结果", "内容", "功能",
        "我们", "他们", "它们", "自己", "什么", "怎么", "如何", "为什么",
        "不是", "没有", "不能", "不会", "还是", "就是", "只是",
        "这个", "那个", "一个", "每个", "整个", "所有", "各种", "各个",
        "非常", "比较", "特别", "完全", "一定", "可能", "一般", "通常",
        "不仅", "不但", "只要", "无论", "任何",
        "具有", "存在", "属于", "处于", "来自", "用于", "作为", "成为",
        "这样", "那样", "如此", "依然", "仍然", "依旧", "总是", "往往",
        "然后", "接着", "首先", "其次", "最后", "例如", "比如"
    );

    private KeywordExtractor() {
    }

    public static List<String> extract(String text, int maxKeywords) {
        if (text == null || text.isBlank()) {
            return List.of();
        }

        Map<String, Integer> counts = new HashMap<>();
        try (Analyzer analyzer = new SmartChineseAnalyzer();
             TokenStream tokenStream = analyzer.tokenStream("keywords", new StringReader(text))) {
            tokenStream.reset();
            CharTermAttribute attr = tokenStream.addAttribute(CharTermAttribute.class);
            while (tokenStream.incrementToken()) {
                String term = attr.toString().trim().toLowerCase(Locale.ROOT);
                if (term.isBlank() || term.length() < 2) {
                    continue;
                }
                if (STOP_WORDS_EN.contains(term) || STOP_WORDS_ZH.contains(term)) {
                    continue;
                }
                counts.merge(term, 1, Integer::sum);
            }
            tokenStream.end();
        } catch (IOException e) {
            throw new IllegalStateException("Failed to tokenize text for keyword extraction", e);
        }

        List<String> tokens = new ArrayList<>(counts.keySet());
        tokens.sort(Comparator.<String>comparingInt(counts::get).reversed()
            .thenComparing(String::compareTo));
        if (tokens.size() > maxKeywords) {
            return new ArrayList<>(tokens.subList(0, maxKeywords));
        }
        return tokens;
    }
}
