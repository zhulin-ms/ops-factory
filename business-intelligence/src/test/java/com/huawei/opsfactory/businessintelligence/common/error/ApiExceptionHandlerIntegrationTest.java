package com.huawei.opsfactory.businessintelligence.common.error;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.BDDMockito.given;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.huawei.opsfactory.businessintelligence.datasource.BiDataProvider;
import com.huawei.opsfactory.businessintelligence.datasource.BiRawData;
import com.huawei.opsfactory.businessintelligence.support.TestLogAppender;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.test.web.servlet.MockMvc;

@SpringBootTest
@AutoConfigureMockMvc
class ApiExceptionHandlerIntegrationTest {

    @Autowired
    private MockMvc mockMvc;

    @MockBean
    private BiDataProvider dataProvider;

    @BeforeEach
    void setUp() {
        given(dataProvider.load()).willReturn(new BiRawData(List.of(), List.of(), List.of(), List.of(), List.of()));
    }

    @Test
    void shouldReturnNotFoundAndWriteWarnLogForUnknownTab() throws Exception {
        try (TestLogAppender appender = TestLogAppender.attachTo(ApiExceptionHandler.class)) {
            mockMvc.perform(get("/business-intelligence/tabs/unknown-tab"))
                .andExpect(status().isNotFound());

            assertThat(appender.formattedMessages())
                .anyMatch(message -> message.contains("Request failed with invalid resource: Unknown tab: unknown-tab"));
        }
    }
}
