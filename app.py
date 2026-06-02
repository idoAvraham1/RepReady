import os
import json
import traceback
from dotenv import load_dotenv
from flask import Flask, render_template, request, Response, stream_with_context

load_dotenv()

from services.retrieval_service import retrieve_chunks
from services.generation_service import generate_stream
from services.gap_service import check_and_log_gap

app = Flask(__name__)


@app.route("/")
def index():
    return render_template("index.html")


@app.route("/chat", methods=["POST"])
def chat():
    data = request.get_json()
    question = (data.get("question") or "").strip()
    selected_product = (data.get("product"))
    if not question:
        return {"error": "Empty question"}, 400

    try:
        chunks = retrieve_chunks(question, selected_product)
    except Exception as e:
        print(f"\n[RepReady ERROR] retrieve_chunks failed:\n{traceback.format_exc()}")
        return {"error": "Retrieval failed", "detail": str(e)}, 500

    check_and_log_gap(question, chunks)
    sources = list(dict.fromkeys(c["source"] for c in chunks))

    def event_stream():
        try:
            yield f"event: sources\ndata: {json.dumps(sources)}\n\n"
            for token in generate_stream(question, chunks):
                escaped = token.replace("\n", "\\n")
                yield f"data: {escaped}\n\n"
            yield "data: [DONE]\n\n"
        except Exception as e:
            print(f"\n[RepReady ERROR] event_stream failed:\n{traceback.format_exc()}")
            yield "data: [DONE]\n\n"

    return Response(
        stream_with_context(event_stream()),
        mimetype="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
            "Connection": "keep-alive",
        },
    )


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=False, threaded=True)
