import { Injectable } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class FilterStateService {
  private readonly prefix = 'ticketdesk.filters.';

  save<T extends object>(key: string, state: T): void {
    try { sessionStorage.setItem(`${this.prefix}${key}`, JSON.stringify(state)); } catch { /* almacenamiento no disponible */ }
  }

  load<T extends object>(key: string, defaults: T): T {
    try {
      const stored = sessionStorage.getItem(`${this.prefix}${key}`);
      return stored ? { ...defaults, ...JSON.parse(stored) } : defaults;
    } catch { return defaults; }
  }

  clear(key: string): void {
    try { sessionStorage.removeItem(`${this.prefix}${key}`); } catch { /* almacenamiento no disponible */ }
  }
}
