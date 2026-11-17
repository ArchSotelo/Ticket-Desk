import { Component } from '@angular/core';

@Component({
  selector: 'app-brand-footer',
  standalone: true,
  template: '<footer class="brand-footer">Desarrollado por <a href="https://github.com/ArchSotelo" target="_blank" rel="noopener noreferrer">ArchSotelo</a></footer>',
  styles: [`
    :host { display: block; flex: 0 0 auto; }
    .brand-footer {
      padding: 7px 16px 9px;
      color: var(--brand-footer-color, var(--text-muted, #64748b));
      text-align: center;
      font-size: 11px;
      line-height: 1.4;
      letter-spacing: .015em;
    }
    .brand-footer a {
      color: var(--brand-footer-accent, var(--primary-color, #155eef));
      font-weight: 650;
      text-decoration: none;
    }
    .brand-footer a:hover {
      text-decoration: underline;
    }
    .brand-footer a:focus-visible {
      outline: 2px solid currentColor;
      outline-offset: 2px;
      border-radius: 2px;
    }
  `]
})
export class BrandFooterComponent {}
