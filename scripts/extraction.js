#!/usr/bin/env node
// hebrew-signs-extraction.js — Phase 1 of the Hebrew Signs Confirmation Project
// Establishes the canonical 22-letter framework and extracts every Hebrew word
// from the Tanach XML (UXLC Leningrad Codex) into a structured corpus.
//
// Usage:
//   node hebrew-signs-extraction.js              # Full extraction
//   node hebrew-signs-extraction.js --stats      # Stats only (no file write)
//   node hebrew-signs-extraction.js --framework  # Framework only

const fs = require('fs');
const path = require('path');

const XML_DIR = path.join(__dirname, '..', 'source-xml', 'Books');
const OUTPUT_DIR = path.join(__dirname, '..', 'data');
const FRAMEWORK_FILE = path.join(OUTPUT_DIR, 'canonical-framework.json');
const CORPUS_FILE = path.join(OUTPUT_DIR, 'tanach-word-corpus.json');

// ─── Canonical 22-Letter Framework ──────────────────────────────────────────
// Source: Daniel's hebrew-letter-symbolism-research.md
// Fixed: Position 11 = Kaf (כ), Position 19 = Qof (ק)
// The original doc had Kuf (ק) at both positions 11 and 19, omitting Kaf (כ)

const CANONICAL_FRAMEWORK = [
  {
    position: 1, letter: 'א', name: 'Aleph', unicode: '05D0',
    final_form: null, gematria: 1,
    meaning: 'Authority',
    expanded: 'As the inaugural letter, Aleph stands as a symbol of authority and the driving force behind all beginnings. It represents the inherent power and influence that comes with being the originator or primary force.',
    semantic_field: ['authority', 'origin', 'beginning', 'divine', 'leadership', 'first', 'primacy', 'source']
  },
  {
    position: 2, letter: 'ב', name: 'Bet', unicode: '05D1',
    final_form: null, gematria: 2,
    meaning: 'Creation',
    expanded: 'Encapsulates the essence of creation and manifestation. It represents the transition from thought to reality, from concept to creation, giving structure and substance to potential.',
    semantic_field: ['creation', 'house', 'dwelling', 'form', 'manifestation', 'structure', 'building', 'container']
  },
  {
    position: 3, letter: 'ג', name: 'Gimel', unicode: '05D2',
    final_form: null, gematria: 3,
    meaning: 'Causation',
    expanded: 'Encapsulates the intricate dance of causality that governs the universe. It underscores the principle that every action, thought, or occurrence is intrinsically linked to preceding causes and subsequent effects.',
    semantic_field: ['causation', 'movement', 'journey', 'cause-effect', 'growth', 'lifting', 'carrying', 'reward']
  },
  {
    position: 4, letter: 'ד', name: 'Dalet', unicode: '05D3',
    final_form: null, gematria: 4,
    meaning: 'Intersection',
    expanded: 'Embodies the profound juncture where the ethereal and tangible realms converge. It captures the moment of creation when a thought or intention crystallizes into tangible form.',
    semantic_field: ['intersection', 'door', 'pathway', 'threshold', 'convergence', 'access', 'material-immaterial', 'opening']
  },
  {
    position: 5, letter: 'ה', name: 'Hei', unicode: '05D4',
    final_form: null, gematria: 5,
    meaning: 'Revelation',
    expanded: 'Embodies the intricate dance of unveiling and comprehending the essence of truth. It signifies layers of discovery, where each revelation leads to deeper understanding and enlightenment.',
    semantic_field: ['revelation', 'breath', 'behold', 'window', 'understanding', 'unveiling', 'truth', 'discovery']
  },
  {
    position: 6, letter: 'ו', name: 'Vav', unicode: '05D5',
    final_form: null, gematria: 6,
    meaning: 'Connection',
    expanded: 'Stands as a testament to the power of intentional connections and relationships. It goes beyond mere physicality, delving into the realm of conscious decisions, intentions, and actions.',
    semantic_field: ['connection', 'hook', 'joining', 'bridge', 'and', 'relationship', 'binding', 'linking']
  },
  {
    position: 7, letter: 'ז', name: 'Zayin', unicode: '05D6',
    final_form: null, gematria: 7,
    meaning: 'Intervention',
    expanded: 'Encapsulates the profound interplay between predetermined paths and the power of individual agency. It emphasizes the moment when an individual steps in to alter a course or change an outcome.',
    semantic_field: ['intervention', 'weapon', 'cutting', 'sustenance', 'redirection', 'agency', 'action', 'time']
  },
  {
    position: 8, letter: 'ח', name: 'Chet', unicode: '05D7',
    final_form: null, gematria: 8,
    meaning: 'Possession',
    expanded: 'Signifies the profound responsibilities and privileges that come with possession. It emphasizes the deeper understanding and consciousness behind such actions.',
    semantic_field: ['possession', 'life', 'fence', 'enclosure', 'taking', 'living', 'vitality', 'grace']
  },
  {
    position: 9, letter: 'ט', name: 'Tet', unicode: '05D8',
    final_form: null, gematria: 9,
    meaning: 'Harvest',
    expanded: 'Represents the profound satisfaction and fulfillment derived from seeing one\'s efforts bear fruit. It emphasizes the reward that ensues after prolonged dedication and stewardship.',
    semantic_field: ['harvest', 'good', 'fruit', 'yield', 'benefit', 'realization', 'potential', 'reward']
  },
  {
    position: 10, letter: 'י', name: 'Yud', unicode: '05D9',
    final_form: null, gematria: 10,
    meaning: 'Desire and Action',
    expanded: 'Stands as a testament to the potency of desire and the dynamic expression of that longing through purposeful action. It represents the journey from desire to realization, from thought to action.',
    semantic_field: ['desire', 'hand', 'action', 'power', 'purpose', 'creative', 'reaching', 'making']
  },
  {
    position: 11, letter: 'כ', name: 'Kaf', unicode: '05DB',
    final_form: 'ך', gematria: 20,
    meaning: 'Dependence',
    expanded: 'Embodies the profound dynamics of dependence and the act of receiving. For humanity, it encapsulates our intrinsic nature to seek, consume, and be sustained by external elements.',
    semantic_field: ['dependence', 'palm', 'receiving', 'sustenance', 'containment', 'likeness', 'comparison', 'vessel']
  },
  {
    position: 12, letter: 'ל', name: 'Lamed', unicode: '05DC',
    final_form: null, gematria: 30,
    meaning: 'Learning',
    expanded: 'Emblematic of the intrinsic human quest for understanding and enlightenment. It underscores the pivotal role of guidance in our lives, whether leading or being led.',
    semantic_field: ['learning', 'teaching', 'guidance', 'toward', 'directing', 'goad', 'knowledge', 'instruction']
  },
  {
    position: 13, letter: 'מ', name: 'Mem', unicode: '05DE',
    final_form: 'ם', gematria: 40,
    meaning: 'Life',
    expanded: 'Delves into the profound nature of life\'s origin and the purity that courses through its essence. It encapsulates the continuous flow of truth and the sustaining force of life.',
    semantic_field: ['life', 'water', 'flow', 'purity', 'origin', 'sustaining', 'from', 'source']
  },
  {
    position: 14, letter: 'נ', name: 'Nun', unicode: '05E0',
    final_form: 'ן', gematria: 50,
    meaning: 'Seed',
    expanded: 'Stands as a symbol for the seed, the very crux of life and the dawn of new beginnings. It\'s a poignant reminder of the cyclical nature of existence.',
    semantic_field: ['seed', 'offspring', 'continuation', 'faithfulness', 'new-beginning', 'heir', 'sprouting', 'perpetuation']
  },
  {
    position: 15, letter: 'ס', name: 'Samekh', unicode: '05E1',
    final_form: null, gematria: 60,
    meaning: 'Protection',
    expanded: 'Embodies the profound concept of safeguarding and fortifying against adversities. It stands as a symbol of protection, akin to a steadfast shield.',
    semantic_field: ['protection', 'support', 'shield', 'encirclement', 'fortification', 'sustaining', 'upholding', 'covering']
  },
  {
    position: 16, letter: 'ע', name: 'Ayin', unicode: '05E2',
    final_form: null, gematria: 70,
    meaning: 'Perception',
    expanded: 'Symbolizes the multifaceted nature of perception. It captures the profound ability to perceive realities that lie beyond the evident.',
    semantic_field: ['perception', 'eye', 'seeing', 'insight', 'watchfulness', 'witness', 'experience', 'understanding']
  },
  {
    position: 17, letter: 'פ', name: 'Pe', unicode: '05E4',
    final_form: 'ף', gematria: 80,
    meaning: 'Speech',
    expanded: 'Serves as a symbol for the transformative power of communication and the creative act of expression. It embodies the idea that language shapes our reality.',
    semantic_field: ['speech', 'mouth', 'expression', 'word', 'communication', 'utterance', 'declaration', 'edge']
  },
  {
    position: 18, letter: 'צ', name: 'Tsadi', unicode: '05E6',
    final_form: 'ץ', gematria: 90,
    meaning: 'Righteousness',
    expanded: 'Carries profound symbolism related to the principles of righteousness and moral order. It serves as a symbol for "The Way" or the path leading to absolute truth.',
    semantic_field: ['righteousness', 'justice', 'way', 'moral-order', 'truth', 'right-path', 'purity', 'hunt']
  },
  {
    position: 19, letter: 'ק', name: 'Qof', unicode: '05E7',
    final_form: null, gematria: 100,
    meaning: 'Present Moment',
    expanded: 'Holds profound symbolism related to the concept of the present moment and its relationship with the broader scope of time and existence.',
    semantic_field: ['present-moment', 'holiness', 'time', 'now', 'calling', 'sanctification', 'summoning', 'cycle']
  },
  {
    position: 20, letter: 'ר', name: 'Resh', unicode: '05E8',
    final_form: null, gematria: 200,
    meaning: 'Intellect',
    expanded: 'Carries profound symbolism related to the intellect, moral awareness, and the nature of conscious beings endowed with free will.',
    semantic_field: ['intellect', 'head', 'thought', 'consciousness', 'awareness', 'moral', 'chief', 'beginning']
  },
  {
    position: 21, letter: 'ש', name: 'Shin', unicode: '05E9',
    final_form: null, gematria: 300,
    meaning: 'Separation',
    expanded: 'Embodies the act of separation and discernment, akin to judgment. It signifies the transformative power of refinement, where falsehood is separated from truth.',
    semantic_field: ['separation', 'fire', 'discernment', 'judgment', 'teeth', 'consuming', 'refining', 'dividing']
  },
  {
    position: 22, letter: 'ת', name: 'Tav', unicode: '05EA',
    final_form: null, gematria: 400,
    meaning: 'Mark',
    expanded: 'Not merely a destination but a symbolic mark on our endless journey of exploration and discovery of truth. It signifies our highest desire, which is the infinite.',
    semantic_field: ['mark', 'sign', 'covenant', 'completion', 'truth', 'seal', 'cross', 'destination']
  },
];

