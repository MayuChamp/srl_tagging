FROM python:3.9-slim

# Install system dependencies (ffmpeg is required for audio extraction)
RUN apt-get update && \
    apt-get install -y ffmpeg && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy the rest of the application code
COPY . .

# Start the continuous polling service
CMD ["python", "worker.py"]
