package com.huawei.opsfactory.gateway.service.channel;

import org.springframework.stereotype.Service;

import java.util.List;
import java.util.Map;
import java.util.function.Function;
import java.util.stream.Collectors;

@Service
public class ChannelAdapterRegistry {

    private final Map<String, ChannelAdapter> adaptersByType;

    public ChannelAdapterRegistry(List<ChannelAdapter> adapters) {
        this.adaptersByType = adapters.stream()
                .collect(Collectors.toMap(ChannelAdapter::type, Function.identity()));
    }

    public ChannelAdapter require(String type) {
        ChannelAdapter adapter = adaptersByType.get(type);
        if (adapter == null) {
            throw new IllegalArgumentException("No channel adapter registered for type '" + type + "'");
        }
        return adapter;
    }
}
