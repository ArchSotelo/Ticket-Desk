package com.empresa.ticketmanagement.exception;

import com.empresa.ticketmanagement.security.LoginRateLimitException;

import com.empresa.ticketmanagement.dto.ApiResponse;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.core.AuthenticationException;
import org.springframework.validation.FieldError;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.context.request.async.AsyncRequestNotUsableException;
import org.springframework.web.util.DisconnectedClientHelper;

import java.util.ArrayList;
import java.util.List;

@RestControllerAdvice
@Slf4j
public class GlobalExceptionHandler {

    private static final DisconnectedClientHelper DISCONNECTED_CLIENT =
            new DisconnectedClientHelper(GlobalExceptionHandler.class.getName());

    // El navegador puede cancelar un GET al cambiar de pantalla. La respuesta ya no
    // se puede escribir: no intentar enviar otro JSON ni tratarlo como un error 500.
    @ExceptionHandler(AsyncRequestNotUsableException.class)
    public void handleUnusableResponse(AsyncRequestNotUsableException ex) {
        log.debug("La respuesta HTTP ya no está disponible; no se enviará otro cuerpo.");
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<ApiResponse<Void>> handleValidationErrors(MethodArgumentNotValidException ex) {
        List<String> errors = new ArrayList<>();
        for (FieldError fieldError : ex.getBindingResult().getFieldErrors()) {
            errors.add(fieldError.getField() + ": " + fieldError.getDefaultMessage());
        }
        return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                .body(ApiResponse.error("Error de validación en la solicitud", errors));
    }

    @ExceptionHandler(LoginRateLimitException.class)
    public ResponseEntity<ApiResponse<Void>> handleLoginRate(LoginRateLimitException ex) {
        return ResponseEntity.status(HttpStatus.TOO_MANY_REQUESTS)
                .header("Retry-After", Long.toString(ex.retryAfter())).body(ApiResponse.error(ex.getMessage()));
    }

    @ExceptionHandler(AuthenticationException.class)
    public ResponseEntity<ApiResponse<Void>> handleAuthenticationFailure(AuthenticationException ex) {
        return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                .body(ApiResponse.error("Credenciales inválidas. Por favor verifique su usuario y contraseña."));
    }

    @ExceptionHandler(AccessDeniedException.class)
    public ResponseEntity<ApiResponse<Void>> handleAccessDenied(AccessDeniedException ex) {
        return ResponseEntity.status(HttpStatus.FORBIDDEN)
                .body(ApiResponse.error("No tiene permisos suficientes para realizar esta acción."));
    }

    @ExceptionHandler(AttachmentNotFoundException.class)
    public ResponseEntity<ApiResponse<Void>> handleMissingAttachment(AttachmentNotFoundException ex) {
        // Ausencia esperable: no registrar una traza ERROR ni revelar rutas internas.
        log.debug("Archivo adjunto no disponible en el almacenamiento.");
        return ResponseEntity.status(HttpStatus.NOT_FOUND)
                .body(ApiResponse.error(ex.getMessage()));
    }

    @ExceptionHandler(BusinessException.class)
    public ResponseEntity<ApiResponse<Void>> handleBusinessException(BusinessException ex) {
        return ResponseEntity.status(ex.getStatus()).body(ApiResponse.error(ex.getMessage()));
    }

    // Las excepciones no clasificadas son fallos internos: se registran para diagnóstico
    // pero la respuesta no expone mensajes, rutas, consultas ni detalles del proveedor.
    @ExceptionHandler(Exception.class)
    public ResponseEntity<ApiResponse<Void>> handleUnexpectedException(Exception ex) {
        if (DISCONNECTED_CLIENT.checkAndLogClientDisconnectedException(ex)) return null;
        log.error("Error no controlado en la aplicación: ", ex);
        return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                .body(ApiResponse.error("Ha ocurrido un error interno en el servidor."));
    }
}
