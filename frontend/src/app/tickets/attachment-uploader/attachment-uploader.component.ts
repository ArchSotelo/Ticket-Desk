import { Component, HostListener, Input, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpEventType } from '@angular/common/http';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { showAttachmentAlert } from '../../core/services/attachment-alert';
import { attachmentFileError } from '../../core/services/attachment-policy';
import { AttachmentService } from '../../core/services/attachment.service';
import { TicketAttachment } from '../../core/models/ticket.model';

@Component({
  selector: 'app-attachment-uploader',
  standalone: true,
  imports: [CommonModule, MatIconModule, MatButtonModule, MatProgressBarModule],
  templateUrl: './attachment-uploader.component.html',
  styleUrls: ['./attachment-uploader.component.scss']
})
export class AttachmentUploaderComponent implements OnInit {
  @Input() ticketId!: number;
  attachments: TicketAttachment[] = [];
  isDragging = false;
  uploadProgress = 0;

  constructor(private attachmentService: AttachmentService) {}

  ngOnInit(): void {
    if (this.ticketId) {
      this.cargarAdjuntos();
    }
  }

  cargarAdjuntos(): void {
    this.attachmentService.obtenerAdjuntosTicket(this.ticketId).subscribe({
      next: (res) => {
        if (res.success && res.data) {
          this.attachments = res.data;
        }
      }
    });
  }

  onDragOver(event: DragEvent): void {
    event.preventDefault();
    this.isDragging = true;
  }

  onDragLeave(event: DragEvent): void {
    event.preventDefault();
    this.isDragging = false;
  }

  onDrop(event: DragEvent): void {
    event.preventDefault();
    this.isDragging = false;
    if (event.dataTransfer?.files) {
      this.subirArchivos(Array.from(event.dataTransfer.files));
    }
  }

  @HostListener('window:paste', ['$event'])
  onPaste(event: ClipboardEvent): void {
    const items = event.clipboardData?.items;
    if (!items) {
      return;
    }

    const files: File[] = [];
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.includes('image')) {
        const blob = items[i].getAsFile();
        if (blob) {
          files.push(blob);
        }
      }
    }

    if (files.length) {
      this.subirArchivos(files);
    }
  }

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files?.length) {
      this.subirArchivos(Array.from(input.files));
      input.value = '';
    }
  }

  subirArchivos(files: File[]): void {
    const invalid = files.map(attachmentFileError).find(Boolean);
    if (invalid) { showAttachmentAlert(invalid); return; }
    files.forEach((file) => {
      this.attachmentService.subirAdjunto(this.ticketId, file).subscribe({
        next: (event: any) => {
          if (event.type === HttpEventType.UploadProgress && event.total) {
            this.uploadProgress = Math.round((100 * event.loaded) / event.total);
          } else if (event.type === HttpEventType.Response) {
            this.uploadProgress = 0;
            this.cargarAdjuntos();
          }
        },
        error: error => { this.uploadProgress = 0; showAttachmentAlert(error.error?.message || 'No se pudo adjuntar el archivo.'); }
      });
    });
  }

  eliminar(id: number): void {
    this.attachmentService.eliminarAdjunto(id).subscribe({
      next: () => this.cargarAdjuntos()
    });
  }

  formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  getFileIcon(mimeType: string): string {
    if (mimeType.includes('image')) return 'image';
    if (mimeType.includes('pdf')) return 'picture_as_pdf';
    if (mimeType.includes('word') || mimeType.includes('document')) return 'description';
    if (mimeType.includes('excel') || mimeType.includes('sheet')) return 'grid_on';
    if (mimeType.includes('zip') || mimeType.includes('compressed')) return 'folder_zip';
    return 'insert_drive_file';
  }
}
