import { Component, ElementRef, HostListener, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient, HttpParams } from '@angular/common/http';
import { MatIconModule } from '@angular/material/icon';
import { Subject, Subscription, takeUntil } from 'rxjs';
import Swal from 'sweetalert2/dist/sweetalert2.esm.all.js';
import { ActivatedRoute } from '@angular/router';
import { AuthService } from '../core/services/auth.service';
import { KnowledgeMarkdownService } from './knowledge-markdown.service';

interface Category { id: number; nombre: string; }
interface Article {
  id: number; titulo: string; contenidoMarkdown: string; categoriaId: number;
  categoriaNombre: string; autorNombre: string; vistas: number; esPublico: boolean;
  fechaCreacion?: string; fechaModificacion?: string;
}
interface ArticleView extends Article { excerpt: string; }
interface ArticlePayload { titulo: string; contenidoMarkdown: string; categoriaId: number | null; esPublico: boolean; }

@Component({
  selector: 'app-knowledge-base', standalone: true,
  imports: [CommonModule, FormsModule, MatIconModule],
  templateUrl: './knowledge-base.component.html', styleUrls: ['./knowledge-base.component.scss']
})
export class KnowledgeBaseComponent implements OnInit, OnDestroy {
  @ViewChild('articleDialog') articleDialog?: ElementRef<HTMLDialogElement>;
  @ViewChild('visualEditor') visualEditor?: ElementRef<HTMLDivElement>;
  articulos: ArticleView[] = [];
  private catalogoArticulos: ArticleView[] = [];
  private catalogLoaded = false;
  busqueda = '';
  categoryFilter: number | null = null;
  articuloSeleccionado: Article | null = null;
  selectedHtml = '';
  loading = false;
  loadingArticle = false;
  saving = false;
  deleting = false;
  error = '';
  detailError = '';
  saveError = '';
  successMessage = '';
  categoriesError = '';
  loadingCategories = false;
  showEditor = false;
  editingId: number | null = null;
  categorias: Category[] = [];
  pageIndex = 0;
  pageSize = 6;
  pageSizeOptions = [6, 9, 12];
  totalElements = 0;
  totalPages = 0;
  editor: ArticlePayload = this.emptyEditor();
  editorHtml = '';
  previewHtml = '';
  editorMode: 'visual' | 'markdown' = 'visual';
  touched = false;
  linkOpen = false;
  linkUrl = '';
  linkError = '';
  private selectedRange: Range | null = null;
  private detailRequest?: Subscription;
  private detailFocus?: ReturnType<typeof setTimeout>;
  private readonly destroy$ = new Subject<void>();

  constructor(private http: HttpClient, private markdown: KnowledgeMarkdownService,
    private auth: AuthService, private route: ActivatedRoute) {}
  get canManage(): boolean {
    return !this.route.snapshot.data['readOnly'] && this.auth.hasAnyRole(['ROLE_ADMIN', 'ROLE_TECNICO', 'ROLE_SUPERVISOR']);
  }
  ngOnInit(): void { if (this.canManage) this.cargarCategorias(); this.cargarCatalogo(); }
  ngOnDestroy(): void {
    this.detailRequest?.unsubscribe(); clearTimeout(this.detailFocus);
    this.destroy$.next(); this.destroy$.complete(); this.articleDialog?.nativeElement.close();
  }
  private emptyEditor(): ArticlePayload { return { titulo: '', contenidoMarkdown: '', categoriaId: null, esPublico: true }; }

