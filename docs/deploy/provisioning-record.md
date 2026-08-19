# Provisioning Record

## Resource Details
- **Resource ID:** `res-49636e283fb5`
- **Source Commit SHA:** `4e545bbb595a33ccbcdee5e3749cde796d3c6499`
- **Subdomain Binding:** `scorched-earth.kodex.tbay.tk`

## Build Log Outcome
- **Status:** Success
- **Details:** Build produced image from post-Dockerfile head commit `4e545bbb595a33ccbcdee5e3749cde796d3c6499` (containing Chunk 1/11 Dockerfile and `.dockerignore`). Image build was executed and not skipped.

## Platform Port Contract
- **Observed Contract:** The platform app-host lane injects the `PORT` environment variable at container execution time.
- **Application Configuration:** `server.js` binds to `process.env.PORT || 8080`. The Dockerfile exposes port `8080` as the default fallback. No fixed non-8080 port requirement was observed.
