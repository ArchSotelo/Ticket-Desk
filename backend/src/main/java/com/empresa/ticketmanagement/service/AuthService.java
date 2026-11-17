package com.empresa.ticketmanagement.service;

import com.empresa.ticketmanagement.dto.AuthRequest;
import com.empresa.ticketmanagement.dto.AuthResponse;
import com.empresa.ticketmanagement.dto.RefreshTokenRequest;
import jakarta.servlet.http.HttpServletRequest;

public interface AuthService {
    AuthResponse login(AuthRequest request, HttpServletRequest httpRequest);
    AuthResponse refreshToken(RefreshTokenRequest request);
    void logout(String refreshToken);
}
