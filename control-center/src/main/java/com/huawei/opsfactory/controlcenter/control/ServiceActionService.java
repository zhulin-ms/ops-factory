package com.huawei.opsfactory.controlcenter.control;

import com.huawei.opsfactory.controlcenter.config.ControlCenterProperties;
import com.huawei.opsfactory.controlcenter.events.EventStoreService;
import com.huawei.opsfactory.controlcenter.model.ControlCenterEvent;
import com.huawei.opsfactory.controlcenter.model.ServiceActionResult;
import com.huawei.opsfactory.controlcenter.registry.ManagedServiceRegistry;
import org.springframework.stereotype.Service;

@Service
public class ServiceActionService {

    private final ManagedServiceRegistry registry;
    private final CtlScriptExecutor executor;
    private final EventStoreService eventStoreService;

    public ServiceActionService(ManagedServiceRegistry registry,
                               CtlScriptExecutor executor,
                               EventStoreService eventStoreService) {
        this.registry = registry;
        this.executor = executor;
        this.eventStoreService = eventStoreService;
    }

    public ServiceActionResult restart(String serviceId) {
        return execute(serviceId, "restart", "restart");
    }

    public ServiceActionResult start(String serviceId) {
        return execute(serviceId, "start", "startup");
    }

    public ServiceActionResult stop(String serviceId) {
        return execute(serviceId, "stop", "shutdown");
    }

    private ServiceActionResult execute(String serviceId, String actionLabel, String ctlAction) {
        ControlCenterProperties.ServiceTarget service = registry.require(serviceId);
        ServiceActionResult result = executor.execute(serviceId, actionLabel, ctlAction, service.getCtlComponent());
        String conciseMessage = actionLabel + (result.success() ? " succeeded" : " failed");
        if (!result.success() && result.message() != null && !result.message().isBlank()) {
            conciseMessage = conciseMessage + ": " + firstLine(result.message());
        }
        eventStoreService.append(new ControlCenterEvent(
                result.finishedAt(),
                "action",
                serviceId,
                service.getName(),
                result.success() ? "info" : "error",
                conciseMessage
        ));
        return result;
    }

    private static String firstLine(String value) {
        int newline = value.indexOf('\n');
        return newline >= 0 ? value.substring(0, newline) : value;
    }
}
