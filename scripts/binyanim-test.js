#!/usr/bin/env node
// hebrew-signs-binyanim-test.js — Binyanim Blind Prediction Test
//
// Tests two claims from the morphological architecture document:
//
// Test 1 (Blind Prediction): Can we predict meaning shifts across binyanim
//   from letter dynamics alone? Three-call structure ensures blindness:
//   - Call A: Given root dynamics + Qal meaning → predict each binyan's meaning
//   - Call B: Independent Hebrew lexicographer → provides actual meanings
//   - Call C: Compare predictions against actuals → score
//
// Test 2 (Prefix Letter Dynamics): Do the letters each binyan adds carry
//   dynamics that predict the transformation type?
//
// Usage:
//   node hebrew-signs-binyanim-test.js                  # Full run (100 roots)
//   node hebrew-signs-binyanim-test.js --dry-run        # 10 roots
//   node hebrew-signs-binyanim-test.js --sample 50      # Custom sample size
//   node hebrew-signs-binyanim-test.js --resume         # Resume from checkpoint
//   node hebrew-signs-binyanim-test.js --test2-only     # Run only Test 2

const fs = require('fs');
const path = require('path');

// ─── Config ────────────────────────────────────────────────────────────────

const INPUT_DIR = path.join(__dirname, '..', 'data');
const BINYANIM_FILE = path.join(INPUT_DIR, 'morphhb-binyanim.json');
const OUTPUT_FILE = path.join(INPUT_DIR, 'binyanim-prediction-test.json');
const CHECKPOINT_FILE = path.join(INPUT_DIR, 'binyanim-checkpoint.json');

const MODEL = 'grok-4-1-fast-non-reasoning';
const API_URL = 'https://api.x.ai/v1/chat/completions';
const API_KEY = process.env.XAI_API_KEY;
const REQUEST_DELAY_MS = 300;
const MAX_RETRIES = 3;
const BATCH_SIZE = 10; // roots per batch (3 LLM calls per batch)
const DEFAULT_SAMPLE = 100;

// ─── Letter Dynamics (same as micro-sentence.js) ──────────────────────────

const LETTER_DYNAMICS = {
  'א': { name: 'Aleph',   dynamic: 'Origination',      short: 'initiating, establishing presence' },
  'ב': { name: 'Bet',     dynamic: 'Containment',       short: 'enclosing, housing, giving form' },
  'ג': { name: 'Gimel',   dynamic: 'Traversal',         short: 'journeying, process, crossing distance' },
  'ד': { name: 'Dalet',   dynamic: 'Passage',           short: 'directing through thresholds' },
  'ה': { name: 'Hei',     dynamic: 'Revelation',        short: 'making visible, pointing to' },
  'ו': { name: 'Vav',     dynamic: 'Conjunction',       short: 'joining, binding, linking' },
  'ז': { name: 'Zayin',   dynamic: 'Division',          short: 'cutting, separating forcefully' },
  'ח': { name: 'Chet',    dynamic: 'Vitalization',      short: 'animating with life-force' },
  'ט': { name: 'Tet',     dynamic: 'Materialization',   short: 'emerging physically, coiling' },
  'י': { name: 'Yud',     dynamic: 'Agency',            short: 'acting with purpose' },
  'כ': { name: 'Kaf',     dynamic: 'Actualization',     short: 'holding, measuring, realizing' },
  'ל': { name: 'Lamed',   dynamic: 'Direction',         short: 'pointing toward, purposing' },
  'מ': { name: 'Mem',     dynamic: 'Flow',              short: 'channeling from source' },
  'נ': { name: 'Nun',     dynamic: 'Propagation',       short: 'extending outward, transmitting' },
  'ס': { name: 'Samekh',  dynamic: 'Encirclement',      short: 'surrounding, supporting' },
  'ע': { name: 'Ayin',    dynamic: 'Perception',        short: 'seeing, beholding' },
  'פ': { name: 'Pe',      dynamic: 'Projection',        short: 'propelling outward' },
  'צ': { name: 'Tsadi',   dynamic: 'Alignment',         short: 'ordering toward justice' },
  'ק': { name: 'Qof',     dynamic: 'Summons',           short: 'calling from depth' },
  'ר': { name: 'Resh',    dynamic: 'Headship',          short: 'leading, advancing' },
  'ש': { name: 'Shin',    dynamic: 'Intensification',   short: 'extending, amplifying' },
  'ת': { name: 'Tav',     dynamic: 'Completion',        short: 'marking endpoints, sealing' }
};

