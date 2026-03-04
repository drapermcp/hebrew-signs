#!/usr/bin/env node
// hebrew-signs-glosser.js — Word-Level Dynamic Glosser
//
// Takes Hebrew text and produces word-by-word dynamic readings
// using the corrected 22-letter framework.
//
// For each word:
//   1. Detect and label prefixes (ב=Containment, ל=Direction, etc.)
//   2. Extract approximate 3-letter root
//   3. Compose root dynamics: R1(initiates) → R2(mediates) → R3(completes)
//   4. Note suffixes (grammatical, not dynamic)
//
// Usage:
//   node hebrew-signs-glosser.js "בראשית ברא אלהים"    # Gloss inline text
//   node hebrew-signs-glosser.js --verse Gen.1.1        # Gloss verse from corpus
//   node hebrew-signs-glosser.js --chapter Gen.1        # Gloss full chapter
//   node hebrew-signs-glosser.js --file input.txt       # Gloss file contents
//   node hebrew-signs-glosser.js --enrich               # Add LLM meaning lookups
//   node hebrew-signs-glosser.js --format interlinear   # Output as interlinear text
//   node hebrew-signs-glosser.js --format json          # Output as JSON (default)

const fs = require('fs');
const path = require('path');

// ─── Config ────────────────────────────────────────────────────────────────

const INPUT_DIR = path.join(__dirname, '..', 'data');
const CORPUS_FILE = path.join(INPUT_DIR, 'tanach-word-corpus.json');
const ROOTS_FILE = path.join(INPUT_DIR, 'extracted-roots.json');
const OUTPUT_DIR = path.join(INPUT_DIR, 'glosser-output');

const VERB_LOOKUP_FILE = path.join(INPUT_DIR, 'morphhb-verb-lookup.json');

const MODEL = 'grok-4-1-fast-non-reasoning';
const API_URL = 'https://api.x.ai/v1/chat/completions';
const API_KEY = process.env.XAI_API_KEY;
const REQUEST_DELAY_MS = 200;

// Binyan dynamic labels — neutral descriptors (not prefix-letter-based)
const BINYAN_LABELS = {
  'Qal':     null,                    // unmarked — base stem
  'Niphal':  '[received/reflected]',
  'Piel':    '[intensive]',
  'Pual':    '[intensive-received]',
  'Hiphil':  '[causative]',
  'Hophal':  '[causative-received]',
  'Hitpael': '[reflexive]'
};

// ─── The Corrected Framework ─────────────────────────────────────────────

const LETTER_DYNAMICS = {
  'א': { name: 'Aleph',   dynamic: 'Origination',      short: 'initiating, establishing presence',   sixQ: 'WHO' },
  'ב': { name: 'Bet',     dynamic: 'Containment',       short: 'enclosing, housing, giving form',     sixQ: 'WHAT' },
  'ג': { name: 'Gimel',   dynamic: 'Traversal',         short: 'journeying, process, crossing',       sixQ: 'HOW' },
  'ד': { name: 'Dalet',   dynamic: 'Passage',           short: 'directing through thresholds',         sixQ: 'WHERE' },
  'ה': { name: 'Hei',     dynamic: 'Revelation',        short: 'making visible, pointing to' },
  'ו': { name: 'Vav',     dynamic: 'Conjunction',       short: 'joining, binding, continuing' },
  'ז': { name: 'Zayin',   dynamic: 'Division',          short: 'cutting, separating forcefully' },
  'ח': { name: 'Chet',    dynamic: 'Vitalization',      short: 'animating with life-force' },
  'ט': { name: 'Tet',     dynamic: 'Materialization',   short: 'emerging physically, coiling' },
  'י': { name: 'Yud',     dynamic: 'Agency',            short: 'acting with purpose, the hand' },
  'כ': { name: 'Kaf',     dynamic: 'Actualization',     short: 'holding, measuring, realizing' },
  'ל': { name: 'Lamed',   dynamic: 'Direction',         short: 'pointing toward, purposing' },
  'מ': { name: 'Mem',     dynamic: 'Flow',              short: 'channeling from source' },
  'נ': { name: 'Nun',     dynamic: 'Propagation',       short: 'extending outward, multiplying' },
  'ס': { name: 'Samekh',  dynamic: 'Encirclement',      short: 'surrounding, supporting' },
  'ע': { name: 'Ayin',    dynamic: 'Perception',        short: 'seeing, beholding reality' },
  'פ': { name: 'Pe',      dynamic: 'Projection',        short: 'propelling outward, emanating' },
  'צ': { name: 'Tsadi',   dynamic: 'Alignment',         short: 'ordering toward justice' },
  'ק': { name: 'Qof',     dynamic: 'Summons',           short: 'calling from depth',                   sixQ: 'WHEN' },
  'ר': { name: 'Resh',    dynamic: 'Headship',          short: 'leading, advancing, seeing ahead' },
  'ש': { name: 'Shin',    dynamic: 'Intensification',   short: 'extending, amplifying, spreading' },
  'ת': { name: 'Tav',     dynamic: 'Completion',        short: 'marking endpoints, sealing',           sixQ: 'WHY' }
};