// Map final forms to their base letter
const FINAL_TO_BASE = {
  'ך': 'כ', // Kaf sofit
  'ם': 'מ', // Mem sofit
  'ן': 'נ', // Nun sofit
  'ף': 'פ', // Pe sofit
  'ץ': 'צ', // Tsadi sofit
};

// Hebrew consonants (base forms only)
const HEBREW_CONSONANTS = new Set(CANONICAL_FRAMEWORK.map(l => l.letter));
// Add final forms
for (const f of Object.keys(FINAL_TO_BASE)) {
  HEBREW_CONSONANTS.add(f);
}

// ─── XML Book file mapping ──────────────────────────────────────────────────
// Skip .DH.xml (documentary hypothesis variants)
const BOOK_FILES = [
  ['Genesis.xml', 'Genesis'], ['Exodus.xml', 'Exodus'],
  ['Leviticus.xml', 'Leviticus'], ['Numbers.xml', 'Numbers'],
  ['Deuteronomy.xml', 'Deuteronomy'], ['Joshua.xml', 'Joshua'],
  ['Judges.xml', 'Judges'], ['Samuel_1.xml', '1 Samuel'],
  ['Samuel_2.xml', '2 Samuel'], ['Kings_1.xml', '1 Kings'],
  ['Kings_2.xml', '2 Kings'], ['Isaiah.xml', 'Isaiah'],
  ['Jeremiah.xml', 'Jeremiah'], ['Ezekiel.xml', 'Ezekiel'],
  ['Hosea.xml', 'Hosea'], ['Joel.xml', 'Joel'],
  ['Amos.xml', 'Amos'], ['Obadiah.xml', 'Obadiah'],
  ['Jonah.xml', 'Jonah'], ['Micah.xml', 'Micah'],
  ['Nahum.xml', 'Nahum'], ['Habakkuk.xml', 'Habakkuk'],
  ['Zephaniah.xml', 'Zephaniah'], ['Haggai.xml', 'Haggai'],
  ['Zechariah.xml', 'Zechariah'], ['Malachi.xml', 'Malachi'],
  ['Psalms.xml', 'Psalms'], ['Proverbs.xml', 'Proverbs'],
  ['Job.xml', 'Job'], ['Song_of_Songs.xml', 'Song of Solomon'],
  ['Ruth.xml', 'Ruth'], ['Lamentations.xml', 'Lamentations'],
  ['Ecclesiastes.xml', 'Ecclesiastes'], ['Esther.xml', 'Esther'],
  ['Daniel.xml', 'Daniel'], ['Ezra.xml', 'Ezra'],
  ['Nehemiah.xml', 'Nehemiah'], ['Chronicles_1.xml', '1 Chronicles'],
  ['Chronicles_2.xml', '2 Chronicles'],
];

