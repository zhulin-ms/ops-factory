package com.huawei.opsfactory.controlcenter.events;

import com.huawei.opsfactory.controlcenter.model.ControlCenterEvent;
import org.springframework.stereotype.Service;

import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Deque;
import java.util.List;

@Service
public class EventStoreService {

    private static final int MAX_EVENTS = 200;
    private final Deque<ControlCenterEvent> events = new ArrayDeque<>();

    public synchronized void append(ControlCenterEvent event) {
        events.addFirst(event);
        while (events.size() > MAX_EVENTS) {
            events.removeLast();
        }
    }

    public synchronized List<ControlCenterEvent> list() {
        return new ArrayList<>(events);
    }
}
