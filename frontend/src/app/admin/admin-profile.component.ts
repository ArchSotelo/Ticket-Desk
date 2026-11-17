import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { AuthService } from '../core/services/auth.service';
import { UserService } from '../core/services/user.service';
import { ProfileBase } from '../shared/profile/profile-base';

@Component({
  selector: 'app-admin-profile',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, MatIconModule],
  templateUrl: '../shared/profile/profile.component.html',
  styleUrls: ['./admin-profile.component.scss']
})
export class AdminProfileComponent extends ProfileBase {
  override readonly portal = 'admin' as const;
  constructor(fb: FormBuilder, userService: UserService, authService: AuthService) {
    super(fb, userService, authService);
  }
}
