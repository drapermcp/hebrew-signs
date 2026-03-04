#!/usr/bin/env node
// hebrew-signs-interlinear.js — Generate formatted interlinear documents
//
// Reads glosser JSON output and produces a publishable markdown document
// with three layers per word: Hebrew (pointed), English meaning, dynamic reading.
//
// Usage:
//   node hebrew-signs-interlinear.js <glosser-output.json>
//   node hebrew-signs-interlinear.js --latest    # Use most recent glosser output

const fs = require('fs');
const path = require('path');

const GLOSSER_DIR = path.join(__dirname, '..', 'data', 'glosser-output');
const OUTPUT_DIR = path.join(__dirname, '..', 'interlinear');

// ─── Helpers ─────────────────────────────────────────────────────────────

function formatDynamic(word) {
  // Build a concise dynamic string: [prefixes] + R1→R2→R3 + (suffix)
  const parts = [];

  // Prefixes
  if (word.prefixes.length > 0) {
    const prefStrs = word.prefixes.map(p => {
      if (p.grammar === 'imperfect 3rd' || p.grammar === 'imperfect 2nd/fem' ||
          p.grammar === 'imperfect 1st' || p.grammar === 'imperfect 1st pl') {
        return `*${p.name}*`;
      }
      return p.dynamic;
    });
    parts.push(prefStrs.join('+'));
  }

  // Binyan label (for non-Qal verbs)
  const binyanLabel = word.binyanDynamic || '';

  // Root
  if (word.root) {
    let rootStr;
    if (word.root.r1) {
      rootStr = `${word.root.r1.dynamic} → ${word.root.r2.dynamic} → ${word.root.r3.dynamic}`;
    } else if (word.root.dynamics) {
      rootStr = word.root.dynamics.map(d => d.dynamic).join(' → ');
    } else if (word.root.extended && word.root.dynamics) {
      rootStr = word.root.dynamics.map(d => d.dynamic).join(' → ');
    }
    if (rootStr) {
      parts.push(binyanLabel ? `${binyanLabel} ${rootStr}` : rootStr);
    }
  } else {
    // Letter-by-letter
    parts.push(binyanLabel ? `${binyanLabel} ${word.letterByLetter}` : word.letterByLetter);
  }

  return parts.join(' + ');
}

function formatRootColumn(word) {
  const parts = [];

  // Prefixes
  if (word.prefixes.length > 0) {
    parts.push(word.prefixes.map(p => p.letter).join(''));
    parts.push(' + ');
  }

  // Root
  if (word.root) {
    parts.push('**' + word.root.letters + '**');
  } else {
    parts.push(word.word);
  }

  // Suffixes
  if (word.suffixes.length > 0) {
    parts.push(' + ' + word.suffixes.map(s => s.suffix).join(''));
  }

  return parts.join('');
}

function formatSuffixNote(word) {
  if (word.suffixes.length === 0) return '';
  return ' (' + word.suffixes.map(s => s.grammar).join(', ') + ')';
}

// ─── Document Generation ────────────────────────────────────────────────

