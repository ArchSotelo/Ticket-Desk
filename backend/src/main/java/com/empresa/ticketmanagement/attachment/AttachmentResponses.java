package com.empresa.ticketmanagement.attachment;

import org.springframework.core.io.Resource;
import org.springframework.http.*;
import java.io.IOException;
import java.nio.charset.StandardCharsets;

/** Respuestas comunes para adjuntos de tickets y servicios, incluidos los históricos. */
public final class AttachmentResponses {
    private AttachmentResponses() {}
    public static ResponseEntity<Resource> download(String name, Resource resource) {
        return response(name, "application/octet-stream", resource, false);
    }
    public static ResponseEntity<Resource> preview(String name, String mime, Resource resource) {
        if (!AttachmentTypePolicy.canPreview(name, mime)) return rejected();
        try {
            String verified=AttachmentTypePolicy.validate(name,resource.getInputStream());
            return response(name,verified,resource,true);
        } catch (IOException | IllegalArgumentException ex) { return rejected(); }
    }
    private static ResponseEntity<Resource> rejected() {
        return ResponseEntity.status(415).header("X-Content-Type-Options","nosniff").header(HttpHeaders.CACHE_CONTROL,"no-store").build();
    }
    private static ResponseEntity<Resource> response(String name,String mime,Resource resource,boolean preview) {
        String safeName=name==null ? "adjunto" : name.replaceAll("[\\p{Cntrl}]","_");
        return ResponseEntity.ok().contentType(MediaType.parseMediaType(mime))
            .header(HttpHeaders.CONTENT_DISPOSITION,ContentDisposition.builder(preview?"inline":"attachment").filename(safeName,StandardCharsets.UTF_8).build().toString())
            .header("X-Content-Type-Options","nosniff")
            .header("Content-Security-Policy","sandbox; default-src 'none'; frame-ancestors 'self'")
            .header(HttpHeaders.CACHE_CONTROL,"no-store").body(resource);
    }
}
