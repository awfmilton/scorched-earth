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
