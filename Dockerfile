FROM python:3.12-slim

WORKDIR /app

# FFmpeg/ffprobe são binários de sistema, não vêm pelo pip — o módulo do
# João depende deles estarem no PATH (shutil.which("ffmpeg")).
RUN apt-get update && \
    apt-get install -y --no-install-recommends ffmpeg && \
    rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

CMD ["celery", "-A", "app.queue.celery_app", "worker", "--loglevel=info"]