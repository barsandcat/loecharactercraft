#!/usr/bin/env python3
import json
from pathlib import Path

DATA_PATH = Path(__file__).resolve().parent.parent / "data.json"


def increment_ids_in_collection(items):
    if not isinstance(items, list):
        return 0

    updated = 0
    for item in items:
        if isinstance(item, dict) and "Id" in item:
            item["Id"] = int(item.get("Id", 0)) + 1
            updated += 1
    return updated


def increment_nested_ids(data):
    updated = 0
    for key in ["Races", "Origins", "Professions", "AdvancementTrees"]:
        updated += increment_ids_in_collection(data.get(key))

    professions = data.get("Professions") or []
    for profession in professions:
        if not isinstance(profession, dict):
            continue
        paths = profession.get("Paths") or []
        updated += increment_ids_in_collection(paths)

    trees = data.get("AdvancementTrees") or []
    for tree in trees:
        if not isinstance(tree, dict):
            continue
        levels = tree.get("Levels") or {}
        if isinstance(levels, dict):
            for level_options in levels.values():
                if isinstance(level_options, list):
                    updated += increment_ids_in_collection(level_options)

    return updated


def main():
    with DATA_PATH.open("r", encoding="utf-8") as handle:
        data = json.load(handle)

    updated = increment_nested_ids(data)

    with DATA_PATH.open("w", encoding="utf-8") as handle:
        json.dump(data, handle, indent=2, ensure_ascii=False)
        handle.write("\n")

    print(f"Updated {updated} Id fields in {DATA_PATH}")


if __name__ == "__main__":
    main()
