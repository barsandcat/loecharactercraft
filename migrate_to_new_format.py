import json

SIDE_FIELDS = {
    "Name", "DisplayName", "Type", "Category", "Keywords", "Condition", "Target",
    "Sun", "Moon", "BackSun", "BackMoon", "Roll", "Front", "Back", "Note", "Warning",
    "Level",
}


def migrate_card(card, card_id):
    if isinstance(card.get("Front"), dict):
        return card, False

    front = {}
    back = {}

    for field in ("Name", "DisplayName", "Type", "Category", "Keywords", "Condition", "Target"):
        if field in card:
            front[field] = card[field]
    for field in ("Sun", "Moon"):
        if field in card:
            front[field] = card[field]
    if "Roll" in card:
        front["Roll"] = card["Roll"]
    if "Front" in card:
        front["Text"] = card["Front"]

    if "BackSun" in card:
        back["Sun"] = card["BackSun"]
    if "BackMoon" in card:
        back["Moon"] = card["BackMoon"]
    if "Back" in card:
        back["Text"] = card["Back"]
    if "Note" in card:
        back["Note"] = card["Note"]
    if "Warning" in card:
        back["Warning"] = card["Warning"]

    new_card = {k: v for k, v in card.items() if k not in SIDE_FIELDS}
    if card_id.startswith("B") and "Level" in card:
        new_card["Level"] = card["Level"]
    new_card["Front"] = front
    if back:
        new_card["Back"] = back

    return new_card, True


def main():
    path = "data.json"
    with open(path, encoding="utf-8") as f:
        data = json.load(f)

    changed = 0
    for card_id, card in data["ActionCards"].items():
        new_card, was_changed = migrate_card(card, card_id)
        if was_changed:
            data["ActionCards"][card_id] = new_card
            changed += 1

    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)

    print(f"Migrated {changed} card(s) to Front/Back format.")


if __name__ == "__main__":
    main()
