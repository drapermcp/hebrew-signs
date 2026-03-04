#!/usr/bin/env node
// hebrew-signs-analysis.js — Phase 2 + 4 of the Hebrew Signs Confirmation Project
// Reads the word corpus and canonical framework, produces:
//   - Letter frequency & position statistics
//   - 22×22 co-occurrence matrix
//   - Initial-letter word lists (top words per letter)
//   - Acrostic validation (Psalm 119, Lamentations, other acrostic texts)
//
// Usage:
//   node hebrew-signs-analysis.js                   # Full analysis
//   node hebrew-signs-analysis.js --stats           # Stats only
//   node hebrew-signs-analysis.js --acrostic        # Acrostic analysis only

const fs = require('fs');
const path = require('path');

const INPUT_DIR = path.join(__dirname, '..', 'data');
const CORPUS_FILE = path.join(INPUT_DIR, 'tanach-word-corpus.json');
const FRAMEWORK_FILE = path.join(INPUT_DIR, 'canonical-framework.json');
const OUTPUT_FILE = path.join(INPUT_DIR, 'letter-statistics.json');
const ACROSTIC_FILE = path.join(INPUT_DIR, 'acrostic-validation.json');

const BIBLE_DIR = path.join(__dirname, '..', 'external', 'bible')  // Optional: not included;
const TANACH_DIR = path.join(__dirname, '..', 'external', 'tanach')  // Optional: not included;

// ─── Load data ──────────────────────────────────────────────────────────────

function loadJSON(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
}

// ─── Phase 2a: Letter frequency analysis ────────────────────────────────────

function analyzeFrequency(words, framework) {
  const letterMap = new Map(framework.letters.map(l => [l.letter, l]));
  const stats = {};

  for (const l of framework.letters) {
    stats[l.letter] = {
      name: l.name,
      meaning: l.meaning,
      position: l.position,
      total: 0,
      as_initial: 0,
      as_medial: 0,
      as_final: 0,
      word_count: 0, // words containing this letter
    };
  }

  const wordsContaining = {};
  for (const l of framework.letters) {
    wordsContaining[l.letter] = new Set();
  }

  for (const w of words) {
    const letters = w.letters;
    const seen = new Set();
    for (let i = 0; i < letters.length; i++) {
      const ch = letters[i];
      if (!stats[ch]) continue;
      stats[ch].total++;
      if (i === 0) stats[ch].as_initial++;
      else if (i === letters.length - 1) stats[ch].as_final++;
      else stats[ch].as_medial++;

      if (!seen.has(ch)) {
        wordsContaining[ch].add(w.word_consonantal);
        seen.add(ch);
      }
    }
  }

  for (const l of framework.letters) {
    stats[l.letter].word_count = wordsContaining[l.letter].size;
  }

  return stats;
}

// ─── Phase 2b: Co-occurrence matrix ─────────────────────────────────────────

function buildCooccurrence(words, framework) {
  const letters = framework.letters.map(l => l.letter);
  const matrix = {};
  for (const a of letters) {
    matrix[a] = {};
    for (const b of letters) {
      matrix[a][b] = 0;
    }
  }

  const letterSet = new Set(letters);

  for (const w of words) {
    const unique = [...new Set(w.letters)].filter(ch => letterSet.has(ch));
    for (let i = 0; i < unique.length; i++) {
      for (let j = i + 1; j < unique.length; j++) {
        matrix[unique[i]][unique[j]]++;
        matrix[unique[j]][unique[i]]++;
      }
    }
  }

  // Find top pairings
  const pairs = [];
  for (let i = 0; i < letters.length; i++) {
    for (let j = i + 1; j < letters.length; j++) {
      pairs.push({
        a: letters[i],
        b: letters[j],
        count: matrix[letters[i]][letters[j]],
        a_name: framework.letters[i].name,
        b_name: framework.letters[j].name,
        a_meaning: framework.letters[i].meaning,
        b_meaning: framework.letters[j].meaning,
      });
    }
  }
  pairs.sort((a, b) => b.count - a.count);

  return { matrix, top_pairs: pairs.slice(0, 30) };
}

// ─── Phase 2c: Initial-letter word lists ────────────────────────────────────

