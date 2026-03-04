#!/usr/bin/env node
// hebrew-signs-relational.js — Relational-Dynamic Confirmation Scoring
// Rescores Daniel's 22-letter framework by asking what words DO (relational dynamics)
// instead of what they ARE (category labels). Phase 3 scored 13.9% because it treated
// letters as nouns when they're relational operators. This script fixes the ontology.
//
// Usage:
//   node hebrew-signs-relational.js                    # Full relational analysis
//   node hebrew-signs-relational.js --stats            # Show current status
//   node hebrew-signs-relational.js --dry-run          # Process 3 letters only
//   node hebrew-signs-relational.js --letter א         # Single letter only
//   node hebrew-signs-relational.js --resume           # Resume from checkpoint
//   node hebrew-signs-relational.js --concurrency 3    # Parallel requests (default 2)

const fs = require('fs');
const path = require('path');

// ─── Config ────────────────────────────────────────────────────────────────

const INPUT_DIR = path.join(__dirname, '..', 'data');
const FRAMEWORK_FILE = path.join(INPUT_DIR, 'canonical-framework.json');
const STATS_FILE = path.join(INPUT_DIR, 'letter-statistics.json');
const OUTPUT_FILE = path.join(INPUT_DIR, 'relational-confirmation.json');
const CHECKPOINT_FILE = path.join(INPUT_DIR, 'relational-checkpoint.json');

const MODEL = 'grok-4-1-fast-non-reasoning';
const API_URL = 'https://api.x.ai/v1/chat/completions';
const API_KEY = process.env.XAI_API_KEY;
const REQUEST_DELAY_MS = 100;
const MAX_RETRIES = 3;
const WORDS_PER_LETTER = 75;
const BATCH_SIZE = 15;
const CHECKPOINT_INTERVAL = 5;

// ─── Relational Framework ──────────────────────────────────────────────────
// Each letter defined by its relational dynamic — what it DOES, not what it IS.

