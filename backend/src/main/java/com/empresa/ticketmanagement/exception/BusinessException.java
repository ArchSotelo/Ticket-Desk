package com.empresa.ticketmanagement.exception;

import org.springframework.http.HttpStatus;

/** Error esperado de una regla de negocio, seguro para comunicar al cliente HTTP. */
public class BusinessException extends IllegalArgumentException {

    private final HttpStatus status;

    public BusinessException(String message) {
        this(HttpStatus.BAD_REQUEST, message);
    }

    public BusinessException(HttpStatus status, String message) {
        super(message);
        this.status = status;
    }

    public HttpStatus getStatus() {
        return status;
    }
}
