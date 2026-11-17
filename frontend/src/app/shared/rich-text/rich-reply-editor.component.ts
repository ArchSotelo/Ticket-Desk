import { Component, ElementRef, EventEmitter, Input, Output, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { TicketMessageFormatService } from './ticket-message-format.service';

@Component({
  selector: 'app-rich-reply-editor', standalone: true, imports: [CommonModule, FormsModule, MatIconModule],
  templateUrl: './rich-reply-editor.component.html', styleUrls: ['./rich-reply-editor.component.scss']
})
export class RichReplyEditorComponent {
  @ViewChild('editor') editor?: ElementRef<HTMLDivElement>;
  @ViewChild('linkInput') linkInput?: ElementRef<HTMLInputElement>;
  @Input() editorId = 'ticket-reply';
  @Input() label = 'Mensaje';
  @Input() describedBy = '';
  @Input() placeholder = 'Describe el problema y explica la solución paso a paso…';
  @Input() disabled = false;
  @Output() valueChange = new EventEmitter<string>();
  private currentValue = '';
  private savedRange?: Range;
  editorHtml = '';
  empty = true;
  linkOpen = false;
  linkUrl = '';
  linkError = '';
  bold = false;
  italic = false;
  heading = false;
  @Input() set value(value: string) {
    if (value === this.currentValue) return;
    this.currentValue = value || '';
    this.editorHtml = this.formatter.render(this.currentValue);
    if (!this.currentValue) {
      this.editorHtml = '';
      this.bold = false; this.italic = false; this.heading = false;
      this.linkOpen = false; this.linkError = '';
    }
    // El navegador modifica el DOM al escribir; el binding puede seguir teniendo el valor inicial.
    if (this.editor) this.editor.nativeElement.innerHTML = this.editorHtml;
    this.empty = !this.currentValue;
    this.savedRange = undefined;
  }
  constructor(private readonly formatter: TicketMessageFormatService) {}
  rememberSelection(): void {
    const node = this.editor?.nativeElement, selection = window.getSelection();
    if (node && selection?.rangeCount && node.contains(selection.anchorNode) && node.contains(selection.focusNode)) {
      this.savedRange = selection.getRangeAt(0).cloneRange();
      this.bold = document.queryCommandState('bold'); this.italic = document.queryCommandState('italic');
      this.heading = /h[1-6]/i.test(document.queryCommandValue('formatBlock'));
    }
  }
  private restoreSelection(): void {
    const node = this.editor?.nativeElement; if (!node) return;
    node.focus(); const selection = window.getSelection();
    if (this.savedRange && node.contains(this.savedRange.commonAncestorContainer)) {
      selection?.removeAllRanges(); selection?.addRange(this.savedRange);
    }
  }
  format(command: string, value?: string): void {
    if (this.disabled) return;
    this.restoreSelection();
    document.execCommand(command, false, value);
    this.onInput(); this.rememberSelection();
  }
  title(): void { this.format('formatBlock', this.heading ? 'p' : 'h3'); }
  onInput(): void {
    if (this.disabled || !this.editor) return;
    this.currentValue = this.formatter.serialize(this.editor.nativeElement.innerHTML);
    this.empty = !this.currentValue;
    this.valueChange.emit(this.currentValue);
    this.rememberSelection();
  }
  paste(event: ClipboardEvent): void {
    event.preventDefault(); if (this.disabled) return;
    const text = event.clipboardData?.getData('text/plain') || '';
    document.execCommand('insertText', false, text); this.onInput();
  }
  openLink(): void {
    if (this.disabled) return;
    this.rememberSelection(); this.linkOpen = true; this.linkUrl = ''; this.linkError = '';
    setTimeout(() => this.linkInput?.nativeElement.focus());
  }
  applyLink(): void {
    if (this.disabled) return;
    const href = this.formatter.safeLink(this.linkUrl);
    if (!href) { this.linkError = 'Escribe un enlace válido que comience por https:// o http://.'; return; }
    this.restoreSelection();
    if (window.getSelection()?.toString()) document.execCommand('createLink', false, href);
    else {
      const link = document.createElement('a'); link.href = href; link.textContent = href;
      document.execCommand('insertHTML', false, link.outerHTML);
    }
    this.linkOpen = false; this.onInput();
  }
  cancelLink(): void { this.linkOpen = false; this.linkError = ''; this.restoreSelection(); }
}
