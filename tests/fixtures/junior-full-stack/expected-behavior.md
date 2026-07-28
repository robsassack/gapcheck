# Junior Full-Stack expected behavior

This benchmark is wholly synthetic. Copper Finch Labs, Maya Rook, Jonas Vale,
Elena Quill, every other organization, and all responsibilities and evidence
were invented for GapCheck calibration rather than copied or anonymized from a
real posting or resume.

## Directional score ranges

| Resume | Target range | Expected result shape |
| --- | ---: | --- |
| `strong-match-resume.txt` | 80-100 | Direct evidence across the core stack, testing, collaboration, cloud support, and most preferred technologies |
| `medium-match-resume.txt` | 40-70 | Meaningful frontend credit with partial backend and testing evidence and clear cloud, DevOps, database, and optional-technology gaps |
| `clear-mismatch-resume.txt` | 0-20 | Full-stack requirements remain gaps; generic documentation and coordination may receive limited credit |

Strong should score above medium, and medium should score above clear mismatch
in each controlled repetition.

## Stable requirement themes

- Responsive and accessible HTML, CSS, TypeScript, and React interfaces
- Node.js and Express REST API development
- PostgreSQL data modeling and queries
- Unit and integration testing
- Git branches, pull requests, code review, and collaborative feedback
- Browser, log, and monitoring-based defect investigation
- AWS deployment and production support
- Documentation and cross-functional blocker communication
- One year of professional experience, substantial internship work, or
  equivalent shipped projects
- Both user-facing and server-side JavaScript or TypeScript work
- HTTP API and relational-database fundamentals
- Preferred CI/CD and Docker experience
- Optional GraphQL, Python, or Terraform exposure

## Important classification expectations

| Requirement theme | Strong match | Medium match | Clear mismatch |
| --- | --- | --- | --- |
| Responsive, accessible React and TypeScript frontend | Covered | Partial; React and TypeScript depth is limited | Gap |
| Node.js and Express REST APIs | Covered | Partial; course project only | Gap |
| PostgreSQL | Covered | Partial or gap; SQLite is transferable but not PostgreSQL | Gap |
| Unit and integration testing | Covered | Partial; only small unit-test evidence | Gap |
| Collaborative Git and code review | Covered | Partial or gap; submitting changes is not reviewing peers | Gap |
| Browser, log, and monitoring troubleshooting | Covered | Partial; browser tools only | Gap |
| AWS deployment and support | Covered | Gap | Gap |
| Documentation and blocker communication | Covered | Covered | Partial or covered only when phrased generically |
| Experience threshold or shipped equivalent | Covered | Covered or partial | Gap |
| CI/CD and Docker | Covered | Partial or gap; automated static hosting is limited | Gap |
| GraphQL, Python, or Terraform | Covered | Gap | Gap |

## Acceptable variation

- Covered and partial may vary for the medium frontend work, experience
  threshold, and documentation theme when Pass 1 groups requirements.
- Partial and gap may vary for the medium backend course project, SQLite,
  personal pull requests, automated hosting, and browser-only debugging.
- Optional technologies may be extracted as one grouped requirement or omitted
  individually, but they must not crowd out core frontend, backend, database,
  testing, collaboration, and cloud themes.
- Severity may vary by one level. Exact wording, grouping, order, and count may
  vary while the stable themes remain represented.

## Regression signals

- Score ordering reverses or the bands substantially overlap across repeated
  controlled runs.
- The strong resume receives a gap for direct React, Express, PostgreSQL,
  testing, Git review, AWS, monitoring, CI/CD, or Docker evidence.
- SQLite coursework is classified as covered PostgreSQL experience, or a
  personal/static deployment is classified as covered AWS production support.
- The clear mismatch receives full-stack credit from spreadsheet,
  documentation, training, inventory, or coordination word overlap.
- A cited bullet does not support the assigned classification.

## Controlled comparison protocol

Run three repetitions in **Controlled comparison** mode to observe Pass 1
variation while sharing each repetition's extraction across all resumes. Then
run three repetitions in **Pass 2 audit with pinned requirements** mode. Score
or status variation in the pinned run is classification variation; additional
variation seen only in the controlled run is attributable to requirement
extraction, grouping, or downstream interaction with that extraction.
