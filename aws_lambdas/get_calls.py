import json
import os
import urllib.request
import urllib.parse
from datetime import datetime, timezone


def lambda_handler(event, context):
    try:
        api_key     = os.environ["GOOGLE_API_KEY"]
        calendar_id = os.environ["CALENDAR_ID"]

        now          = datetime.now(timezone.utc)
        start_of_day = now.replace(hour=0,  minute=0,  second=0,  microsecond=0).isoformat()
        end_of_day   = now.replace(hour=23, minute=59, second=59, microsecond=0).isoformat()

        url = (
            "https://www.googleapis.com/calendar/v3/calendars/"
            + urllib.parse.quote(calendar_id, safe="")
            + "/events"
            + "?key=" + api_key
            + "&timeMin=" + urllib.parse.quote(start_of_day, safe="")
            + "&timeMax=" + urllib.parse.quote(end_of_day, safe="")
            + "&singleEvents=true"
            + "&orderBy=startTime"
        )

        req = urllib.request.Request(url, method="GET")
        with urllib.request.urlopen(req, timeout=8) as response:
            data  = json.loads(response.read())
            items = data.get("items", [])

        calls = []
        for item in items:
            start = item.get("start", {}).get("dateTime", "")
            if not start:
                continue

            time_str     = datetime.fromisoformat(start).strftime("%H:%M")
            summary      = item.get("summary", "Unknown")
            parts        = summary.split("—")
            contact_name = parts[0].strip() if len(parts) > 0 else summary
            company_name = parts[1].strip() if len(parts) > 1 else ""

            calls.append({
                "time":         time_str,
                "contact_name": contact_name,
                "company_name": company_name,
                "event_id":     item.get("id", ""),
            })

        result = {
            "calls": calls,
            "date":  now.strftime("%A, %B %d"),
        }

        return {
            "messageVersion": "1.0",
            "response": {
                "actionGroup": event.get("actionGroup", ""),
                "function":    event.get("function", ""),
                "functionResponse": {
                    "responseBody": {
                        "TEXT": {
                            "body": json.dumps(result)
                        }
                    }
                }
            }
        }

    except Exception as e:
        return {
            "messageVersion": "1.0",
            "response": {
                "actionGroup": event.get("actionGroup", ""),
                "function":    event.get("function", ""),
                "functionResponse": {
                    "responseBody": {
                        "TEXT": {
                            "body": json.dumps({"error": str(e), "calls": []})
                        }
                    }
                }
            }
        }