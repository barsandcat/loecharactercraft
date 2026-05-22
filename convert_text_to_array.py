import json

# Read the data.json file
with open('data.json', 'r', encoding='utf-8') as f:
    data = json.load(f)

# Function to convert Text fields to arrays recursively
def convert_text_to_array(obj):
    if isinstance(obj, dict):
        for key, value in obj.items():
            if key == "Text" and isinstance(value, str):
                # Convert string Text to array with single string
                obj[key] = [value]
            elif isinstance(value, (dict, list)):
                convert_text_to_array(value)
    elif isinstance(obj, list):
        for item in obj:
            if isinstance(item, (dict, list)):
                convert_text_to_array(item)

# Convert all Text fields
convert_text_to_array(data)

# Write back to data.json with proper formatting
with open('data.json', 'w', encoding='utf-8') as f:
    json.dump(data, f, indent=2, ensure_ascii=False)

print("Conversion complete!")
