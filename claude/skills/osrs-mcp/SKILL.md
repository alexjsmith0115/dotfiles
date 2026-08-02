---
name: osrs-mcp
description: Use when answering OSRS (Old School Runescape) questions about player progression, gear, quests, items, monsters, prices, drops, or wiki content — anywhere the `mcp__osrs-mcp__*` tools are available. Covers the RSN gate, tool selection, ambiguity handling, and the paraphrase rule.
---

# OSRS MCP Interface

## Overview

The `osrs-mcp` server exposes three layers behind one tool surface:

- **Data** — Bucket mirror, GE prices, wiki cache (`bucket_select`, `ge_price`, `ge_history`, `get_item`, `get_monster`, `get_quest`, `get_page`, `wiki_search`, `find_drops`, `find_droppers`, `quest_prereqs`).
- **State** — per-RSN merged state (`set_user`, `get_user_state`, `set_override`, `clear_override`, `refresh_hiscores`, `snapshot_state`).
- **Reasoning** — DAG + critic engine (`suggest_next_step`, `get_progression_path`, `validate_recommendation`).

State and reasoning tools are **gated by `set_user`**. The session RSN persists across calls and across conversations on the same machine — never assume a default.

## The RSN Gate (most common failure)

**If the user's question depends on player state and you have not confirmed an RSN this conversation, ask before calling state tools.**

State-aware tools that require an RSN:
`get_user_state`, `refresh_hiscores`, `set_override`, `clear_override`, `suggest_next_step`, `get_progression_path`, `validate_recommendation` (without inline `user_state`).

### Wrong (what to avoid)

```
User: what should I do next in OSRS?
Claude: [calls get_user_state] → returns cached RSN from prior session
Claude: [recommends based on that account]
User: that's not my character
```

The session DB persists. `get_user_state` will silently return whoever was last set — possibly a different user, possibly a stale test RSN. Recommendations built on that data are wrong and waste tokens.

### Right

```
User: what should I do next in OSRS?
Claude: What's your RSN? (and what goal — XP, quests, bossing, money, collection log?)
User: aboatt, working toward maxed combat
Claude: [set_user("aboatt")] → ok
        [get_user_state] → state
        [suggest_next_step({goal: "max combat"})] → ranked steps
```

### Decision flow

```
User asks OSRS question
  │
  ├─ Pure data question (price, drop table, wiki lookup, quest reqs)?
  │     → No RSN needed. Use data tools directly.
  │
  └─ State-dependent (next step, gear, progression, "what should I do")?
        │
        ├─ User stated RSN this conversation?
        │     → set_user(rsn) once, then proceed.
        │
        └─ Did not state RSN?
              → Ask RSN + goal before any state tool.
```

If `get_user_state` returns an unexpected RSN, **stop and confirm** before using the data — do not silently recommend from someone else's account.

## Quick Tool Reference

| Need | Tool | Notes |
|------|------|-------|
| Set/probe session RSN | `set_user` | Probes hiscores. `ok=false` → not_on_hiscores or upstream_unavailable. Max 12 chars. |
| Read merged player state | `get_user_state` | Hiscores + overrides. Check `_freshness.conflicts`. |
| Force fresh hiscores | `refresh_hiscores` | Bypasses 5-min TTL. Use only if state is stale. |
| Ranked next steps toward goal | `suggest_next_step` | Free-text goal (≤256 chars). HARD blockers first. |
| Structural progression view | `get_progression_path` | Categories: cape_slot, quest_milestone, diary_perk, slayer_unlock, combat_achievement_tier, money_making_method. |
| Validate a recommendation | `validate_recommendation` | Pass `user_state` inline for what-if without `set_user`. |
| Override gear/quests/diaries | `set_override` / `clear_override` | Namespaces: `gear.<slot>`, `unlocks.<n>`, `quests.<id>`, `diaries.<region>.<tier>`, `flags.<…>`. |
| Item lookup + price + drops | `get_item` | One-shot envelope. Returns `candidates[]` on ambiguity. |
| Monster row + drop table | `get_monster` | Default `version=1` for multi-version. `max_hit` is string array. |
| Quest meta + parsed reqs | `get_quest` | Description paraphrased to first sentence. |
| Quest prereq tree | `quest_prereqs` | `transitive: true` (default) flattens skill maxes. Cycle-safe. |
| Drops for a monster | `find_drops` | Returns `expected_gp_per_kill` + `total_per_kill_avg_gp`. |
| Droppers of an item | `find_droppers` | Sorted rarity desc. Default 50, cap 200. |
| Live GE price | `ge_price` | `is_stale=true` if last tick > 6h. |
| GE time-series | `ge_history` | `range`: `24h` (hourly) / `7d` / `30d` (daily). |
| Wiki page chunks | `get_page` | Optional `sections` prefix filter. Returns PAGE_NOT_CACHED envelope (not throw). |
| Hybrid wiki search | `wiki_search` | FTS5 BM25 + vec cosine, RRF k=60. Default limit 10. |
| Predicate query over Bucket | `bucket_select` | 10 buckets. AST only — no string interpolation. 1000-row cap. |
| Snapshot state.db + mirror | `snapshot_state` | Manual VACUUM INTO + fs.copyFile. |
| Refresh Bucket mirror | `refresh_bucket_mirror` | Walks live wiki Bucket API. User-controlled. |

## Hard Rules

