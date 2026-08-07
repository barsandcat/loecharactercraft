#!/usr/bin/env python3
import json
from pathlib import Path

DATA_PATH = Path(__file__).resolve().parent.parent / "data.json"


def assign_item_display_names(data) -> int:
    items = data.get("Items")
    if not isinstance(items, dict):
        raise ValueError('The "Items" field is not an object.')

    updated_count = 0
    for item_name, item in items.items():
        if not isinstance(item, dict):
            raise ValueError(f'Item "{item_name}" is not an object.')
        if not item.get("DisplayName"):
            item["DisplayName"] = item_name
            updated_count += 1

    return updated_count


def main() -> None:
    with DATA_PATH.open("r", encoding="utf-8") as handle:
        data = json.load(handle)

    updated_count = assign_item_display_names(data)

    with DATA_PATH.open("w", encoding="utf-8") as handle:
        json.dump(data, handle, indent=2, ensure_ascii=False)
        handle.write("\n")

    print(f"Assigned DisplayName (copied from key) to {updated_count} items in {DATA_PATH}")


if __name__ == "__main__":
    main()