// Binyan transformation rules based on morphological architecture
const BINYAN_RULES = {
  'Qal':     { type: 'Base',              description: 'The root action itself, unmarked' },
  'Niphal':  { type: 'Passive/Reflexive', description: 'The action is received by the subject, or the subject acts upon itself. Adds נ (Nun = Propagation/Extension) as prefix.' },
  'Piel':    { type: 'Intensive',         description: 'The action is performed intensively, thoroughly, or repeatedly. Doubles the second radical (R2), intensifying its mediating dynamic.' },
  'Pual':    { type: 'Intensive Passive',  description: 'The intensive action is received. Doubles R2 with passive vowel pattern.' },
  'Hiphil':  { type: 'Causative',         description: 'X causes another to perform the action. Adds ה (Hei = Revelation/Making-visible) as prefix.' },
  'Hophal':  { type: 'Causative Passive',  description: 'The causation is received. Adds ה with passive vowel pattern.' },
  'Hitpael': { type: 'Reflexive/Reciprocal', description: 'The subject performs the action on/for/among itself. Adds הת (Hei = Revelation + Tav = Completion) as prefix.' }
};

// ─── Helpers ───────────────────────────────────────────────────────────────

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

// ─── Extract root consonants from Strong's data ───────────────────────────

const FINAL_TO_BASE = { 'ך': 'כ', 'ם': 'מ', 'ן': 'נ', 'ף': 'פ', 'ץ': 'צ' };
const HEBREW_CONSONANT_SET = new Set([
  'א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ז', 'ח', 'ט', 'י', 'כ',
  'ל', 'מ', 'נ', 'ס', 'ע', 'פ', 'צ', 'ק', 'ר', 'ש', 'ת',
  'ך', 'ם', 'ן', 'ף', 'ץ'
]);

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

function extractRootFromEntry(entry) {
  // Strategy: prefer Qal perfect forms (morph contains 'qp') — these show root consonants
  // directly in CaCaC pattern. Then try any 3-letter Qal form. Then strip prefixes.
  const qalForms = entry.forms['Qal'];
  if (qalForms && qalForms.examples.length > 0) {
    // 1. Try Qal perfect (3ms) forms first — morph like HVqp3ms
    for (const ex of qalForms.examples) {
      if (ex.morph && ex.morph.includes('qp')) {
        const consonants = stripToConsonants(ex.text);
        if (consonants.length === 3 && consonants.split('').every(c => LETTER_DYNAMICS[c])) {
          return consonants;
        }
      }
    }
    // 2. Try any Qal form that yields 3 consonants
    for (const ex of qalForms.examples) {
      const consonants = stripToConsonants(ex.text);
      if (consonants.length === 3 && consonants.split('').every(c => LETTER_DYNAMICS[c])) {
        return consonants;
      }
    }
    // 3. Strip known imperfect prefixes (י/ת/א/נ) and vav-consecutive (ו)
    for (const ex of qalForms.examples) {
      let consonants = stripToConsonants(ex.text);
      // Strip leading ו (vav-consecutive)
      if (consonants.length >= 4 && consonants[0] === 'ו') {
        consonants = consonants.substring(1);
      }
      // Strip imperfect prefix (י/ת/א/נ)
      if (consonants.length === 4 && 'יתאנ'.includes(consonants[0])) {
        const stripped = consonants.substring(1);
        if (stripped.split('').every(c => LETTER_DYNAMICS[c])) {
          return stripped;
        }
      }
      // Strip both vav + prefix
      if (consonants.length === 4) {
        const stripped = consonants.substring(1);
        if (stripped.split('').every(c => LETTER_DYNAMICS[c])) {
          return stripped;
        }
      }
    }
  }

  // Fallback: use the root field from cross-reference if valid
  if (entry.root && entry.root.length === 3 && entry.root.split('').every(c => LETTER_DYNAMICS[c])) {
    return entry.root;
  }

  return null;
}

// After Call B returns actual meanings including root consonants, update the
// sample entry's root and recompute dynamics. This ensures predictions use
// correct roots even when surface form extraction fails.
function updateRootFromLexicon(sampleEntry, lexicalRoot) {
  if (!lexicalRoot || lexicalRoot.length !== 3) return false;
  const letters = lexicalRoot.split('');
  if (!letters.every(c => LETTER_DYNAMICS[c])) return false;

  sampleEntry.root = lexicalRoot;
  sampleEntry.gloss = buildDynamicGloss(lexicalRoot);
  return true;
}

// ─── Select test sample ───────────────────────────────────────────────────