  cargarCategorias(): void {
    if (!this.canManage) return;
    this.loadingCategories = true; this.categoriesError = '';
    this.http.get<any>('/api/v1/catalogs/categories').pipe(takeUntil(this.destroy$)).subscribe({
      next: res => {
        this.loadingCategories = false;
        if (!res.success) { this.categoriesError = 'No se pudieron cargar las categorías.'; return; }
        this.categorias = res.data ?? [];
      },
      error: () => { this.loadingCategories = false; this.categoriesError = 'No se pudieron cargar las categorías.'; }
    });
  }
  cargarCatalogo(): void {
    if (this.loading) return;
    this.loading = true; this.error = '';
    const accumulated: Article[] = [];
    const fetchPage = (page: number): void => {
      const params = new HttpParams().set('page', page).set('size', 200);
      this.http.get<any>('/api/v1/knowledge-base', { params }).pipe(takeUntil(this.destroy$)).subscribe({
        next: res => {
          if (!res.success || !res.data) { this.failCatalog(); return; }
          const content: Article[] = Array.isArray(res.data) ? res.data : (res.data.content ?? []);
          accumulated.push(...content);
          if (!Array.isArray(res.data) && page + 1 < (res.data.totalPages ?? 1) && content.length) { fetchPage(page + 1); return; }
          this.catalogoArticulos = accumulated.map(article => ({ ...article, excerpt: this.markdown.excerpt(article.contenidoMarkdown) }));
          this.catalogLoaded = true; this.loading = false; this.aplicarBusqueda();
        }, error: () => this.failCatalog()
      });
    };
    fetchPage(0);
  }
  private failCatalog(): void {
    this.loading = false; this.error = 'No se pudieron cargar los artículos. Inténtalo nuevamente.';
    this.articulos = []; this.totalElements = 0; this.totalPages = 0;
  }
  buscar(): void {
    this.pageIndex = 0; this.cerrarDetalle();
    if (!this.catalogLoaded) { this.cargarCatalogo(); return; }
    this.aplicarBusqueda();
  }
  setCategory(id: number | null): void { this.categoryFilter = id; this.buscar(); }
  clearFilters(): void { this.busqueda = ''; this.categoryFilter = null; this.buscar(); }
  private aplicarBusqueda(): void {
    const words = this.normalizar(this.busqueda).split(' ').filter(Boolean);
    const matches = this.catalogoArticulos.filter(article => {
      const text = this.normalizar(`${article.titulo} ${article.contenidoMarkdown} ${article.categoriaNombre} ${article.autorNombre}`);
      return (!this.categoryFilter || article.categoriaId === this.categoryFilter) && words.every(word => text.includes(word));
    });
    this.totalElements = matches.length; this.totalPages = Math.ceil(matches.length / this.pageSize);
    this.pageIndex = Math.max(0, Math.min(this.pageIndex, this.totalPages - 1));
    this.articulos = matches.slice(this.pageIndex * this.pageSize, (this.pageIndex + 1) * this.pageSize);
  }
  get categoryChips(): Category[] {
    return Array.from(new Map(this.catalogoArticulos.map(article => [article.categoriaId, { id: article.categoriaId, nombre: article.categoriaNombre }])).values());
  }
  verArticulo(article: Article): void {
    this.detailRequest?.unsubscribe(); this.detailError = ''; this.loadingArticle = true;
    this.articuloSeleccionado = article; this.selectedHtml = '';
    this.focusDetail();
    this.detailRequest = this.http.get<any>(`/api/v1/knowledge-base/${article.id}`).subscribe({
      next: res => {
        this.loadingArticle = false;
        if (!res.success || !res.data) { this.detailError = 'No se pudo cargar el artículo completo.'; return; }
        this.articuloSeleccionado = res.data;
        this.selectedHtml = this.markdown.render(res.data.contenidoMarkdown);
        const cached = this.catalogoArticulos.find(item => item.id === article.id);
        if (cached) Object.assign(cached, res.data, { excerpt: this.markdown.excerpt(res.data.contenidoMarkdown) });
      }, error: () => { this.loadingArticle = false; this.detailError = 'No se pudo cargar el artículo completo.'; }
    });
  }
  private focusDetail(): void {
    clearTimeout(this.detailFocus);
    this.detailFocus = setTimeout(() => {
      const panel = document.getElementById('kb-article-detail'); panel?.focus({ preventScroll: true }); panel?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    });
  }
  cerrarDetalle(): void { clearTimeout(this.detailFocus); this.detailRequest?.unsubscribe(); this.articuloSeleccionado = null; this.selectedHtml = ''; this.loadingArticle = false; }
  closeDetailAndFocus(): void { const id = this.articuloSeleccionado?.id; this.cerrarDetalle(); document.getElementById(`kb-article-${id}`)?.focus(); }
  abrirNuevo(): void { this.openEditor(null); }
  abrirEdicion(article: Article): void { this.openEditor(article); }
  private openEditor(article: Article | null): void {
    if (!this.canManage) return;
    this.editingId = article?.id ?? null;
    this.editor = article ? { titulo: article.titulo, contenidoMarkdown: article.contenidoMarkdown, categoriaId: article.categoriaId, esPublico: article.esPublico } : this.emptyEditor();
    this.editorMode = 'visual'; this.saveError = ''; this.touched = false; this.selectedRange = null; this.linkOpen = false; this.linkError = '';
    this.previewHtml = this.markdown.render(this.editor.contenidoMarkdown); this.editorHtml = this.previewHtml;
    // Una nueva sesión de edición vuelve a poblar el nodo aunque el HTML inicial coincida.
    if (this.visualEditor) this.visualEditor.nativeElement.innerHTML = this.editorHtml;
    this.showEditor = true; this.articleDialog?.nativeElement.showModal();
  }
  cerrarEditor(): void {
    if (this.saving) return;
    this.articleDialog?.nativeElement.close(); this.showEditor = false; this.editingId = null; this.linkOpen = false; this.selectedRange = null;
  }
  onDialogCancel(event: Event): void { event.preventDefault(); this.cerrarEditor(); }
  get editorCategoryName(): string { return this.categorias.find(category => category.id === Number(this.editor.categoriaId))?.nombre || 'Selecciona una categoría'; }
  get validEditor(): boolean { return !!(this.editor.titulo.trim() && this.editor.titulo.length <= 200 && this.editor.contenidoMarkdown.trim() && this.editor.categoriaId); }
  onMarkdownInput(): void { this.previewHtml = this.markdown.render(this.editor.contenidoMarkdown); }
  onVisualInput(): void {
    if (!this.visualEditor) return;
    this.editor.contenidoMarkdown = this.markdown.toMarkdown(this.visualEditor.nativeElement.innerHTML);
    this.onMarkdownInput();
  }
  setEditorMode(mode: 'visual' | 'markdown'): void {
    if (this.editorMode === mode) return;
    if (mode === 'visual') {
      this.editorHtml = this.markdown.render(this.editor.contenidoMarkdown);
      if (this.visualEditor) this.visualEditor.nativeElement.innerHTML = this.editorHtml;
    }
    this.editorMode = mode; this.linkOpen = false; this.selectedRange = null;
  }
  @HostListener('document:selectionchange') rememberSelection(): void {
    if (!this.showEditor || !this.visualEditor || this.editorMode !== 'visual') return;
    const selection = window.getSelection();
    if (selection?.rangeCount && this.visualEditor.nativeElement.contains(selection.anchorNode) && this.visualEditor.nativeElement.contains(selection.focusNode)) this.selectedRange = selection.getRangeAt(0).cloneRange();
  }
  format(command: string, value?: string): void {
    if (this.saving || this.editorMode !== 'visual' || !this.visualEditor) return;
    const node = this.visualEditor.nativeElement;
    node.focus();
    const selection = window.getSelection();
    if (this.selectedRange && node.contains(this.selectedRange.commonAncestorContainer)) { selection?.removeAllRanges(); selection?.addRange(this.selectedRange); }
    document.execCommand(command, false, value);
    this.onVisualInput(); this.rememberSelection();
  }
  pastePlain(event: ClipboardEvent): void {
    event.preventDefault(); this.format('insertText', event.clipboardData?.getData('text/plain') || '');
  }
  addLink(): void {
    this.linkError = '';
    try {
      const url = new URL(this.linkUrl.trim(), window.location.origin);
      if (!this.linkUrl.trim() || !['http:', 'https:', 'mailto:'].includes(url.protocol)) throw new Error();
      this.format('createLink', url.href); this.linkOpen = false; this.linkUrl = '';
    } catch { this.linkError = 'Ingresa un enlace http, https o mailto válido.'; }
  }
  guardarArticulo(): void {
    if (!this.canManage || this.saving) return;
    this.touched = true; this.saveError = '';
    if (!this.validEditor) return;
    this.saving = true;
    const payload = { ...this.editor, titulo: this.editor.titulo.trim(), categoriaId: Number(this.editor.categoriaId) };
    const request = this.editingId ? this.http.put<any>(`/api/v1/knowledge-base/${this.editingId}`, payload) : this.http.post<any>('/api/v1/knowledge-base', payload);
    request.pipe(takeUntil(this.destroy$)).subscribe({
      next: res => {
        this.saving = false;
        if (!res.success || !res.data) { this.saveError = res.message || 'No se pudo guardar el artículo.'; return; }
        this.successMessage = this.editingId ? 'Artículo actualizado correctamente.' : 'Artículo creado correctamente.';
        const article: Article = res.data;
        this.cerrarEditor();
        this.articuloSeleccionado = article; this.selectedHtml = this.markdown.render(article.contenidoMarkdown);
        this.catalogLoaded = false; this.cargarCatalogo();
      }, error: err => { this.saving = false; this.saveError = err.error?.message || 'No se pudo guardar el artículo. Inténtalo nuevamente.'; }
    });
  }
  async eliminar(article: Article): Promise<void> {
    if (!this.canManage || this.deleting) return;
    const confirmation = await Swal.fire({ icon: 'warning', title: '¿Eliminar artículo?', text: `Se eliminará “${article.titulo}”.`, showCancelButton: true, confirmButtonText: 'Sí, eliminar', cancelButtonText: 'Cancelar', confirmButtonColor: '#b42336' });
    if (!confirmation.isConfirmed || this.deleting) return;
    this.deleting = true;
    this.http.delete<any>(`/api/v1/knowledge-base/${article.id}`).pipe(takeUntil(this.destroy$)).subscribe({
      next: res => {
        this.deleting = false;
        if (!res.success) { this.detailError = res.message || 'No se pudo eliminar el artículo.'; return; }
        this.cerrarDetalle(); this.successMessage = 'Artículo eliminado correctamente.'; this.catalogLoaded = false; this.cargarCatalogo();
      }, error: err => { this.deleting = false; this.detailError = err.error?.message || 'No se pudo eliminar el artículo.'; }
    });
  }
  irAPagina(page: number): void { if (page < 0 || page >= this.totalPages || this.loading) return; this.pageIndex = page; this.cerrarDetalle(); this.aplicarBusqueda(); }
  cambiarTamanoPagina(size: number): void { this.pageSize = Number(size); this.pageIndex = 0; this.cerrarDetalle(); this.aplicarBusqueda(); }
  visiblePages(): number[] { const start = Math.max(0, Math.min(this.totalPages - 5, this.pageIndex - 2)); return Array.from({ length: Math.max(0, Math.min(5, this.totalPages - start)) }, (_, i) => start + i); }
  get firstItemIndex(): number { return this.totalElements ? this.pageIndex * this.pageSize + 1 : 0; }
  get lastItemIndex(): number { return Math.min((this.pageIndex + 1) * this.pageSize, this.totalElements); }
  trackCategory(_: number, category: Category): number { return category.id; }
  trackArticle(_: number, article: Article): number { return article.id; }
  categoryIcon(name: string): string {
    const normalized = this.normalizar(name);
    return /red|conectividad|internet/.test(normalized) ? 'hub' : /capacit|guia/.test(normalized) ? 'school' : /sistema|software/.test(normalized) ? 'desktop_windows' : 'menu_book';
  }
  date(value?: string): string {
    if (!value) return 'Fecha no disponible';
    const legacy = value.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
    const date = legacy ? new Date(Number(legacy[3]), Number(legacy[2]) - 1, Number(legacy[1])) : new Date(value);
    return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: 'numeric' });
  }
  private normalizar(value: unknown): string { return String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').toLocaleLowerCase().trim(); }
}