// ─── Unicode stripping ──────────────────────────────────────────────────────

function stripToConsonants(pointed) {
  // Remove everything that isn't a Hebrew consonant (base or final form)
  // This strips: nikkud (vowel points), cantillation marks, maqaf, sof pasuq,
  // CGJ (U+034F), zero-width chars, etc.
  const consonants = [];
  for (const ch of pointed) {
    if (HEBREW_CONSONANTS.has(ch)) {
      consonants.push(ch);
    }
  }
  return consonants.join('');
}

function toBaseLetters(consonantal) {
  // Normalize final forms to base forms
  const letters = [];
  for (const ch of consonantal) {
    letters.push(FINAL_TO_BASE[ch] || ch);
  }
  return letters;
}

// ─── Simple XML parser for Tanach structure ─────────────────────────────────
// We don't need a full XML parser — the structure is very regular:
//   <c n="1"> ... <v n="1"> <w>word</w> <w>word</w> ... </v> ... </c>

function extractWords(xmlContent, bookName) {
  const words = [];
  let currentChapter = 0;
  let currentVerse = 0;
  let posInVerse = 0;

  // Process line by line
  for (const line of xmlContent.split('\n')) {
    const trimmed = line.trim();

    // Chapter marker
    const chMatch = trimmed.match(/<c\s+n="(\d+)"/);
    if (chMatch) {
      currentChapter = parseInt(chMatch[1]);
      continue;
    }

    // Verse marker
    const vMatch = trimmed.match(/<v\s+n="(\d+)"/);
    if (vMatch) {
      currentVerse = parseInt(vMatch[1]);
      posInVerse = 0;
      continue;
    }

    // Word tags — can have multiple per line, or one per line
    // Use a greedy match to handle inner tags like <s t="large">ע</s> and <x>5</x>
    const wordMatches = trimmed.matchAll(/<w>(.*?)<\/w>/g);
    for (const wm of wordMatches) {
      if (currentChapter === 0 || currentVerse === 0) continue;

      posInVerse++;
      // Strip inner markup: remove <x>...</x> entirely (metadata notes), keep text from <s>...</s> (special letters)
      const pointed = wm[1].replace(/<x>[^<]*<\/x>/g, '').replace(/<[^>]+>/g, '').trim();
      // Skip empty or purely punctuation
      if (!pointed) continue;

      const consonantal = stripToConsonants(pointed);
      if (consonantal.length === 0) continue;

      const letters = toBaseLetters(consonantal);

      words.push({
        word_pointed: pointed,
        word_consonantal: consonantal,
        letters,
        book: bookName,
        chapter: currentChapter,
        verse: currentVerse,
        position_in_verse: posInVerse,
      });
    }

    // Also handle <q> (qere) and <k> (ketiv) tags
    const qereMatches = trimmed.matchAll(/<q>([^<]+)<\/q>/g);
    for (const qm of qereMatches) {
      if (currentChapter === 0 || currentVerse === 0) continue;
      const pointed = qm[1].trim();
      if (!pointed) continue;
      const consonantal = stripToConsonants(pointed);
      if (consonantal.length === 0) continue;
      const letters = toBaseLetters(consonantal);

      words.push({
        word_pointed: pointed,
        word_consonantal: consonantal,
        letters,
        book: bookName,
        chapter: currentChapter,
        verse: currentVerse,
        position_in_verse: posInVerse,
        qere: true,
      });
    }
  }

  return words;
}

