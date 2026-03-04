# Hebrew Signs — Development Roadmap

**Date:** 2026-03-03
**Authors:** Daniel (framework originator), Hannah (computational analysis)
**Vision:** A dynamic translation of Hebrew scripture read through the relational dynamics of the 22 letter-signs.

---

## What We've Built

### Foundation (Complete)

| Component | Status | Evidence |
|-----------|--------|----------|
| 22 corrected letter dynamics | Done | Synthesized from 4 independent evidence lines |
| 6Q skeleton (Who/What/How/Where/When/Why) | Done | 6 structural questions mapped to 6 letters |
| Alphabet architecture (skeleton + flesh) | Done | 16 dynamic letters clustered under 6 questions |
| Root-position analysis (R1/R2/R3) | Done | 4,617 roots, 22 letters across all positions |
| Micro-sentence test | Done | **99.6% illumination across 500 roots** (after failure investigation) |
| Acrostic validation (3 texts) | Done | Psalm 119 (devotion), Lamentations 1 (grief), Proverbs 31 (virtue) |
| Corrected framework document | Done | All 22 letters with original, correction, evidence, essential definition |

### Key Findings

1. **Hebrew letters are relational dynamics, not category labels.** Each letter describes what a word DOES, not what it IS.
2. **Three-letter roots are micro-sentences.** R1 initiates, R2 mediates, R3 completes. Reading roots as dynamic sequences illuminates actual meaning 99.6% of the time (after investigating every failure).
3. **The alphabet has two-layer architecture.** Six letters are structural questions; sixteen are dynamic answers.
4. **The dynamics are structural, not emotional.** The same skeleton produces devotion (Psalm 119), grief (Lamentations), or praise of virtue (Proverbs 31) depending on content.
5. **The ancient poets knew.** Proverbs 31 writes the Yud verse about hands (יד), the Pe verse about the mouth (פה), the Kaf verse about palms (כף). The letter IS the dynamic IS the body part.

---

## The Road Ahead

### Phase 1 — Word-Level Dynamic Glosser (Complete)

**Goal:** A tool that takes any Hebrew word and produces its dynamic reading.

**Components:**
- Prefix detection and stripping (ב, ה, ו, כ, ל, מ, ש — with dynamic labels)
- Root extraction (reusing 4,617-root index from Phase 4)
- Dynamic composition (R1 → R2 → R3 with positional roles)
- Suffix handling (ים, ות, etc. — grammatical, not dynamic)
- Output: structured JSON with Hebrew, root, prefix dynamics, root dynamics, composite reading

**Input:** Hebrew word, verse reference, or raw text
**Output:** Word-by-word dynamic breakdown — raw, unedited

### Phase 2 — Genesis 1 Proof-of-Concept (Complete)

**Goal:** Apply the glosser to Genesis 1 (31 verses). Produce an interlinear format:

```
בראשית          ברא              אלהים
In-beginning    created          God
[Containment +  [Containment →   [Origination →
 Headship →      Headship →       Direction →
 Origination →   Origination]     Revelation →
 Intensification                  Agency →
 → Agency →                       Flow]
 Completion]
```

Three lines per word: Hebrew, traditional, dynamic.

**Why Genesis 1:** Theologically dense, well-known, short enough to review carefully, contains both narrative and divine speech.

### Phase 3 — Refinement Loop (Complete)

**Goal:** Examine the 11% of roots that scored "weak" in the micro-sentence test. Three categories:

1. **Framework corrections** — our dynamics aren't quite right for some letters
2. **Method limitations** — particles, proper names, borrowed words that don't decompose
3. **New patterns** — failures that reveal something we haven't mapped yet

Also needed:
- **Verb stems (binyanim):** ✅ **Validated (2026-03-04).** Blind prediction test across 100 roots (293 pairs) achieved 78.5% predictive accuracy. Dynamics + Qal meaning predict binyan meaning shifts before seeing actuals. Passive binyanim scored highest (Hophal 93%). Piel/Pual gemination = intensification strongly validated. Hiphil ה prefix dynamics weak — needs revision. See [Binyanim Validation](evidence/binyanim-validation.md).
- **Construct chains:** Hebrew noun phrases (סֵפֶר הַתּוֹרָה, "book of the Torah") have relational structure. How do letter dynamics compose across word boundaries?
- **Pronoun suffixes:** Possessive/object suffixes (-ו, -ה, -ם) are themselves Hebrew letters with dynamics. Does "his" (ו, conjunction) imply binding? Does "her" (ה, revelation) imply making present?

