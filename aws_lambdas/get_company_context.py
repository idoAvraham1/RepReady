import json
import os
import urllib.request
import urllib.parse


def lambda_handler(event, context):
    try:
        api_key      = os.environ["TAVILY_API_KEY"]
        parameters   = event.get("parameters", [])
        company_name = next(
            (p["value"] for p in parameters if p["name"] == "company_name"),
            None
        )

        if not company_name:
            return {
                "messageVersion": "1.0",
                "response": {
                    "actionGroup": event.get("actionGroup", ""),
                    "function":    event.get("function", ""),
                    "functionResponse": {
                        "responseBody": {
                            "TEXT": {
                                "body": json.dumps({"error": "company_name is required"})
                            }
                        }
                    }
                }
            }

        query   = f"{company_name} company overview funding industry size recent news"
        payload = json.dumps({
            "api_key":        api_key,
            "query":          query,
            "search_depth":   "basic",
            "max_results":    5,
            "include_answer": True,
        }).encode("utf-8")

        req = urllib.request.Request(
            "https://api.tavily.com/search",
            data=payload,
            headers={"Content-Type": "application/json"},
            method="POST",
        )

        with urllib.request.urlopen(req, timeout=8) as response:
            data    = json.loads(response.read())
            answer  = data.get("answer", "No summary available")
            results = data.get("results", [])
            sources = [
                {"title": r.get("title", ""), "url": r.get("url", "")}
                for r in results[:3]
            ]

        result = {
            "company": company_name,
            "summary": answer,
            "sources": sources,
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
                            "body": json.dumps({"error": str(e), "summary": "Could not retrieve company context."})
                        }
                    }
                }
            }
        }