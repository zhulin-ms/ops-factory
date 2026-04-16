package com.huawei.opsfactory.businessintelligence.support;

import java.io.Serializable;
import java.util.List;
import java.util.concurrent.CopyOnWriteArrayList;
import org.apache.logging.log4j.LogManager;
import org.apache.logging.log4j.core.Appender;
import org.apache.logging.log4j.core.Layout;
import org.apache.logging.log4j.core.LogEvent;
import org.apache.logging.log4j.core.Logger;
import org.apache.logging.log4j.core.appender.AbstractAppender;
import org.apache.logging.log4j.core.config.Property;
import org.apache.logging.log4j.core.layout.PatternLayout;

public final class TestLogAppender extends AbstractAppender implements AutoCloseable {

    private final Logger logger;
    private final List<LogEvent> events = new CopyOnWriteArrayList<>();

    private TestLogAppender(String name, Logger logger, Layout<? extends Serializable> layout) {
        super(name, null, layout, false, Property.EMPTY_ARRAY);
        this.logger = logger;
    }

    public static TestLogAppender attachTo(Class<?> type) {
        return attachTo(type.getName());
    }

    public static TestLogAppender attachTo(String loggerName) {
        Logger logger = (Logger) LogManager.getLogger(loggerName);
        TestLogAppender appender = new TestLogAppender(
            "test-appender-" + loggerName + "-" + System.nanoTime(),
            logger,
            PatternLayout.createDefaultLayout()
        );
        appender.start();
        logger.addAppender(appender);
        return appender;
    }

    @Override
    public void append(LogEvent event) {
        events.add(event.toImmutable());
    }

    public List<LogEvent> events() {
        return List.copyOf(events);
    }

    public List<String> formattedMessages() {
        return events.stream()
            .map(event -> event.getMessage().getFormattedMessage())
            .toList();
    }

    @Override
    public void close() {
        logger.removeAppender((Appender) this);
        stop();
    }
}
