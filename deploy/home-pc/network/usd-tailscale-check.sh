#!/bin/bash

/usr/bin/tailscale status --json | /usr/bin/python3 -c '
import json, sys
try:
    d = json.load(sys.stdin)
    health = " ".join(d.get("Health") or []).lower()
    healthy = (
        d.get("BackendState") == "Running"
        and (d.get("Self") or {}).get("Online") is not False
        and "network map" not in health
        and "coordination server" not in health
    )
    sys.exit(0 if healthy else 1)
except Exception:
    sys.exit(1)
'

if [ $? -ne 0 ]; then
    logger -t usd-tailscale "Connection unhealthy; restarting tailscaled"
    /usr/bin/systemctl restart tailscaled
fi
