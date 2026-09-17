from pathlib import Path

path = Path("src/remote-raid-rules.js")
text = path.read_text()
old = r'''/(?:at\s*)?(\d{1,2})(?::(\d{2}))?\s*([ap])\.?\s*m\.?(?:\s*((?:UTC|GMT)\s*[+-]\s*\d{1,2}(?::?\d{2})?|[A-Z]{2,5}))?/i'''
new = r'''/(?:at\s*)?(\d{1,2})(?::(\d{2}))?\s*([ap])\.?\s*m\.?(?:\s*((?:UTC|GMT)\s*[+-]\s*\d{1,2}(?::?\d{2})?|PDT|PST|MDT|MST|CDT|CST|EDT|EST|UTC|GMT))?/i'''
if text.count(old) != 1:
    raise RuntimeError(f"expected one clock regex, found {text.count(old)}")
path.write_text(text.replace(old, new, 1))
