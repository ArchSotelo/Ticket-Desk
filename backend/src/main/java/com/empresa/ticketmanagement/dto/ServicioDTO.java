package com.empresa.ticketmanagement.dto;

import io.swagger.v3.oas.annotations.media.Schema;

import jakarta.validation.constraints.*;
import lombok.*;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@Schema(description = "Datos de un servicio y de un período de contratación. Los archivos y el estado se administran con sus operaciones específicas.")
public class ServicioDTO {

    @Schema(description = "Identificador del servicio.", example = "1", accessMode = Schema.AccessMode.READ_ONLY)
    private Long id;

    @NotBlank
    @Schema(description = "Nombre del servicio. Obligatorio al crear, actualizar o renovar con JSON.", example = "Correo corporativo")
    private String nombre;

    @NotBlank
    @Schema(description = "Proveedor del servicio.", example = "Proveedor de correo")
    private String proveedor;

    @NotBlank
    @Schema(description = "Nombre del tipo o categoría de servicio; se almacena como texto.", example = "Correo")
    private String tipo;

    @Schema(description = "Estado resultante calculado o asignado por el sistema. El campo no se usa en el cuerpo de creación o actualización.", example = "ACTIVO", accessMode = Schema.AccessMode.READ_ONLY, allowableValues = {"ACTIVO", "INACTIVO", "POR_VENCER", "VENCIDO", "FINALIZADO", "CANCELADO"})
    private String estado;

    @NotNull
    @Schema(description = "Inicio del período en formato yyyy-MM-dd.", example = "2027-01-01")
    private LocalDate fechaInicio;

    @NotNull
    @Schema(description = "Fin del período en formato yyyy-MM-dd. Para renovar, debe ser igual o posterior a fechaInicio.", example = "2027-12-31")
    private LocalDate fechaFin;

    @NotNull
    @PositiveOrZero
    @Schema(description = "Costo mensual no negativo, expresado en la divisa indicada.", example = "80.50", minimum = "0")
    private BigDecimal costoMensual;

    @Schema(description = "Código de la moneda; se normaliza a mayúsculas. Por defecto PEN.", example = "PEN", defaultValue = "PEN")
    private String divisa;

    @Schema(description = "ID del período anterior. Se asigna al renovar y permite recorrer el historial.", example = "12", accessMode = Schema.AccessMode.READ_ONLY)
    private Long servicioAnteriorId;

    @Schema(description = "Nombre original de la factura adjunta.", example = "factura.pdf", accessMode = Schema.AccessMode.READ_ONLY)
    private String facturaNombre;

    @Schema(description = "Tipo MIME registrado de la factura.", example = "application/pdf", accessMode = Schema.AccessMode.READ_ONLY)
    private String facturaMime;

    @Schema(description = "URL relativa para consultar la factura.", example = "/api/v1/services/1/invoice", accessMode = Schema.AccessMode.READ_ONLY)
    private String facturaUrl;

    @Schema(description = "Tamaño de la factura en bytes.", example = "102400", accessMode = Schema.AccessMode.READ_ONLY)
    private Long facturaTamano;

    @Schema(description = "Persona o equipo responsable del servicio.", example = "Sistemas")
    private String responsable;

    @Schema(description = "Observaciones del servicio. El endpoint /notes usa el nombre de campo observaciones.", example = "Revisar la renovación antes del vencimiento.")
    private String notas;

    @Schema(description = "Motivo registrado mediante el endpoint /cancel.", example = "Servicio reemplazado por otro proveedor.", accessMode = Schema.AccessMode.READ_ONLY)
    private String observacionCancelacion;

    @Schema(description = "Destinatarios de recordatorios. Los correos no vacíos deben tener formato válido; se recortan espacios y se eliminan duplicados.", example = "[\"soporte@example.com\"]")
    private List<@Email String> correosRecordatorio;

    @Schema(description = "Adjuntos activos del servicio, cargados mediante /attachments.", accessMode = Schema.AccessMode.READ_ONLY)
    private List<ServicioAdjuntoDTO> adjuntos;
}
