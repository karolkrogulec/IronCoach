// IronCoach AI - Mobile PWA Engine (v12)

const STATE = {
  plans: JSON.parse(localStorage.getItem('iron_plans')) || [
    {
      id: 'default-1',
      name: 'Push (Klatka + Barki + Triceps)',
      description: 'Przykładowy plan z superserią',
      restSeconds: 90,
      supersetRestSeconds: 30,
      exercises: [
        { name: 'Wyciskanie sztangi leżąc', sets: 4, reps: 8, weight: 80, muscle: 'Klatka', supersetGroup: '' },
        { name: 'Wyciskanie hantli skos dodatni', sets: 3, reps: 10, weight: 26, muscle: 'Klatka', supersetGroup: '' },
        { name: 'Wyciskanie żołnierskie OHP', sets: 3, reps: 8, weight: 50, muscle: 'Barki', supersetGroup: '' },
        { name: 'Wznosy bokiem z hantlami', sets: 3, reps: 12, weight: 12, muscle: 'Barki', supersetGroup: 'A' },
        { name: 'Prostowanie ramion na wyciągu', sets: 3, reps: 12, weight: 30, muscle: 'Triceps', supersetGroup: 'A' }
      ]
    }
  ],
  history: JSON.parse(localStorage.getItem('iron_history')) || [],
  activeWorkout: JSON.parse(localStorage.getItem('iron_active_workout')) || null,
  apiKey: localStorage.getItem('iron_gemini_api_key') || '',
  timerInterval: null,
  timerSeconds: 0,
  currentRestInfo: null,
  workoutDurationInterval: null,
  wakeLockSentinel: null,
  parsedKeepPlans: null,
  exerciseGifs: [],
  coachChat: JSON.parse(localStorage.getItem('iron_coach_chat')) || []
};

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  registerServiceWorker();
  checkSharedParams();
  loadApiKey();
  loadExerciseGifsDatabase();
  renderPlans();
  renderRecentWorkouts();
  checkActiveWorkout();
  renderCoachChat();
  setupWakeLockVisibilityListener();
});

async function loadExerciseGifsDatabase() {
  try {
    const res = await fetch('./exercises_db.json');
    if (res.ok) {
      STATE.exerciseGifs = await res.json();
    }
  } catch (e) {
    console.warn('Failed to load local exercise GIFs db', e);
  }
}

// ============================================================================
// WAKE LOCK API (Prevent screen from sleeping during active workout)
// ============================================================================
async function requestWakeLock() {
  const badge = document.getElementById('wake-lock-badge');
  if (!('wakeLock' in navigator)) {
    if (badge) badge.textContent = '🔆 Ekran (brak wsparcia przeglądarki)';
    return;
  }
  try {
    if (STATE.wakeLockSentinel) return;
    STATE.wakeLockSentinel = await navigator.wakeLock.request('screen');
    if (badge) {
      badge.textContent = '🔆 Ekran nie wygasa';
      badge.style.color = 'var(--success)';
    }
    STATE.wakeLockSentinel.addEventListener('release', () => {
      STATE.wakeLockSentinel = null;
    });
  } catch (err) {
    console.warn('WakeLock request failed:', err);
  }
}

async function releaseWakeLock() {
  try {
    if (STATE.wakeLockSentinel) {
      await STATE.wakeLockSentinel.release();
      STATE.wakeLockSentinel = null;
    }
  } catch (err) {
    console.warn('WakeLock release failed:', err);
  }
}

function setupWakeLockVisibilityListener() {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && STATE.activeWorkout) {
      requestWakeLock();
      updateWorkoutDurationCounter();
    }
  });
}

// ============================================================================
// EXERCISE GIF MATCHING (Abbreviations, Polish -> English, Smart Scorer + AI)
// ============================================================================

