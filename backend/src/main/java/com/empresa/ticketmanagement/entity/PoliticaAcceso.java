package com.empresa.ticketmanagement.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.Version;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.LocalDateTime;

@Entity
@Table(name = "politica_acceso")
@Getter
@Setter
@NoArgsConstructor
public class PoliticaAcceso {
    @Id
    private Integer id = 1;

    @Column(name = "max_intentos", nullable = false)
    private int maxIntentos;

    @Column(name = "duracion_bloqueo_minutos", nullable = false)
    private int duracionBloqueoMinutos;

    @Column(name = "limite_login_por_minuto", nullable = false)
    private int limiteLoginPorMinuto;

    @Column(name = "actualizado_por", nullable = false, length = 50)
    private String actualizadoPor;

    @Column(name = "fecha_actualizacion", nullable = false)
    private LocalDateTime fechaActualizacion;

    @Version
    @Column(name = "entity_version", nullable = false)
    private long version;
}
