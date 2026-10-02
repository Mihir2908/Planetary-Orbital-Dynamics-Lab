#!/bin/bash
# idle_shutdown.sh — runs as a cron job on the EC2 host (not inside Docker).
# Shuts down the instance after IDLE_HOURS of no inference traffic to port 8001.
#
# Install on EC2:
#   sudo cp idle_shutdown.sh /opt/idle_shutdown.sh
#   sudo chmod +x /opt/idle_shutdown.sh
#   echo "*/5 * * * * root /opt/idle_shutdown.sh" | sudo tee /etc/cron.d/exomoon-idle-shutdown
#
# The hnn_gpu_service.py /last_request_time endpoint returns:
#   {"last_request_ts": <unix_timestamp>}
# A value of 0.0 means no requests since the container started.

IDLE_HOURS=5
THRESHOLD_S=$(( IDLE_HOURS * 3600 ))
LOG=/var/log/idle_shutdown.log

# Fetch last request timestamp from the running Docker container
LAST_TS=$(curl -sf --max-time 5 http://localhost:8001/last_request_time 2>/dev/null \
    | python3 -c "import sys, json; d=json.load(sys.stdin); print(int(d.get('last_request_ts',0)))" 2>/dev/null)

if [ -z "$LAST_TS" ]; then
    # Container not responding — could be still starting; skip this cycle
    echo "$(date -Iseconds): container not reachable — skipping" >> "$LOG"
    exit 0
fi

if [ "$LAST_TS" -eq 0 ]; then
    # No requests ever received; use container start time via Docker inspect as proxy
    START_TS=$(docker inspect --format '{{.State.StartedAt}}' \
        $(docker ps -q --filter "publish=8001") 2>/dev/null \
        | python3 -c "import sys, datetime; t=sys.stdin.read().strip(); \
            print(int(datetime.datetime.fromisoformat(t.rstrip('Z')).replace(tzinfo=datetime.timezone.utc).timestamp()))" 2>/dev/null)
    LAST_TS=${START_TS:-0}
fi

NOW=$(date +%s)
IDLE_S=$(( NOW - LAST_TS ))

if [ "$IDLE_S" -gt "$THRESHOLD_S" ]; then
    echo "$(date -Iseconds): idle ${IDLE_S}s > ${THRESHOLD_S}s threshold — shutting down" >> "$LOG"
    sudo shutdown -h now
else
    # Uncomment for verbose logging:
    # echo "$(date -Iseconds): idle ${IDLE_S}s / ${THRESHOLD_S}s — active" >> "$LOG"
    :
fi