function buildInitialLetterLists(words, framework) {
  const lists = {};
  for (const l of framework.letters) {
    lists[l.letter] = { name: l.name, meaning: l.meaning, words: new Map() };
  }

  for (const w of words) {
    const initial = w.letters[0];
    if (!lists[initial]) continue;
    const key = w.word_consonantal;
    lists[initial].words.set(key, (lists[initial].words.get(key) || 0) + 1);
  }

  // Convert to sorted arrays
  const result = {};
  for (const [letter, data] of Object.entries(lists)) {
    const sorted = [...data.words.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 100) // top 100 per letter
      .map(([word, count]) => ({ word, count }));

    result[letter] = {
      name: data.name,
      meaning: data.meaning,
      total_unique: data.words.size,
      top_words: sorted,
    };
  }

  return result;
}

// ─── Phase 4: Acrostic validation ───────────────────────────────────────────

function extract6QTags(filePath) {
  if (!fs.existsSync(filePath)) return null;
  const content = fs.readFileSync(filePath, 'utf-8');

  // Extract 6Q fields from frontmatter
  const result = {};
  const fields = ['6q_what', '6q_who', '6q_when', '6q_where', '6q_how', '6q_why', '6q_summary'];
  for (const field of fields) {
    const match = content.match(new RegExp(`^${field}:\\s*"?(.+?)"?\\s*$`, 'm'));
    if (match) result[field] = match[1];
  }

  // Extract tags
  const tagsMatch = content.match(/6q_tags:\s*\n((?:\s+-\s+.+\n?)+)/);
  if (tagsMatch) {
    result['6q_tags'] = tagsMatch[1].match(/- "?([^"\n]+)"?/g)?.map(t => t.replace(/^- "?|"?$/g, '')) || [];
  }

  return result;
}

function analyzeAcrosticPsalm119(words, framework) {
  // Psalm 119 has 22 stanzas of 8 verses each
  // Stanza 1 (vv 1-8): Aleph, Stanza 2 (vv 9-16): Bet, etc.
  const letterOrder = framework.letters.map(l => l.letter);
  const stanzas = [];

  for (let i = 0; i < 22; i++) {
    const startVerse = i * 8 + 1;
    const endVerse = startVerse + 7;
    const letter = letterOrder[i];
    const letterInfo = framework.letters[i];

    // Get words from this stanza
    const stanzaWords = words.filter(
      w => w.book === 'Psalms' && w.chapter === 119 && w.verse >= startVerse && w.verse <= endVerse
    );

    // Count words starting with this letter
    const wordsStartingWithLetter = stanzaWords.filter(w => w.letters[0] === letter);

    // Get 6Q from Bible node
    const bible6Q = extract6QTags(path.join(BIBLE_DIR, 'bible-psalms-119.md'));
    const tanach6Q = extract6QTags(path.join(TANACH_DIR, 'tanach-tehillim-119.md'));

    // Unique words in this stanza
    const uniqueWords = [...new Set(stanzaWords.map(w => w.word_consonantal))];

    stanzas.push({
      stanza: i + 1,
      letter,
      letter_name: letterInfo.name,
      proposed_meaning: letterInfo.meaning,
      verses: `${startVerse}-${endVerse}`,
      total_words: stanzaWords.length,
      words_starting_with_letter: wordsStartingWithLetter.length,
      unique_word_count: uniqueWords.length,
      initial_words_sample: wordsStartingWithLetter.slice(0, 5).map(w => w.word_pointed),
    });
  }

  return {
    psalm: 119,
    type: 'alphabetic-acrostic',
    stanza_count: 22,
    verses_per_stanza: 8,
    note: 'Each stanza begins with successive Hebrew letter. The psalmist deliberately chose this structure.',
    chapter_6q: extract6QTags(path.join(BIBLE_DIR, 'bible-psalms-119.md')),
    stanzas,
  };
}

