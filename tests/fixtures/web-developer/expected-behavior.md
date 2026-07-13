# Web Developer expected behavior

These are directional targets for comparing each resume with `job.txt`. They
are benchmark expectations to validate through repeated runs, not previously
observed score guarantees.

## Directional score ranges

| Resume | Target range | Expected result shape |
| --- | ---: | --- |
| `strong-match-resume.txt` | 80-100 | Nearly all core requirements covered; optional items should also have evidence |
| `medium-match-resume.txt` | 40-70 | Core content work receives credit while production-development gaps remain visible |
| `clear-mismatch-resume.txt` | 0-20 | Web-specific requirements are gaps; only generic transferable skills receive credit |

The ordering matters more than a single boundary result: strong should score
above medium, and medium should score above clear mismatch.

## Important classification expectations

Pass 1 may phrase or combine themes differently. Apply these expectations when
the corresponding theme is extracted.

| Requirement theme | Strong match | Medium match | Clear mismatch |
| --- | --- | --- | --- |
| Responsive HTML, CSS, and JavaScript development | Covered | Partial or covered when coursework and practical HTML/CSS are grouped | Gap |
| Updating content, layouts, forms, and navigation | Covered | Covered | Gap |
| Working from mockups or written requirements | Covered | Covered or partial | Gap |
| Chrome, Safari, Firefox, and mobile testing | Covered | Partial | Gap |
| Front-end layout, form, and browser debugging | Covered | Partial | Gap |
| Git collaboration with other developers | Covered | Partial or gap; personal Git use is not team collaboration | Gap |
| Technical and non-technical communication | Covered | Covered | Partial or covered when the requirement is generic |
| React or another component framework | Covered | Gap | Gap |
| Semantic HTML and accessibility basics | Covered | Covered or partial | Gap |
| Website performance and SEO | Covered | Partial | Gap |
| Client-site or small-agency experience | Covered | Partial | Gap |

When Pass 1 combines qualifications, classify the combined requirement from
the full evidence. For example, the medium resume may be partial for
"responsive HTML, CSS, and JavaScript development" even though its HTML and CSS
evidence is direct.

## Acceptable variation

- Covered and partial may vary for the medium resume's responsive page work,
  design implementation, accessibility practices, and content maintenance.
- Partial and gap may vary for collaborative Git, framework, broad browser
  testing, performance, SEO, and agency experience when Pass 1 groups themes.
- A generic communication requirement may be covered in the clear-mismatch case;
  that should not raise any web-development requirement above gap.
- Severity may vary by one level until the severity-weighting phase establishes
  a stronger contract.
- Exact requirement wording, grouping, ordering, and total count may vary while
  the stable themes remain represented.

## Clear regression signals

- The strong resume falls below the medium resume, or the medium resume falls
  below the clear mismatch across repeated runs.
- Professional HTML, CSS, JavaScript, responsive design, browser testing,
  debugging, Git, or React evidence in the strong resume is classified as gap.
- The medium resume is covered for professional React or collaborative Git
  experience without supporting evidence.
- The clear-mismatch resume receives covered or partial classifications for
  HTML, CSS, JavaScript, browser testing, front-end debugging, Git, React,
  accessibility, performance, or SEO.
- A matched bullet does not actually support the assigned requirement or comes
  from a different resume.
- Repeated scores consistently land outside the directional range or the three
  result bands substantially overlap.
