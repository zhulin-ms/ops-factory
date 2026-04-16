package com.huawei.opsfactory.controlcenter;

import com.huawei.opsfactory.controlcenter.config.ControlCenterProperties;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.EnableConfigurationProperties;

@SpringBootApplication
@EnableConfigurationProperties(ControlCenterProperties.class)
public class ControlCenterApplication {

    public static void main(String[] args) {
        SpringApplication.run(ControlCenterApplication.class, args);
    }
}
