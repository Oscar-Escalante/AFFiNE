#!/usr/bin/env python3
"""
Google Sheets → AFFiNE Wiki sync
Reads a Google Sheet and overwrites a designated wiki page with an affine:table.
Runs as a cron job on the VPS.
"""

import os
import uuid
import logging
import sys
from datetime import datetime, timezone

import psycopg2
import pycrdt
import gspread
from google.oauth2.service_account import Credentials

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger(__name__)

# ── Config ────────────────────────────────────────────────────────────────────

GOOGLE_SERVICE_ACCOUNT_FILE = os.environ.get("GOOGLE_SERVICE_ACCOUNT_FILE", "/home/sshadmin/apps/affine/google-sync/service-account.json")
GOOGLE_SHEET_ID             = os.environ.get("GOOGLE_SHEET_ID", "")
GOOGLE_SHEET_TAB            = os.environ.get("GOOGLE_SHEET_TAB", "Sheet1")

AFFINE_WORKSPACE_ID = os.environ.get("AFFINE_WORKSPACE_ID", "35a3579b-3f97-4813-b3d1-c9b8a8546cee")
AFFINE_DOC_ID       = os.environ.get("AFFINE_DOC_ID", "")
AFFINE_DOC_TITLE    = os.environ.get("AFFINE_DOC_TITLE", "Working Groups")

AFFINE_DB_URL = os.environ.get(
    "AFFINE_DB_URL",
    "postgresql://affine_sync:CHANGE_ME@127.0.0.1:5432/affine",
)

# Columns to include (in this order). Must match sheet header names exactly.
SYNC_COLUMNS = [
    "Name",
    "Vertical",
    "Canal de slack",
    "Team",
    "Team Lead",
    "Country",
    "Rkd Mail",
    "Connaxis mail",
]

# ── Google Sheets ─────────────────────────────────────────────────────────────

def read_sheet() -> list[dict]:
    creds = Credentials.from_service_account_file(
        GOOGLE_SERVICE_ACCOUNT_FILE,
        scopes=["https://www.googleapis.com/auth/spreadsheets.readonly"],
    )
    gc = gspread.authorize(creds)
    sheet = gc.open_by_key(GOOGLE_SHEET_ID).worksheet(GOOGLE_SHEET_TAB)
    records = sheet.get_all_records()
    before = len(records)
    records = [
        r for r in records
        if str(r.get("Vertical", "")).strip()
        and str(r.get("Vertical", "")).strip().lower() != "inactive"
    ]
    log.info("Sheet: %d rows (%d filtered out), columns: %s",
             len(records), before - len(records), list(records[0].keys()) if records else [])
    return records

# ── Y.js helpers ──────────────────────────────────────────────────────────────

def _rand_id() -> str:
    return uuid.uuid4().hex[:10]

def _order(index: int) -> str:
    """Simple lexicographically-sortable order key."""
    return f"f{index:010d}"

# ── Doc builder ───────────────────────────────────────────────────────────────

