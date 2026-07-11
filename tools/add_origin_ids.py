#!/usr/bin/env python3
import json
from pathlib import Path

DATA_PATH = Path(__file__).resolve().parent.parent / "data.json"


def update_array_ids(data, field_name: str) -> int:
    items = data.get(field_name)
    if not isinstance(items, list):
        raise ValueError(f'The "{field_name}" field is not an array.')

    for index, item in enumerate(items):
        if not isinstance(item, dict):
            raise ValueError(f"{field_name} item at index {index} is not an object.")
        item["Id"] = index

    return len(items)


def update_advancement_tree_level_ids(data) -> int:
    trees = data.get("AdvancementTrees")
    if not isinstance(trees, list):
        raise ValueError('The "AdvancementTrees" field is not an array.')

    updated_count = 0
    for tree_index, tree in enumerate(trees):
        if not isinstance(tree, dict):
            raise ValueError(f"AdvancementTree at index {tree_index} is not an object.")

        levels = tree.get("Levels")
        if not isinstance(levels, dict):
            continue

        for level_name, options in levels.items():
            if not isinstance(options, list):
                continue

            for option_index, option in enumerate(options):
                if not isinstance(option, dict):
                    continue
                option["Id"] = option_index
                updated_count += 1

    return updated_count


def main() -> None:
    with DATA_PATH.open("r", encoding="utf-8") as handle:
        data = json.load(handle)

    update_array_ids(data, "Origins")
    update_array_ids(data, "Professions")
    tree_count = update_array_ids(data, "AdvancementTrees")
    option_count = update_advancement_tree_level_ids(data)

    with DATA_PATH.open("w", encoding="utf-8") as handle:
        json.dump(data, handle, indent=2, ensure_ascii=False)
        handle.write("\n")

    print(f"Updated {tree_count} AdvancementTrees entries and {option_count} level options in {DATA_PATH}")


if __name__ == "__main__":
    main()
