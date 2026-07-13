# Analysis benchmark fixtures

Each benchmark family uses one shared job description with strong, medium, and
clear-mismatch resumes. Holding the job constant within a family makes score and
classification differences primarily a Pass 2 concern, while repeated runs of
each job can be used to audit Pass 1 separately.

Each family directory uses the same layout:

```text
<benchmark>/
  job.txt
  strong-match-resume.txt
  medium-match-resume.txt
  clear-mismatch-resume.txt
  expected-behavior.md
```

## Product Operations benchmark

Use `product-ops/job.txt` as the shared job description for the Product
Operations benchmark.

The benchmark resumes are:

- `product-ops/strong-match-resume.txt`: seven years of directly relevant B2B
  software and healthcare product-operations experience. Its evidence is
  intentionally phrased differently from the job posting.
- `product-ops/medium-match-resume.txt`: five years of adjacent business
  operations and project-coordination experience. It contains direct evidence
  for general operations capabilities, transferable evidence for some product
  work, and deliberate gaps in SQL, software product operations, healthcare,
  and B2B SaaS.
- `product-ops/clear-mismatch-resume.txt`: six years of unrelated pastry work.
  It includes realistic general evidence such as process discipline, training,
  coordination, communication, and sanitation procedures without claiming
  product, software, analytics, healthcare, or enterprise experience.

### Stable requirement themes

The shared job is intended to exercise these durable themes even when Pass 1
phrases or groups individual requirements differently:

- At least five years of relevant experience supporting software teams
- Product operations, business operations, product analytics, program
  management, consulting, or closely related experience
- Product or operational data analysis, including SQL, BI tools, and
  spreadsheets
- Synthesis of quantitative findings and qualitative customer feedback
- Repeatable process design for intake, release readiness, feedback triage, and
  post-launch measurement
- Cross-functional launch coordination, dependency tracking, and follow-up
- Clear written communication, documentation, facilitation, and decision support
- Experience with agile product teams and tools such as Jira, Linear,
  Confluence, or Notion
- B2B SaaS, enterprise-customer, or complex-implementation experience
- Healthcare, regulated-industry, or compliance-heavy experience
- Independent prioritization, senior-level judgment, and appropriate escalation
- Eastern or Central time-zone alignment and occasional travel

The requirements intentionally mix explicit qualifications, preferred
experience, transferable capabilities, and work constraints. This gives the
benchmark useful anchors for covered, partial, and gap classifications.

See `product-ops/expected-behavior.md` for directional score ranges,
classification anchors, acceptable variation, and regression signals.

## Web Developer benchmark

Use `web-developer/job.txt` as the shared job description for the Web Developer
benchmark. Its resumes are:

- `web-developer/strong-match-resume.txt`: direct professional evidence across
  the core web stack, responsive implementation, browser testing, debugging,
  Git collaboration, React, accessibility, performance, SEO, and client work.
- `web-developer/medium-match-resume.txt`: adjacent website-content experience
  with practical HTML and CSS, limited testing and debugging, introductory
  JavaScript, and no production framework or collaborative Git experience.
- `web-developer/clear-mismatch-resume.txt`: unrelated warehouse experience
  with realistic communication, accuracy, process, and teamwork evidence but no
  web-development claims.

### Stable requirement themes

- Responsive page development with HTML, CSS, and JavaScript
- Maintenance of existing content, layouts, forms, and navigation
- Implementation from design mockups or written requirements
- Testing across major browsers and mobile screen sizes
- Diagnosis and repair of front-end layout, form, and browser defects
- Git-based version control and developer collaboration
- Clear communication with technical and non-technical partners
- React or another component-based front-end framework
- Semantic HTML and basic accessibility practices
- Website performance and SEO fundamentals
- Client-site or small-agency experience

This family deliberately tests whether HTML and CSS content work plus
introductory JavaScript receives meaningful partial credit without being
treated as equivalent to professional front-end development.

See `web-developer/expected-behavior.md` for directional score ranges,
classification anchors, acceptable variation, and regression signals.

## Interpreting expectations

The expected ranges are initial human-judgment targets, not observed results or
exact assertions. A single out-of-range run is evidence to record, not an
automatic failure. Treat behavior as a regression when repeated runs show a
wrong ordering, a persistent range miss, unsupported classifications, or cited
bullets that do not support the requirement.

Nano can vary between runs, while the code-owned scoring function remains
deterministic for a fixed set of matches. Record actual ranges during the
repeated-run step before changing prompts or scoring.

## Running the benchmarks

Reload the unpacked extension after code or fixture changes, then open:

```text
chrome-extension://<extension-id>/tests/benchmark-runner.html
```

Choose one or both benchmark families and a repetition count. The runner loads
the packaged fixtures, uses the same resume parser as the options page, runs
each comparison sequentially, and leaves the resume saved in GapCheck
unchanged. Keep the runner page open and the computer awake until the queue
finishes.

Cancellation takes effect after the current analysis finishes. Completed and
failed runs remain available in the JSON and Markdown reports.