function selectSample(binyanData, sampleSize) {
  const candidates = [];

  for (const entry of binyanData.multiBinyanRoots) {
    // Need at least 3 binyanim including Qal
    if (!entry.forms['Qal']) continue;
    if (entry.binyanCount < 3) continue;

    // Extract root consonants
    const root = extractRootFromEntry(entry);
    if (!root) continue;

    // Compute dynamics
    const gloss = buildDynamicGloss(root);
    if (!gloss) continue;

    // Get non-Qal binyanim
    const nonQalBinyanim = Object.keys(entry.forms).filter(b => b !== 'Qal');
    if (nonQalBinyanim.length < 2) continue;

    candidates.push({
      strongs: entry.strongs,
      root,
      gloss,
      binyanim: Object.keys(entry.forms),
      nonQalBinyanim,
      totalAttestations: entry.totalAttestations,
      forms: entry.forms
    });
  }

  // Sort by attestation count (most attested roots have clearest meanings)
  candidates.sort((a, b) => b.totalAttestations - a.totalAttestations);

  // Ensure diversity: pick from top, middle, and tail
  const top = candidates.slice(0, Math.ceil(sampleSize * 0.5));
  const mid = candidates.slice(
    Math.floor(candidates.length * 0.25),
    Math.floor(candidates.length * 0.75)
  );
  const selected = [...top];
  const selectedRoots = new Set(selected.map(s => s.root));

  // Shuffle mid and add unique entries
  for (let i = mid.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [mid[i], mid[j]] = [mid[j], mid[i]];
  }
  for (const c of mid) {
    if (selected.length >= sampleSize) break;
    if (!selectedRoots.has(c.root)) {
      selected.push(c);
      selectedRoots.add(c.root);
    }
  }

  return selected.slice(0, sampleSize);
}

// ─── Test 1: Blind Prediction ──────────────────────────────────────────────

const PREDICT_SYSTEM = `You are a theoretical linguist testing a hypothesis about Hebrew morphology. You have been given a framework that assigns a relational dynamic to each Hebrew consonant. Your task is to PREDICT what a root should mean in various verb stems (binyanim), using ONLY the dynamics framework and the Qal (base) meaning.

You are making blind predictions. Do not look up or recall actual Hebrew lexical data — predict from the dynamics alone.

Respond in JSON format.`;

function buildPredictPrompt(batch) {
  const entries = batch.map((item, i) => {
    const g = item.gloss;
    const nonQal = item.nonQalBinyanim;
    const binyanDescriptions = nonQal.map(b => {
      const rule = BINYAN_RULES[b];
      return `  - ${b} (${rule.type}): ${rule.description}`;
    }).join('\n');

    return `${i + 1}. Root: ${item.root} (Strong's H${item.strongs})
   Dynamic micro-sentence:
     R1: ${g.r1.letter} ${g.r1.name} — ${g.r1.dynamic} (${g.r1.role})
     R2: ${g.r2.letter} ${g.r2.name} — ${g.r2.dynamic} (${g.r2.role})
     R3: ${g.r3.letter} ${g.r3.name} — ${g.r3.dynamic} (${g.r3.role})
   Qal meaning will be provided separately. For now, predict what each binyan transformation SHOULD do to this root's dynamic, based on the transformation rules:
${binyanDescriptions}`;
  }).join('\n\n');

  return `For each root below, you will be told its dynamic micro-sentence (what each consonant contributes) and which non-Qal binyanim it appears in. The Qal meaning of each root is:

${batch.map((item, i) => `${i + 1}. ${item.root}: [Qal meaning will be filled by the system — for now use the dynamics to predict]`).join('\n')}

Actually, I need to give you the Qal meanings to anchor your predictions. Here they are — these are the ONLY lexical facts you may use:

${batch.map((item, i) => `${i + 1}. ${item.root} (H${item.strongs}): Qal = [to be provided in next message]`).join('\n')}

Wait — I will restructure. For each root, predict what the non-Qal binyanim should mean. Base your predictions on:
1. The root's dynamic micro-sentence (the consonant dynamics)
2. The binyan transformation rules (passive, intensive, causative, reflexive)
3. How the DYNAMICS should transform — not just the grammar

${entries}

For each root, provide predictions in JSON:
{
  "predictions": [
    {
      "root": "...",
      "strongs": "H...",
      "predicted_meanings": {
        "BinyanName": "predicted meaning based on dynamics + transformation"
      },
      "reasoning": "brief explanation of how dynamics guided the prediction"
    }
  ]
}`;
}

