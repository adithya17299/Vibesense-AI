import os
import sys
from datetime import datetime, timezone
from dotenv import load_dotenv
from supabase import create_client, Client

# Add backend to path if needed
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

def test_connection():
    print("--- Supabase Connectivity Diagnostic ---")
    
    # 1. Load .env
    load_dotenv()
    url = os.getenv("SUPABASE_URL")
    key = os.getenv("SUPABASE_KEY")
    
    if not url or not key:
        print("[ERROR] SUPABASE_URL or SUPABASE_KEY missing from .env")
        return
        
    print(f"[INFO] URL: {url}")
    print(f"[INFO] Key: {key[:10]}...{key[-10:]}")
    
    # 2. Initialize Client
    try:
        supabase: Client = create_client(url, key)
        print("[SUCCESS] Supabase client initialized.")
    except Exception as e:
        print(f"[ERROR] Failed to initialize client: {e}")
        return

    # 3. Test Select from Alerts
    print("\n[TEST] Fetching alerts...")
    try:
        res = supabase.table("alerts").select("*").limit(1).execute()
        print(f"[SUCCESS] Alerts fetched: {len(res.data)} records found.")
    except Exception as e:
        print(f"[ERROR] Failed to fetch alerts: {e}")

    # 4. Test Select from Reports
    print("\n[TEST] Fetching reports...")
    try:
        res = supabase.table("reports").select("*").limit(1).execute()
        print(f"[SUCCESS] Reports fetched: {len(res.data)} records found.")
    except Exception as e:
        print(f"[ERROR] Failed to fetch reports: {e}")

    # 5. Test Insert into Alerts (Dry Run)
    print("\n[TEST] Attempting test insertion into alerts...")
    test_record = {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "contact_name": "DIAGNOSTIC_TEST",
        "role": "SYSTEM_CHECK",
        "email": "test@vibrasense.ai",
        "status": "TEST"
    }
    try:
        res = supabase.table("alerts").insert(test_record).execute()
        print(f"[SUCCESS] Test alert inserted! ID: {res.data[0].get('id') if res.data else 'N/A'}")
    except Exception as e:
        print(f"[ERROR] Failed to insert alert: {e}")

if __name__ == "__main__":
    test_connection()
