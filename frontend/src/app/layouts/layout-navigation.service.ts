import { Injectable, computed, inject, signal } from '@angular/core';
import { BreakpointObserver } from '@angular/cdk/layout';
import { NavigationEnd, Router } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { filter } from 'rxjs';

const COMPACT_LAYOUT = '(max-width: 960px)';

// Each portal owns its navigation state; resizing never leaves a mobile drawer open.
@Injectable()
export class LayoutNavigationService {
  private readonly breakpoints = inject(BreakpointObserver);
  private readonly router = inject(Router);
  private readonly desktopCollapsed = signal(false);
  readonly isCompact = signal(this.breakpoints.isMatched(COMPACT_LAYOUT));
  readonly mobileOpen = signal(false);
  readonly collapsed = computed(() => !this.isCompact() && this.desktopCollapsed());
  readonly expanded = computed(() => this.isCompact() ? this.mobileOpen() : !this.desktopCollapsed());

  constructor() {
    this.breakpoints.observe(COMPACT_LAYOUT).pipe(takeUntilDestroyed()).subscribe(state => {
      this.isCompact.set(state.matches);
      this.closeMobile();
    });
    this.router.events.pipe(
      filter(event => event instanceof NavigationEnd),
      takeUntilDestroyed()
    ).subscribe(() => this.closeMobile());
  }

  toggle(): void {
    if (this.isCompact()) {
      this.mobileOpen.update(open => !open);
    } else {
      this.desktopCollapsed.update(collapsed => !collapsed);
    }
  }

  closeMobile(): void {
    this.mobileOpen.set(false);
  }
}
