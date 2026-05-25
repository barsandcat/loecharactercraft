#!/usr/bin/env python3
"""
Script to migrate "Requires:" conditions to a dedicated "Requires" field in Roll objects.

This script:
1. Scans the data.json file's Condition field
2. If a Condition starts with "Requires:", extracts keywords in square brackets
3. Removes the Condition field
4. Adds a "Requires" field (array) with the keywords to the corresponding Roll object
"""

import json
import re
import sys

def extract_keywords_from_brackets(text):
    """
    Extract all keywords within square brackets [keyword] from text.
    
    Args:
        text: The text to extract keywords from
    
    Returns:
        List of keywords found in square brackets
    """
    # Find all words within square brackets
    pattern = r'\[([^\]]+)\]'
    matches = re.findall(pattern, text)
    return matches

def migrate_requires_field(data):
    """
    Migrate Requires conditions from Condition field to Roll.Requires field.
    Extracts keywords from [brackets].
    
    Args:
        data: The parsed JSON data structure
    
    Returns:
        Modified data with migrated Requires fields
    """
    
    migrated_count = 0
    
    # Process ActionCards
    if "ActionCards" in data:
        for card_id, card_data in data["ActionCards"].items():
            for side in ["Front", "Back"]:
                if side in card_data:
                    side_data = card_data[side]
                    
                    # Check if Condition starts with "Requires:"
                    if "Condition" in side_data and isinstance(side_data["Condition"], str):
                        condition = side_data["Condition"]
                        
                        if condition.startswith("Requires:") or condition.startswith("Requires "):
                            # Extract keywords from square brackets
                            keywords = extract_keywords_from_brackets(condition)
                            
                            # Check if Roll object exists
                            if "Roll" in side_data and isinstance(side_data["Roll"], dict):
                                # Add Requires field as an array
                                if "Requires" not in side_data["Roll"]:
                                    side_data["Roll"]["Requires"] = []
                                
                                # Add keywords if found
                                for keyword in keywords:
                                    if keyword not in side_data["Roll"]["Requires"]:
                                        side_data["Roll"]["Requires"].append(keyword)
                                
                                # Remove the Condition field
                                del side_data["Condition"]
                                migrated_count += 1
                                
                                keywords_str = ", ".join(keywords) if keywords else "none"
                                print(f"✓ Migrated {card_id} ({side}): Keywords: [{keywords_str}]")
    
    return data, migrated_count

def main():
    input_file = "data.json"
    output_file = "data.json"
    backup_file = "data.json.backup"
    
    try:
        # Read the data
        with open(input_file, 'r', encoding='utf-8') as f:
            data = json.load(f)
        
        print(f"Loaded {input_file}")
        print(f"Total ActionCards: {len(data.get('ActionCards', {}))}")
        
        # Create a backup
        with open(backup_file, 'w', encoding='utf-8') as f:
            json.dump(data, f, indent=2, ensure_ascii=False)
        print(f"Backup created: {backup_file}")
        
        # Migrate the data
        data, migrated_count = migrate_requires_field(data)
        
        # Write the updated data
        with open(output_file, 'w', encoding='utf-8') as f:
            json.dump(data, f, indent=2, ensure_ascii=False)
        
        print(f"\n✓ Migration complete!")
        print(f"Total migrated: {migrated_count} Condition fields")
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
