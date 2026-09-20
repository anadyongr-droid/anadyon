# The paper rental agreement

**Last verified:** 9 September 2026, Claude.

What Anadyon actually signs at the counter, transcribed from a scan Tasos
supplied on 9 September 2026 (serial CA, form in use as of September 2026).

| File | What it is |
|---|---|
| `rental-agreement-front-blank.jpg` | **Page 1 — the blank form.** Serial CA, unused, no customer data |
| `rental-agreement-back-terms.jpg` | **Page 2 — the printed terms**, both language columns, from the same blank form |
| `TRANSCRIPTION.md` | The 18 articles, transcribed from that image, with what could not be read marked as such |
| `rental-agreement-template.html` | A clean, blank, printable two-page template rebuilt from the form |
| [`../CONTRACT-VS-WEBSITE.md`](../CONTRACT-VS-WEBSITE.md) | Where the paper contract, the website terms and the insurance policies disagree |

## Why the blank form, and not the completed one

The first scan supplied was a **completed contract for a real customer** — name,
date of birth, passport number, driving licence number and expiry, telephone,
email and both signatures, in handwriting on the front page. That was not
committed, and a blank form was photographed instead. The blank form has no
personal data in it at all, so both sides are here in full.

**Redaction of the completed form was attempted first, and abandoned as
unverifiable.** It is worth recording why, because the failure was instructive.

The blank form is printed in red-orange and the customer's entries are in red and
blue pen, so no colour rule separates handwriting from the form itself. A
box-based attempt left the driver's name, the full licence number and the notes
line visible — and the check written to catch that looked **inside the boxes
after they had been painted white**, which is necessarily empty. It could not
fail, so it proved nothing. This is the failure `AGENTS.md` warns about under
*"a new regression test must fail against the unfixed code"*, made on the one
task where being wrong is permanent.

The replacement check compared against the original at a stricter threshold, and
**did** fail honestly on page 2. Its two hits turned out to be a paper crease and
the page edge, confirmed by looking rather than by asserting.

## Verification of the transcription

The terms were read twice from two independent photographs — the completed
contract's back page, and the blank form's, which is markedly sharper. Article 8
(Insurance Coverage) and article 6.1 (age and licence tenure) were confirmed
**word for word** across both. Where the right margin curls out of frame in both
photographs, the transcription marks the gap rather than guessing.