0. **MCP-only — no recall, no inference, no guessing.** Every OSRS fact stated to the user — slayer gates, quest reqs, drop rarities, item names, max hits, gear bonuses, mechanics, strategies, prices, locations — must be sourced from a `mcp__osrs-mcp__*` tool call in the same response. If a fact cannot be sourced, say so and look it up; do not extrapolate from memory. Recall is wrong often enough to be a hard-prohibited shortcut: hallucinated item names ("90 mage battlestaff") and miscited gates ("smoke devils 85 slayer") have already happened. Before stating any number, name, mechanic, or recommendation, call the relevant tool first: `get_monster`, `get_item`, `get_quest`, `quest_prereqs`, `find_drops`, `find_droppers`, `wiki_search`, `get_page`, `ge_price`, `ge_history`, `bucket_select`. Surface `sources` + `_freshness` from the result. **No exceptions for "obvious" facts** — if you didn't look it up this response, you don't know it.
1. **Ambiguity is never auto-resolved.** `get_item`, `get_monster`, `get_quest`, `find_drops`, `find_droppers`, `ge_price`, `quest_prereqs` return `candidates[]` on name collision (DOM-07). Show candidates to the user; never guess.
2. **Paraphrase wiki text — never reproduce paragraphs verbatim.** Wiki content is CC BY-NC-SA. Tool responses already paraphrase and carry a `sources` array; preserve attribution when relaying to the user.
3. **Always surface `sources` for wiki/hiscores-derived claims.** Every state-aware tool returns `sources` and `_freshness`. If `is_stale=true`, say so.
4. **`_freshness.conflicts`** on `get_user_state` flags override/hiscores disagreements — call them out, do not silently prefer one side.
5. **No inline `rsn` parameter on state tools.** Session is per-machine; if the user wants to switch character, call `set_user` again.
6. **`bucket_select` is predicate-AST only.** Never construct WHERE clauses by string concat; use the `where: [{field, op, value}]` array. `op` is one of `=, !=, <, <=, >, >=`.
7. **`max_hit` from `get_monster` is `string[]`** (e.g. `["240"]` or `["0-240"]`). Don't coerce to integer.
8. **Critic verdicts attached to `suggest_next_step` output:** HARD blockers come first regardless of estimated time. Respect that ordering when summarizing for the user.

## Recipes

### "What should I do next?"

1. Confirm RSN this turn (ask if absent).
2. Confirm goal (XP, quest, boss, money, log slot, sailing). `suggest_next_step` requires a goal string.
3. `set_user(rsn)` → `get_user_state` → `suggest_next_step({goal})`.
4. Surface HARD blockers first, then top-3 SOFT steps. Keep critic verdicts.

### "How do I unlock X?"

1. `get_quest("X")` for quest gate, or `wiki_search("X unlock")` for non-quest unlocks.
2. `quest_prereqs("X")` for full transitive tree + flattened skill levels.
3. Compare to `get_user_state` → list missing reqs only.

### "What gear should I bring to <boss>?"

1. `get_monster("<boss>")` for combat stats, weaknesses, max_hit.
2. `wiki_search("<boss> strategy")` or `get_page("<boss>/Strategies")`.
3. If state-aware (compare to user's gear): RSN gate + `get_user_state` first.

### "What's <item> worth?" / "Best gp/hr drop from <monster>?"

1. `get_item("<item>")` (one-shot price + alch + drops) or `ge_price("<item>")`.
2. For monster gp/kill: `find_drops("<monster>")` → `total_per_kill_avg_gp`.
3. Trend question → `ge_history` with `range: "24h" | "7d" | "30d"`.

### "Is this plan blocked?"

`validate_recommendation({recommendation, user_state?})` — pass `user_state` inline to test what-if without touching session.

## Common Mistakes

| Mistake | Why it bites | Fix |
|---------|--------------|-----|
| Calling `get_user_state` to "check who's set" | Returns prior-session RSN silently — easy to recommend on wrong character | Ask the user; only call after `set_user` confirms |
| Using `suggest_next_step` with no goal | Tool requires a goal; vague goals produce noisy steps | Pull a concrete goal from the user first |
| Auto-picking from `candidates[]` | Server explicitly refuses to guess (DOM-07) | Show candidates to the user, ask them to pick |
| Quoting wiki paragraphs verbatim | License + project rule | Paraphrase, keep `sources` |
| Ignoring `_freshness.conflicts` | Override/hiscores disagreement hides real state | Surface conflicts in the answer |
| Treating `max_hit` as int | It's a string array | Render as-is |
| Constructing `bucket_select` WHERE strings | Server rejects; security rule | Use the `where: [{field, op, value}]` array |
| Forgetting `_freshness.is_stale` | User acts on outdated price | Mention staleness in any GE response |
| Calling `refresh_hiscores` reflexively | Burns rate limit (≤1 req/sec/host) | Only call when state is genuinely stale |

## Red Flags — STOP

- About to state ANY OSRS fact (level, item name, gate, drop, mechanic, price, strategy) without a tool call in this response backing it. If you cannot point to a specific tool call's output, you are guessing — STOP, look it up, or say you don't know.
- Phrases that signal you are about to hallucinate: "I think it's around…", "if I recall…", "should be roughly…", "typically…", "I believe…". All of these mean: tool call required before continuing.
- About to call `get_user_state` without the user having stated their RSN this conversation.
- About to relay a recommendation built on `get_user_state` output without naming the RSN that produced it.
- About to pick one of `candidates[]` yourself.
- About to quote wiki text without paraphrasing.
- About to drop the `sources` array from a user-facing answer.

All of these mean: stop, confirm with the user, then proceed.
