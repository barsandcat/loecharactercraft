#!/usr/bin/env python3
"""
Script to normalize action cards in data.json.
Extracts all unique action cards into a central registry
and replaces all action card objects with just their CardId strings.
"""

import json
from pathlib import Path

def main():
    # Load the data
    data_path = Path("data.json")
    with open(data_path, "r", encoding="utf-8") as f:
        data = json.load(f)
    
    # Collect all unique action cards
    action_cards_dict = {}  # CardId -> full card object
    
    # Helper function to extract action cards from an entity or entry
    def collect_actions(obj):
        if isinstance(obj, dict):
            if "Action cards" in obj:
                for card in obj["Action cards"]:
                    if isinstance(card, dict) and "CardId" in card:
                        card_id = card["CardId"]
                        # Store or verify consistency
                        if card_id in action_cards_dict:
                            # Verify it's the same card (or very similar)
                            existing = action_cards_dict[card_id]
                            if existing.get("Name") != card.get("Name"):
                                print(f"WARNING: Card {card_id} has different Name: {existing.get('Name')} vs {card.get('Name')}")
                        else:
                            action_cards_dict[card_id] = card.copy()
            
            # Recursively check nested structures
            for value in obj.values():
                collect_actions(value)
        elif isinstance(obj, list):
            for item in obj:
                collect_actions(item)
    
    # Collect all action cards from all sections
    for section in ["Races", "Origins", "Professions", "Advancement Trees"]:
        if section in data:
            collect_actions(data[section])
    
    print(f"Found {len(action_cards_dict)} unique action cards:")
    for card_id in sorted(action_cards_dict.keys()):
        card = action_cards_dict[card_id]
        print(f"  {card_id}: {card.get('Name')} (Level {card.get('Level')})")
    
    # Now normalize: replace action card objects with just their CardId
    def normalize_actions(obj):
        if isinstance(obj, dict):
            if "Action cards" in obj:
                # Convert to list of card IDs
                card_ids = []
                for card in obj["Action cards"]:
                    if isinstance(card, dict) and "CardId" in card:
                        card_ids.append(card["CardId"])
                    elif isinstance(card, str):
                        # Already normalized
                        card_ids.append(card)
                obj["Action cards"] = card_ids
            
            # Recursively normalize nested structures
            for value in obj.values():
                normalize_actions(value)
        elif isinstance(obj, list):
            for item in obj:
                normalize_actions(item)
    
    # Apply normalization
    for section in ["Races", "Origins", "Professions", "Advancement Trees"]:
        if section in data:
            normalize_actions(data[section])
    
    # Add "Action Cards" registry at the root level
    # Sort by CardId for consistency
    data["Action Cards"] = {
        card_id: action_cards_dict[card_id]
        for card_id in sorted(action_cards_dict.keys())
    }
    
    # Save the normalized data
    with open(data_path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2)
    
    print(f"\nNormalized data.json successfully!")
    print(f"Added 'Action Cards' registry with {len(action_cards_dict)} cards")

if __name__ == "__main__":
    main()
