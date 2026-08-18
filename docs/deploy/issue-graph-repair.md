# Issue Graph Repair: Re-homing #198 to Jules Lane

## Summary

Issue #198 was previously filed on the `tbay-agent` lane, which has no active reader. Because #198 represents the container build definition and is a critical blocker for the entire mission, it has been retired and re-filed on the `jules` lane as issue #220.

## Repair Details

### 1. New Jules-Lane Issue (Chunk 1/11 Vehicle)
- **Issue Number**: #220
- **Lane**: `jules`
- **Title**: [Chunk 1/11] Container Build Definition
- **Scope**: Container build definition for application deployment.
- **Constraints**: Strictly limited to container build definition (excludes CI, infrastructure, or README work).
- **URL**: `https://github.com/awfmilton/scorched-earth/issues/220`

### 2. Closure of Legacy Issue #198
- **Retired Issue**: #198
- **Closure Status**: Closed
- **Closure Note**: The `tbay-agent` lane has no reader. Superseded by jules-lane issue #220.
- **Cross-link**: #220
- **Closure Link**: `https://github.com/awfmilton/scorched-earth/issues/198`

## Dependency Graph Mapping

The dependency graph is updated to remove all dependencies on closed issue #198 and re-home them onto #220. Downstream tasks (specifically Chunk 1/11 and Chunk 7/11) read the container issue vehicle number (#220) on the `jules` lane from this file.

- **Chunk 1/11**: Consumes issue #220 (`jules` lane)
- **Chunk 7/11**: Consumes issue #220 (`jules` lane)