const RELATIONAL_FRAMEWORK = {
  'א': {
    dynamic: 'origination — establishing a referent, designating, initiating',
    relational_keywords: ['establishing', 'initiating', 'referencing', 'pointing-to', 'designating', 'identifying', 'originating', 'grounding'],
    test_question: 'Does this word establish, designate, or originate something?',
  },
  'ב': {
    dynamic: 'containment — placing within, housing, giving form to',
    relational_keywords: ['containing', 'housing', 'enclosing', 'placing-within', 'giving-form', 'structuring', 'building', 'dwelling'],
    test_question: 'Does this word contain, house, or give form to something?',
  },
  'ג': {
    dynamic: 'amplification — magnifying, extending, making great',
    relational_keywords: ['amplifying', 'magnifying', 'extending', 'elevating', 'increasing', 'lifting', 'making-great', 'growing'],
    test_question: 'Does this word amplify, magnify, or extend something?',
  },
  'ד': {
    dynamic: 'mediation — connecting via speech/path/blood, bridging',
    relational_keywords: ['mediating', 'connecting', 'bridging', 'conveying', 'speaking', 'channeling', 'transmitting', 'pathfinding'],
    test_question: 'Does this word mediate, bridge, or convey between elements?',
  },
  'ה': {
    dynamic: 'specification — pointing to, defining, making present (the/this/behold)',
    relational_keywords: ['specifying', 'defining', 'pointing-to', 'presenting', 'revealing', 'making-present', 'indicating', 'manifesting'],
    test_question: 'Does this word specify, define, or make something present?',
  },
  'ו': {
    dynamic: 'conjunction — joining, sequencing, progressing narrative',
    relational_keywords: ['joining', 'connecting', 'sequencing', 'continuing', 'progressing', 'linking', 'adding', 'extending-narrative'],
    test_question: 'Does this word join, sequence, or progress elements?',
  },
  'ז': {
    dynamic: 'distinction — marking identity, setting apart, remembering',
    relational_keywords: ['distinguishing', 'marking', 'setting-apart', 'remembering', 'identifying', 'separating-out', 'memorializing', 'preserving'],
    test_question: 'Does this word distinguish, mark, or set something apart?',
  },
  'ח': {
    dynamic: 'vitalization — animating with life-force (life, strength, grace, and their shadows: sin, destruction)',
    relational_keywords: ['vitalizing', 'animating', 'enlivening', 'empowering', 'gracing', 'strengthening', 'charging', 'vivifying'],
    test_question: 'Does this word vitalize, animate, or charge something with life-force?',
  },
  'ט': {
    dynamic: 'evaluation — assessing quality (good/pure/impure/taste)',
    relational_keywords: ['evaluating', 'assessing', 'judging-quality', 'tasting', 'discerning', 'testing', 'purifying', 'determining-worth'],
    test_question: 'Does this word evaluate, assess quality, or discern worth?',
  },
  'י': {
    dynamic: 'agency — acting with purpose, naming, reaching (hand)',
    relational_keywords: ['acting', 'reaching', 'naming', 'giving', 'making', 'doing', 'producing', 'exercising-will'],
    test_question: 'Does this word express purposeful action, naming, or reaching?',
  },
  'כ': {
    dynamic: 'comparison — measuring against, likening, receiving into (palm/vessel)',
    relational_keywords: ['comparing', 'likening', 'measuring-against', 'receiving', 'holding', 'cupping', 'matching', 'corresponding'],
    test_question: 'Does this word compare, liken, or receive into itself?',
  },
  'ל': {
    dynamic: 'direction — pointing toward, purposing, leading to',
    relational_keywords: ['directing', 'pointing-toward', 'purposing', 'leading-to', 'aiming', 'guiding', 'orienting', 'destining'],
    test_question: 'Does this word direct, aim toward, or purpose something?',
  },
  'מ': {
    dynamic: 'extraction — drawing from source, separating out, originating from',
    relational_keywords: ['extracting', 'drawing-from', 'separating-out', 'originating-from', 'deriving', 'issuing-forth', 'coming-from', 'sourcing'],
    test_question: 'Does this word extract, draw from a source, or indicate origin?',
  },
  'נ': {
    dynamic: 'bestowal — giving forth, extending life/soul, descending',
    relational_keywords: ['bestowing', 'giving-forth', 'extending', 'descending', 'spreading', 'planting', 'imparting', 'propagating'],
    test_question: 'Does this word bestow, give forth, or extend outward/downward?',
  },
  'ס': {
    dynamic: 'encirclement — surrounding, supporting, containing around',
    relational_keywords: ['encircling', 'surrounding', 'supporting', 'upholding', 'sheltering', 'encompassing', 'sustaining', 'enclosing-around'],
    test_question: 'Does this word encircle, surround, or support from around?',
  },
  'ע': {
    dynamic: 'engagement — working with/upon, serving, ascending through',
    relational_keywords: ['engaging', 'working-upon', 'serving', 'ascending', 'laboring', 'interacting', 'confronting', 'processing'],
    test_question: 'Does this word engage with, work upon, or serve something?',
  },
  'פ': {
    dynamic: 'interface — meeting at the boundary (face, mouth, edge, opening)',
    relational_keywords: ['interfacing', 'opening', 'facing', 'speaking-forth', 'edging', 'meeting-at-boundary', 'expressing', 'bordering'],
    test_question: 'Does this word function at an interface, boundary, or opening?',
  },
  'צ': {
    dynamic: 'alignment — ordering toward justice, commanding, marshaling',
    relational_keywords: ['aligning', 'ordering', 'commanding', 'marshaling', 'directing-toward-justice', 'rightening', 'arraying', 'positioning'],
    test_question: 'Does this word align, order, or marshal toward a standard?',
  },
  'ק': {
    dynamic: 'sanctification — calling forth, making holy, summoning to presence',
    relational_keywords: ['sanctifying', 'calling-forth', 'summoning', 'making-holy', 'dedicating', 'setting-apart-for', 'consecrating', 'invoking'],
    test_question: 'Does this word sanctify, call forth, or summon to presence?',
  },
  'ר': {
    dynamic: 'perception — seeing, heading, discerning (vision + leadership + spirit)',
    relational_keywords: ['perceiving', 'seeing', 'heading', 'discerning', 'leading-by-vision', 'comprehending', 'overseeing', 'envisioning'],
    test_question: 'Does this word perceive, head, or discern through vision?',
  },
  'ש': {
    dynamic: 'enumeration — naming, counting, establishing identity (name, number, peace/wholeness)',
    relational_keywords: ['enumerating', 'naming', 'counting', 'identifying', 'returning', 'completing', 'guarding', 'establishing-identity'],
    test_question: 'Does this word enumerate, name, or establish identity/wholeness?',
  },
  'ת': {
    dynamic: 'completion — arriving, fulfilling, sealing (under, always, do/make)',
    relational_keywords: ['completing', 'fulfilling', 'sealing', 'giving', 'making', 'placing-under', 'finishing', 'consummating'],
    test_question: 'Does this word complete, fulfill, or seal something?',
  },
};

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
    let depth = 0, inString = false, escape = false;
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

