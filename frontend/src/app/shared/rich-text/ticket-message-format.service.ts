import { Injectable, Pipe, PipeTransform, SecurityContext } from '@angular/core';
import { DomSanitizer } from '@angular/platform-browser';
import { marked } from 'marked';
import TurndownService from 'turndown';

// El marcador distingue los mensajes nuevos con formato de los mensajes históricos de texto plano.
const RICH_PREFIX = '<!-- servicedesk-rich:v1 -->\n';
@Injectable({ providedIn: 'root' })
export class TicketMessageFormatService {
  private readonly converter = new TurndownService({ headingStyle: 'atx', bulletListMarker: '-', codeBlockStyle: 'fenced' });
  constructor(private readonly sanitizer: DomSanitizer) {}
  safeLink(value: string): string | null {
    try {
      const url = new URL(value.trim());
      return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password ? url.href : null;
    } catch { return null; }
  }
  render(value: string): string {
    if (!value?.startsWith(RICH_PREFIX)) {
      const text = (value || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
      return `<span class="ticket-plain-text">${text}</span>`;
    }
    return this.clean(marked.parse(value.slice(RICH_PREFIX.length), { async: false, gfm: true, breaks: true }));
  }
  serialize(html: string): string {
    const safe = this.clean(html);
    const node = document.createElement('div'); node.innerHTML = safe;
    if (!node.textContent?.trim()) return '';
    const markdown = this.converter.turndown(safe).trim();
    return markdown ? RICH_PREFIX + markdown : '';
  }
  private clean(html: string): string {
    const node = document.createElement('div');
    node.innerHTML = this.sanitizer.sanitize(SecurityContext.HTML, html) || '';
    node.querySelectorAll('script,style,iframe,object,embed,img,video,audio,svg,math,form,input,button').forEach(el => el.remove());
    const allowed = new Set(['P','BR','DIV','SPAN','STRONG','B','EM','I','H1','H2','H3','H4','H5','H6','UL','OL','LI','A','BLOCKQUOTE','PRE','CODE']);
    Array.from(node.querySelectorAll('*')).reverse().forEach(el => {
      if (!allowed.has(el.tagName)) { el.replaceWith(...Array.from(el.childNodes)); return; }
      const href = el.tagName === 'A' ? this.safeLink(el.getAttribute('href') || '') : null;
      Array.from(el.attributes).forEach(attribute => el.removeAttribute(attribute.name));
      if (el.tagName === 'A') {
        if (!href) el.replaceWith(...Array.from(el.childNodes));
        else { el.setAttribute('href', href); el.setAttribute('target', '_blank'); el.setAttribute('rel', 'noopener noreferrer'); }
      }
    });
    return node.innerHTML;
  }
}

@Pipe({ name: 'ticketMessage', standalone: true, pure: true })
export class TicketMessagePipe implements PipeTransform {
  constructor(private readonly formatter: TicketMessageFormatService) {}
  transform(value: string): string { return this.formatter.render(value); }
}
