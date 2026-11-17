import { Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatCardModule } from '@angular/material/card';
import { Subscription } from 'rxjs';
import Swal from 'sweetalert2/dist/sweetalert2.esm.all.js';
import { DashboardService } from '../core/services/dashboard.service';
import { DashboardStats } from '../core/models/ticket.model';

interface ReportBar { name: string; value: number; }
interface ReportChart { title: string; bars: ReportBar[]; color: string; }

@Component({
  selector: 'app-reports',
  standalone: true,
  imports: [CommonModule, FormsModule, MatButtonModule, MatIconModule, MatCardModule],
  templateUrl: './reports.component.html',
  styleUrls: ['./reports.component.scss']
})
export class ReportsComponent implements OnInit, OnDestroy {
  downloading: 'excel' | 'csv' | null = null;
  loadingMetrics = false;
  metricsError = '';
  stats: DashboardStats | null = null;
  dateFrom = '';
  dateTo = '';
  appliedFrom = '';
  appliedTo = '';
  periodError = '';
  private metricsRequest?: Subscription;

  constructor(private http: HttpClient, private dashboardService: DashboardService) {}

  ngOnInit(): void { this.loadMetrics(); }
  ngOnDestroy(): void { this.metricsRequest?.unsubscribe(); }

  get periodLabel(): string {
    if (!this.appliedFrom && !this.appliedTo) return 'Todo el historial';
    return `${this.appliedFrom || 'Inicio'} — ${this.appliedTo || 'Hoy'}`;
  }

  get summary() {
    const value = this.stats;
    return [
      { label: 'Total de tickets', value: value?.totalTickets ?? 0 },
      { label: 'Abiertos', value: value?.ticketsAbiertos ?? 0 },
      { label: 'En proceso', value: value?.ticketsEnProceso ?? 0 },
      { label: 'Resueltos', value: value?.ticketsResueltos ?? 0 },
      { label: 'SLA incumplidos', value: value?.ticketsSlaIncumplidos ?? 0 },
      { label: 'Cumplimiento de SLA', value: `${Number(value?.porcentajeCumplimientoSla ?? 0).toFixed(1)}%` }
    ];
  }

  get charts(): ReportChart[] {
    const value = this.stats;
    if (!value) return [];
    return [
      { title: 'Tickets por estado', bars: this.entries(value.ticketsPorEstado), color: '#2563eb' },
      { title: 'Tickets por prioridad', bars: this.entries(value.ticketsPorPrioridad), color: '#e99a16' },
      { title: 'Tickets por categoría', bars: this.entries(value.ticketsPorCategoria, 10), color: '#7c5ce7' },
      { title: 'Tickets por técnico', bars: this.entries(value.ticketsPorTecnico, 10), color: '#13a783' },
      { title: 'Resultados de SLA', bars: [
        { name: 'Cumplidos', value: value.ticketsSlaCumplidos ?? 0 },
        { name: 'Incumplidos', value: value.ticketsSlaIncumplidos ?? 0 },
        { name: 'Pendientes', value: value.ticketsSlaPendientes ?? 0 }
      ], color: '#d84c62' }
    ].filter(chart => chart.bars.length > 0);
  }

  applyPeriod(): void {
    this.periodError = this.dateFrom && this.dateTo && this.dateFrom > this.dateTo
      ? 'La fecha inicial no puede ser posterior a la fecha final.' : '';
    if (this.periodError) return;
    this.appliedFrom = this.dateFrom;
    this.appliedTo = this.dateTo;
    this.loadMetrics();
  }

  clearPeriod(): void {
    this.dateFrom = this.dateTo = this.appliedFrom = this.appliedTo = '';
    this.periodError = '';
    this.loadMetrics();
  }

