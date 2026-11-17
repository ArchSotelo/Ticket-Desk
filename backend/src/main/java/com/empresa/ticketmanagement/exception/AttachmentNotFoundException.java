package com.empresa.ticketmanagement.exception;

/** El registro puede existir aunque el contenido ya no esté en el almacenamiento. */
public class AttachmentNotFoundException extends RuntimeException {
    public AttachmentNotFoundException() {
        super("El archivo no está disponible en el almacenamiento. Puede haber sido eliminado o movido.");
    }
}
