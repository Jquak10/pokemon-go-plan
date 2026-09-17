// Shared identity rules for the Worker and the classic-script management UI.
(() => {
  const namedKind = name => /\bgigantamax\b|\bg[ -]?max\b/i.test(name || '') ? 'gigantamax'
    : /\bdynamax\b/i.test(name || '') ? 'dynamax' : null;
  const kind = item => item?.battle_kind || (item?.battle_system === 'max'
    ? item.battle_variant || 'max' : item?.battle_system === 'raid' ? 'raid'
      : namedKind(item?.pokemon_name || item?.name) || 'raid');
  const label = item => ({raid:'Raid',dynamax:'Dynamax',gigantamax:'Gigantamax',max:'Max Battle'})[kind(item)] || 'Battle';
  function formName(name, battleKind) {
    const clean = String(name || '').trim();
    if (battleKind === 'raid') return clean;
    // Strip only Max capability labels, never regional, Shadow, Mega or other forms.
    return clean.replace(/\b(?:gigantamax|dynamax|g[ -]?max)\b/gi, '').replace(/\(\s*\)/g, '').replace(/\s+/g, ' ').trim();
  }
  const key = item => `${kind(item)}|${formName(item?.pokemon_name || item?.name, kind(item)).toLowerCase()}`;
  const matches = (target, battle) => key(target) === key(battle);
  const metadata = item => ({battle_kind:kind(item),battle_system:kind(item) === 'raid' ? 'raid' : 'max',
    battle_variant:['dynamax','gigantamax'].includes(kind(item)) ? kind(item) : null});
  function orderedMatches(targets, battle) {
    const priority = {high:0,medium:1,low:2,skip:3};
    return targets.filter(t => matches(t,battle)).sort((a,b) =>
      Number(Boolean(Number(a.completed))) - Number(Boolean(Number(b.completed))) ||
      (priority[a.priority] ?? 1) - (priority[b.priority] ?? 1) ||
      String(a.target_type).localeCompare(String(b.target_type)) || String(a.id).localeCompare(String(b.id)));
  }
  function canonicalName(name, battleKind) {
    return ['raid','max'].includes(battleKind) ? String(name).trim()
      : `${label({battle_kind:battleKind})} ${formName(name,battleKind)}`;
  }
  globalThis.BattleTargets = Object.freeze({namedKind,kind,label,formName,key,matches,metadata,orderedMatches,canonicalName});
})();
