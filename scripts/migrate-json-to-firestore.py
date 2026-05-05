#!/usr/bin/env python3
"""
One-shot migration: data/itinerary.json -> Firestore trips/italy-2026

Recursively encodes plain JSON into Firestore's typed-JSON format
(stringValue / booleanValue / integerValue / doubleValue / arrayValue / mapValue / nullValue),
PATCHes the whole structure to the trip doc, then verifies by reading back.

Pages keep reading from data/itinerary.json for now — this just gets the data
into Firestore so structure can be edited in Firebase Console.

Usage (from project root):
    python3 scripts/migrate-json-to-firestore.py

Idempotent: re-running overwrites with the current JSON content (PATCH semantics
mean unspecified fields would be preserved, but we send the full doc each time).
"""
import json
import os
import sys
import urllib.request
import urllib.error

PROJECT_ID = "trip-webapp-de677"
TRIP_ID = "italy-2026"
JSON_PATH = os.path.join(os.path.dirname(__file__), "..", "data", "itinerary.json")
FIRESTORE_URL = (
    f"https://firestore.googleapis.com/v1/projects/{PROJECT_ID}"
    f"/databases/(default)/documents/trips/{TRIP_ID}"
)


def encode_value(v):
    """Convert a Python value into Firestore's typed-JSON shape.

    Distinguishes int vs float (Firestore has separate types).
    Booleans must be checked before int (since bool is a subclass of int).
    """
    if v is None:
        return {"nullValue": None}
    if isinstance(v, bool):
        return {"booleanValue": v}
    if isinstance(v, int):
        # Firestore integerValue must be a string
        return {"integerValue": str(v)}
    if isinstance(v, float):
        return {"doubleValue": v}
    if isinstance(v, str):
        return {"stringValue": v}
    if isinstance(v, list):
        return {"arrayValue": {"values": [encode_value(x) for x in v]}}
    if isinstance(v, dict):
        return {"mapValue": {"fields": {k: encode_value(val) for k, val in v.items()}}}
    raise TypeError(f"Unsupported type for Firestore encoding: {type(v).__name__}")


def encode_top_level(data):
    """Top-level Firestore doc is { fields: { key: typed_value, ... } }."""
    if not isinstance(data, dict):
        raise TypeError("Top-level JSON must be an object/dict")
    return {"fields": {k: encode_value(v) for k, v in data.items()}}


def http(method, url, body=None):
    """Minimal HTTP helper using urllib (no external deps)."""
    headers = {"Content-Type": "application/json"}
    data = json.dumps(body).encode("utf-8") if body is not None else None
    req = urllib.request.Request(url, data=data, method=method, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            return resp.status, resp.read().decode("utf-8")
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode("utf-8")


def count_fields_recursive(value):
    """Count primitive leaves in a Firestore-encoded value (for diff verification)."""
    if not isinstance(value, dict):
        return 0
    if "stringValue" in value or "booleanValue" in value or "integerValue" in value \
            or "doubleValue" in value or "nullValue" in value or "timestampValue" in value:
        return 1
    if "arrayValue" in value:
        return sum(count_fields_recursive(x) for x in value["arrayValue"].get("values", []))
    if "mapValue" in value:
        return sum(count_fields_recursive(x) for x in value["mapValue"].get("fields", {}).values())
    return 0


def main():
    # Load JSON
    print(f"=> Reading {JSON_PATH}")
    with open(JSON_PATH, "r", encoding="utf-8") as f:
        data = json.load(f)
    print(f"   Top-level keys: {list(data.keys())}")
    print(f"   days[]: {len(data.get('days', []))} entries")

    # Encode for Firestore
    encoded = encode_top_level(data)
    encoded_size = len(json.dumps(encoded))
    print(f"   Encoded size: {encoded_size:,} bytes (Firestore doc limit is 1,048,576)")
    if encoded_size > 1_000_000:
        sys.exit("ERROR: encoded payload too close to 1MB limit; refactor schema before migration")

    leaf_count = sum(count_fields_recursive(v) for v in encoded["fields"].values())
    print(f"   Primitive leaf count (sent): {leaf_count}")

    # PATCH
    print(f"\n=> PATCH {FIRESTORE_URL}")
    code, resp = http("PATCH", FIRESTORE_URL, encoded)
    if code != 200:
        print(f"ERROR HTTP {code}: {resp[:600]}")
        sys.exit(1)
    print(f"   HTTP 200")

    # Verify by reading back
    print(f"\n=> GET {FIRESTORE_URL}")
    code, resp = http("GET", FIRESTORE_URL)
    if code != 200:
        print(f"ERROR HTTP {code}: {resp[:600]}")
        sys.exit(1)
    remote = json.loads(resp)
    leaf_count_remote = sum(count_fields_recursive(v) for v in remote.get("fields", {}).values())
    print(f"   Primitive leaf count (received): {leaf_count_remote}")

    # Diff
    if leaf_count == leaf_count_remote:
        print(f"\n[OK] Local sent and remote received have matching leaf counts ({leaf_count}).")
        print(f"     Doc: trips/{TRIP_ID}")
        print(f"     View in console: https://console.firebase.google.com/project/{PROJECT_ID}/firestore/databases/-default-/data/~2Ftrips~2F{TRIP_ID}")
    else:
        print(f"\n[WARN] Leaf-count mismatch: sent {leaf_count} vs received {leaf_count_remote}")
        print("       Doc was written, but verify content manually in Firebase Console.")
        sys.exit(2)


if __name__ == "__main__":
    main()
