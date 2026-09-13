import json
with open("ml_attrs.json", "r", encoding="utf-8-sig") as f:
    data = json.load(f)
if isinstance(data, dict):
    pass
elif isinstance(data, list):
    for item in data:
        if isinstance(item, dict) and item.get("id") == "BRAND":
            print(json.dumps(item.get("values")[:3], indent=2))