// Verified exact slugs from exercises_db.json (1323 exercises)
const EXERCISE_SLUG_MAP = {
  // Abbreviations & English Classics
  'rdl': 'barbell-romanian-deadlift',
  'romanian deadlift': 'barbell-romanian-deadlift',
  'romanian dead lift': 'barbell-romanian-deadlift',
  'dumbbell rdl': 'dumbbell-romanian-deadlift',
  'db rdl': 'dumbbell-romanian-deadlift',
  'sldl': 'dumbbell-stiff-leg-deadlift',
  'stiff leg deadlift': 'dumbbell-stiff-leg-deadlift',
  'stiff leg': 'dumbbell-stiff-leg-deadlift',
  'deadlift': 'barbell-deadlift',
  'sumo deadlift': 'barbell-sumo-deadlift',
  'back squat': 'barbell-full-squat',
  'barbell squat': 'barbell-full-squat',
  'high bar squat': 'barbell-high-bar-squat',
  'low bar squat': 'barbell-low-bar-squat',
  'front squat': 'barbell-front-squat',
  'goblet squat': 'dumbbell-goblet-squat',
  'zercher squat': 'barbell-zercher-squat',
  'hack squat': 'barbell-hack-squat',
  'split squat': 'barbell-single-leg-split-squat',
  'bulgarian split squat': 'barbell-single-leg-split-squat',
  'bulgarian squat': 'barbell-single-leg-split-squat',
  'bss': 'barbell-single-leg-split-squat',
  'squat': 'barbell-full-squat',
  'leg press': 'sled-45-leg-press',
  'leg extension': 'lever-leg-extension',
  'leg curl': 'lever-seated-leg-curl',
  'lying leg curl': 'lever-lying-leg-curl',
  'seated leg curl': 'lever-seated-leg-curl',
  'hip thrust': 'barbell-glute-bridge',
  'glute bridge': 'barbell-glute-bridge',
  'calf raise': 'barbell-standing-calf-raise',
  'standing calf raise': 'barbell-standing-calf-raise',
  'seated calf raise': 'barbell-seated-calf-raise',
  'lunge': 'dumbbell-lunge',
  'lunges': 'dumbbell-lunge',
  'barbell lunge': 'barbell-lunge',

  // Chest (English & Abbreviations)
  'bench press': 'barbell-bench-press',
  'bp': 'barbell-bench-press',
  'flat bench press': 'barbell-bench-press',
  'incline bench press': 'barbell-incline-bench-press',
  'incline press': 'dumbbell-incline-bench-press',
  'incline dumbbell press': 'dumbbell-incline-bench-press',
  'db bench press': 'dumbbell-bench-press',
  'dumbbell bench press': 'dumbbell-bench-press',
  'decline bench press': 'barbell-decline-bench-press',
  'close grip bench press': 'barbell-close-grip-bench-press',
  'cgbp': 'barbell-close-grip-bench-press',
  'chest fly': 'dumbbell-fly',
  'dumbbell fly': 'dumbbell-fly',
  'incline fly': 'dumbbell-incline-fly',
  'cable fly': 'cable-standing-up-straight-crossovers',
  'cable crossover': 'cable-standing-up-straight-crossovers',
  'push up': 'push-up',
  'pushup': 'push-up',
  'push-up': 'push-up',
  'dips': 'chest-dip',
  'dip': 'chest-dip',
  'chest dip': 'chest-dip',

  // Back (English)
  'pull up': 'pull-up',
  'pullup': 'pull-up',
  'pull-up': 'pull-up',
  'chin up': 'chin-up',
  'chinup': 'chin-up',
  'chin-up': 'chin-up',
  'lat pulldown': 'cable-lat-pulldown-full-range-of-motion',
  'pulldown': 'cable-pulldown',
  'straight arm pulldown': 'cable-straight-arm-pulldown',
  'barbell row': 'barbell-bent-over-row',
  'bent over row': 'barbell-bent-over-row',
  'pendlay row': 'barbell-bent-over-row',
  'dumbbell row': 'dumbbell-one-arm-bent-over-row',
  'one arm row': 'dumbbell-one-arm-bent-over-row',
  't-bar row': 'lever-t-bar-row',
  't bar row': 'lever-t-bar-row',
  'seated row': 'cable-seated-row',
  'cable row': 'cable-seated-row',

  // Shoulders (English & Abbreviations)
  'ohp': 'barbell-standing-wide-military-press',
  'overhead press': 'barbell-standing-wide-military-press',
  'military press': 'barbell-standing-wide-military-press',
  'shoulder press': 'dumbbell-seated-shoulder-press',
  'db shoulder press': 'dumbbell-seated-shoulder-press',
  'arnold press': 'dumbbell-arnold-press',
  'lateral raise': 'dumbbell-lateral-raise',
  'side lateral raise': 'dumbbell-lateral-raise',
  'cable lateral raise': 'cable-lateral-raise',
  'face pull': 'cable-rear-delt-row-with-rope',
  'facepull': 'cable-rear-delt-row-with-rope',
  'rear delt fly': 'dumbbell-rear-lateral-raise',
  'upright row': 'barbell-upright-row',
  'shrugs': 'barbell-shrug',
  'shrug': 'barbell-shrug',

  // Arms & Core (English)
  'barbell curl': 'barbell-curl',
  'bb curl': 'barbell-curl',
  'ez bar curl': 'ez-barbell-curl',
  'dumbbell curl': 'dumbbell-biceps-curl',
  'bicep curl': 'dumbbell-biceps-curl',
  'biceps curl': 'dumbbell-biceps-curl',
  'hammer curl': 'dumbbell-hammer-curl',
  'incline curl': 'dumbbell-incline-biceps-curl',
  'preacher curl': 'ez-barbell-close-grip-preacher-curl',
  'tricep pushdown': 'cable-pushdown',
  'triceps pushdown': 'cable-pushdown',
  'rope pushdown': 'cable-pushdown-with-rope-attachment',
  'skull crusher': 'barbell-lying-triceps-extension-skull-crusher',
  'skullcrusher': 'barbell-lying-triceps-extension-skull-crusher',
  'french press': 'barbell-lying-triceps-extension',
  'overhead triceps extension': 'dumbbell-standing-triceps-extension',
  'plank': 'front-plank-with-twist',
  'hanging leg raise': 'hanging-leg-raise',
  'cable crunch': 'cable-kneeling-crunch',
  'russian twist': 'weighted-russian-twist',

  // Klatka (Polish)
  'wyciskanie sztangi leżąc': 'barbell-bench-press',
  'wyciskanie sztangi lezac': 'barbell-bench-press',
  'wyciskanie leżąc': 'barbell-bench-press',
  'wyciskanie lezac': 'barbell-bench-press',
  'wyciskanie na płaskiej': 'barbell-bench-press',
  'wyciskanie na plaskiej': 'barbell-bench-press',
  'wyciskanie hantli leżąc': 'dumbbell-bench-press',
  'wyciskanie hantli lezac': 'dumbbell-bench-press',
  'wyciskanie hantli płasko': 'dumbbell-bench-press',
  'wyciskanie hantli skos': 'dumbbell-incline-bench-press',
  'wyciskanie hantli skos dodatni': 'dumbbell-incline-bench-press',
  'wyciskanie sztangi skos': 'barbell-incline-bench-press',
  'wyciskanie sztangi skos dodatni': 'barbell-incline-bench-press',
  'wyciskanie wąsko': 'barbell-close-grip-bench-press',
  'wyciskanie wasko': 'barbell-close-grip-bench-press',
  'rozpiętki brama': 'cable-standing-up-straight-crossovers',
  'rozpietki brama': 'cable-standing-up-straight-crossovers',
  'rozpiętki na bramie': 'cable-standing-up-straight-crossovers',
  'krzyżowanie linek': 'cable-standing-up-straight-crossovers',
  'rozpiętki skos': 'dumbbell-incline-fly',
  'rozpiętki': 'dumbbell-fly',
  'rozpietki': 'dumbbell-fly',
  'pompki na poręczach': 'chest-dip',
  'pompki na poreczach': 'chest-dip',
  'dipy': 'chest-dip',
  'pompki': 'push-up',

  // Plecy (Polish)
  'martwy ciąg rumuński': 'barbell-romanian-deadlift',
  'martwy ciag rumunski': 'barbell-romanian-deadlift',
  'rumuński martwy ciąg': 'barbell-romanian-deadlift',
  'rumunski martwy ciag': 'barbell-romanian-deadlift',
  'rumuński': 'barbell-romanian-deadlift',
  'rumunski': 'barbell-romanian-deadlift',
  'martwy ciąg na prostych': 'dumbbell-stiff-leg-deadlift',
  'martwy ciag na prostych': 'dumbbell-stiff-leg-deadlift',
  'martwy ciąg sumo': 'barbell-sumo-deadlift',
  'martwy ciag sumo': 'barbell-sumo-deadlift',
  'martwy ciąg': 'barbell-deadlift',
  'martwy ciag': 'barbell-deadlift',
  'wiosłowanie sztangą': 'barbell-bent-over-row',
  'wioslowanie sztanga': 'barbell-bent-over-row',
  'wiosłowanie w opadzie': 'barbell-bent-over-row',
  'wiosłowanie hantlem': 'dumbbell-one-arm-bent-over-row',
  'wioslowanie hantlem': 'dumbbell-one-arm-bent-over-row',
  'wiosłowanie półsztangą': 'lever-t-bar-row',
  'wiosłowanie na wyciągu': 'cable-seated-row',
  'wioslowanie na wyciagu': 'cable-seated-row',
  'przyciąganie linki wyciągu dolnego': 'cable-seated-row',
  'wiosłowanie': 'barbell-bent-over-row',
  'podciąganie podchwytem': 'chin-up',
  'podciaganie podchwytem': 'chin-up',
  'podciąganie nachwytem': 'pull-up',
  'podciaganie nachwytem': 'pull-up',
  'podciąganie': 'pull-up',
  'podciaganie': 'pull-up',
  'ściąganie drążka': 'cable-lat-pulldown-full-range-of-motion',
  'sciaganie drazka': 'cable-lat-pulldown-full-range-of-motion',
  'ściąganie wyciągu': 'cable-lat-pulldown-full-range-of-motion',
  'sciaganie wyciagu': 'cable-lat-pulldown-full-range-of-motion',
  'narciarz': 'cable-straight-arm-pulldown',

  // Nogi (Polish)
  'przysiad przedni': 'barbell-front-squat',
  'przysiady bułgarskie': 'barbell-single-leg-split-squat',
  'przysiady bulgarskie': 'barbell-single-leg-split-squat',
  'przysiad bułgarski': 'barbell-single-leg-split-squat',
  'przysiad bulgarski': 'barbell-single-leg-split-squat',
  'bułgary': 'barbell-single-leg-split-squat',
  'bulgary': 'barbell-single-leg-split-squat',
  'przysiad ze sztangą': 'barbell-full-squat',
  'przysiad ze sztanga': 'barbell-full-squat',
  'przysiady ze sztangą': 'barbell-full-squat',
  'przysiad': 'barbell-full-squat',
  'przysiady': 'barbell-full-squat',
  'suwnica': 'sled-45-leg-press',
  'wypychanie na suwnicy': 'sled-45-leg-press',
  'wypychanie nóg': 'sled-45-leg-press',
  'wypychanie nog': 'sled-45-leg-press',
  'wyprosty nóg': 'lever-leg-extension',
  'wyprosty nog': 'lever-leg-extension',
  'prostowanie nóg na maszynie': 'lever-leg-extension',
  'uginanie nóg leżąc': 'lever-lying-leg-curl',
  'uginanie nog lezac': 'lever-lying-leg-curl',
  'uginanie nóg siedząc': 'lever-seated-leg-curl',
  'uginanie nóg': 'lever-seated-leg-curl',
  'uginanie nog': 'lever-seated-leg-curl',
  'wspięcia na palce stojąc': 'barbell-standing-calf-raise',
  'wspięcia na palce siedząc': 'barbell-seated-calf-raise',
  'wspięcia na palce': 'barbell-standing-calf-raise',
  'wspiecia na palce': 'barbell-standing-calf-raise',
  'łydki': 'barbell-standing-calf-raise',
  'lydki': 'barbell-standing-calf-raise',
  'wykroki': 'dumbbell-lunge',
  'zakroki': 'dumbbell-lunge',
  'wznosy bioder': 'barbell-glute-bridge',

  // Barki (Polish)
  'wyciskanie żołnierskie': 'barbell-standing-wide-military-press',
  'wyciskanie zolnierskie': 'barbell-standing-wide-military-press',
  'wyciskanie nad głowę': 'barbell-standing-wide-military-press',
  'wyciskanie nad glowe': 'barbell-standing-wide-military-press',
  'wyciskanie hantli siedząc': 'dumbbell-seated-shoulder-press',
  'wyciskanie na barki': 'dumbbell-seated-shoulder-press',
  'arnoldki': 'dumbbell-arnold-press',
  'wznosy bokiem na bramie': 'cable-lateral-raise',
  'wznosy bokiem na wyciągu': 'cable-lateral-raise',
  'wznosy bokiem': 'dumbbell-lateral-raise',
  'wznosy ramion bokiem': 'dumbbell-lateral-raise',
  'odwodzenie ramion w bok': 'dumbbell-lateral-raise',
  'wznosy w opadzie': 'dumbbell-rear-lateral-raise',
  'tył barku': 'dumbbell-rear-lateral-raise',
  'tyl barku': 'dumbbell-rear-lateral-raise',
  'podciąganie sztangi wzdłuż tułowia': 'barbell-upright-row',
  'szrugsy': 'barbell-shrug',
  'kaptury': 'barbell-shrug',

  // Ramiona & Brzuch (Polish)
  'uginanie ze sztangą łamaną': 'ez-barbell-curl',
  'uginanie ze sztanga lamana': 'ez-barbell-curl',
  'uginanie ze sztangą': 'barbell-curl',
  'uginanie ze sztanga': 'barbell-curl',
  'uginanie ramion ze sztangą': 'barbell-curl',
  'uginanie młotkowe': 'dumbbell-hammer-curl',
  'uginanie mlotkowe': 'dumbbell-hammer-curl',
  'młotki': 'dumbbell-hammer-curl',
  'mlotki': 'dumbbell-hammer-curl',
  'modlitewnik': 'ez-barbell-close-grip-preacher-curl',
  'uginanie z hantlami': 'dumbbell-biceps-curl',
  'uginanie ramion z hantlami': 'dumbbell-biceps-curl',
  'uginanie ramion': 'dumbbell-biceps-curl',
  'biceps': 'dumbbell-biceps-curl',
  'prostowanie ramion z linką': 'cable-pushdown-with-rope-attachment',
  'prostowanie na wyciągu': 'cable-pushdown',
  'prostowanie na wyciagu': 'cable-pushdown',
  'prostowanie ramion na wyciągu': 'cable-pushdown',
  'prostowanie ramion': 'cable-pushdown',
  'triceps wyciąg': 'cable-pushdown',
  'wyciskanie francuskie': 'barbell-lying-triceps-extension-skull-crusher',
  'francuskie': 'barbell-lying-triceps-extension-skull-crusher',
  'allahy': 'cable-kneeling-crunch',
  'allachy': 'cable-kneeling-crunch',
  'brzuszki na wyciągu': 'cable-kneeling-crunch',
  'unoszenie nóg w zwisie': 'hanging-leg-raise',
  'unoszenie nog w zwisie': 'hanging-leg-raise',
  'deska': 'front-plank-with-twist'
};

