/**
 * Kids Content Filter
 *
 * Provides client-side filtering for Kids profiles. When a Kids profile is
 * active, all TMDB content is scanned for:
 *   1. The TMDB `adult` flag (boolean on movie/tv objects)
 *   2. Adult IDs downloaded from the TMDB Daily ID Exports
 *      (adult_movie_ids / adult_tv_series_ids)
 *   3. A comprehensive blocked-words list checked against title + overview
 *
 * Usage:
 *   import { isContentBlocked, filterResults } from '../utils/kidsFilter';
 *   const safe = filterResults(results); // removes blocked items
 */

// ──────────────────────────────────────────────────────────────────────
// BLOCKED WORDS
// Words/phrases that, when found in the title or overview of a movie/show,
// indicate the content is NOT suitable for kids.  Matching is done on
// word-boundaries, case-insensitive.
// ──────────────────────────────────────────────────────────────────────

const BLOCKED_WORDS: string[] = [
  // === Sexual / Erotic ===
  'erotic', 'erotica', 'erotique', 'softcore', 'hardcore', 'xxx',
  'pornographic', 'pornography', 'porno', 'porn',
  'x-rated', 'x rated', 'nc-17', 'unrated',
  'hentai', 'ecchi', 'yaoi', 'yuri', 'futanari',
  'nympho', 'nymphomaniac', 'nymphomania',
  'orgasm', 'orgy', 'orgies',
  'bondage', 'bdsm', 'dominatrix', 'sadomasochism', 'sadomasochist',
  'fetish', 'fetishism', 'kink', 'kinky',
  'striptease', 'stripper', 'strippers', 'strip club', 'stripclub',
  'lap dance', 'lapdance', 'pole dance',
  'topless', 'nude', 'nudity', 'nudism', 'nudist',
  'naked', 'full frontal',
  'voyeur', 'voyeurism', 'voyeuristic',
  'exhibitionist', 'exhibitionism',
  'aphrodisiac',
  'libido',
  'fornicate', 'fornication',
  'adultery', 'adulterous',
  'concubine', 'courtesan', 'gigolo',
  'prostitute', 'prostitution', 'escort service',
  'call girl', 'callgirl',
  'brothel', 'bordello', 'whorehouse',
  'madam', // in brothel context — risk of false-positive but acceptable for kids mode
  'hooker', 'hookers',
  'pimp', 'pimping',
  'sex worker', 'sex workers', 'sex work',
  'sex tape', 'sextape',
  'sex scene', 'sex scenes',
  'sexual assault', 'sexual abuse',
  'sexual predator', 'sexual violence',
  'sexual content', 'sexually explicit',
  'lust', 'lustful',
  'seduction', 'seduce', 'seducer', 'seductress',
  'sensual', 'sensuality',
  'risque', 'risqué',
  'carnal', 'carnality',
  'debauchery', 'debauched',
  'hedonism', 'hedonist', 'hedonistic',
  'promiscuous', 'promiscuity',
  'sultry',
  'voluptuous',
  'steamy',
  'titillating',
  'lascivious', 'lewd', 'lewdness',
  'obscene', 'obscenity',
  'smut', 'smutty',
  'raunchy',
  'racy',
  'bawdy',
  'ribald',
  'indecent',
  'impure',
  'licentious',
  'wanton',
  'salacious',
  'prurient',
  'lurid',

  // === Body parts (sexual context) ===
  'genitals', 'genitalia', 'genital',
  'penis', 'phallus', 'phallic',
  'vagina', 'vaginal',
  'clitoris',
  'testicle', 'testicles', 'testicular',
  'scrotum',
  'breasts', // not "breast" alone (breast cancer docs)
  'boobs', 'boobies',
  'nipple', 'nipples',
  'buttocks',
  'anus', 'anal',

  // === Vulgar / Profanity ===
  'fuck', 'fucking', 'fucked', 'fucker', 'motherfucker',
  'shit', 'shitty', 'bullshit',
  'bitch', 'bitches',
  'asshole', 'arsehole',
  'bastard', 'bastards',
  'damn', 'dammit', 'goddamn',
  'cunt', 'cunts',
  'cock', 'cocks', 'cocksucker',
  'dick', 'dicks',
  'whore', 'whores',
  'slut', 'sluts', 'slutty',
  'wanker', 'wanking',
  'twat',
  'piss', 'pissed',
  'crap', 'crappy',
  'screw you',

  // === Violence (extreme) ===
  'gore', 'gory',
  'dismember', 'dismemberment',
  'decapitate', 'decapitation', 'beheading',
  'mutilate', 'mutilation',
  'torture', 'tortured', 'torturer',
  'bloodbath',
  'massacre', 'massacred',
  'slaughter', 'slaughtered', 'slaughterhouse',
  'sadistic', 'sadism', 'sadist',
  'psychopath', 'psychopathic',
  'sociopath', 'sociopathic',
  'serial killer', 'serial killers',
  'mass murder', 'mass murderer',
  'cannibalism', 'cannibal', 'cannibals',
  'necrophilia', 'necrophiliac',
  'snuff',
  'human trafficking',
  'child abuse',

  // === Drugs (explicit) ===
  'cocaine', 'heroin', 'methamphetamine', 'meth',
  'crack cocaine', 'fentanyl',
  'drug dealer', 'drug dealing',
  'drug cartel', 'drug lord',
  'overdose', 'overdosed',
  'junkie', 'junkies',
  'crackhead',
  'drug abuse',

  // === Suicide / Self-Harm ===
  'suicide', 'suicidal',
  'self-harm', 'self harm',
  'cutting herself', 'cutting himself',

  // === Gambling / Vice ===
  'strip poker',

  // === Specific content descriptors ===
  'rated r', 'r-rated',
  'adults only', 'adult only',
  'mature content',
  '18+', 'ages 18',
  'not suitable for children',
  'viewer discretion',

  // === Intercourse / Acts ===
  'intercourse', 'coitus',
  'copulate', 'copulation',
  'fellatio', 'cunnilingus',
  'sodomy', 'sodomize', 'sodomized',
  'masturbate', 'masturbation', 'masturbating',
  'ejaculate', 'ejaculation',
  'climax',
  'orgasmic',
  'threesome', 'foursome', 'gangbang',
  'one-night stand',
  'friends with benefits',
  'booty call',
  'hookup', 'hook up',

  // === Misc mature ===
  'sex addict', 'sex addiction',
  'pedophile', 'pedophilia', 'paedophile', 'paedophilia',
  'incest', 'incestuous',
  'bestiality', 'zoophilia',
  'necromantic',
  'blasphemy', 'blasphemous',
  'hate crime',
  'white supremacy', 'white supremacist',
  'neo-nazi', 'neo nazi',
  'genocide',
  'ethnic cleansing',
  'rape', 'raped', 'rapist',
  'molestation', 'molester', 'molest',
  'groping',
  'flashing',
  'peeping tom',

  // === More erotic/romance terms ===
  'fifty shades',
  'after dark',
  'skin flick',
  'blue movie',
  'dirty movie',
  'sex comedy',
  'sex thriller',
  'erotic thriller',
  'body count',
  'sexploitation',
  'blaxploitation',
  'grindhouse',
  'exploitation film',
  'snuff film',
  'torture porn',
  'splatter',

  // === Substances ===
  'cannabis', 'marijuana', 'weed',
  'lsd', 'acid trip',
  'ecstasy', 'mdma',
  'opium',
  'hallucinogen', 'hallucinogenic',
  'psychedelic',

  // === Additional adult vocabulary ===
  'arousal', 'aroused',
  'ravish', 'ravished',
  'deflower', 'deflowered',
  'penetrate', 'penetration',
  'thrust', 'thrusting',
  'moan', 'moaning',
  'groan', 'groaning',
  'writhe', 'writhing',
  'caress', 'caressing',
  'fondle', 'fondling',
  'grope', 'groping',
  'undress', 'undressing',
  'disrobe', 'disrobing',
  'intimate encounter',
  'intimate scene',
  'bedroom scene',
  'love scene',
  'lovemaking', 'love making',
  'pillow talk',
  'infidelity',
  'affair',
  'mistress',
  'lover',
  'illicit affair',
  'forbidden love',
  'taboo',
  'taboo love',
  'secret affair',
  'extramarital',
  'unfaithful',
  'cuckold',
  'swinger', 'swingers', 'swinging',
  'polyamory', 'polyamorous',
  'dominance', 'submission',
  'whips and chains',
  'handcuffs',
  'blindfold',
  'safe word',
  'pleasure', // too broad alone, but combined context
  'ecstatic',
  'euphoria',
  'temptress',
  'seductress',
  'femme fatale',
  'vixen',
  'minx',
  'siren',
  'enchantress',
  'jezebel',
  'harlot',
  'trollop',
  'strumpet',
  'doxy',
  'tart',
  'floozy',
  'hussie', 'hussy',
];

