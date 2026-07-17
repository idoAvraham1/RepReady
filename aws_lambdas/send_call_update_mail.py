import json
import os
import urllib.request
import urllib.error

RESEND_API_KEY  = os.environ["RESEND_API_KEY"]
TEAM_LEAD_EMAIL = os.environ["TEAM_LEAD_EMAIL"]
FROM_EMAIL      = os.environ["FROM_EMAIL"]

def lambda_handler(event, context):
    print("EVENT:", json.dumps(event))

    action_group   = event.get("actionGroup", "")
    function_name  = event.get("function", "")

    # Fix 1 — correct parameter parsing
    params = {p["name"]: p["value"] for p in event.get("parameters", [])}

    prospect_name = params.get("prospect_name") or "Unknown Prospect"
    company       = params.get("company")       or "Unknown Company"
    outcome       = params.get("outcome")       or "open"
    summary       = params.get("summary")       or ""

    outcome_label = {
        "won":       "🟢 Won",
        "lost":      "🔴 Lost",
        "follow-up": "🟡 Follow-up",
        "open":      "⚪ Open",
    }.get(outcome, "⚪ Open")

    subject = f"[RepReady] {prospect_name} @ {company} — {outcome_label}"

    html_body = f"""
    <div style="font-family:sans-serif;max-width:580px;margin:0 auto;color:#333">
      <h2 style="color:#6366f1;margin-bottom:4px">Call Update</h2>
      <p style="color:#888;margin-top:0">{prospect_name} · {company} · {outcome_label}</p>
      <hr style="border:none;border-top:1px solid #eee;margin:16px 0"/>
      <p style="line-height:1.7">{summary}</p>
      <hr style="border:none;border-top:1px solid #eee;margin:16px 0"/>
      <p style="color:#bbb;font-size:11px">Sent via RepReady</p>
    </div>
    """

    payload = json.dumps({
        "from":    FROM_EMAIL,
        "to":      [TEAM_LEAD_EMAIL],
        "subject": subject,
        "html":    html_body,
    }).encode("utf-8")

    req = urllib.request.Request(
        "https://api.resend.com/emails",
        data=payload,
        headers={
            "Authorization": f"Bearer {RESEND_API_KEY}",
            "Content-Type":  "application/json",
            # Fix 3 — bypass Cloudflare block on Lambda IPs
            "User-Agent":    "Mozilla/5.0 (compatible; RepReady/1.0)",
        },
        method="POST",
    )

    def build_response(status_code, body_dict):
        # Fix 2 — correct response format for function-type action group
        return {
            "messageVersion": "1.0",
            "response": {
                "actionGroup": action_group,
                "function":    function_name,
                "functionResponse": {
                    "responseBody": {
                        "TEXT": {
                            "body": json.dumps(body_dict)
                        }
                    }
                }
            }
        }

    try:
        with urllib.request.urlopen(req) as resp:
            result = json.loads(resp.read())
            print("RESEND SUCCESS:", result)
            return build_response(200, {
                "status":   "sent",
                "email_id": result.get("id", ""),
            })

    except urllib.error.HTTPError as e:
        error_msg = e.read().decode("utf-8")
        print("RESEND ERROR:", error_msg)
        return build_response(e.code, {
            "status":  "error",
            "message": error_msg,
        })