// Polish-to-English token dictionary for smart fallback matching
const PL_TO_EN_TOKENS = {
  'przysiad': 'squat', 'przysiady': 'squat',
  'bułgarski': 'split squat', 'bulgarski': 'split squat', 'bułgarskie': 'split squat',
  'przedni': 'front', 'tylny': 'full',
  'martwy': 'deadlift', 'ciąg': 'deadlift', 'ciag': 'deadlift',
  'rumuński': 'romanian', 'rumunski': 'romanian',
  'rdl': 'romanian deadlift',
  'wyciskanie': 'press',
  'leżąc': 'bench', 'lezac': 'bench', 'płasko': 'bench', 'plasko': 'bench',
  'skos': 'incline', 'dodatni': 'incline', 'ujemny': 'decline',
  'żołnierskie': 'military press', 'zolnierskie': 'military press', 'ohp': 'military press',
  'sztanga': 'barbell', 'sztangi': 'barbell', 'sztangą': 'barbell', 'sztanga': 'barbell',
  'hantle': 'dumbbell', 'hantli': 'dumbbell', 'hantlami': 'dumbbell', 'hantlem': 'dumbbell',
  'wyciąg': 'cable', 'wyciag': 'cable', 'wyciągu': 'cable', 'brama': 'cable', 'bramie': 'cable', 'linki': 'cable', 'linką': 'rope',
  'maszyna': 'lever', 'maszynie': 'lever',
  'wiosłowanie': 'bent over row', 'wioslowanie': 'bent over row',
  'podciąganie': 'pull-up', 'podciaganie': 'pull-up',
  'ściąganie': 'pulldown', 'sciaganie': 'pulldown', 'drążka': 'lat pulldown',
  'rozpiętki': 'fly', 'rozpietki': 'fly',
  'pompki': 'push-up', 'poręczach': 'chest dip', 'dips': 'chest dip',
  'uginanie': 'curl', 'młotkowe': 'hammer curl', 'mlotkowe': 'hammer curl',
  'prostowanie': 'pushdown', 'francuskie': 'triceps extension',
  'wznosy': 'lateral raise', 'bokiem': 'lateral raise',
  'wykroki': 'lunge', 'zakroki': 'lunge',
  'suwnica': 'leg press', 'suwnicy': 'leg press',
  'łydki': 'calf raise', 'lydki': 'calf raise', 'wspięcia': 'calf raise', 'wspiecia': 'calf raise',
  'brzuszki': 'crunch', 'allahy': 'kneeling crunch'
};

function findExerciseGif(name) {
  if (!name || !STATE.exerciseGifs || STATE.exerciseGifs.length === 0) return null;
  const clean = name.toLowerCase()
    .replace(/[^a-z0-9ąćęłńóśźż\s-]/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  // 1. Check custom saved mapping in localStorage
  const savedMappings = JSON.parse(localStorage.getItem('iron_custom_gif_map') || '{}');
  if (savedMappings[name] || savedMappings[clean]) {
    const targetSlug = savedMappings[name] || savedMappings[clean];
    const found = STATE.exerciseGifs.find(item => item.s === targetSlug || item.n.toLowerCase() === targetSlug.toLowerCase());
    if (found) return found;
  }

  // 2. Check exact key or longest matching phrase in EXERCISE_SLUG_MAP
  // Sort keys by length descending so more specific phrases ("martwy ciąg rumuński", "back squat") match before shorter ones ("martwy ciąg", "squat")
  const sortedKeys = Object.keys(EXERCISE_SLUG_MAP).sort((a, b) => b.length - a.length);
  for (const key of sortedKeys) {
    // Match either exact string or whole word/phrase boundary
    const regex = new RegExp(`(^|\\s|-)${key.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')}(\\s|-|$)`, 'i');
    if (clean === key || regex.test(clean)) {
      const slug = EXERCISE_SLUG_MAP[key];
      const exactItem = STATE.exerciseGifs.find(item => item.s === slug);
      if (exactItem) return exactItem;
      const partialItem = STATE.exerciseGifs.find(item => item.s.includes(slug));
      if (partialItem) return partialItem;
    }
  }

  // 3. Direct slug or English name match in database
  const directSlug = clean.replace(/\s+/g, '-');
  const direct = STATE.exerciseGifs.find(item => item.s === directSlug || item.n.toLowerCase() === clean);
  if (direct) return direct;

  // 4. Smart token translation & scoring algorithm
  const rawWords = clean.split(/[\s-]+/).filter(w => w.length > 1);
  const englishTokens = new Set();
  rawWords.forEach(w => {
    if (PL_TO_EN_TOKENS[w]) {
      PL_TO_EN_TOKENS[w].split(/\s+/).forEach(t => englishTokens.add(t));
    } else if (/^[a-z0-9]+$/.test(w)) {
      englishTokens.add(w);
    }
  });

  // Handle common English synonyms
  if (englishTokens.has('back') && englishTokens.has('squat')) {
    englishTokens.delete('back');
    englishTokens.add('barbell');
    englishTokens.add('full');
  }
  if (englishTokens.has('rdl')) {
    englishTokens.delete('rdl');
    englishTokens.add('romanian');
    englishTokens.add('deadlift');
  }

  const tokenArr = Array.from(englishTokens);
  if (tokenArr.length > 0) {
    let bestItem = null;
    let bestScore = 0;
    const penaltyWords = ['band', 'ball', 'bosu', 'assisted', 'stretch', 'yoga', 'kneeling', 'one-arm', 'one-leg', 'single-leg', 'jump', 'smith', 'kettlebell'];

    for (const item of STATE.exerciseGifs) {
      const slugParts = item.s.split('-');
      let matchedTokens = 0;
      for (const tok of tokenArr) {
        if (slugParts.includes(tok) || item.s.includes(tok)) {
          matchedTokens++;
        }
      }
      if (matchedTokens === 0) continue;

      let score = matchedTokens * 15;
      // Bonus if all query tokens matched
      if (matchedTokens === tokenArr.length) score += 25;
      // Bonus for standard equipment if not specified otherwise
      if (slugParts[0] === 'barbell' || slugParts[0] === 'dumbbell' || slugParts[0] === 'cable') score += 6;
      // Penalty for exotic variations unless user asked for them
      for (const pen of penaltyWords) {
        if (item.s.includes(pen) && !tokenArr.includes(pen)) {
          score -= 12;
        }
      }
      // Prefer shorter, canonical slugs
      score -= slugParts.length * 1.2;

      if (score > bestScore) {
        bestScore = score;
        bestItem = item;
      }
    }

    if (bestItem && bestScore >= 12) {
      return bestItem;
    }
  }

  return null;
}

// Background Gemini AI matcher for unrecognized exercise names
async function autoMatchGifWithGemini(exerciseName) {
  if (!STATE.apiKey || !STATE.exerciseGifs || STATE.exerciseGifs.length === 0) return null;
  const instr = document.getElementById('gif-modal-instructions');
  if (instr) {
    instr.innerHTML = `<div style="color: var(--accent); padding: 10px;">🤖 Agent AI tłumaczy i dopasowuje ćwiczenie "${escapeHtml(exerciseName)}" do bazy 1320 animacji...</div>`;
  }

  try {
    const prompt = `
Jesteś ekspertem biomechaniki i siłowni. Użytkownik ma ćwiczenie o nazwie: "${exerciseName}" (może być po polsku, angielsku lub skrótem typu RDL, OHP, BSS, Back Squat).
Przetłumacz je na standardową angielską nazwę w formacie slug używanym w bazie ExerciseDB (np. barbell-full-squat, barbell-romanian-deadlift, barbell-bench-press, dumbbell-incline-bench-press, cable-lat-pulldown-full-range-of-motion, dumbbell-lateral-raise, cable-pushdown, barbell-bent-over-row, pull-up, barbell-single-leg-split-squat).
Zwróć wyłącznie 3 najbardziej pasujące angielskie słowa kluczowe oddzielone spacją (bez żadnych innych słów, np. "barbell romanian deadlift").`;

    const keywordsRaw = await callGemini(prompt, 'fast');
    const kw = keywordsRaw.toLowerCase().replace(/[^a-z\s-]/g, ' ').trim();
    const match = findExerciseGif(kw);
    if (match) {
      selectCustomGif(match.s);
      return match;
    }
  } catch (e) {
    console.warn('AI GIF matching failed:', e);
  }
  return null;
}

let currentModalExerciseName = '';

function openGifModal(exerciseName) {
  currentModalExerciseName = exerciseName;
  const match = findExerciseGif(exerciseName);
  const modal = document.getElementById('gif-preview-modal');
  const title = document.getElementById('gif-modal-title');
  const img = document.getElementById('gif-modal-img');
  const instr = document.getElementById('gif-modal-instructions');
  const searchInput = document.getElementById('gif-search-input');
  if (searchInput) searchInput.value = '';

  title.textContent = exerciseName;

  if (match && match.g) {
    img.src = match.g;
    img.style.display = 'block';
    instr.innerHTML = `
      <div style="color: var(--primary); font-weight: 700; margin-bottom: 4px;">🎬 ${escapeHtml(match.n)}</div>
      <div style="font-size: 12px; color: var(--text-muted); margin-bottom: 8px;">Partia: ${escapeHtml(match.m || '')}</div>
      ${(match.i || []).map(step => `<li style="margin-bottom: 3px; font-size: 12px;">${escapeHtml(step)}</li>`).join('')}
    `;
  } else {
    img.style.display = 'none';
    instr.innerHTML = `
      <p style="color: var(--text-muted); margin: 10px 0; font-size: 13px;">Nie dopasowano jeszcze animacji dla tej nazwy.</p>
      <div style="display: flex; flex-direction: column; gap: 8px; margin-bottom: 12px;">
        <button class="btn btn-accent btn-sm" style="width: 100%; padding: 10px;" onclick="autoMatchGifWithGemini('${escapeHtml(exerciseName)}')">
          🤖 Dopasuj automatycznie przez Gemini AI
        </button>
        <a href="https://www.youtube.com/results?search_query=ćwiczenie+${encodeURIComponent(exerciseName)}+technika" target="_blank" class="btn btn-secondary btn-sm" style="width: 100%; padding: 10px; text-decoration: none;">
          ▶ Zobacz technikę na YouTube
        </a>
      </div>
    `;
    // Automatically trigger Gemini matching if API key is present
    if (STATE.apiKey) {
      autoMatchGifWithGemini(exerciseName);
    }
  }

  modal.style.display = 'flex';
}

function handleGifSearch(query) {
  const q = query.toLowerCase().trim();
  const resultsBox = document.getElementById('gif-search-results');
  if (!q || q.length < 2) {
    resultsBox.style.display = 'none';
    return;
  }

  const matches = STATE.exerciseGifs.filter(item => 
    item.n.toLowerCase().includes(q) || item.s.includes(q.replace(/\s+/g, '-'))
  ).slice(0, 10);

  if (matches.length === 0) {
    resultsBox.innerHTML = '<div style="padding: 8px; font-size: 12px; color: var(--text-muted);">Brak wyników w bazie.</div>';
    resultsBox.style.display = 'block';
    return;
  }

  resultsBox.innerHTML = matches.map(m => `
    <div onclick="selectCustomGif('${escapeHtml(m.s)}')" style="padding: 8px; border-bottom: 1px solid var(--border); cursor: pointer; text-align: left; font-size: 13px;">
      <b>${escapeHtml(m.n)}</b> <span style="font-size: 11px; color: var(--text-muted);">(${escapeHtml(m.m)})</span>
    </div>
  `).join('');
  resultsBox.style.display = 'block';
}

function selectCustomGif(slug) {
  const match = STATE.exerciseGifs.find(item => item.s === slug);
  if (!match) return;

  const savedMappings = JSON.parse(localStorage.getItem('iron_custom_gif_map') || '{}');
  savedMappings[currentModalExerciseName] = slug;
  localStorage.setItem('iron_custom_gif_map', JSON.stringify(savedMappings));

  const img = document.getElementById('gif-modal-img');
  const instr = document.getElementById('gif-modal-instructions');
  const resultsBox = document.getElementById('gif-search-results');
  if (resultsBox) resultsBox.style.display = 'none';

  img.src = match.g;
  img.style.display = 'block';
  instr.innerHTML = `
    <div style="color: var(--success); font-weight: 700; margin-bottom: 4px;">✅ Przypisano: ${escapeHtml(match.n)}</div>
    ${(match.i || []).map(step => `<li style="margin-bottom: 3px; font-size: 12px;">${escapeHtml(step)}</li>`).join('')}
  `;
}

function closeGifModal() {
  const modal = document.getElementById('gif-preview-modal');
  modal.style.display = 'none';
  const img = document.getElementById('gif-modal-img');
  img.src = '';
}

// ============================================================================
// SERVICE WORKER & NAVIGATION
// ============================================================================
function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(console.error);
  }
}

