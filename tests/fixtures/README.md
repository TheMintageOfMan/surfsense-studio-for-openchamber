# Test fixtures

Small files saved by Microsoft Office (Word, PowerPoint and Excel) from short, made-up content, for tests of Studio's readers for the old 97-2003 formats and Excel dates. Studio's own builders cannot write these formats.

- `small.doc`: a few lines with accents, symbols, curly quotes and a 2x2 table.
- `small.ppt`: two slides, the second with speaker notes.
- `trips.xls` and `trips.xlsx`: the same workbook in both formats, with dates, a time, a date-time, formulas and a second sheet.

The script that made `small.doc` and `small.ppt` was `temp/legacy/make-fixtures.ps1` (not committed). The workbook was built with Excel automation in the same way.
