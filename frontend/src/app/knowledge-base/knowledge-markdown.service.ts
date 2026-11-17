import { Injectable, SecurityContext } from '@angular/core';
import { DomSanitizer } from '@angular/platform-browser';
import { marked } from 'marked';
import TurndownService from 'turndown';

@Injectable({ providedIn: 'root' })
export class KnowledgeMarkdownService {
  private readonly converter = new TurndownService({ headingStyle: 'atx', codeBlockStyle: 'fenced', bulletListMarker: '-' });
  constructor(private sanitizer: DomSanitizer) {
    // Mantén tablas y otros bloques de HTML existentes al editar contenido visual.
    this.converter.keep(['table', 'del', 'ins', 'details', 'summary']);
  }
  render(markdown: string): string {
    return this.sanitizer.sanitize(SecurityContext.HTML, marked.parse(markdown || '', { async: false, gfm: true, breaks: true })) || '';
  }
  toMarkdown(html: string): string {
    return this.converter.turndown(this.sanitizer.sanitize(SecurityContext.HTML, html) || '');
  }
  excerpt(markdown: string): string {
    const node = document.createElement('div');
    node.innerHTML = this.render(markdown);
    return (node.querySelector('p')?.textContent || node.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 180);
  }
}