function showView(viewName) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(btn => btn.classList.remove('active'));
  
  const target = document.getElementById(`view-${viewName}`);
  if (target) target.classList.add('active');

  const navMap = { 'home': 0, 'import-keep': 1, 'coach': 2, 'settings': 3 };
  const navBtns = document.querySelectorAll('.bottom-nav .nav-item');
  if (navMap[viewName] !== undefined && navBtns[navMap[viewName]]) {
    navBtns[navMap[viewName]].classList.add('active');
  }

  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function checkSharedParams() {
  const params = new URLSearchParams(window.location.search);
  const sharedText = params.get('text') || params.get('title');
  if (sharedText) {
    const keepInput = document.getElementById('keep-text-input');
    if (keepInput) keepInput.value = sharedText;
    showView('import-keep');
  }
}

// ============================================================================
// DASHBOARD: PLANS & WORKOUT HISTORY
// ============================================================================
function renderPlans() {
  const container = document.getElementById('plans-list');
  if (!container) return;

  if (STATE.plans.length === 0) {
    container.innerHTML = `<p style="color: var(--text-muted); font-size: 14px;">Brak planów. Zaimportuj notatkę z Keep lub kliknij 'Nowy Plan'!</p>`;
    return;
  }

  container.innerHTML = STATE.plans.map(plan => {
    const restSec = plan.restSeconds || 90;
    const ssRestSec = plan.supersetRestSeconds || 30;
    const hasSupersets = (plan.exercises || []).some(e => e.supersetGroup);
    return `
      <div class="card">
        <div class="card-title">
          <span>${escapeHtml(plan.name)}</span>
          <button class="btn btn-sm btn-primary" onclick="startWorkout('${plan.id}')">▶ Start</button>
        </div>
        <p style="color: var(--text-muted); font-size: 13px; margin-bottom: 6px;">
          ${(plan.exercises || []).length} ćwiczeń • Przerwa: ${restSec}s ${hasSupersets ? `(w SS: ${ssRestSec}s)` : ''}
          ${plan.description ? ' • ' + escapeHtml(plan.description) : ''}
        </p>
        <div style="display: flex; gap: 8px; justify-content: flex-end;">
          <button class="btn btn-sm btn-secondary" onclick="openEditPlanModal('${plan.id}')">✏️ Edytuj</button>
          <button class="btn btn-sm btn-secondary" style="color: var(--danger); border-color: rgba(255,82,82,0.3);" onclick="deletePlan('${plan.id}')">🗑️ Usuń</button>
        </div>
      </div>
    `;
  }).join('');
}

function formatDuration(totalSeconds) {
  const sec = Math.max(0, Math.floor(totalSeconds || 0));
  const hrs = Math.floor(sec / 3600);
  const mins = Math.floor((sec % 3600) / 60);
  const remSec = sec % 60;
  if (hrs > 0) {
    return `${hrs}:${String(mins).padStart(2, '0')}:${String(remSec).padStart(2, '0')}`;
  }
  return `${mins}:${String(remSec).padStart(2, '0')}`;
}

function renderRecentWorkouts() {
  const container = document.getElementById('recent-workouts-list');
  if (!container) return;

  if (STATE.history.length === 0) {
    container.innerHTML = `<p style="color: var(--text-muted); font-size: 13px;">Brak zakończonych treningów.</p>`;
    return;
  }

  container.innerHTML = STATE.history.slice(0, 15).map(session => {
    const durSec = session.durationSeconds || (session.endTime && session.startTime ? Math.round((session.endTime - session.startTime) / 1000) : 0);
    const durText = durSec > 0 ? `⏱️ ${formatDuration(durSec)}` : '';
    const avgRestText = session.avgRestSeconds ? ` • Śr. przerwa: ${session.avgRestSeconds}s` : '';
    return `
      <div class="card">
        <div class="card-title" style="font-size: 15px;">
          <span>${escapeHtml(session.planName || 'Trening')}</span>
          <span class="badge badge-cyan">${session.totalVolumeKg || 0} kg</span>
        </div>
        <p style="color: var(--text-muted); font-size: 12px; margin-bottom: 8px;">
          ${new Date(session.endTime || Date.now()).toLocaleString('pl-PL')} • ${session.completedSets || 0} serii ${durText ? ' • ' + durText : ''}${avgRestText}
        </p>
        <div style="display: flex; gap: 8px; justify-content: flex-end;">
          <button class="btn btn-sm btn-secondary" onclick="viewHistoryReport('${session.id}')">📄 Raport AI</button>
          <button class="btn btn-sm btn-secondary" style="color: var(--danger); border-color: rgba(255,82,82,0.3);" onclick="deleteHistorySession('${session.id}')">Usuń</button>
        </div>
      </div>
    `;
  }).join('');
}

function deleteHistorySession(sessionId) {
  if (!confirm('Czy na pewno chcesz usunąć ten zapis treningu?')) return;
  STATE.history = STATE.history.filter(s => s.id !== sessionId);
  localStorage.setItem('iron_history', JSON.stringify(STATE.history));
  renderRecentWorkouts();
}

function viewHistoryReport(sessionId) {
  const session = STATE.history.find(s => s.id === sessionId);
  if (!session) return;
  showView('coach');
  const reportBox = document.getElementById('coach-report-content');
  if (session.coachFeedback) {
    reportBox.innerHTML = formatMarkdown(session.coachFeedback);
    reportBox.style.display = 'block';
  } else {
    triggerCoachAnalysis(session);
  }
}

// ============================================================================
// ACTIVE WORKOUT SESSION (Duration Ticker, Supersets, Rest Logging)
// ============================================================================
function startWorkout(planId) {
  const plan = STATE.plans.find(p => p.id === planId);
  if (!plan) return;

  const restSeconds = parseInt(plan.restSeconds) || 90;
  const supersetRestSeconds = parseInt(plan.supersetRestSeconds) || 30;

  const exercises = (plan.exercises || []).map(ex => {
    const sets = [];
    for (let i = 1; i <= (ex.sets || 3); i++) {
      sets.push({
        num: i,
        weight: ex.weight || 0,
        reps: ex.reps || 10,
        completed: false,
        completedAt: null,
        restBeforeSeconds: null
      });
    }
    return {
      name: ex.name,
      muscle: ex.muscle || 'Inne',
      supersetGroup: ex.supersetGroup || '',
      sets
    };
  });

  STATE.activeWorkout = {
    id: 'session-' + Date.now(),
    planId: plan.id,
    planName: plan.name,
    restSeconds: restSeconds,
    supersetRestSeconds: supersetRestSeconds,
    planSnapshot: JSON.parse(JSON.stringify(plan)),
    startTime: Date.now(),
    lastSetCompletedAt: null,
    restLogs: [],
    exercises: exercises
  };

  saveActiveWorkout();
  loadActiveWorkoutUI();
  showView('active-workout');
}

function checkActiveWorkout() {
  const banner = document.getElementById('active-session-banner');
  const nameEl = document.getElementById('active-session-name');
  if (!banner || !nameEl) return;

  if (STATE.activeWorkout) {
    nameEl.textContent = STATE.activeWorkout.planName;
    banner.style.display = 'block';
    startDurationTicker();
    requestWakeLock();
  } else {
    banner.style.display = 'none';
    stopDurationTicker();
    releaseWakeLock();
  }
}

function resumeActiveWorkout() {
  if (STATE.activeWorkout) {
    loadActiveWorkoutUI();
    showView('active-workout');
  }
}

function startDurationTicker() {
  clearInterval(STATE.workoutDurationInterval);
  updateWorkoutDurationCounter();
  STATE.workoutDurationInterval = setInterval(updateWorkoutDurationCounter, 1000);
}

function stopDurationTicker() {
  clearInterval(STATE.workoutDurationInterval);
  STATE.workoutDurationInterval = null;
}

function updateWorkoutDurationCounter() {
  const counterEl = document.getElementById('workout-duration-counter');
  if (!counterEl || !STATE.activeWorkout || !STATE.activeWorkout.startTime) return;
  const elapsedSec = Math.floor((Date.now() - STATE.activeWorkout.startTime) / 1000);
  counterEl.textContent = formatDuration(elapsedSec);
}

function loadActiveWorkoutUI() {
  if (!STATE.activeWorkout) return;
  document.getElementById('workout-plan-title').textContent = STATE.activeWorkout.planName;
  startDurationTicker();
  requestWakeLock();
  renderActiveExercises();
  updateWorkoutStats();
}