// Prefix dynamics — these letters serve as grammatical prefixes with dynamic meaning
const PREFIX_DYNAMICS = {
  'ב': { grammar: 'in/with', dynamic: 'Containment', reading: 'within' },
  'ה': { grammar: 'the', dynamic: 'Revelation', reading: 'the [specified]' },
  'ו': { grammar: 'and/then', dynamic: 'Conjunction', reading: 'and [joining]' },
  'כ': { grammar: 'like/as', dynamic: 'Actualization', reading: 'as [measured against]' },
  'ל': { grammar: 'to/for', dynamic: 'Direction', reading: 'toward' },
  'מ': { grammar: 'from', dynamic: 'Flow', reading: 'from [source]' },
  'ש': { grammar: 'that/which', dynamic: 'Intensification', reading: 'that [extending]' }
};

// Suffix descriptions (longest match first in labelSuffix)
const SUFFIX_INFO = {
  'ים': { grammar: 'masculine plural' },
  'ות': { grammar: 'feminine plural' },
  'ית': { grammar: 'feminine/abstract' },
  'ון': { grammar: 'diminutive/abstract' },
  'ה': { grammar: 'feminine/directional' },
  'ו': { grammar: 'his/him' },
  'י': { grammar: 'my/of' },
  'ם': { grammar: 'their (m)' },
  'ן': { grammar: 'their (f)' },
  'ת': { grammar: 'feminine/construct' },
  'ך': { grammar: 'your (m.sg)' },
  'הם': { grammar: 'their (m)' },
  'הן': { grammar: 'their (f)' },
  'יך': { grammar: 'your (pl)' },
  'ני': { grammar: 'me' },
  'נו': { grammar: 'us/our' },
  'כם': { grammar: 'your (m.pl)' },
  'כן': { grammar: 'your (f.pl)' }
};

// Valid prefix letters: dynamic prefixes + verb conjugation prefixes
// Dynamic: ב,ה,ו,כ,ל,מ,ש — these get dynamic labels in the output
// Verb conjugation: י (imperfect), ת (2nd/3rd fem), א (1st sg), נ (1st pl)
// Also: מ (participle), ה (hiphil) — overlap with dynamic
const VERB_CONJ_PREFIXES = {
  'י': { grammar: 'imperfect 3rd', label: 'verb prefix' },
  'ת': { grammar: 'imperfect 2nd/fem', label: 'verb prefix' },
  'א': { grammar: 'imperfect 1st', label: 'verb prefix' },
  'נ': { grammar: 'imperfect 1st pl', label: 'verb prefix' }
};

// Hebrew consonants (for stripping vowels/cantillation from pointed text)
const HEBREW_CONSONANTS = new Set('אבגדהוזחטיכלמנסעפצקרשתךםןףץ'.split(''));
// Map final forms to standard forms for dynamic lookup
const FINAL_FORMS = { 'ך': 'כ', 'ם': 'מ', 'ן': 'נ', 'ף': 'פ', 'ץ': 'צ' };

// ─── Helpers ─────────────────────────────────────────────────────────────

function stripToConsonantal(pointed) {
  // Remove vowels, cantillation marks, and maqaf; keep only consonants
  const result = [];
  for (const ch of pointed) {
    if (FINAL_FORMS[ch]) {
      result.push(FINAL_FORMS[ch]);
    } else if (HEBREW_CONSONANTS.has(ch)) {
      result.push(ch);
    }
  }
  return result.join('');
}

// Normalize a letter — map final forms to standard for dynamic lookup
function normalizeLetter(l) {
  return FINAL_FORMS[l] || l;
}

// Get dynamic for a letter (handling final forms)
function getDynamic(l) {
  const normalized = normalizeLetter(l);
  return LETTER_DYNAMICS[normalized] || null;
}

