import os
import time
import requests
import re
from datetime import datetime

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
LOG_FILE = os.path.join(SCRIPT_DIR, "backend", "logs", "access.log")
SERVER_URL = "http://127.0.0.1:5000/backend/logs"

sent_lines = set()

def parse_log_line(line):
    pattern = r'^(\S+)\s+\S+\s+\S+\s+\[([^\]]+)\]\s+"(\S+)\s+(\S+)\s+\S+"\s+(\d+)\s+(\d+)'
    match = re.match(pattern, line.strip())

    if not match:
        return None

    ip = match.group(1)
    timestamp_str = match.group(2)
    method = match.group(3)
    url = match.group(4)
    status_code = int(match.group(5))

    dt = datetime.strptime(timestamp_str, "%d/%b/%Y:%H:%M:%S %z")
    formatted_timestamp = dt.strftime("%Y-%m-%d %H:%M:%S")

    if status_code >= 500:
        severity = "CRITICAL"
        log_type = "System"
        message = f"Server Error {status_code}: {method} {url}"
    elif status_code == 401:
        severity = "HIGH"
        log_type = "Security"
        message = f"Unauthorized: {method} {url}"
    elif status_code == 403:
        severity = "HIGH"
        log_type = "Security"
        message = f"Forbidden: {method} {url}"
    elif status_code == 404:
        severity = "MEDIUM"
        log_type = "Network"
        message = f"Not Found: {method} {url}"
    elif status_code >= 400:
        severity = "MEDIUM"
        log_type = "Network"
        message = f"Client Error {status_code}: {method} {url}"
    elif status_code >= 300:
        severity = "LOW"
        log_type = "Network"
        message = f"Cached: {method} {url}"
    elif status_code >= 200:
        severity = "INFO"
        log_type = "Network"
        message = f"{method} {url} - {status_code}"
    else:
        severity = "INFO"
        log_type = "Network"
        message = f"{method} {url} - {status_code}"

    log_data = {
        "timestamp": formatted_timestamp,
        "log_type": log_type,
        "message": message,
        "source_ip": ip,
        "severity": severity
    }

    return log_data

def send_to_server(log_data):
    response = requests.post(SERVER_URL, json=log_data, timeout=10)
    if response.status_code == 200:
        print(f"Sent: {log_data['message']}")
    else:
        print(f"Failed: {response.status_code}")

def process_logs(lines):
    for line in lines:
        line = line.strip()

        if not line:
            continue

        if line in sent_lines:
            print(f"Already sent: {line[:50]}")
            continue

        parsed = parse_log_line(line)

        if parsed:
            try:
                send_to_server(parsed)
            except requests.exceptions.Timeout:
                print(f"Skipped (too slow): {parsed['message']}")
            sent_lines.add(line)

        time.sleep(0.2)

print("Agent started. Press Ctrl+C to stop.")

with open(LOG_FILE, "r") as f:
    lines = f.readlines()

print(f"Found {len(lines)} lines")
process_logs(lines)
print(f"Done. Sent {len(sent_lines)} logs.")

last_position = os.path.getsize(LOG_FILE)

while True:
    with open(LOG_FILE, "r") as f:
        f.seek(last_position)
        new_lines = f.readlines()
        last_position = f.tell()

    if new_lines:
        process_logs(new_lines)

    time.sleep(5)