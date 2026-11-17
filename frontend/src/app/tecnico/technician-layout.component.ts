import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { AuthService } from '../core/services/auth.service';
import { TopbarComponent } from '../layouts/topbar/topbar.component';
import { LayoutNavigationService } from '../layouts/layout-navigation.service';
import { BrandFooterComponent } from '../shared/brand-footer/brand-footer.component';

@Component({
  selector: 'app-technician-layout',
  standalone: true,
  providers: [LayoutNavigationService],
  imports: [CommonModule, RouterOutlet, RouterLink, RouterLinkActive, MatIconModule, MatButtonModule, TopbarComponent, BrandFooterComponent],
  templateUrl: './technician-layout.component.html',
  styleUrls: ['./technician-layout.component.scss']
})
export class TechnicianLayoutComponent {
  get sidebarCollapsed(): boolean { return this.navigation.collapsed(); }

  constructor(public authService: AuthService, public navigation: LayoutNavigationService) {}

  get currentUser() {
    return this.authService.currentUserSignal();
  }

  logout(): void {
    this.authService.logout();
  }
}
