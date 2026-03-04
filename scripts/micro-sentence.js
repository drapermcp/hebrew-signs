#!/usr/bin/env node
// hebrew-signs-micro-sentence.js — Root as Micro-Sentence Test
//
// The big test: if each letter contributes a relational dynamic and each
// root position has an archetypal role (R1 initiates, R2 mediates, R3 completes),
// then reading a 3-letter root as a dynamic sequence should produce a meaningful
// gloss of the word's actual meaning.
//
// Example: עבד (ayin-bet-dalet)
//   Ayin = Perception, Bet = Containment, Dalet = Passage
//   Dynamic reading: "perceiving → containing → passing through"
//   Actual meaning: "to serve/work" — beholding what needs doing, holding it, directing toward
//
// This script:
// 1. Loads the corrected framework (22 letter dynamics)
// 2. Takes a sample of roots with known meanings
// 3. Generates dynamic glosses by composing letter dynamics
// 4. Asks the LLM to judge alignment between dynamic gloss and actual meaning
// 5. Scores what percentage of roots are meaningfully illuminated
//
// Usage:
//   node hebrew-signs-micro-sentence.js                  # Full run (200 roots)
//   node hebrew-signs-micro-sentence.js --dry-run        # 20 roots
//   node hebrew-signs-micro-sentence.js --sample 50      # Custom sample size
//   node hebrew-signs-micro-sentence.js --resume         # Resume from checkpoint

const fs = require('fs');
const path = require('path');

// ─── Config ────────────────────────────────────────────────────────────────

const INPUT_DIR = path.join(__dirname, '..', 'data');
const OUTPUT_FILE = path.join(INPUT_DIR, 'micro-sentence-analysis.json');
const CHECKPOINT_FILE = path.join(INPUT_DIR, 'micro-sentence-checkpoint.json');
const ROOTS_FILE = path.join(INPUT_DIR, 'extracted-roots.json');

const MODEL = 'grok-4-1-fast-non-reasoning';
const API_URL = 'https://api.x.ai/v1/chat/completions';
const API_KEY = process.env.XAI_API_KEY;
const REQUEST_DELAY_MS = 200;
const MAX_RETRIES = 3;
const BATCH_SIZE = 20; // roots per LLM call
const DEFAULT_SAMPLE = 200;

// ─── The Corrected Framework ─────────────────────────────────────────────

const LETTER_DYNAMICS = {
  'א': { name: 'Aleph',   dynamic: 'Origination',      short: 'initiating, establishing presence, the Who' },
  'ב': { name: 'Bet',     dynamic: 'Containment',       short: 'enclosing, housing, giving form, the What' },
  'ג': { name: 'Gimel',   dynamic: 'Traversal',         short: 'journeying, process, crossing distance, the How' },
  'ד': { name: 'Dalet',   dynamic: 'Passage',           short: 'directing through thresholds, spatial relationship, the Where' },
  'ה': { name: 'Hei',     dynamic: 'Revelation',        short: 'making visible, pointing to, breathing into presence' },
  'ו': { name: 'Vav',     dynamic: 'Conjunction',       short: 'joining, binding, linking, continuing' },
  'ז': { name: 'Zayin',   dynamic: 'Division',          short: 'cutting, separating forcefully, distinguishing' },
  'ח': { name: 'Chet',    dynamic: 'Vitalization',      short: 'animating with life-force, enclosing-to-expelling' },
  'ט': { name: 'Tet',     dynamic: 'Materialization',   short: 'emerging physically, coiling, stretching, compacting' },
  'י': { name: 'Yud',     dynamic: 'Agency',            short: 'acting with purpose, the hand that reaches' },
  'כ': { name: 'Kaf',     dynamic: 'Actualization',     short: 'holding, measuring, realizing within bounds' },
  'ל': { name: 'Lamed',   dynamic: 'Direction',         short: 'pointing toward, purposing, leading to' },
  'מ': { name: 'Mem',     dynamic: 'Flow',              short: 'channeling from source, flowing, drawing from' },
  'נ': { name: 'Nun',     dynamic: 'Propagation',       short: 'extending outward, transmitting, multiplying' },
  'ס': { name: 'Samekh',  dynamic: 'Encirclement',      short: 'surrounding, supporting, managing boundaries' },
  'ע': { name: 'Ayin',    dynamic: 'Perception',        short: 'seeing, beholding, apprehending reality' },
  'פ': { name: 'Pe',      dynamic: 'Projection',        short: 'propelling outward, emanating from interior' },
  'צ': { name: 'Tsadi',   dynamic: 'Alignment',         short: 'ordering toward justice, forceful demarcation' },
  'ק': { name: 'Qof',     dynamic: 'Summons',           short: 'calling from depth, locating in time, the When' },
  'ר': { name: 'Resh',    dynamic: 'Headship',          short: 'leading, advancing from highest point, seeing ahead' },
  'ש': { name: 'Shin',    dynamic: 'Intensification',   short: 'extending, amplifying, spreading to fullness' },
  'ת': { name: 'Tav',     dynamic: 'Completion',        short: 'marking endpoints, sealing, fulfilling, the Why' }
};

