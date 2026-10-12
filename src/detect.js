// detect.js: Turkish title detection. Pure, synchronous, no DOM / chrome.* API dependency.
// Export: globalThis.YTRF.detect = { turkishScore, isTurkish }
(function () {
  'use strict';

  // Scoring formula (points 0-100, divided by 100 at the end; integer sums avoid float error):
  //   strong chars (ı İ ğ Ğ ş Ş) present : 75 + 5 * min(count - 1, 2)   (75..85)
  //   definite Turkish stopword           : +25 per match
  //   ambiguous stopword (en, ne, son...) : +10 per match (collides with French/English/Spanish)
  //   weak chars (ç ö ü Ç Ö Ü) present   : +10 once (German/French alone can never pass the threshold)
  //   exception (English proper name): exactly 1 word containing a strong char, >= 2 English
  //     stopwords and no definite Turkish stopword -> strong chars give 20 instead of 75
  //     (e.g. "Erdoğan" inside an English sentence)
  //   total is capped at 100. Default threshold is 0.5.
  // Result: one strong char is enough; a title with stopwords but no special chars needs >= 2 definite stopwords.
  // Known limit: titles like "bugün hava çok güzel" (no strong char, 1 stopword) stay below the threshold.

  const STRONG_RE = /[ıİğĞşŞ]/g;
  const WEAK_RE = /[çöüÇÖÜ]/;
  const WORD_SPLIT_RE = /[^\p{L}]+/u;

  const STRONG_WORDS = new Set([
    've', 'bir', 'bu', 'şu', 'için', 'ile', 'neden', 'nasıl', 'değil', 'çok', 'daha', 'gibi',
    'ilk', 'kez', 'oldu', 'yok', 'şimdi', 'büyük', 'yeni', 'kadar', 'sonra', 'önce', 'tüm',
    'hakkında', 'olarak', 'evet', 'hayır', 'bütün', 'ancak', 'çünkü', 'neler', 'nerede',
  ]);
  // Short words that are also common in other languages: low weight
  const AMBIGUOUS_WORDS = new Set(['en', 'ne', 'son', 'var', 'ama', 'mi', 'mı', 'ise']);

  const STRONG_TEST_RE = /[ıİğĞşŞ]/;
  // Small English stopword list (apostrophes are stripped, so isn't -> isnt)
  const ENGLISH_WORDS = new Set([
    'the', 'a', 'an', 'is', 'are', 'was', 'were', 'this', 'that', 'of', 'to', 'in', 'on', 'and',
    'for', 'with', 'how', 'why', 'what', 'you', 'your', 'it', 'its', 'not', 'just', 'but', 'from',
    'by', 'his', 'her', 'isnt', 'dont', 'doesnt', 'cant', 'wont', 'has', 'have', 'be',
  ]);

  function countEnglishStopwords(text) {
    // Lowercase with English rules (with the tr locale "IS" would become "ıs")
    const words = text.replace(/['’]/g, '').toLowerCase().split(WORD_SPLIT_RE);
    let n = 0;
    for (const w of words) if (ENGLISH_WORDS.has(w)) n++;
    return n;
  }

  const CACHE_LIMIT = 2000;
  const cache = new Map();

  function computeScore(title) {
    const text = title.normalize('NFC');
    let points = 0;

    // On the raw text (no lowercasing: 'İ'.toLowerCase() yields a combining dot)
    const strongCount = (text.match(STRONG_RE) || []).length;

    if (WEAK_RE.test(text)) points += 10;

    let strongWordHits = 0;
    const words = text.toLocaleLowerCase('tr').split(WORD_SPLIT_RE);
    for (const word of words) {
      if (!word) continue;
      if (STRONG_WORDS.has(word)) { points += 25; strongWordHits++; }
      else if (AMBIGUOUS_WORDS.has(word)) points += 10;
    }

    if (strongCount > 0) {
      // Keep a single proper name (e.g. "Erdoğan") inside an English sentence from causing a false positive:
      // exactly 1 word with a strong char + >= 2 English stopwords + no definite Turkish stopword
      // -> the strong-char contribution drops to 20.
      const strongWords = text.split(WORD_SPLIT_RE).filter(w => STRONG_TEST_RE.test(w)).length;
      if (strongWords === 1 && strongWordHits === 0 && countEnglishStopwords(text) >= 2) {
        points += 20;
      } else {
        points += 75 + 5 * Math.min(strongCount - 1, 2);
      }
    }

    return Math.min(points, 100) / 100;
  }

  function turkishScore(title) {
    if (typeof title !== 'string' || title === '') return 0;
    const cached = cache.get(title);
    if (cached !== undefined) return cached;
    const score = computeScore(title);
    if (cache.size >= CACHE_LIMIT) cache.clear();
    cache.set(title, score);
    return score;
  }

  function isTurkish(title, threshold = 0.5) {
    return turkishScore(title) >= threshold;
  }

  globalThis.YTRF = globalThis.YTRF || {};
  globalThis.YTRF.detect = { turkishScore, isTurkish };
})();
