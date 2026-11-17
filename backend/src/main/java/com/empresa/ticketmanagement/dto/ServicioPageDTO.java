package com.empresa.ticketmanagement.dto;

import io.swagger.v3.oas.annotations.media.Schema;

import lombok.*;
import java.math.BigDecimal;
import java.util.List;
import java.util.Map;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@Schema(description = "Página de servicios con totales para todos los registros que cumplen los filtros, no solo la página actual.")
public class ServicioPageDTO {
    @Schema(description = "Servicios de la página solicitada.")
    private List<ServicioDTO> content;
    @Schema(description = "Cantidad total de servicios coincidentes.", example = "25")
    private long totalElements;
    @Schema(description = "Número total de páginas.", example = "4")
    private int totalPages;
    @Schema(description = "Índice de la página, empezando desde cero.", example = "0")
    private int number;
    @Schema(description = "Tamaño de página efectivo, ajustado al rango de 1 a 100.", example = "8")
    private int size;
    @Schema(description = "Suma aritmética de los costos mensuales, sin conversión entre monedas. Para comparar importes usa totalesPorDivisa.", example = "1200.50")
    private BigDecimal totalCostoMensual;
    @Schema(description = "Costos mensuales agrupados por moneda para todo el conjunto filtrado.", example = "{\"PEN\":1000.50,\"USD\":200.00}")
    private Map<String, BigDecimal> totalesPorDivisa;
}
