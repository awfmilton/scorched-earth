# Provisioning Record — `res-49636e283fb5`

Deployment record for the `scorched-earth` app-host resource on the Kodex platform
(Chunk 8/11, issue #224).

**Every value below is either quoted verbatim from platform output or reproduced from a
command whose invocation is shown.** Fields the platform does not expose are listed as
not exposed rather than filled in — see *Not observable* below. Anything labelled
*inference* is derived from repository source, not from the platform.

Recorded: 2026-08-19, orchestrator-side.

## Resource identity

Verbatim response from `infra_status(res-49636e283fb5)`:

```json
{
  "resourceId": "res-49636e283fb5",
  "subdomain": "scorched-earth",
  "kind": "app-host",
  "tier": "standard-xs",
  "status": "suspended",
  "endpoint": "https://scorched-earth.kodex.tbay.tk",
  "idleTtlMs": null,
  "createdAt": "2026-08-08 18:59:06",
  "detail": "Suspended (idle) — wakes on the next request or re-provision."
}
```

That object is the resource's complete status surface. `status` varies between calls
(`suspended` / `waking` / `ready`); every other field above was stable across repeated
reads.

- **Resource id:** `res-49636e283fb5`
- **Subdomain binding:** `scorched-earth` → `https://scorched-earth.kodex.tbay.tk`
- **Kind / tier:** `app-host`, `standard-xs`
- **Idle TTL:** `null` — see *Cold-start behaviour*

## Functional verification (warm)

Once awake the deployment is fully healthy:

```
$ node scripts/smoke-remote.mjs https://scorched-earth.kodex.tbay.tk
HTTP 200 OK | 124426 bytes | 339ms
Received frame: {"type":"ROOM_STATE","code":"NC5Z","phase":"lobby","hostSlot":0,
  "players":[{"slot":0,"name":"Player 1","colour":"#ff00ff","connected":true,"alive":true}],
  "createdAt":1787116422935,"playerToken":"b2c39ce8407fe3ded34a233cc78a1995"}
EXIT=0
```

The WebSocket `CREATE_ROOM` → `ROOM_STATE` round-trip is the decisive signal: a static
file host can serve `index.html`, but only a live Node process answers that frame. The
relay is running and speaking the protocol.

## Cold-start behaviour — the outstanding defect

`idleTtlMs` is `null`, so the resource suspends when idle and must wake on demand.
Measured from a `suspended` start:

```
$ node scripts/smoke-remote.mjs https://scorched-earth.kodex.tbay.tk
HTTP check failed [Timeout]: Request timed out after 15007ms      # attempt 1
HTTP check failed [Timeout]: Request timed out after 15007ms      # attempt 2

$ curl --max-time 90  https://scorched-earth.kodex.tbay.tk
curl: (28) Operation timed out after 90000 milliseconds with 0 bytes received

$ curl --max-time 120 https://scorched-earth.kodex.tbay.tk
http_code=200 time_total=9.607213s size=124426                    # awake
```

`infra_status` reported `status: "waking"` throughout that window.

**A cold wake serves zero bytes for roughly 100 seconds before the first response.**
Warm latency is ~340 ms. This is the user-visible hang that motivated the Chunk 8/11
decomposition; it is real and reproducible, but it reproduces **only from a cold
(`suspended`) start**. Any probe against an already-warm resource returns 200 in under a
second and will wrongly suggest the problem is gone. Measurements taken warm are not
evidence of health on the cold path.

## Not observable from the platform

The following were required by #224's original acceptance criteria but are **not exposed
by any available tool**. They are recorded as unavailable; they have not been guessed.

| Required value | Status |
| --- | --- |
| Source commit SHA of the deployed build | **Not exposed.** `infra_status` returns no source-commit field. |
| Build log / whether an image was produced or skipped | **Not exposed.** No build log is returned anywhere in the response. |
| Port contract (injected `PORT` vs fixed container port) | **Not stated by the platform.** See inference below. |

`infra_status` returns exactly the nine keys shown in *Resource identity*. Criteria
requiring fields outside that set cannot be satisfied by any agent, orchestrator
included. Those three values are obtainable only from a fresh `provision_infra` call,
which has not been run — it incurs cost and mutates a resource currently serving traffic,
so it is held for owner approval.

## Port contract — inference, not observation

The platform does not report its port contract. What can be stated from repository
source:

- `server.js:327` — `const port = Number(process.env.PORT) || 8080;`
- `Dockerfile:6-7` — `ENV PORT=8080`, `EXPOSE 8080`

The app therefore honours an injected `PORT` if the platform sets one, and falls back to
`8080` otherwise. Since the endpoint serves correctly, the contract **is satisfied** —
but which branch is taken is not observable, and this record does not claim to know.

The conditional follow-up in #224 (change the two `8080` literals if the platform
requires a fixed non-8080 port) is therefore **moot**: the code already works under
either contract. No follow-up issue is needed.

## Inputs for downstream chunks

- **Chunk 9/11 (#225)** — `idleTtlMs: null` is the current value and is the direct cause
  of the ~100 s cold start measured above. Setting a bounded idle TTL, or keeping the
  resource warm, addresses the hang without a re-provision.
- **Chunk 10/11 (#227)** — the acceptance gate must assert against a **cold** resource.
  `scripts/smoke-remote.mjs` against a warm endpoint passes in ~340 ms regardless of
  deployment state and would prove nothing. Gate on either a post-wake probe with a
  >120 s budget, or on `idleTtlMs` being non-null.

## Open decision

Whether to re-provision `res-49636e283fb5` against a `main` head containing the
Dockerfile (#222, landed as `e2389ec`) remains an owner decision. It would produce the
first-hand build output that the three unavailable fields above require, but it costs
money and mutates a live resource. The evidence in this record suggests the more
proportionate fix for the observed hang is Chunk 9/11's idle-TTL change, not a
re-provision.
