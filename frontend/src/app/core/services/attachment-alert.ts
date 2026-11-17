import Swal from 'sweetalert2/dist/sweetalert2.esm.all.js';

/** Un solo aviso accesible para la selección y el arrastre de adjuntos rechazados. */
export function showAttachmentAlert(message: string, title = 'No se pudo adjuntar el archivo'): void {
  const dark = document.body.classList.contains('dark-theme');
  void Swal.fire({
    icon: 'warning',
    title,
    text: message,
    confirmButtonText: 'Entendido',
    confirmButtonColor: '#2563eb',
    background: dark ? '#19283f' : '#ffffff',
    color: dark ? '#e4ecf7' : '#162033',
    heightAuto: false,
    customClass: { container: 'attachment-alert-container' }
  });
}
