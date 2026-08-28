#!/usr/bin/env python3
"""
Downloads every file from the Supabase Storage "images" bucket into
./images-backup/, preserving the folder structure (liveries/, artists/, etc).
Requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY as environment variables.
"""
import os
import sys
import urllib.request
import json

SUPABASE_URL = os.environ["SUPABASE_URL"].rstrip("/")
SERVICE_KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
BUCKET = "images"
OUT_DIR = "images-backup"

HEADERS = {
    "Authorization": f"Bearer {SERVICE_KEY}",
    "apikey": SERVICE_KEY,
    "Content-Type": "application/json",
}


def list_files(prefix=""):
    """Recursively lists every file in the bucket under the given prefix."""
    url = f"{SUPABASE_URL}/storage/v1/object/list/{BUCKET}"
    body = json.dumps({"prefix": prefix, "limit": 1000, "offset": 0}).encode()
    req = urllib.request.Request(url, data=body, headers=HEADERS, method="POST")
    with urllib.request.urlopen(req) as resp:
        entries = json.loads(resp.read())

    files = []
    for entry in entries:
        # Folders have no "id"/metadata; files do.
        full_path = f"{prefix}{entry['name']}" if not prefix else f"{prefix}/{entry['name']}"
        if entry.get("id") is None and entry.get("metadata") is None:
            files.extend(list_files(full_path))
        else:
            files.append(full_path)
    return files


def download_file(path):
    url = f"{SUPABASE_URL}/storage/v1/object/{BUCKET}/{path}"
    req = urllib.request.Request(url, headers=HEADERS)
    dest = os.path.join(OUT_DIR, path)
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    with urllib.request.urlopen(req) as resp, open(dest, "wb") as f:
        f.write(resp.read())


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    print("Listing files in bucket...")
    files = list_files()
    print(f"Found {len(files)} files. Downloading...")
    for i, path in enumerate(files, 1):
        try:
            download_file(path)
            print(f"  [{i}/{len(files)}] {path}")
        except Exception as e:
            print(f"  FAILED: {path} — {e}", file=sys.stderr)
    print("Done.")


if __name__ == "__main__":
    main()