function generateInterlinear(data) {
  const lines = [];

  // Frontmatter
  const ref = data.reference || 'Unknown';
  const verseRange = data.verseRange || null;
  const displayRef = verseRange ? `${ref}:${verseRange}` : ref;
  const slugRef = displayRef.replace(/\s+/g, '-').replace(/:/g, '-').toLowerCase();
  const nodeId = `hebrew-signs-interlinear-${slugRef}`;
  const bookTag = ref.replace(/\s+\d+$/, '').toLowerCase();
  const today = new Date().toISOString().slice(0, 10);

  lines.push('---');
  lines.push(`id: ${nodeId}`);
  lines.push('type: interlinear');
  lines.push(`title: "Hebrew Signs — Dynamic Interlinear: ${displayRef}"`);
  lines.push('domain: hebrew-signs');
  lines.push('classification: public');
  lines.push('status: active');
  lines.push(`created: '${today}'`);
  lines.push(`updated: '${today}'`);
  lines.push('');
  lines.push('relationships:');
  lines.push('  parent: hebrew-signs-index');
  lines.push('  related:');
  lines.push('    - hebrew-signs-corrected-framework');
  lines.push('    - hebrew-signs-roadmap');
  lines.push('    - hebrew-signs-alphabet-architecture');
  lines.push('  tags:');
  lines.push('    - "hebrew-signs"');
  lines.push('    - "interlinear"');
  lines.push(`    - "${bookTag}"`);
  lines.push('    - "dynamic-translation"');
  lines.push('---');

  // Title
  lines.push(`# Hebrew Signs — Dynamic Interlinear: ${displayRef}`);
  lines.push('');
  lines.push(`**Generated:** ${today}`);
  lines.push(`**Framework:** Corrected 22-Letter Dynamics`);
  lines.push(`**Words:** ${data.wordCount} | **Verses:** ${data.verseCount}`);
  lines.push('');

  // Legend
  lines.push('## How to Read');
  lines.push('');
  lines.push('Each verse is presented word by word with three layers:');
  lines.push('');
  lines.push('1. **Hebrew** — the pointed (vocalized) text from the Leningrad Codex');
  lines.push('2. **Meaning** — traditional English meaning of the full word');
  lines.push('3. **Dynamic** — what the word DOES according to its letter dynamics');
  lines.push('');
  lines.push('In the Root column: prefixes are shown before **+**, the **root** is bolded, and suffixes follow after **+**.');
  lines.push('');
  lines.push('Prefix dynamics: ב=Containment, ה=Revelation, ו=Conjunction, כ=Actualization, ל=Direction, מ=Flow, ש=Intensification.');
  lines.push('');
  lines.push('Root dynamics read as a micro-sentence: R1 (initiates) → R2 (mediates) → R3 (completes).');
  lines.push('');
  lines.push('**Verb Stems** (binyanim) — detected via MorphHB morphological tagging:');
  lines.push('');
  lines.push('| Label | Stem | Meaning Shift |');
  lines.push('|-------|------|---------------|');
  lines.push('| *(unmarked)* | Qal | Base/simple action |');
  lines.push('| [received/reflected] | Niphal | Passive or reflexive |');
  lines.push('| [intensive] | Piel | Intensive or factitive |');
  lines.push('| [intensive-received] | Pual | Intensive passive |');
  lines.push('| [causative] | Hiphil | Causative active |');
  lines.push('| [causative-received] | Hophal | Causative passive |');
  lines.push('| [reflexive] | Hitpael | Reflexive or reciprocal |');
  lines.push('');
  lines.push('---');
  lines.push('');

  // Group words by verse
  const verses = {};
  for (const w of data.words) {
    const v = w.verse;
    if (!verses[v]) verses[v] = [];
    verses[v].push(w);
  }

  // Generate each verse
  for (const [vNum, words] of Object.entries(verses).sort((a, b) => Number(a[0]) - Number(b[0]))) {
    // Verse header with full Hebrew
    const hebrewLine = words.map(w => w.pointed || w.word).join(' ');
    const meaningLine = words.map(w => w.meaning || '—').join(' ');

    const bookName = ref.replace(/\s+\d+$/, '');
    const chapter = ref.match(/\d+$/)?.[0] || '1';
    lines.push(`### ${bookName} ${chapter}:${vNum}`);
    lines.push('');
    lines.push(`> ${hebrewLine}`);
    lines.push(`>`);
    lines.push(`> *${meaningLine}*`);
    lines.push('');

    // Word table
    lines.push('| # | Hebrew | Meaning | Root | Dynamic |');
    lines.push('|---|--------|---------|------|---------|');

    words.forEach((w, i) => {
      const hebrew = w.pointed || w.word;
      const meaning = w.meaning || '—';
      const root = formatRootColumn(w);
      const dynamic = formatDynamic(w) + formatSuffixNote(w);
      lines.push(`| ${i + 1} | ${hebrew} | ${meaning} | ${root} | ${dynamic} |`);
    });

    lines.push('');
  }

  // Footer
  lines.push('---');
  lines.push('');
  lines.push('## Notes');
  lines.push('');
  lines.push('### Recurring Patterns');
  lines.push('');

  // Find most frequent dynamic patterns
  const rootPatterns = {};
  for (const w of data.words) {
    if (w.root && w.root.r1) {
      const key = `${w.root.r1.dynamic} → ${w.root.r2.dynamic} → ${w.root.r3.dynamic}`;
      if (!rootPatterns[key]) rootPatterns[key] = { count: 0, words: [] };
      rootPatterns[key].count++;
      const label = w.meaning || w.word;
      if (!rootPatterns[key].words.includes(label)) {
        rootPatterns[key].words.push(label);
      }
    }
  }

  const topPatterns = Object.entries(rootPatterns)
    .filter(([_, v]) => v.count >= 3)
    .sort((a, b) => b[1].count - a[1].count);

  if (topPatterns.length > 0) {
    lines.push('| Dynamic Pattern | Occurrences | Words |');
    lines.push('|-----------------|-------------|-------|');
    for (const [pattern, info] of topPatterns.slice(0, 10)) {
      lines.push(`| ${pattern} | ${info.count} | ${info.words.slice(0, 4).join(', ')} |`);
    }
    lines.push('');
  }

  // Key observations
  lines.push('### Key Observations');
  lines.push('');
  lines.push('1. **יהי / ויהי** ("let there be" / "and it was") — Agency → Revelation → Agency. The act of creation is an act that reveals and acts again. The hand makes visible, the hand completes.');
  lines.push('2. **אור** ("light") — Origination → Conjunction → Headship. Light originates, joins, and leads. It is the first thing to establish presence through connection.');
  lines.push('3. **אלהים** ("God") — Origination → Direction → Revelation. The divine name dynamically reads: that which originates, directs toward, and makes visible.');
  lines.push('4. **ברא** ("created") — Containment → Headship → Origination. Creation is enclosing that leads toward establishing new presence. Form given to lead into being.');
  lines.push('5. **טוב** ("good") — Materialization → Conjunction → Containment. Goodness is what emerges physically, joins together, and takes form. Wholeness materialized.');
  lines.push('6. **ערב / בקר** ("evening / morning") — Perception→Headship→Containment / Containment→Summons→Headship. Evening: seeing that leads into enclosure. Morning: from enclosure, a summons that leads forward.');
  lines.push('7. **את** (object marker) — Origination → Completion. Aleph to Tav, first to last. The object marker dynamically spans the entire alphabet.');
  lines.push('');
  lines.push('### Known Limitations');
  lines.push('');
  lines.push('- **שמים** ("heavens") is decomposed as ש+מים (Intensification + root מים). The root extraction treats ש as a prefix. The actual etymology of שמים is debated; this decomposition is heuristic.');
  lines.push('- **Verb stems** (binyanim) are detected via MorphHB morphological tagging. Non-Qal verbs show a stem label (e.g., [causative] for Hiphil) before the root dynamics.');
  lines.push('- **Suffix labeling** is approximate. Some multi-letter suffixes are labeled generically.');
  lines.push('- This is a **raw dynamic reading**, not a polished translation. The dynamics show structural relationships; readable English rendering is a separate step.');
  lines.push('');

  lines.push('---');
  lines.push('');
  lines.push('## Source');
  lines.push('');
  lines.push('**Corpus:** UXLC Leningrad Codex');
  lines.push('**Framework:** [Corrected 22-Letter Dynamics](hebrew-signs-corrected-framework.md)');
  lines.push('**Tool:** `development/scripts/hebrew-signs-glosser.js`');
  lines.push(`**Data:** \`staging/hebrew-signs/glosser-output/\``);
  lines.push('');

  return lines.join('\n');
}

