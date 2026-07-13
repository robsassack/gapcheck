# Product Operations expected behavior

These are directional targets for comparing each resume with `job.txt`. They
are benchmark expectations to validate through repeated runs, not previously
observed score guarantees.

## Directional score ranges

| Resume | Target range | Expected result shape |
| --- | ---: | --- |
| `strong-match-resume.txt` | 75-100 | Predominantly covered, with few or no substantive gaps |
| `medium-match-resume.txt` | 40-70 | A meaningful mixture of covered, partial, and gap |
| `clear-mismatch-resume.txt` | 0-25 | Predominantly gap, with limited credit for genuinely transferable evidence |

The ordering matters more than a single boundary result: strong should score
above medium, and medium should score above clear mismatch.

## Important classification expectations

Pass 1 may phrase or combine themes differently. Apply these expectations when
the corresponding theme is extracted.

| Requirement theme | Strong match | Medium match | Clear mismatch |
| --- | --- | --- | --- |
| Five years of relevant software-team experience | Covered | Partial or gap; duration is present but software support is not | Gap |
| Product or business operations | Covered | Covered or partial | Gap |
| SQL | Covered | Gap | Gap |
| BI tools and spreadsheets | Covered | Covered | Gap |
| Quantitative and qualitative feedback synthesis | Covered | Covered or partial | Gap |
| Repeatable process design | Covered | Covered | Partial or gap |
| Cross-functional launch coordination | Covered | Partial | Gap |
| Written communication, facilitation, and documentation | Covered | Covered | Partial or covered when the requirement is generic |
| Agile teams plus Jira, Linear, Confluence, or Notion | Covered | Partial or covered for the named tools; software-team context is absent | Gap |
| B2B SaaS, enterprise customers, or complex implementations | Covered | Gap | Gap |
| Healthcare or a closely related regulated environment | Covered | Gap | Gap; sanitation alone is not healthcare or product compliance experience |
| Independent prioritization and judgment | Covered | Covered or partial | Partial or gap |
| Eastern or Central hours plus occasional travel | Covered | Partial if hours and travel are grouped | Partial if hours and travel are grouped |

When Pass 1 combines qualifications, classify the combined requirement from
the full evidence. For example, the medium resume can reasonably be partial for
"SQL, BI tools, and spreadsheets" even though SQL alone should be a gap.

## Acceptable variation

- Covered and partial may vary for transferable business-operations work,
  launch coordination, agile tooling, or independent judgment.
- Partial and gap may vary when Pass 1 combines direct evidence with a missing
  qualification in one requirement.
- Generic communication or process requirements may receive more credit in the
  clear-mismatch case than product-specific versions of those requirements.
- Severity may vary by one level until the severity-weighting phase establishes
  a stronger contract.
- Exact requirement wording, grouping, ordering, and total count may vary while
  the stable themes remain represented.

## Clear regression signals

- The strong resume falls below the medium resume, or the medium resume falls
  below the clear mismatch across repeated runs.
- Direct SQL, Looker, healthcare software, B2B SaaS, enterprise implementation,
  or release-coordination evidence in the strong resume is classified as gap.
- The medium resume is covered for SQL, healthcare, B2B SaaS, or software
  product-operations experience without supporting evidence.
- The clear-mismatch resume is covered for product operations, analytics,
  software-team experience, healthcare, SaaS, or enterprise implementation.
- A matched bullet does not actually support the assigned requirement or comes
  from a different resume.
- Repeated scores consistently land outside the directional range or the three
  result bands substantially overlap.
