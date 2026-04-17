import os
import json
import logging
from datetime import datetime, timezone
from dotenv import load_dotenv
from supabase import create_client, Client

load_dotenv()

logger = logging.getLogger("vibrasense.supabase")

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")

# Local Fallback File
LOCAL_DB_PATH = os.path.join(os.path.dirname(__file__), "local_db.json")

def _load_local_db():
    if not os.path.exists(LOCAL_DB_PATH):
        db = {"reports": [], "alerts": [], "contacts": [], "settings": {}}
        _save_local_db(db)
        return db
    try:
        with open(LOCAL_DB_PATH, "r") as f:
            return json.load(f)
    except json.JSONDecodeError as je:
        logger.error(f"CORRUPT Local DB at {LOCAL_DB_PATH}: {je}")
        # Move corrupted file to backup for investigation
        import shutil
        backup_path = f"{LOCAL_DB_PATH}.corrupt.{int(datetime.now().timestamp())}"
        shutil.copy2(LOCAL_DB_PATH, backup_path)
        logger.info(f"Backing up corrupted DB to {backup_path}")
        return {"reports": [], "alerts": [], "contacts": [], "settings": {}}
    except Exception as e:
        logger.error(f"Failed to load local DB: {e}")
        return {"reports": [], "alerts": [], "contacts": [], "settings": {}}

def _save_local_db(data):
    try:
        with open(LOCAL_DB_PATH, "w") as f:
            json.dump(data, f, indent=2)
    except Exception as e:
        logger.error(f"CRITICAL: Failed to save to local DB: {e}")

# Initialize Supabase client safely
supabase: Client = None
try:
    if SUPABASE_URL and SUPABASE_KEY:
        supabase = create_client(SUPABASE_URL, SUPABASE_KEY)
        logger.info("Supabase client initialized.")
    else:
        logger.warning("Supabase credentials missing. Falling back to local DB.")
except Exception as e:
    logger.error(f"Supabase initialization failed (DNS/Network?): {e}")
    supabase = None


# ── Reports ──────────────────────────────────────────
def get_reports(limit=50, offset=0, structure_type=None, threat_level=None):
    if supabase:
        try:
            q = supabase.table("reports").select("*").order("timestamp", desc=True)
            if structure_type and structure_type != "All":
                q = q.eq("structure_id", structure_type)
            if threat_level:
                q = q.eq("threat_level", threat_level)
            q = q.range(offset, offset + limit - 1)
            return q.execute().data
        except Exception as e:
            logger.error(f"Supabase fetch reports failed: {e}")
    
    # Local Fallback
    db = _load_local_db()
    data = db.get("reports", [])
    if structure_type and structure_type != "All":
        data = [r for r in data if r.get("structure_id") == structure_type]
    if threat_level:
        data = [r for r in data if r.get("threat_level") == threat_level]
    
    data.sort(key=lambda x: x.get("timestamp", ""), reverse=True)
    return data[offset : offset + limit]


def insert_report(data: dict):
    # Proactive: If it's a bridge, ensure crack.jpg is associated as per user request
    struct_id = data.get("structure_id", "").lower()
    if "bridge" in struct_id and not data.get("snapshot_url"):
        data["snapshot_url"] = "/assets/crack.jpg"

    if supabase:
        try:
            res = supabase.table("reports").insert(data).execute()
            if res.data: return res.data
        except Exception as e:
            logger.error(f"Supabase insert report failed: {e}")

    # Local Fallback
    db = _load_local_db()
    if "id" not in data: data["id"] = len(db["reports"]) + 1
    db["reports"].append(data)
    _save_local_db(db)
    return [data]


# ── Alerts ───────────────────────────────────────────
def get_alerts(limit=100):
    if supabase:
        try:
            return (supabase.table("alerts")
                    .select("*")
                    .order("timestamp", desc=True)
                    .limit(limit)
                    .execute().data)
        except Exception as e:
            logger.error(f"Supabase fetch alerts failed: {e}")

    # Local Fallback
    db = _load_local_db()
    data = db.get("alerts", [])
    data.sort(key=lambda x: x.get("timestamp", ""), reverse=True)
    return data[:limit]


def insert_alert(data: dict):
    if supabase:
        try:
            res = supabase.table("alerts").insert(data).execute()
            if res.data: return res.data
        except Exception as e:
            logger.error(f"Supabase insert alert failed: {e}")

    # Local Fallback
    db = _load_local_db()
    if "id" not in data: data["id"] = len(db["alerts"]) + 1
    db["alerts"].append(data)
    _save_local_db(db)
    return [data]


# ── Contacts ─────────────────────────────────────────
def get_contacts():
    if supabase:
        try:
            return (supabase.table("contacts")
                    .select("*")
                    .order("name")
                    .execute().data)
        except Exception as e:
            logger.error(f"Supabase fetch contacts failed: {e}")

    # Local Fallback
    db = _load_local_db()
    data = db.get("contacts", [])
    data.sort(key=lambda x: x.get("name", ""))
    return data


def upsert_contact(data: dict):
    if supabase:
        try:
            res = supabase.table("contacts").upsert(data).execute()
            if res.data: return res.data
        except Exception as e:
            logger.error(f"Supabase upsert contact failed: {e}")

    # Local Fallback
    db = _load_local_db()
    cid = data.get("id")
    if cid:
        for i, c in enumerate(db["contacts"]):
            if str(c.get("id")) == str(cid):
                db["contacts"][i].update(data)
                break
        else:
            db["contacts"].append(data)
    else:
        data["id"] = len(db["contacts"]) + 1
        db["contacts"].append(data)
    
    _save_local_db(db)
    return [data]


def delete_contact(contact_id: str):
    if supabase:
        try:
            res = (supabase.table("contacts")
                    .delete()
                    .eq("id", contact_id)
                    .execute())
            if res.data: return res.data
        except Exception as e:
            logger.error(f"Supabase delete contact failed: {e}")

    # Local Fallback
    db = _load_local_db()
    db["contacts"] = [c for c in db["contacts"] if str(c.get("id")) != str(contact_id)]
    _save_local_db(db)
    return [{"id": contact_id}]


# ── Settings ─────────────────────────────────────────
def get_settings():
    if supabase:
        try:
            rows = supabase.table("settings").select("*").execute().data
            if rows:
                return {r["key"]: r["value"] for r in rows}
        except Exception as e:
            logger.error(f"Supabase fetch settings failed: {e}")

    # Local Fallback
    db = _load_local_db()
    return db.get("settings", {})


def save_setting(key: str, value: str):
    if supabase:
        try:
            res = (supabase.table("settings")
                    .upsert({"key": key, "value": value}, on_conflict="key")
                    .execute())
            if res.data: return res.data
        except Exception as e:
            logger.error(f"Supabase save setting failed: {e}")

    # Local Fallback
    db = _load_local_db()
    if "settings" not in db: db["settings"] = {}
    db["settings"][key] = value
    _save_local_db(db)
    return [{"key": key, "value": value}]


# ── Storage ──────────────────────────────────────────
def upload_snapshot(filename: str, file_bytes: bytes):
    """Upload danger snapshot to Supabase storage and return public URL."""
    if supabase:
        try:
            bucket = supabase.storage.from_("snapshots")
            bucket.upload(filename, file_bytes, {"content-type": "image/jpeg"})
            return f"{SUPABASE_URL}/storage/v1/object/public/snapshots/{filename}"
        except Exception as e:
            logger.error(f"Storage upload failed: {e}")
    return None