  loadMetrics(): void {
    this.metricsRequest?.unsubscribe();
    this.loadingMetrics = true;
    this.metricsError = '';
    this.metricsRequest = this.dashboardService.obtenerMetricas({
      fechaDesde: this.appliedFrom || undefined,
      fechaHasta: this.appliedTo || undefined
    }).subscribe({
      next: response => {
        this.loadingMetrics = false;
        if (!response.success || !response.data) {
          this.metricsError = 'No se pudieron cargar las métricas.';
          return;
        }
        this.stats = response.data;
      },
      error: () => {
        this.loadingMetrics = false;
        this.metricsError = 'No se pudieron cargar las métricas. Verifica tu sesión e intenta de nuevo.';
      }
    });
  }

  downloadKpisPng(): void {
    if (!this.stats || !this.charts.length) return;
    const canvas = document.createElement('canvas');
    const width = 1400;
    const chartHeight = 260;
    const headerHeight = 190;
    canvas.width = width;
    canvas.height = headerHeight + this.charts.length * chartHeight + 48;
    const context = canvas.getContext('2d');
    if (!context) return;
    context.fillStyle = '#f4f7fc';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = '#17243a';
    context.font = '700 34px Arial';
    context.fillText('Indicadores de soporte', 56, 62);
    context.fillStyle = '#60728c';
    context.font = '18px Arial';
    context.fillText(`Periodo: ${this.periodLabel} · Generado: ${new Date().toLocaleDateString('es-PE')}`, 56, 98);
    const cardWidth = (width - 112 - 5 * 14) / 6;
    this.summary.forEach((item, index) => {
      const x = 56 + index * (cardWidth + 14);
      context.fillStyle = '#ffffff';
      context.fillRect(x, 122, cardWidth, 58);
      context.fillStyle = '#60728c';
      context.font = '13px Arial';
      context.fillText(item.label, x + 12, 145, cardWidth - 24);
      context.fillStyle = '#17243a';
      context.font = '700 20px Arial';
      context.fillText(String(item.value), x + 12, 169, cardWidth - 24);
    });
    this.charts.forEach((chart, index) => this.drawChart(context, chart, 56, headerHeight + index * chartHeight, width - 112, chartHeight - 18));
    canvas.toBlob(blob => {
      if (blob) this.downloadBlob(blob, `kpis_tickets_${this.fileDate()}.png`);
    }, 'image/png');
  }

