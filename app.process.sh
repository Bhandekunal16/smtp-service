node index.js &
BACKEND_PID=$!

node proxy.js &
PROXY_PID=$!

wait -n

kill "$BACKEND_PID" "$PROXY_PID" 2>/dev/null