# ADR-009: WebSocket as separate mini-service

**Status:** Accepted

## Context

Real-time notifications need a persistent WebSocket connection. Options:
1. **WebSocket in the Next.js app**: Use a custom server (breaks standalone deployment)
2. **Separate WebSocket service**: Socket.IO mini-service on port 3003
3. **Server-Sent Events (SSE)**: Simpler, but unidirectional and limited connections

## Decision

Run a **separate Socket.IO mini-service** on port 3003:
- JWT-authenticated connections (verifies NextAuth token)
- Tenant + user rooms for targeted delivery
- HTTP `/notify` endpoint for the main app to push events
- Graceful fallback: if WS service is down, client polls every 30s

## Consequences

### Positive
- Next.js app stays in standalone mode (no custom server)
- WS service can be scaled independently
- Socket.IO provides reconnection, heartbeat, room management out of the box
- Fallback to polling ensures UI works even if WS is down

### Negative
- Two processes to manage (app + WS service)
- JWT verification is duplicated (must match NextAuth's signing logic)
- In-memory connection registry doesn't work across multiple WS instances (need Redis adapter for scaling)

## Scaling

For multi-instance WS:
- Add `@socket.io/redis-adapter` for pub/sub across instances
- Or run a single WS instance (sufficient for most tenants)

## Alternatives considered

- **Custom Next.js server**: Breaks `next build` standalone output, complicates Docker
- **SSE**: Unidirectional only, limited to 6 connections per browser
- **Pusher/Ably**: Managed, but adds external dependency and cost
- **Long polling only**: Simpler, but higher latency and more server load
