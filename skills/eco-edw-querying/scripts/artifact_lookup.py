from __future__ import annotations

import json
import sys
from pathlib import Path


def load_json(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def find_model(name: str, manifest: dict) -> tuple[str, dict] | tuple[None, None]:
    nodes = manifest.get("nodes", {})
    exact_key = f"model.edw.{name}"
    if exact_key in nodes:
        return exact_key, nodes[exact_key]
    for key, node in nodes.items():
        if node.get("resource_type") == "model" and node.get("name") == name:
            return key, node
    return None, None


def main() -> int:
    if len(sys.argv) < 2:
        print("Usage: python skills/eco-edw-querying/scripts/artifact_lookup.py <model_name> [target_dir]")
        return 1

    model_name = sys.argv[1]
    target_dir = Path(sys.argv[2]) if len(sys.argv) > 2 else Path("target")
    catalog_path = target_dir / "catalog.json"
    manifest_path = target_dir / "manifest.json"

    if not catalog_path.exists() or not manifest_path.exists():
        print("Missing DBT artifacts. Expected catalog.json and manifest.json in the target directory.")
        return 1

    catalog = load_json(catalog_path)
    manifest = load_json(manifest_path)

    key, node = find_model(model_name, manifest)
    if not key:
        print(f"Model not found: {model_name}")
        return 1

    catalog_node = catalog.get("nodes", {}).get(key, {})
    metadata = catalog_node.get("metadata", {})
    columns = list(catalog_node.get("columns", {}).keys())
    depends_on = node.get("depends_on", {}).get("nodes", [])

    print(f"model: {node.get('name')}")
    print(f"path: {node.get('path')}")
    print(f"database: {metadata.get('database')}")
    print(f"schema: {metadata.get('schema')}")
    print(f"relation: {metadata.get('name')}")
    print("columns:")
    for column in columns:
        print(f"  - {column}")
    print("upstream:")
    for dep in depends_on:
        print(f"  - {dep}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
