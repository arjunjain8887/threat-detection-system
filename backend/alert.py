import requests

BOT_TOKEN = "8225411732:AAH-Ppvuzz1ko0jRPZvj3s8-CX84yFab1nQ"
CHAT_ID = "8645449557"

def send_alert(message):
    url = f"https://api.telegram.org/bot{BOT_TOKEN}/sendMessage"
    data = {
        "chat_id": CHAT_ID,
        "text": message
    }

    response = requests.post(url, data=data)
    print(response.status_code)
    print(response.json())