// This is Call A but we need to include Qal meanings.
// Better: combine into a single predict prompt WITH Qal meanings.
function buildPredictPromptWithQal(batch, qalMeanings) {
  const entries = batch.map((item, i) => {
    const g = item.gloss;
    const qalMeaning = qalMeanings[item.strongs] || 'unknown';
    const nonQal = item.nonQalBinyanim;
    const binyanDescriptions = nonQal.map(b => {
      const rule = BINYAN_RULES[b];
      return `    - ${b} (${rule.type}): ${rule.description}`;
    }).join('\n');

    return `${i + 1}. Root: ${item.root} (H${item.strongs})
   Qal meaning: "${qalMeaning}"
   Dynamic micro-sentence:
     R1: ${g.r1.letter} ${g.r1.name} — ${g.r1.dynamic} (${g.r1.role})
     R2: ${g.r2.letter} ${g.r2.name} — ${g.r2.dynamic} (${g.r2.role})
     R3: ${g.r3.letter} ${g.r3.name} — ${g.r3.dynamic} (${g.r3.role})
   Predict meanings in these binyanim:
${binyanDescriptions}`;
  }).join('\n\n');

  return `You are given Hebrew roots with their Qal (base) meanings and their dynamic micro-sentences. For each root, PREDICT what it should mean in each non-Qal binyan listed.

Your predictions must be based on:
1. The Qal meaning (your anchor)
2. The dynamic micro-sentence (how each consonant contributes)
3. How the binyan transformation interacts with these specific dynamics

Do NOT recall or look up actual Hebrew meanings — predict from the framework.

${entries}

Respond in JSON:
{
  "predictions": [
    {
      "root": "...",
      "strongs": "...",
      "predicted_meanings": {
        "BinyanName": "your predicted meaning"
      },
      "reasoning": "how dynamics guided your prediction"
    }
  ]
}`;
}

const VERIFY_SYSTEM = `You are a Hebrew lexicographer. For each root and Strong's number given, provide the actual attested meanings in biblical Hebrew across all verb stems (binyanim) in which it appears.

Use standard lexical sources (BDB, HALOT). Be precise and concise. Do NOT reference any "dynamics" or "micro-sentence" framework — this is pure lexicography.

Respond in JSON format.`;

function buildVerifyPrompt(batch) {
  const entries = batch.map((item, i) => {
    const binyanList = item.binyanim.join(', ');
    return `${i + 1}. Strong's H${item.strongs} — attested in: ${binyanList}`;
  }).join('\n');

  return `For each Hebrew root below (identified by Strong's number), provide:
1. The trilateral root consonants (3 Hebrew letters, no vowels)
2. Its actual meaning in each listed binyan

${entries}

Respond in JSON:
{
  "lexical_entries": [
    {
      "strongs": "H...",
      "root_consonants": "שׁלח",
      "meanings": {
        "Qal": "actual Qal meaning",
        "Niphal": "actual Niphal meaning"
      }
    }
  ]
}`;
}

const SCORE_SYSTEM = `You are a linguistics evaluator. You will compare PREDICTED meanings against ACTUAL meanings for Hebrew verb roots across different binyanim.

Score each prediction using this rubric:
- "precise": Prediction closely matches the actual meaning in sense and specificity
- "directional": Right general category of change, but details or nuances differ
- "partial": Some connection visible, but significant divergence in meaning
- "miss": Prediction does not meaningfully match the actual meaning

Be rigorous but fair. A prediction of "to be caused to write" for an actual meaning of "to dictate" is directional (causation is right, but specific realization differs).

Respond in JSON format.`;

function buildScorePrompt(predictions, actuals) {
  const comparisons = [];
  const norm = s => (s || '').replace(/^H/, '');

  for (const pred of predictions) {
    const actual = actuals.find(a => norm(a.strongs) === norm(pred.strongs));
    if (!actual) continue;

    const pairs = [];
    for (const [binyan, predicted] of Object.entries(pred.predicted_meanings || {})) {
      const actualMeaning = actual.meanings?.[binyan];
      if (actualMeaning) {
        pairs.push({ binyan, predicted, actual: actualMeaning });
      }
    }

    if (pairs.length > 0) {
      comparisons.push({
        root: pred.root,
        strongs: pred.strongs,
        qal_meaning: actual.meanings?.Qal || 'unknown',
        pairs
      });
    }
  }

  return `Compare these predicted vs actual meanings for Hebrew roots across binyanim.

${comparisons.map((c, i) => {
    const pairStr = c.pairs.map(p =>
      `  ${p.binyan}: PREDICTED "${p.predicted}" vs ACTUAL "${p.actual}"`
    ).join('\n');
    return `${i + 1}. ${c.root} (${c.strongs}) — Qal: "${c.qal_meaning}"
${pairStr}`;
  }).join('\n\n')}

Score each comparison. Respond in JSON:
{
  "scores": [
    {
      "root": "...",
      "strongs": "...",
      "binyan_scores": {
        "BinyanName": {
          "score": "precise|directional|partial|miss",
          "note": "brief explanation"
        }
      }
    }
  ]
}`;
}

