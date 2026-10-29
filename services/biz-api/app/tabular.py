import re

_NUM = re.compile(r"^-?\d{1,3}(,\d{3})*(\.\d+)?$|^-?\d+(\.\d+)?$")


def parse_number(v: str):
    v = v.strip()
    if not _NUM.match(v):
        return None
    try:
        return float(v.replace(",", ""))
    except ValueError:
        return None
