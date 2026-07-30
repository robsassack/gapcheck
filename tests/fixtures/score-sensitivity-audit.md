# Score sensitivity audit

This audit isolates the deterministic, status-only score from Pass 1 and Pass 2
model variation. It tests the current formula as implemented:

```text
covered = 1, partial = 0.5, gap = 0
score = rounded mean of scored items
```

Work and application constraints remain `unknown` and are excluded.

## Split and combined requirements

The executable cases in `tests/score-sensitivity.test.js` use the same four
unrelated background themes in both shapes:

| Shape of the related theme | Score |
| --- | ---: |
| One combined partial requirement | 50 |
| Three parts classified covered, gap, and gap | 43 |

This seven-point difference is partly meaningful: the split form says more of
the theme is missing than the single `partial` label can express. It also shows
that exact item count affects the result. Splitting a theme must therefore be a
semantic choice, not a way to give it more voting weight.

For a two-part compound requirement, one covered part and one gap produce the
same 50 score as one combined partial requirement in the audit fixture. This
is a useful but limited equivalence; rounding and the mix of other themes can
still move the displayed score.

## Optional lists

The strongest count-sensitivity case is a missing optional technology list:

| Shape of the optional theme | Score |
| --- | ---: |
| One grouped gap | 42 |
| Three separately scored gaps | 31 |

The eleven-point change is disproportionate because both shapes describe one
optional theme. The current score alone does not prevent it. Production relies
on the Pass 1 contract instead:

- one requirement at most per labeled source bullet;
- alternatives and `and`/`or` lists stay together;
- closely related prose qualifications stay grouped;
- semantic duplicates and broad-item restatements are removed;
- illustrative task lists are not scored as requirements.

These are scoring safeguards, not merely output-style preferences. Regressions
in them can materially change a score.

## The 20-item cap and eligibility-first ordering

The representative pinned sets contain 11, 15, 15, and 18 items. None is
truncated by the 20-item cap. The 15-item Software Consultancy set also contains
three work constraints that are visible but unscored, and the 18-item Product
Operations set contains two. Thus the cap does not directly alter any pinned
representative score.

The earlier Product Operations baseline did reach 20 and omitted important
qualifications while selecting example tasks. The completeness audit,
source-aware illustrative-task filtering, prose-fragment consolidation, and
benchmark warning at the cap were added in response. Its current pinned set
retains the stable qualification and responsibility themes in 18 items.

Eligibility-first ordering is intentional when a posting genuinely has more
than 20 distinct themes: candidate qualifications are less replaceable than a
long responsibility list. It can still change the balance of the displayed
score by excluding later responsibilities. A cap warning therefore remains a
required human-review signal; a 20-item extraction is not treated as proof that
ordering had no effect.

## Decision

Stable theme-level influence is the acceptance criterion for future scoring
work. Exact duplicates and alternative lists must not gain influence merely by
being split. A theme may legitimately change score when splitting exposes
different evidence for materially independent parts.

No scoring formula changes in this audit. The matches currently lack a stable,
code-owned theme identifier, so automatically grouping them by word overlap
would risk merging distinct requirements while still missing paraphrases. The
next requirement-aware scoring evaluation must compare any proposed formula
against the cases above and every benchmark. Until then, the status-only score
remains directional and depends on Pass 1 preserving theme boundaries.