// ─── Main ───────────────────────────────────────────────────────────────────

function main() {
  const args = process.argv.slice(2);
  const statsOnly = args.includes('--stats');
  const frameworkOnly = args.includes('--framework');

  console.log('=== NKB Hebrew Signs Extraction (Phase 1) ===');
  console.log(`Date: ${new Date().toISOString().split('T')[0]}`);
  console.log('');

  // ── Step 1a: Write canonical framework ──────────────────────────────────
  console.log('── Step 1a: Canonical 22-Letter Framework ──');
  console.log(`Letters: ${CANONICAL_FRAMEWORK.length}`);
  for (const l of CANONICAL_FRAMEWORK) {
    console.log(`  ${l.position.toString().padStart(2)}. ${l.letter} ${l.name.padEnd(8)} — ${l.meaning}`);
  }

  if (!statsOnly) {
    const frameworkOutput = {
      type: 'hebrew-signs-canonical-framework',
      description: 'Daniel\'s 22-letter Hebrew sign framework with semantic fields for computational testing',
      source: 'nodes/insights/insights/hebrew-letter-symbolism-research.md',
      corrections: ['Position 11: Kaf (כ) restored (was duplicated as Kuf/Qof)', 'Position 19: Qof (ק) correctly placed'],
      generated: new Date().toISOString(),
      letters: CANONICAL_FRAMEWORK,
    };
    fs.writeFileSync(FRAMEWORK_FILE, JSON.stringify(frameworkOutput, null, 2));
    console.log(`\nWritten to: ${FRAMEWORK_FILE}`);
  }

  if (frameworkOnly) return;

  // ── Step 1b: Extract word corpus from Tanach XML ────────────────────────
  console.log('\n── Step 1b: Tanach Word Corpus Extraction ──');

  const allWords = [];
  let booksProcessed = 0;
  let booksNotFound = 0;
  const bookStats = [];

  for (const [filename, bookName] of BOOK_FILES) {
    const filePath = path.join(XML_DIR, filename);
    if (!fs.existsSync(filePath)) {
      console.log(`  SKIP: ${filename} not found`);
      booksNotFound++;
      continue;
    }

    const content = fs.readFileSync(filePath, 'utf-8');
    const words = extractWords(content, bookName);
    allWords.push(...words);
    booksProcessed++;

    const uniqueForms = new Set(words.map(w => w.word_consonantal)).size;
    bookStats.push({ book: bookName, words: words.length, unique: uniqueForms });

    if (booksProcessed % 10 === 0) {
      console.log(`  Processed ${booksProcessed} books (${allWords.length.toLocaleString()} words)...`);
    }
  }

  // ── Compute statistics ──────────────────────────────────────────────────
  const uniqueConsonantal = new Set(allWords.map(w => w.word_consonantal));
  const uniquePointed = new Set(allWords.map(w => w.word_pointed));

  // Letter frequency
  const letterFreq = {};
  const initialLetterFreq = {};
  const finalLetterFreq = {};
  let totalLetters = 0;

  for (const l of CANONICAL_FRAMEWORK) {
    letterFreq[l.letter] = 0;
    initialLetterFreq[l.letter] = 0;
    finalLetterFreq[l.letter] = 0;
  }

  for (const w of allWords) {
    for (let i = 0; i < w.letters.length; i++) {
      const ch = w.letters[i];
      if (letterFreq[ch] !== undefined) {
        letterFreq[ch]++;
        totalLetters++;
        if (i === 0) initialLetterFreq[ch]++;
        if (i === w.letters.length - 1) finalLetterFreq[ch]++;
      }
    }
  }

  // Sort by frequency
  const freqSorted = Object.entries(letterFreq)
    .sort((a, b) => b[1] - a[1]);

  console.log(`\n── Results ──`);
  console.log(`Books processed: ${booksProcessed}`);
  console.log(`Books not found: ${booksNotFound}`);
  console.log(`Total word tokens: ${allWords.length.toLocaleString()}`);
  console.log(`Unique consonantal forms: ${uniqueConsonantal.size.toLocaleString()}`);
  console.log(`Unique pointed forms: ${uniquePointed.size.toLocaleString()}`);
  console.log(`Total letters: ${totalLetters.toLocaleString()}`);

  console.log(`\nLetter frequency (top 10):`);
  for (const [letter, count] of freqSorted.slice(0, 10)) {
    const name = CANONICAL_FRAMEWORK.find(l => l.letter === letter)?.name || '?';
    const pct = ((count / totalLetters) * 100).toFixed(2);
    console.log(`  ${letter} ${name.padEnd(8)} ${count.toLocaleString().padStart(9)} (${pct}%)`);
  }

  console.log(`\nInitial letter frequency (top 10):`);
  const initSorted = Object.entries(initialLetterFreq).sort((a, b) => b[1] - a[1]);
  for (const [letter, count] of initSorted.slice(0, 10)) {
    const name = CANONICAL_FRAMEWORK.find(l => l.letter === letter)?.name || '?';
    const pct = ((count / allWords.length) * 100).toFixed(2);
    console.log(`  ${letter} ${name.padEnd(8)} ${count.toLocaleString().padStart(9)} (${pct}%)`);
  }

  // Top 5 books by word count
  bookStats.sort((a, b) => b.words - a.words);
  console.log(`\nTop 5 books by word count:`);
  for (const b of bookStats.slice(0, 5)) {
    console.log(`  ${b.book.padEnd(15)} ${b.words.toLocaleString().padStart(8)} words, ${b.unique.toLocaleString().padStart(6)} unique`);
  }

  // Spot check: Genesis 1:1
  const gen11 = allWords.filter(w => w.book === 'Genesis' && w.chapter === 1 && w.verse === 1);
  console.log(`\nSpot check — Genesis 1:1 (${gen11.length} words):`);
  for (const w of gen11) {
    console.log(`  ${w.word_pointed} → [${w.letters.join(',')}] (${w.word_consonantal})`);
  }

  if (!statsOnly) {
    const corpusOutput = {
      type: 'tanach-word-corpus',
      description: 'Every Hebrew word from the Tanach (UXLC Leningrad Codex), with consonantal decomposition',
      source: 'staging/tanach-source/xml/Books/*.xml (UXLC 2.4)',
      generated: new Date().toISOString(),
      counts: {
        books: booksProcessed,
        total_words: allWords.length,
        unique_consonantal: uniqueConsonantal.size,
        unique_pointed: uniquePointed.size,
        total_letters: totalLetters,
      },
      letter_frequency: Object.fromEntries(freqSorted),
      initial_letter_frequency: Object.fromEntries(initSorted),
      words: allWords,
    };
    fs.writeFileSync(CORPUS_FILE, JSON.stringify(corpusOutput, null, 2));
    console.log(`\nCorpus written to: ${CORPUS_FILE}`);
    console.log(`File size: ${(fs.statSync(CORPUS_FILE).size / 1024 / 1024).toFixed(1)} MB`);
  }
}

main();