// ─── LLM Relational Analysis ────────────────────────────────────────────────

const RELATIONAL_SYSTEM_PROMPT = `You are a Hebrew linguist analyzing words from the Tanach (Hebrew Bible) for their RELATIONAL FUNCTION — not what they mean, but what they DO.

For each Hebrew word provided, describe its relational dynamic: how does it connect, move, transform, establish, contain, or separate elements?

Respond with ONLY valid JSON — no markdown, no code blocks, no explanation.

Format:
{
  "words": [
    {
      "word": "the Hebrew word",
      "english": "primary English meaning",
      "relational_function": "one sentence: what this word DOES relationally",
      "dynamic_tags": ["verb-gerund1", "verb-gerund2", "verb-gerund3", "verb-gerund4"],
      "dynamic_type": "one of: origination, containment, amplification, mediation, specification, conjunction, distinction, vitalization, evaluation, agency, comparison, direction, extraction, bestowal, encirclement, engagement, interface, alignment, sanctification, perception, enumeration, completion"
    }
  ]
}

Guidelines:
- relational_function: describe what the word DOES, not what it IS. Use verbs.
- dynamic_tags: 3-5 verb-gerunds (e.g., "establishing", "containing", "joining") that capture the word's relational action
- dynamic_type: choose the SINGLE best fit from the list above based on the word's primary relational function
- For particles/prepositions (את, אל, על, כי, etc.), their relational function IS their meaning — describe how they connect elements
- Think about PREFIX LETTER behavior: ב means "in" (containment), ל means "to" (direction), מ means "from" (extraction), ו means "and" (conjunction), ה means "the" (specification), כ means "like" (comparison)
- Use lowercase for all tags`;

const HOLISTIC_RELATIONAL_PROMPT = `You are a Hebrew linguist performing relational-dynamic pattern analysis for the Neural Knowledge Base.

Given a collection of the most common Hebrew words beginning with a specific letter, identify the shared RELATIONAL DYNAMIC — not what these words mean, but what they DO. How do they function to connect, establish, contain, reveal, separate, or transform elements?

Respond with ONLY valid JSON:
{
  "letter": "the letter name",
  "dominant_dynamics": ["dynamic1", "dynamic2", "dynamic3"],
  "unifying_dynamic": "one phrase describing the shared relational action, or 'no clear dynamic' if none",
  "function_word_dynamic": "what the function words in this set DO relationally",
  "content_word_dynamic": "what the content words in this set DO relationally",
  "dynamic_summary": "2-3 sentence analysis of what relational pattern this letter's words share — focus on verbs and actions, not noun-categories"
}`;

function buildRelationalBatchPrompt(wordEntries, letterInfo) {
  const rel = RELATIONAL_FRAMEWORK[letterInfo.letter];
  const lines = wordEntries.map((w, i) =>
    `${i + 1}. ${w.word} (appears ${w.count}x in Tanach)`
  );

  return `Analyze the RELATIONAL FUNCTION of these Hebrew words beginning with ${letterInfo.name} (${letterInfo.letter}).
For each word, describe what it DOES — how it connects, establishes, moves, or transforms elements.

${lines.join('\n')}

Remember: describe the relational dynamic (verbs), not the semantic category (nouns).`;
}

function buildHolisticRelationalPrompt(wordEntries, letterInfo) {
  const contentWords = wordEntries.filter(w => w.count < 1000).slice(0, 40);
  const functionWords = wordEntries.filter(w => w.count >= 1000).slice(0, 10);

  const contentList = contentWords.map(w => `${w.word} (${w.count}x)`).join(', ');
  const functionList = functionWords.map(w => `${w.word} (${w.count}x)`).join(', ');

  return `Analyze the shared RELATIONAL DYNAMIC of Hebrew words beginning with ${letterInfo.name} (${letterInfo.letter}).

High-frequency function words: ${functionList || 'none'}

Content words (sorted by frequency):
${contentList}

Looking at these words collectively, what shared RELATIONAL DYNAMIC do they perform? Not what they mean, but what they DO — how do they function to connect, establish, contain, reveal, separate, or transform elements?`;
}

