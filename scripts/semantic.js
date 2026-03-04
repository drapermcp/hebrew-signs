#!/usr/bin/env node
// hebrew-signs-semantic.js — Phase 3 of the Hebrew Signs Confirmation Project
// Uses Grok 4.1 fast to get semantic profiles for top Hebrew words per letter,
// then computes confirmation scores against Daniel's framework.
//
// Usage:
//   node hebrew-signs-semantic.js                    # Full semantic analysis
//   node hebrew-signs-semantic.js --stats            # Show current status
//   node hebrew-signs-semantic.js --dry-run          # Process 3 letters only
//   node hebrew-signs-semantic.js --letter א         # Single letter only
//   node hebrew-signs-semantic.js --resume           # Resume from checkpoint
//   node hebrew-signs-semantic.js --concurrency 3    # Parallel requests (default 2)

const fs = require('fs');
const path = require('path');

// ─── Config ────────────────────────────────────────────────────────────────

const INPUT_DIR = path.join(__dirname, '..', 'data');
const FRAMEWORK_FILE = path.join(INPUT_DIR, 'canonical-framework.json');
const STATS_FILE = path.join(INPUT_DIR, 'letter-statistics.json');
const OUTPUT_FILE = path.join(INPUT_DIR, 'semantic-confirmation.json');
const CHECKPOINT_FILE = path.join(INPUT_DIR, 'semantic-checkpoint.json');
const STRONGS_FILE = path.join(__dirname, '..', 'external', 'bible-strongs-concordance.json')  // Optional;

const MODEL = 'grok-4-1-fast-non-reasoning';
const API_URL = 'https://api.x.ai/v1/chat/completions';
const API_KEY = process.env.XAI_API_KEY;
const REQUEST_DELAY_MS = 100;
const MAX_RETRIES = 3;
const WORDS_PER_LETTER = 75; // Top N words per letter to analyze
const BATCH_SIZE = 15; // Words per LLM call (batch for efficiency)
const CHECKPOINT_INTERVAL = 5; // Save every N letters

// ─── Helpers ────────────────────────────────────────────────────────────────

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function loadJSON(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
}

