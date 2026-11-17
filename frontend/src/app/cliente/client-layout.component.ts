import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import {
  RouterLink,
  RouterLinkActive,
  RouterOutlet
} from '@angular/router';

import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';

import { AuthService } from '../core/services/auth.service';
import { TopbarComponent } from '../layouts/topbar/topbar.component';
import { LayoutNavigationService } from '../layouts/layout-navigation.service';
import { BrandFooterComponent } from '../shared/brand-footer/brand-footer.component';

@Component({
  selector: 'app-client-layout',
  standalone: true,
  providers: [LayoutNavigationService],
  imports: [
    CommonModule,
    RouterOutlet,
    RouterLink,
    RouterLinkActive,
    MatIconModule,
    MatButtonModule,
    TopbarComponent,
    BrandFooterComponent
  ],
  templateUrl: './client-layout.component.html',
  styleUrls: ['./client-layout.component.scss']
})
export class ClientLayoutComponent {
  // ============================================================
  // Estado
  // ============================================================

  get sidebarCollapsed(): boolean { return this.navigation.collapsed(); }

  // ============================================================
  // Constructor
  // ============================================================

  constructor(
    public authService: AuthService,
    public navigation: LayoutNavigationService
  ) {}

  // ============================================================
  // Usuario actual
  // ============================================================

  get currentUser() {
    return this.authService.currentUserSignal();
  }

  // ============================================================
  // Sesión
  // ============================================================

  logout(): void {
    this.authService.logout();
  }
}
