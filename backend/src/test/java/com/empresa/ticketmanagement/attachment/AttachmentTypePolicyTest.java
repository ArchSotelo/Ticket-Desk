package com.empresa.ticketmanagement.attachment;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockMultipartFile;
import javax.imageio.ImageIO;
import java.awt.image.BufferedImage;
import java.io.*;
import java.util.zip.*;
import static org.assertj.core.api.Assertions.*;
class AttachmentTypePolicyTest {
    @Test void rejectsActiveAndSpoofedFiles() {
        for(String name:new String[]{"a.html","a.svg","a.SVGZ","a.exe","a.js","a.docm","a.xlsm","a.zip","a.pdf.exe","../a.png","a.png:html","a\r\n.png"})
            assertThatThrownBy(()->AttachmentTypePolicy.validate(new MockMultipartFile("file",name,"image/png","<svg onload='alert(1)'/>".getBytes()))).isInstanceOf(IllegalArgumentException.class);
        for(String name:new String[]{"a.png","a.jpg","a.gif","a.webp","a.pdf","a.docx"})
            assertThatThrownBy(()->AttachmentTypePolicy.validate(new MockMultipartFile("file",name,"application/pdf","<html><script>alert(1)</script>".getBytes()))).isInstanceOf(IllegalArgumentException.class);
    }
    @Test void detectsRasterIndependentlyOfClaimedMime() throws Exception {
        ByteArrayOutputStream out=new ByteArrayOutputStream();ImageIO.write(new BufferedImage(2,2,BufferedImage.TYPE_INT_RGB),"png",out);
        assertThat(AttachmentTypePolicy.validate(new MockMultipartFile("file","ok.PNG","text/html",out.toByteArray()))).isEqualTo("image/png");
        assertThatThrownBy(()->AttachmentTypePolicy.validate(new MockMultipartFile("file","wrong.jpg","image/jpeg",out.toByteArray()))).isInstanceOf(IllegalArgumentException.class);
    }
    @Test void allowsPdfAndUtf8TextButNeverPreviewsTextOrSvg() {
        assertThat(AttachmentTypePolicy.validate(new MockMultipartFile("file","ok.pdf","application/octet-stream","%PDF-1.7\n%%EOF".getBytes()))).isEqualTo("application/pdf");
        assertThat(AttachmentTypePolicy.validate(new MockMultipartFile("file","ok.txt","text/html","<html>literal descargable</html>".getBytes()))).isEqualTo("text/plain");
        assertThat(AttachmentTypePolicy.canPreview("ok.txt","text/plain")).isFalse();
        assertThat(AttachmentTypePolicy.canPreview("ok.svg","image/svg+xml")).isFalse();
        assertThatThrownBy(()->AttachmentTypePolicy.validate(new MockMultipartFile("file","empty.pdf","application/pdf",new byte[0]))).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(()->AttachmentTypePolicy.validate(new MockMultipartFile("file","binary.txt","text/plain",new byte[]{0}))).isInstanceOf(IllegalArgumentException.class);
    }
    @Test void officeMustBeRealOoxmlWithoutMacros() throws Exception {
        assertThat(AttachmentTypePolicy.validate(new MockMultipartFile("file","ok.docx","anything",office(false)))).contains("wordprocessingml");
        assertThatThrownBy(()->AttachmentTypePolicy.validate(new MockMultipartFile("file","bad.docx","anything",office(true)))).isInstanceOf(IllegalArgumentException.class);
        var out=new ByteArrayOutputStream();try(var zip=new ZipOutputStream(out)){
            for(String n:new String[]{"[Content_Types].xml","xl/workbook.xml"}){zip.putNextEntry(new ZipEntry(n));zip.write("<xml>macroEnabled</xml>".getBytes());zip.closeEntry();}
        }
        assertThatThrownBy(()->AttachmentTypePolicy.validate(new MockMultipartFile("file","bad.xlsx","anything",out.toByteArray()))).isInstanceOf(IllegalArgumentException.class);
    }
    private byte[] office(boolean macro) throws Exception {
        var out=new ByteArrayOutputStream();try(var zip=new ZipOutputStream(out)){
            for(String n:macro ? new String[]{"[Content_Types].xml","word/document.xml","word/vbaProject.bin"}:new String[]{"[Content_Types].xml","word/document.xml"}){zip.putNextEntry(new ZipEntry(n));zip.write("<xml/>".getBytes());zip.closeEntry();}
        }return out.toByteArray();
    }
}
