# Research Directions and Latent Affordances

What this project found, and where it might lead. Organized by evidence strength — validated directions first, then open questions.

## Validated Directions

These follow directly from existing evidence and require extension, not speculation.

### Cross-Semitic Verification

Arabic has 28 letters and a nearly identical triliteral root system. Aramaic, Ugaritic, and Phoenician share the same structural logic. If the 22 dynamics hold in Arabic — where the root system is even more productive — the claim shifts from "a framework for reading Hebrew" to "a discovered property of how Semitic languages encode meaning at the morphological level."

**What's needed:** Apply the same methodology (root-position analysis, micro-sentence test) to Arabic triliteral roots using the shared consonants. The overlapping letters (most of the 22) provide a direct test. Divergent letters (Arabic's additional 6) would test whether the dynamic principle extends beyond the Hebrew set.

**Why it matters:** This is the difference between an interpretive framework and a structural discovery. The Hebrew evidence alone can't distinguish the two.

### Polarity-Neutral Dynamics as Formal Linguistics

The finding that identical structural dynamics produce devotion (Psalm 119), grief (Lamentations 1), and embodied virtue (Proverbs 31) — and that this same principle resolves "negative" roots like rasha (wicked) and riq (empty) — is a claim about the relationship between morphological structure and semantic content.

This maps onto construction grammar (Goldberg) and conceptual metaphor theory (Lakoff, Langacker): structural form and semantic valence are orthogonal. The Hebrew evidence provides a particularly clean test case because the acrostic structure forces identical letter-positions across radically different content.

**What's needed:** Formal analysis comparing the polarity findings to existing construction grammar literature. The claim is publishable in computational linguistics venues independently of the biblical material.

### Academic Publication

The methodology is already in paper structure:

- Hypothesis (letters as relational dynamics, roots as micro-sentences)
- Corpus (305,463 words, UXLC Leningrad Codex)
- Quantitative results (99.6% micro-sentence illumination, 78.5% binyanim blind prediction)
- Failure analysis (53 failures investigated, 2 genuine, categories documented)
- Three independent counter-tests (Psalm 119, Lamentations 1, Proverbs 31)
- Known limitations (2 weak roots, Hiphil prefix dynamics, Tet uncertainty)
- Reproducibility ($1 in API calls, scripts included)

**Possible venues:** *Vetus Testamentum*, *Journal of Biblical Literature*, *Computational Linguistics*, or open-science venues where the $1 reproducibility claim is a strong hook.

**The methodological vulnerability:** The post-hoc resolution of 51/53 failures is the main target for criticism. Independent replication by someone who did not design the framework is the single highest-leverage credibility investment for the entire project.

### Programmatic Tool Server

The glosser is already structured as a programmatic tool that takes Hebrew input and returns structured JSON. Packaging it as an API endpoint or MCP tool server would make the framework a live semantic layer inside AI-assisted Bible study, sermon preparation, or theological research workflows.

**What's needed:** Thin wrapper around `glosser.js`. The input/output contract already exists.

## Open Questions

These are interesting but unvalidated. They represent research directions, not claims.

### Binyanim Prefix Dynamics

The blind prediction test validated binyanim as compositional (78.5% accuracy), but the prefix letter dynamics hypothesis was only partially supported. Piel/Pual gemination as intensification: strong. Niphal/Hitpael: plausible. Hiphil/Hophal: weak.

The question: does Hei carry a different dynamic in prefix position than in root position? Or is the historical Semitic causative *h-* prefix phonological rather than semantic? Resolving this would clarify the boundary between where letter dynamics operate and where historical phonology takes over.

### Cantillation Correlation

The trope marks (taamei hamikra) encode phrase structure, emphasis, and pause across the entire Hebrew Bible. If relational dynamics correlate with cantillation patterns — if certain letter-rooted words cluster under certain trope marks — that would suggest the cantillation tradition was encoding similar dynamics in a musical register. Untested.

### Talmudic and Aramaic Application

Rabbinic literature operates with intensely compressed Hebrew and Aramaic where small lexical choices carry enormous legal weight. The dynamics haven't been validated on Aramaic or late Mishnaic Hebrew. If they hold, there's an application in halakhic analysis — reading the dynamics of legal terminology rather than just its lexical history. If they don't hold, that boundary is itself informative about the historical scope of the dynamics.

### 6Q as General Epistemology

The 6Q skeleton (Who/What/How/Where/When/Why mapped to 6 letters) was discovered independently in a knowledge management context (the NKB's 6Q framework) before the Hebrew mapping was found. The structural observation — that the first four questions are sequential and the last two (When, Why) require the earlier four — is an epistemological claim, not just a biblical one. Whether this has legs as a general framework for knowledge organization is an open question. The Hebrew corpus is evidence, not proof.

## What This Project Is Not

This is not a replacement for lexical translation, grammatical analysis, or contextual interpretation. It is a structural layer that sits alongside traditional scholarship. The dynamics describe the shape of meaning. Content fills the shape.

The 99.6% figure and the 78.5% figure are real, documented, and reproducible. They are also the product of a specific methodology with known limitations (heuristic root extraction, LLM evaluation, post-hoc failure investigation). The two genuine failures (earth, cold) and the Hiphil weakness are reported because honest edges define the framework better than inflated claims.

Contributions that test, challenge, or extend the framework are more valuable than contributions that confirm it.
