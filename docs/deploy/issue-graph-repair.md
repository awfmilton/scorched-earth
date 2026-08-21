# Issue Graph Repair: Re-homing #198 to Jules Lane

## Summary

Issue #198 was previously filed on the `tbay-agent` lane, which has no active reader. Because #198 represents the container build definition and is a critical blocker for the entire mission, it has been retired and re-filed on the `jules` lane as issue #222.

## Repair Details

### 1. New Jules-Lane Issue (Chunk 1/11 Vehicle)
- **Issue Number**: #222
- **Lane**: `jules`
- **Title**: [Agent] [Chunk 1/11] Add the container build definition so the relay produces a runnable image
- **Scope**: Container build definition for application deployment.
- **Constraints**: Strictly limited to container build definition (excludes CI, infrastructure, or README work).
- **URL**: `https://github.com/awfmilton/scorched-earth/issues/222`

### 2. Closure of Legacy Issue #198
- **Retired Issue**: #198
- **Closure Status**: Closed as `not planned`
- **Closure Note**: The `tbay-agent` lane has no reader. Superseded by jules-lane issue #222.
- **Cross-link**: #222
- **Closure Link**: `https://github.com/awfmilton/scorched-earth/issues/198#issuecomment-5335272651`

## Dependency Graph Mapping

This file records the mapping from retired issue #198 to its jules-lane replacement #222. It does not itself edit any dependency edges — open issues that still reference #198 are repointed by their own chunks. In particular, repointing #213's blocker list is Chunk 7/11's job (#232), which is blocked on this chunk and reads the vehicle number below.

- **Chunk 1/11**: Consumes issue #222 (`jules` lane)
- **Chunk 7/11**: Consumes issue #222 (`jules` lane)

---

# Issue Graph Repair: Retiring #199 in Favor of Dependency-Free Smoke Script #226

## Summary

Issue #199 was blocked on #189, which was closed as `wont-fix` as a deliberate decision. To avoid reviving rejected work purely to satisfy a stale dependency edge while retaining the essential remote smoke test, issue #199 was retired and replaced by issue #226 on the `jules` lane without any dependency on #189.

## Repair Details

### 1. New Jules-Lane Issue (Chunk 3/11 Vehicle)
- **Issue Number**: #226
- **Lane**: `jules`
- **Title**: [Agent] [Chunk 3/11] Add scripts/smoke-remote.mjs as a remote check that fails when the URL is dead
- **Scope**: Dependency-free remote smoke script (`scripts/smoke-remote.mjs`).
- **Constraints**: Re-filed without dependency on #189; #189 remains `wont-fix`.
- **URL**: `https://github.com/awfmilton/scorched-earth/issues/226`

### 2. Closure of Legacy Issue #199
- **Retired Issue**: #199
- **Closure Status**: Closed as `not planned`
- **Closure Note**: Blocked on #189 (which remains closed `wont-fix`). Superseded by jules-lane issue #226 without dependency on #189.
- **Cross-link**: #226
- **Closure Link**: `https://github.com/awfmilton/scorched-earth/issues/199#issuecomment-5336618775`

## Dependency Graph Mapping

This section records the mapping from retired issue #199 to its jules-lane replacement #226.

- **Chunk 3/11**: Consumes issue #226 (`jules` lane)
- **Chunk 7/11**: Consumes issue #226 (`jules` lane)

---

# Issue Graph Repair: Updating #213 References and Evidence-Bar Assessment

## Summary

Issue #213 previously referenced retired issues #198 and #199 in its body prose, used an incorrect filename (`scripts/remote-smoke.mjs`), claimed `scripts/` only contained `jules-monitor.sh`, and cited an outdated line number for `README.md`. These prose references have been updated to reflect the current state on `main` following Chunks 5/11 (#230) and 6/11 (#231).

Additionally, an evidence-bar mismatch was identified and recorded regarding #213's step 3 requirement for two-client remote smoke execution.

## Repair & Reference Details

### 1. Blocker List
- **Blocker List**: `#208`, `#211`, `#212` (unchanged).
- All three blockers are `CLOSED/COMPLETED`. No blocker edges were added or removed.

### 2. Corrected Body Prose References
- **Step 1 Container Reference**: Updated from legacy #198 to completed issue #222 (`jules` lane). Noted that the container build definition landed on `main` via PRs #235 and #238.
- **Step 3 Remote Smoke Reference**:
  - Updated filename to `scripts/smoke-remote.mjs` (correct word order).
  - Updated issue reference from legacy #199 to completed issue #226 (`jules` lane).
  - Removed outdated claim that `scripts/smoke-remote.mjs` does not exist and that `scripts/` contains only `jules-monitor.sh` (tracked `scripts/` on `main` contains `smoke-remote.mjs`).
- **README Placeholder Line Reference**: Updated `_(pending deploy)_` line reference from `README.md:106` to `README.md:119`.

### 3. Evidence-Bar Mismatch Record
- **Issue Description**: #213 step 3 requires the remote smoke run to exit 0 "on a declared winner" and to compare `ROUND_START` seed/wind plus both clients' `FIRE_SYNC` `vx`/`vy` between two clients.
- **Current Main Implementation**: `scripts/smoke-remote.mjs` (shipped in #226) is a single-connection probe verifying HTTP 200, WebSocket upgrade on the root path, and a single `CREATE_ROOM` -> `ROOM_STATE` round-trip. It opens no second client, produces no `FIRE_SYNC`, and declares no winner. Two-client capabilities were tied to #189, which was closed `wont-fix`.
- **Status & Scope Decision**:
  - No changes were made to weaken #213's criteria, nor were smoke script exit conditions/timeouts relaxed.
  - The mismatch is recorded with two potential options for orchestrator evaluation:
    1. Accept single-client protocol evidence for Ship 6/6.
    2. File new work for two-client remote smoke evidence.
