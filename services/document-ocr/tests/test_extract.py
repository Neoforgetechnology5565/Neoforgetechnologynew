"""Field rules, checks and classification on text (no files, no models)."""
from decimal import Decimal

from app.extract import classify, extract_fields, parse_amount, parse_dates, validations


def item(text, x=0.1, y=0.1, conf=None, i=1):
    return {"id": f"p1-l{i}", "text": text, "bbox": [x, y, x + 0.01 * len(text), y + 0.02], "conf": conf, "source": "ocr_model" if conf is not None else "embedded_text"}


def fields(*texts, conf=None):
    its = [item(t, y=0.1 + 0.05 * k, conf=conf, i=k + 1) for k, t in enumerate(texts)]
    return extract_fields(1, [[i] for i in its], set(), lambda it: it["source"])


def test_dates_all_formats_and_ambiguity():
    d = lambda s: [(x[2], x[3]) for x in parse_dates(s)]  # noqa: E731
    assert d("2024-03-14") == [("2024-03-14", [])]
    assert d("14 March 2024") == [("2024-03-14", [])] and d("3rd Sept 2023")[0][0] == "2023-09-03"
    assert d("March 14, 2024") == [("2024-03-14", [])]
    assert d("25/12/2024") == [("2024-12-25", [])]            # day > 12 settles the order
    assert d("12/25/2024") == [("2024-12-25", [])]
    amb = d("03/04/2024")
    assert amb[0][0] == "03/04/2024" and "ambiguous" in amb[0][1][0] and "2024-04-03" in amb[0][1][0] and "2024-03-04" in amb[0][1][0]   # raw text kept, both readings shown
    assert d("31/02/2024") == [] and d("2024-13-01") == []    # impossible dates are not dates
    assert d("version 2.3.4 build 10") == []


def test_amounts_need_a_currency_or_a_money_label():
    assert parse_amount("£1,234.50", None)[:2] == ("1234.50", "GBP")
    assert parse_amount("$ 7", None)[:2] == ("7", "USD") and parse_amount("12.00 EUR", None)[:2] == ("12.00", "EUR")
    assert parse_amount("138.84", None) is None                  # a bare number is not money
    assert parse_amount("138.84", "Total")[0] == "138.84"
    assert parse_amount("138.84", "Room number") is None
    assert parse_amount("abc", "Total") is None


def test_key_values_typed_and_untyped():
    f = {x["label"] or x["type"]: x for x in fields("Invoice No: INV-2024-0173", "Due Date: 13 April 2024", "Total: £138.84", "Email: a.b@example.com", "Phone: +44 20 7946 0123", "Bill To: Someone Ltd")}
    assert f["Invoice No"]["type"] == "identifier" and f["Invoice No"]["value"] == "INV-2024-0173"
    assert f["Due Date"]["value"] == "2024-04-13" and f["Total"]["value"] == "138.84" and f["Total"]["currency"] == "GBP"
    assert f["Email"]["value"] == "a.b@example.com" and f["Phone"]["value"] == "+442079460123"
    assert f["Bill To"]["type"] == "text" and f["Bill To"]["value"] == "Someone Ltd"
    assert all(x["origin"] == "rule_parsed" and x["status"] == "unreviewed" and x["rule"] for x in f.values())


def test_things_that_must_not_become_fields():
    assert fields("Meeting at 10:30 in room 12", "see https://example.org/page", "Page 3 of 12", "Call 12345") == []
    out = fields("Note: 123", "Ref: 123")   # only an id-like label makes a bare number an identifier
    assert [(x["label"], x["type"]) for x in out] == [("Note", "text"), ("Ref", "identifier")]


def test_standalone_values_inside_text():
    f = fields("Contact accounts@example.com or +44 20 7946 0456 before 1 January 2024.")
    assert {(x["type"], x["value"]) for x in f} == {("email", "accounts@example.com"), ("phone", "+442079460456"), ("date", "2024-01-01")}


def test_ocr_confidence_is_carried_and_low_values_are_flagged():
    f = fields("Total: £138.84", conf=0.62)[0]
    assert f["ocr_confidence"] == 0.62 and f["based_on"] == "ocr_model" and any("low OCR confidence" in x for x in f["flags"])
    e = fields("Total: £138.84")[0]
    assert e["ocr_confidence"] is None and e["based_on"] == "embedded_text" and e["flags"] == ["currency inferred from the symbol"]


def test_field_boxes_are_exact_for_text_layers_and_marked_approximate_otherwise():
    text = "Total: £138.84"
    exact = {"id": "p1-l1", "text": text, "bbox": [0.1, 0.1, 0.1 + len(text) * 0.01, 0.12], "char_x": [[0.1 + k * 0.01, 0.1 + (k + 1) * 0.01] for k in range(len(text))], "source": "embedded_text", "conf": None}
    f = extract_fields(1, [[exact]], set(), lambda it: it["source"])[0]
    assert not f["bbox_approximate"] and abs(f["bbox"][0] - 0.17) < 1e-6 and abs(f["bbox"][2] - 0.24) < 1e-6
    approx = {k: v for k, v in exact.items() if k != "char_x"} | {"source": "ocr_model", "conf": 0.9}
    assert extract_fields(1, [[approx]], set(), lambda it: it["source"])[0]["bbox_approximate"]


def test_label_and_value_in_separate_items_on_one_row():
    a, b = item("Total", 0.1, 0.5, i=1), item("£138.84", 0.5, 0.5, i=2)
    f = extract_fields(1, [[a, b]], set(), lambda it: it["source"])
    assert len(f) == 1 and f[0]["label"] == "Total" and f[0]["value"] == "138.84"


def test_validations_pass_and_fail_honestly():
    def fl(sub, tax, tot):
        mk = lambda i, lab, v: {"id": f"f1-{i}", "type": "amount", "label": lab, "current_value": v, "flags": []}  # noqa: E731
        return [mk(1, "Subtotal", sub), mk(2, "VAT (20%)", tax), mk(3, "Total", tot)]
    table = {"id": "t1-1", "cells": [["Item", "Qty", "Unit price", "Amount"], ["a", "2", "3.00", "6.00"], ["b", "1", "4.50", "4.50"]]}
    ok = validations(fl("10.50", "2.10", "12.60"), [table])
    assert [v["passed"] for v in ok] == [True, True, True]
    bad = validations(fl("10.50", "2.10", "12.70"), [{**table, "cells": [table["cells"][0], ["a", "2", "3.00", "6.50"], table["cells"][2]]}])
    assert [v["passed"] for v in bad] == [False, False, False] and "6.50" in bad[1]["detail"]
    assert validations([], [table])[0]["passed"]                       # the row check needs no other field
    assert validations(fl("1", "1", "1")[:2], []) == []                # not enough values: no check is invented


def test_classifier_needs_evidence_and_says_so():
    inv = classify("Invoice No: 1\nBill To: X\nSubtotal 1\nVAT 2\nTotal 3\nPayment terms", 1)
    assert inv["label"] == "invoice" and "subtotal" in inv["matched"]["invoice"] and "not a trained classifier" in inv["method"]
    assert classify("The quick brown fox jumps over the lazy dog.", 0)["label"] == "unclassified"
    assert classify("Total", 0)["label"] == "unclassified"
    assert classify("", 0)["label"] == "unclassified"
