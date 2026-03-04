#!/usr/bin/env node
// hebrew-signs-root-position.js — Root-Position Analysis
// Instead of "what do words starting with X mean?" asks:
// "What does X contribute wherever it appears in a root?"
//
// Methodology:
// 1. Extract approximate 3-letter roots from the Tanach corpus
//    (strip known prefixes ב,ה,ו,כ,ל,מ,ש and suffixes ה,ם,ן,ת,י,ך)
// 2. For each of the 22 letters, collect roots where it appears as R1, R2, or R3
// 3. Ask the LLM: "What does this letter CONTRIBUTE to the meaning of these roots?"
// 4. Score whether the letter's dynamic is consistent across positions
//
// Usage:
//   node hebrew-signs-root-position.js                    # Full analysis
//   node hebrew-signs-root-position.js --extract-only     # Just extract roots, no LLM
//   node hebrew-signs-root-position.js --dry-run          # 3 letters only
//   node hebrew-signs-root-position.js --letter ע         # Single letter
//   node hebrew-signs-root-position.js --resume           # Resume from checkpoint
//   node hebrew-signs-root-position.js --stats            # Show extraction stats

const fs = require('fs');
const path = require('path');

// ─── Config ────────────────────────────────────────────────────────────────

const INPUT_DIR = path.join(__dirname, '..', 'data');
const CORPUS_FILE = path.join(INPUT_DIR, 'tanach-word-corpus.json');
const FRAMEWORK_FILE = path.join(INPUT_DIR, 'canonical-framework.json');
const OUTPUT_FILE = path.join(INPUT_DIR, 'root-position-analysis.json');
const ROOTS_FILE = path.join(INPUT_DIR, 'extracted-roots.json');
const CHECKPOINT_FILE = path.join(INPUT_DIR, 'root-position-checkpoint.json');

const MODEL = 'grok-4-1-fast-non-reasoning';
const API_URL = 'https://api.x.ai/v1/chat/completions';
const API_KEY = process.env.XAI_API_KEY;
const REQUEST_DELAY_MS = 150;
const MAX_RETRIES = 3;
const ROOTS_PER_POSITION = 25;  // Top 25 roots per position per letter

// ─── Known Hebrew prefixes and suffixes ────────────────────────────────────
// These are stripped to approximate the root. This is heuristic, not perfect.

const COMMON_PREFIXES = new Set(['ב', 'ה', 'ו', 'כ', 'ל', 'מ', 'ש']);
const DEFINITE_ARTICLE = 'ה';
const COMMON_SUFFIXES = new Set(['ה', 'ם', 'ן', 'ת', 'י', 'ך', 'ו']);
// Two-letter suffixes (possessive/plural)
const TWO_SUFFIXES = new Set(['ים', 'ות', 'הם', 'הן', 'יך', 'ני', 'נו', 'כם', 'כן']);

// All 22 Hebrew consonants
const HEBREW_LETTERS = 'אבגדהוזחטיכלמנסעפצקרשת'.split('');

