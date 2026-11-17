package com.empresa.ticketmanagement.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;

@Data
@Builder
@AllArgsConstructor
@NoArgsConstructor
public class AuthResponse {
    private String accessToken;
    private String refreshToken;
    private String tokenType = "Bearer";
    private Long expiresInMs;
    private Long userId;
    private String username;
    private String email;
    private String fullName;
    private List<String> roles;
    private List<String> permissions;
    private boolean requiresPasswordChange;
}
