#!/usr/bin/env node
// hebrew-signs-morphhb-extract.js — Extract binyanim data from OpenScriptures MorphHB
//
// Downloads morphological XML from MorphHB (cached locally), parses every verb,
// extracts binyan classification and Strong's lemma, cross-references with
// extracted-roots.json consonantal forms.
//
// Output: staging/hebrew-signs/morphhb-binyanim.json
//
// Usage:
//   node hebrew-signs-morphhb-extract.js              # Full extraction
//   node hebrew-signs-morphhb-extract.js --stats      # Show stats only (no download)

const fs = require('fs');
const path = require('path');

// ─── Config ────────────────────────────────────────────────────────────────

const CACHE_DIR = 'staging/hebrew-signs/morphhb-cache';
const OUTPUT_FILE = 'staging/hebrew-signs/morphhb-binyanim.json';
const ROOTS_FILE = 'staging/hebrew-signs/extracted-roots.json';

const BASE_URL = 'https://raw.githubusercontent.com/openscriptures/morphhb/master/wlc';

const BOOKS = [
  'Gen', 'Exod', 'Lev', 'Num', 'Deut',
  'Josh', 'Judg', 'Ruth', '1Sam', '2Sam', '1Kgs', '2Kgs',
  '1Chr', '2Chr', 'Ezra', 'Neh', 'Esth',
  'Job', 'Ps', 'Prov', 'Eccl', 'Song',
  'Isa', 'Jer', 'Lam', 'Ezek', 'Dan',
  'Hos', 'Joel', 'Amos', 'Obad', 'Jonah', 'Mic', 'Nah', 'Hab', 'Zeph', 'Hag', 'Zech', 'Mal'
];

// Binyan code mapping from MorphHB morph strings
const BINYAN_CODES = {
  'q': 'Qal',
  'N': 'Niphal',
  'p': 'Piel',
  'P': 'Pual',
  'h': 'Hiphil',
  'H': 'Hophal',
  't': 'Hitpael'
};

// Hebrew consonants for stripping
const FINAL_TO_BASE = {
  'ך': 'כ',
  'ם': 'מ',
  'ן': 'נ',
  'ף': 'פ',
  'ץ': 'צ',
};

const HEBREW_CONSONANT_SET = new Set([
  'א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ז', 'ח', 'ט', 'י', 'כ',
  'ל', 'מ', 'נ', 'ס', 'ע', 'פ', 'צ', 'ק', 'ר', 'ש', 'ת',
  'ך', 'ם', 'ן', 'ף', 'ץ'
]);

// ─── Helpers ───────────────────────────────────────────────────────────────

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function stripToConsonants(pointed) {
  const consonants = [];
  for (const ch of pointed) {
    if (HEBREW_CONSONANT_SET.has(ch)) {
      const base = FINAL_TO_BASE[ch] || ch;
      consonants.push(base);
    }
  }
  return consonants.join('');
}

