package com.empresa.ticketmanagement.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class EmpresaDTO {
    private Long id;
    private String razonSocial;
    private String ruc;
    private String email;
    private String telefono;
    private String direccion;
    private Boolean estado;
    private LocalDateTime fechaCreacion;
}