// Group exercises into isolated blocks or Superset frames while preserving original indices
function renderActiveExercises() {
  const container = document.getElementById('workout-exercises-container');
  if (!container || !STATE.activeWorkout) return;

  const exercises = STATE.activeWorkout.exercises || [];
  const restMain = STATE.activeWorkout.restSeconds || 90;
  const restSS = STATE.activeWorkout.supersetRestSeconds || 30;

  // Build render blocks: exercises sharing a non-empty supersetGroup are rendered inside one frame
  const renderedSupersetGroups = new Set();
  const blocksHtml = [];

  exercises.forEach((ex, exIdx) => {
    const ssGroup = (ex.supersetGroup || '').trim();
    if (!ssGroup) {
      // Isolated exercise
      blocksHtml.push(renderSingleExerciseCard(ex, exIdx, false));
    } else if (!renderedSupersetGroups.has(ssGroup)) {
      renderedSupersetGroups.add(ssGroup);
      // Collect all exercises belonging to this superset group
      const groupMembers = exercises
        .map((item, idx) => ({ item, idx }))
        .filter(entry => (entry.item.supersetGroup || '').trim() === ssGroup);

      // Determine which exercise in this superset is next up (for visual guidance)
      let nextUpExIdx = null;
      const maxSets = Math.max(...groupMembers.map(m => m.item.sets.length));
      outer: for (let s = 0; s < maxSets; s++) {
        for (const m of groupMembers) {
          if (m.item.sets[s] && !m.item.sets[s].completed) {
            nextUpExIdx = m.idx;
            break outer;
          }
        }
      }

      const modeDesc = groupMembers.length === 2
        ? 'Wykonywane na przemian (A1 ⇄ A2)'
        : `Obwód po kolei (1 → ${groupMembers.length})`;

      blocksHtml.push(`
        <div class="superset-group-box">
          <div class="superset-group-header">
            <span>🔗 SUPERSERIA ${escapeHtml(ssGroup)} • ${modeDesc}</span>
            <span>⚡ ${restSS}s / ⏱️ ${restMain}s</span>
          </div>
          ${groupMembers.map(m => renderSingleExerciseCard(m.item, m.idx, m.idx === nextUpExIdx)).join('')}
        </div>
      `);
    }
  });

  container.innerHTML = blocksHtml.join('');
}

function renderSingleExerciseCard(ex, exIdx, isNextInSuperset) {
  const ssTag = ex.supersetGroup
    ? `<span class="badge badge-cyan" style="font-size: 10px; margin-right: 4px;">SS ${escapeHtml(ex.supersetGroup)}</span>`
    : '';
  const nextBadge = isNextInSuperset
    ? `<span class="badge" style="font-size: 10px; background: rgba(255,179,0,0.2); color: var(--primary);">👉 Kolejne w SS</span>`
    : '';

  return `
    <div class="exercise-block ${isNextInSuperset ? 'next-in-superset' : ''}">
      <div class="exercise-header">
        <div style="display: flex; align-items: center; gap: 6px; flex-wrap: wrap;">
          ${ssTag}
          <span class="exercise-title">${escapeHtml(ex.name)}</span>
          ${nextBadge}
          <button class="btn btn-sm btn-secondary" style="padding: 3px 8px; font-size: 11px;" onclick="openGifModal('${escapeHtml(ex.name)}')">🎬 GIF</button>
        </div>
        <button class="btn btn-sm btn-secondary" onclick="addSetToExercise(${exIdx})">+ Seria</button>
      </div>
      <div style="display: grid; grid-template-columns: 36px 1fr 1fr 44px; gap: 8px; margin-bottom: 6px; font-size: 11px; color: var(--text-muted);">
        <span>SER</span><span>KG</span><span>POWT</span><span>OK</span>
      </div>
      ${ex.sets.map((set, sIdx) => `
        <div class="set-row">
          <div class="set-num ${set.completed ? 'done' : ''}">${set.num}</div>
          <input type="number" step="0.5" class="input-box" value="${set.weight}" onchange="updateSetData(${exIdx}, ${sIdx}, 'weight', this.value)">
          <input type="number" class="input-box" value="${set.reps}" onchange="updateSetData(${exIdx}, ${sIdx}, 'reps', this.value)">
          <button class="check-btn ${set.completed ? 'completed' : ''}" onclick="toggleSetComplete(${exIdx}, ${sIdx})">
            ${set.completed ? '✓' : '○'}
          </button>
        </div>
      `).join('')}
    </div>
  `;
}

function updateSetData(exIdx, sIdx, field, val) {
  if (!STATE.activeWorkout) return;
  STATE.activeWorkout.exercises[exIdx].sets[sIdx][field] = parseFloat(val) || 0;
  saveActiveWorkout();
  updateWorkoutStats();
}

function toggleSetComplete(exIdx, sIdx) {
  if (!STATE.activeWorkout) return;
  const ex = STATE.activeWorkout.exercises[exIdx];
  const set = ex.sets[sIdx];
  set.completed = !set.completed;

  if (set.completed) {
    // 1. If a rest timer was active (or a previous set was completed), log the rest duration
    finalizeCurrentRestLog(ex.name, set.num);

    set.completedAt = Date.now();
    STATE.activeWorkout.lastSetCompletedAt = Date.now();

    if (navigator.vibrate) navigator.vibrate(50);

    // 2. Determine whether to start Short Superset Rest or Main Rest
    const ssGroup = (ex.supersetGroup || '').trim();
    const mainRest = parseInt(STATE.activeWorkout.restSeconds) || 90;
    const shortRest = parseInt(STATE.activeWorkout.supersetRestSeconds) || 30;

    if (ssGroup) {
      const groupMembers = STATE.activeWorkout.exercises.filter(
        item => (item.supersetGroup || '').trim() === ssGroup
      );
      // Check if in the current round (sIdx) there is still at least one exercise in this superset not yet completed
      const incompleteInSameRound = groupMembers.some(
        member => member.sets[sIdx] && !member.sets[sIdx].completed
      );

      if (incompleteInSameRound) {
        startRestTimer(shortRest, `⚡ PRZERWA W SUPERSERII ${ssGroup} (KOLEJNE ĆWICZENIE)`, ex.name, set.num, 'superset-short');
      } else {
        startRestTimer(mainRest, `⏱️ KONIEC OBWODU SUPERSERII ${ssGroup} (DŁUGA PRZERWA)`, ex.name, set.num, 'superset-round');
      }
    } else {
      startRestTimer(mainRest, `⏱️ PRZERWA MIĘDZY SERIAMI`, ex.name, set.num, 'standard');
    }
  }

  saveActiveWorkout();
  renderActiveExercises();
  updateWorkoutStats();
}

function addSetToExercise(exIdx) {
  if (!STATE.activeWorkout) return;
  const ex = STATE.activeWorkout.exercises[exIdx];
  const last = ex.sets[ex.sets.length - 1];
  ex.sets.push({
    num: ex.sets.length + 1,
    weight: last ? last.weight : 0,
    reps: last ? last.reps : 10,
    completed: false,
    completedAt: null,
    restBeforeSeconds: null
  });
  saveActiveWorkout();
  renderActiveExercises();
  updateWorkoutStats();
}

function updateWorkoutStats() {
  if (!STATE.activeWorkout) return;
  let totalSets = 0;
  let completed = 0;
  let volume = 0;

  STATE.activeWorkout.exercises.forEach(ex => {
    ex.sets.forEach(s => {
      totalSets++;
      if (s.completed) {
        completed++;
        volume += (s.weight * s.reps);
      }
    });
  });

  const setsCounter = document.getElementById('workout-sets-counter');
  const volumeCounter = document.getElementById('workout-volume-counter');
  if (setsCounter) setsCounter.textContent = `${completed}/${totalSets}`;
  if (volumeCounter) volumeCounter.textContent = `${Math.round(volume)} kg`;
  updateWorkoutDurationCounter();
}

// ============================================================================
// BIG REST TIMER (Counts down to 0, then counts overtime in RED + logs rests)
// ============================================================================
function startRestTimer(seconds, labelText = '⏱️ PRZERWA MIĘDZY SERIAMI', afterExercise = '', afterSet = 1, restType = 'standard') {
  clearInterval(STATE.timerInterval);
  STATE.timerSeconds = seconds;
  STATE.currentRestInfo = {
    startedAt: Date.now(),
    plannedSeconds: seconds,
    afterExercise: afterExercise,
    afterSet: afterSet,
    type: restType,
    logged: false
  };

  const bar = document.getElementById('rest-timer-bar');
  const modeLabel = document.getElementById('timer-mode-label');
  if (modeLabel) modeLabel.textContent = labelText;
  if (bar) {
    bar.classList.remove('overtime');
    bar.style.display = 'flex';
  }

  updateTimerDisplayUI();

  STATE.timerInterval = setInterval(() => {
    STATE.timerSeconds--;
    if (STATE.timerSeconds === 0) {
      if (navigator.vibrate) navigator.vibrate([200, 100, 200, 100, 250]);
    }
    updateTimerDisplayUI();
  }, 1000);
}

function updateTimerDisplayUI() {
  const bar = document.getElementById('rest-timer-bar');
  const display = document.getElementById('timer-display');
  const overtimeBadge = document.getElementById('timer-overtime-badge');
  if (!display || !bar) return;

  if (STATE.timerSeconds > 0) {
    bar.classList.remove('overtime');
    if (overtimeBadge) overtimeBadge.style.display = 'none';
    display.textContent = `${STATE.timerSeconds}s`;
  } else {
    // At 0 or negative (overtime): highlight in red and count how many seconds overtime
    const overSec = Math.abs(STATE.timerSeconds);
    bar.classList.add('overtime');
    if (overtimeBadge) {
      overtimeBadge.style.display = 'inline';
      overtimeBadge.textContent = `⚠️ ZA DŁUGA PRZERWA: +${overSec}s`;
    }
    display.textContent = STATE.timerSeconds === 0 ? `0s` : `+${overSec}s`;
  }
}

function addTimerSeconds(secs) {
  STATE.timerSeconds += secs;
  if (STATE.currentRestInfo) {
    STATE.currentRestInfo.plannedSeconds = Math.max(0, (STATE.currentRestInfo.plannedSeconds || 0) + secs);
  }
  updateTimerDisplayUI();
}

