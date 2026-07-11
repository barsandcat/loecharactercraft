#!/usr/bin/env python3
import json
from pathlib import Path

DATA_PATH = Path(__file__).resolve().parent.parent / "data.json"


def main() -> None:
    with DATA_PATH.open("r", encoding="utf-8") as handle:
        data = json.load(handle)

    professions = data.get("Professions")
    if not isinstance(professions, list):
        raise ValueError('The "Professions" field is not an array.')

    updated = 0
    for profession in professions:
        if not isinstance(profession, dict):
            continue
        paths = profession.get("Paths")
        if not isinstance(paths, list):
            continue
        for index, path in enumerate(paths, start=1):
            if isinstance(path, dict):
                path["Id"] = index
                updated += 1

    with DATA_PATH.open("w", encoding="utf-8") as handle:
        json.dump(data, handle, indent=2, ensure_ascii=False)
        handle.write("\n")

    print(f"Added path Id fields to {updated} paths in {DATA_PATH}")


if __name__ == "__main__":
    main()
