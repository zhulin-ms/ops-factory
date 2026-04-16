package com.huawei.opsfactory.knowledge.service;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

class KnowledgeServiceFacadeTest {

    @Test
    void shouldPreferDetectedChmContentTypeForChmUploads() {
        assertThat(KnowledgeServiceFacade.resolvePersistedContentType(
            "application/octet-stream",
            "application/vnd.ms-htmlhelp",
            "guide.chm"
        )).isEqualTo("application/vnd.ms-htmlhelp");
    }

    @Test
    void shouldReplaceGenericRequestContentTypeWithDetectedType() {
        assertThat(KnowledgeServiceFacade.resolvePersistedContentType(
            "application/octet-stream",
            "text/markdown",
            "notes.md"
        )).isEqualTo("text/markdown");
    }

    @Test
    void shouldKeepSpecificRequestContentTypeForRegularFiles() {
        assertThat(KnowledgeServiceFacade.resolvePersistedContentType(
            "application/pdf",
            "application/pdf",
            "manual.pdf"
        )).isEqualTo("application/pdf");
    }
}
