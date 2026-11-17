package com.empresa.ticketmanagement.report;

/** CSV para consulta en hojas de cálculo; el prefijo de texto no modifica la base. */
public final class CsvExport {
    private CsvExport() {}

    public static void appendRow(StringBuilder output, Object... values) {
        for (int i = 0; i < values.length; i++) {
            if (i > 0) output.append(',');
            output.append(encodeField(values[i] == null ? "" : values[i].toString()));
        }
        output.append('\n');
    }

    static String encodeField(String value) {
        // OWASP: tabulador dentro del campo entrecomillado para evitar que Excel
        // interprete el contenido como fórmula. También protege prefijos ocultos.
        String prefix = needsTextPrefix(value) ? "\t" : "";
        return "\"" + prefix + value.replace("\"", "\"\"") + "\"";
    }

    private static boolean needsTextPrefix(String value) {
        for (int offset = 0; offset < value.length();) {
            int codePoint = value.codePointAt(offset);
            if (Character.isISOControl(codePoint) || Character.getType(codePoint) == Character.FORMAT) return true;
            // Algunos importadores ignoran espacios o apóstrofos iniciales.
            if (Character.isWhitespace(codePoint) || Character.isSpaceChar(codePoint) || codePoint == '\'') {
                offset += Character.charCount(codePoint);
                continue;
            }
            return switch (codePoint) {
                case '=', '+', '-', '@', '＝', '＋', '－', '＠' -> true;
                default -> false;
            };
        }
        return false;
    }
}
