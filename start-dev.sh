#!/usr/bin/env bash
set -euo pipefail

( cd api && python -m uvicorn main:app --reload --host 0.0.0.0 --port 8000 ) &
API_PID=$!

( cd web && npm run dev -- --host 0.0.0.0 --port 5173 ) &
WEB_PID=$!

trap "kill $API_PID $WEB_PID" EXIT
wait
