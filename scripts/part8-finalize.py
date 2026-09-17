from pathlib import Path


def replace_once(text, old, new, label):
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f"{label}: expected one match, found {count}")
    return text.replace(old, new, 1)

styles_path = Path('public/styles.css')
styles = styles_path.read_text()
styles = replace_once(
    styles,
    '''.recommendation-footer-row .log-raid-button,
.recommendation-footer-row .small-button {
  min-height: 40px;
  white-space: nowrap;
}''',
    '''.recommendation-footer-row .log-raid-button,
.recommendation-footer-row .small-button {
  min-height: 44px;
  white-space: nowrap;
}''',
    'recommendation action touch targets'
)
styles_path.write_text(styles)

manage_path = Path('public/manage.html')
manage = manage_path.read_text()
manage = replace_once(
    manage,
    '''  document.querySelectorAll(".tab-button").forEach(button => {
    const active = button.dataset.tab === name;''',
    '''  document.querySelectorAll(".tab-button[data-tab]").forEach(button => {
    const active = button.dataset.tab === name;''',
    'tab activation selector'
)
manage_path.write_text(manage)

test_path = Path('tests/battle-plan-ui.test.mjs')
test = test_path.read_text()
if 'Part 8 mobile actions remain 44px+' not in test:
    test += '''\n// Part 8 mobile actions remain 44px+ and only real tabs receive tab state.\nassert.match(styles, /recommendation-footer-row \\.log-raid-button,[\\s\\S]*min-height:\\s*44px/);\nassert.match(manage, /querySelectorAll\\(\"\\.tab-button\\[data-tab\\]\"\\)/);\n'''
test_path.write_text(test)

print('Part 8 final touch-target and tab-state hardening applied')