function analyzeLamentationsAcrostic(words, framework) {
  const letterOrder = framework.letters.map(l => l.letter);
  const chapters = [];

  // Lamentations 1: 22 verses, each starts with successive letter
  // Lamentations 2: same
  // Lamentations 3: 66 verses, each group of 3 starts with successive letter (triple acrostic)
  // Lamentations 4: 22 verses, each starts with successive letter

  for (const ch of [1, 2, 4]) {
    const verseSections = [];
    for (let i = 0; i < 22; i++) {
      const verse = i + 1;
      const letter = letterOrder[i];
      const letterInfo = framework.letters[i];

      const verseWords = words.filter(
        w => w.book === 'Lamentations' && w.chapter === ch && w.verse === verse
      );

      const firstWord = verseWords[0];
      const startsWithCorrectLetter = firstWord && firstWord.letters[0] === letter;

      verseSections.push({
        verse,
        expected_letter: letter,
        expected_name: letterInfo.name,
        proposed_meaning: letterInfo.meaning,
        first_word: firstWord?.word_pointed || '',
        first_word_consonantal: firstWord?.word_consonantal || '',
        actual_initial: firstWord?.letters[0] || '',
        matches: startsWithCorrectLetter,
        word_count: verseWords.length,
      });
    }

    const matchCount = verseSections.filter(s => s.matches).length;
    chapters.push({
      chapter: ch,
      type: 'single-acrostic',
      sections: verseSections,
      match_rate: matchCount / 22,
      matches: matchCount,
      total: 22,
    });
  }

  // Lamentations 3: triple acrostic
  const ch3Sections = [];
  for (let i = 0; i < 22; i++) {
    const startVerse = i * 3 + 1;
    const letter = letterOrder[i];
    const letterInfo = framework.letters[i];
    const verses = [];

    for (let v = startVerse; v < startVerse + 3; v++) {
      const verseWords = words.filter(
        w => w.book === 'Lamentations' && w.chapter === 3 && w.verse === v
      );
      const firstWord = verseWords[0];
      verses.push({
        verse: v,
        first_word: firstWord?.word_pointed || '',
        actual_initial: firstWord?.letters[0] || '',
        matches: firstWord?.letters[0] === letter,
      });
    }

    ch3Sections.push({
      group: i + 1,
      expected_letter: letter,
      expected_name: letterInfo.name,
      proposed_meaning: letterInfo.meaning,
      verses,
      all_match: verses.every(v => v.matches),
    });
  }

  const ch3MatchCount = ch3Sections.filter(s => s.all_match).length;
  chapters.push({
    chapter: 3,
    type: 'triple-acrostic',
    sections: ch3Sections,
    match_rate: ch3MatchCount / 22,
    matches: ch3MatchCount,
    total: 22,
  });

  return {
    book: 'Lamentations',
    chapters: chapters.sort((a, b) => a.chapter - b.chapter),
  };
}

function analyzeOtherAcrostics(words, framework) {
  const letterOrder = framework.letters.map(l => l.letter);
  const results = [];

  // Proverbs 31:10-31 — 22 verses, alphabetic acrostic
  const prov31 = [];
  for (let i = 0; i < 22; i++) {
    const verse = 10 + i;
    const letter = letterOrder[i];
    const letterInfo = framework.letters[i];
    const verseWords = words.filter(
      w => w.book === 'Proverbs' && w.chapter === 31 && w.verse === verse
    );
    const firstWord = verseWords[0];
    prov31.push({
      verse,
      expected_letter: letter,
      expected_name: letterInfo.name,
      proposed_meaning: letterInfo.meaning,
      first_word: firstWord?.word_pointed || '',
      actual_initial: firstWord?.letters[0] || '',
      matches: firstWord?.letters[0] === letter,
    });
  }
  results.push({
    text: 'Proverbs 31:10-31',
    type: 'Eshet Chayil (Woman of Valor)',
    match_rate: prov31.filter(v => v.matches).length / 22,
    verses: prov31,
  });

  // Psalm 145 — 21 verses (missing Nun in some traditions)
  const ps145 = [];
  for (let i = 0; i < 21; i++) {
    const verse = i + 1;
    const letter = letterOrder[i];
    const letterInfo = framework.letters[i];
    const verseWords = words.filter(
      w => w.book === 'Psalms' && w.chapter === 145 && w.verse === verse
    );
    const firstWord = verseWords[0];
    ps145.push({
      verse,
      expected_letter: letter,
      expected_name: letterInfo.name,
      proposed_meaning: letterInfo.meaning,
      first_word: firstWord?.word_pointed || '',
      actual_initial: firstWord?.letters[0] || '',
      matches: firstWord?.letters[0] === letter,
    });
  }
  results.push({
    text: 'Psalm 145',
    type: 'Praise acrostic (missing Nun in MT)',
    match_rate: ps145.filter(v => v.matches).length / 21,
    verses: ps145,
  });

  // Psalm 111 — 10 verses, half-verse acrostic (22 half-lines)
  // Psalm 112 — same structure
  // These are trickier since the acrostic is at half-verse level
  // We'll verify by checking first words of each verse (covers first 10 letters)
  for (const psNum of [111, 112]) {
    const psData = [];
    for (let i = 0; i < 10; i++) {
      const verse = i + 1;
      const letter = letterOrder[i];
      const letterInfo = framework.letters[i];
      const verseWords = words.filter(
        w => w.book === 'Psalms' && w.chapter === psNum && w.verse === verse
      );
      const firstWord = verseWords[0];
      psData.push({
        verse,
        expected_letter: letter,
        expected_name: letterInfo.name,
        first_word: firstWord?.word_pointed || '',
        actual_initial: firstWord?.letters[0] || '',
        matches: firstWord?.letters[0] === letter,
      });
    }
    results.push({
      text: `Psalm ${psNum}`,
      type: 'Half-verse acrostic (verse-initial check only)',
      match_rate: psData.filter(v => v.matches).length / psData.length,
      verses: psData,
    });
  }

  // Psalms 25, 34, 37 — alphabetic acrostics with some irregularities
  for (const psNum of [25, 34, 37]) {
    const verseCount = words.filter(w => w.book === 'Psalms' && w.chapter === psNum)
      .reduce((max, w) => Math.max(max, w.verse), 0);
    const checkCount = Math.min(verseCount, 22);
    const psData = [];

    for (let i = 0; i < checkCount; i++) {
      const verse = i + 1;
      const letter = letterOrder[i] || '?';
      const letterInfo = framework.letters[i];
      const verseWords = words.filter(
        w => w.book === 'Psalms' && w.chapter === psNum && w.verse === verse
      );
      const firstWord = verseWords[0];
      psData.push({
        verse,
        expected_letter: letter,
        expected_name: letterInfo?.name || '?',
        first_word: firstWord?.word_pointed || '',
        actual_initial: firstWord?.letters[0] || '',
        matches: firstWord?.letters[0] === letter,
      });
    }

    results.push({
      text: `Psalm ${psNum}`,
      type: 'Alphabetic acrostic (with possible irregularities)',
      match_rate: psData.filter(v => v.matches).length / psData.length,
      verses: psData,
    });
  }

  return results;
}