### Phase 4 — Sustained Translation (Complete)

**Goal:** Expand beyond Genesis 1 to a corpus of key texts with dynamic readings.

**Priority texts — all complete:**
- Genesis 1-3 (creation, fall) — 1,109 words, 80 verses
- Genesis 22 (binding of Isaac) — 367 words, 24 verses
- Exodus 3 (burning bush, divine name revelation) — 395 words, 22 verses
- Exodus 20 (Ten Commandments) — 312 words, 26 verses
- Psalm 1 (gateway psalm) — 67 words, 6 verses
- Psalm 23 (shepherd psalm) — 57 words, 6 verses
- Deuteronomy 6:4-9 (the Shema) — 48 words, 6 verses
- Isaiah 53 (suffering servant) — 166 words, 12 verses
- Ruth 1 (loyalty narrative) — 325 words, 22 verses

**Total: 11 interlinear texts, 2,846 words, 204 verses across 6 genres.**

### Phase 5 — The Dynamic Tanach

**Goal:** Every word in the Hebrew Bible with its dynamic reading alongside the traditional translation. A complete interlinear Dynamic Tanach.

**This is the long goal.** It requires:
- Automated glosser running on the full 305,071-word corpus
- Human review of edge cases and failures
- A readable presentation format (print and digital)
- Community contribution and peer review

---

## Publishing Vision

This work should be open. The findings, tools, data, and methodology should be published so that others can verify, extend, and contribute.

### What to Publish

| Component | Format | Audience |
|-----------|--------|----------|
| Corrected Framework (22 letters) | Web page + PDF | Everyone — the core reference |
| Evidence trail (scoring, root analysis, acrostic tests) | Documented methodology + data | Researchers, skeptics |
| Glosser tool | Open-source script or web app | Students, translators, scholars |
| Dynamic readings of key texts | Interlinear format | Bible students, pastors, scholars |
| Development roadmap (this document) | Public roadmap | Contributors |
| Raw data (root analysis, micro-sentence results) | JSON/CSV exports | Data analysts, linguists |

### Contribution Opportunities

- **Hebrew scholars:** Verify root analyses, correct edge cases, validate against traditional lexicons (BDB, HALOT)
- **Computational linguists:** Improve root extraction, handle morphological complexity, test against other Semitic languages
- **Translators:** Craft readable English renderings from raw dynamic readings
- **Theologians:** Interpret what the dynamic layer reveals about biblical theology
- **Developers:** Build web tools, interlinear viewers, search interfaces
- **Artists/Designers:** Visualize the alphabet architecture, create educational materials

---

## Known Limitations

1. **Root extraction is heuristic.** Our prefix/suffix stripping approximates roots but doesn't handle all morphological patterns. A proper morphological parser (like ETCBC or OpenScriptures) would improve accuracy.
2. **The LLM is a judge, not an oracle.** We used Grok 4.1 to evaluate alignments. Its assessments are informed but not authoritative. Human Hebrew scholars should verify key results.
3. **2 of 500 roots don't illuminate.** ארצ (earth) and צנה (cold) remain genuinely weak after exhaustive investigation. See [Phase 3 Failure Analysis](evidence/phase3-failure-analysis.md).
4. **Verb stems are not yet modeled.** The 7 binyanim significantly modify root meaning. Until these are incorporated, the glosser handles base roots but not inflected forms fully.
5. **This is a layer, not a replacement.** The dynamic translation adds a dimension traditional translations don't capture. It does not replace lexical, grammatical, or contextual translation. It sits alongside.

---

## Cost Summary

| Phase | Method | Cost | Time |
|-------|--------|------|------|
| Phase 3 | Category-label scoring | ~$0.06 | ~15 min |
| Phase 3b | Relational-dynamic scoring | $0.08 | ~15 min |
| Phase 4 | Root-position analysis | $0.06 | ~14 min |
| Phase 5 | Micro-sentence (500 roots) | $0.55 | ~7 min |
| **Total to date** | | **~$0.75** | **~50 min** |

The entire evidence base for the corrected framework cost less than a dollar in API calls.

---

## Source

**All data:** `data/`
**All scripts:** `scripts/*.js`
**All nodes:** this repository
**Corpus:** UXLC Leningrad Codex, 305,071 words, 39 books