async function callRelationalLLM(wordEntries, letterInfo) {
  const userPrompt = buildRelationalBatchPrompt(wordEntries, letterInfo);

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
            { role: 'system', content: RELATIONAL_SYSTEM_PROMPT },
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

async function callHolisticRelationalLLM(wordEntries, letterInfo) {
  const userPrompt = buildHolisticRelationalPrompt(wordEntries, letterInfo);

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
            { role: 'system', content: HOLISTIC_RELATIONAL_PROMPT },
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

// ─── Relational Scoring ────────────────────────────────────────────────────

// Rough stem: strip common verb suffixes to normalize "containing"/"contains"/"containment"
function roughStem(word) {
  return word.toLowerCase()
    .replace(/[^a-z-]/g, '')
    .replace(/(ment|tion|ing|ness|ity|ous|ive|able|ible|ful|less|ize|ise|ify|ated?|ates?|ence|ance|er|or|ly|ed|es|s)$/, '');
}

function computeRelationalScore(wordResults, letterChar, holisticResult) {
  const rel = RELATIONAL_FRAMEWORK[letterChar];
  if (!rel) return { score: 0, dynamic_alignment: 0, keyword_overlap: 0, holistic_alignment: 0 };

  // Extract the dynamic name from the framework (e.g., "origination" from "origination — ...")
  const proposedDynamic = rel.dynamic.split('—')[0].trim().toLowerCase();

  // ── 1. Dynamic-type alignment: what % of words got the proposed dynamic_type? ──
  const wordsWithType = wordResults.filter(w => w.dynamic_type);
  const matchingType = wordsWithType.filter(w =>
    w.dynamic_type && w.dynamic_type.toLowerCase() === proposedDynamic
  );
  const dynamicAlignment = wordsWithType.length > 0
    ? matchingType.length / wordsWithType.length
    : 0;

  // ── 2. Keyword overlap: do the empirical dynamic_tags match relational_keywords? ──
  const proposedKeywords = new Set(rel.relational_keywords.map(k => k.toLowerCase()));
  const proposedStems = new Set(rel.relational_keywords.map(k => roughStem(k)));
  const tagCounts = new Map();
  let totalWeight = 0;

  for (const word of wordResults) {
    const weight = Math.log2((word.count || 1) + 1);
    for (const tag of (word.dynamic_tags || [])) {
      const normalized = tag.toLowerCase().replace(/[^a-z-]/g, '');
      tagCounts.set(normalized, (tagCounts.get(normalized) || 0) + weight);
      totalWeight += weight;
    }
  }

  let keywordScore = 0;
  const matchingKeywords = [];
  if (totalWeight > 0) {
    for (const [tag, count] of tagCounts) {
      const freq = count / totalWeight;
      const tagStem = roughStem(tag);
      // Direct match (exact or gerund form)
      if (proposedKeywords.has(tag)) {
        keywordScore += freq;
        matchingKeywords.push({ tag, frequency: Math.round(freq * 1000) / 1000 });
        continue;
      }
      // Stem match: "containing" stems to "contain", "containment" stems to "contain"
      if (proposedStems.has(tagStem)) {
        keywordScore += freq * 0.85;
        matchingKeywords.push({ tag, frequency: Math.round(freq * 1000) / 1000, stem: true });
        continue;
      }
      // Fuzzy: check substring containment both ways
      for (const pk of proposedKeywords) {
        if (tag.includes(pk) || pk.includes(tag)) {
          keywordScore += freq * 0.5;
          matchingKeywords.push({ tag, matched_to: pk, frequency: Math.round(freq * 1000) / 1000, fuzzy: true });
          break;
        }
      }
    }
  }
  // Normalize keyword score to 0-1 range
  const keywordOverlap = Math.min(1, keywordScore / 0.25);

  // ── 3. Holistic alignment: does the holistic assessment mention the dynamic? ──
  let holisticAlignment = 0;
  if (holisticResult) {
    const holisticText = JSON.stringify(holisticResult).toLowerCase();
    // Check if the dynamic name or key keywords appear in the holistic analysis
    if (holisticText.includes(proposedDynamic)) {
      holisticAlignment = 1.0;
    } else {
      // Check relational keywords
      let hits = 0;
      for (const kw of rel.relational_keywords) {
        if (holisticText.includes(kw.toLowerCase())) hits++;
      }
      holisticAlignment = Math.min(1, hits / 3); // 3 keyword hits = full alignment
    }
  }

  // Top empirical dynamic tags
  const empiricalTop = [...tagCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([tag, count]) => ({ tag, frequency: Math.round((count / totalWeight) * 1000) / 1000 }));

  // Dynamic type distribution
  const typeDist = new Map();
  for (const w of wordsWithType) {
    const t = w.dynamic_type.toLowerCase();
    typeDist.set(t, (typeDist.get(t) || 0) + 1);
  }
  const typeDistribution = [...typeDist.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([type, count]) => ({ type, count, percent: Math.round((count / wordsWithType.length) * 100) }));

  // ── Composite score: weighted combination ──
  // Dynamic-type alignment is the strongest signal (50%)
  // Keyword overlap captures nuance (30%)
  // Holistic gives the big-picture check (20%)
  const composite = (dynamicAlignment * 0.50) + (keywordOverlap * 0.30) + (holisticAlignment * 0.20);

  return {
    score: Math.round(composite * 1000) / 1000,
    dynamic_alignment: Math.round(dynamicAlignment * 1000) / 1000,
    keyword_overlap: Math.round(keywordOverlap * 1000) / 1000,
    holistic_alignment: Math.round(holisticAlignment * 1000) / 1000,
    proposed_dynamic: proposedDynamic,
    matching_keywords: matchingKeywords,
    empirical_top_tags: empiricalTop,
    type_distribution: typeDistribution,
    words_with_matching_type: matchingType.length,
    words_with_any_type: wordsWithType.length,
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

  console.log('=== NKB Hebrew Signs Relational-Dynamic Scoring ===');
  console.log(`Date: ${new Date().toISOString().split('T')[0]}`);
  console.log(`Model: ${MODEL}`);
  console.log(`Words per letter: ${WORDS_PER_LETTER}`);
  console.log(`Batch size: ${BATCH_SIZE}`);
  console.log('');

  const framework = loadJSON(FRAMEWORK_FILE);
  const stats = loadJSON(STATS_FILE);
  console.log(`Framework: ${framework.letters.length} letters`);

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
    if (checkpoint.completed[letterInfo.letter]) {
      results[letterInfo.letter] = checkpoint.completed[letterInfo.letter];
      console.log(`  ${letterInfo.letter} ${letterInfo.name}: already completed (from checkpoint)`);
      continue;
    }

    console.log(`\n── ${letterInfo.letter} ${letterInfo.name} ──`);
    console.log(`  Proposed: "${letterInfo.meaning}" → Relational: "${RELATIONAL_FRAMEWORK[letterInfo.letter].dynamic}"`);

    const letterStats = stats.initial_letter_lists[letterInfo.letter];
    if (!letterStats) {
      console.log('  No word data found, skipping');
      continue;
    }

    const topWords = letterStats.top_words.slice(0, WORDS_PER_LETTER);
    console.log(`  Top ${topWords.length} words (of ${letterStats.total_unique} unique)`);

    // Process in batches
    const allWordResults = [];
    const batches = [];
    for (let i = 0; i < topWords.length; i += BATCH_SIZE) {
      batches.push(topWords.slice(i, i + BATCH_SIZE));
    }

    for (let b = 0; b < batches.length; b++) {
      try {
        const result = await callRelationalLLM(batches[b], letterInfo);
        // Merge frequency counts
        for (const wr of result.words) {
          const match = topWords.find(tw => tw.word === wr.word);
          wr.count = match ? match.count : 1;
        }
        allWordResults.push(...result.words);
        totalInputTokens += result.inputTokens;
        totalOutputTokens += result.outputTokens;
        console.log(`  Batch ${b + 1}/${batches.length}: ${result.words.length} words (${result.inputTokens}+${result.outputTokens} tok)`);
      } catch (err) {
        console.error(`  Batch ${b + 1} ERROR: ${err.message.slice(0, 100)}`);
        checkpoint.errors++;
      }
      if (b < batches.length - 1) await sleep(REQUEST_DELAY_MS);
    }

    // Holistic relational analysis
    let holistic = null;
    try {
      console.log(`  Running holistic relational analysis...`);
      const holisticResult = await callHolisticRelationalLLM(topWords, letterInfo);
      holistic = holisticResult.holistic;
      totalInputTokens += holisticResult.inputTokens;
      totalOutputTokens += holisticResult.outputTokens;
      console.log(`  Holistic: "${holistic.unifying_dynamic}" (${holisticResult.inputTokens}+${holisticResult.outputTokens} tok)`);
    } catch (err) {
      console.error(`  Holistic ERROR: ${err.message.slice(0, 100)}`);
    }

    // Compute relational score
    const scoring = computeRelationalScore(allWordResults, letterInfo.letter, holistic);

    results[letterInfo.letter] = {
      letter: letterInfo.letter,
      name: letterInfo.name,
      proposed_meaning: letterInfo.meaning,
      proposed_dynamic: RELATIONAL_FRAMEWORK[letterInfo.letter].dynamic,
      words_analyzed: allWordResults.length,
      word_details: allWordResults,
      relational_score: scoring.score,
      dynamic_alignment: scoring.dynamic_alignment,
      keyword_overlap: scoring.keyword_overlap,
      holistic_alignment: scoring.holistic_alignment,
      matching_keywords: scoring.matching_keywords,
      empirical_top_tags: scoring.empirical_top_tags,
      type_distribution: scoring.type_distribution,
      holistic_analysis: holistic,
    };

    const scoreLabel = scoring.score >= 0.5 ? 'STRONG' :
                       scoring.score >= 0.25 ? 'MODERATE' : 'WEAK';
    console.log(`  Relational score: ${(scoring.score * 100).toFixed(0)}% (${scoreLabel})`);
    console.log(`    Dynamic-type alignment: ${(scoring.dynamic_alignment * 100).toFixed(0)}% (${scoring.words_with_matching_type}/${scoring.words_with_any_type} words)`);
    console.log(`    Keyword overlap: ${(scoring.keyword_overlap * 100).toFixed(0)}%`);
    console.log(`    Holistic alignment: ${(scoring.holistic_alignment * 100).toFixed(0)}%`);
    console.log(`    Type distribution: ${scoring.type_distribution.map(t => `${t.type}:${t.percent}%`).join(', ')}`);

    lettersProcessed++;

    // Checkpoint
    if (lettersProcessed % CHECKPOINT_INTERVAL === 0 && !dryRun) {
      checkpoint.completed = { ...checkpoint.completed, ...results };
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
  console.log(`Cost: $${(costInput + costOutput).toFixed(4)}`);
  console.log(`Errors: ${checkpoint.errors}`);

  // Score ranking
  const ranked = Object.values(results)
    .filter(r => r.relational_score !== undefined)
    .sort((a, b) => b.relational_score - a.relational_score);

  console.log('\n── Relational Scores (ranked) ──');
  for (const r of ranked) {
    const bar = '█'.repeat(Math.round(r.relational_score * 20)).padEnd(20, '░');
    const label = r.relational_score >= 0.5 ? 'STRONG  ' :
                  r.relational_score >= 0.25 ? 'MODERATE' : 'WEAK    ';
    const dynShort = r.proposed_dynamic.split('—')[0].trim();
    console.log(
      `  ${r.letter} ${r.name.padEnd(8)} [${dynShort.padEnd(16)}] ` +
      `${bar} ${(r.relational_score * 100).toFixed(0).padStart(3)}% ${label} ` +
      `(dyn:${(r.dynamic_alignment * 100).toFixed(0)}% kw:${(r.keyword_overlap * 100).toFixed(0)}% hol:${(r.holistic_alignment * 100).toFixed(0)}%)`
    );
  }

  const avgScore = ranked.length > 0
    ? ranked.reduce((s, r) => s + r.relational_score, 0) / ranked.length
    : 0;
  const avgDyn = ranked.length > 0
    ? ranked.reduce((s, r) => s + r.dynamic_alignment, 0) / ranked.length
    : 0;

  console.log(`\n  Average relational: ${(avgScore * 100).toFixed(1)}%`);
  console.log(`  Average dynamic-type: ${(avgDyn * 100).toFixed(1)}%`);

  if (!statsOnly && !dryRun) {
    const output = {
      type: 'hebrew-signs-relational-confirmation',
      description: 'Relational-dynamic scoring: tests what Hebrew words DO (relational operators) instead of what they ARE (category labels)',
      model: MODEL,
      generated: new Date().toISOString(),
      methodology: {
        approach: 'relational-dynamic',
        scoring_weights: { dynamic_alignment: 0.50, keyword_overlap: 0.30, holistic_alignment: 0.20 },
        comparison: 'Phase 3 category-label scoring averaged 13.9%. This relational approach asks what words DO instead of what they MEAN.',
      },
      counts: {
        letters_analyzed: Object.keys(results).length,
        total_input_tokens: totalInputTokens,
        total_output_tokens: totalOutputTokens,
        cost_usd: Math.round((costInput + costOutput) * 10000) / 10000,
      },
      average_relational_score: Math.round(avgScore * 1000) / 1000,
      average_dynamic_alignment: Math.round(avgDyn * 1000) / 1000,
      results,
    };
    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2));
    console.log(`\nWritten to: ${OUTPUT_FILE}`);

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