// ─── Run Test 1 ────────────────────────────────────────────────────────────

async function runTest1(sample, checkpoint = null) {
  const results = checkpoint?.results || [];
  const processedStrongs = new Set(results.map(r => r.strongs));
  let totalIn = checkpoint?.totalIn || 0;
  let totalOut = checkpoint?.totalOut || 0;
  let errors = 0;

  const remaining = sample.filter(s => !processedStrongs.has(s.strongs));

  if (remaining.length === 0) {
    console.log('  All roots already processed.');
    return { results, totalIn, totalOut, errors };
  }

  console.log(`  ${remaining.length} roots to test (${results.length} already done)`);

  for (let i = 0; i < remaining.length; i += BATCH_SIZE) {
    const batch = remaining.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(remaining.length / BATCH_SIZE);

    console.log(`\n  Batch ${batchNum}/${totalBatches} (${batch.length} roots)`);

    try {
      // ── Call B first: Get actual meanings (independent of predictions) ──
      process.stdout.write('    Call B (verify)... ');
      const verifyResp = await callLLM([
        { role: 'system', content: VERIFY_SYSTEM },
        { role: 'user', content: buildVerifyPrompt(batch) }
      ]);
      totalIn += verifyResp.input_tokens;
      totalOut += verifyResp.output_tokens;

      const verifyMatch = verifyResp.content.match(/\{[\s\S]*\}/);
      if (!verifyMatch) { console.log('ERROR: no JSON'); errors++; continue; }
      const verifyData = JSON.parse(verifyMatch[0]);
      const actuals = verifyData.lexical_entries || [];
      console.log(`done (${actuals.length} entries) [${verifyResp.input_tokens}+${verifyResp.output_tokens} tok]`);

      // Update roots from lexicographer's root_consonants (more reliable than surface forms)
      let rootFixes = 0;
      for (const a of actuals) {
        if (a.root_consonants) {
          const sEntry = batch.find(s => s.strongs === (a.strongs || '').replace('H', ''));
          if (sEntry) {
            const lexRoot = stripToConsonants(a.root_consonants);
            if (lexRoot !== sEntry.root && updateRootFromLexicon(sEntry, lexRoot)) {
              rootFixes++;
            }
          }
        }
      }
      if (rootFixes > 0) console.log(`    Fixed ${rootFixes} root(s) from lexicon`);

      // Extract Qal meanings for prediction prompt
      const qalMeanings = {};
      for (const a of actuals) {
        const key = (a.strongs || '').replace('H', '');
        qalMeanings[key] = a.meanings?.Qal || 'unknown';
      }

      await sleep(REQUEST_DELAY_MS);

      // ── Call A: Predict meanings from dynamics ──
      process.stdout.write('    Call A (predict)... ');
      const predictResp = await callLLM([
        { role: 'system', content: PREDICT_SYSTEM },
        { role: 'user', content: buildPredictPromptWithQal(batch, qalMeanings) }
      ]);
      totalIn += predictResp.input_tokens;
      totalOut += predictResp.output_tokens;

      const predictMatch = predictResp.content.match(/\{[\s\S]*\}/);
      if (!predictMatch) { console.log('ERROR: no JSON'); errors++; continue; }
      const predictData = JSON.parse(predictMatch[0]);
      const predictions = predictData.predictions || [];
      console.log(`done (${predictions.length} predictions) [${predictResp.input_tokens}+${predictResp.output_tokens} tok]`);

      await sleep(REQUEST_DELAY_MS);

      // ── Call C: Score predictions against actuals ──
      process.stdout.write('    Call C (score)... ');
      const scoreResp = await callLLM([
        { role: 'system', content: SCORE_SYSTEM },
        { role: 'user', content: buildScorePrompt(predictions, actuals) }
      ]);
      totalIn += scoreResp.input_tokens;
      totalOut += scoreResp.output_tokens;

      const scoreMatch = scoreResp.content.match(/\{[\s\S]*\}/);
      if (!scoreMatch) { console.log('ERROR: no JSON'); errors++; continue; }
      const scoreData = JSON.parse(scoreMatch[0]);
      const scores = scoreData.scores || [];
      console.log(`done (${scores.length} scored) [${scoreResp.input_tokens}+${scoreResp.output_tokens} tok]`);

      // Merge results (normalize Strong's numbers — may have H prefix)
      const norm = s => (s || '').replace(/^H/, '');
      for (const score of scores) {
        const sn = norm(score.strongs);
        const pred = predictions.find(p => norm(p.strongs) === sn);
        const actual = actuals.find(a => norm(a.strongs) === sn);
        const sampleEntry = batch.find(s => s.strongs === sn);

        results.push({
          root: score.root,
          strongs: score.strongs,
          binyanim: sampleEntry?.binyanim || [],
          qal_meaning: actual?.meanings?.Qal || 'unknown',
          dynamic_gloss: sampleEntry?.gloss?.gloss || '',
          predictions: pred?.predicted_meanings || {},
          actuals: actual?.meanings || {},
          scores: score.binyan_scores || {},
          reasoning: pred?.reasoning || ''
        });
      }

      // Batch summary
      let batchPrecise = 0, batchDirectional = 0, batchPartial = 0, batchMiss = 0;
      for (const score of scores) {
        for (const [, s] of Object.entries(score.binyan_scores || {})) {
          const level = s.score?.toLowerCase() || 'miss';
          if (level === 'precise') batchPrecise++;
          else if (level === 'directional') batchDirectional++;
          else if (level === 'partial') batchPartial++;
          else batchMiss++;
        }
      }
      console.log(`    Summary: ${batchPrecise}P ${batchDirectional}D ${batchPartial}+ ${batchMiss}M`);

      // Save checkpoint
      saveJSON(CHECKPOINT_FILE, { results, totalIn, totalOut, timestamp: new Date().toISOString() });

    } catch (err) {
      console.log(`    ERROR: ${err.message}`);
      errors++;
    }

    await sleep(REQUEST_DELAY_MS);
  }

  return { results, totalIn, totalOut, errors };
}

