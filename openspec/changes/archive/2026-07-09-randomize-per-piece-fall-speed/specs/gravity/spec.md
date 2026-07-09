## ADDED Requirements

### Requirement: Level-based base drop interval
The system SHALL determine a base gravity drop interval (milliseconds per row) for a given level by looking up `GRAVITY_TABLE[clampedLevel - 1]`, where `clampedLevel` is the input level clamped to `[1, GRAVITY_TABLE.length]`.

#### Scenario: Level within table range
- **WHEN** the current level is between 1 and 20 inclusive
- **THEN** the base interval is `GRAVITY_TABLE[level - 1]` milliseconds per row

#### Scenario: Level below the table's minimum
- **WHEN** the current level is 0 or negative
- **THEN** the base interval used is `GRAVITY_TABLE[0]` (the level-1 interval)

#### Scenario: Level above the table's maximum
- **WHEN** the current level is greater than 20
- **THEN** the base interval used is `GRAVITY_TABLE[19]` (the level-20 interval)

### Requirement: Per-piece randomized drop interval
When a piece spawns, the system SHALL compute a randomized drop interval for that piece by multiplying the level's base interval by a random factor drawn uniformly from `[0.5, 1.5)`, and SHALL pin that computed interval for the entire lifetime of the piece (it does not change again until the next piece spawns).

#### Scenario: New piece receives a randomized interval within range
- **WHEN** a piece spawns at a given level
- **THEN** the piece's drop interval is between `0.5 ×` and `1.5 ×` (exclusive) the level's `GRAVITY_TABLE` base interval

#### Scenario: Randomized interval is pinned for the piece's lifetime
- **WHEN** gravity is applied on successive ticks for the same piece
- **THEN** the same drop interval computed at spawn time is used on every tick, unchanged, until that piece locks and a new piece spawns

#### Scenario: Consecutive pieces at the same level can differ in fall speed
- **WHEN** two pieces spawn back-to-back at the same level
- **THEN** their randomized drop intervals may differ from one another (each independently drawn within the `[0.5x, 1.5x)` band)

#### Scenario: Randomized interval respects a minimum floor
- **WHEN** the level's base interval is very small (e.g., level 20, base interval of 1ms)
- **THEN** the randomized interval is never less than 1ms

### Requirement: Soft drop multiplier applies on top of the randomized interval
Soft drop SHALL multiply the piece's pinned randomized drop interval by 1/20 (i.e., apply gravity 20x faster), consistent with prior soft-drop behavior, and SHALL NOT re-roll or otherwise alter the randomized interval itself.

#### Scenario: Soft drop speeds up a randomized interval
- **WHEN** soft drop is active for a piece with a pinned drop interval of `X` ms
- **THEN** gravity is applied using an effective interval of `max(1, X / 20)` ms

#### Scenario: Releasing soft drop restores the original randomized interval
- **WHEN** soft drop is deactivated
- **THEN** gravity resumes using the piece's original pinned drop interval, not a newly-rolled one

### Requirement: Lock delay is unaffected by drop-interval randomization
Lock delay behavior (`LOCK_DELAY_MS`, `MAX_LOCK_RESETS`, and the lock-reset mechanism) SHALL remain governed solely by elapsed real time once a piece reaches a floor/blocked position, independent of the piece's randomized drop interval.

#### Scenario: Lock delay duration is constant regardless of drop interval
- **WHEN** a piece reaches a position where it cannot move down further
- **THEN** it locks after `LOCK_DELAY_MS` milliseconds of accumulated lock-phase time, regardless of that piece's randomized drop interval

#### Scenario: Lock reset cap is unaffected
- **WHEN** a piece's lock timer has been reset `MAX_LOCK_RESETS` times
- **THEN** further resets are rejected, exactly as before this change, independent of the piece's drop interval
