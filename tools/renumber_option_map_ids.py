#!/usr/bin/env python3
import json
from pathlib import Path

DATA_PATH = Path(__file__).resolve().parent.parent / "data.json"


def renumber_map_ids(value):
    if not isinstance(value, dict):
        return value

    numeric_items = []
    for key, item in value.items():
        if isinstance(key, str) and key.isdigit():
            numeric_items.append((int(key), item))
        else:
            numeric_items.append((None, (key, item)))

    if not numeric_items:
        return value

    numeric_items = [entry for entry in numeric_items if entry[0] is not None]
    if not numeric_items:
        return value

    numeric_items.sort(key=lambda entry: entry[0])
    new_value = {}
    for index, (old_id, item) in enumerate(numeric_items, start=1):
        new_value[str(index)] = item
    return new_value


def main() -> None:
    with DATA_PATH.open("r", encoding="utf-8") as handle:
        data = json.load(handle)

    for race in data.get("Races", []):
        if isinstance(race, dict):
            race["Attributes"] = renumber_map_ids(race.get("Attributes"))
            race["FreeSkills"] = renumber_map_ids(race.get("FreeSkills"))

    with DATA_PATH.open("w", encoding="utf-8") as handle:
        json.dump(data, handle, indent=2, ensure_ascii=False)
        handle.write("\n")

    print(f"Renumbered option map ids in {DATA_PATH}")


if __name__ == "__main__":
    main()