function extractJSON(text) {
  let cleaned = text.trim();
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?\s*```\s*$/, '');
  }
  try { return JSON.parse(cleaned); } catch (_) {}
  const start = cleaned.indexOf('{');
  if (start === -1) {
    const arrStart = cleaned.indexOf('[');
    if (arrStart === -1) return null;
    let depth = 0;
    let inString = false;
    let escape = false;
    for (let i = arrStart; i < cleaned.length; i++) {
      const ch = cleaned[i];
      if (escape) { escape = false; continue; }
      if (ch === '\\' && inString) { escape = true; continue; }
      if (ch === '"' && !escape) { inString = !inString; continue; }
      if (inString) continue;
      if (ch === '[') depth++;
      if (ch === ']') { depth--; if (depth === 0) {
        try { return JSON.parse(cleaned.slice(arrStart, i + 1)); } catch (_) { return null; }
      }}
    }
    return null;
  }
  let depth = 0;
  let inString = false;
  let escape = false;
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

// ─── Strong's lookup ────────────────────────────────────────────────────────

function buildStrongsLookup() {
  if (!fs.existsSync(STRONGS_FILE)) return new Map();
  const data = loadJSON(STRONGS_FILE);
  // Map primary_word (English) → Strong's entry for Hebrew words
  // We need: English meaning for Hebrew words
  const lookup = new Map();
  for (const entry of data.entries) {
    if (entry.language !== 'hebrew') continue;
    // Index by primary English word
    lookup.set(entry.number, {
      primary: entry.primary_word,
      translations: entry.translations.map(t => t.word),
    });
  }
  return lookup;
}

// ─── LLM Semantic Analysis ──────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are a Hebrew linguist analyzing words from the Tanach (Hebrew Bible) for the Neural Knowledge Base.

For each Hebrew word provided, give its core semantic field — the fundamental concepts this word relates to.

Respond with ONLY valid JSON — no markdown, no code blocks, no explanation.

Format:
{
  "words": [
    {
      "word": "the Hebrew word",
      "english": "primary English meaning",
      "semantic_tags": ["tag1", "tag2", "tag3", "tag4", "tag5"],
      "root_concept": "one-word core concept"
    }
  ]
}

Guidelines:
- semantic_tags: 3-5 English keywords capturing the word's semantic field (e.g., for מלך: ["sovereignty", "rule", "authority", "governance", "throne"])
- root_concept: single English word that best captures the word's essence
- For common particles/prepositions (את, אל, על, כי, etc.), still provide semantic analysis of their function
- Be precise: distinguish between "protection" and "fortress" when appropriate
- Use lowercase for all tags`;

const HOLISTIC_SYSTEM_PROMPT = `You are a Hebrew linguist performing pattern analysis for the Neural Knowledge Base.

Given a collection of the most common Hebrew words beginning with a specific letter, identify:
1. The dominant semantic themes that emerge across these words
2. Whether these words cluster around any unifying concept
3. How function words (particles, prepositions) relate to or differ from content words in this set

Respond with ONLY valid JSON:
{
  "letter": "the letter name",
  "dominant_themes": ["theme1", "theme2", "theme3", "theme4", "theme5"],
  "unifying_concept": "one phrase describing the common thread, or 'no clear unifier' if none",
  "content_word_themes": ["themes from nouns/verbs/adjectives only"],
  "function_word_role": "what the function words in this set express",
  "semantic_summary": "2-3 sentence analysis of what this letter's word-space reveals"
}`;

function buildHolisticPrompt(wordEntries, letterInfo) {
  const contentWords = wordEntries.filter(w => w.count < 1000).slice(0, 40);
  const functionWords = wordEntries.filter(w => w.count >= 1000).slice(0, 10);

  const contentList = contentWords.map(w => `${w.word} (${w.count}x)`).join(', ');
  const functionList = functionWords.map(w => `${w.word} (${w.count}x)`).join(', ');

  return `Analyze the semantic space of Hebrew words beginning with ${letterInfo.name} (${letterInfo.letter}).

High-frequency function words: ${functionList || 'none'}

Content words (nouns, verbs, adjectives — sorted by frequency):
${contentList}

What themes and patterns emerge? Is there a unifying concept?`;
}

async function callHolisticLLM(wordEntries, letterInfo) {
  const userPrompt = buildHolisticPrompt(wordEntries, letterInfo);

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
            { role: 'system', content: HOLISTIC_SYSTEM_PROMPT },
            { role: 'user', content: userPrompt },
          ],
          temperature: 0.3,
        }),
      });

      if (response.status === 429) {
        await sleep(Math.pow(2, attempt + 1) * 1000);
        continue;
      }
      if (!response.ok) throw new Error(`API ${response.status}`);

      const data = await response.json();
      const content = data.choices[0].message.content;
      const usage = data.usage || {};
      const parsed = extractJSON(content);
      if (!parsed) throw new SyntaxError('Failed to parse holistic JSON');

      return {
        holistic: parsed,
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

function buildWordBatchPrompt(wordEntries, letterInfo) {
  const lines = wordEntries.map((w, i) =>
    `${i + 1}. ${w.word} (appears ${w.count}x in Tanach)${w.english ? ` — English: "${w.english}"` : ''}`
  );

  return `Analyze these Hebrew words that begin with the letter ${letterInfo.name} (${letterInfo.letter}).
Provide semantic fields for each:

${lines.join('\n')}`;
}

async function callSemanticLLM(wordEntries, letterInfo) {
  const userPrompt = buildWordBatchPrompt(wordEntries, letterInfo);

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
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: userPrompt },
          ],
          temperature: 0.2,
        }),
      });

      if (response.status === 429) {
        const wait = Math.pow(2, attempt + 1) * 1000;
        console.log(`  Rate limited, waiting ${wait / 1000}s...`);
        await sleep(wait);
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

      // Handle both {words: [...]} and direct array
      const words = parsed.words || parsed;
      if (!Array.isArray(words)) throw new SyntaxError('Expected array of words');

      return {
        words,
        inputTokens: usage.prompt_tokens || 0,
        outputTokens: usage.completion_tokens || 0,
      };
    } catch (err) {
      if (attempt < MAX_RETRIES - 1) {
        const wait = Math.pow(2, attempt + 1) * 1000;
        console.log(`  Retry ${attempt + 1}/${MAX_RETRIES}: ${err.message.slice(0, 80)}`);
        await sleep(wait);
        continue;
      }
      throw err;
    }
  }
  throw new Error('Max retries exceeded');
}

// ─── Confirmation Scoring ───────────────────────────────────────────────────