function loadJSON(filePath) {
  if (!fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// ─── Root Database ──────────────────────────────────────────────────────

let ROOT_DB = null; // { wordToRoot: Map<string, string>, knownRoots: Set<string> }

function buildRootDatabase() {
  const rootsData = loadJSON(ROOTS_FILE);
  if (!rootsData) return null;

  const wordToRoot = new Map();
  const knownRoots = new Set();
  const rootCounts = new Map(); // root → corpus count (for ranking)
  const seen = new Set();

  for (const letter of Object.keys(rootsData.letterPositions)) {
    for (const pos of ['R1', 'R2', 'R3']) {
      const entries = rootsData.letterPositions[letter] && rootsData.letterPositions[letter][pos];
      if (!entries) continue;
      for (const entry of entries) {
        if (seen.has(entry.root)) continue;
        seen.add(entry.root);

        const normRoot = entry.root.split('').map(normalizeLetter).join('');
        knownRoots.add(normRoot);
        rootCounts.set(normRoot, entry.count);

        for (const word of entry.words) {
          const normWord = word.split('').map(normalizeLetter).join('');
          // Keep higher-count root if multiple claim same word
          const existing = wordToRoot.get(normWord);
          if (!existing || entry.count > existing.count) {
            wordToRoot.set(normWord, { root: normRoot, count: entry.count });
          }
        }
      }
    }
  }

  return { wordToRoot, knownRoots, rootCounts };
}

// Try to find a known 3-letter root within the word by testing all prefix lengths (0-3).
// If multiple decompositions are valid, picks the one with the highest-frequency root.
// Returns { prefixLetters, rootLetters, suffixLetters } or null.
function findKnownRoot(letters, knownRoots, rootCounts) {
  const maxPrefix = Math.min(3, letters.length - 3);
  let best = null;
  let bestCount = -1;

  for (let p = 0; p <= maxPrefix; p++) {
    // Validate prefix: each letter must be a dynamic prefix or verb conjugation prefix
    if (p > 0) {
      const prefLetter = normalizeLetter(letters[p - 1]);
      if (!PREFIX_DYNAMICS[prefLetter] && !VERB_CONJ_PREFIXES[prefLetter]) break;
    }

    const candidateRoot = letters.slice(p, p + 3).map(normalizeLetter).join('');
    if (knownRoots.has(candidateRoot)) {
      const count = rootCounts ? (rootCounts.get(candidateRoot) || 0) : 0;
      // Prefer higher-frequency root; on tie, prefer less stripping (smaller p)
      if (count > bestCount) {
        bestCount = count;
        best = {
          prefixLetters: letters.slice(0, p),
          rootLetters: letters.slice(p, p + 3),
          suffixLetters: letters.slice(p + 3)
        };
      }
    }
  }
  return best;
}

// Label suffix letters with grammatical info
// Checks both raw (with final forms) and normalized (standard forms) against SUFFIX_INFO
function labelSuffix(suffixLetters) {
  if (suffixLetters.length === 0) return [];
  const raw = suffixLetters.join('');
  const normStr = suffixLetters.map(normalizeLetter).join('');

  // Helper: check a string against SUFFIX_INFO
  function lookup(s) { return SUFFIX_INFO[s] || null; }

  // Try full string (both raw and normalized)
  let info = lookup(raw) || lookup(normStr);
  if (info) return [{ suffix: raw, grammar: info.grammar }];

  // Try first 2 characters
  if (raw.length >= 2) {
    info = lookup(raw.slice(0, 2)) || lookup(normStr.slice(0, 2));
    if (info) {
      if (raw.length === 2) return [{ suffix: raw, grammar: info.grammar }];
      const rem = lookup(raw.slice(2)) || lookup(normStr.slice(2));
      return [{ suffix: raw, grammar: info.grammar + (rem ? ' + ' + rem.grammar : '') }];
    }
  }

  // Try last 2 characters
  if (raw.length >= 2) {
    info = lookup(raw.slice(-2)) || lookup(normStr.slice(-2));
    if (info) return [{ suffix: raw, grammar: info.grammar }];
  }

  // Try single-letter
  if (raw.length === 1) {
    info = lookup(raw) || lookup(normStr);
    if (info) return [{ suffix: raw, grammar: info.grammar }];
  }

  return [{ suffix: raw, grammar: 'suffix' }];
}

// ─── Verb Lookup (binyan detection via MorphHB) ─────────────────────────

let VERB_LOOKUP = null; // pointed-form → { b: binyan, s: strongs }

function loadVerbLookup() {
  const data = loadJSON(VERB_LOOKUP_FILE);
  if (!data || !data.lookup) return null;
  return data.lookup;
}

function enrichBinyan(result) {
  if (!VERB_LOOKUP || !result.pointed) return;

  const key = result.pointed.normalize('NFC');
  const entry = VERB_LOOKUP[key];
  if (!entry) return;

  result.isVerb = true;
  result.binyan = entry.b;

  const label = BINYAN_LABELS[entry.b];
  if (label) {
    result.binyanDynamic = label;
    // Rebuild compositeDynamic: insert binyan label before root dynamics
    const parts = [];
    for (const p of result.prefixes) {
      if (PREFIX_DYNAMICS[normalizeLetter(p.letter)]) {
        parts.push(`[${p.dynamic}: ${p.reading}]`);
      } else {
        parts.push(`[${p.grammar}]`);
      }
    }
    parts.push(`${label} ${result.rootDynamic}`);
    if (result.suffixes.length > 0) {
      parts.push(`(${result.suffixes.map(s => s.grammar).join(', ')})`);
    }
    result.compositeDynamic = parts.join(' + ');
  }
}

// ─── Word Analysis ───────────────────────────────────────────────────────

function analyzeWord(consonantal) {
  const letters = consonantal.split('');
  const result = {
    word: consonantal,
    letters: letters.map(l => {
      const d = getDynamic(l);
      return { letter: l, name: d?.name || '?', dynamic: d?.dynamic || '?' };
    }),
    prefixes: [],
    root: null,
    rootDynamic: null,
    suffixes: [],
    compositeDynamic: '',
    letterByLetter: ''
  };

  // Very short words — just read letter by letter
  if (letters.length <= 2) {
    result.letterByLetter = letters
      .map(l => getDynamic(l)?.dynamic || '?')
      .join(' → ');
    result.compositeDynamic = result.letterByLetter;
    return result;
  }

  // ── Step 1: Decompose (prefix / root / suffix) ──
  let prefixLetters = [];
  let rootLetters = [];
  let suffixLetters = [];
  let decomposed = false;

  if (ROOT_DB) {
    const normalized = letters.map(normalizeLetter).join('');

    // Strategy A: direct word→root lookup (most reliable)
    const lookup = ROOT_DB.wordToRoot.get(normalized);
    if (lookup) {
      // Find the root position within the word
      const rootArr = lookup.root.split('');
      for (let p = 0; p <= letters.length - 3; p++) {
        const candidate = letters.slice(p, p + 3).map(normalizeLetter);
        if (candidate.length === 3 &&
            candidate[0] === rootArr[0] &&
            candidate[1] === rootArr[1] &&
            candidate[2] === rootArr[2]) {
          prefixLetters = letters.slice(0, p);
          rootLetters = letters.slice(p, p + 3);
          suffixLetters = letters.slice(p + 3);
          decomposed = true;
          break;
        }
      }
    }

    // Strategy B: strip prefixes and check for known root (prefer highest-frequency root)
    if (!decomposed) {
      const found = findKnownRoot(letters, ROOT_DB.knownRoots, ROOT_DB.rootCounts);
      if (found) {
        prefixLetters = found.prefixLetters;
        rootLetters = found.rootLetters;
        suffixLetters = found.suffixLetters;
        decomposed = true;
      }
    }
  }

  // Strategy C: heuristic fallback (no database match)
  if (!decomposed) {
    let working = [...letters];

    // Strip dynamic prefixes (max 2, conservative with ש)
    while (working.length > 3 && prefixLetters.length < 2) {
      const norm = normalizeLetter(working[0]);
      if (!PREFIX_DYNAMICS[norm]) break;
      if (norm === 'ש' && working.length <= 4) break;
      prefixLetters.push(working.shift());
    }

    // If exactly 3 remain, that's the root
    if (working.length === 3) {
      rootLetters = working;
    } else {
      // Try stripping common suffixes to reach 3
      const tryWork = [...working];
      if (tryWork.length > 3) {
        const last2 = tryWork.slice(-2).map(normalizeLetter).join('');
        if (SUFFIX_INFO[last2] && tryWork.length - 2 >= 3) {
          suffixLetters = tryWork.splice(-2);
          rootLetters = tryWork;
        } else {
          const lastN = normalizeLetter(tryWork[tryWork.length - 1]);
          if (SUFFIX_INFO[lastN] && tryWork.length - 1 >= 3) {
            suffixLetters = [tryWork.pop()];
            rootLetters = tryWork;
          } else {
            rootLetters = tryWork;
          }
        }
      } else {
        rootLetters = working;
      }
    }
  }

  // ── Step 2: Build prefix info ──
  result.prefixes = prefixLetters.map(l => {
    const norm = normalizeLetter(l);
    const d = getDynamic(l);
    const pd = PREFIX_DYNAMICS[norm];
    const vc = VERB_CONJ_PREFIXES[norm];
    if (pd) {
      return { letter: l, name: d?.name || '?', grammar: pd.grammar, dynamic: pd.dynamic, reading: pd.reading };
    } else if (vc) {
      return { letter: l, name: d?.name || '?', grammar: vc.grammar, dynamic: d?.dynamic || '?', reading: vc.label };
    } else {
      return { letter: l, name: d?.name || '?', grammar: '?', dynamic: d?.dynamic || '?', reading: '?' };
    }
  });

  // ── Step 3: Build root info ──
  if (rootLetters.length === 3) {
    const r1 = getDynamic(rootLetters[0]);
    const r2 = getDynamic(rootLetters[1]);
    const r3 = getDynamic(rootLetters[2]);
    result.root = {
      letters: rootLetters.join(''),
      r1: { letter: rootLetters[0], name: r1?.name, dynamic: r1?.dynamic, role: 'initiates' },
      r2: { letter: rootLetters[1], name: r2?.name, dynamic: r2?.dynamic, role: 'mediates' },
      r3: { letter: rootLetters[2], name: r3?.name, dynamic: r3?.dynamic, role: 'completes' }
    };
    result.rootDynamic = `${r1?.dynamic}(${r1?.short}) → ${r2?.dynamic}(${r2?.short}) → ${r3?.dynamic}(${r3?.short})`;
  } else if (rootLetters.length === 4) {
    result.root = {
      letters: rootLetters.join(''),
      extended: true,
      dynamics: rootLetters.map((l, i) => {
        const d = getDynamic(l);
        return {
          letter: l, name: d?.name, dynamic: d?.dynamic,
          role: i === 0 ? 'initiates' : i === rootLetters.length - 1 ? 'completes' : 'mediates'
        };
      })
    };
    result.rootDynamic = rootLetters.map(l => getDynamic(l)?.dynamic || '?').join(' → ');
  } else {
    result.root = {
      letters: rootLetters.join(''),
      raw: true,
      dynamics: rootLetters.map(l => {
        const d = getDynamic(l);
        return { letter: l, name: d?.name, dynamic: d?.dynamic };
      })
    };
    result.rootDynamic = rootLetters.map(l => getDynamic(l)?.dynamic || '?').join(' → ');
  }

  // ── Step 4: Build suffix info ──
  if (suffixLetters.length > 0 && result.suffixes.length === 0) {
    result.suffixes = labelSuffix(suffixLetters);
  }

  // ── Step 5: Composite dynamic ──
  const parts = [];
  for (const p of result.prefixes) {
    if (PREFIX_DYNAMICS[normalizeLetter(p.letter)]) {
      parts.push(`[${p.dynamic}: ${p.reading}]`);
    } else {
      parts.push(`[${p.grammar}]`);
    }
  }
  parts.push(result.rootDynamic);
  if (result.suffixes.length > 0) {
    parts.push(`(${result.suffixes.map(s => s.grammar).join(', ')})`);
  }
  result.compositeDynamic = parts.join(' + ');

  // Letter-by-letter reading (full word, no stripping)
  result.letterByLetter = letters
    .map(l => getDynamic(l)?.dynamic || '?')
    .join(' → ');

  return result;
}

// ─── Verse/Chapter lookup from corpus ────────────────────────────────────

function lookupVerse(corpus, bookName, chapter, verse) {
  return corpus.words.filter(w =>
    w.book === bookName && w.chapter === chapter && w.verse === verse
  ).sort((a, b) => a.position_in_verse - b.position_in_verse);
}

function lookupChapter(corpus, bookName, chapter) {
  return corpus.words.filter(w =>
    w.book === bookName && w.chapter === chapter
  ).sort((a, b) => {
    if (a.verse !== b.verse) return a.verse - b.verse;
    return a.position_in_verse - b.position_in_verse;
  });
}

function lookupVerseRange(corpus, bookName, chapter, startVerse, endVerse) {
  return corpus.words.filter(w =>
    w.book === bookName && w.chapter === chapter && w.verse >= startVerse && w.verse <= endVerse
  ).sort((a, b) => {
    if (a.verse !== b.verse) return a.verse - b.verse;
    return a.position_in_verse - b.position_in_verse;
  });
}

// Normalize book names
const BOOK_ALIASES = {
  'gen': 'Genesis', 'genesis': 'Genesis',
  'exo': 'Exodus', 'exodus': 'Exodus', 'ex': 'Exodus',
  'lev': 'Leviticus', 'leviticus': 'Leviticus',
  'num': 'Numbers', 'numbers': 'Numbers',
  'deu': 'Deuteronomy', 'deut': 'Deuteronomy', 'deuteronomy': 'Deuteronomy',
  'psa': 'Psalms', 'psalm': 'Psalms', 'psalms': 'Psalms', 'ps': 'Psalms',
  'pro': 'Proverbs', 'proverbs': 'Proverbs', 'prov': 'Proverbs',
  'isa': 'Isaiah', 'isaiah': 'Isaiah',
  'jer': 'Jeremiah', 'jeremiah': 'Jeremiah',
  'lam': 'Lamentations', 'lamentations': 'Lamentations',
  'eze': 'Ezekiel', 'ezekiel': 'Ezekiel',
  'dan': 'Daniel', 'daniel': 'Daniel',
  'rut': 'Ruth', 'ruth': 'Ruth',
  'jos': 'Joshua', 'joshua': 'Joshua',
  'jdg': 'Judges', 'judges': 'Judges',
  '1sa': '1 Samuel', '2sa': '2 Samuel',
  '1ki': '1 Kings', '2ki': '2 Kings',
  '1ch': '1 Chronicles', '2ch': '2 Chronicles',
  'job': 'Job',
  'ecc': 'Ecclesiastes', 'ecclesiastes': 'Ecclesiastes',
  'sos': 'Song of Solomon', 'song': 'Song of Solomon',
  'hos': 'Hosea', 'joe': 'Joel', 'amo': 'Amos',
  'oba': 'Obadiah', 'jon': 'Jonah', 'mic': 'Micah',
  'nah': 'Nahum', 'hab': 'Habakkuk', 'zep': 'Zephaniah',
  'hag': 'Haggai', 'zec': 'Zechariah', 'mal': 'Malachi',
  'ezr': 'Ezra', 'neh': 'Nehemiah', 'est': 'Esther'
};

function parseReference(ref) {
  // Parse "Gen.1.1" or "Genesis 1:1" or "gen1:1"
  const cleaned = ref.replace(/[._]/g, ' ').replace(/:/, ' ').trim();
  const parts = cleaned.split(/\s+/);

  let book = parts[0].toLowerCase();
  book = BOOK_ALIASES[book] || parts[0];

  const chapter = parseInt(parts[1]) || 1;
  const verse = parts[2] ? parseInt(parts[2]) : null;

  return { book, chapter, verse };
}

// ─── LLM enrichment — add traditional meanings ──────────────────────────

async function enrichWithMeanings(words) {
  // Build a list of unique full words (pointed if available, else consonantal)
  // Keyed by consonantal form so we can map back
  const wordList = [];
  const seen = new Set();
  for (const w of words) {
    const key = w.word;
    if (!seen.has(key)) {
      seen.add(key);
      const display = w.pointed || w.word;
      const prefixNote = w.prefixes.length > 0
        ? ` (prefix: ${w.prefixes.map(p => p.letter + '=' + p.grammar).join(', ')})`
        : '';
      wordList.push({ key, display, prefixNote });
    }
  }
  if (wordList.length === 0) return words;

  const wordLines = wordList.map(w => `  ${w.display}${w.prefixNote}`).join('\n');

  const prompt = `For each Hebrew word below (from biblical text), give the English meaning of the FULL WORD as it appears in context. Include prefix meanings. Keep each meaning to 2-5 words.

Return JSON: {"meanings": {"consonantal_form": "english meaning", ...}}

Words:
${wordLines}

Use these consonantal forms as keys: ${wordList.map(w => w.key).join(', ')}`;

  try {
    const resp = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${API_KEY}` },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: 'system', content: 'You are a biblical Hebrew lexicographer. Give concise word meanings for the full inflected forms as they appear in biblical text.' },
          { role: 'user', content: prompt }
        ],
        temperature: 0.1,
        max_tokens: 2000
      })
    });

    if (resp.ok) {
      const data = await resp.json();
      const jsonMatch = data.choices[0].message.content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        if (parsed.meanings) {
          for (const w of words) {
            if (parsed.meanings[w.word]) {
              w.meaning = parsed.meanings[w.word];
            }
          }
        }
      }
    }
  } catch (err) {
    console.error(`  Enrichment error: ${err.message}`);
  }

  return words;
}

// ─── Output formatters ───────────────────────────────────────────────────

function formatInterlinear(words, verseNum = null) {
  const lines = [];
  if (verseNum !== null) lines.push(`\n── Verse ${verseNum} ──`);

  for (const w of words) {
    lines.push('');
    lines.push(`  ${w.word}  ${w.pointed || ''}`);
    if (w.meaning) lines.push(`  Meaning: ${w.meaning}`);

    // Prefix layer
    if (w.prefixes.length > 0) {
      const prefixStr = w.prefixes.map(p => `${p.letter}(${p.dynamic}: "${p.grammar}")`).join(' + ');
      lines.push(`  Prefix: ${prefixStr}`);
    }

    // Root layer
    if (w.root && !w.root.raw && !w.root.extended) {
      lines.push(`  Root: ${w.root.letters}`);
      lines.push(`    R1 ${w.root.r1.letter} ${w.root.r1.name}: ${w.root.r1.dynamic} [${w.root.r1.role}]`);
      lines.push(`    R2 ${w.root.r2.letter} ${w.root.r2.name}: ${w.root.r2.dynamic} [${w.root.r2.role}]`);
      lines.push(`    R3 ${w.root.r3.letter} ${w.root.r3.name}: ${w.root.r3.dynamic} [${w.root.r3.role}]`);
    } else if (w.root) {
      lines.push(`  Letters: ${w.root.letters} (${w.rootDynamic})`);
    }

    // Suffix layer
    if (w.suffixes.length > 0) {
      lines.push(`  Suffix: ${w.suffixes.map(s => `${s.suffix} (${s.grammar})`).join(', ')}`);
    }

    // Composite
    lines.push(`  Dynamic: ${w.compositeDynamic}`);
    lines.push(`  Full: ${w.letterByLetter}`);
  }

  return lines.join('\n');
}

function formatCompact(words, verseNum = null) {
  const lines = [];
  if (verseNum !== null) lines.push(`\n── ${verseNum} ──`);

  for (const w of words) {
    const meaning = w.meaning ? ` "${w.meaning}"` : '';
    const prefixStr = w.prefixes.length > 0
      ? w.prefixes.map(p => `[${p.dynamic}]`).join('') + ' + '
      : '';
    lines.push(`  ${w.word}${meaning}: ${prefixStr}${w.rootDynamic || w.letterByLetter}`);
  }

  return lines.join('\n');
}

// ─── Main ────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);

  const verseIdx = args.indexOf('--verse');
  const versesIdx = args.indexOf('--verses');
  const chapterIdx = args.indexOf('--chapter');
  const formatIdx = args.indexOf('--format');
  const doEnrich = args.includes('--enrich');
  const format = formatIdx >= 0 ? args[formatIdx + 1] : 'interlinear';
  const isCompact = format === 'compact';

  // Load root database
  console.log('Loading root database...');
  ROOT_DB = buildRootDatabase();
  if (ROOT_DB) {
    console.log(`  ${ROOT_DB.knownRoots.size} known roots, ${ROOT_DB.wordToRoot.size} word forms`);
  } else {
    console.log('  WARNING: Root database not found, using heuristic only');
  }

  // Load verb lookup for binyan detection
  VERB_LOOKUP = loadVerbLookup();
  if (VERB_LOOKUP) {
    console.log(`  ${Object.keys(VERB_LOOKUP).length} verb forms loaded (binyan detection)`);
  } else {
    console.log('  Verb lookup not found — run morphhb-extract.js --verb-lookup to generate');
  }

  let corpus = null;
  let outputWords = [];
  let outputMeta = {};

  // Mode 1: Verse reference (single, range, or chapter)
  if (versesIdx >= 0 || verseIdx >= 0 || chapterIdx >= 0) {
    const isVerseRange = versesIdx >= 0;
    const isChapter = chapterIdx >= 0 && !isVerseRange;

    let ref, startVerse, endVerse;
    if (isVerseRange) {
      // Parse "Deu.6.4-9" → book=Deuteronomy, chapter=6, range 4-9
      const rangeArg = args[versesIdx + 1];
      const rangeParts = rangeArg.replace(/[._]/g, ' ').replace(/:/, ' ').trim().split(/\s+/);
      const bookKey = rangeParts[0].toLowerCase();
      const book = BOOK_ALIASES[bookKey] || rangeParts[0];
      const chapter = parseInt(rangeParts[1]) || 1;
      const versePart = rangeParts[2] || '1-1';
      const [sv, ev] = versePart.split('-').map(Number);
      startVerse = sv;
      endVerse = ev || sv;
      ref = { book, chapter, verse: null };
    } else {
      ref = parseReference(args[(isChapter ? chapterIdx : verseIdx) + 1]);
    }

    console.log(`=== Hebrew Signs Dynamic Glosser ===`);
    console.log(`Loading corpus...`);
    corpus = loadJSON(CORPUS_FILE);
    if (!corpus) {
      console.error('ERROR: Cannot load corpus.');
      process.exit(1);
    }
    console.log(`  ${corpus.words.length.toLocaleString()} words loaded`);

    if (isVerseRange) {
      console.log(`\nGlossing: ${ref.book} ${ref.chapter}:${startVerse}-${endVerse}`);
      const words = lookupVerseRange(corpus, ref.book, ref.chapter, startVerse, endVerse);
      if (words.length === 0) {
        console.error(`No words found for ${ref.book} ${ref.chapter}:${startVerse}-${endVerse}`);
        process.exit(1);
      }

      const verses = {};
      for (const w of words) {
        if (!verses[w.verse]) verses[w.verse] = [];
        verses[w.verse].push(w);
      }

      outputMeta = { reference: `${ref.book} ${ref.chapter}`, verseRange: `${startVerse}-${endVerse}`, verseCount: Object.keys(verses).length, wordCount: words.length };

      for (const [vNum, vWords] of Object.entries(verses).sort((a, b) => a[0] - b[0])) {
        const analyzed = vWords.map(w => {
          const result = analyzeWord(w.word_consonantal);
          result.pointed = w.word_pointed;
          enrichBinyan(result);
          return result;
        });

        if (doEnrich) await enrichWithMeanings(analyzed);

        if (isCompact) {
          console.log(formatCompact(analyzed, vNum));
        } else {
          console.log(formatInterlinear(analyzed, vNum));
        }
        outputWords.push(...analyzed.map(a => ({ verse: parseInt(vNum), ...a })));
      }

    } else if (isChapter) {
      console.log(`\nGlossing: ${ref.book} ${ref.chapter}`);
      const words = lookupChapter(corpus, ref.book, ref.chapter);
      if (words.length === 0) {
        console.error(`No words found for ${ref.book} ${ref.chapter}`);
        process.exit(1);
      }

      // Group by verse
      const verses = {};
      for (const w of words) {
        if (!verses[w.verse]) verses[w.verse] = [];
        verses[w.verse].push(w);
      }

      outputMeta = { reference: `${ref.book} ${ref.chapter}`, verseCount: Object.keys(verses).length, wordCount: words.length };

      for (const [vNum, vWords] of Object.entries(verses).sort((a, b) => a[0] - b[0])) {
        const analyzed = vWords.map(w => {
          const result = analyzeWord(w.word_consonantal);
          result.pointed = w.word_pointed;
          enrichBinyan(result);
          return result;
        });

        if (doEnrich) await enrichWithMeanings(analyzed);

        if (isCompact) {
          console.log(formatCompact(analyzed, vNum));
        } else {
          console.log(formatInterlinear(analyzed, vNum));
        }
        outputWords.push(...analyzed.map(a => ({ verse: parseInt(vNum), ...a })));
      }

    } else {
      console.log(`\nGlossing: ${ref.book} ${ref.chapter}:${ref.verse}`);
      const words = lookupVerse(corpus, ref.book, ref.chapter, ref.verse);
      if (words.length === 0) {
        console.error(`No words found for ${ref.book} ${ref.chapter}:${ref.verse}`);
        process.exit(1);
      }

      outputMeta = { reference: `${ref.book} ${ref.chapter}:${ref.verse}`, wordCount: words.length };

      const analyzed = words.map(w => {
        const result = analyzeWord(w.word_consonantal);
        result.pointed = w.word_pointed;
        enrichBinyan(result);
        return result;
      });

      if (doEnrich) await enrichWithMeanings(analyzed);

      if (isCompact) {
        console.log(formatCompact(analyzed, ref.verse));
      } else {
        console.log(formatInterlinear(analyzed, ref.verse));
      }
      outputWords = analyzed;
    }

  // Mode 2: Inline Hebrew text
  } else {
    const text = args.filter(a => !a.startsWith('--')).join(' ');
    if (!text) {
      console.log('Usage:');
      console.log('  node hebrew-signs-glosser.js "בראשית ברא אלהים"');
      console.log('  node hebrew-signs-glosser.js --verse Gen.1.1 [--enrich]');
      console.log('  node hebrew-signs-glosser.js --verses Deu.6.4-9 [--enrich] [--format compact]');
      console.log('  node hebrew-signs-glosser.js --chapter Gen.1 [--enrich] [--format compact]');
      process.exit(0);
    }

    console.log(`=== Hebrew Signs Dynamic Glosser ===`);
    console.log(`Input: ${text}\n`);

    const hebrewWords = text.split(/\s+/).filter(w => w.length > 0);
    outputMeta = { input: text, wordCount: hebrewWords.length };

    const analyzed = hebrewWords.map(w => {
      const consonantal = stripToConsonantal(w);
      const result = analyzeWord(consonantal);
      result.pointed = w !== consonantal ? w : undefined;
      enrichBinyan(result);
      return result;
    });

    if (doEnrich) await enrichWithMeanings(analyzed);

    if (isCompact) {
      console.log(formatCompact(analyzed));
    } else {
      console.log(formatInterlinear(analyzed));
    }
    outputWords = analyzed;
  }

  // Save output
  if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  const outputFile = path.join(OUTPUT_DIR, `gloss-${Date.now()}.json`);
  const output = {
    type: 'hebrew-signs-dynamic-gloss',
    generated: new Date().toISOString(),
    framework: 'corrected-22-letter-dynamics',
    ...outputMeta,
    words: outputWords
  };

  fs.writeFileSync(outputFile, JSON.stringify(output, null, 2));
  console.log(`\nSaved to: ${outputFile}`);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