function finalizeCurrentRestLog(nextExerciseName = null, nextSetNum = null) {
  if (!STATE.activeWorkout) return;
  if (!STATE.activeWorkout.restLogs) STATE.activeWorkout.restLogs = [];

  if (STATE.currentRestInfo && !STATE.currentRestInfo.logged) {
    const actualSec = Math.max(1, Math.round((Date.now() - STATE.currentRestInfo.startedAt) / 1000));
    const plannedSec = STATE.currentRestInfo.plannedSeconds || 90;
    const overtimeSec = Math.max(0, actualSec - plannedSec);

    STATE.activeWorkout.restLogs.push({
      afterExercise: STATE.currentRestInfo.afterExercise,
      afterSet: STATE.currentRestInfo.afterSet,
      beforeExercise: nextExerciseName || '',
      beforeSet: nextSetNum || null,
      type: STATE.currentRestInfo.type || 'standard',
      plannedSeconds: plannedSec,
      actualSeconds: actualSec,
      overtimeSeconds: overtimeSec,
      timestamp: Date.now()
    });
    STATE.currentRestInfo.logged = true;
  } else if (STATE.activeWorkout.lastSetCompletedAt) {
    // Even if user dismissed timer early, record actual time between sets
    const actualSec = Math.max(1, Math.round((Date.now() - STATE.activeWorkout.lastSetCompletedAt) / 1000));
    const lastLog = STATE.activeWorkout.restLogs[STATE.activeWorkout.restLogs.length - 1];
    if (lastLog && !lastLog.beforeExercise) {
      lastLog.actualSeconds = actualSec;
      lastLog.overtimeSeconds = Math.max(0, actualSec - (lastLog.plannedSeconds || 90));
      lastLog.beforeExercise = nextExerciseName || '';
      lastLog.beforeSet = nextSetNum || null;
    }
  }
}

function stopTimer() {
  if (STATE.currentRestInfo && !STATE.currentRestInfo.logged) {
    finalizeCurrentRestLog();
    saveActiveWorkout();
  }
  clearInterval(STATE.timerInterval);
  STATE.timerInterval = null;
  const bar = document.getElementById('rest-timer-bar');
  if (bar) {
    bar.classList.remove('overtime');
    bar.style.display = 'none';
  }
}

// ============================================================================
// FINISH WORKOUT & SAVE SELF-CONTAINED HISTORY SNAPSHOT
// ============================================================================
async function finishCurrentWorkout() {
  if (!STATE.activeWorkout) return;
  stopTimer();
  stopDurationTicker();
  releaseWakeLock();

  const endTime = Date.now();
  const startTime = STATE.activeWorkout.startTime || endTime;
  const durationSeconds = Math.max(1, Math.round((endTime - startTime) / 1000));

  let totalSets = 0;
  let completedSets = 0;
  let totalVolumeKg = 0;
  const completedSetsList = [];

  STATE.activeWorkout.exercises.forEach(ex => {
    ex.sets.forEach(s => {
      totalSets++;
      if (s.completed) {
        completedSets++;
        totalVolumeKg += (s.weight * s.reps);
        completedSetsList.push({
          exercise: ex.name,
          muscle: ex.muscle || 'Inne',
          supersetGroup: ex.supersetGroup || '',
          setNum: s.num,
          weight: s.weight,
          reps: s.reps,
          completedAt: s.completedAt || null
        });
      }
    });
  });

  const restLogs = STATE.activeWorkout.restLogs || [];
  const avgRestSeconds = restLogs.length > 0
    ? Math.round(restLogs.reduce((acc, r) => acc + (r.actualSeconds || 0), 0) / restLogs.length)
    : 0;

  const session = {
    id: STATE.activeWorkout.id,
    planId: STATE.activeWorkout.planId,
    planName: STATE.activeWorkout.planName,
    planSnapshot: STATE.activeWorkout.planSnapshot || null,
    startTime: startTime,
    endTime: endTime,
    durationSeconds: durationSeconds,
    avgRestSeconds: avgRestSeconds,
    restLogs: restLogs,
    totalVolumeKg: Math.round(totalVolumeKg),
    completedSets: completedSets,
    sets: completedSetsList,
    coachFeedback: null
  };

  STATE.history.unshift(session);
  localStorage.setItem('iron_history', JSON.stringify(STATE.history));

  STATE.activeWorkout = null;
  localStorage.removeItem('iron_active_workout');
  checkActiveWorkout();
  renderRecentWorkouts();

  showView('coach');
  triggerCoachAnalysis(session);
}