  exportPdf(): void {
    if (!this.stats || !this.charts.length) return;
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      Swal.fire({ icon: 'info', title: 'Permite las ventanas emergentes', text: 'El navegador bloqueó la vista de impresión necesaria para guardar el informe como PDF.' });
      return;
    }
    const summary = this.summary.map(item => `<article class="kpi"><span>${this.escapeHtml(item.label)}</span><strong>${this.escapeHtml(String(item.value))}</strong></article>`).join('');
    const charts = this.charts.map(chart => `<section class="chart"><h2>${this.escapeHtml(chart.title)}</h2>${this.chartMarkup(chart)}</section>`).join('');
    printWindow.document.open();
    printWindow.document.write(`<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Indicadores de soporte</title><style>
      *{box-sizing:border-box}body{font:14px Arial,sans-serif;color:#17243a;margin:32px}h1{font-size:26px;margin:0 0 6px}.meta{color:#60728c;margin:0 0 22px}.summary{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:20px}.kpi,.chart{border:1px solid #dce5f2;border-radius:8px;padding:14px;background:#fff;break-inside:avoid}.kpi span{display:block;color:#60728c;font-size:12px}.kpi strong{display:block;font-size:22px;margin-top:8px}.chart{margin:12px 0}.chart h2{font-size:16px;margin:0 0 14px}.bar{display:grid;grid-template-columns:190px 1fr 48px;gap:12px;align-items:center;margin:9px 0}.name{overflow-wrap:anywhere}.track{height:14px;border-radius:4px;background:#edf1f7;overflow:hidden}.fill{height:100%;border-radius:4px}.value{text-align:right;font-weight:bold}@page{size:A4;margin:14mm}@media print{body{margin:0}}
      </style></head><body><h1>Indicadores de soporte</h1><p class="meta">Periodo: ${this.escapeHtml(this.periodLabel)} · Generado: ${this.escapeHtml(new Date().toLocaleString('es-PE'))}</p><div class="summary">${summary}</div>${charts}</body></html>`);
    printWindow.document.close();
    setTimeout(() => { if (!printWindow.closed) { printWindow.focus(); printWindow.print(); } }, 300);
  }

  downloadReport(format: 'excel' | 'csv'): void {
    this.downloading = format;
    const extension = format === 'excel' ? 'xlsx' : 'csv';
    const url = `/api/v1/reports/tickets/${format}`;
    this.http.get(url, { responseType: 'blob' }).subscribe({
      next: blob => { this.downloadBlob(blob, `tickets_reporte_${this.fileDate()}.${extension}`); this.downloading = null; },
      error: () => {
        this.downloading = null;
        Swal.fire({ icon: 'error', title: 'No se pudo generar el reporte', text: 'Verifica tu sesión y vuelve a intentarlo.', confirmButtonColor: '#155eef' });
      }
    });
  }

  barWidth(value: number, chart: ReportChart): number {
    return Math.max(value > 0 ? 3 : 0, value * 100 / Math.max(1, ...chart.bars.map(bar => bar.value)));
  }

  private entries(source: Record<string, number> | undefined, limit = 0): ReportBar[] {
    const items = Object.entries(source || {}).map(([name, value]) => ({ name, value: Number(value) || 0 }))
      .sort((a, b) => b.value - a.value || a.name.localeCompare(b.name));
    return limit ? items.slice(0, limit) : items;
  }

  private drawChart(context: CanvasRenderingContext2D, chart: ReportChart, x: number, y: number, width: number, height: number): void {
    context.fillStyle = '#ffffff';
    context.fillRect(x, y, width, height);
    context.fillStyle = '#17243a';
    context.font = '700 20px Arial';
    context.fillText(chart.title, x + 22, y + 34);
    const bars = chart.bars.slice(0, 8);
    const max = Math.max(1, ...bars.map(bar => bar.value));
    const labelWidth = 250;
    const countWidth = 60;
    const top = y + 58;
    const rowHeight = Math.min(22, (height - 68) / Math.max(1, bars.length));
    bars.forEach((bar, index) => {
      const rowY = top + index * rowHeight;
      context.fillStyle = '#60728c';
      context.font = '14px Arial';
      context.fillText(bar.name, x + 22, rowY + 14, labelWidth - 28);
      const barX = x + labelWidth;
      const barWidth = width - labelWidth - countWidth - 60;
      context.fillStyle = '#edf1f7';
      context.fillRect(barX, rowY + 3, barWidth, 13);
      context.fillStyle = chart.color;
      context.fillRect(barX, rowY + 3, Math.max(bar.value > 0 ? 3 : 0, barWidth * bar.value / max), 13);
      context.fillStyle = '#17243a';
      context.font = '700 14px Arial';
      context.textAlign = 'right';
      context.fillText(String(bar.value), x + width - 20, rowY + 14);
      context.textAlign = 'left';
    });
  }

  private chartMarkup(chart: ReportChart): string {
    const max = Math.max(1, ...chart.bars.map(bar => bar.value));
    return chart.bars.slice(0, 12).map(bar => `<div class="bar"><span class="name">${this.escapeHtml(bar.name)}</span><span class="track"><i class="fill" style="display:block;width:${Math.max(bar.value > 0 ? 3 : 0, bar.value * 100 / max)}%;background:${chart.color}"></i></span><strong class="value">${bar.value}</strong></div>`).join('');
  }

  private downloadBlob(blob: Blob, filename: string): void {
    const objectUrl = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = objectUrl;
    link.download = filename;
    link.click();
    setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
  }

  private escapeHtml(value: string): string {
    return value.replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]!);
  }

  private fileDate(): string { return new Date().toISOString().slice(0, 10); }
}