// Build a Set of lowercase words for fast lookup, and a compiled regex
// for multi-word phrases.
const _singleWords = new Set<string>();
const _multiWordPhrases: RegExp[] = [];

for (const w of BLOCKED_WORDS) {
  const lower = w.toLowerCase().trim();
  if (!lower) continue;
  if (lower.includes(' ') || lower.includes('-')) {
    // Multi-word phrase: build a regex with word boundaries
    try {
      _multiWordPhrases.push(new RegExp(`\\b${lower.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i'));
    } catch (e) {
      // ignore invalid regex
    }
  } else {
    _singleWords.add(lower);
  }
}

/**
 * Check if text contains any blocked words.
 * Uses word-boundary matching so "adult" won't match inside "adulthood"
 * unless "adulthood" is itself on the list.
 */
export function containsBlockedWords(text: string | null | undefined): boolean {
  if (!text) return false;
  const lower = text.toLowerCase();

  // Check single words by splitting text into tokens
  const tokens = lower.split(/[^a-z0-9\-+]+/);
  for (const token of tokens) {
    if (_singleWords.has(token)) return true;
  }

  // Check multi-word phrases
  for (const rx of _multiWordPhrases) {
    if (rx.test(lower)) return true;
  }

  return false;
}

// ──────────────────────────────────────────────────────────────────────
// Adult ID Sets — populated via IPC from main process
// ──────────────────────────────────────────────────────────────────────
let _adultMovieIds: Set<number> = new Set();
let _adultTvIds: Set<number> = new Set();
let _adultIdsLoaded = false;

/**
 * Load adult IDs from the main process (TMDB Daily Exports).
 * Call once when a Kids profile is activated.
 */
export async function loadAdultIds(): Promise<void> {
  if (_adultIdsLoaded) return;
  try {
    const kf = (window as any).kidsFilter;
    if (!kf) return;
    const res = await kf.getAdultIds();
    if (res && res.movieIds) {
      _adultMovieIds = new Set(res.movieIds);
    }
    if (res && res.tvIds) {
      _adultTvIds = new Set(res.tvIds);
    }
    _adultIdsLoaded = true;
  } catch (e) {
    console.warn('kidsFilter: failed to load adult IDs', e);
  }
}

/** Check if a TMDB ID is on the adult export list */
export function isAdultId(tmdbId: number, mediaType?: string): boolean {
  if (!_adultIdsLoaded) return false;
  if (mediaType === 'tv') return _adultTvIds.has(tmdbId);
  if (mediaType === 'movie') return _adultMovieIds.has(tmdbId);
  // check both
  return _adultMovieIds.has(tmdbId) || _adultTvIds.has(tmdbId);
}

// ──────────────────────────────────────────────────────────────────────
// Kids mode state (set by App.tsx when account loads)
// ──────────────────────────────────────────────────────────────────────
let _isKidsMode = false;

export function setKidsMode(enabled: boolean) {
  _isKidsMode = enabled;
}

export function getKidsMode(): boolean {
  return _isKidsMode;
}

// ──────────────────────────────────────────────────────────────────────
// Content checking — Genre-first, layered filtering
//
// Priority order:  Certification  >  Genre  >  Keywords
//
// If a title carries a known certification the cert decides first.
// If cert is PG-13+ (or TV-14+), it NEVER reaches Kids, no matter the
// genre.  If cert is G / PG / TV-Y / TV-Y7 / TV-G / TV-PG the title
// is allowed and genres only refine it further.
//
// Genre tiers:
//   SAFE   – always allowed:  Animation, Family, Comedy, Adventure,
//            Music, Kids (TV)
//   HARD-BLOCK – always blocked:  Horror, Thriller, Crime, War,
//            Western, Documentary, War & Politics
//   CONDITIONAL – allowed only if cert ≤ PG AND item carries a safe
//            genre tag too:  Action, Drama, Mystery, Sci-Fi, Fantasy,
//            Romance, History, TV Movie, News, Reality, Talk, Soap
//   TOXIC COMBOS – blocked regardless:  Horror+Thriller, Crime+Drama
//
// After genres, blocked-word scanning on title + overview is the last
// pass.
// ──────────────────────────────────────────────────────────────────────

/** Certifications considered safe for kids (case-insensitive, checked uppercase) */
const KIDS_SAFE_CERTS = new Set([
  'G', 'PG',
  'TV-Y', 'TV-Y7', 'TV-Y7-FV', 'TV-G', 'TV-PG',
  'U', 'UC',               // UK
  '0+', '6+',              // Russia / others
  'AL', '6',               // Netherlands
  'ATP',                    // Argentina
  'L', '10', '12',         // Brazil
  'FSK 0', 'FSK 6',        // Germany
  'TOUS', 'TP',            // France / Portugal
  'A',                      // India CBFC — "Unrestricted"
]);

/** Certifications that are ALWAYS blocked for kids (anything PG-13 and above) */
const BLOCKED_CERTS = new Set([
  'PG-13', 'PG13',
  'R', 'NC-17', 'NC17',
  'TV-14', 'TV-MA',
  '13', '13+', '14', '14+', '15', '15+', '16', '16+',
  '18', '18+',
  'X', 'XXX',
  'UNRATED', 'NR', 'NOT RATED',
  'MA15+', 'R18+',          // Australia
  'FSK 12', 'FSK 16', 'FSK 18', // Germany
  'UA', 'UA 13+', 'UA 16+', 'S', // India CBFC
  'D', 'VM14', 'VM18',      // Italy
]);

// ── TMDB genre ID constants ──────────────────────────────────────────
// Movies
const GENRE_ACTION      = 28;
const GENRE_ADVENTURE   = 12;
const GENRE_ANIMATION   = 16;
const GENRE_COMEDY      = 35;
const GENRE_CRIME       = 80;
const GENRE_DOCUMENTARY = 99;
const GENRE_DRAMA       = 18;
const GENRE_FAMILY      = 10751;
const GENRE_FANTASY     = 14;
const GENRE_HISTORY     = 36;
const GENRE_HORROR      = 27;
const GENRE_MUSIC       = 10402;
const GENRE_MYSTERY     = 9648;
const GENRE_ROMANCE     = 10749;
const GENRE_SCIFI       = 878;
const GENRE_TV_MOVIE    = 10770;
const GENRE_THRILLER    = 53;
const GENRE_WAR         = 10752;
const GENRE_WESTERN     = 37;
// TV-only
const GENRE_TV_ACTION_ADVENTURE = 10759;
const GENRE_TV_KIDS     = 10762;
const GENRE_TV_NEWS     = 10763;
const GENRE_TV_REALITY  = 10764;
const GENRE_TV_SCIFI_FANTASY = 10765;
const GENRE_TV_SOAP     = 10766;
const GENRE_TV_TALK     = 10767;
const GENRE_TV_WAR_POLITICS = 10768;

/** Genres that are ALWAYS safe — content can pass with these alone */
const SAFE_GENRES = new Set([
  GENRE_ANIMATION,
  GENRE_FAMILY,
  GENRE_COMEDY,
  GENRE_ADVENTURE,
  GENRE_MUSIC,
  GENRE_TV_KIDS,
]);

/** Genres that are ALWAYS blocked in Kids — no exceptions */
const HARD_BLOCKED_GENRES = new Set([
  GENRE_HORROR,
  GENRE_THRILLER,
  GENRE_CRIME,
  GENRE_WAR,
  GENRE_WESTERN,
  GENRE_DOCUMENTARY,
  GENRE_TV_WAR_POLITICS,
]);

/** Genres that are conditionally blocked — allowed only when cert ≤ PG
 *  AND the item also carries at least one SAFE genre tag */
const CONDITIONAL_GENRES = new Set([
  GENRE_ACTION,
  GENRE_DRAMA,
  GENRE_MYSTERY,
  GENRE_SCIFI,
  GENRE_FANTASY,
  GENRE_ROMANCE,
  GENRE_HISTORY,
  GENRE_TV_MOVIE,
  GENRE_TV_NEWS,
  GENRE_TV_REALITY,
  GENRE_TV_TALK,
  GENRE_TV_SOAP,
  GENRE_TV_ACTION_ADVENTURE,
  GENRE_TV_SCIFI_FANTASY,
]);

/** Toxic genre combos — blocked regardless of certification */
const TOXIC_COMBOS: [number, number][] = [
  [GENRE_HORROR, GENRE_THRILLER],
  [GENRE_CRIME, GENRE_DRAMA],
  [GENRE_HORROR, GENRE_SCIFI],
  [GENRE_HORROR, GENRE_FANTASY],
  [GENRE_CRIME, GENRE_THRILLER],
  [GENRE_CRIME, GENRE_ACTION],
  [GENRE_WAR, GENRE_DRAMA],
  [GENRE_WAR, GENRE_ACTION],
  [GENRE_THRILLER, GENRE_MYSTERY],
  [GENRE_HORROR, GENRE_MYSTERY],
];

/** Extract genre IDs from a TMDB item (handles both genre_ids[] and genres[]) */
function extractGenreIds(item: any): Set<number> {
  const ids = new Set<number>();
  if (Array.isArray(item.genre_ids)) {
    for (const gid of item.genre_ids) ids.add(gid);
  }
  if (Array.isArray(item.genres)) {
    for (const g of item.genres) {
      if (typeof g === 'number') ids.add(g);
      else if (g && typeof g.id === 'number') ids.add(g.id);
    }
  }
  return ids;
}

/** Check if the item has a known kids-safe certification */
function hasSafeCert(item: any): boolean {
  const cert = (item.certification || '').toUpperCase().trim();
  return cert !== '' && KIDS_SAFE_CERTS.has(cert);
}

/** Check if the item has a cert that is explicitly blocked (PG-13+) */
function hasBlockedCert(item: any): boolean {
  const cert = (item.certification || '').toUpperCase().trim();
  return cert !== '' && BLOCKED_CERTS.has(cert);
}

/**
 * Returns true if a given movie/show item should be blocked for kids.
 *
 * Decision ladder (Certification > Genre > Keywords):
 *
 * 1. TMDB `adult` flag or adult-ID-export list → block
 * 2. Certification PG-13+ → block (no matter what genre)
 * 3. Certification ≤ PG   → allowed, but genres still refine
 * 4. Toxic genre combos   → block regardless
 * 5. Hard-blocked genres  → block
 * 6. Conditional genres without a safe companion genre → block
 *    (unless cert was explicitly safe — G/PG/TV-Y etc.)
 * 7. Blocked keywords in title/overview → block
 * 8. Everything else      → allow
 */
export function isContentBlocked(item: any): boolean {
  if (!_isKidsMode) return false;
  if (!item) return false;

  // ── Layer 0: absolute blocks ──────────────────────────────────────
  // TMDB adult flag
  if (item.adult === true) return true;

  // Adult-ID export list
  const id = item.id;
  if (typeof id === 'number') {
    const mt = item.media_type || (item.first_air_date ? 'tv' : 'movie');
    if (isAdultId(id, mt)) return true;
  }

  // ── Layer 1: Certification (highest priority) ─────────────────────
  const certKnown = (item.certification || '').trim() !== '';
  if (hasBlockedCert(item)) return true;                 // PG-13+ → always block
  const certSafe = hasSafeCert(item);                    // G/PG/TV-Y etc.

  // ── Layer 2: Genre analysis ───────────────────────────────────────
  const genres = extractGenreIds(item);

  if (genres.size > 0) {
    // 2a. Toxic combos → always block
    for (const [a, b] of TOXIC_COMBOS) {
      if (genres.has(a) && genres.has(b)) return true;
    }

    // 2b. Hard-blocked genres → always block
    for (const gid of genres) {
      if (HARD_BLOCKED_GENRES.has(gid)) return true;
    }

    // 2c. Conditional genres
    const hasConditional = [...genres].some(g => CONDITIONAL_GENRES.has(g));
    const hasSafe        = [...genres].some(g => SAFE_GENRES.has(g));

    if (hasConditional) {
      // If cert is known-safe (G/PG/TV-Y…) AND at least one safe genre
      // companion → allow the conditional genre through
      if (certSafe && hasSafe) {
        // passes — continue to keyword check below
      } else if (certSafe) {
        // Cert is safe but no safe genre companion
        // E.g. pure "Action" rated PG — still allow (cert wins)
        // passes — continue to keyword check below
      } else if (hasSafe) {
        // No cert info but has a safe companion (e.g. Animation + Action)
        // Allow through — companion genre signals it's kids-targeted
        // passes — continue to keyword check below
      } else {
        // No safe cert AND no safe companion genre → block
        return true;
      }
    }

    // 2d. If the item has ONLY unknown genres (not safe, not blocked,
    //     not conditional) and no cert, block to be safe
    const allUnknown = [...genres].every(
      g => !SAFE_GENRES.has(g) && !HARD_BLOCKED_GENRES.has(g) && !CONDITIONAL_GENRES.has(g)
    );
    if (allUnknown && !certSafe) return true;
  } else if (!certKnown) {
    // No genres AND no certification → too risky, block
    // BUT skip person results (media_type === 'person') — they don't have genres/cert
    // Also skip items that look like person results (have known_for_department or profile_path)
    const isPerson = item.media_type === 'person' || item.known_for_department || item.profile_path;
    if (!isPerson && (item.title || item.name)) return true;
  }

  // ── Layer 3: Keywords / blocked words (lowest priority) ───────────
  const title = item.title || item.name || '';
  const overview = item.overview || '';
  if (containsBlockedWords(title)) return true;
  if (containsBlockedWords(overview)) return true;

  return false;
}

/**
 * Filter an array of TMDB results, removing blocked items for kids mode.
 * If kids mode is OFF, returns the array unchanged.
 */
export function filterResults<T extends any>(items: T[]): T[] {
  if (!_isKidsMode) return items;
  if (!Array.isArray(items)) return items;
  return items.filter(item => !isContentBlocked(item));
}

// ── Genre name lookup for debugging ─────────────────────────────────
const GENRE_NAMES: Record<number, string> = {
  [GENRE_ACTION]: 'Action', [GENRE_ADVENTURE]: 'Adventure',
  [GENRE_ANIMATION]: 'Animation', [GENRE_COMEDY]: 'Comedy',
  [GENRE_CRIME]: 'Crime', [GENRE_DOCUMENTARY]: 'Documentary',
  [GENRE_DRAMA]: 'Drama', [GENRE_FAMILY]: 'Family',
  [GENRE_FANTASY]: 'Fantasy', [GENRE_HISTORY]: 'History',
  [GENRE_HORROR]: 'Horror', [GENRE_MUSIC]: 'Music',
  [GENRE_MYSTERY]: 'Mystery', [GENRE_ROMANCE]: 'Romance',
  [GENRE_SCIFI]: 'Science Fiction', [GENRE_TV_MOVIE]: 'TV Movie',
  [GENRE_THRILLER]: 'Thriller', [GENRE_WAR]: 'War',
  [GENRE_WESTERN]: 'Western',
  [GENRE_TV_ACTION_ADVENTURE]: 'Action & Adventure',
  [GENRE_TV_KIDS]: 'Kids', [GENRE_TV_NEWS]: 'News',
  [GENRE_TV_REALITY]: 'Reality', [GENRE_TV_SCIFI_FANTASY]: 'Sci-Fi & Fantasy',
  [GENRE_TV_SOAP]: 'Soap', [GENRE_TV_TALK]: 'Talk',
  [GENRE_TV_WAR_POLITICS]: 'War & Politics',
};

/**
 * Get a human-readable reason why content was blocked (for debugging/logging).
 * Mirrors the decision ladder in `isContentBlocked()`.
 */
export function getBlockReason(item: any): string | null {
  if (!item) return null;

  // Layer 0
  if (item.adult === true) return 'TMDB adult flag';
  const id = item.id;
  if (typeof id === 'number') {
    const mt = item.media_type || (item.first_air_date ? 'tv' : 'movie');
    if (isAdultId(id, mt)) return 'TMDB adult ID export list';
  }

  // Layer 1 — Certification
  if (hasBlockedCert(item)) {
    return `Blocked certification: ${(item.certification || '').toUpperCase()}`;
  }

  // Layer 2 — Genres
  const genres = extractGenreIds(item);
  const certSafe = hasSafeCert(item);

  if (genres.size > 0) {
    // Toxic combos
    for (const [a, b] of TOXIC_COMBOS) {
      if (genres.has(a) && genres.has(b)) {
        return `Toxic genre combo: ${GENRE_NAMES[a] || a} + ${GENRE_NAMES[b] || b}`;
      }
    }
    // Hard-blocked
    for (const gid of genres) {
      if (HARD_BLOCKED_GENRES.has(gid)) {
        return `Hard-blocked genre: ${GENRE_NAMES[gid] || gid}`;
      }
    }
    // Conditional without companion
    const conditionalIds = [...genres].filter(g => CONDITIONAL_GENRES.has(g));
    const hasSafe = [...genres].some(g => SAFE_GENRES.has(g));
    if (conditionalIds.length > 0 && !certSafe && !hasSafe) {
      const names = conditionalIds.map(g => GENRE_NAMES[g] || String(g)).join(', ');
      return `Conditional genre without safe companion: ${names}`;
    }
    // All unknown
    const allUnknown = [...genres].every(
      g => !SAFE_GENRES.has(g) && !HARD_BLOCKED_GENRES.has(g) && !CONDITIONAL_GENRES.has(g)
    );
    if (allUnknown && !certSafe) {
      return `Unknown genre(s) without safe certification`;
    }
  } else {
    const certKnown = (item.certification || '').trim() !== '';
    if (!certKnown && (item.title || item.name)) {
      return 'No genres and no certification — blocked for safety';
    }
  }

  // Layer 3 — Keywords
  const title = item.title || item.name || '';
  const overview = item.overview || '';
  if (containsBlockedWords(title)) return `Blocked word in title: "${title}"`;
  if (containsBlockedWords(overview)) return 'Blocked word in overview';

  return null;
}

/** Export the blocked words list so it can be displayed in settings if desired */
export function getBlockedWordsList(): string[] {
  return [...BLOCKED_WORDS];
}

// ──────────────────────────────────────────────────────────────────────
// UI helpers — genre list filtering & search query blocking
// ──────────────────────────────────────────────────────────────────────

/** TMDB genre IDs that should be completely hidden from kids in the UI
 *  (genre dropdowns, genre grids, genre rows).
 *  This includes both hard-blocked AND conditional genres that are too
 *  risky to even show as browsable categories. */
const KIDS_HIDDEN_GENRE_IDS = new Set([
  // Hard-blocked (movie)
  GENRE_HORROR,         // 27
  GENRE_THRILLER,       // 53
  GENRE_CRIME,          // 80
  GENRE_WAR,            // 10752
  GENRE_WESTERN,        // 37
  GENRE_DOCUMENTARY,    // 99
  // Hard-blocked (TV)
  GENRE_TV_WAR_POLITICS, // 10768
  // Conditional — still too risky to browse as a category
  GENRE_MYSTERY,        // 9648
  GENRE_ROMANCE,        // 10749
  GENRE_HISTORY,        // 36
  GENRE_TV_MOVIE,       // 10770
  GENRE_TV_NEWS,        // 10763
  GENRE_TV_REALITY,     // 10764
  GENRE_TV_TALK,        // 10767
  GENRE_TV_SOAP,        // 10766
]);

/**
 * Filter a list of TMDB genre objects ({id, name}) for kids mode.
 * Removes genres that kids should not browse.
 * If kids mode is OFF, returns the list unchanged.
 */
export function filterGenresForKids(genres: { id: number; name: string }[]): { id: number; name: string }[] {
  if (!_isKidsMode) return genres;
  return genres.filter(g => !KIDS_HIDDEN_GENRE_IDS.has(g.id));
}

/**
 * Check if a search query should be blocked for kids.
 * Returns true if the query contains blocked words (erotic, porn, etc.)
 */
export function isSearchQueryBlocked(query: string): boolean {
  if (!_isKidsMode) return false;
  if (!query || query.trim().length === 0) return false;
  return containsBlockedWords(query.trim());
}

/**
 * Returns the set of genre IDs that should be hidden from kids in UI.
 */
export function getHiddenGenreIds(): Set<number> {
  return new Set(KIDS_HIDDEN_GENRE_IDS);
}
