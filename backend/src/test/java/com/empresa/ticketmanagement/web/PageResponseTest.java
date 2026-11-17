package com.empresa.ticketmanagement.web;

import com.empresa.ticketmanagement.dto.PageResponseDTO;
import tools.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;

import java.util.List;
import static org.assertj.core.api.Assertions.*;

class PageResponseTest {
    @Test void emptyAndUnpagedResultsSerializeWithoutExposingSpringObjects() throws Exception {
        var mapper = new ObjectMapper();
        var empty = mapper.readTree(mapper.writeValueAsBytes(PageResponseDTO.from(Page.empty(PageRequest.of(0, 8)))));
        assertThat(empty.path("content").isArray()).isTrue();
        assertThat(empty.path("empty").asBoolean()).isTrue();
        assertThat(empty.path("size").asInt()).isEqualTo(8);
        assertThat(empty.path("totalElements").asLong()).isZero();
        var unpaged = PageResponseDTO.from(new PageImpl<>(List.of("one", "two")));
        assertThat(unpaged.pageable().unpaged()).isTrue();
        assertThat(unpaged.totalElements()).isEqualTo(2);
        assertThatCode(() -> mapper.writeValueAsString(unpaged)).doesNotThrowAnyException();
    }
}