// ─── Main ────────────────────────────────────────────────────────────────

function main() {
  const args = process.argv.slice(2);
  let inputFile;

  if (args.includes('--latest') || args.length === 0) {
    // Find most recent glosser output
    const files = fs.readdirSync(GLOSSER_DIR)
      .filter(f => f.startsWith('gloss-') && f.endsWith('.json'))
      .sort()
      .reverse();
    if (files.length === 0) {
      console.error('No glosser output files found.');
      process.exit(1);
    }
    inputFile = path.join(GLOSSER_DIR, files[0]);
  } else {
    inputFile = args[0];
  }

  console.log(`Reading: ${inputFile}`);
  const data = JSON.parse(fs.readFileSync(inputFile, 'utf-8'));
  console.log(`  ${data.wordCount} words, ${data.verseCount} verses`);

  const markdown = generateInterlinear(data);

  // Determine output filename
  const ref = (data.reference || 'unknown');
  const verseRange = data.verseRange || null;
  const displayRef = verseRange ? `${ref}:${verseRange}` : ref;
  const slug = displayRef.replace(/\s+/g, '-').replace(/:/g, '-').toLowerCase();
  const outputFile = path.join(OUTPUT_DIR, `hebrew-signs-interlinear-${slug}.md`);

  fs.writeFileSync(outputFile, markdown);
  console.log(`\nWritten: ${outputFile}`);
  console.log(`  ${markdown.split('\n').length} lines`);
}

main();