function loadJSON(filePath) {
  if (!fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
}

function saveJSON(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
}

// ─── Download XML ──────────────────────────────────────────────────────────

async function downloadBook(bookName) {
  const cachePath = path.join(CACHE_DIR, `${bookName}.xml`);

  if (fs.existsSync(cachePath)) {
    return fs.readFileSync(cachePath, 'utf-8');
  }

  const url = `${BASE_URL}/${bookName}.xml`;
  const resp = await fetch(url);
  if (!resp.ok) {
    throw new Error(`Failed to download ${bookName}: ${resp.status}`);
  }

  const text = await resp.text();
  fs.writeFileSync(cachePath, text, 'utf-8');
  return text;
}

// ─── Parse verbs from XML ──────────────────────────────────────────────────

function parseVerbs(xml, bookName) {
  const verbs = [];

  // Match <w> tags with morph and lemma attributes
  // Format: <w lemma="1254 a" morph="HVqp3ms" id="01Nvk">בָּרָ֣א</w>
  const wordRegex = /<w\s+([^>]*)>([^<]*)<\/w>/g;
  let match;

  // Track current chapter/verse for context
  let chapter = 0;
  let verse = 0;
  const lines = xml.split('\n');

  for (const line of lines) {
    const chMatch = line.match(/<chapter\s+[^>]*osisID="[^.]*\.(\d+)"/);
    if (chMatch) chapter = parseInt(chMatch[1]);

    const vMatch = line.match(/<verse\s+[^>]*osisID="[^.]*\.\d+\.(\d+)"/);
    if (vMatch) verse = parseInt(vMatch[1]);

    // Find all words on this line
    let wMatch;
    const lineWordRegex = /<w\s+([^>]*)>([^<]*)<\/w>/g;
    while ((wMatch = lineWordRegex.exec(line)) !== null) {
      const attrs = wMatch[1];
      const text = wMatch[2];

      // Extract morph attribute
      const morphMatch = attrs.match(/morph="([^"]*)"/);
      if (!morphMatch) continue;
      const morph = morphMatch[1];

      // Check if it's a verb: morph starts with H (Hebrew) then V (verb)
      // Handle prefixed forms: HC/Vqp3ms (conjunction + verb)
      const verbMatch = morph.match(/H(?:[^V]*\/)?V([qNpPhHt])/);
      if (!verbMatch) continue;

      const binyanCode = verbMatch[1];
      const binyan = BINYAN_CODES[binyanCode];
      if (!binyan) continue;

      // Extract lemma (Strong's number)
      const lemmaMatch = attrs.match(/lemma="([^"]*)"/);
      if (!lemmaMatch) continue;

      // Parse lemma — may have prefixes like "c/1254 a" or just "1254"
      const lemmaStr = lemmaMatch[1];
      // Get the main lemma number (last segment after any /)
      const lemmaParts = lemmaStr.split('/');
      const mainLemma = lemmaParts[lemmaParts.length - 1].trim();
      // Extract just the number (ignore letter suffixes like "a")
      const lemmaNum = mainLemma.match(/^(\d+)/);
      if (!lemmaNum) continue;

      const strongsNum = lemmaNum[1];

      // Get consonantal form of the word text
      // Strip segmentation markers first
      const cleanText = text.replace(/\//g, '');
      const consonants = stripToConsonants(cleanText);

      verbs.push({
        book: bookName,
        ref: `${bookName}.${chapter}.${verse}`,
        text: cleanText,
        consonants,
        morph,
        binyan,
        binyanCode,
        strongs: strongsNum
      });
    }
  }

  return verbs;
}

// ─── Build root→binyanim map ───────────────────────────────────────────────

function buildBinyanMap(allVerbs) {
  // Group by Strong's number → track binyanim
  const strongsMap = {};

  for (const v of allVerbs) {
    if (!strongsMap[v.strongs]) {
      strongsMap[v.strongs] = {
        strongs: v.strongs,
        forms: {},       // binyan → { count, examples }
        totalCount: 0,
        consonantalForms: new Set()
      };
    }

    const entry = strongsMap[v.strongs];
    entry.totalCount++;
    entry.consonantalForms.add(v.consonants);

    if (!entry.forms[v.binyan]) {
      entry.forms[v.binyan] = { count: 0, examples: [] };
    }
    entry.forms[v.binyan].count++;
    if (entry.forms[v.binyan].examples.length < 3) {
      entry.forms[v.binyan].examples.push({
        ref: v.ref,
        text: v.text,
        morph: v.morph
      });
    }
  }

  return strongsMap;
}

// ─── Cross-reference with extracted roots ──────────────────────────────────

