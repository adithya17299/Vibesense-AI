"""Seed fake historical data into VibraSense via the supabase_client module."""
import sys
import os
import random
from datetime import datetime, timezone, timedelta

# Setup path so we can import supabase_client
sys.path.insert(0, os.path.dirname(__file__))

# Load .env
from dotenv import load_dotenv
load_dotenv(os.path.join(os.path.dirname(__file__), ".env"))

from supabase_client import insert_report

structures = ["Bridge-A1", "Bridge-B2", "Crane-C1", "Building-D3", "Bridge-E4", "Crane-F2"]
threat_levels = ["NORMAL", "NORMAL", "NORMAL", "WARNING", "WARNING", "DANGER"]

now = datetime.now(timezone.utc)

records = []
for i in range(30):
    ts = now - timedelta(hours=random.randint(1, 720), minutes=random.randint(0, 59))
    threat = random.choice(threat_levels)

    if threat == "NORMAL":
        amp = round(random.uniform(0.01, 0.28), 4)
        freq = round(random.uniform(0.5, 3.0), 2)
        health = random.randint(70, 95)
    elif threat == "WARNING":
        amp = round(random.uniform(0.30, 0.68), 4)
        freq = round(random.uniform(2.0, 5.0), 2)
        health = random.randint(40, 69)
    else:
        amp = round(random.uniform(0.70, 2.5), 4)
        freq = round(random.uniform(3.5, 8.0), 2)
        health = random.randint(5, 39)

    report = {
        "timestamp": ts.isoformat(),
        "structure_id": random.choice(structures),
        "frequency": freq,
        "amplitude": amp,
        "health_score": health,
        "threat_level": threat,
        "confidence": round(random.uniform(0.60, 0.98), 3),
        "snapshot_url": "",
    }
    records.append(report)

records.sort(key=lambda r: r["timestamp"], reverse=True)

print(f"Inserting {len(records)} fake historical records...")
for i, r in enumerate(records):
    try:
        insert_report(r)
        print(f"  [{i+1}/{len(records)}] {r['timestamp'][:19]} | {r['structure_id']:15s} | {r['threat_level']:8s} | {r['amplitude']}mm")
    except Exception as e:
        print(f"  [{i+1}] ERROR: {e}")

print("Done! Fake historical data seeded.")