const POSITION_ROLES = {
  R1: 'initiates the action — what sets the root in motion',
  R2: 'mediates the action — how the root sustains, channels, or modulates',
  R3: 'completes the action — where the root arrives, what it produces'
};

// ─── Helpers ─────────────────────────────────────────────────────────────

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function loadJSON(filePath) {
  if (!fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
}

function saveJSON(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
}

async function callLLM(messages, retries = MAX_RETRIES) {
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const resp = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${API_KEY}` },
        body: JSON.stringify({ model: MODEL, messages, temperature: 0.3, max_tokens: 4000 })
      });
      if (!resp.ok) {
        const txt = await resp.text();
        throw new Error(`API ${resp.status}: ${txt}`);
      }
      const data = await resp.json();
      return {
        content: data.choices[0].message.content,
        input_tokens: data.usage?.prompt_tokens || 0,
        output_tokens: data.usage?.completion_tokens || 0
      };
    } catch (err) {
      if (attempt < retries - 1) {
        console.error(`  Retry ${attempt + 1}: ${err.message}`);
        await sleep(2000 * (attempt + 1));
      } else throw err;
    }
  }
}

// ─── Build dynamic gloss for a root ──────────────────────────────────────

function buildDynamicGloss(root) {
  const letters = root.split('');
  if (letters.length !== 3) return null;

  const r1 = LETTER_DYNAMICS[letters[0]];
  const r2 = LETTER_DYNAMICS[letters[1]];
  const r3 = LETTER_DYNAMICS[letters[2]];

  if (!r1 || !r2 || !r3) return null;

  return {
    root,
    r1: { letter: letters[0], name: r1.name, dynamic: r1.dynamic, role: r1.short },
    r2: { letter: letters[1], name: r2.name, dynamic: r2.dynamic, role: r2.short },
    r3: { letter: letters[2], name: r3.name, dynamic: r3.dynamic, role: r3.short },
    gloss: `${r1.dynamic} (${r1.short}) → ${r2.dynamic} (${r2.short}) → ${r3.dynamic} (${r3.short})`
  };
}

// ─── Select diverse root sample ──────────────────────────────────────────

function selectRootSample(rootsData, sampleSize) {
  // Collect all roots with frequency, ensuring diversity across letters
  const allRoots = [];
  const seen = new Set();

  for (const letter of Object.keys(rootsData.letterPositions)) {
    const positions = rootsData.letterPositions[letter];
    for (const pos of ['R1', 'R2', 'R3']) {
      if (!positions[pos]) continue;
      for (const entry of positions[pos]) {
        if (!seen.has(entry.root) && entry.root.length === 3) {
          // Verify all 3 letters are in our framework
          const letters = entry.root.split('');
          if (letters.every(l => LETTER_DYNAMICS[l])) {
            seen.add(entry.root);
            allRoots.push({ root: entry.root, count: entry.count });
          }
        }
      }
    }
  }

  // Sort by frequency (most common roots are more likely to have clear meanings)
  allRoots.sort((a, b) => b.count - a.count);

  // Take top roots but ensure letter diversity
  // Strategy: take top 50% by frequency, then fill remaining from diverse selection
  const halfSample = Math.ceil(sampleSize / 2);
  const selected = allRoots.slice(0, halfSample);
  const selectedSet = new Set(selected.map(r => r.root));

  // For diversity: ensure each letter appears at least once as R1
  const letterCoverage = {};
  for (const r of selected) {
    const r1 = r.root[0];
    letterCoverage[r1] = (letterCoverage[r1] || 0) + 1;
  }

  // Add roots for underrepresented R1 letters
  for (const letter of Object.keys(LETTER_DYNAMICS)) {
    if (!letterCoverage[letter] || letterCoverage[letter] < 2) {
      const pos = rootsData.letterPositions[letter];
      if (pos && pos.R1) {
        for (const entry of pos.R1) {
          if (!selectedSet.has(entry.root) && entry.root.length === 3) {
            const letters = entry.root.split('');
            if (letters.every(l => LETTER_DYNAMICS[l])) {
              selected.push({ root: entry.root, count: entry.count });
              selectedSet.add(entry.root);
              break;
            }
          }
        }
      }
    }
  }

  // Fill remaining from mid-frequency roots for diversity
  const remaining = allRoots.filter(r => !selectedSet.has(r.root));
  const midStart = Math.floor(remaining.length * 0.2);
  const midEnd = Math.floor(remaining.length * 0.6);
  const midRoots = remaining.slice(midStart, midEnd);

  // Shuffle mid-frequency roots and pick
  for (let i = midRoots.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [midRoots[i], midRoots[j]] = [midRoots[j], midRoots[i]];
  }

  while (selected.length < sampleSize && midRoots.length > 0) {
    selected.push(midRoots.pop());
  }

  return selected.slice(0, sampleSize);
}

// ─── LLM Prompts ─────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are a Hebrew linguistics expert analyzing three-letter Hebrew roots (שורשים).

For each root, you will be given:
1. The root in Hebrew letters
2. A "dynamic gloss" — a reading of the root as a sequence of three relational dynamics, where each letter contributes a force:
   - R1 (first radical): initiates the action
   - R2 (second radical): mediates/sustains the action
   - R3 (third radical): completes/resolves the action

Your task: judge whether the dynamic gloss ILLUMINATES the root's actual meaning. Not whether it's a perfect translation, but whether reading the root through these dynamics reveals something genuine about why this root means what it means.

Respond in JSON format.`;

function buildBatchPrompt(batch) {
  const entries = batch.map((item, i) => {
    const gloss = buildDynamicGloss(item.root);
    return `${i + 1}. Root: ${item.root}
   R1: ${gloss.r1.letter} ${gloss.r1.name} (${gloss.r1.dynamic}: ${gloss.r1.role})
   R2: ${gloss.r2.letter} ${gloss.r2.name} (${gloss.r2.dynamic}: ${gloss.r2.role})
   R3: ${gloss.r3.letter} ${gloss.r3.name} (${gloss.r3.dynamic}: ${gloss.r3.role})`;
  }).join('\n\n');

  return `Analyze these Hebrew roots. For each:
1. State the root's primary meaning(s) in biblical Hebrew
2. Read the root as a dynamic sequence (R1 initiates → R2 mediates → R3 completes)
3. Judge: does the dynamic reading illuminate why this root means what it means?

Rate each root's alignment:
- "strong": the dynamic sequence clearly illuminates the meaning — you can see WHY these three letters produce this meaning
- "moderate": the dynamic sequence partially illuminates — some connection is visible but requires interpretation
- "weak": the dynamic sequence does not meaningfully connect to the actual meaning
- "striking": the dynamic sequence reveals something genuinely insightful about the root that a dictionary definition alone would miss

${entries}

Respond in JSON:
{
  "analyses": [
    {
      "root": "...",
      "meaning": "primary meaning(s)",
      "dynamic_reading": "how the three dynamics compose into the meaning",
      "alignment": "strong|moderate|weak|striking",
      "insight": "what the dynamic reading reveals (or why it fails)"
    }
  ]
}`;
}

// ─── Main analysis ───────────────────────────────────────────────────────

async function analyzeRoots(sample, checkpoint = null) {
  const results = checkpoint?.results || [];
  const processedRoots = new Set(results.map(r => r.root));
  let totalIn = checkpoint?.totalIn || 0;
  let totalOut = checkpoint?.totalOut || 0;
  let errors = 0;

  // Filter out already-processed roots
  const remaining = sample.filter(s => !processedRoots.has(s.root));

  if (remaining.length === 0) {
    console.log('  All roots already processed.');
    return { results, totalIn, totalOut, errors };
  }

  console.log(`  ${remaining.length} roots to analyze (${results.length} already done)`);

  // Process in batches
  for (let i = 0; i < remaining.length; i += BATCH_SIZE) {
    const batch = remaining.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(remaining.length / BATCH_SIZE);

    process.stdout.write(`  Batch ${batchNum}/${totalBatches} (${batch.length} roots)... `);

    try {
      const prompt = buildBatchPrompt(batch);
      const response = await callLLM([
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: prompt }
      ]);

      totalIn += response.input_tokens;
      totalOut += response.output_tokens;

      // Parse JSON from response
      const jsonMatch = response.content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        console.log('ERROR: no JSON found');
        errors++;
        continue;
      }

      const parsed = JSON.parse(jsonMatch[0]);
      if (parsed.analyses) {
        for (const analysis of parsed.analyses) {
          const gloss = buildDynamicGloss(analysis.root);
          results.push({
            ...analysis,
            dynamic_gloss: gloss?.gloss || '',
            frequency: sample.find(s => s.root === analysis.root)?.count || 0
          });
        }
      }

      // Count alignments in this batch
      const batchResults = parsed.analyses || [];
      const striking = batchResults.filter(r => r.alignment === 'striking').length;
      const strong = batchResults.filter(r => r.alignment === 'strong').length;
      const moderate = batchResults.filter(r => r.alignment === 'moderate').length;
      const weak = batchResults.filter(r => r.alignment === 'weak').length;

      console.log(`done [${striking}S+ ${strong}S ${moderate}M ${weak}W] [${response.input_tokens}+${response.output_tokens} tok]`);

      // Save checkpoint
      saveJSON(CHECKPOINT_FILE, { results, totalIn, totalOut, timestamp: new Date().toISOString() });

    } catch (err) {
      console.log(`ERROR: ${err.message}`);
      errors++;
    }

    await sleep(REQUEST_DELAY_MS);
  }

  return { results, totalIn, totalOut, errors };
}

