package com.empresa.ticketmanagement.attachment;

import io.minio.*;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.AbstractResource;
import org.springframework.core.io.Resource;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import java.io.InputStream;

@Service("MINIO")
@Slf4j
public class MinioS3StorageProvider implements StorageProvider {

    @Value("${app.storage.minio.bucket-name:ticket-attachments}")
    private String bucketName;

    @Value("${app.storage.minio.endpoint:http://localhost:9000}")
    private String endpoint;

    @Value("${app.storage.minio.access-key:}")
    private String accessKey;

    @Value("${app.storage.minio.secret-key:}")
    private String secretKey;

    private MinioClient getMinioClient() {
        if (accessKey == null || accessKey.isBlank() || secretKey == null || secretKey.isBlank()) {
            throw new IllegalStateException("Configura las credenciales de MinIO mediante variables de entorno.");
        }
        return MinioClient.builder()
                .endpoint(endpoint)
                .credentials(accessKey, secretKey)
                .build();
    }

    private void ensureBucketExists(MinioClient client) {
        try {
            boolean found = client.bucketExists(BucketExistsArgs.builder().bucket(bucketName).build());
            if (!found) {
                client.makeBucket(MakeBucketArgs.builder().bucket(bucketName).build());
            }
        } catch (Exception e) {
            log.error("Error comprobando bucket MinIO: {}", e.getMessage());
        }
    }

    @Override
    public String storeFile(MultipartFile file, String physicalFileName) {
        try {
            MinioClient client = getMinioClient();
            ensureBucketExists(client);
            client.putObject(
                    PutObjectArgs.builder()
                            .bucket(bucketName)
                            .object(physicalFileName)
                            .stream(file.getInputStream(), file.getSize(), -1L)
                            .contentType(file.getContentType())
                            .build()
            );
            return physicalFileName;
        } catch (Exception e) {
            throw new RuntimeException("Error guardando archivo en MinIO", e);
        }
    }

    @Override
    public Resource loadFileAsResource(String filePath) {
        // InputStreamResource es de una sola lectura. Spring puede consultar el
        // recurso primero para calcular Content-Length y después volver a leerlo
        // para escribir la respuesta, lo que provoca "InputStream has already
        // been read". AbstractResource abre un flujo nuevo en cada lectura.
        return new AbstractResource() {
            @Override
            public String getDescription() {
                return "Archivo MinIO: " + filePath;
            }

            @Override
            public String getFilename() {
                return filePath;
            }

            @Override
            public InputStream getInputStream() {
                return loadFileAsStream(filePath);
            }
        };
    }

    @Override
    public InputStream loadFileAsStream(String filePath) {
        try {
            MinioClient client = getMinioClient();
            return client.getObject(
                    GetObjectArgs.builder()
                            .bucket(bucketName)
                            .object(filePath)
                            .build()
            );
        } catch (Exception e) {
            throw new RuntimeException("Error descargando stream de MinIO", e);
        }
    }

    @Override
    public void deleteFile(String filePath) {
        try {
            MinioClient client = getMinioClient();
            client.removeObject(
                    RemoveObjectArgs.builder()
                            .bucket(bucketName)
                            .object(filePath)
                            .build()
            );
        } catch (Exception e) {
            log.error("Error borrando objeto en MinIO: {}", e.getMessage());
        }
    }

    @Override
    public String getProviderName() {
        return "MINIO";
    }
}
