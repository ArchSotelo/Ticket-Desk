package com.empresa.ticketmanagement.service;

import com.empresa.ticketmanagement.dto.ServicioDTO;
import com.empresa.ticketmanagement.dto.ServicioPageDTO;
import org.springframework.core.io.Resource;
import org.springframework.web.multipart.MultipartFile;
import java.time.LocalDate;
import java.util.List;

public interface ServicioService {
    ServicioPageDTO listar(String busqueda, String estado, int page, int size);
    ServicioDTO obtener(Long id);
    ServicioDTO crear(ServicioDTO dto);
    ServicioDTO actualizar(Long id, ServicioDTO dto);
    ServicioDTO actualizarObservaciones(Long id, String observaciones);
    ServicioDTO cambiarEstado(Long id, String estado);
    ServicioDTO cancelar(Long id, String observacionCancelacion);
    ServicioDTO renovar(Long id, LocalDate fechaInicio, LocalDate fechaFin);
    ServicioDTO renovar(Long id, ServicioDTO datos);
    List<ServicioDTO> historial(Long id);
    List<ServicioDTO> historialGeneral();
    ServicioDTO subirFactura(Long id, MultipartFile file);
    void eliminarFactura(Long id);
    ServicioDTO subirAdjuntos(Long id, List<MultipartFile> files);
    Resource descargarAdjunto(Long servicioId, Long adjuntoId);
    void eliminarAdjunto(Long servicioId, Long adjuntoId);
    Resource descargarFactura(Long id);
    byte[] exportarCsv();
    byte[] exportarExcel();
    int marcarVencidos();
}