// ─── Helpers ────────────────────────────────────────────────────────────────

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function loadJSON(filePath) {
  if (!fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
}

function extractJSON(text) {
  let cleaned = text.trim();
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?\s*```\s*$/, '');
  }
  try { return JSON.parse(cleaned); } catch (_) {}
  const start = cleaned.indexOf('{');
  if (start === -1) return null;
  let depth = 0, inString = false, escape = false;
  for (let i = start; i < cleaned.length; i++) {
    const ch = cleaned[i];
    if (escape) { escape = false; continue; }
    if (ch === '\\' && inString) { escape = true; continue; }
    if (ch === '"' && !escape) { inString = !inString; continue; }
    if (inString) continue;
    if (ch === '{') depth++;
    if (ch === '}') { depth--; if (depth === 0) {
      try { return JSON.parse(cleaned.slice(start, i + 1)); } catch (_) { return null; }
    }}
  }
  return null;
}

// ─── Root Extraction ────────────────────────────────────────────────────────

function extractApproximateRoot(consonantal) {
  let letters = consonantal.split('');

  // Strip up to 2 known prefixes
  let prefixesStripped = 0;
  while (prefixesStripped < 2 && letters.length > 3 && COMMON_PREFIXES.has(letters[0])) {
    letters.shift();
    prefixesStripped++;
  }

  // Strip up to 2-letter known suffixes
  if (letters.length > 3) {
    const last2 = letters.slice(-2).join('');
    if (TWO_SUFFIXES.has(last2)) {
      letters = letters.slice(0, -2);
    } else if (letters.length > 3 && COMMON_SUFFIXES.has(letters[letters.length - 1])) {
      letters.pop();
    }
  }

  // We want 3-letter roots
  if (letters.length === 3) {
    return letters.join('');
  }

  // For 4-letter results, check if the last letter is a suffix we missed
  if (letters.length === 4 && COMMON_SUFFIXES.has(letters[3])) {
    return letters.slice(0, 3).join('');
  }

  // Return null for anything we can't reduce to 3 letters
  // (2-letter words, long words with unknown morphology)
  return null;
}

function buildRootIndex(corpus) {
  console.log(`  Processing ${corpus.words.length.toLocaleString()} words...`);

  // Count word frequencies first
  const wordFreq = new Map();
  for (const entry of corpus.words) {
    const w = entry.word_consonantal;
    wordFreq.set(w, (wordFreq.get(w) || 0) + 1);
  }

  // Extract roots
  const rootCounts = new Map();  // root -> total count
  const rootWords = new Map();   // root -> Set of source words
  let extracted = 0;
  let skipped = 0;

  for (const [word, count] of wordFreq) {
    const root = extractApproximateRoot(word);
    if (root) {
      rootCounts.set(root, (rootCounts.get(root) || 0) + count);
      if (!rootWords.has(root)) rootWords.set(root, new Set());
      rootWords.get(root).add(word);
      extracted++;
    } else {
      skipped++;
    }
  }

  console.log(`  Unique words: ${wordFreq.size.toLocaleString()}`);
  console.log(`  Extracted roots: ${rootCounts.size.toLocaleString()} (from ${extracted.toLocaleString()} words)`);
  console.log(`  Skipped: ${skipped.toLocaleString()} words (couldn't reduce to 3 letters)`);

  // Build per-letter, per-position indices
  const letterPositions = {};
  for (const letter of HEBREW_LETTERS) {
    letterPositions[letter] = {
      R1: [],  // letter as first radical
      R2: [],  // letter as second radical
      R3: [],  // letter as third radical
    };
  }

  for (const [root, count] of rootCounts) {
    const [r1, r2, r3] = root.split('');
    if (letterPositions[r1]) {
      letterPositions[r1].R1.push({ root, count, words: [...(rootWords.get(root) || [])] });
    }
    if (letterPositions[r2]) {
      letterPositions[r2].R2.push({ root, count, words: [...(rootWords.get(root) || [])] });
    }
    if (letterPositions[r3]) {
      letterPositions[r3].R3.push({ root, count, words: [...(rootWords.get(root) || [])] });
    }
  }

  // Sort each position by frequency
  for (const letter of HEBREW_LETTERS) {
    for (const pos of ['R1', 'R2', 'R3']) {
      letterPositions[letter][pos].sort((a, b) => b.count - a.count);
    }
  }

  return { rootCounts, rootWords, letterPositions, totalRoots: rootCounts.size };
}

// ─── LLM Root Analysis ─────────────────────────────────────────────────────

const ROOT_SYSTEM_PROMPT = `You are a Hebrew linguist analyzing the contribution of individual consonants to the meaning of Hebrew roots from the Tanach.

For a given Hebrew letter appearing in a specific position (1st, 2nd, or 3rd radical), analyze what DYNAMIC that letter contributes to the roots it appears in. Focus on what the letter DOES to the root's meaning — how it shapes, modifies, or colors the semantic action.

Respond with ONLY valid JSON:
{
  "letter": "the letter",
  "position": "R1/R2/R3",
  "contribution_summary": "2-3 sentences describing what this letter contributes in this position",
  "consistent_dynamic": "one verb-gerund phrase capturing the letter's consistent contribution (e.g., 'containing', 'directing', 'perceiving'), or 'no clear pattern' if inconsistent",
  "confidence": "high/medium/low — how consistent is the pattern across roots?",
  "root_analyses": [
    {
      "root": "the 3-letter root",
      "meaning": "primary meaning",
      "letter_contribution": "what this specific letter adds to the root's meaning"
    }
  ]
}`;

function buildRootAnalysisPrompt(letter, letterName, position, roots) {
  const posLabel = position === 'R1' ? 'first' : position === 'R2' ? 'second' : 'third';
  const rootList = roots.map((r, i) =>
    `${i + 1}. ${r.root} (${r.count}x) — source words: ${r.words.slice(0, 3).join(', ')}`
  ).join('\n');

  return `Analyze the contribution of ${letterName} (${letter}) as the **${posLabel} radical** in these Hebrew roots from the Tanach:

${rootList}

For each root, what does ${letterName} specifically contribute to the meaning? And across all these roots, is there a consistent dynamic — a recurring way that ${letterName} shapes meaning in the ${posLabel} position?

Remember: focus on WHAT THE LETTER DOES to the root's meaning, not what the root means overall.`;
}

const POSITIONAL_SYNTHESIS_PROMPT = `You are a Hebrew linguist synthesizing how a single Hebrew letter functions across all three radical positions in roots.

Given analyses of a letter's contribution as R1 (first radical), R2 (second radical), and R3 (third radical), determine:
1. Is there a UNIFIED DYNAMIC that this letter contributes regardless of position?
2. Does the letter's contribution shift by position, and if so, how?
3. What is the letter's essential relational function?

Respond with ONLY valid JSON:
{
  "letter": "the letter",
  "unified_dynamic": "one phrase describing the letter's consistent contribution across all positions, or 'position-dependent' if it varies",
  "r1_dynamic": "contribution as first radical",
  "r2_dynamic": "contribution as second radical",
  "r3_dynamic": "contribution as third radical",
  "position_consistency": "high/medium/low — how consistent is the dynamic across positions?",
  "essential_function": "2-3 sentences: what does this letter fundamentally DO in Hebrew roots?",
  "dynamic_type": "one of: origination, containment, amplification, mediation, specification, conjunction, distinction, vitalization, evaluation, agency, comparison, direction, extraction, bestowal, encirclement, engagement, interface, alignment, sanctification, perception, enumeration, completion"
}`;

async function callLLM(systemPrompt, userPrompt) {
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const response = await fetch(API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${API_KEY}`,
        },
        body: JSON.stringify({
          model: MODEL,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
          temperature: 0.2,
        }),
      });

      if (response.status === 429) {
        await sleep(Math.pow(2, attempt + 1) * 1000);
        continue;
      }
      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`API ${response.status}: ${errText.slice(0, 200)}`);
      }

      const data = await response.json();
      const content = data.choices[0].message.content;
      const usage = data.usage || {};
      const parsed = extractJSON(content);
      if (!parsed) throw new SyntaxError('Failed to parse JSON');

      return {
        result: parsed,
        inputTokens: usage.prompt_tokens || 0,
        outputTokens: usage.completion_tokens || 0,
      };
    } catch (err) {
      if (attempt < MAX_RETRIES - 1) {
        await sleep(Math.pow(2, attempt + 1) * 1000);
        continue;
      }
      throw err;
    }
  }
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const extractOnly = args.includes('--extract-only');
  const statsOnly = args.includes('--stats');
  const dryRun = args.includes('--dry-run');
  const resume = args.includes('--resume');
  const letterFilter = args.includes('--letter') ? args[args.indexOf('--letter') + 1] : null;

  console.log('=== NKB Hebrew Signs Root-Position Analysis ===');
  console.log(`Date: ${new Date().toISOString().split('T')[0]}`);
  console.log('');

  // ── Step 1: Extract roots ──────────────────────────────────────────────

  let rootIndex;
  if (fs.existsSync(ROOTS_FILE) && !args.includes('--re-extract')) {
    console.log('Loading cached root index...');
    rootIndex = loadJSON(ROOTS_FILE);
    console.log(`  ${rootIndex.totalRoots.toLocaleString()} roots loaded`);
  } else {
    console.log('Extracting roots from Tanach corpus...');
    const corpus = loadJSON(CORPUS_FILE);
    if (!corpus) { console.error('Missing tanach-word-corpus.json'); process.exit(1); }
    rootIndex = buildRootIndex(corpus);

    // Cache the extracted roots (save memory for future runs)
    const cacheData = {
      type: 'hebrew-signs-extracted-roots',
      generated: new Date().toISOString(),
      totalRoots: rootIndex.totalRoots,
      letterPositions: {},
    };
    for (const letter of HEBREW_LETTERS) {
      cacheData.letterPositions[letter] = {
        R1: rootIndex.letterPositions[letter].R1.slice(0, 50),
        R2: rootIndex.letterPositions[letter].R2.slice(0, 50),
        R3: rootIndex.letterPositions[letter].R3.slice(0, 50),
      };
    }
    fs.writeFileSync(ROOTS_FILE, JSON.stringify(cacheData, null, 2));
    console.log(`  Root index cached to ${ROOTS_FILE}`);
  }

  // ── Stats display ──────────────────────────────────────────────────────

  const framework = loadJSON(FRAMEWORK_FILE);
  if (!framework) { console.error('Missing canonical-framework.json'); process.exit(1); }

  console.log('\n── Root distribution by letter and position ──');
  const lp = rootIndex.letterPositions;
  for (const l of framework.letters) {
    const r1 = lp[l.letter]?.R1?.length || 0;
    const r2 = lp[l.letter]?.R2?.length || 0;
    const r3 = lp[l.letter]?.R3?.length || 0;
    console.log(`  ${l.letter} ${l.name.padEnd(8)} R1:${String(r1).padStart(4)}  R2:${String(r2).padStart(4)}  R3:${String(r3).padStart(4)}  total:${String(r1 + r2 + r3).padStart(5)}`);
  }

  if (extractOnly || statsOnly) {
    console.log('\n[Extract/stats only — no LLM analysis]');
    return;
  }

  if (!API_KEY) {
    console.error('\nError: XAI_API_KEY environment variable not set');
    process.exit(1);
  }

  // ── Step 2: LLM analysis per position ──────────────────────────────────

  let letters = framework.letters;
  if (letterFilter) {
    letters = letters.filter(l => l.letter === letterFilter || l.name.toLowerCase() === letterFilter.toLowerCase());
  }
  if (dryRun) {
    letters = letters.slice(0, 3);
  }

  // Load checkpoint
  let checkpoint = { completed: {}, totalInput: 0, totalOutput: 0, errors: 0 };
  if (resume && fs.existsSync(CHECKPOINT_FILE)) {
    checkpoint = loadJSON(CHECKPOINT_FILE);
    console.log(`\nResuming: ${Object.keys(checkpoint.completed).length} letters done`);
  }

  const results = {};
  let totalInputTokens = checkpoint.totalInput;
  let totalOutputTokens = checkpoint.totalOutput;
  const startTime = Date.now();

  for (const letterInfo of letters) {
    if (checkpoint.completed[letterInfo.letter]) {
      results[letterInfo.letter] = checkpoint.completed[letterInfo.letter];
      console.log(`\n  ${letterInfo.letter} ${letterInfo.name}: loaded from checkpoint`);
      continue;
    }

    console.log(`\n── ${letterInfo.letter} ${letterInfo.name} ──`);

    const positions = lp[letterInfo.letter];
    if (!positions) {
      console.log('  No root data, skipping');
      continue;
    }

    const positionResults = {};

    for (const pos of ['R1', 'R2', 'R3']) {
      const roots = (positions[pos] || []).slice(0, ROOTS_PER_POSITION);
      if (roots.length < 3) {
        console.log(`  ${pos}: only ${roots.length} roots, skipping`);
        continue;
      }

      try {
        const prompt = buildRootAnalysisPrompt(letterInfo.letter, letterInfo.name, pos, roots);
        const result = await callLLM(ROOT_SYSTEM_PROMPT, prompt);
        positionResults[pos] = result.result;
        totalInputTokens += result.inputTokens;
        totalOutputTokens += result.outputTokens;

        const dynamic = result.result.consistent_dynamic || 'unclear';
        const confidence = result.result.confidence || '?';
        console.log(`  ${pos}: "${dynamic}" (${confidence}) [${result.inputTokens}+${result.outputTokens} tok]`);
      } catch (err) {
        console.error(`  ${pos} ERROR: ${err.message.slice(0, 80)}`);
        checkpoint.errors++;
      }

      await sleep(REQUEST_DELAY_MS);
    }

    // ── Positional synthesis ──
    let synthesis = null;
    if (Object.keys(positionResults).length >= 2) {
      try {
        const synthPrompt = `Synthesize the positional analysis for ${letterInfo.name} (${letterInfo.letter}):

R1 (first radical): ${positionResults.R1?.consistent_dynamic || 'no data'}
  Summary: ${positionResults.R1?.contribution_summary || 'N/A'}

R2 (second radical): ${positionResults.R2?.consistent_dynamic || 'no data'}
  Summary: ${positionResults.R2?.contribution_summary || 'N/A'}

R3 (third radical): ${positionResults.R3?.consistent_dynamic || 'no data'}
  Summary: ${positionResults.R3?.contribution_summary || 'N/A'}

Is there a unified dynamic across all positions? What does ${letterInfo.name} fundamentally DO in Hebrew roots?`;

        const synthResult = await callLLM(POSITIONAL_SYNTHESIS_PROMPT, synthPrompt);
        synthesis = synthResult.result;
        totalInputTokens += synthResult.inputTokens;
        totalOutputTokens += synthResult.outputTokens;
        console.log(`  Synthesis: "${synthesis.unified_dynamic}" (consistency: ${synthesis.position_consistency})`);
        console.log(`  Essential: ${(synthesis.essential_function || '').slice(0, 100)}`);
      } catch (err) {
        console.error(`  Synthesis ERROR: ${err.message.slice(0, 80)}`);
      }
    }

    results[letterInfo.letter] = {
      letter: letterInfo.letter,
      name: letterInfo.name,
      proposed_meaning: letterInfo.meaning,
      root_counts: {
        R1: (positions.R1 || []).length,
        R2: (positions.R2 || []).length,
        R3: (positions.R3 || []).length,
      },
      position_analyses: positionResults,
      synthesis,
    };

    // Checkpoint every 3 letters
    if (Object.keys(results).length % 3 === 0 && !dryRun) {
      checkpoint.completed = { ...checkpoint.completed, ...results };
      checkpoint.totalInput = totalInputTokens;
      checkpoint.totalOutput = totalOutputTokens;
      fs.writeFileSync(CHECKPOINT_FILE, JSON.stringify(checkpoint, null, 2));
      console.log(`  [Checkpoint: ${Object.keys(checkpoint.completed).length} letters]`);
    }
  }

  // ── Summary ──────────────────────────────────────────────────────────────
  const elapsed = (Date.now() - startTime) / 1000;
  const costInput = (totalInputTokens / 1_000_000) * 0.20;
  const costOutput = (totalOutputTokens / 1_000_000) * 0.50;

  console.log('\n══ Summary ══');
  console.log(`Letters analyzed: ${Object.keys(results).length}`);
  console.log(`Time: ${elapsed.toFixed(1)}s`);
  console.log(`Tokens: ${totalInputTokens.toLocaleString()} in + ${totalOutputTokens.toLocaleString()} out`);
  console.log(`Cost: $${(costInput + costOutput).toFixed(4)}`);
  console.log(`Errors: ${checkpoint.errors}`);

  // Display synthesis results
  console.log('\n── Positional Synthesis ──');
  for (const r of Object.values(results)) {
    if (!r.synthesis) continue;
    const s = r.synthesis;
    console.log(`  ${r.letter} ${r.name.padEnd(8)} | unified: ${(s.unified_dynamic || '—').padEnd(30)} | consistency: ${s.position_consistency || '?'} | type: ${s.dynamic_type || '?'}`);
  }

  // Write output
  if (!dryRun) {
    const output = {
      type: 'hebrew-signs-root-position-analysis',
      description: 'Analyzes what each letter contributes in all root positions (R1, R2, R3) — reaches root consonants that word-frequency analysis cannot',
      model: MODEL,
      generated: new Date().toISOString(),
      methodology: 'Approximate 3-letter roots extracted by stripping known prefixes/suffixes. Top 25 roots per position analyzed by LLM for letter contribution. Positional synthesis determines unified dynamic.',
      counts: {
        letters_analyzed: Object.keys(results).length,
        total_roots: rootIndex.totalRoots,
        total_input_tokens: totalInputTokens,
        total_output_tokens: totalOutputTokens,
        cost_usd: Math.round((costInput + costOutput) * 10000) / 10000,
      },
      results,
    };
    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2));
    console.log(`\nWritten to: ${OUTPUT_FILE}`);

    checkpoint.completed = results;
    checkpoint.totalInput = totalInputTokens;
    checkpoint.totalOutput = totalOutputTokens;
    fs.writeFileSync(CHECKPOINT_FILE, JSON.stringify(checkpoint, null, 2));
  }

  if (dryRun) {
    console.log('\n[DRY RUN — no output files written]');
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