// ─── Main ───────────────────────────────────────────────────────────────────

function main() {
  const args = process.argv.slice(2);
  const statsOnly = args.includes('--stats');
  const acrosticOnly = args.includes('--acrostic');

  console.log('=== NKB Hebrew Signs Analysis (Phase 2 + 4) ===');
  console.log(`Date: ${new Date().toISOString().split('T')[0]}`);
  console.log('');

  // Load data
  console.log('Loading corpus...');
  const corpus = loadJSON(CORPUS_FILE);
  const framework = loadJSON(FRAMEWORK_FILE);
  console.log(`  ${corpus.counts.total_words.toLocaleString()} words loaded`);
  console.log(`  ${framework.letters.length} letters in framework`);
  console.log('');

  const words = corpus.words;

  if (!acrosticOnly) {
    // ── Phase 2a: Frequency analysis ────────────────────────────────────
    console.log('── Phase 2a: Letter Frequency Analysis ──');
    const freqStats = analyzeFrequency(words, framework);

    const sorted = Object.entries(freqStats)
      .sort((a, b) => b[1].total - a[1].total);

    console.log('Letter  Name      Total      Initial    Medial     Final      Words');
    console.log('─'.repeat(80));
    for (const [letter, s] of sorted) {
      console.log(
        `  ${letter}     ${s.name.padEnd(9)} ${s.total.toLocaleString().padStart(9)}  ` +
        `${s.as_initial.toLocaleString().padStart(9)}  ${s.as_medial.toLocaleString().padStart(9)}  ` +
        `${s.as_final.toLocaleString().padStart(9)}  ${s.word_count.toLocaleString().padStart(8)}`
      );
    }

    // ── Phase 2b: Co-occurrence matrix ──────────────────────────────────
    console.log('\n── Phase 2b: Co-occurrence Analysis ──');
    const cooc = buildCooccurrence(words, framework);

    console.log('Top 15 letter pairings (co-occurring in same word):');
    for (const p of cooc.top_pairs.slice(0, 15)) {
      console.log(
        `  ${p.a}+${p.b} (${p.a_name}+${p.b_name}): ${p.count.toLocaleString().padStart(8)} words  ` +
        `[${p.a_meaning} + ${p.b_meaning}]`
      );
    }

    // ── Phase 2c: Initial-letter word lists ─────────────────────────────
    console.log('\n── Phase 2c: Initial-Letter Word Lists ──');
    const initialLists = buildInitialLetterLists(words, framework);

    for (const l of framework.letters) {
      const data = initialLists[l.letter];
      const topWords = data.top_words.slice(0, 5).map(w => `${w.word}(${w.count})`).join(', ');
      console.log(
        `  ${l.letter} ${l.name.padEnd(8)} [${l.meaning.padEnd(18)}] ` +
        `${data.total_unique.toLocaleString().padStart(5)} unique → ${topWords}`
      );
    }

    if (!statsOnly) {
      const output = {
        type: 'hebrew-signs-letter-statistics',
        description: 'Letter frequency, co-occurrence, and initial-letter word analysis for the Hebrew Signs project',
        generated: new Date().toISOString(),
        frequency: freqStats,
        cooccurrence: {
          top_pairs: cooc.top_pairs,
          // Skip full matrix in output (it's 22×22 = 484 entries) — can reconstruct from corpus
        },
        initial_letter_lists: initialLists,
      };
      fs.writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2));
      console.log(`\nStatistics written to: ${OUTPUT_FILE}`);
      console.log(`File size: ${(fs.statSync(OUTPUT_FILE).size / 1024 / 1024).toFixed(1)} MB`);
    }
  }

  // ── Phase 4: Acrostic validation ────────────────────────────────────────
  console.log('\n── Phase 4: Acrostic Validation ──');

  console.log('\nPsalm 119 (22 stanzas × 8 verses):');
  const ps119 = analyzeAcrosticPsalm119(words, framework);
  for (const s of ps119.stanzas) {
    const samples = s.initial_words_sample.slice(0, 3).join(', ');
    console.log(
      `  ${s.letter} ${s.letter_name.padEnd(8)} [${s.proposed_meaning.padEnd(18)}] ` +
      `vv.${s.verses.padEnd(7)} ${s.total_words.toString().padStart(3)} words, ` +
      `${s.words_starting_with_letter.toString().padStart(2)} initial → ${samples}`
    );
  }

  console.log('\nLamentations acrostic analysis:');
  const lam = analyzeLamentationsAcrostic(words, framework);
  for (const ch of lam.chapters) {
    const matchStr = ch.type === 'triple-acrostic'
      ? `${ch.matches}/${ch.total} groups all match`
      : `${ch.matches}/${ch.total} verses match`;
    console.log(`  Chapter ${ch.chapter} (${ch.type}): ${matchStr} (${(ch.match_rate * 100).toFixed(0)}%)`);

    // Show mismatches
    if (ch.type === 'triple-acrostic') {
      for (const s of ch.sections) {
        if (!s.all_match) {
          console.log(`    ✗ Group ${s.group} (${s.expected_letter} ${s.expected_name}): some verses don't match`);
        }
      }
    } else {
      for (const s of ch.sections) {
        if (!s.matches) {
          console.log(
            `    ✗ v.${s.verse}: expected ${s.expected_letter} (${s.expected_name}), ` +
            `got ${s.actual_initial} — "${s.first_word}"`
          );
        }
      }
    }
  }

  console.log('\nOther acrostic texts:');
  const others = analyzeOtherAcrostics(words, framework);
  for (const a of others) {
    console.log(`  ${a.text} (${a.type}): ${(a.match_rate * 100).toFixed(0)}% match`);
    // Show first 3 mismatches
    const mismatches = a.verses.filter(v => !v.matches);
    for (const m of mismatches.slice(0, 3)) {
      console.log(
        `    ✗ v.${m.verse}: expected ${m.expected_letter} (${m.expected_name}), ` +
        `got ${m.actual_initial} — "${m.first_word}"`
      );
    }
    if (mismatches.length > 3) {
      console.log(`    ... and ${mismatches.length - 3} more mismatches`);
    }
  }

  if (!statsOnly) {
    const acrosticOutput = {
      type: 'hebrew-signs-acrostic-validation',
      description: 'Acrostic text validation for Hebrew Signs project — tests letter ordering against actual text',
      generated: new Date().toISOString(),
      psalm_119: ps119,
      lamentations: lam,
      other_acrostics: others,
    };
    fs.writeFileSync(ACROSTIC_FILE, JSON.stringify(acrosticOutput, null, 2));
    console.log(`\nAcrostic data written to: ${ACROSTIC_FILE}`);
    console.log(`File size: ${(fs.statSync(ACROSTIC_FILE).size / 1024 / 1024).toFixed(1)} MB`);
  }
}

main();
