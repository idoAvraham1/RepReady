FROM python:3.11-slim

WORKDIR /app

# Install dependencies first (layer-cached)
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY . .

EXPOSE 5000

ENV PYTHONUNBUFFERED=1 \
    FLASK_ENV=production

# AWS + Bedrock credentials passed at runtime via environment variables:
#   AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_REGION, BEDROCK_KB_ID
#   Optional: BEDROCK_MODEL_ID (defaults to us.anthropic.claude-haiku-4-5-20250101:0)

CMD ["python", "app.py"]
