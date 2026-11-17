package com.empresa.ticketmanagement.attachment;

import lombok.extern.slf4j.Slf4j;
import com.empresa.ticketmanagement.exception.AttachmentNotFoundException;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.Resource;
import org.springframework.core.io.UrlResource;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.nio.file.StandardCopyOption;

@Service("LOCAL")
@Slf4j
public class LocalStorageProvider implements StorageProvider {

    private final Path fileStorageLocation;

    public LocalStorageProvider(@Value("${app.storage.local.upload-dir:uploads}") String uploadDir) {
        this.fileStorageLocation = Paths.get(uploadDir).toAbsolutePath().normalize();
        try {
            Files.createDirectories(this.fileStorageLocation);
        } catch (Exception ex) {
            log.error("No se pudo crear el directorio de almacenamiento local: {}", ex.getMessage());
        }
    }

    @Override
    public String storeFile(MultipartFile file, String physicalFileName) {
        try {
            Path targetLocation = this.fileStorageLocation.resolve(physicalFileName);
            Files.copy(file.getInputStream(), targetLocation, StandardCopyOption.REPLACE_EXISTING);
            return targetLocation.toString();
        } catch (Exception ex) {
            throw new RuntimeException("No se pudo guardar el archivo " + physicalFileName, ex);
        }
    }

    private Path readPath(String filePath) {
        if (filePath == null || filePath.isBlank()) throw new AttachmentNotFoundException();
        Path path = Paths.get(filePath);
        // Los nombres sin carpeta se buscan en el directorio configurado, no en el cwd.
        // Se conservan las rutas absolutas y las relativas con carpeta de registros anteriores.
        return (!path.isAbsolute() && path.getParent() == null ? fileStorageLocation.resolve(path) : path)
                .toAbsolutePath().normalize();
    }

    @Override
    public Resource loadFileAsResource(String filePath) {
        Path path = readPath(filePath);
        try {
            if (!Files.readAttributes(path, java.nio.file.attribute.BasicFileAttributes.class).isRegularFile())
                throw new AttachmentNotFoundException();
            return new UrlResource(path.toUri());
        } catch (java.nio.file.NoSuchFileException ex) {
            throw new AttachmentNotFoundException();
        } catch (java.io.IOException ex) {
            throw new IllegalStateException("No se pudo acceder al almacenamiento local.", ex);
        }
    }

    @Override
    public InputStream loadFileAsStream(String filePath) {
        try {
            return Files.newInputStream(readPath(filePath));
        } catch (java.nio.file.NoSuchFileException ex) {
            throw new AttachmentNotFoundException();
        } catch (java.io.IOException ex) {
            throw new IllegalStateException("No se pudo leer el archivo del almacenamiento local.", ex);
        }
    }

    @Override
    public void deleteFile(String filePath) {
        try {
            Files.deleteIfExists(Paths.get(filePath));
        } catch (Exception ex) {
            log.warn("No se pudo eliminar el archivo local: {}", filePath);
        }
    }

    @Override
    public String getProviderName() {
        return "LOCAL";
    }
}