// ─── Scoring ─────────────────────────────────────────────────────────────

function computeScores(results) {
  const total = results.length;
  if (total === 0) return null;

  const counts = { striking: 0, strong: 0, moderate: 0, weak: 0 };
  for (const r of results) {
    const level = r.alignment?.toLowerCase() || 'weak';
    counts[level] = (counts[level] || 0) + 1;
  }

  const illuminated = counts.striking + counts.strong + counts.moderate;
  const illuminationRate = illuminated / total;
  const strongRate = (counts.striking + counts.strong) / total;

  // Per-letter analysis: how well does each letter's dynamic work in roots?
  const letterScores = {};
  for (const letter of Object.keys(LETTER_DYNAMICS)) {
    letterScores[letter] = { striking: 0, strong: 0, moderate: 0, weak: 0, total: 0 };
  }

  for (const r of results) {
    if (!r.root || r.root.length !== 3) continue;
    const level = r.alignment?.toLowerCase() || 'weak';
    for (const ch of r.root.split('')) {
      if (letterScores[ch]) {
        letterScores[ch][level]++;
        letterScores[ch].total++;
      }
    }
  }

  return {
    total,
    counts,
    illuminationRate: Math.round(illuminationRate * 1000) / 10,
    strongRate: Math.round(strongRate * 1000) / 10,
    letterScores
  };
}

