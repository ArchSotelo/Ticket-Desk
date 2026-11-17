import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { TicketService } from '../../core/services/ticket.service';
import { HttpClient } from '@angular/common/http';

@Component({
  selector: 'app-ticket-create',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatButtonModule,
    MatIconModule
  ],
  templateUrl: './ticket-create.component.html',
  styleUrls: ['./ticket-create.component.scss']
})
export class TicketCreateComponent implements OnInit {
  ticketForm: FormGroup;
  categorias: any[] = [];
  subcategorias: any[] = [];
  prioridades: any[] = [];
  loading = false;
  private idempotencyKey: string | null = null;

  constructor(
    private fb: FormBuilder,
    private ticketService: TicketService,
    private http: HttpClient,
    public router: Router
  ) {
    this.ticketForm = this.fb.group({
      titulo: ['', [Validators.required, Validators.minLength(5)]],
      descripcion: ['', [Validators.required, Validators.minLength(10)]],
      empresaId: [1, Validators.required],
      categoriaId: ['', Validators.required],
      subcategoriaId: [''],
      prioridadId: ['', Validators.required]
    });
  }

  ngOnInit(): void {
    this.cargarCatalogos();
  }

  cargarCatalogos(): void {
    this.http.get<any>('/api/v1/catalogs/categories').subscribe(res => {
      if (res.success) this.categorias = res.data;
    });

    this.http.get<any>('/api/v1/catalogs/priorities').subscribe(res => {
      if (res.success) this.prioridades = res.data;
    });
  }

  onCategoriaChange(categoriaId: number): void {
    const selectedCat = this.categorias.find(c => c.id === categoriaId);
    this.subcategorias = selectedCat ? selectedCat.subcategorias || [] : [];
  }

  onSubmit(): void {
    if (this.loading) {
      return;
    }

    if (this.ticketForm.valid) {
      this.loading = true;
      this.idempotencyKey ??= this.createIdempotencyKey();
      this.ticketService.crearTicket(this.ticketForm.value, this.idempotencyKey).subscribe({
        next: (res) => {
          this.loading = false;
          if (res.success) {
            this.idempotencyKey = null;
            this.router.navigate(['/tickets/kanban']);
          }
        },
        error: () => this.loading = false
      });
    }
  }

  private createIdempotencyKey(): string {
    return typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }
}
