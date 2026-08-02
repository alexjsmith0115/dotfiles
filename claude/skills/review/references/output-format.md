# Output Format

Print the review as markdown to the TUI.

## Structure

### Header

# Code Review

> **Reviewing:** <what was reviewed>
> **Files changed:** <count>

### Each finding

### [P<n>] <imperative title, ≤80 chars>
**File:** `<path>:<start>-<end>` | **Confidence:** <0.0–1.0>

<one-paragraph description>

When a concrete fix applies, append a suggestion block (≤3 lines, preserve exact whitespace):

```suggestion
<replacement lines>
```

Separate findings with `---`.

### Verdict

## Verdict

**Overall Correctness:** ✅ Correct | ❌ Incorrect | **Confidence:** <0.0–1.0>

<1–3 sentence justification>

## Rules

- Order findings P0 → P3. Same priority: higher confidence first.
- Zero findings → omit Findings section entirely; still emit Verdict.
- Omit suggestion block when no concrete fix applies.
- Separate findings with `---`.
- File paths: relative to repo root.
- Line ranges: must overlap the diff, ≤10 lines.
- Confidence: 0.0–1.0 reflecting certainty the issue is real.