function computeConfirmationScore(empiricalTags, proposedSemanticField) {
  // Build weighted tag counts from all analyzed words
  const tagCounts = new Map();
  let totalWeight = 0;

  for (const word of empiricalTags) {
    const weight = Math.log2(word.count + 1); // frequency-weighted
    for (const tag of (word.semantic_tags || [])) {
      const normalized = tag.toLowerCase().replace(/[^a-z-]/g, '');
      tagCounts.set(normalized, (tagCounts.get(normalized) || 0) + weight);
      totalWeight += weight;
    }
    // Root concept gets double weight
    if (word.root_concept) {
      const rc = word.root_concept.toLowerCase().replace(/[^a-z-]/g, '');
      tagCounts.set(rc, (tagCounts.get(rc) || 0) + weight * 2);
      totalWeight += weight * 2;
    }
  }

  if (totalWeight === 0) return { score: 0, matching_tags: [], empirical_top: [] };

  // Normalize
  const tagFreqs = new Map();
  for (const [tag, count] of tagCounts) {
    tagFreqs.set(tag, count / totalWeight);
  }

  // Top empirical tags
  const empiricalTop = [...tagFreqs.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([tag, freq]) => ({ tag, frequency: Math.round(freq * 1000) / 1000 }));

  // Compare with proposed semantic field
  const proposedSet = new Set(proposedSemanticField.map(s => s.toLowerCase().replace(/[^a-z-]/g, '')));

  // Direct matches
  const directMatches = [];
  for (const proposed of proposedSet) {
    if (tagFreqs.has(proposed)) {
      directMatches.push({ tag: proposed, frequency: tagFreqs.get(proposed) });
    }
  }

  // Fuzzy matches — check if any empirical tag contains a proposed keyword or vice versa
  const fuzzyMatches = [];
  for (const proposed of proposedSet) {
    for (const [empirical, freq] of tagFreqs) {
      if (empirical === proposed) continue; // already counted
      if (empirical.includes(proposed) || proposed.includes(empirical)) {
        fuzzyMatches.push({ proposed, empirical, frequency: freq });
      }
    }
  }

  // Score: direct matches weighted by frequency, plus half-credit for fuzzy
  let directScore = directMatches.reduce((sum, m) => sum + m.frequency, 0);
  let fuzzyScore = fuzzyMatches.reduce((sum, m) => sum + m.frequency * 0.5, 0);

  // Normalize to 0-1 range (cap at 1)
  // A perfect score would mean all proposed keywords appear with high frequency
  const maxPossible = proposedSet.size * (1 / proposedSet.size); // = 1.0 if evenly distributed
  const rawScore = Math.min(1, (directScore + fuzzyScore) / 0.3); // 0.3 = threshold for strong match

  return {
    score: Math.round(rawScore * 1000) / 1000,
    direct_matches: directMatches,
    fuzzy_matches: fuzzyMatches,
    empirical_top: empiricalTop,
  };
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const statsOnly = args.includes('--stats');
  const dryRun = args.includes('--dry-run');
  const resume = args.includes('--resume');
  const letterFilter = args.includes('--letter') ? args[args.indexOf('--letter') + 1] : null;
  const concurrency = args.includes('--concurrency')
    ? parseInt(args[args.indexOf('--concurrency') + 1]) : 2;

  if (!API_KEY && !statsOnly) {
    console.error('Error: XAI_API_KEY environment variable not set');
    process.exit(1);
  }

  console.log('=== NKB Hebrew Signs Semantic Analysis (Phase 3) ===');
  console.log(`Date: ${new Date().toISOString().split('T')[0]}`);
  console.log(`Model: ${MODEL}`);
  console.log(`Words per letter: ${WORDS_PER_LETTER}`);
  console.log(`Batch size: ${BATCH_SIZE}`);
  console.log(`Concurrency: ${concurrency}`);
  console.log('');

  // Load data
  const framework = loadJSON(FRAMEWORK_FILE);
  const stats = loadJSON(STATS_FILE);
  const strongsLookup = buildStrongsLookup();
  console.log(`Strong's entries loaded: ${strongsLookup.size}`);

  // Load checkpoint
  let checkpoint = { completed: {}, totalInput: 0, totalOutput: 0, errors: 0 };
  if (resume && fs.existsSync(CHECKPOINT_FILE)) {
    checkpoint = loadJSON(CHECKPOINT_FILE);
    console.log(`Resuming: ${Object.keys(checkpoint.completed).length} letters already done`);
  }

  // Filter letters
  let letters = framework.letters;
  if (letterFilter) {
    letters = letters.filter(l => l.letter === letterFilter || l.name.toLowerCase() === letterFilter.toLowerCase());
  }
  if (dryRun) {
    letters = letters.slice(0, 3);
  }

  const results = {};
  let totalInputTokens = checkpoint.totalInput;
  let totalOutputTokens = checkpoint.totalOutput;
  let lettersProcessed = 0;
  const startTime = Date.now();

  for (const letterInfo of letters) {
    // Skip if already completed
    if (checkpoint.completed[letterInfo.letter]) {
      results[letterInfo.letter] = checkpoint.completed[letterInfo.letter];
      console.log(`  ${letterInfo.letter} ${letterInfo.name}: already completed (from checkpoint)`);
      continue;
    }

    console.log(`\n── ${letterInfo.letter} ${letterInfo.name} (${letterInfo.meaning}) ──`);

    // Get top words for this letter
    const letterStats = stats.initial_letter_lists[letterInfo.letter];
    if (!letterStats) {
      console.log('  No word data found, skipping');
      continue;
    }

    const topWords = letterStats.top_words.slice(0, WORDS_PER_LETTER);
    console.log(`  Top ${topWords.length} words (of ${letterStats.total_unique} unique)`);

    // Enrich with Strong's English meanings where possible
    // We'll look up by matching Hebrew consonantal forms in Strong's
    // This is approximate since Strong's stores English, not Hebrew
    const enrichedWords = topWords.map(w => {
      // Try to find this word in Strong's by scanning entries
      // (Strong's doesn't index by Hebrew form, so this is best-effort)
      return { ...w, english: null };
    });

    // Process in batches
    const allWordResults = [];
    const batches = [];
    for (let i = 0; i < enrichedWords.length; i += BATCH_SIZE) {
      batches.push(enrichedWords.slice(i, i + BATCH_SIZE));
    }

    for (let b = 0; b < batches.length; b++) {
      const batch = batches[b];
      try {
        const result = await callSemanticLLM(batch, letterInfo);
        allWordResults.push(...result.words);
        totalInputTokens += result.inputTokens;
        totalOutputTokens += result.outputTokens;
        console.log(`  Batch ${b + 1}/${batches.length}: ${result.words.length} words analyzed (${result.inputTokens}+${result.outputTokens} tokens)`);
      } catch (err) {
        console.error(`  Batch ${b + 1} ERROR: ${err.message.slice(0, 100)}`);
        checkpoint.errors++;
      }
      if (b < batches.length - 1) await sleep(REQUEST_DELAY_MS);
    }

    // Merge counts from our corpus into the LLM results
    for (const wr of allWordResults) {
      const match = topWords.find(tw => tw.word === wr.word);
      if (match) wr.count = match.count;
      else wr.count = 1;
    }

    // Holistic LLM analysis — look at the word collection as a whole
    let holistic = null;
    try {
      console.log(`  Running holistic analysis...`);
      const holisticResult = await callHolisticLLM(topWords, letterInfo);
      holistic = holisticResult.holistic;
      totalInputTokens += holisticResult.inputTokens;
      totalOutputTokens += holisticResult.outputTokens;
      console.log(`  Holistic: "${holistic.unifying_concept}" (${holisticResult.inputTokens}+${holisticResult.outputTokens} tokens)`);
    } catch (err) {
      console.error(`  Holistic ERROR: ${err.message.slice(0, 100)}`);
    }

    // Compute confirmation score
    const confirmation = computeConfirmationScore(allWordResults, letterInfo.semantic_field);

    results[letterInfo.letter] = {
      letter: letterInfo.letter,
      name: letterInfo.name,
      proposed_meaning: letterInfo.meaning,
      proposed_semantic_field: letterInfo.semantic_field,
      words_analyzed: allWordResults.length,
      word_details: allWordResults,
      confirmation_score: confirmation.score,
      direct_matches: confirmation.direct_matches,
      fuzzy_matches: confirmation.fuzzy_matches,
      empirical_top_tags: confirmation.empirical_top,
      holistic_analysis: holistic,
    };

    const scoreLabel = confirmation.score >= 0.7 ? 'STRONG' :
                       confirmation.score >= 0.4 ? 'MODERATE' : 'WEAK';
    console.log(`  Word-level: ${(confirmation.score * 100).toFixed(0)}% (${scoreLabel})`);
    console.log(`  Direct matches: ${confirmation.direct_matches.map(m => m.tag).join(', ') || 'none'}`);
    console.log(`  Top empirical: ${confirmation.empirical_top.slice(0, 5).map(t => t.tag).join(', ')}`);
    if (holistic) {
      console.log(`  Holistic themes: ${(holistic.dominant_themes || []).join(', ')}`);
      console.log(`  Content themes: ${(holistic.content_word_themes || []).join(', ')}`);
    }

    lettersProcessed++;

    // Checkpoint
    if (lettersProcessed % CHECKPOINT_INTERVAL === 0 && !dryRun) {
      checkpoint.completed = { ...checkpoint.completed, ...Object.fromEntries(
        Object.entries(results).filter(([k]) => !checkpoint.completed[k])
      )};
      checkpoint.totalInput = totalInputTokens;
      checkpoint.totalOutput = totalOutputTokens;
      fs.writeFileSync(CHECKPOINT_FILE, JSON.stringify(checkpoint, null, 2));
      console.log(`  [Checkpoint saved: ${Object.keys(checkpoint.completed).length} letters]`);
    }
  }

  // ── Summary ──────────────────────────────────────────────────────────────
  const elapsed = (Date.now() - startTime) / 1000;
  const costInput = (totalInputTokens / 1_000_000) * 0.20;
  const costOutput = (totalOutputTokens / 1_000_000) * 0.50;

  console.log('\n══ Summary ══');
  console.log(`Letters analyzed: ${Object.keys(results).length}`);
  console.log(`Time: ${elapsed.toFixed(1)}s`);
  console.log(`Tokens: ${totalInputTokens.toLocaleString()} input + ${totalOutputTokens.toLocaleString()} output`);
  console.log(`Cost: $${(costInput + costOutput).toFixed(4)} (input: $${costInput.toFixed(4)}, output: $${costOutput.toFixed(4)})`);
  console.log(`Errors: ${checkpoint.errors}`);

  // Score ranking
  const ranked = Object.values(results)
    .filter(r => r.confirmation_score !== undefined)
    .sort((a, b) => b.confirmation_score - a.confirmation_score);

  console.log('\n── Confirmation Scores (ranked) ──');
  for (const r of ranked) {
    const bar = '█'.repeat(Math.round(r.confirmation_score * 20)).padEnd(20, '░');
    const label = r.confirmation_score >= 0.7 ? 'STRONG  ' :
                  r.confirmation_score >= 0.4 ? 'MODERATE' : 'WEAK    ';
    console.log(
      `  ${r.letter} ${r.name.padEnd(8)} [${r.proposed_meaning.padEnd(18)}] ` +
      `${bar} ${(r.confirmation_score * 100).toFixed(0).padStart(3)}% ${label}`
    );
  }

  const avgScore = ranked.reduce((s, r) => s + r.confirmation_score, 0) / ranked.length;
  console.log(`\n  Average: ${(avgScore * 100).toFixed(1)}%`);

  if (!statsOnly && !dryRun) {
    const output = {
      type: 'hebrew-signs-semantic-confirmation',
      description: 'LLM-powered semantic field analysis testing Daniel\'s 22-letter framework against Tanach word usage',
      model: MODEL,
      generated: new Date().toISOString(),
      counts: {
        letters_analyzed: Object.keys(results).length,
        total_input_tokens: totalInputTokens,
        total_output_tokens: totalOutputTokens,
        cost_usd: Math.round((costInput + costOutput) * 10000) / 10000,
      },
      average_confirmation_score: Math.round(avgScore * 1000) / 1000,
      results,
    };
    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2));
    console.log(`\nWritten to: ${OUTPUT_FILE}`);
    console.log(`File size: ${(fs.statSync(OUTPUT_FILE).size / 1024 / 1024).toFixed(1)} MB`);

    // Final checkpoint
    checkpoint.completed = results;
    checkpoint.totalInput = totalInputTokens;
    checkpoint.totalOutput = totalOutputTokens;
    fs.writeFileSync(CHECKPOINT_FILE, JSON.stringify(checkpoint, null, 2));
  }

  if (dryRun) {
    console.log('\n[DRY RUN — no files written]');
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