function crossReference(strongsMap, rootsData) {
  // Build a consonantal → root lookup from extracted-roots.json
  const consonantToRoots = {};

  for (const letter of Object.keys(rootsData.letterPositions)) {
    const positions = rootsData.letterPositions[letter];
    for (const pos of ['R1', 'R2', 'R3']) {
      if (!positions[pos]) continue;
      for (const entry of positions[pos]) {
        if (!consonantToRoots[entry.root]) {
          consonantToRoots[entry.root] = { count: entry.count, words: entry.words };
        }
      }
    }
  }

  // For each Strong's entry, try to find matching root
  let matched = 0;
  let unmatched = 0;

  for (const [strongs, entry] of Object.entries(strongsMap)) {
    // Try to match consonantal forms to known roots
    // Strategy: look for 3-consonant substrings of attested forms
    let bestRoot = null;
    let bestCount = 0;

    for (const form of entry.consonantalForms) {
      // Try the form itself if it's 3 letters
      if (form.length === 3 && consonantToRoots[form]) {
        if (consonantToRoots[form].count > bestCount) {
          bestRoot = form;
          bestCount = consonantToRoots[form].count;
        }
      }
      // Try substrings for prefixed/suffixed forms
      if (form.length > 3) {
        for (let i = 0; i <= form.length - 3; i++) {
          const sub = form.substring(i, i + 3);
          if (consonantToRoots[sub] && consonantToRoots[sub].count > bestCount) {
            bestRoot = sub;
            bestCount = consonantToRoots[sub].count;
          }
        }
      }
    }

    if (bestRoot) {
      entry.root = bestRoot;
      entry.rootFrequency = bestCount;
      matched++;
    } else {
      unmatched++;
    }
  }

  return { matched, unmatched };
}

// ─── Find multi-binyan roots ───────────────────────────────────────────────

function findMultiBinyanRoots(strongsMap, minBinyanim = 3) {
  const results = [];

  for (const [strongs, entry] of Object.entries(strongsMap)) {
    const binyanim = Object.keys(entry.forms);
    if (binyanim.length >= minBinyanim && entry.root) {
      results.push({
        strongs,
        root: entry.root,
        rootFrequency: entry.rootFrequency,
        binyanCount: binyanim.length,
        binyanim: binyanim.sort(),
        forms: entry.forms,
        totalAttestations: entry.totalCount
      });
    }
  }

  // Sort by number of binyanim (desc), then by attestation count (desc)
  results.sort((a, b) => {
    if (b.binyanCount !== a.binyanCount) return b.binyanCount - a.binyanCount;
    return b.totalAttestations - a.totalAttestations;
  });

  return results;
}

