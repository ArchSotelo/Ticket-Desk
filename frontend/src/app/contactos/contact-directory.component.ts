import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { HttpClient } from '@angular/common/http';

import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';

import { Ticket } from '../core/models/ticket.model';
import { FilterStateService } from '../core/services/filter-state.service';

interface Client {
  id: number;
  username: string;
  nombres: string;
  apellidos: string;
  email: string;
  telefono?: string;
  empresaNombre?: string;
  areaNombre?: string;
  estado: string;
  roles: string[];
}

@Component({
  selector: 'app-contact-directory',
  standalone: true,
  imports: [
    CommonModule,
    RouterLink,
    FormsModule,
    MatIconModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule
  ],
  templateUrl: './contact-directory.component.html',
  styleUrls: ['./contact-directory.component.scss']
})
export class ContactDirectoryComponent implements OnInit {

  // =========================================================
  // ESTADO
  // =========================================================

  clients: Client[] = [];
  selectedClient: Client | null = null;
  tickets: Ticket[] = [];

  search = '';
  companyFilter = '';
  stateFilter = '';
  ticketSearch = '';
  ticketStateFilter = '';
  ticketError = '';
  ticketTotal = 0;
  ticketStates: { code: string; name: string }[] = [];

  loading = true;
  loadingTickets = false;

  error = '';

  portal: 'admin' | 'technician' = 'admin';

  // =========================================================
  // CONSTRUCTOR
  // =========================================================

  constructor(
    private http: HttpClient,
    private route: ActivatedRoute,
    private router: Router,
    private filterState: FilterStateService
  ) {}

  // =========================================================
  // CICLO DE VIDA
  // =========================================================

  ngOnInit(): void {
    this.portal =
      this.route.snapshot.data['portal'] === 'technician'
        ? 'technician'
        : 'admin';

    const filters = this.filterState.load(this.filterKey, { search: '', companyFilter: '', stateFilter: '' });
    this.search = filters.search;
    this.companyFilter = filters.companyFilter;
    this.stateFilter = filters.stateFilter;

    const id = Number(
      this.route.snapshot.paramMap.get('id')
    );

    if (id) {
      this.loadClient(id);
    } else {
      this.loadClients();
    }
  }

  // =========================================================
  // GETTERS
  // =========================================================

  get filterKey(): string {
    return this.portal === 'technician'
      ? 'technician-contacts'
      : 'admin-contacts';
  }

  get filteredClients(): Client[] {
    const query = this.search.trim().toLowerCase();

    return this.clients.filter(client =>
      `${client.nombres} ${client.apellidos} ${client.email} ${client.empresaNombre ?? ''}`
        .toLowerCase().includes(query) &&
      (!this.companyFilter || (client.empresaNombre || 'Sin empresa') === this.companyFilter) &&
      (!this.stateFilter || client.estado === this.stateFilter)
    );
  }

  get companies(): string[] {
    return [...new Set(this.clients.map(client => client.empresaNombre || 'Sin empresa'))].sort();
  }

  get activeClients(): number {
    return this.clients.filter(client => client.estado === 'ACTIVO').length;
  }

  get closedTickets(): number {
    return this.tickets.filter(ticket => ticket.estadoCodigo === 'CERRADO').length;
  }

  get filteredTickets(): Ticket[] {
    const query = this.ticketSearch.trim().toLowerCase();
    return this.tickets.filter(ticket =>
      `${ticket.titulo} ${ticket.codigo}`.toLowerCase().includes(query) &&
      (!this.ticketStateFilter || ticket.estadoCodigo === this.ticketStateFilter));
  }

  get contactsPath(): string {
    return this.portal === 'technician'
      ? '/tecnico/contactos'
      : '/contactos';
  }

  // =========================================================
  // CLIENTES
  // =========================================================

  loadClients(): void {
    this.loading = true;
    this.error = '';

    this.http
      .get<any>('/api/v1/contacts?size=500')
      .subscribe({
        next: (res) => {
          this.clients = (
            res.data?.content ?? []
          ).filter((user: Client) =>
            user.roles?.includes('ROLE_CLIENTE')
          );

          this.loading = false;
        },

        error: () => {
          this.error = 'No se pudieron cargar los clientes.';
          this.loading = false;
        }
      });
  }

  loadClient(id: number): void {
    this.loading = true;
    this.error = '';

    this.http
      .get<any>(`/api/v1/contacts/${id}`)
      .subscribe({
        next: (res) => {
          this.selectedClient = res.data ?? null;
          this.loading = false;

          this.loadTickets(id);
        },

        error: () => {
          this.error = 'No se pudo cargar el cliente.';
          this.loading = false;
        }
      });
  }

  // =========================================================
  // TICKETS
  // =========================================================

  loadTickets(id: number): void {
    this.loadingTickets = true;
    this.ticketError = '';

    this.http
      .get<any>(`/api/v1/tickets/cliente/${id}?size=100`)
      .subscribe({
        next: (res) => {
          this.tickets = res.data?.content ?? [];
          this.ticketTotal = res.data?.totalElements ?? this.tickets.length;
          this.ticketStates = [...new Map(this.tickets.map(ticket => [ticket.estadoCodigo,
            { code: ticket.estadoCodigo, name: ticket.estadoNombre }])).values()];
          this.loadingTickets = false;
        },

        error: () => {
          this.tickets = [];
          this.ticketError = 'No se pudo cargar el historial de tickets.';
          this.loadingTickets = false;
        }
      });
  }

  // =========================================================
  // FILTROS
  // =========================================================

  guardarBusqueda(): void {
    this.filterState.save(
      this.filterKey,
      {
        search: this.search,
        companyFilter: this.companyFilter,
        stateFilter: this.stateFilter
      }
    );
  }

  // =========================================================
  // NAVEGACIÓN
  // =========================================================

  openClient(client: Client): void {
    const path =
      this.portal === 'technician'
        ? '/tecnico/contactos'
        : '/contactos';

    this.router.navigate([
      path,
      client.id
    ]);
  }

  ticketPath(ticketId: number): string {
    const path =
      this.portal === 'technician'
        ? '/tecnico/tickets'
        : '/tickets/detail';

    return `${path}/${ticketId}`;
  }

  // =========================================================
  // UTILIDADES
  // =========================================================

  initials(client: Client): string {
    return (
      `${client.nombres?.[0] ?? ''}${client.apellidos?.[0] ?? ''}`
    ).toUpperCase() || 'CL';
  }

  statusClass(code?: string): string {
    return (code ?? '')
      .toLowerCase()
      .replace(/\s+/g, '-');
  }

  date(value?: string): string {
    if (!value) {
      return '-';
    }

    return new Date(value).toLocaleDateString(
      'es-PE',
      {
        day: '2-digit',
        month: 'short',
        year: 'numeric'
      }
    );
  }
}

