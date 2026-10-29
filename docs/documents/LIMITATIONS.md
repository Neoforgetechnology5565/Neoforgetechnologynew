# Limitations

* **OCR errors**: letters/digits are confused (0/O, 1/l, 5/S), spaces are sometimes dropped (“InvoiceNo”), small or faint text can be missed or noisy text added. The confidence is the engine's score for the line, not a probability.
* **Validated only on the bundled documents**: measured on the simulated scan, 4 character errors in 422 (0.9 %), 20 of 20 table cells exact at high sensitivity (17 of 20 at engine defaults); on the Tesseract image 8 of 8 lines. That says nothing about real scans, other layouts, other languages or other fonts.
* **Orientation and scripts**: no 90°/180° page rotation correction (a warning appears when most lines look vertical); skew beyond 8° is not corrected; no handwriting; models cover English and Chinese character sets and the demo is aimed at Latin script; right-to-left and other scripts are unsupported.
* **Tables**: only ruled tables; merged cells and nested tables are not modelled; the first row is assumed to be a header.
* **Fields**: regular expressions and a short label list, so unfamiliar labels, multi-line values, addresses, names, line items outside a ruled table and non-English labels are missed; no named-entity recognition and no language model. Ambiguous dates are flagged, not resolved. Amounts in `1.234,56` form are not parsed.
* **Mixed PDFs**: a page with a text layer *and* scanned images is read from the text layer only unless OCR is forced for all pages. A text layer can disagree with the picture (for example an earlier OCR run's mistakes).
* **Classification**: five keyword classes; anything else is unclassified.
* **Searchable PDF**: line-level positioning, Helvetica only (other characters become `?`), image stored as JPEG.
* **Privacy**: the service stores the uploaded document, page images and extracted text temporarily (default one hour) and deletes them on expiry or removal. Documents often contain personal and confidential data: deploy accordingly. Nothing is sent to third parties.
* Not a records-management, compliance or accounts-payable system; a person must review values before use.
