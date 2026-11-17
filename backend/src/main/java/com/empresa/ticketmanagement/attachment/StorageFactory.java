package com.empresa.ticketmanagement.attachment;

import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.ApplicationContext;
import org.springframework.stereotype.Component;

@Component
@RequiredArgsConstructor
public class StorageFactory {

    private final ApplicationContext applicationContext;

    @Value("${app.storage.provider:LOCAL}")
    private String configuredProvider;

    public StorageProvider getStorageProvider() {
        if ("MINIO".equalsIgnoreCase(configuredProvider)) {
            return applicationContext.getBean("MINIO", StorageProvider.class);
        }
        return applicationContext.getBean("LOCAL", StorageProvider.class);
    }
}
