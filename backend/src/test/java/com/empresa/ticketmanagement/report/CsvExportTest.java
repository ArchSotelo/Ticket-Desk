package com.empresa.ticketmanagement.report;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import java.math.BigDecimal;
import java.time.LocalDate;
import static org.assertj.core.api.Assertions.assertThat;

class CsvExportTest {
    @ParameterizedTest(name = "prefijo de texto para entrada peligrosa {index}")
    @ValueSource(strings = {"=1+1", "+1+1", "-1+1", "@SUM(1,1)", "＝1+1", "＋1+1", "－1+1", "＠SUM(1,1)",
            " =1+1", "  +1+1", "\u00a0-1+1", "\t=1+1", "\r=1+1", "\n=1+1", "\r\n=1+1",
            "\000=1+1", "\ufeff=1+1", "\u200b=1+1", "'=1+1", "' =1+1", "\tTexto"})
    void formulaAndHiddenPrefixesAreExportedWithATextMarker(String value) {
        assertThat(CsvExport.encodeField(value)).startsWith("\"\t").endsWith("\"");
    }

    @ParameterizedTest
    @ValueSource(strings = {"", "Texto normal", "Atención técnica", "123.45", "2026-11-02", " texto", "'García"})
    void ordinaryTextAndNumbersArePreserved(String value) {
        assertThat(CsvExport.encodeField(value)).isEqualTo("\"" + value + "\"");
    }

    @Test void quotesCommasAndLineBreaksRemainInsideTheOriginalFields() {
        var output = new StringBuilder();
        CsvExport.appendRow(output, "Ana \"QA\", Sistemas\r\nLima", "normal\n=1+1", "x\",=1+1", null);
        assertThat(output.toString()).isEqualTo("\"Ana \"\"QA\"\", Sistemas\r\nLima\",\"normal\n=1+1\",\"x\"\",=1+1\",\"\"\n");
    }

    @Test void typedDatesAmountsAndNullValuesKeepTheCsvContract() {
        var output = new StringBuilder();
        CsvExport.appendRow(output, LocalDate.of(2026, 11, 2), new BigDecimal("80.50"), null);
        assertThat(output.toString()).isEqualTo("\"2026-11-02\",\"80.50\",\"\"\n");
    }
}
