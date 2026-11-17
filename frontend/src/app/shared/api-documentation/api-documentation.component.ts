import { CommonModule, Location } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Component, ElementRef, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { firstValueFrom } from 'rxjs';
import { AuthService } from '../../core/services/auth.service';

type SwaggerRequest = { url: string; headers?: Record<string, string> };
type SwaggerUiInstance = { preauthorizeApiKey?: (name: string, value: string) => void };
type SwaggerUiFactory = {
  (options: Record<string, unknown>): SwaggerUiInstance;
  presets: { apis: unknown };
};

@Component({
  selector: 'app-api-documentation',
  standalone: true,
  imports: [CommonModule, MatButtonModule, MatIconModule],
  templateUrl: './api-documentation.component.html',
  styleUrl: './api-documentation.component.scss'
})
export class ApiDocumentationComponent implements OnInit, OnDestroy {
  @ViewChild('swaggerContainer', { static: true }) private swaggerContainer!: ElementRef<HTMLDivElement>;

  loading = true;
  errorMessage = '';

  constructor(
    private readonly http: HttpClient,
    private readonly auth: AuthService,
    private readonly location: Location
  ) {}

  ngOnInit(): void {
    void this.loadDocumentation();
  }

  ngOnDestroy(): void {
    this.swaggerContainer.nativeElement.replaceChildren();
  }

  goBack(): void {
    this.location.back();
  }

  private async loadDocumentation(): Promise<void> {
    try {
      await this.loadStylesheet();
      const [spec, SwaggerUIBundle] = await Promise.all([
        firstValueFrom(this.http.get<Record<string, unknown>>('/api/v1/v3/api-docs')),
        this.loadSwaggerBundle()
      ]);

      // Mantiene las pruebas de endpoints en el mismo origen del frontend;
      // así pasan por el proxy (local o Nginx) junto con el JWT vigente.
      spec['servers'] = [{ url: '/api/v1' }];

      const ui = SwaggerUIBundle({
        spec,
        dom_id: '#api-swagger-ui',
        deepLinking: true,
        displayRequestDuration: true,
        filter: true,
        presets: [SwaggerUIBundle.presets.apis],
        layout: 'BaseLayout',
        requestInterceptor: async (request: SwaggerRequest) => {
          const target = new URL(request.url, window.location.origin);
          if (target.origin === window.location.origin && target.pathname.startsWith('/api/v1/')) {
            const token = await firstValueFrom(this.auth.getValidToken());
            request.headers = { ...(request.headers ?? {}), Authorization: `Bearer ${token}` };
          }
          return request;
        }
      });

      const token = await firstValueFrom(this.auth.getValidToken());
      ui.preauthorizeApiKey?.('bearerAuth', token);
      this.loading = false;
    } catch {
      this.errorMessage = 'No se pudo cargar la documentación. Verifica tu sesión e inténtalo nuevamente.';
      this.loading = false;
    }
  }

  private loadStylesheet(): Promise<void> {
    const href = '/api/v1/swagger-ui/swagger-ui.css';
    if (document.querySelector(`link[data-api-swagger-css="${href}"]`)) return Promise.resolve();

    return new Promise((resolve, reject) => {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = href;
      link.dataset['apiSwaggerCss'] = href;
      link.onload = () => resolve();
      link.onerror = () => reject(new Error('No se pudo cargar el estilo de Swagger.'));
      document.head.appendChild(link);
    });
  }

  private loadSwaggerBundle(): Promise<SwaggerUiFactory> {
    const swaggerWindow = window as Window & { SwaggerUIBundle?: SwaggerUiFactory };
    if (swaggerWindow.SwaggerUIBundle) return Promise.resolve(swaggerWindow.SwaggerUIBundle);

    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = '/api/v1/swagger-ui/swagger-ui-bundle.js';
      script.dataset['apiSwaggerBundle'] = 'true';
      script.onload = () => swaggerWindow.SwaggerUIBundle
        ? resolve(swaggerWindow.SwaggerUIBundle)
        : reject(new Error('El paquete de Swagger no está disponible.'));
      script.onerror = () => reject(new Error('No se pudo cargar Swagger UI.'));
      document.body.appendChild(script);
    });
  }
}