// ─── Main ────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const isDryRun = args.includes('--dry-run');
  const isResume = args.includes('--resume');
  const sampleIdx = args.indexOf('--sample');
  const sampleSize = sampleIdx >= 0 ? parseInt(args[sampleIdx + 1]) : (isDryRun ? 20 : DEFAULT_SAMPLE);

  console.log('=== Hebrew Signs — Root as Micro-Sentence Test ===');
  console.log(`Date: ${new Date().toISOString().split('T')[0]}`);
  if (isDryRun) console.log('MODE: Dry run');
  console.log();

  // Load roots
  console.log('Loading extracted roots...');
  const rootsData = loadJSON(ROOTS_FILE);
  if (!rootsData) {
    console.error('ERROR: No extracted roots file. Run hebrew-signs-root-position.js --extract-only first.');
    process.exit(1);
  }
  console.log(`  ${rootsData.totalRoots} roots available`);

  // Select sample
  console.log(`\nSelecting ${sampleSize} root sample...`);
  const sample = selectRootSample(rootsData, sampleSize);
  console.log(`  Selected ${sample.length} roots (freq range: ${sample[sample.length - 1]?.count}-${sample[0]?.count})`);

  // Show a few examples
  console.log('\n── Sample dynamic glosses ──');
  for (const item of sample.slice(0, 5)) {
    const gloss = buildDynamicGloss(item.root);
    if (gloss) {
      console.log(`  ${item.root}: ${gloss.r1.name}(${gloss.r1.dynamic}) → ${gloss.r2.name}(${gloss.r2.dynamic}) → ${gloss.r3.name}(${gloss.r3.dynamic})`);
    }
  }

  // Load checkpoint if resuming
  let checkpoint = null;
  if (isResume) {
    checkpoint = loadJSON(CHECKPOINT_FILE);
    if (checkpoint) {
      console.log(`\nResuming from checkpoint: ${checkpoint.results.length} roots done`);
    }
  }

  // Run analysis
  console.log('\n── Running analysis ──');
  const startTime = Date.now();
  const { results, totalIn, totalOut, errors } = await analyzeRoots(sample, checkpoint);
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

  // Score
  console.log('\n── Scoring ──');
  const scores = computeScores(results);

  if (scores) {
    console.log(`  Total roots analyzed: ${scores.total}`);
    console.log(`  Striking: ${scores.counts.striking} (${Math.round(scores.counts.striking / scores.total * 100)}%)`);
    console.log(`  Strong: ${scores.counts.strong} (${Math.round(scores.counts.strong / scores.total * 100)}%)`);
    console.log(`  Moderate: ${scores.counts.moderate} (${Math.round(scores.counts.moderate / scores.total * 100)}%)`);
    console.log(`  Weak: ${scores.counts.weak} (${Math.round(scores.counts.weak / scores.total * 100)}%)`);
    console.log(`  Illumination rate (S+ + S + M): ${scores.illuminationRate}%`);
    console.log(`  Strong rate (S+ + S): ${scores.strongRate}%`);

    // Per-letter breakdown
    console.log('\n── Per-letter performance ──');
    for (const letter of Object.keys(LETTER_DYNAMICS)) {
      const ls = scores.letterScores[letter];
      if (ls.total === 0) continue;
      const illum = ls.striking + ls.strong + ls.moderate;
      const pct = Math.round(illum / ls.total * 100);
      const bar = '█'.repeat(Math.round(pct / 5)) + '░'.repeat(20 - Math.round(pct / 5));
      console.log(`  ${letter} ${LETTER_DYNAMICS[letter].name.padEnd(8)} ${bar} ${pct}% (${illum}/${ls.total}) [S+:${ls.striking} S:${ls.strong} M:${ls.moderate} W:${ls.weak}]`);
    }

    // Top striking examples
    const strikingExamples = results.filter(r => r.alignment === 'striking').slice(0, 10);
    if (strikingExamples.length > 0) {
      console.log('\n── Most striking illuminations ──');
      for (const ex of strikingExamples) {
        console.log(`  ${ex.root} "${ex.meaning}"`);
        console.log(`    ${ex.dynamic_reading}`);
        console.log(`    → ${ex.insight}`);
        console.log();
      }
    }
  }

  // Save output
  const output = {
    type: 'hebrew-signs-micro-sentence-analysis',
    description: 'Tests whether reading 3-letter Hebrew roots as dynamic sequences (letter dynamics composed across positions) produces meaningful glosses',
    model: MODEL,
    generated: new Date().toISOString(),
    sample_size: sample.length,
    methodology: 'Each root read as R1(initiates) → R2(mediates) → R3(completes) using corrected letter dynamics. LLM judges alignment between dynamic reading and actual meaning.',
    scores,
    results,
    cost_usd: Math.round((totalIn * 2 + totalOut * 10) / 1e6 * 10000) / 10000,
    tokens: { input: totalIn, output: totalOut },
    time_seconds: parseFloat(elapsed),
    errors
  };

  saveJSON(OUTPUT_FILE, output);
  console.log(`\n══ Summary ══`);
  console.log(`Roots analyzed: ${results.length}`);
  console.log(`Time: ${elapsed}s`);
  console.log(`Tokens: ${totalIn.toLocaleString()} in + ${totalOut.toLocaleString()} out`);
  console.log(`Cost: $${output.cost_usd}`);
  console.log(`Errors: ${errors}`);
  console.log(`\nWritten to: ${OUTPUT_FILE}`);

  // Cleanup checkpoint
  if (fs.existsSync(CHECKPOINT_FILE)) {
    fs.unlinkSync(CHECKPOINT_FILE);
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
