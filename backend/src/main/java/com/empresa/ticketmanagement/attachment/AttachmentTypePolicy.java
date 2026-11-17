package com.empresa.ticketmanagement.attachment;

import com.empresa.ticketmanagement.exception.BusinessException;

import org.springframework.web.multipart.MultipartFile;
import javax.imageio.ImageIO;
import javax.imageio.stream.ImageInputStream;
import java.io.*;
import java.nio.ByteBuffer;
import java.nio.charset.*;
import java.util.*;
import java.util.zip.*;

/** Lista positiva: ni el MIME enviado por el navegador ni la extensión bastan por sí solos. */
public final class AttachmentTypePolicy {
    public static final int MAX_BYTES = 25 * 1024 * 1024;
    private static final Map<String,String> TYPES = Map.ofEntries(
        Map.entry("png","image/png"), Map.entry("jpg","image/jpeg"), Map.entry("jpeg","image/jpeg"),
        Map.entry("gif","image/gif"), Map.entry("webp","image/webp"), Map.entry("pdf","application/pdf"),
        Map.entry("txt","text/plain"), Map.entry("log","text/plain"), Map.entry("csv","text/csv"),
        Map.entry("docx","application/vnd.openxmlformats-officedocument.wordprocessingml.document"),
        Map.entry("xlsx","application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"),
        Map.entry("pptx","application/vnd.openxmlformats-officedocument.presentationml.presentation"));
    private AttachmentTypePolicy() {}
    public static String extension(String name) {
        if (name == null || name.length() > 255 || name.indexOf('.') < 1 ||
            name.chars().anyMatch(c -> c < 32 || c == 127 || c == '/' || c == '\\' || c == ':' || c == '"' || c == '<' || c == '>'))
            throw invalid();
        return name.substring(name.lastIndexOf('.') + 1).toLowerCase(Locale.ROOT);
    }
    public static String validate(MultipartFile file) {
        if (file.isEmpty() || file.getSize() > MAX_BYTES) throw new BusinessException("El adjunto debe tener contenido y no superar 25 MB.");
        try { return validate(file.getOriginalFilename(), file.getInputStream()); }
        catch (IOException ex) { throw invalid(); }
    }
    public static String validate(String name, InputStream source) {
        try (source) {
            String ext = extension(name), mime = TYPES.get(ext);
            if (mime == null) throw invalid();
            byte[] bytes = source.readNBytes(MAX_BYTES + 1);
            if (bytes.length == 0 || bytes.length > MAX_BYTES) throw invalid();
            boolean valid = switch (ext) {
                case "png","jpg","jpeg","gif" -> validImage(bytes, mime);
                case "webp" -> bytes.length >= 20 && ascii(bytes,0,4).equals("RIFF") && ascii(bytes,8,4).equals("WEBP") &&
                    Set.of("VP8 ","VP8L","VP8X").contains(ascii(bytes,12,4));
                case "pdf" -> ascii(bytes,0,5).equals("%PDF-") && ascii(bytes,Math.max(0,bytes.length-1024),Math.min(1024,bytes.length)).contains("%%EOF");
                case "docx","xlsx","pptx" -> validOffice(bytes,ext);
                default -> validText(bytes);
            };
            if (!valid) throw invalid();
            return mime;
        } catch (IOException ex) { throw invalid(); }
    }
    public static boolean canPreview(String name, String mime) {
        try {
            String canonical = TYPES.get(extension(name));
            return canonical != null && canonical.equalsIgnoreCase(mime == null ? "" : mime) &&
                (canonical.startsWith("image/") || canonical.equals("application/pdf"));
        } catch (IllegalArgumentException ex) { return false; }
    }
    private static String ascii(byte[] b,int offset,int size) { return new String(b,offset,Math.min(size,b.length-offset),StandardCharsets.ISO_8859_1); }
    private static boolean validImage(byte[] b,String mime) throws IOException {
        boolean signature = switch(mime) {
            case "image/png" -> b.length >= 8 && Arrays.equals(Arrays.copyOf(b,8),new byte[]{(byte)137,80,78,71,13,10,26,10});
            case "image/jpeg" -> b.length >= 3 && (b[0]&255)==255 && (b[1]&255)==216 && (b[2]&255)==255;
            default -> b.length >= 6 && Set.of("GIF87a","GIF89a").contains(ascii(b,0,6));
        };
        if (!signature) return false;
        try (ImageInputStream input = ImageIO.createImageInputStream(new ByteArrayInputStream(b))) {
            var readers = ImageIO.getImageReaders(input);
            if (!readers.hasNext()) return false;
            var reader = readers.next();
            try { reader.setInput(input); long pixels=(long)reader.getWidth(0)*reader.getHeight(0);
                return pixels > 0 && pixels <= 16_000_000 && reader.read(0) != null;
            } finally { reader.dispose(); }
        }
    }
    private static boolean validOffice(byte[] b,String ext) throws IOException {
        if (b.length<4 || b[0]!='P' || b[1]!='K' || b[2]!=3 || b[3]!=4) return false;
        Set<String> entries=new HashSet<>(); long expanded=0; int count=0;
        try (ZipInputStream zip=new ZipInputStream(new ByteArrayInputStream(b))) {
            ZipEntry entry; byte[] buffer=new byte[8192];
            while ((entry=zip.getNextEntry())!=null) {
                String name=entry.getName();
                if (++count>2000 || name.startsWith("/") || name.contains("..") || name.contains("\\") || (name.toLowerCase(Locale.ROOT).contains("vbaproject") || name.toLowerCase(Locale.ROOT).contains("macrosheets") || name.toLowerCase(Locale.ROOT).contains("activex"))) return false;
                entries.add(name); int n;
                ByteArrayOutputStream types = name.equals("[Content_Types].xml") ? new ByteArrayOutputStream() : null;
                while ((n=zip.read(buffer))!=-1) {
                    expanded+=n; if(expanded>50L*1024*1024) return false;
                    if (types != null) { if(types.size()+n>1024*1024) return false; types.write(buffer,0,n); }
                }
                if (types != null) {
                    String contentTypes=types.toString(StandardCharsets.UTF_8).toLowerCase(Locale.ROOT);
                    if (contentTypes.contains("macroenabled") || contentTypes.contains("vbaproject") || contentTypes.contains("macrosheet")) return false;
                }
            }
        }
        String main=switch(ext) {case "docx"->"word/document.xml";case "xlsx"->"xl/workbook.xml";default->"ppt/presentation.xml";};
        return entries.contains("[Content_Types].xml") && entries.contains(main);
    }
    private static boolean validText(byte[] b) throws CharacterCodingException {
        String text=StandardCharsets.UTF_8.newDecoder().onMalformedInput(CodingErrorAction.REPORT).decode(ByteBuffer.wrap(b)).toString();
        // Texto descargable; nunca se sirve como HTML ni se incrusta en un iframe.
        return text.codePoints().noneMatch(c -> c==0 || (c<32 && c!=9 && c!=10 && c!=13));
    }
    private static BusinessException invalid() { return new BusinessException("Tipo o contenido de adjunto no permitido. Usa PNG, JPEG, GIF, WebP, PDF, DOCX, XLSX, PPTX o texto/CSV UTF-8."); }
}
