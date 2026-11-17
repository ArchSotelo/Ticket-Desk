package com.empresa.ticketmanagement.controller;

import com.empresa.ticketmanagement.dto.ApiResponse;
import com.empresa.ticketmanagement.dto.ContactoDTO;
import com.empresa.ticketmanagement.dto.PageResponseDTO;
import com.empresa.ticketmanagement.service.ContactDirectoryService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/contacts")
@PreAuthorize("hasAuthority('CONTACT_READ')")
@RequiredArgsConstructor
@Tag(name = "Contactos", description = "Directorio de soporte; requiere CONTACT_READ y no permite administrar cuentas.")
public class ContactoController {
    private final ContactDirectoryService directory;

    @GetMapping
    @Operation(summary = "Consultar clientes o técnicos para la atención de tickets")
    public ApiResponse<PageResponseDTO<ContactoDTO>> listar(@RequestParam(defaultValue = "ROLE_CLIENTE") String rol,
            @RequestParam(defaultValue = "0") int page, @RequestParam(defaultValue = "100") int size) {
        return ApiResponse.ok(PageResponseDTO.from(directory.listar(rol,
                PageRequest.of(Math.max(0, page), Math.max(1, Math.min(500, size)), Sort.by("nombres", "id")))));
    }

    @GetMapping("/{id}")
    @Operation(summary = "Consultar los datos de contacto de un cliente")
    public ApiResponse<ContactoDTO> obtener(@PathVariable Long id) { return ApiResponse.ok(directory.obtenerCliente(id)); }
}
