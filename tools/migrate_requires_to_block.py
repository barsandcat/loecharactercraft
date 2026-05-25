#!/usr/bin/env python3
"""
Script to migrate "Requires" field from Roll object to Front/Back object.

This script moves the Requires field from the Roll object to the parent
Front or Back object where it belongs structurally.
"""

import json
import sys

def migrate_requires_field(data):
    """
    Migrate Requires field from Roll object to Front/Back object.
    
    Args:
        data: The parsed JSON data structure
    
    Returns:
        Modified data with Requires fields migrated
    """
    
    migrated_count = 0
    
    # Process ActionCards
    if "ActionCards" in data:
        for card_id, card_data in data["ActionCards"].items():
            for side in ["Front", "Back"]:
                if side in card_data:
                    side_data = card_data[side]
                    
                    # Check if Roll exists and has Requires field
                    if "Roll" in side_data and isinstance(side_data["Roll"], dict):
                        roll = side_data["Roll"]
                        
                        if "Requires" in roll and roll["Requires"]:
                            # Move Requires from Roll to the side (Front/Back)
                            requires = roll["Requires"]
                            side_data["Requires"] = requires
                            
                            # Remove Requires from Roll
                            del roll["Requires"]
                            
                            migrated_count += 1
                            keywords_str = ", ".join(requires)
                            print(f"✓ Migrated {card_id} ({side}): Requires moved to {side} object: [{keywords_str}]")
    
    return data, migrated_count

def main():
    input_file = "data.json"
    output_file = "data.json"
    
    try:
        # Read the data
        with open(input_file, 'r', encoding='utf-8') as f:
            data = json.load(f)
        
        print(f"Loaded {input_file}")
        print(f"Total ActionCards: {len(data.get('ActionCards', {}))}")
        
        # Migrate the data
        data, migrated_count = migrate_requires_field(data)
        
        # Write the updated data
        with open(output_file, 'w', encoding='utf-8') as f:
            json.dump(data, f, indent=2, ensure_ascii=False)
        
        print(f"\n✓ Migration complete!")
        print(f"Total migrated: {migrated_count} Requires fields")
        print(f"Updated file: {output_file}")
        
    except FileNotFoundError:
        print(f"Error: {input_file} not found")
        sys.exit(1)
    except json.JSONDecodeError as e:
        print(f"Error: Invalid JSON in {input_file}: {e}")
        sys.exit(1)
    except Exception as e:
        print(f"Error: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()
