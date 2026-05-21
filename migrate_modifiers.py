import json


def migrate_modifier(mod):
    if mod.get("against"):
        return mod, False

    triggers = mod.get("Triggers", [])
    against = [t for t in triggers if t.lower().startswith("against ")]
    if not against:
        return mod, False

    keywords = []
    for t in against:
        rest = t[len("against "):]
        keywords.extend(p.strip() for p in rest.split(" or "))

    other = [t for t in triggers if not t.lower().startswith("against ")]

    new_mod = {k: v for k, v in mod.items() if k != "Triggers"}
    new_mod["Triggers"] = other + keywords
    new_mod["against"] = True
    return new_mod, True


def main():
    path = "data.json"
    with open(path, encoding="utf-8") as f:
        data = json.load(f)

    changed = []
    for card_id, card in data["ActionCards"].items():
        roll = card.get("Roll") or card.get("Front", {}).get("Roll")
        if not roll or not roll.get("Modifiers"):
            continue
        new_mods = []
        for mod in roll["Modifiers"]:
            new_mod, was_changed = migrate_modifier(mod)
            new_mods.append(new_mod)
            if was_changed:
                changed.append((card_id, mod, new_mod))
        roll["Modifiers"] = new_mods

    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)

    print(f"Migrated {len(changed)} modifier(s):")
    for card_id, old, new in changed:
        print(f"  {card_id}: {json.dumps(old)} -> {json.dumps(new)}")


if __name__ == "__main__":
    main()