def build_doc(title: str, records: list[dict]) -> bytes:
    doc = pycrdt.Doc()
    blocks_map = doc.get("blocks", type=pycrdt.Map)

    page_id    = _rand_id()
    surface_id = _rand_id()
    note_id    = _rand_id()
    table_id   = _rand_id()

    # affine:surface (required)
    blocks_map[surface_id] = pycrdt.Map()
    s = blocks_map[surface_id]
    s["sys:id"]        = surface_id
    s["sys:flavour"]   = "affine:surface"
    s["sys:version"]   = 5.0
    s["sys:children"]  = pycrdt.Array()
    s["prop:elements"] = pycrdt.Map()

    # affine:table — use only the whitelisted columns that exist in the sheet
    available = set(records[0].keys()) if records else set()
    columns = [c for c in SYNC_COLUMNS if c in available] if records else []
    col_ids  = {col: _rand_id() for col in columns}
    header_row_id = _rand_id()
    row_ids = [_rand_id() for _ in records]

    blocks_map[table_id] = pycrdt.Map()
    t = blocks_map[table_id]
    t["sys:id"]       = table_id
    t["sys:flavour"]  = "affine:table"
    t["sys:version"]  = 1.0
    t["sys:children"] = pycrdt.Array()

    # Column definitions
    for i, col in enumerate(columns):
        cid = col_ids[col]
        t[f"prop:columns.{cid}.columnId"] = cid
        t[f"prop:columns.{cid}.order"]    = _order(i)

    # Header row
    t[f"prop:rows.{header_row_id}.rowId"] = header_row_id
    t[f"prop:rows.{header_row_id}.order"] = _order(0)
    for col in columns:
        cid = col_ids[col]
        t[f"prop:cells.{header_row_id}:{cid}.text"] = pycrdt.Text(col)

    # Data rows
    for row_idx, record in enumerate(records):
        rid = row_ids[row_idx]
        t[f"prop:rows.{rid}.rowId"] = rid
        t[f"prop:rows.{rid}.order"] = _order(row_idx + 1)
        for col in columns:
            cid = col_ids[col]
            val = str(record.get(col, "") or "").strip()
            t[f"prop:cells.{rid}:{cid}.text"] = pycrdt.Text(val)

    # affine:note
    blocks_map[note_id] = pycrdt.Map()
    n = blocks_map[note_id]
    n["sys:id"]           = note_id
    n["sys:flavour"]      = "affine:note"
    n["sys:version"]      = 1.0
    n["sys:children"]     = pycrdt.Array()
    n["sys:children"].append(table_id)
    n["prop:xywh"]        = "[0,0,800,92]"
    n["prop:index"]       = "a0"
    n["prop:hidden"]      = False
    n["prop:lockedBySelf"] = False
    n["prop:displayMode"] = "both"
    n["prop:background"]  = pycrdt.Map()
    n["prop:background"]["light"] = "#ffffff"
    n["prop:background"]["dark"]  = "#252525"
    n["prop:edgeless"]    = pycrdt.Map()

    # affine:page (root)
    blocks_map[page_id] = pycrdt.Map()
    p = blocks_map[page_id]
    p["sys:id"]       = page_id
    p["sys:flavour"]  = "affine:page"
    p["sys:version"]  = 2.0
    p["sys:children"] = pycrdt.Array()
    p["sys:children"].append(surface_id)
    p["sys:children"].append(note_id)
    p["prop:title"]   = pycrdt.Text(title)

    return bytes(doc.get_update())

# ── Database write ────────────────────────────────────────────────────────────

def update_affine_doc(workspace_id: str, doc_id: str, blob: bytes) -> None:
    conn = psycopg2.connect(AFFINE_DB_URL)
    try:
        with conn:
            with conn.cursor() as cur:
                now = datetime.now(timezone.utc)
                cur.execute(
                    """
                    INSERT INTO snapshots (workspace_id, guid, blob, updated_at, state)
                    VALUES (%s, %s, %s, %s, %s)
                    ON CONFLICT (workspace_id, guid)
                    DO UPDATE SET blob = EXCLUDED.blob,
                                  updated_at = EXCLUDED.updated_at,
                                  state = EXCLUDED.state
                    """,
                    (workspace_id, doc_id, psycopg2.Binary(blob), now, psycopg2.Binary(blob)),
                )
                cur.execute(
                    "DELETE FROM updates WHERE workspace_id = %s AND guid = %s",
                    (workspace_id, doc_id),
                )
        log.info("Snapshot written: workspace=%s doc=%s bytes=%d", workspace_id, doc_id, len(blob))
    finally:
        conn.close()

# ── Entry point ───────────────────────────────────────────────────────────────

def main():
    if not GOOGLE_SHEET_ID or not AFFINE_DOC_ID:
        log.error("Missing GOOGLE_SHEET_ID or AFFINE_DOC_ID")
        sys.exit(1)

    log.info("Reading Google Sheet %s (tab: %s)", GOOGLE_SHEET_ID, GOOGLE_SHEET_TAB)
    records = read_sheet()

    log.info("Building affine:table '%s' with %d rows", AFFINE_DOC_TITLE, len(records))
    blob = build_doc(AFFINE_DOC_TITLE, records)

    log.info("Writing to AFFiNE doc %s", AFFINE_DOC_ID)
    update_affine_doc(AFFINE_WORKSPACE_ID, AFFINE_DOC_ID, blob)

    log.info("Done.")

if __name__ == "__main__":
    main()
