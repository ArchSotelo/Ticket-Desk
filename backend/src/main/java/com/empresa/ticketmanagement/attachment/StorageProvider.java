package com.empresa.ticketmanagement.attachment;

import org.springframework.core.io.Resource;
import org.springframework.web.multipart.MultipartFile;

import java.io.InputStream;

public interface StorageProvider {
    String storeFile(MultipartFile file, String physicalFileName);
    Resource loadFileAsResource(String filePath);
    InputStream loadFileAsStream(String filePath);
    void deleteFile(String filePath);
    String getProviderName();
}