// ─── Test 2: Prefix Letter Dynamics ────────────────────────────────────────

async function runTest2() {
  console.log('\n═══ Test 2: Prefix Letter Dynamics ═══\n');

  // The structural argument
  const prefixAnalysis = [
    {
      binyan: 'Niphal',
      addedLetters: 'נ',
      addedDynamics: 'Propagation (extending outward, transmitting)',
      traditionalFunction: 'Passive / Reflexive',
      prediction: 'Nun propagates the action outward — it extends/transmits the root process. When the action is "propagated," it can be received (passive) or reflected back (reflexive). Propagation is outward extension: if what extends is the action itself, the subject becomes its recipient.',
      alignment: null
    },
    {
      binyan: 'Hiphil',
      addedLetters: 'ה',
      addedDynamics: 'Revelation (making visible, pointing to)',
      traditionalFunction: 'Causative',
      prediction: 'Hei makes the action visible/present — it reveals the root process. To "reveal" an action is to make it happen: causation is making-visible in the world. The causer is the one who makes the action appear.',
      alignment: null
    },
    {
      binyan: 'Hophal',
      addedLetters: 'ה (passive vowel)',
      addedDynamics: 'Revelation (passive form)',
      traditionalFunction: 'Causative Passive',
      prediction: 'Same ה (revelation) but passivized: the making-visible is received. Someone is caused to undergo the action — the revelation falls upon them.',
      alignment: null
    },
    {
      binyan: 'Hitpael',
      addedLetters: 'הת',
      addedDynamics: 'Revelation + Completion',
      traditionalFunction: 'Reflexive / Reciprocal',
      prediction: 'Hei (revelation) + Tav (completion): making the action visible AND sealing it back to the subject. The action is revealed (ה) and its endpoint marks the subject (ת). This creates reflexivity — the action cycles back to its origin, completing a circuit.',
      alignment: null
    },
    {
      binyan: 'Piel',
      addedLetters: 'doubles R2',
      addedDynamics: 'Intensification of the mediating dynamic',
      traditionalFunction: 'Intensive',
      prediction: 'R2 mediates the root action. Doubling R2 amplifies the mediation — the channel through which the action flows is widened, deepened, repeated. This produces intensity: more of the same action, done more thoroughly.',
      alignment: null
    },
    {
      binyan: 'Pual',
      addedLetters: 'doubles R2 (passive vowel)',
      addedDynamics: 'Intensification of mediation (passive)',
      traditionalFunction: 'Intensive Passive',
      prediction: 'Same R2 doubling but passivized. The intensive action is received. The subject undergoes thorough, repeated, or intensive application of the root process.',
      alignment: null
    }
  ];

  // LLM evaluation
  const evalPrompt = `A theoretical framework assigns relational dynamics to Hebrew consonants. We want to test whether the letters added by each binyan (verb stem) carry dynamics that predict the transformation type.

Here are the claims:

${prefixAnalysis.map((p, i) => `${i + 1}. ${p.binyan}
   Added letters: ${p.addedLetters}
   Dynamic(s): ${p.addedDynamics}
   Traditional function: ${p.traditionalFunction}
   Claim: ${p.prediction}`).join('\n\n')}

For each, evaluate:
- Does the dynamic of the added letter(s) genuinely predict the grammatical transformation?
- Is this a meaningful connection or a post-hoc rationalization?
- Rate: "strong" (the dynamic clearly predicts the function), "moderate" (plausible connection but could be coincidence), "weak" (forced or unconvincing)

Also evaluate the SYSTEM as a whole:
- Are there alternative explanations for why these letters were chosen for these functions?
- Does the pattern hold consistently or only for some binyanim?

Respond in JSON:
{
  "evaluations": [
    {
      "binyan": "...",
      "rating": "strong|moderate|weak",
      "assessment": "explanation"
    }
  ],
  "system_evaluation": {
    "overall_rating": "strong|moderate|weak",
    "consistency": "...",
    "alternative_explanations": "...",
    "conclusion": "..."
  }
}`;

  process.stdout.write('  Evaluating prefix letter dynamics... ');
  const evalResp = await callLLM([
    { role: 'system', content: 'You are a Hebrew linguistics expert and critical evaluator of morphological theories. Be rigorous and fair.' },
    { role: 'user', content: evalPrompt }
  ]);
  console.log(`done [${evalResp.input_tokens}+${evalResp.output_tokens} tok]`);

  const evalMatch = evalResp.content.match(/\{[\s\S]*\}/);
  if (!evalMatch) {
    console.log('  ERROR: no JSON in response');
    return { prefixAnalysis, evaluation: null, tokens: { input: evalResp.input_tokens, output: evalResp.output_tokens } };
  }

  const evalData = JSON.parse(evalMatch[0]);

  // Merge evaluations into prefix analysis
  for (const ev of evalData.evaluations || []) {
    const entry = prefixAnalysis.find(p => p.binyan === ev.binyan);
    if (entry) {
      entry.alignment = ev.rating;
      entry.assessment = ev.assessment;
    }
  }

  // Display results
  console.log('\n── Prefix Letter Dynamic Evaluations ──');
  for (const p of prefixAnalysis) {
    const icon = p.alignment === 'strong' ? '●' : p.alignment === 'moderate' ? '◐' : '○';
    console.log(`  ${icon} ${p.binyan.padEnd(10)} ${(p.alignment || 'unrated').padEnd(10)} — ${p.addedLetters} (${p.addedDynamics.split('(')[0].trim()})`);
    if (p.assessment) console.log(`    ${p.assessment}`);
  }

  if (evalData.system_evaluation) {
    console.log(`\n  System: ${evalData.system_evaluation.overall_rating}`);
    console.log(`  ${evalData.system_evaluation.conclusion}`);
  }

  return {
    prefixAnalysis,
    systemEvaluation: evalData.system_evaluation,
    tokens: { input: evalResp.input_tokens, output: evalResp.output_tokens }
  };
}

