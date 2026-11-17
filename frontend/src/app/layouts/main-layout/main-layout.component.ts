import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink, RouterOutlet } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { AuthService } from '../../core/services/auth.service';
import { TopbarComponent } from '../topbar/topbar.component';
import { SidebarComponent } from '../sidebar/sidebar.component';
import { LayoutNavigationService } from '../layout-navigation.service';
import { BrandFooterComponent } from '../../shared/brand-footer/brand-footer.component';

@Component({
  selector: 'app-main-layout',
  standalone: true,
  providers: [LayoutNavigationService],
  imports: [CommonModule, RouterOutlet, MatButtonModule, MatIconModule, TopbarComponent, SidebarComponent, BrandFooterComponent],
  templateUrl: './main-layout.component.html',
  styleUrls: ['./main-layout.component.scss']
})
export class MainLayoutComponent {
  get sidebarCollapsed(): boolean { return this.navigation.collapsed(); }

  constructor(private authService: AuthService, public navigation: LayoutNavigationService) {}

  get currentUser() {
    return this.authService.currentUserSignal();
  }
}
