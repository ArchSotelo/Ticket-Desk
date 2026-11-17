export const ATTACHMENT_ACCEPT = '.png,.jpg,.jpeg,.gif,.webp,.pdf,.docx,.xlsx,.pptx,.txt,.log,.csv';
const raster: Record<string,string> = {png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',gif:'image/gif',webp:'image/webp'};
export function attachmentFileError(file: Pick<File,'name'|'size'>): string | null {
  const ext=file.name.split('.').pop()?.toLowerCase() || '';
  if (!ATTACHMENT_ACCEPT.split(',').includes('.'+ext) || /[\x00-\x1f\x7f/\\:<>\"]/.test(file.name))
    return 'Tipo de archivo no permitido. Usa imágenes PNG/JPEG/GIF/WebP, PDF, DOCX, XLSX, PPTX o texto/CSV.';
  if (file.size === 0 || file.size > 25*1024*1024) return 'El archivo debe tener contenido y no superar 25 MB.';
  return null;
}
export function isRasterAttachment(file: {nombreOriginal:string;mimeType?:string}): boolean {
  return raster[file.nombreOriginal?.split('.').pop()?.toLowerCase() || ''] === file.mimeType?.toLowerCase() && !!file.mimeType;
}
export function isPdfAttachment(file: {nombreOriginal:string;mimeType?:string}|null): boolean {
  return !!file && /\.pdf$/i.test(file.nombreOriginal) && file.mimeType?.toLowerCase()==='application/pdf';
}
