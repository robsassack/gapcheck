# Software Consultancy expected behavior

This benchmark is wholly synthetic. Kestrel Harbor Digital, Bellwether City,
Priya Sable, Owen Lark, Tessa Mire, every other organization, and all
responsibilities and evidence were invented for GapCheck calibration rather
than copied or anonymized from a real posting or resume.

## Directional score ranges

| Resume | Target range | Expected result shape |
| --- | ---: | --- |
| `strong-match-resume.txt` | 75-100 | Core consulting delivery themes are covered; silent work constraints remain visible but are not scored |
| `medium-match-resume.txt` | 35-70 | Internal product delivery earns partial credit while pairing, TDD, end-to-end testing, and external client consulting remain gaps or partial |
| `clear-mismatch-resume.txt` | 0-20 | Software and consulting requirements are gaps; generic communication, documentation, and feedback work may receive limited credit |

Authorization, hybrid attendance, travel, and schedule requirements are
preserved as unknown work constraints and excluded from the resume
qualification score. Resume silence must neither lower the score nor be treated
as evidence that the candidate meets those constraints.

## Stable requirement themes

- Production application delivery with a listed language and modern framework
- Pair programming, Git pull requests, and constructive code review
- Test-driven development plus unit, integration, and end-to-end testing
- Client discovery and decomposition of ambiguous workflows
- Non-technical explanation of tradeoffs, risk, and progress
- Cross-functional, iterative agile delivery
- Production diagnosis, documentation, maintainability, and client handoff
- Two years of collaborative production-software delivery
- Direct external-client or internal-stakeholder work
- Learning unfamiliar domains and adapting after feedback
- United States work authorization without sponsorship
- Two office days each week in fictional Bellwether City
- Up to 20 percent travel and occasional early workshops

## Important classification expectations

| Requirement theme | Strong match | Medium match | Clear mismatch |
| --- | --- | --- | --- |
| Production software in a listed stack | Covered | Covered | Gap |
| Pairing, Git, and code review | Covered | Partial; no pairing or review-giving evidence | Gap |
| TDD plus unit, integration, and end-to-end tests | Covered | Partial; no TDD or end-to-end evidence | Gap |
| Client discovery and ambiguous workflow decomposition | Covered | Partial; internal clarification is adjacent | Gap |
| Explain tradeoffs, risks, and progress to clients | Covered | Partial or gap | Partial only if extracted generically; otherwise gap |
| Cross-functional iterative delivery | Covered | Covered or partial | Gap |
| Production diagnosis, documentation, and handoff | Covered | Partial; no client handoff | Partial only if extracted generically; otherwise gap |
| Two years of collaborative production delivery | Covered | Covered or partial depending on run date interpretation | Gap |
| External clients or internal stakeholders | Covered | Partial or covered when the alternatives remain grouped | Gap |
| Learn domains and adapt after feedback | Covered | Covered or partial | Partial only when phrased generically |
| Authorization, hybrid schedule, travel, and workshop availability | Unknown and not scored | Unknown and not scored | Unknown and not scored |

The work constraints must never be marked covered, partial, or gap based on a
city, employer, job title, generic scheduling, event travel, or other unrelated
resume text.

## Acceptable variation

- Covered and partial may vary for the medium production-stack, cross-functional,
  internal-stakeholder, and feedback evidence.
- Partial and gap may vary for medium discovery, client communication, pairing,
  test coverage, and handoff when Pass 1 combines themes.
- Generic communication, documentation, and feedback themes may receive limited
  transferable credit in the clear mismatch, but software-specific variants may
  not.
- Work constraints may be grouped or split, but resume silence must not produce
  supporting evidence.
- Severity may vary by one level. Exact wording, grouping, order, and count may
  vary while the stable themes remain represented.

## Regression signals

- Score ordering reverses or result bands substantially overlap across repeated
  controlled runs.
- The strong resume receives a gap for direct production delivery, pairing,
  review, TDD, automated tests, discovery, client communication, or handoff.
- Internal stakeholder work, implementation-after-testing, or course work is
  treated as identical to external consulting, TDD, or production experience.
- Any work constraint receives credit from evidence that does not explicitly
  establish that constraint.
- The clear mismatch receives software-delivery credit from workshop
  coordination, spreadsheets, documentation, or feedback word overlap.
- A cited bullet does not support the assigned classification.

## Controlled comparison protocol

Run three repetitions in **Controlled comparison** mode to observe Pass 1
variation while sharing each repetition's extraction across all resumes. Then
run three repetitions in **Pass 2 audit with pinned requirements** mode. Score
or status variation in the pinned run is classification variation; additional
variation seen only in the controlled run is attributable to requirement
extraction, grouping, or downstream interaction with that extraction.