// ============================================================================
// GEMINI AI INTEGRATION
// ============================================================================
async function callGemini(prompt, preferredTier = 'fast') {
  const key = STATE.apiKey.trim();
  if (!key) {
    alert('Podaj klucz Gemini API w zakładce Ustawienia!');
    showView('settings');
    throw new Error('Missing API Key');
  }

  let availableModels = [];
  try {
    const listRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${key}`);
    const listData = await listRes.json();
    if (listData.models && Array.isArray(listData.models)) {
      availableModels = listData.models
        .filter(m => m.supportedGenerationMethods && m.supportedGenerationMethods.includes('generateContent'))
        .map(m => m.name.replace('models/', ''));
    }
  } catch (e) {
    console.error('List models failed', e);
  }

  let modelsToTry = [];
  if (availableModels.length > 0) {
    const proModels = availableModels.filter(m => m.includes('pro') && !m.includes('flash'));
    const flashModels = availableModels.filter(m => m.includes('flash'));
    const others = availableModels.filter(m => !m.includes('flash') && !m.includes('pro'));

    if (preferredTier === 'smart') {
      modelsToTry = [...proModels, ...flashModels, ...others];
    } else {
      modelsToTry = [...flashModels, ...proModels, ...others];
    }
  } else {
    modelsToTry = preferredTier === 'smart'
      ? ['gemini-1.5-pro-latest', 'gemini-1.5-pro', 'gemini-1.5-flash-latest']
      : ['gemini-1.5-flash-latest', 'gemini-1.5-flash', 'gemini-1.5-pro-latest'];
  }

  let lastError = null;

  for (const model of modelsToTry) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }]
        })
      });

      if (response.ok) {
        const data = await response.json();
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
        if (text) return text;
      } else {
        const err = await response.json().catch(() => ({}));
        lastError = new Error(err.error?.message || `HTTP ${response.status}`);
      }
    } catch (e) {
      lastError = e;
    }
  }

  throw lastError || new Error('Brak dostępnego modelu Gemini dla tego klucza.');
}

// Parse Note from Google Keep (supports supersets & rest times)
async function parseKeepWithGemini() {
  const rawText = document.getElementById('keep-text-input').value.trim();
  if (!rawText) return alert('Wklej najpierw treść notatki z Keep!');

  const loading = document.getElementById('keep-parse-loading');
  const preview = document.getElementById('parsed-plan-preview');
  loading.style.display = 'block';
  preview.style.display = 'none';

  const prompt = `
Jesteś ekspertem treningu siłowego. Przekształć poniższą notatkę z Google Keep w strukturę planów treningowych.
Uwaga: W notatce może znajdować się JEDEN lub KILKA planów (np. Dzień 1 / Dzień 2, lub Push / Pull / Legs).
Rozpoznaj również ewentualne superserie (np. oznaczone jako 1a/1b, A1/A2, "superseria", lub połączone znakiem "+") i nadaj im wspólny identyfikator "supersetGroup": "A", "B", "C" (lub "" dla pojedynczych ćwiczeń).
Zwróć WYŁĄCZNIE poprawny format JSON (tablicę planów):
[
  {
    "name": "Nazwa planu (np. Trening A: Klatka i Triceps)",
    "description": "Krótki opis",
    "restSeconds": 90,
    "supersetRestSeconds": 30,
    "exercises": [
      {
        "name": "Nazwa ćwiczenia",
        "muscle": "Partia (Klatka, Plecy, Nogi, Barki, Ramiona, Brzuch)",
        "sets": 3,
        "reps": 10,
        "weight": 80,
        "supersetGroup": ""
      }
    ]
  }
]

Zasady:
1. Zawsze zwróć tablicę JSON.
2. Dla ćwiczeń w superserii ustaw ten sam "supersetGroup" (np. "A", "B"), a dla ćwiczeń w izolacji ustaw "".
3. Bez żadnych dodatkowych komentarzy i bez znaczników markdown.

Treść notatki:
"""
${rawText}
"""`;

  try {
    const rawResponse = await callGemini(prompt, 'fast');
    const cleaned = rawResponse.replace(/```json/g, '').replace(/```/g, '').trim();
    let parsed = JSON.parse(cleaned);

    if (!Array.isArray(parsed)) {
      parsed = [parsed];
    }

    STATE.parsedKeepPlans = parsed;

    const previewContainer = document.getElementById('preview-exercises-list');
    document.getElementById('preview-plan-name').textContent = `Rozpoznano planów: ${parsed.length}`;

    previewContainer.innerHTML = parsed.map((p, idx) => `
      <div style="margin-bottom: 14px; padding: 10px; background: var(--surface-elevated); border-radius: 8px;">
        <div style="font-weight: 800; font-size: 15px; color: var(--primary); margin-bottom: 6px;">
          ${idx + 1}. ${escapeHtml(p.name || 'Plan')}
        </div>
        ${(p.exercises || []).map(ex => `
          <div style="display: flex; justify-content: space-between; padding: 4px 0; border-bottom: 1px solid var(--border); font-size: 13px;">
            <span>
              ${ex.supersetGroup ? `<b style="color: var(--accent);">[SS ${escapeHtml(ex.supersetGroup)}]</b> ` : ''}
              <b>${escapeHtml(ex.name)}</b> (${ex.muscle || 'Inne'})
            </span>
            <span>${ex.sets}x${ex.reps} ${ex.weight ? ex.weight + 'kg' : ''}</span>
          </div>
        `).join('')}
      </div>
    `).join('');

    preview.style.display = 'block';
  } catch (err) {
    alert('Błąd analizy Gemini: ' + err.message);
  } finally {
    loading.style.display = 'none';
  }
}

function saveParsedPlan() {
  if (!STATE.parsedKeepPlans || STATE.parsedKeepPlans.length === 0) return;

  STATE.parsedKeepPlans.forEach(p => {
    STATE.plans.push({
      id: 'plan-' + Date.now() + '-' + Math.random().toString(36).substr(2, 4),
      name: p.name || 'Plan z Keep',
      description: p.description || '',
      restSeconds: parseInt(p.restSeconds) || 90,
      supersetRestSeconds: parseInt(p.supersetRestSeconds) || 30,
      exercises: (p.exercises || []).map(ex => ({
        name: ex.name,
        muscle: ex.muscle || 'Inne',
        sets: parseInt(ex.sets) || 3,
        reps: parseInt(ex.reps) || 10,
        weight: parseFloat(ex.weight) || 0,
        supersetGroup: ex.supersetGroup || ''
      }))
    });
  });

  localStorage.setItem('iron_plans', JSON.stringify(STATE.plans));
  renderPlans();
  alert(`Zapisano pomyślnie ${STATE.parsedKeepPlans.length} plan(ów)!`);
  showView('home');
}

// ============================================================================
// MODAL FOR ADDING / EDITING PLANS (WITH SUPERSETS & REST CONFIGURATION)
// ============================================================================
let editingPlanId = null;

function openNewPlanModal() {
  editingPlanId = null;
  document.getElementById('plan-modal-title').textContent = 'Nowy Plan Treningowy';
  document.getElementById('modal-plan-name').value = '';
  document.getElementById('modal-plan-desc').value = '';
  document.getElementById('modal-plan-rest').value = 90;
  document.getElementById('modal-plan-ss-rest').value = 30;
  document.getElementById('modal-exercises-list').innerHTML = '';
  addModalExerciseRow('Wyciskanie sztangi leżąc', 4, 8, 80, '');
  addModalExerciseRow('Wyciskanie hantli skos', 3, 10, 26, 'A');
  addModalExerciseRow('Wiosłowanie hantlem', 3, 10, 30, 'A');
  const modal = document.getElementById('plan-modal');
  modal.style.display = 'flex';
}

function openEditPlanModal(planId) {
  const plan = STATE.plans.find(p => p.id === planId);
  if (!plan) return;
  editingPlanId = planId;
  document.getElementById('plan-modal-title').textContent = 'Edycja Planu Treningowego';
  document.getElementById('modal-plan-name').value = plan.name || '';
  document.getElementById('modal-plan-desc').value = plan.description || '';
  document.getElementById('modal-plan-rest').value = plan.restSeconds || 90;
  document.getElementById('modal-plan-ss-rest').value = plan.supersetRestSeconds || 30;
  
  const listEl = document.getElementById('modal-exercises-list');
  listEl.innerHTML = '';
  (plan.exercises || []).forEach(ex => {
    addModalExerciseRow(ex.name, ex.sets, ex.reps, ex.weight, ex.supersetGroup || '');
  });
  if ((plan.exercises || []).length === 0) {
    addModalExerciseRow('', 3, 10, 0, '');
  }

  const modal = document.getElementById('plan-modal');
  modal.style.display = 'flex';
}

function closePlanModal() {
  const modal = document.getElementById('plan-modal');
  modal.style.display = 'none';
}

function addModalExerciseRow(name = '', sets = 3, reps = 10, weight = 0, supersetGroup = '') {
  const listEl = document.getElementById('modal-exercises-list');
  const row = document.createElement('div');
  row.className = 'modal-ex-row';
  row.style.cssText = 'background: var(--surface-elevated); border: 1px solid var(--border); border-radius: 10px; padding: 8px; margin-bottom: 8px;';

  const ssOptions = [
    { val: '', label: 'Pojedyncze (Izolacja)' },
    { val: 'A', label: '🔗 Superseria A' },
    { val: 'B', label: '🔗 Superseria B' },
    { val: 'C', label: '🔗 Superseria C' },
    { val: 'D', label: '🔗 Superseria D' }
  ];

  row.innerHTML = `
    <div style="display: flex; gap: 6px; align-items: center; margin-bottom: 6px;">
      <input type="text" class="input-box modal-ex-name" style="text-align: left; font-size: 13px; flex: 1;" placeholder="Nazwa ćwiczenia (np. RDL, Back Squat)" value="${escapeHtml(name)}">
      <button type="button" style="background: none; border: none; color: var(--danger); font-size: 18px; padding: 0 6px; cursor: pointer;" onclick="this.closest('.modal-ex-row').remove()" title="Usuń ćwiczenie">✕</button>
    </div>
    <div style="display: grid; grid-template-columns: 1.4fr 1fr 1fr 1fr; gap: 6px; align-items: center;">
      <select class="input-box modal-ex-ss" style="font-size: 12px; padding: 6px 4px; color: var(--accent);">
        ${ssOptions.map(o => `<option value="${o.val}" ${supersetGroup === o.val ? 'selected' : ''}>${o.label}</option>`).join('')}
      </select>
      <div style="position: relative;">
        <input type="number" class="input-box modal-ex-sets" style="font-size: 13px; padding: 6px;" placeholder="Ser" value="${sets}" title="Serie">
        <span style="font-size: 9px; color: var(--text-muted); display: block; text-align: center;">SERIE</span>
      </div>
      <div style="position: relative;">
        <input type="number" class="input-box modal-ex-reps" style="font-size: 13px; padding: 6px;" placeholder="Powt" value="${reps}" title="Powtórzenia">
        <span style="font-size: 9px; color: var(--text-muted); display: block; text-align: center;">POWT</span>
      </div>
      <div style="position: relative;">
        <input type="number" step="0.5" class="input-box modal-ex-weight" style="font-size: 13px; padding: 6px;" placeholder="kg" value="${weight}" title="Ciężar (kg)">
        <span style="font-size: 9px; color: var(--text-muted); display: block; text-align: center;">CIĘŻAR (KG)</span>
      </div>
    </div>
  `;
  listEl.appendChild(row);
}

function saveModalPlan() {
  const name = document.getElementById('modal-plan-name').value.trim();
  if (!name) return alert('Podaj nazwę planu!');
  const desc = document.getElementById('modal-plan-desc').value.trim();
  const restSeconds = parseInt(document.getElementById('modal-plan-rest').value) || 90;
  const supersetRestSeconds = parseInt(document.getElementById('modal-plan-ss-rest').value) || 30;

  const rows = document.querySelectorAll('#modal-exercises-list .modal-ex-row');
  const exercises = [];
  rows.forEach(r => {
    const exName = r.querySelector('.modal-ex-name').value.trim();
    const sets = parseInt(r.querySelector('.modal-ex-sets').value) || 3;
    const reps = parseInt(r.querySelector('.modal-ex-reps').value) || 10;
    const weight = parseFloat(r.querySelector('.modal-ex-weight').value) || 0;
    const supersetGroup = r.querySelector('.modal-ex-ss').value || '';
    if (exName) {
      exercises.push({ name: exName, sets, reps, weight, supersetGroup, muscle: 'Ogólne' });
    }
  });

  if (exercises.length === 0) {
    return alert('Dodaj przynajmniej jedno ćwiczenie!');
  }

  if (editingPlanId) {
    const idx = STATE.plans.findIndex(p => p.id === editingPlanId);
    if (idx !== -1) {
      STATE.plans[idx].name = name;
      STATE.plans[idx].description = desc;
      STATE.plans[idx].restSeconds = restSeconds;
      STATE.plans[idx].supersetRestSeconds = supersetRestSeconds;
      STATE.plans[idx].exercises = exercises;
    }
  } else {
    STATE.plans.push({
      id: 'plan-' + Date.now(),
      name: name,
      description: desc,
      restSeconds: restSeconds,
      supersetRestSeconds: supersetRestSeconds,
      exercises: exercises
    });
  }

  localStorage.setItem('iron_plans', JSON.stringify(STATE.plans));
  renderPlans();
  closePlanModal();
}

// ============================================================================
// COACH AI ANALYSIS & CONVERSATIONAL CHAT (Includes Duration & Rest Times)
// ============================================================================
async function triggerCoachAnalysis(session) {
  const loading = document.getElementById('coach-loading');
  const reportBox = document.getElementById('coach-report-content');
  loading.style.display = 'block';
  reportBox.style.display = 'none';

  const durSec = session.durationSeconds || (session.endTime && session.startTime ? Math.round((session.endTime - session.startTime) / 1000) : 0);
  const setsSummary = (session.sets || []).map(s =>
    `${s.supersetGroup ? `[SS ${s.supersetGroup}] ` : ''}${s.exercise}: S${s.setNum} ${s.weight}kg x ${s.reps}`
  ).join('\n');

  const restsSummary = (session.restLogs && session.restLogs.length > 0)
    ? session.restLogs.map((r, i) =>
        `Przerwa #${i + 1} (po ${r.afterExercise} S${r.afterSet}): planowana ${r.plannedSeconds}s, rzeczywista ${r.actualSeconds}s${r.overtimeSeconds > 0 ? ` (przekroczono o +${r.overtimeSeconds}s)` : ''}`
      ).join('\n')
    : 'Brak szczegółowych pomiarów przerw.';

  const prompt = `
Działasz jako doświadczony, zaawansowany trener personalny i fizjolog sportowy w aplikacji IronCoach.
Właśnie zakończył się trening użytkownika:
Plan: ${session.planName}
Całkowity czas treningu: ${formatDuration(durSec)} (${durSec} sekund)
Średnia przerwa między seriami: ${session.avgRestSeconds || 0} sekund
Całkowity tonaż: ${session.totalVolumeKg} kg
Ukończone serie: ${session.completedSets}

Szczegóły wykonanych serii:
${setsSummary}

Historia przerw między ćwiczeniami/seriami:
${restsSummary}

Przygotuj pogłębioną, merytoryczną analizę w języku polskim:
1. 📊 Ocena objętości, gęstości treningowej (czas trwania sesji i dyscyplina przerw między seriami/superseriami) oraz intensywności.
2. 🎯 Konkretna periodyzacja i progresywne przeładowanie na kolejny trening (do jakich ćwiczeń dodać ciężar, do jakich powtórzenia, gdzie skrócić lub wydłużyć przerwy).
3. ⚡ Praktyczne zalecenia regeneracyjne i biomechaniczne.
Używaj czytelnego formatowania punktowego.`;

  try {
    const feedback = await callGemini(prompt, 'smart');
    session.coachFeedback = feedback;
    localStorage.setItem('iron_history', JSON.stringify(STATE.history));
    reportBox.innerHTML = formatMarkdown(feedback);
    reportBox.style.display = 'block';
  } catch (err) {
    reportBox.innerHTML = `<p style="color: var(--danger);">Nie udało się pobrać raportu trenera: ${err.message}</p>`;
    reportBox.style.display = 'block';
  } finally {
    loading.style.display = 'none';
  }
}

