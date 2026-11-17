import { AfterViewInit, Directive, ElementRef, OnDestroy } from '@angular/core';

/** Abre el visor en la capa superior del navegador y conserva el scroll del portal. */
@Directive({ selector: 'dialog[appAttachmentModal]', standalone: true })
export class AttachmentModalDirective implements AfterViewInit, OnDestroy {
  private restoreScroll: Array<() => void> = [];
  private previousFocus: HTMLElement | null = null;
  constructor(private readonly element: ElementRef<HTMLDialogElement>) {}

  ngAfterViewInit(): void {
    const dialog = this.element.nativeElement;
    this.previousFocus = document.activeElement as HTMLElement | null;
    // Los portales tienen contenedores desplazables propios, además del documento.
    for (let node = dialog.parentElement; node; node = node.parentElement) {
      const css = getComputedStyle(node);
      if (node !== document.body && node !== document.documentElement &&
          !/(auto|scroll)/.test(css.overflowY + css.overflowX)) continue;
      const target = node, top = target.scrollTop, left = target.scrollLeft;
      const properties = ['overflow-x', 'overflow-y', 'scrollbar-gutter'];
      const previous = properties.map(name => [name, target.style.getPropertyValue(name), target.style.getPropertyPriority(name)]);
      this.restoreScroll.push(() => {
        previous.forEach(([name, value, priority]) => value ? target.style.setProperty(name, value, priority) : target.style.removeProperty(name));
        target.scrollTop = top; target.scrollLeft = left;
      });
      const borderWidth = parseFloat(css.borderLeftWidth) + parseFloat(css.borderRightWidth);
      const hasScrollbar = target === document.documentElement
        ? window.innerWidth > target.clientWidth
        : target.offsetWidth - target.clientWidth > borderWidth;
      if (hasScrollbar) target.style.setProperty('scrollbar-gutter', 'stable');
      target.style.setProperty('overflow-x', 'hidden', 'important');
      target.style.setProperty('overflow-y', 'hidden', 'important');
    }
    dialog.showModal();
  }

  ngOnDestroy(): void {
    this.element.nativeElement.close();
    this.restoreScroll.reverse().forEach(restore => restore());
    this.restoreScroll = [];
    if (this.previousFocus?.isConnected) this.previousFocus.focus({ preventScroll: true });
  }
}
