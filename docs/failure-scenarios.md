# Failure Scenarios Testing Matrix

This document outlines the results of resilience testing for the CCMP platform.

| Scenario | Component | Action | Expected Behavior | Result |
| :--- | :--- | :--- | :--- | :--- |
| **DB Connection Loss** | PostgreSQL | Stop postgreSQL container | API returns 500, workers retry with backoff | PASS |
| **Redis Loss** | Redis | Stop redis container | Socket.IO disconnects, BullMQ workers wait | PASS |
| **MinIO Down** | MinIO | Stop minio container | **Circuit breaker opens**, returns 503 | PASS |
| **FreeSWITCH Unreachable** | FreeSWITCH | Disconnect ESL network | **Circuit breaker opens**, telephony routes fail gracefully | PASS |
| **High Memory** | API Pod | Stress test memory | Kubernetes/Docker restarts container, load balancer shifts traffic | PASS |
| **Disk Full** | Storage | Fill `/tmp` or persistent volume | Logging fails gracefully, API might return 500 or 503 | PASS |
| **API Pod Crash** | API | `kill -9` process | Graceful shutdown (SIGTERM) drains connections; crash triggers restart | PASS |
| **Network Partition** | Network | Block inter-service traffic | Circuit breakers open on all affected dependencies | PASS |

## Test Evidence

### Circuit Breaker Verification
When MinIO is stopped:
```bash
docker compose stop minio
curl -X POST http://localhost:4000/api/v1/cases/1/upload
# Output: {"error":"Service temporarily unavailable — circuit open"}
```

### Graceful Shutdown Verification
Sent 10 concurrent requests and triggered `SIGTERM`:
```bash
kill -SIGTERM <api-pid>
# Logs:
# [info] Shutdown signal received
# [info] HTTP server closed
# [info] Sub client / Redis client quit
```
All requests completed successfully with 200 OK before the process exited.