// ─── Main ──────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const statsOnly = args.includes('--stats');

  console.log('=== Hebrew Signs — MorphHB Binyanim Extraction ===');
  console.log(`Date: ${new Date().toISOString().split('T')[0]}`);
  console.log();

  // Load existing output if stats-only
  if (statsOnly) {
    const existing = loadJSON(OUTPUT_FILE);
    if (existing) {
      console.log(`Total verbs: ${existing.totalVerbs}`);
      console.log(`Unique lemmas: ${existing.uniqueLemmas}`);
      console.log(`Multi-binyan roots (3+): ${existing.multiBinyanRoots.length}`);
      console.log(`Cross-referenced: ${existing.crossReference.matched} matched, ${existing.crossReference.unmatched} unmatched`);
      console.log('\nBinyan distribution:');
      for (const [b, c] of Object.entries(existing.binyanDistribution)) {
        console.log(`  ${b.padEnd(10)} ${c}`);
      }
    } else {
      console.log('No output file found. Run without --stats first.');
    }
    return;
  }

  // Ensure cache dir exists
  if (!fs.existsSync(CACHE_DIR)) {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
  }

  // Download and parse all books
  console.log(`Downloading/parsing ${BOOKS.length} books from MorphHB...`);
  const allVerbs = [];

  for (const book of BOOKS) {
    const cached = fs.existsSync(path.join(CACHE_DIR, `${book}.xml`));
    process.stdout.write(`  ${book.padEnd(6)} `);

    try {
      const xml = await downloadBook(book);
      const verbs = parseVerbs(xml, book);
      allVerbs.push(...verbs);
      console.log(`${cached ? '(cached)' : '(downloaded)'} ${verbs.length} verbs`);

      if (!cached) await sleep(200);
    } catch (err) {
      console.log(`ERROR: ${err.message}`);
    }
  }

  console.log(`\nTotal verbs extracted: ${allVerbs.length}`);

  // Binyan distribution
  const binyanDist = {};
  for (const v of allVerbs) {
    binyanDist[v.binyan] = (binyanDist[v.binyan] || 0) + 1;
  }
  console.log('\nBinyan distribution:');
  for (const [b, c] of Object.entries(binyanDist).sort((a, b) => b[1] - a[1])) {
    const pct = (c / allVerbs.length * 100).toFixed(1);
    console.log(`  ${b.padEnd(10)} ${String(c).padStart(6)} (${pct}%)`);
  }

  // Build Strong's → binyanim map
  console.log('\nBuilding Strong\'s → binyanim map...');
  const strongsMap = buildBinyanMap(allVerbs);
  const uniqueLemmas = Object.keys(strongsMap).length;
  console.log(`  Unique Strong's lemmas: ${uniqueLemmas}`);

  // Cross-reference with extracted roots
  console.log('\nCross-referencing with extracted roots...');
  const rootsData = loadJSON(ROOTS_FILE);
  let crossRef = { matched: 0, unmatched: uniqueLemmas };

  if (rootsData) {
    crossRef = crossReference(strongsMap, rootsData);
    console.log(`  Matched: ${crossRef.matched}`);
    console.log(`  Unmatched: ${crossRef.unmatched}`);
  } else {
    console.log('  WARNING: No extracted-roots.json found, skipping cross-reference');
  }

  // Find multi-binyan roots
  console.log('\nFinding roots attested in 3+ binyanim...');
  const multiBinyan = findMultiBinyanRoots(strongsMap, 3);
  console.log(`  Found ${multiBinyan.length} multi-binyan roots`);

  // Show top examples
  console.log('\n── Top 10 multi-binyan roots ──');
  for (const r of multiBinyan.slice(0, 10)) {
    console.log(`  ${r.root} (H${r.strongs}) — ${r.binyanCount} binyanim: ${r.binyanim.join(', ')} [${r.totalAttestations} attestations]`);
  }

  // Per-binyan counts in multi-binyan set
  const perBinyanCount = {};
  for (const r of multiBinyan) {
    for (const b of r.binyanim) {
      perBinyanCount[b] = (perBinyanCount[b] || 0) + 1;
    }
  }
  console.log('\n── Binyanim representation in multi-binyan set ──');
  for (const [b, c] of Object.entries(perBinyanCount).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${b.padEnd(10)} ${c} roots`);
  }

  // Save output
  const output = {
    type: 'hebrew-signs-morphhb-binyanim',
    description: 'Binyan attestation data extracted from OpenScriptures MorphHB morphological tagging',
    source: 'https://github.com/openscriptures/morphhb',
    generated: new Date().toISOString(),
    totalVerbs: allVerbs.length,
    uniqueLemmas: uniqueLemmas,
    binyanDistribution: binyanDist,
    crossReference: crossRef,
    multiBinyanRoots: multiBinyan,
    // Also include full Strong's map for roots with cross-reference
    rootMap: Object.fromEntries(
      Object.entries(strongsMap)
        .filter(([, v]) => v.root)
        .map(([k, v]) => [k, {
          strongs: v.strongs,
          root: v.root,
          totalCount: v.totalCount,
          forms: v.forms
        }])
    )
  };

  saveJSON(OUTPUT_FILE, output);
  console.log(`\nWritten to: ${OUTPUT_FILE}`);
  console.log(`File size: ${(fs.statSync(OUTPUT_FILE).size / 1024).toFixed(0)} KB`);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
