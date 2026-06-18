import os
import psycopg2
from psycopg2.extras import RealDictCursor
from flask import Flask, render_template, request, redirect, url_for, jsonify, send_from_directory
from datetime import datetime, timedelta
from .alert import send_alert
import re
from collections import defaultdict, Counter
import random

app = Flask(__name__)

DATABASE_URL = os.environ.get('DATABASE_URL', 'postgresql://neondb_owner:npg_5IWQbLoHM6rc@ep-lively-mode-ahtnsi31.c-3.us-east-1.aws.neon.tech/neondb?sslmode=require')

def get_db():
    conn = psycopg2.connect(DATABASE_URL)
    return conn

def init_db():
    conn = get_db()
    cursor = conn.cursor()

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS users (
            id SERIAL PRIMARY KEY,
            usernamee VARCHAR(100) UNIQUE NOT NULL,
            passwordd VARCHAR(100) NOT NULL
        )
    """)

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS logs (
            id SERIAL PRIMARY KEY,
            timestamp VARCHAR(50) NOT NULL,
            log_type VARCHAR(50) NOT NULL,
            message TEXT NOT NULL,
            source_ip VARCHAR(50) NOT NULL,
            severity VARCHAR(50) NOT NULL
        )
    """)

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS blocked_ips (
            id SERIAL PRIMARY KEY,
            ip_address VARCHAR(50) UNIQUE NOT NULL,
            threat_id INT,
            reason TEXT,
            blocked_at VARCHAR(50) NOT NULL,
            blocked_by VARCHAR(100) DEFAULT 'system'
        )
    """)

    conn.commit()
    cursor.close()
    conn.close()

init_db()

@app.route('/')
def home():
    return render_template('landing.html')

@app.route('/login', methods=["GET", "POST"])
def login():
    if request.method == 'POST':
        username = request.form['username']
        password = request.form['password']

        db = get_db()
        cursor = db.cursor()
        cursor.execute("SELECT * FROM users WHERE usernamee = %s AND passwordd = %s", (username, password))
        user = cursor.fetchone()
        cursor.close()
        db.close()

        if user:
            return redirect(url_for('dashboard'))
        else:
            return render_template('login.html', error="Invalid username or password")
    return render_template('login.html')

@app.route('/register', methods=['GET', 'POST'])
def register():
    if request.method == 'POST':
        username = request.form['username']
        password = request.form['password']

        db = get_db()
        cursor = db.cursor()
        cursor.execute("INSERT INTO users (usernamee, passwordd) VALUES (%s, %s)", (username, password))
        db.commit()
        cursor.close()
        db.close()
        return redirect(url_for('login'))

    return render_template('register.html')

@app.route('/dashboard')
def dashboard():
    return render_template('dashboard.html')

@app.route('/api/da')
def get_data():
    return jsonify({"value": "Hello from Flask!"})

@app.route('/api/dashboard-stats')
def dashboard_stats():
    db = get_db()
    cursor = db.cursor()

    cursor.execute("SELECT COUNT(*) FROM logs")
    total_traffic = cursor.fetchone()[0]

    cursor.execute("SELECT COUNT(*) FROM logs WHERE severity IN ('HIGH', 'CRITICAL')")
    threats = cursor.fetchone()[0]

    cursor.execute("SELECT COUNT(*) FROM logs WHERE severity = 'CRITICAL'")
    alerts = cursor.fetchone()[0]

    cursor.execute("SELECT COUNT(*) FROM logs WHERE message LIKE '%%403%%' OR message LIKE '%%Forbidden%%'")
    blocked = cursor.fetchone()[0]

    cursor.close()
    db.close()

    return jsonify({
        'total_traffic': total_traffic,
        'threats': threats,
        'alerts': alerts,
        'blocked': blocked
    })

@app.route('/api/traffic-data')
def traffic_data():
    db = get_db()
    cursor = db.cursor()

    cursor.execute("SELECT severity FROM logs ORDER BY timestamp DESC LIMIT 24")
    severities = cursor.fetchall()

    severity_map = {'INFO': 1, 'LOW': 2, 'MEDIUM': 3, 'HIGH': 4, 'CRITICAL': 5}
    data = [severity_map.get(s[0], 1) for s in severities]

    while len(data) < 24:
        data.insert(0, 0)

    cursor.close()
    db.close()

    return jsonify({'data': data})

@app.route('/api/threats-by-severity')
def threats_by_severity():
    db = get_db()
    cursor = db.cursor()

    cursor.execute("SELECT severity, COUNT(*) FROM logs GROUP BY severity")
    results = cursor.fetchall()

    counts = {'Critical': 0, 'High': 0, 'Medium': 0, 'Low': 0, 'Info': 0}
    for sev, count in results:
        counts[sev.capitalize()] = count

    cursor.close()
    db.close()

    return jsonify(counts)

@app.route('/api/recent-alerts')
def recent_alerts():
    db = get_db()
    cursor = db.cursor()

    cursor.execute("SELECT message, source_ip, severity FROM logs WHERE severity IN ('HIGH', 'CRITICAL') ORDER BY timestamp DESC LIMIT 5")
    alerts = cursor.fetchall()

    alerts_list = []
    for alert in alerts:
        alerts_list.append({
            'message': alert[0],
            'ip': alert[1],
            'severity': alert[2]
        })

    cursor.close()
    db.close()

    return jsonify(alerts_list)

@app.route('/api/threats')
def get_threats():
    db = get_db()
    cursor = db.cursor()

    cursor.execute("""
        SELECT id, timestamp, log_type, message, source_ip, severity 
        FROM logs 
        WHERE severity IN ('HIGH', 'CRITICAL')
        ORDER BY timestamp DESC
    """)
    threats = cursor.fetchall()

    cursor.execute("SELECT ip_address FROM blocked_ips")
    blocked = set(row[0] for row in cursor.fetchall())

    cursor.close()
    db.close()

    threats_list = []
    for t in threats:
        threats_list.append({
            'id': t[0],
            'timestamp': t[1],
            'log_type': t[2],
            'message': t[3],
            'source_ip': t[4],
            'severity': t[5],
            'is_blocked': t[4] in blocked
        })

    return jsonify(threats_list)

@app.route('/api/threat/<int:threat_id>')
def get_threat_detail(threat_id):
    db = get_db()
    cursor = db.cursor()

    cursor.execute("""
        SELECT id, timestamp, log_type, message, source_ip, severity 
        FROM logs 
        WHERE id = %s
    """, (threat_id,))
    threat = cursor.fetchone()

    if not threat:
        cursor.close()
        db.close()
        return jsonify({'error': 'Threat not found'}), 404

    cursor.execute("SELECT ip_address FROM blocked_ips WHERE ip_address = %s", (threat[4],))
    is_blocked = cursor.fetchone() is not None

    cursor.close()
    db.close()

    msg = threat[3] or ""
    proto = "TCP"
    if "UDP" in msg.upper() or "DNS" in msg.upper():
        proto = "UDP"
    elif "ICMP" in msg.upper():
        proto = "ICMP"
    elif "HTTP" in msg.upper():
        proto = "HTTP"

    ip_pattern = r'\b(?:[0-9]{1,3}\.){3}[0-9]{1,3}\b'
    ips = re.findall(ip_pattern, msg)
    dst_ip = ips[1] if len(ips) > 1 else (ips[0] if ips else "192.168.1.1")
    if dst_ip == threat[4]:
        dst_ip = "192.168.1.1"

    port = "N/A"
    port_match = re.search(r'port\s+(\d+)', msg, re.IGNORECASE)
    if port_match:
        port = port_match.group(1)
    elif "1-1000" in msg or "scan" in msg.lower():
        port = "1-1000"

    return jsonify({
        'id': threat[0],
        'timestamp': threat[1],
        'log_type': threat[2],
        'message': threat[3],
        'source_ip': threat[4],
        'dest_ip': dst_ip,
        'severity': threat[5],
        'protocol': proto,
        'port': port,
        'is_blocked': is_blocked
    })

@app.route('/api/block-ip', methods=['POST'])
def block_ip():
    data = request.json
    if not data:
        return jsonify({"status": "error", "message": "No data"}), 400

    ip = data.get('ip')
    threat_id = data.get('threat_id')
    reason = data.get('reason', 'Blocked via threat panel')

    if not ip:
        return jsonify({"status": "error", "message": "IP required"}), 400

    try:
        db = get_db()
        cursor = db.cursor()

        cursor.execute("SELECT id FROM blocked_ips WHERE ip_address = %s", (ip,))
        if cursor.fetchone():
            cursor.close()
            db.close()
            return jsonify({"status": "exists", "message": "IP already blocked"})

        cursor.execute("""
            INSERT INTO blocked_ips (ip_address, threat_id, reason, blocked_at)
            VALUES (%s, %s, %s, %s)
        """, (ip, threat_id, reason, str(datetime.now())))
        db.commit()
        cursor.close()
        db.close()

        return jsonify({"status": "success", "message": f"IP {ip} blocked"})
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

@app.route('/api/blocked-ips')
def get_blocked_ips():
    db = get_db()
    cursor = db.cursor()

    cursor.execute("""
        SELECT id, ip_address, threat_id, reason, blocked_at, blocked_by
        FROM blocked_ips
        ORDER BY blocked_at DESC
    """)
    blocked = cursor.fetchall()
    cursor.close()
    db.close()

    return jsonify([{
        'id': b[0],
        'ip': b[1],
        'threat_id': b[2],
        'reason': b[3],
        'blocked_at': b[4],
        'blocked_by': b[5]
    } for b in blocked])

@app.route('/api/unblock-ip', methods=['POST'])
def unblock_ip():
    data = request.json
    if not data or not data.get('ip'):
        return jsonify({"status": "error", "message": "IP required"}), 400

    try:
        db = get_db()
        cursor = db.cursor()
        cursor.execute("DELETE FROM blocked_ips WHERE ip_address = %s", (data['ip'],))
        db.commit()
        cursor.close()
        db.close()
        return jsonify({"status": "success", "message": f"IP {data['ip']} unblocked"})
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

@app.route('/api/analyze-ip/<ip>')
def analyze_ip(ip):
    db = get_db()
    cursor = db.cursor()

    cursor.execute("""
        SELECT timestamp, message, severity, log_type
        FROM logs
        WHERE source_ip = %s
        ORDER BY timestamp DESC
    """, (ip,))
    logs = cursor.fetchall()

    cursor.execute("SELECT reason, blocked_at FROM blocked_ips WHERE ip_address = %s", (ip,))
    blocked = cursor.fetchone()

    cursor.execute("""
        SELECT severity, COUNT(*) FROM logs WHERE source_ip = %s GROUP BY severity
    """, (ip,))
    severity_counts = dict(cursor.fetchall())

    cursor.close()
    db.close()

    critical = severity_counts.get('CRITICAL', 0)
    high = severity_counts.get('HIGH', 0)
    medium = severity_counts.get('MEDIUM', 0)
    low = severity_counts.get('LOW', 0)
    info = severity_counts.get('INFO', 0)
    total = critical + high + medium + low + info

    score = min(100, (critical * 25 + high * 15 + medium * 8 + low * 3 + info * 1))
    if total == 0:
        score = 0
    else:
        score = min(100, int(score / max(total * 2, 1) * 100))

    if score >= 70 or blocked:
        reputation = 'Malicious'
        badge = 'mal'
    elif score >= 40:
        reputation = 'Suspicious'
        badge = 'sus'
    else:
        reputation = 'Safe'
        badge = 'safe'

    if score >= 70:
        risk = 'High Risk'
    elif score >= 40:
        risk = 'Medium Risk'
    else:
        risk = 'Low Risk'

    activity = []
    for log in logs[:4]:
        ts = log[0]
        if hasattr(ts, 'strftime'):
            ts = ts.strftime('%Y-%m-%d %H:%M:%S')
        msg = log[1] or "Unknown activity"
        activity.append(msg[:40] if len(msg) > 40 else msg)

    risk_factors = []
    all_messages = ' '.join([log[1] or '' for log in logs])
    if 'scan' in all_messages.lower() or 'port' in all_messages.lower():
        risk_factors.append('Known for port scanning activity')
    if 'login' in all_messages.lower() or 'auth' in all_messages.lower() or 'brute' in all_messages.lower():
        risk_factors.append('Multiple failed authentication attempts')
    if 'ddos' in all_messages.lower() or 'flood' in all_messages.lower():
        risk_factors.append('Unusual traffic patterns detected')
    if 'connection' in all_messages.lower() or 'syn' in all_messages.lower():
        risk_factors.append('High number of connection attempts')
    if not risk_factors:
        risk_factors.append('Activity detected but no specific risk factors')

    last_seen = logs[0][0] if logs else 'Never'
    if hasattr(last_seen, 'strftime'):
        last_seen = last_seen.strftime('%Y-%m-%d %H:%M:%S')

    return jsonify({
        'ip': ip,
        'score': score,
        'reputation': reputation,
        'badge': badge,
        'risk': risk,
        'total_threats': critical + high,
        'last_seen': last_seen,
        'is_blocked': blocked is not None,
        'blocked_reason': blocked[0] if blocked else None,
        'blocked_at': blocked[1] if blocked else None,
        'activity': activity,
        'risk_factors': risk_factors,
        'severity_counts': {
            'critical': critical,
            'high': high,
            'medium': medium,
            'low': low,
            'info': info
        }
    })

@app.route('/api/reports-stats')
def reports_stats():
    db = get_db()
    cursor = db.cursor()

    cursor.execute("SELECT COUNT(*) FROM logs WHERE severity IN ('HIGH', 'CRITICAL')")
    total_threats = cursor.fetchone()[0]

    cursor.execute("SELECT COUNT(*) FROM logs WHERE severity = 'CRITICAL'")
    critical = cursor.fetchone()[0]

    cursor.execute("SELECT COUNT(*) FROM blocked_ips")
    blocked_ips = cursor.fetchone()[0]

    cursor.execute("SELECT COUNT(*) FROM logs")
    total_logs = cursor.fetchone()[0]

    cursor.close()
    db.close()

    return jsonify({
        'total_threats': total_threats,
        'critical_threats': critical,
        'blocked_ips': blocked_ips,
        'total_logs': total_logs
    })

@app.route('/api/reports-threats-over-time')
def reports_threats_over_time():
    db = get_db()
    cursor = db.cursor()

    cursor.execute("""
        SELECT timestamp, severity 
        FROM logs 
        WHERE severity IN ('HIGH', 'CRITICAL')
        ORDER BY timestamp DESC
    """)
    logs = cursor.fetchall()
    cursor.close()
    db.close()

    daily = defaultdict(lambda: {'total': 0, 'critical': 0, 'high': 0})

    for ts, sev in logs:
        if hasattr(ts, 'strftime'):
            ts = ts.strftime('%Y-%m-%d %H:%M:%S')
        date_str = ts.split(' ')[0] if ' ' in ts else str(ts)[:10]
        daily[date_str]['total'] += 1
        if sev == 'CRITICAL':
            daily[date_str]['critical'] += 1
        elif sev == 'HIGH':
            daily[date_str]['high'] += 1

    dates = sorted(daily.keys(), reverse=True)[:8]
    dates.reverse()

    data = []
    for d in dates:
        data.append({
            'date': d,
            'total': daily[d]['total'],
            'critical': daily[d]['critical'],
            'high': daily[d]['high']
        })

    return jsonify(data)

@app.route('/api/reports-severity-distribution')
def reports_severity_distribution():
    db = get_db()
    cursor = db.cursor()

    cursor.execute("""
        SELECT severity, COUNT(*) 
        FROM logs 
        WHERE severity IN ('HIGH', 'CRITICAL', 'MEDIUM', 'LOW')
        GROUP BY severity
    """)
    results = cursor.fetchall()
    cursor.close()
    db.close()

    counts = {'Critical': 0, 'High': 0, 'Medium': 0, 'Low': 0}
    for sev, cnt in results:
        counts[sev.capitalize()] = cnt

    total = sum(counts.values())
    if total == 0:
        return jsonify({'total': 0, 'data': []})

    return jsonify({
        'total': total,
        'data': [
            {'name': 'Critical', 'count': counts['Critical'], 'pct': round(counts['Critical']/total*100, 1), 'color': '#e8364a'},
            {'name': 'High', 'count': counts['High'], 'pct': round(counts['High']/total*100, 1), 'color': '#f07030'},
            {'name': 'Medium', 'count': counts['Medium'], 'pct': round(counts['Medium']/total*100, 1), 'color': '#e0b830'},
            {'name': 'Low', 'count': counts['Low'], 'pct': round(counts['Low']/total*100, 1), 'color': '#4caf7d'}
        ]
    })

@app.route('/api/reports-threat-types')
def reports_threat_types():
    db = get_db()
    cursor = db.cursor()

    cursor.execute("SELECT message, COUNT(*) FROM logs WHERE severity IN ('HIGH', 'CRITICAL') GROUP BY message")
    results = cursor.fetchall()
    cursor.close()
    db.close()

    categories = {
        'Brute Force Attack': ['brute', 'force', 'login', 'password', 'auth', 'credential'],
        'Port Scan': ['scan', 'port', 'nmap', 'probe'],
        'DDoS Attack': ['ddos', 'flood', 'denial', 'overload', 'traffic spike'],
        'SQL Injection': ['sql', 'injection', 'query', 'database'],
        'Malware Detected': ['malware', 'virus', 'trojan', 'worm', 'infected']
    }

    type_counts = {name: 0 for name in categories}

    for msg, cnt in results:
        msg_lower = (msg or "").lower()
        matched = False
        for cat_name, keywords in categories.items():
            if any(kw in msg_lower for kw in keywords):
                type_counts[cat_name] += cnt
                matched = True
                break
        if not matched:
            type_counts['Brute Force Attack'] += cnt

    sorted_types = sorted(type_counts.items(), key=lambda x: x[1], reverse=True)
    total = sum(c for _, c in sorted_types) or 1

    data = []
    colors = ['#e8364a', '#f07030', '#e0b830', '#4caf7d', '#5b8ef0']
    for i, (name, count) in enumerate(sorted_types):
        data.append({
            'name': name,
            'count': count,
            'pct': round(count / total * 100, 1),
            'color': colors[i % len(colors)]
        })

    return jsonify(data)

@app.route('/api/reports-top-attackers')
def reports_top_attackers():
    db = get_db()
    cursor = db.cursor()

    cursor.execute("""
        SELECT source_ip, COUNT(*) as cnt
        FROM logs
        WHERE severity IN ('HIGH', 'CRITICAL') AND source_ip != '0.0.0.0'
        GROUP BY source_ip
        ORDER BY cnt DESC
        LIMIT 5
    """)
    results = cursor.fetchall()
    cursor.close()
    db.close()

    total = sum(r[1] for r in results) or 1

    return jsonify([{
        'ip': r[0],
        'count': r[1],
        'pct': round(r[1] / total * 100, 1)
    } for r in results])

@app.route('/api/reports-daily-summary')
def reports_daily_summary():
    db = get_db()
    cursor = db.cursor()

    cursor.execute("""
        SELECT timestamp, severity
        FROM logs
        WHERE severity IN ('HIGH', 'CRITICAL', 'MEDIUM', 'LOW')
        ORDER BY timestamp DESC
    """)
    logs = cursor.fetchall()
    cursor.close()
    db.close()

    daily = defaultdict(lambda: {'total': 0, 'critical': 0, 'high': 0, 'medium': 0, 'low': 0})

    for ts, sev in logs:
        if hasattr(ts, 'strftime'):
            ts = ts.strftime('%Y-%m-%d %H:%M:%S')
        date_str = ts.split(' ')[0] if ' ' in ts else str(ts)[:10]
        daily[date_str]['total'] += 1
        daily[date_str][sev.lower()] += 1

    dates = sorted(daily.keys(), reverse=True)[:8]

    data = []
    for d in dates:
        data.append({
            'date': d,
            'total': daily[d]['total'],
            'critical': daily[d]['critical'],
            'high': daily[d]['high'],
            'medium': daily[d]['medium'],
            'low': daily[d]['low']
        })

    return jsonify(data)

@app.route('/api/reports-insights')
def reports_insights():
    db = get_db()
    cursor = db.cursor()

    cursor.execute("SELECT COUNT(*) FROM logs WHERE severity = 'CRITICAL'")
    critical_count = cursor.fetchone()[0]

    cursor.execute("SELECT message, COUNT(*) FROM logs WHERE severity IN ('HIGH', 'CRITICAL') GROUP BY message ORDER BY COUNT(*) DESC LIMIT 1")
    top_msg = cursor.fetchone()

    cursor.execute("SELECT timestamp FROM logs WHERE severity IN ('HIGH', 'CRITICAL')")
    times = cursor.fetchall()

    cursor.close()
    db.close()

    insights = []

    if critical_count > 0:
        insights.append(f"Critical threats detected: {critical_count}. Immediate attention required.")
    else:
        insights.append("No critical threats detected. System is stable.")

    if top_msg:
        msg = top_msg[0] or "Unknown"
        if 'brute' in msg.lower() or 'login' in msg.lower():
            insights.append("Brute force attacks are the most common threat type.")
        elif 'scan' in msg.lower() or 'port' in msg.lower():
            insights.append("Port scanning is the most frequent threat activity.")
        elif 'ddos' in msg.lower() or 'flood' in msg.lower():
            insights.append("DDoS attacks are the primary threat concern.")
        else:
            insights.append(f"Most common threat pattern: {msg[:40]}...")

    if times:
        hours = []
        for t in times:
            ts = t[0]
            if hasattr(ts, 'strftime'):
                ts = ts.strftime('%Y-%m-%d %H:%M:%S')
            if ':' in ts:
                try:
                    h = int(ts.split(' ')[1].split(':')[0])
                    hours.append(h)
                except:
                    pass
        if hours:
            peak_hour = Counter(hours).most_common(1)[0][0]
            insights.append(f"Most attacks occur around {peak_hour:02d}:00 hour.")

    if critical_count > 10:
        insights.append("Consider updating firewall rules for better protection.")

    return jsonify(insights)

@app.route('/api/live-stats')
def live_stats():
    db = get_db()
    cursor = db.cursor()

    cursor.execute("SELECT COUNT(*) FROM logs")
    total_logs = cursor.fetchone()[0]

    cursor.execute("SELECT SUM(LENGTH(message)) FROM logs")
    total_bytes = cursor.fetchone()[0] or 0

    cursor.execute("SELECT COUNT(DISTINCT source_ip) FROM logs")
    active_conn = cursor.fetchone()[0]

    cursor.execute("SELECT COUNT(*) FROM logs WHERE message LIKE '%%TCP%%' OR message LIKE '%%connection%%' OR message LIKE '%%SYN%%' OR message LIKE '%%ACK%%'")
    tcp_conn = cursor.fetchone()[0]

    cursor.execute("SELECT COUNT(*) FROM logs WHERE message LIKE '%%UDP%%' OR message LIKE '%%DNS%%' OR message LIKE '%%ICMP%%'")
    udp_conn = cursor.fetchone()[0]

    cursor.close()
    db.close()

    return jsonify({
        'packets_per_sec': total_logs,
        'bytes_per_sec': round(total_bytes / 1024 / 1024, 2),
        'active_connections': active_conn,
        'tcp_connections': tcp_conn,
        'udp_connections': udp_conn
    })

@app.route('/api/live-traffic-graph')
def live_traffic_graph():
    db = get_db()
    cursor = db.cursor()

    cursor.execute("""
        SELECT timestamp, severity, source_ip, message 
        FROM logs 
        ORDER BY id DESC 
        LIMIT 30
    """)
    logs = cursor.fetchall()

    labels = []
    data = []
    severity_map = {'INFO': 1, 'LOW': 2, 'MEDIUM': 3, 'HIGH': 4, 'CRITICAL': 5}

    for log in reversed(logs):
        ts = log[0]
        if hasattr(ts, 'strftime'):
            ts = ts.strftime('%Y-%m-%d %H:%M:%S')
        if len(ts) > 8:
            ts = ts.split(' ')[1] if ' ' in ts else ts[-8:]
        labels.append(ts)
        data.append(severity_map.get(log[1], 0) * 100)

    while len(data) < 30:
        labels.insert(0, "00:00:00")
        data.insert(0, 0)

    cursor.close()
    db.close()

    return jsonify({'labels': labels[-30:], 'data': data[-30:]})

@app.route('/api/live-logs')
def live_logs():
    db = get_db()
    cursor = db.cursor()

    cursor.execute("""
        SELECT timestamp, source_ip, message, log_type, severity 
        FROM logs 
        ORDER BY id DESC 
        LIMIT 8
    """)
    logs = cursor.fetchall()

    logs_list = []
    for log in logs:
        ts = log[0]
        if hasattr(ts, 'strftime'):
            ts = ts.strftime('%Y-%m-%d %H:%M:%S')
        if len(ts) > 8:
            ts = ts.split(' ')[1] if ' ' in ts else ts[-8:]

        msg = log[2] or ""
        proto = "TCP"
        if "UDP" in msg.upper() or "DNS" in msg.upper():
            proto = "UDP"
        elif "ICMP" in msg.upper() or "ping" in msg.lower():
            proto = "ICMP"
        elif "HTTP" in msg.upper():
            proto = "HTTP"

        length = 40 + (hash(msg) % 1500) if msg else 0
        info = msg[:30] if len(msg) > 30 else msg
        if not info:
            info = log[4]

        ip_pattern = r'\b(?:[0-9]{1,3}\.){3}[0-9]{1,3}\b'
        ips = re.findall(ip_pattern, msg)
        dst_ip = ips[0] if ips else "192.168.1.1"

        logs_list.append({
            'time': ts,
            'source_ip': log[1] or "0.0.0.0",
            'dest_ip': dst_ip,
            'protocol': proto,
            'length': length,
            'info': info
        })

    cursor.close()
    db.close()

    return jsonify(logs_list)

@app.route('/api/live-top-talkers')
def live_top_talkers():
    db = get_db()
    cursor = db.cursor()

    cursor.execute("""
        SELECT source_ip, COUNT(*) as cnt, SUM(LENGTH(message)) as bytes
        FROM logs 
        WHERE source_ip != '0.0.0.0'
        GROUP BY source_ip 
        ORDER BY cnt DESC 
        LIMIT 5
    """)
    source_ips = cursor.fetchall()

    cursor.execute("""
        SELECT message, COUNT(*) as cnt
        FROM logs
        GROUP BY message
        ORDER BY cnt DESC
        LIMIT 20
    """)
    messages = cursor.fetchall()

    cursor.close()
    db.close()

    ip_pattern = r'\b(?:[0-9]{1,3}\.){3}[0-9]{1,3}\b'

    dst_counts = {}
    for msg, cnt in messages:
        ips = re.findall(ip_pattern, msg or "")
        for ip in ips:
            if ip not in [s[0] for s in source_ips] and ip != '0.0.0.0':
                dst_counts[ip] = dst_counts.get(ip, 0) + cnt

    top_dsts = sorted(dst_counts.items(), key=lambda x: x[1], reverse=True)[:5]

    src_data = [[ip, f"{cnt * 12} MB"] for ip, cnt, _ in source_ips]
    dst_data = [[ip, f"{cnt * 10} MB"] for ip, cnt in top_dsts]

    return jsonify({
        'source': src_data,
        'destination': dst_data
    })

@app.route('/api/live-protocols')
def live_protocols():
    db = get_db()
    cursor = db.cursor()

    cursor.execute("SELECT message, log_type FROM logs")
    all_logs = cursor.fetchall()
    cursor.close()
    db.close()

    tcp_count = 0
    udp_count = 0
    icmp_count = 0
    other_count = 0

    for msg, log_type in all_logs:
        msg = (msg or "").upper()
        lt = (log_type or "").upper()
        if "TCP" in msg or "SYN" in msg or "ACK" in msg or "HTTP" in msg or "CONNECTION" in lt:
            tcp_count += 1
        elif "UDP" in msg or "DNS" in msg:
            udp_count += 1
        elif "ICMP" in msg or "PING" in msg:
            icmp_count += 1
        else:
            other_count += 1

    total = tcp_count + udp_count + icmp_count + other_count
    if total == 0:
        return jsonify({'tcp': 0, 'udp': 0, 'icmp': 0, 'other': 0})

    return jsonify({
        'tcp': round(tcp_count / total * 100, 1),
        'udp': round(udp_count / total * 100, 1),
        'icmp': round(icmp_count / total * 100, 1),
        'other': round(other_count / total * 100, 1)
    })

@app.route('/api/live-severity-chart')
def live_severity_chart():
    db = get_db()
    cursor = db.cursor()

    cursor.execute("""
        SELECT severity, COUNT(*) 
        FROM logs 
        GROUP BY severity
    """)
    results = cursor.fetchall()
    cursor.close()
    db.close()

    counts = {'INFO': 0, 'LOW': 0, 'MEDIUM': 0, 'HIGH': 0, 'CRITICAL': 0}
    for sev, cnt in results:
        counts[sev.upper()] = cnt

    total = sum(counts.values())
    if total == 0:
        return jsonify({'data': [0] * 20})

    data = []
    for _ in range(20):
        weights = [counts['INFO']/total, counts['LOW']/total, counts['MEDIUM']/total, 
                   counts['HIGH']/total, counts['CRITICAL']/total]
        val = random.choices([1,2,3,4,5], weights=weights)[0]
        data.append(val * 15 + random.randint(-5, 5))

    return jsonify({'data': data})

@app.route('/livemonitor')
def livemonitor():
    return render_template('livemonitor.html')

@app.route('/alerts', methods=['GET', 'POST'])
def alerts():
    return render_template('alerts.html')

@app.route('/threats')
def threats():
    return render_template('threats.html')

@app.route('/logs')
def logs():
    db = get_db()
    cursor = db.cursor()
    cursor.execute("SELECT * FROM logs ORDER BY timestamp DESC")
    logs = cursor.fetchall()
    cursor.close()
    db.close()
    return render_template('logs.html', logs=logs)

@app.route('/reports')
def reports():
    return render_template('reports.html')

@app.route('/ipanalysis')
def ipanalysis():
    return render_template('ipanalysis.html')

@app.route('/api/logs')
def api_logs():
    db = get_db()
    cursor = db.cursor()
    cursor.execute("SELECT * FROM logs ORDER BY timestamp DESC")
    logs = cursor.fetchall()
    cursor.close()
    db.close()

    logs_list = []
    for log in logs:
        logs_list.append({
            'id':   log[0],
            'time': log[1],
            'type': log[2],
            'msg':  log[3],
            'src':  log[4],
            'sev':  log[5]
        })
    return jsonify(logs_list)

@app.route('/backend/logs', methods=['POST'])
def receive_logs():
    data = request.json

    if not data:
        return jsonify({"status": "error", "message": "No JSON data received"}), 400

    timestamp = data.get('timestamp', str(datetime.now()))
    log_type  = data.get('log_type', 'Network')
    message   = data.get('message', 'Unknown')
    source_ip = data.get('source_ip', '0.0.0.0')
    severity  = data.get('severity', 'INFO')

    try:
        db = get_db()
        cursor = db.cursor()
        cursor.execute("""
            INSERT INTO logs (timestamp, log_type, message, source_ip, severity)
            VALUES (%s, %s, %s, %s, %s)
        """, (timestamp, log_type, message, source_ip, severity))
        db.commit()
        cursor.close()
        db.close()
    except Exception as e:
        print(f"DB Error: {e}")
        return jsonify({"status": "error", "message": str(e)}), 500

    if severity in ("CRITICAL", "HIGH"):
        try:
            send_alert(f"[{severity}] {message} from {source_ip}")
        except Exception as e:
            print(f"Alert failed (log still saved): {e}")

    return jsonify({"status": "success"}), 200

@app.route('/static/imgs/<path:filename>')
def serve_images(filename):
    return send_from_directory('static/imgs', filename)

@app.errorhandler(404)
def not_found(e):
    return render_template('landing.html'), 404

@app.errorhandler(500)
def server_error(e):
    return jsonify({"status": "error", "message": str(e)}), 500

if __name__ == '__main__':
    app.run()
