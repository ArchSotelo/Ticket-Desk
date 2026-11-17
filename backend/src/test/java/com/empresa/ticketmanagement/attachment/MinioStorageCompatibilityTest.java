package com.empresa.ticketmanagement.attachment;

import com.sun.net.httpserver.HttpServer;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.util.ReflectionTestUtils;

import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.atomic.AtomicReference;

import static org.assertj.core.api.Assertions.assertThat;

/** Prueba el SDK real contra un servidor S3 local, sin credenciales ni buckets externos. */
class MinioStorageCompatibilityTest {
    @Test
    void uploadsReadsMoreThanOnceAndDeletesUsingTheJvmHttpClient() throws Exception {
        var object = new AtomicReference<byte[]>();
        var server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/", exchange -> {
            try (exchange) {
                String method = exchange.getRequestMethod();
                if (exchange.getRequestURI().getRawQuery() != null
                        && exchange.getRequestURI().getRawQuery().contains("location")) {
                    byte[] xml = "<LocationConstraint xmlns=\"http://s3.amazonaws.com/doc/2006-03-01/\">us-east-1</LocationConstraint>"
                            .getBytes(StandardCharsets.UTF_8);
                    exchange.getResponseHeaders().set("Content-Type", "application/xml");
                    exchange.sendResponseHeaders(200, xml.length);
                    exchange.getResponseBody().write(xml);
                } else if (method.equals("HEAD")) {
                    exchange.sendResponseHeaders(200, -1);
                } else if (method.equals("PUT")) {
                    object.set(exchange.getRequestBody().readAllBytes());
                    exchange.getResponseHeaders().set("ETag", "\"test-etag\"");
                    exchange.sendResponseHeaders(200, -1);
                } else if (method.equals("GET") && object.get() != null) {
                    exchange.getResponseHeaders().set("Content-Type", "text/plain");
                    exchange.sendResponseHeaders(200, object.get().length);
                    exchange.getResponseBody().write(object.get());
                } else if (method.equals("DELETE")) {
                    object.set(null);
                    exchange.sendResponseHeaders(204, -1);
                } else {
                    exchange.sendResponseHeaders(404, -1);
                }
            }
        });
        server.start();
        try {
            var storage = new MinioS3StorageProvider();
            ReflectionTestUtils.setField(storage, "endpoint", "http://127.0.0.1:" + server.getAddress().getPort());
            ReflectionTestUtils.setField(storage, "bucketName", "test-attachments");
            ReflectionTestUtils.setField(storage, "accessKey", "test-only-access-key");
            ReflectionTestUtils.setField(storage, "secretKey", "test-only-secret-key");
            byte[] contents = "Adjunto de prueba".getBytes(StandardCharsets.UTF_8);
            assertThat(storage.storeFile(new MockMultipartFile("file", "test.txt", "text/plain", contents), "test.txt"))
                    .isEqualTo("test.txt");
            assertThat(object.get()).isEqualTo(contents);
            var resource = storage.loadFileAsResource("test.txt");
            assertThat(resource.contentLength()).isEqualTo(contents.length);
            try (var stream = resource.getInputStream()) {
                assertThat(stream.readAllBytes()).isEqualTo(contents);
            }
            storage.deleteFile("test.txt");
            assertThat(object.get()).isNull();
        } finally {
            server.stop(0);
        }
    }
}
