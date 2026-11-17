package com.empresa.ticketmanagement.dto;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;

import java.util.List;

/** Contrato JSON propio: no depende de la serialización interna de PageImpl. */
public record PageResponseDTO<T>(List<T> content, long totalElements, int totalPages,
        int size, int number, SortInfo sort, boolean first, boolean last,
        int numberOfElements, PageableInfo pageable, boolean empty) {

    public static <T> PageResponseDTO<T> from(Page<T> page) {
        return new PageResponseDTO<>(page.getContent(), page.getTotalElements(), page.getTotalPages(),
                page.getSize(), page.getNumber(), SortInfo.from(page.getSort()), page.isFirst(), page.isLast(),
                page.getNumberOfElements(), PageableInfo.from(page.getPageable()), page.isEmpty());
    }

    public record SortInfo(boolean empty, boolean sorted, boolean unsorted) {
        static SortInfo from(Sort sort) {
            return new SortInfo(sort.isEmpty(), sort.isSorted(), sort.isUnsorted());
        }
    }

    public record PageableInfo(Integer pageNumber, Integer pageSize, SortInfo sort, Long offset,
            boolean paged, boolean unpaged) {
        static PageableInfo from(Pageable pageable) {
            return new PageableInfo(pageable.isPaged() ? pageable.getPageNumber() : null,
                    pageable.isPaged() ? pageable.getPageSize() : null, SortInfo.from(pageable.getSort()),
                    pageable.isPaged() ? pageable.getOffset() : null, pageable.isPaged(), pageable.isUnpaged());
        }
    }
}