async function askCoachQuestion() {
  const inputEl = document.getElementById('coach-question-input');
  const btnEl = document.getElementById('coach-submit-btn');
  const chatMessagesEl = document.getElementById('coach-chat-messages');
  const q = inputEl.value.trim();
  if (!q) return;

  const userMsg = { role: 'user', text: q, time: Date.now() };
  STATE.coachChat.push(userMsg);
  saveCoachChat();
  renderCoachChat();

  inputEl.value = '';
  inputEl.disabled = true;
  if (btnEl) {
    btnEl.disabled = true;
    btnEl.innerHTML = `<span style="display: inline-flex; align-items: center; gap: 6px;">⏳ Trener myśli...</span>`;
    btnEl.style.opacity = '0.7';
  }

  chatMessagesEl.scrollTop = chatMessagesEl.scrollHeight;

  const lastWorkout = STATE.history[0];
  const workoutContext = lastWorkout
    ? `Ostatni trening użytkownika: ${lastWorkout.planName}, czas trwania: ${formatDuration(lastWorkout.durationSeconds || 0)}, śr. przerwa: ${lastWorkout.avgRestSeconds || 0}s, tonaż: ${lastWorkout.totalVolumeKg}kg, serii: ${lastWorkout.completedSets}.`
    : `Brak zarejestrowanych sesji.`;

  const conversationHistory = STATE.coachChat.slice(-8).map(m => 
    `${m.role === 'user' ? 'Użytkownik' : 'Trener'}: ${m.text}`
  ).join('\n\n');

  const fullPrompt = `
Jesteś doświadczonym, empatycznym trenerem personalnym i fizjologiem w aplikacji IronCoach.
Rozmawiasz z użytkownikiem w trybie ciągłego czatu.

Kontekst treningowy:
${workoutContext}

Dotychczasowy przebieg rozmowy:
${conversationHistory}

Udziel naturalnej, merytorycznej i pomocnej odpowiedzi po polsku jako Trener na ostatnią wiadomość użytkownika.
`;

  try {
    const ans = await callGemini(fullPrompt, 'smart');
    STATE.coachChat.push({ role: 'assistant', text: ans, time: Date.now() });
    saveCoachChat();
    renderCoachChat();
  } catch (err) {
    STATE.coachChat.push({ role: 'assistant', text: `⚠️ Błąd: ${err.message}`, time: Date.now() });
    renderCoachChat();
  } finally {
    inputEl.disabled = false;
    inputEl.focus();
    if (btnEl) {
      btnEl.disabled = false;
      btnEl.textContent = 'Wyślij';
      btnEl.style.opacity = '1';
    }
    chatMessagesEl.scrollTop = chatMessagesEl.scrollHeight;
  }
}

function renderCoachChat() {
  const container = document.getElementById('coach-chat-messages');
  if (!container) return;

  if (STATE.coachChat.length === 0) {
    container.innerHTML = `
      <div style="text-align: center; color: var(--text-muted); padding: 24px 12px; font-size: 13px;">
        👋 Cześć! Jestem Twoim trenerem personalnym AI.<br>
        Możesz zapytać mnie o technikę, zamiennik ćwiczenia, superserie, czasy przerw lub progresję.
      </div>
    `;
    return;
  }

  container.innerHTML = STATE.coachChat.map(m => {
    const isUser = m.role === 'user';
    return `
      <div style="display: flex; justify-content: ${isUser ? 'flex-end' : 'flex-start'}; margin-bottom: 10px;">
        <div style="
          max-width: 85%;
          padding: 10px 14px;
          border-radius: ${isUser ? '14px 14px 2px 14px' : '14px 14px 14px 2px'};
          background: ${isUser ? 'var(--primary)' : 'var(--surface-elevated)'};
          color: ${isUser ? '#000' : 'var(--text)'};
          font-weight: ${isUser ? '600' : '400'};
          font-size: 14px;
          line-height: 1.5;
          box-shadow: 0 2px 8px rgba(0,0,0,0.2);
          border: ${isUser ? 'none' : '1px solid var(--border)'};
        ">
          ${isUser ? escapeHtml(m.text) : formatMarkdown(m.text)}
        </div>
      </div>
    `;
  }).join('');

  container.scrollTop = container.scrollHeight;
}

function saveCoachChat() {
  localStorage.setItem('iron_coach_chat', JSON.stringify(STATE.coachChat));
}

function clearCoachChat() {
  if (!confirm('Czy na pewno chcesz wyczyścić historię rozmowy z trenerem?')) return;
  STATE.coachChat = [];
  saveCoachChat();
  renderCoachChat();
}

// ============================================================================
// API KEY & ROBUST EXPORT / IMPORT (Preserves history when plans evolve)
// ============================================================================
function loadApiKey() {
  const input = document.getElementById('gemini-api-key');
  if (input) input.value = STATE.apiKey;
}

function saveApiKey() {
  const val = document.getElementById('gemini-api-key').value.trim();
  STATE.apiKey = val;
  localStorage.setItem('iron_gemini_api_key', val);
  const status = document.getElementById('api-key-status');
  status.style.display = 'block';
  setTimeout(() => status.style.display = 'none', 3000);
}

function exportDataJson() {
  const backup = {
    schemaVersion: 2,
    exportedAt: new Date().toISOString(),
    plans: STATE.plans,
    history: STATE.history,
    customGifMap: JSON.parse(localStorage.getItem('iron_custom_gif_map') || '{}'),
    coachChat: STATE.coachChat
  };
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `ironcoach-backup-${new Date().toISOString().slice(0,10)}.json`;
  a.click();
}

function importDataJson(event) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const data = JSON.parse(e.target.result);

      // 1. Safely normalize and import plans without breaking existing structure
      if (Array.isArray(data.plans)) {
        const normalizedPlans = data.plans.map((p, idx) => ({
          id: p.id || ('plan-imp-' + Date.now() + '-' + idx),
          name: p.name || 'Zaimportowany Plan',
          description: p.description || '',
          restSeconds: parseInt(p.restSeconds) || 90,
          supersetRestSeconds: parseInt(p.supersetRestSeconds) || 30,
          exercises: Array.isArray(p.exercises) ? p.exercises.map(ex => ({
            name: ex.name || 'Ćwiczenie',
            muscle: ex.muscle || 'Inne',
            sets: parseInt(ex.sets) || 3,
            reps: parseInt(ex.reps) || 10,
            weight: parseFloat(ex.weight) || 0,
            supersetGroup: ex.supersetGroup || ''
          })) : []
        }));
        STATE.plans = normalizedPlans;
        localStorage.setItem('iron_plans', JSON.stringify(STATE.plans));
      }

      // 2. Safely merge/normalize workout history (completely independent of current plan definitions!)
      if (Array.isArray(data.history)) {
        const existingIds = new Set(STATE.history.map(h => h.id));
        const normalizedImportedHistory = data.history.map((h, idx) => {
          const start = h.startTime || h.endTime || Date.now();
          const end = h.endTime || start;
          const durSec = h.durationSeconds || Math.max(0, Math.round((end - start) / 1000));
          return {
            id: h.id || ('session-imp-' + Date.now() + '-' + idx),
            planId: h.planId || null,
            planName: h.planName || 'Historyczny Trening',
            planSnapshot: h.planSnapshot || null,
            startTime: start,
            endTime: end,
            durationSeconds: durSec,
            avgRestSeconds: h.avgRestSeconds || 0,
            restLogs: Array.isArray(h.restLogs) ? h.restLogs : [],
            totalVolumeKg: Math.round(parseFloat(h.totalVolumeKg) || 0),
            completedSets: parseInt(h.completedSets) || (Array.isArray(h.sets) ? h.sets.length : 0),
            sets: Array.isArray(h.sets) ? h.sets.map((s, sIdx) => ({
              exercise: s.exercise || 'Ćwiczenie',
              muscle: s.muscle || 'Inne',
              supersetGroup: s.supersetGroup || '',
              setNum: s.setNum || (sIdx + 1),
              weight: parseFloat(s.weight) || 0,
              reps: parseInt(s.reps) || 0,
              completedAt: s.completedAt || null
            })) : [],
            coachFeedback: h.coachFeedback || null
          };
        });

        // Merge imported history with any local sessions not in the backup file, sorted newest first
        const mergedHistory = [...STATE.history];
        normalizedImportedHistory.forEach(item => {
          const existingIdx = mergedHistory.findIndex(x => x.id === item.id);
          if (existingIdx !== -1) {
            mergedHistory[existingIdx] = item;
          } else {
            mergedHistory.push(item);
          }
        });
        mergedHistory.sort((a, b) => (b.endTime || 0) - (a.endTime || 0));
        STATE.history = mergedHistory;
        localStorage.setItem('iron_history', JSON.stringify(STATE.history));
      }

      // 3. Restore custom GIF mappings if present
      if (data.customGifMap && typeof data.customGifMap === 'object') {
        const currentMap = JSON.parse(localStorage.getItem('iron_custom_gif_map') || '{}');
        localStorage.setItem('iron_custom_gif_map', JSON.stringify({ ...currentMap, ...data.customGifMap }));
      }

      renderPlans();
      renderRecentWorkouts();
      alert('Dane i historia zostały bezpiecznie zaimportowane!');
    } catch (err) {
      alert('Niepoprawny plik JSON: ' + err.message);
    }
  };
  reader.readAsText(file);
}

// ============================================================================
// HELPERS
// ============================================================================
function saveActiveWorkout() {
  localStorage.setItem('iron_active_workout', JSON.stringify(STATE.activeWorkout));
  checkActiveWorkout();
}

function deletePlan(id) {
  if (!confirm('Czy na pewno chcesz usunąć ten plan? (Historia odbytych treningów zostanie zachowana)')) return;
  STATE.plans = STATE.plans.filter(p => p.id !== id);
  localStorage.setItem('iron_plans', JSON.stringify(STATE.plans));
  renderPlans();
}

function escapeHtml(str) {
  return String(str || '').replace(/[&<>'"]/g, tag => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
  }[tag] || tag));
}

function formatMarkdown(text) {
  return String(text || '')
    .replace(/\*\*(.*?)\*\*/g, '<b>$1</b>')
    .replace(/\*(.*?)\*/g, '<i>$1</i>')
    .replace(/\n/g, '<br>');
}