// ─── Scoring ───────────────────────────────────────────────────────────────

function computeTest1Scores(results) {
  const allPairs = [];
  const perBinyan = {};

  for (const r of results) {
    for (const [binyan, scoreObj] of Object.entries(r.scores || {})) {
      const score = scoreObj.score?.toLowerCase() || 'miss';
      allPairs.push({ root: r.root, binyan, score });

      if (!perBinyan[binyan]) perBinyan[binyan] = { precise: 0, directional: 0, partial: 0, miss: 0, total: 0 };
      perBinyan[binyan][score]++;
      perBinyan[binyan].total++;
    }
  }

  const total = allPairs.length;
  const counts = { precise: 0, directional: 0, partial: 0, miss: 0 };
  for (const p of allPairs) counts[p.score]++;

  const predictiveRate = (counts.precise + counts.directional) / total;
  const fullRate = (counts.precise + counts.directional + counts.partial) / total;

  return {
    totalPairs: total,
    totalRoots: results.length,
    counts,
    predictiveRate: Math.round(predictiveRate * 1000) / 10,
    fullRate: Math.round(fullRate * 1000) / 10,
    perBinyan
  };
}

// ─── Main ──────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const isDryRun = args.includes('--dry-run');
  const isResume = args.includes('--resume');
  const test2Only = args.includes('--test2-only');
  const sampleIdx = args.indexOf('--sample');
  const sampleSize = sampleIdx >= 0 ? parseInt(args[sampleIdx + 1]) : (isDryRun ? 10 : DEFAULT_SAMPLE);

  console.log('=== Hebrew Signs — Binyanim Blind Prediction Test ===');
  console.log(`Date: ${new Date().toISOString().split('T')[0]}`);
  if (isDryRun) console.log('MODE: Dry run (10 roots)');
  console.log();

  if (!API_KEY) {
    console.error('ERROR: XAI_API_KEY not set');
    process.exit(1);
  }

  let test1Results = null;
  let test1Scores = null;
  let test1Tokens = { input: 0, output: 0 };

  if (!test2Only) {
    // Load binyanim data
    console.log('Loading MorphHB binyanim data...');
    const binyanData = loadJSON(BINYANIM_FILE);
    if (!binyanData) {
      console.error('ERROR: No binyanim data. Run hebrew-signs-morphhb-extract.js first.');
      process.exit(1);
    }
    console.log(`  ${binyanData.multiBinyanRoots.length} multi-binyan roots available`);

    // Select sample
    console.log(`\nSelecting ${sampleSize} roots for testing...`);
    const sample = selectSample(binyanData, sampleSize);
    console.log(`  Selected ${sample.length} roots`);

    // Show examples
    console.log('\n── Sample roots ──');
    for (const s of sample.slice(0, 5)) {
      console.log(`  ${s.root} (H${s.strongs}) — ${s.binyanim.join(', ')}`);
      console.log(`    ${s.gloss.gloss}`);
    }

    // Load checkpoint
    let checkpoint = null;
    if (isResume) {
      checkpoint = loadJSON(CHECKPOINT_FILE);
      if (checkpoint) console.log(`\nResuming from checkpoint: ${checkpoint.results.length} roots done`);
    }

    // Run Test 1
    console.log('\n═══ Test 1: Blind Prediction ═══\n');
    const startTime = Date.now();
    const { results, totalIn, totalOut, errors } = await runTest1(sample, checkpoint);
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

    test1Results = results;
    test1Tokens = { input: totalIn, output: totalOut };

    // Score Test 1
    test1Scores = computeTest1Scores(results);

    console.log('\n── Test 1 Results ──');
    console.log(`  Roots tested: ${test1Scores.totalRoots}`);
    console.log(`  Root-binyan pairs scored: ${test1Scores.totalPairs}`);
    console.log(`  Precise:     ${test1Scores.counts.precise} (${Math.round(test1Scores.counts.precise / test1Scores.totalPairs * 100)}%)`);
    console.log(`  Directional: ${test1Scores.counts.directional} (${Math.round(test1Scores.counts.directional / test1Scores.totalPairs * 100)}%)`);
    console.log(`  Partial:     ${test1Scores.counts.partial} (${Math.round(test1Scores.counts.partial / test1Scores.totalPairs * 100)}%)`);
    console.log(`  Miss:        ${test1Scores.counts.miss} (${Math.round(test1Scores.counts.miss / test1Scores.totalPairs * 100)}%)`);
    console.log(`  Predictive rate (P+D): ${test1Scores.predictiveRate}%`);
    console.log(`  Full rate (P+D+Pa):    ${test1Scores.fullRate}%`);

    // Per-binyan breakdown
    console.log('\n── Per-Binyan Breakdown ──');
    for (const [binyan, scores] of Object.entries(test1Scores.perBinyan).sort((a, b) => b[1].total - a[1].total)) {
      const pred = scores.precise + scores.directional;
      const pct = Math.round(pred / scores.total * 100);
      console.log(`  ${binyan.padEnd(10)} ${pct}% predictive (${pred}/${scores.total}) [P:${scores.precise} D:${scores.directional} +:${scores.partial} M:${scores.miss}]`);
    }

    console.log(`\n  Time: ${elapsed}s | Errors: ${errors}`);
    console.log(`  Tokens: ${totalIn.toLocaleString()} in + ${totalOut.toLocaleString()} out`);
    console.log(`  Cost: $${(Math.round((totalIn * 2 + totalOut * 10) / 1e6 * 10000) / 10000)}`);
  }

  // Run Test 2
  const test2Results = await runTest2();

  // Save combined output
  const output = {
    type: 'hebrew-signs-binyanim-prediction-test',
    description: 'Blind prediction test of binyanim meaning shifts using letter dynamics',
    model: MODEL,
    generated: new Date().toISOString(),
    test1: test1Results ? {
      methodology: 'Three-call blind prediction: (B) get actual meanings, (A) predict from dynamics + Qal meaning, (C) score predictions against actuals',
      scores: test1Scores,
      results: test1Results,
      tokens: test1Tokens,
      cost_usd: Math.round((test1Tokens.input * 2 + test1Tokens.output * 10) / 1e6 * 10000) / 10000
    } : null,
    test2: {
      methodology: 'Structural analysis of prefix letter dynamics vs traditional binyan functions',
      prefixAnalysis: test2Results.prefixAnalysis,
      systemEvaluation: test2Results.systemEvaluation,
      tokens: test2Results.tokens,
      cost_usd: Math.round((test2Results.tokens.input * 2 + test2Results.tokens.output * 10) / 1e6 * 10000) / 10000
    }
  };

  saveJSON(OUTPUT_FILE, output);
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
