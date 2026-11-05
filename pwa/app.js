// IronCoach AI - Mobile PWA Engine (v27)

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
  backupApiKey: localStorage.getItem('iron_gemini_backup_api_key') || '',
  preferredGeminiTier: localStorage.getItem('iron_gemini_preferred_tier') || 'fast',
  lastUsedGeminiModel: null,
  lastGeminiFallback: null,
  timerInterval: null,
  timerSeconds: 0,
  timerElapsedSeconds: 0,
  timerRemainingSeconds: 90,
  timerTargetSeconds: 90,
  timerIsTechnical: false,
  timerRefText: null,
  currentRestInfo: null,
  workoutDurationInterval: null,
  wakeLockSentinel: null,
  parsedKeepPlans: null,
  exerciseGifs: [],
  coachChat: JSON.parse(localStorage.getItem('iron_coach_chat')) || [],
  coachThreads: JSON.parse(localStorage.getItem('iron_coach_threads')) || [],
  activeCoachThreadId: localStorage.getItem('iron_active_coach_thread_id') || null,
  currentCoachReportSessionId: null,
  userProfile: JSON.parse(localStorage.getItem('iron_user_profile')) || {
    weightKg: '',
    heightCm: '',
    goal: 'Budowa masy mięśniowej (Hipertrofia)',
    goalNotes: ''
  },
  bodyMeasurements: JSON.parse(localStorage.getItem('iron_body_measurements')) || [],
  selectedBodyMeasurementId: null,
  nutritionGoals: JSON.parse(localStorage.getItem('iron_nutrition_goals')) || {
    kcal: 2500,
    proteinG: 180,
    carbsG: 260,
    fatG: 75
  },
  nutritionDiary: JSON.parse(localStorage.getItem('iron_nutrition_diary')) || [],
  selectedNutritionDate: new Date().toISOString().slice(0, 10),
  pendingMealPhotos: [],
  editingMealId: null,
  lastUsedGeminiModel: '',
  editingEffortCoords: null,
  calendarYear: new Date().getFullYear(),
  calendarMonth: new Date().getMonth(),
  selectedCalendarDate: new Date().toISOString().slice(0, 10),
  calendarAiSummaries: JSON.parse(localStorage.getItem('iron_calendar_ai_summaries') || '{}'),
  gdriveWebhookUrl: localStorage.getItem('iron_gdrive_webhook_url') || '',
  gdriveWebhookSecret: localStorage.getItem('iron_gdrive_webhook_secret') || '',
  gdriveOauthToken: localStorage.getItem('iron_gdrive_oauth_token') || ''
};

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  registerServiceWorker();
  checkSharedParams();
  loadApiKey();
  initBodyMeasurements();
  initNutritionView();
  loadUserProfile();
  loadExerciseGifsDatabase();
  renderPlans();
  renderRecentWorkouts();
  initCalendarDashboard();
  loadGoogleDriveConfig();
  checkMorningAutoBackup();
  checkActiveWorkout();
  initCoachThreads();
  refreshCoachReportBox();
  setupWakeLockVisibilityListener();
});

async function loadExerciseGifsDatabase() {
  try {
    const res = await fetch('./exercises_db.json');
    if (res.ok) {
      STATE.exerciseGifs = await res.json();
      syncPlansGifsWithDatabase();
      renderPlans();
    }
  } catch (e) {
    console.warn('Failed to load local exercise GIFs db', e);
  }
}

function syncPlansGifsWithDatabase() {
  if (!Array.isArray(STATE.plans) || STATE.plans.length === 0) return;
  let updated = false;
  STATE.plans.forEach(plan => {
    (plan.exercises || []).forEach(ex => {
      if (!ex.gifUrl) {
        const m = findExerciseGif(ex.name, ex);
        if (m && m.g) {
          ex.gifSlug = m.s || '';
          ex.gifUrl = m.g || '';
          ex.gifName = m.n || ex.name;
          updated = true;
        }
      }
    });
  });
  if (updated) {
    localStorage.setItem('iron_plans', JSON.stringify(STATE.plans));
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

// Polish-to-English token dictionary for smart fallback matching & search
const PL_TO_EN_TOKENS = {
  'przysiad': 'squat', 'przysiady': 'squat', 'przysiadzie': 'squat',
  'bułgarski': 'single leg split squat', 'bulgarski': 'single leg split squat', 'bułgarskie': 'single leg split squat', 'bulgarskie': 'single leg split squat',
  'przedni': 'front', 'tylny': 'full',
  'martwy': 'deadlift', 'ciąg': 'deadlift', 'ciag': 'deadlift',
  'rumuński': 'romanian', 'rumunski': 'romanian',
  'prostych': 'straight leg', 'sztywnych': 'stiff leg', 'stiff': 'stiff straight',
  'rdl': 'romanian deadlift', 'sldl': 'straight leg deadlift',
  'wyciskanie': 'press', 'wyciskania': 'press',
  'leżąc': 'bench', 'lezac': 'bench', 'płasko': 'bench', 'plasko': 'bench', 'ławce': 'bench', 'lawce': 'bench',
  'skos': 'incline', 'skośnej': 'incline', 'skosnej': 'incline', 'dodatni': 'incline', 'ujemny': 'decline',
  'żołnierskie': 'military press', 'zolnierskie': 'military press', 'ohp': 'military press',
  'sztanga': 'barbell', 'sztangi': 'barbell', 'sztangą': 'barbell', 'sztandze': 'barbell', 'bb': 'barbell',
  'hantle': 'dumbbell', 'hantli': 'dumbbell', 'hantlami': 'dumbbell', 'hantlem': 'dumbbell', 'hantla': 'dumbbell', 'db': 'dumbbell',
  'kettlebell': 'kettlebell', 'kb': 'kettlebell', 'odważnik': 'kettlebell',
  'wyciąg': 'cable', 'wyciag': 'cable', 'wyciągu': 'cable', 'brama': 'cable', 'bramie': 'cable', 'linki': 'cable', 'linką': 'rope',
  'maszyna': 'lever', 'maszynie': 'lever',
  'wiosłowanie': 'bent over row', 'wioslowanie': 'bent over row',
  'podciąganie': 'pull-up', 'podciaganie': 'pull-up', 'podchwytem': 'chin-up', 'nachwytem': 'pull-up',
  'ściąganie': 'pulldown', 'sciaganie': 'pulldown', 'drążka': 'lat pulldown', 'drazka': 'lat pulldown',
  'rozpiętki': 'fly', 'rozpietki': 'fly',
  'pompki': 'push-up', 'poręczach': 'chest dip', 'poreczach': 'chest dip', 'dips': 'chest dip', 'dipy': 'chest dip',
  'uginanie': 'curl', 'młotkowe': 'hammer curl', 'mlotkowe': 'hammer curl', 'modlitewnik': 'preacher curl',
  'prostowanie': 'pushdown extension', 'francuskie': 'lying triceps extension skull crusher',
  'wznosy': 'lateral raise', 'bokiem': 'lateral raise', 'opadzie': 'rear',
  'wykroki': 'lunge', 'zakroki': 'lunge',
  'suwnica': 'leg press', 'suwnicy': 'leg press',
  'łydki': 'calf raise', 'lydki': 'calf raise', 'wspięcia': 'calf raise', 'wspiecia': 'calf raise',
  'brzuszki': 'crunch', 'allahy': 'kneeling crunch', 'allachy': 'kneeling crunch',
  'zwisie': 'hanging leg raise', 'deska': 'plank', 'talia': 'side bend twist', 'skłony': 'side bend', 'sklony': 'side bend',
  'bioder': 'glute bridge', 'pośladki': 'glute', 'posladki': 'glute'
};

// Normalize exercise name so numbering ("3.1."), sets ("3x8"), weights ("85kg") don't break GIF lookup
function normalizeExKey(rawName) {
  return String(rawName || '')
    .toLowerCase()
    .replace(/^\s*\d+(\.\d+)?\.?\s*/, '') // strip leading "1." or "3.1."
    .replace(/\b\d+\s*[x×]\s*\d+\b/gi, ' ') // strip "3x8"
    .replace(/\b\d+([.,]\d+)?\s*kg\b/gi, ' ') // strip "85kg"
    .replace(/[^a-z0-9ąćęłńóśźż\s-]/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Generic 1-word keys in EXERCISE_SLUG_MAP that should ONLY match if the query has no other specific modifiers
const GENERIC_SINGLE_KEYS = new Set([
  'deadlift', 'squat', 'lunge', 'lunges', 'dip', 'dips', 'plank', 'shrug', 'shrugs',
  'pulldown', 'biceps', 'rozpiętki', 'rozpietki', 'pompki', 'martwy ciąg', 'martwy ciag',
  'wiosłowanie', 'wioslowanie', 'podciąganie', 'podciaganie', 'przysiad', 'przysiady',
  'uginanie nóg', 'uginanie nog', 'uginanie ramion', 'prostowanie ramion', 'łydki', 'lydki'
]);

function resolveSavedGifEntry(entry) {
  if (!entry) return null;
  if (typeof entry === 'string') {
    const found = (STATE.exerciseGifs || []).find(item => item.s === entry || item.n.toLowerCase() === entry.toLowerCase());
    if (found) return found;
    if (entry.startsWith('http')) {
      return { s: 'custom-url', n: 'Własna animacja GIF', g: entry, m: 'Własny link', i: [] };
    }
    return null;
  }
  if (typeof entry === 'object') {
    if (entry.slug && STATE.exerciseGifs && STATE.exerciseGifs.length > 0) {
      const found = STATE.exerciseGifs.find(item => item.s === entry.slug);
      if (found) return found;
    }
    if (entry.url) {
      return {
        s: entry.slug || 'custom-url',
        n: entry.name || 'Przypisana animacja GIF',
        g: entry.url,
        m: entry.muscle || '',
        i: entry.instructions || []
      };
    }
  }
  return null;
}

function findExerciseGif(name, exerciseObj = null) {
  if (!name) return null;
  const clean = normalizeExKey(name);
  const rawLower = String(name).toLowerCase().trim();

  // 0. Check direct gifUrl / gifSlug stored on exerciseObj or inside STATE.plans / STATE.activeWorkout
  if (exerciseObj && (exerciseObj.gifUrl || exerciseObj.gifSlug)) {
    const directResolved = resolveSavedGifEntry({ slug: exerciseObj.gifSlug, url: exerciseObj.gifUrl, name: exerciseObj.gifName || name });
    if (directResolved) return directResolved;
  }

  for (const plan of (STATE.plans || [])) {
    for (const ex of (plan.exercises || [])) {
      if ((ex.name === name || normalizeExKey(ex.name) === clean) && (ex.gifUrl || ex.gifSlug)) {
        const planResolved = resolveSavedGifEntry({ slug: ex.gifSlug, url: ex.gifUrl, name: ex.gifName || ex.name });
        if (planResolved) return planResolved;
      }
    }
  }

  // 1. Check custom saved mapping in localStorage (by exact name, lowercase, or normalized key)
  const savedMappings = JSON.parse(localStorage.getItem('iron_custom_gif_map') || '{}');
  const mappedVal = savedMappings[name] || savedMappings[rawLower] || savedMappings[clean];
  if (mappedVal) {
    const resolved = resolveSavedGifEntry(mappedVal);
    if (resolved) return resolved;
  }

  if (!STATE.exerciseGifs || STATE.exerciseGifs.length === 0) return null;

  // Detect explicit parenthetical equipment override like "(sztanga)" or "(hantle)"
  let explicitEquip = null;
  if (/\(\s*sztang/i.test(name)) explicitEquip = 'barbell';
  else if (/\(\s*hantl/i.test(name)) explicitEquip = 'dumbbell';
  else if (/\(\s*(wyciąg|wyciag|bram)/i.test(name)) explicitEquip = 'cable';
  else if (/\(\s*maszyn/i.test(name)) explicitEquip = 'lever';

  // Special handling: "stiff leg" + barbell -> barbell-straight-leg-deadlift
  if ((clean.includes('stiff leg') || clean.includes('prostych')) && (explicitEquip === 'barbell' || clean.includes('sztang') || clean.includes('barbell'))) {
    const bbStiff = STATE.exerciseGifs.find(item => item.s === 'barbell-straight-leg-deadlift' || item.s === 'barbell-romanian-deadlift');
    if (bbStiff) return bbStiff;
  }

  // 2. Check exact key or specific multi-word phrase in EXERCISE_SLUG_MAP
  const sortedKeys = Object.keys(EXERCISE_SLUG_MAP).sort((a, b) => b.length - a.length);
  const cleanWordCount = clean.split(/\s+/).filter(Boolean).length;

  for (const key of sortedKeys) {
    // Do NOT let generic single-word keys ("deadlift", "squat", "przysiad") hijack multi-word exercise names
    if (GENERIC_SINGLE_KEYS.has(key) && clean !== key && cleanWordCount > key.split(/\s+/).length) {
      continue;
    }

    const regex = new RegExp(`(^|\\s|-)${key.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')}(\\s|-|$)`, 'i');
    if (clean === key || regex.test(clean)) {
      let slug = EXERCISE_SLUG_MAP[key];
      if (explicitEquip && !slug.startsWith(explicitEquip)) {
        const swappedSlug = slug.replace(/^(barbell|dumbbell|cable|lever)-/, `${explicitEquip}-`);
        const swappedItem = STATE.exerciseGifs.find(item => item.s === swappedSlug);
        if (swappedItem) return swappedItem;
      }
      const exactItem = STATE.exerciseGifs.find(item => item.s === slug);
      if (exactItem) return exactItem;
    }
  }

  // 3. Direct slug or English name match in database
  const directSlug = clean.replace(/\s+/g, '-');
  const direct = STATE.exerciseGifs.find(item => item.s === directSlug || item.n.toLowerCase() === clean);
  if (direct) return direct;

  // 4. Smart token translation & scoring algorithm (separates movement tokens from equipment tokens)
  const rawWords = clean.split(/[\s-]+/).filter(w => w.length > 1);
  const englishTokens = new Set();
  rawWords.forEach(w => {
    if (PL_TO_EN_TOKENS[w]) {
      PL_TO_EN_TOKENS[w].split(/\s+/).forEach(t => englishTokens.add(t));
    } else if (/^[a-z0-9]+$/.test(w)) {
      englishTokens.add(w);
    }
  });

  if (explicitEquip) {
    englishTokens.delete('dumbbell');
    englishTokens.delete('barbell');
    englishTokens.add(explicitEquip);
  }

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
  if (englishTokens.has('stiff') && englishTokens.has('barbell')) {
    englishTokens.add('straight');
  }

  const equipSet = new Set(['barbell', 'dumbbell', 'cable', 'lever', 'smith', 'kettlebell', 'band', 'ez', 'weighted']);
  const tokenArr = Array.from(englishTokens);
  const moveTokens = tokenArr.filter(t => !equipSet.has(t));
  const eqTokens = tokenArr.filter(t => equipSet.has(t));

  if (moveTokens.length > 0) {
    let bestItem = null;
    let bestScore = 0;
    const penaltyWords = ['band', 'ball', 'bosu', 'assisted', 'stretch', 'yoga', 'kneeling', 'one-arm', 'one-leg', 'single-leg', 'jump', 'smith', 'kettlebell'];

    for (const item of STATE.exerciseGifs) {
      const slugParts = item.s.split('-');
      let matchedMove = 0;
      for (const tok of moveTokens) {
        if (slugParts.includes(tok) || item.s.includes(tok)) {
          matchedMove++;
        }
      }
      // Require matching at least 1 movement token (and at least 2 if query has 2+ movement tokens)
      const minRequiredMove = moveTokens.length >= 2 ? 2 : 1;
      if (matchedMove < minRequiredMove) continue;

      let matchedEq = 0;
      for (const tok of eqTokens) {
        if (slugParts.includes(tok) || item.s.includes(tok)) {
          matchedEq++;
        }
      }

      let score = matchedMove * 18 + matchedEq * 12;
      if (matchedMove === moveTokens.length) score += 25;
      if (eqTokens.length > 0 && matchedEq === 0) score -= 14;
      if (eqTokens.length === 0 && (slugParts[0] === 'barbell' || slugParts[0] === 'dumbbell' || slugParts[0] === 'cable')) {
        score += 6;
      }

      for (const pen of penaltyWords) {
        if (item.s.includes(pen) && !tokenArr.includes(pen)) {
          score -= 12;
        }
      }
      score -= slugParts.length * 1.2;

      if (score > bestScore) {
        bestScore = score;
        bestItem = item;
      }
    }

    if (bestItem && bestScore >= 20) {
      return bestItem;
    }
  }

  return null;
}

let currentModalExerciseName = '';
let currentEditingModalRow = null;
let currentEditingPlanRef = null;

function updateModalRowGifPreview(row, gifObj) {
  if (!row) return;
  const slug = (gifObj && (gifObj.s || gifObj.slug || gifObj.gifSlug)) || '';
  const url = (gifObj && (gifObj.g || gifObj.url || gifObj.gifUrl)) || '';
  const gName = (gifObj && (gifObj.n || gifObj.name || gifObj.gifName)) || '';

  row.dataset.gifSlug = slug;
  row.dataset.gifUrl = url;
  row.dataset.gifName = gName;

  const thumb = row.querySelector('.modal-ex-gif-thumb');
  const emptyIcon = row.querySelector('.modal-ex-gif-empty');
  const titleEl = row.querySelector('.modal-ex-gif-title');
  const gifBtn = row.querySelector('.modal-ex-gif-btn');

  if (url) {
    if (thumb) {
      thumb.src = url;
      thumb.style.display = 'block';
    }
    if (emptyIcon) emptyIcon.style.display = 'none';
    if (titleEl) {
      titleEl.textContent = `🎬 ${gName || 'Przypisany GIF'}`;
      titleEl.style.color = 'var(--success)';
    }
    if (gifBtn) {
      gifBtn.textContent = '🎬 Zmień GIF';
      gifBtn.style.borderColor = 'var(--success)';
      gifBtn.style.color = 'var(--success)';
    }
  } else {
    if (thumb) {
      thumb.src = '';
      thumb.style.display = 'none';
    }
    if (emptyIcon) emptyIcon.style.display = 'flex';
    if (titleEl) {
      titleEl.textContent = 'Brak przypisanego GIFa';
      titleEl.style.color = 'var(--text-muted)';
    }
    if (gifBtn) {
      gifBtn.textContent = '🎬 Ustaw GIF';
      gifBtn.style.borderColor = 'var(--accent)';
      gifBtn.style.color = 'var(--accent)';
    }
  }
}

// Persist GIF assignment (both slug and direct URL) in localStorage, STATE.plans, STATE.activeWorkout, and Plan Modal
function persistExerciseGifAssignment(exerciseName, gifObj) {
  if (!exerciseName || !gifObj) return;
  const normKey = normalizeExKey(exerciseName);
  const rawLower = String(exerciseName).toLowerCase().trim();
  const payload = {
    slug: gifObj.s || gifObj.slug || 'custom-url',
    url: gifObj.g || gifObj.url || '',
    name: gifObj.n || gifObj.name || exerciseName,
    muscle: gifObj.m || gifObj.muscle || '',
    instructions: gifObj.i || gifObj.instructions || []
  };

  // 1. Save in iron_custom_gif_map under raw, lowercase, and normalized keys
  const savedMappings = JSON.parse(localStorage.getItem('iron_custom_gif_map') || '{}');
  savedMappings[exerciseName] = payload;
  savedMappings[rawLower] = payload;
  if (normKey) savedMappings[normKey] = payload;
  localStorage.setItem('iron_custom_gif_map', JSON.stringify(savedMappings));

  // 2. Save directly on matching exercises in STATE.plans (and specific plan exercise if opened from Plan Card)
  let plansUpdated = false;
  if (currentEditingPlanRef) {
    const targetPlan = (STATE.plans || []).find(p => p.id === currentEditingPlanRef.planId);
    if (targetPlan && targetPlan.exercises && targetPlan.exercises[currentEditingPlanRef.exIdx]) {
      const targetEx = targetPlan.exercises[currentEditingPlanRef.exIdx];
      targetEx.gifSlug = payload.slug;
      targetEx.gifUrl = payload.url;
      targetEx.gifName = payload.name;
      plansUpdated = true;
    }
  }
  (STATE.plans || []).forEach(plan => {
    (plan.exercises || []).forEach(ex => {
      if (ex.name === exerciseName || (normKey && normalizeExKey(ex.name) === normKey)) {
        ex.gifSlug = payload.slug;
        ex.gifUrl = payload.url;
        ex.gifName = payload.name;
        plansUpdated = true;
      }
    });
  });
  if (plansUpdated) {
    localStorage.setItem('iron_plans', JSON.stringify(STATE.plans));
    renderPlans();
  }

  // 3. Save on STATE.activeWorkout if active
  if (STATE.activeWorkout && Array.isArray(STATE.activeWorkout.exercises)) {
    let activeUpdated = false;
    STATE.activeWorkout.exercises.forEach(ex => {
      if (ex.name === exerciseName || (normKey && normalizeExKey(ex.name) === normKey)) {
        ex.gifSlug = payload.slug;
        ex.gifUrl = payload.url;
        ex.gifName = payload.name;
        activeUpdated = true;
      }
    });
    if (activeUpdated) {
      localStorage.setItem('iron_active_workout', JSON.stringify(STATE.activeWorkout));
    }
  }

  // 4. Update currently edited row in Plan Editor modal + any matching rows
  if (currentEditingModalRow) {
    currentEditingModalRow.dataset.gifLocked = '1';
    updateModalRowGifPreview(currentEditingModalRow, payload);
  }
  document.querySelectorAll('#modal-exercises-list .modal-ex-row').forEach(row => {
    const nameInput = row.querySelector('.modal-ex-name');
    if (nameInput && (nameInput.value.trim() === exerciseName || (normKey && normalizeExKey(nameInput.value) === normKey))) {
      row.dataset.gifLocked = '1';
      updateModalRowGifPreview(row, payload);
    }
  });
}

// Gemini AI matcher that selects the exact slug from exercises_db.json and saves it permanently
async function autoMatchGifWithGemini(exerciseName) {
  if (!exerciseName) return null;
  if (!STATE.apiKey || !STATE.exerciseGifs || STATE.exerciseGifs.length === 0) {
    alert('Upewnij się, że masz wpisany klucz Gemini API w Opcjach.');
    return null;
  }
  const instr = document.getElementById('gif-modal-instructions');
  if (instr && currentModalExerciseName === exerciseName) {
    instr.innerHTML = `<div style="color: var(--accent); padding: 10px;">🤖 Agent AI analizuje nazwę "${escapeHtml(exerciseName)}" i wybiera najlepszą animację z bazy 1324 ćwiczeń...</div>`;
  }

  try {
    // Step 1: Ask Gemini to translate the exercise into 3-5 English search tokens + primary candidate slugs
    const prompt1 = `
Jesteś ekspertem biomechaniki i siłowni. Użytkownik ma w planie ćwiczenie: "${exerciseName}".
Uwaga: jeśli w nawiasie jest podany sprzęt np. "(sztanga)" lub "(hantle)", to ten sprzęt ma priorytet nad skrótem w nazwie (np. "Stiff Leg DB Deadlift (sztanga)" oznacza martwy ciąg na prostych nogach ze SZTANGĄ czyli barbell).
Zwróć obiekt JSON bez markdown:
{
  "keywords": ["słowo1", "słowo2", "słowo3"],
  "equipment": "barbell | dumbbell | cable | lever | bodyweight | kettlebell | band | ez-barbell"
}`;
    const res1 = await callGemini(prompt1, 'fast');
    const parsed1 = JSON.parse(res1.replace(/```json/g, '').replace(/```/g, '').trim());
    const kws = (parsed1.keywords || []).map(k => String(k).toLowerCase());
    const eq = String(parsed1.equipment || '').toLowerCase();

    // Filter STATE.exerciseGifs to top 45 candidates matching any keyword
    const scoredCandidates = STATE.exerciseGifs.map(item => {
      let s = 0;
      for (const kw of kws) {
        if (item.s.includes(kw) || item.n.toLowerCase().includes(kw)) s += 10;
      }
      if (eq && item.s.startsWith(eq)) s += 8;
      return { item, s };
    }).filter(x => x.s > 0).sort((a, b) => b.s - a.s).slice(0, 45);

    const candidateListText = (scoredCandidates.length > 0 ? scoredCandidates.map(c => c.item.s) : STATE.exerciseGifs.slice(0, 45).map(c => c.s)).join(', ');

    // Step 2: Ask Gemini to pick the single best exact slug from the candidate list
    const prompt2 = `
Dla ćwiczenia "${exerciseName}" wybierz JEDEN najlepiej pasujący identyfikator (slug) z poniższej listy dostępnych animacji w bazie:
[${candidateListText}]
Zwróć wyłącznie sam wybrany slug (np. barbell-straight-leg-deadlift), bez żadnych innych słów.`;

    const chosenSlugRaw = await callGemini(prompt2, 'fast');
    const chosenSlug = chosenSlugRaw.toLowerCase().replace(/[^a-z0-9-]/g, '').trim();
    const exactMatch = STATE.exerciseGifs.find(item => item.s === chosenSlug)
      || (scoredCandidates[0] && scoredCandidates[0].item);

    if (exactMatch) {
      persistExerciseGifAssignment(exerciseName, exactMatch);
      if (currentModalExerciseName === exerciseName) {
        renderGifModalMatch(exactMatch, true);
      }
      return exactMatch;
    }
  } catch (e) {
    console.warn('AI GIF matching failed:', e);
    if (instr && currentModalExerciseName === exerciseName) {
      instr.innerHTML = `<div style="color: var(--danger); padding: 8px;">⚠️ Nie udało się dopasować automatycznie: ${escapeHtml(e.message)}</div>`;
    }
  }
  return null;
}

// Batch AI matcher for all exercises in the currently open Plan Editor modal
async function batchMatchModalPlanGifsWithGemini() {
  if (!STATE.apiKey) {
    return alert('Najpierw wpisz klucz Gemini API w zakładce Opcje!');
  }
  const rows = Array.from(document.querySelectorAll('#modal-exercises-list .modal-ex-row'));
  const names = rows.map(r => r.querySelector('.modal-ex-name')?.value.trim()).filter(Boolean);
  if (names.length === 0) return alert('Najpierw dodaj ćwiczenia do planu!');

  let matchedCount = 0;
  for (const exName of names) {
    const m = await autoMatchGifWithGemini(exName);
    if (m) matchedCount++;
  }
  alert(`✅ Agent AI dopasował i zapisał na stałe linki do GIFów dla ${matchedCount}/${names.length} ćwiczeń! Kliknij "Zapisz Plan", aby zachować.`);
}

function renderGifModalMatch(match, justSaved = false) {
  const img = document.getElementById('gif-modal-img');
  const instr = document.getElementById('gif-modal-instructions');
  const urlInput = document.getElementById('gif-custom-url-input');
  const resultsBox = document.getElementById('gif-search-results');
  if (resultsBox) resultsBox.style.display = 'none';

  if (match && match.g) {
    img.src = match.g;
    img.style.display = 'block';
    if (urlInput) urlInput.value = match.g;
    instr.innerHTML = `
      <div style="color: ${justSaved ? 'var(--success)' : 'var(--primary)'}; font-weight: 700; margin-bottom: 4px;">
        ${justSaved ? '✅ Przypisano do ćwiczenia w planie (i eksporcie JSON): ' : '🎬 '}${escapeHtml(match.n)}
      </div>
      ${match.m ? `<div style="font-size: 12px; color: var(--text-muted); margin-bottom: 6px;">Partia: ${escapeHtml(match.m)}</div>` : ''}
      ${(match.i || []).map(step => `<li style="margin-bottom: 3px; font-size: 12px;">${escapeHtml(step)}</li>`).join('')}
    `;
  }
}

function openGifModal(exerciseName, existingExObj = null) {
  currentModalExerciseName = exerciseName;
  const match = findExerciseGif(exerciseName, existingExObj);
  const modal = document.getElementById('gif-preview-modal');
  const title = document.getElementById('gif-modal-title');
  const img = document.getElementById('gif-modal-img');
  const instr = document.getElementById('gif-modal-instructions');
  const searchInput = document.getElementById('gif-search-input');
  const urlInput = document.getElementById('gif-custom-url-input');
  const ytBtn = document.getElementById('gif-youtube-btn');
  if (searchInput) searchInput.value = '';

  title.textContent = exerciseName;
  if (ytBtn) {
    ytBtn.href = `https://www.youtube.com/results?search_query=${encodeURIComponent('ćwiczenie ' + exerciseName + ' technika')}`;
    ytBtn.innerHTML = `▶️ Sprawdź technikę „${escapeHtml(exerciseName)}” na YouTube`;
  }

  if (match && match.g) {
    renderGifModalMatch(match, false);
  } else {
    img.style.display = 'none';
    if (urlInput) urlInput.value = '';
    instr.innerHTML = `
      <p style="color: var(--text-muted); margin: 10px 0; font-size: 13px;">Nie przypisano jeszcze animacji GIF dla tej nazwy. Wyszukaj poniżej (po polsku lub angielsku), sprawdź na YouTube lub wklej bezpośredni link.</p>
    `;
    if (STATE.apiKey) {
      autoMatchGifWithGemini(exerciseName);
    }
  }

  modal.style.display = 'flex';
}

function openGifModalForPlanExercise(planId, exIdx) {
  const plan = (STATE.plans || []).find(p => p.id === planId);
  if (!plan || !plan.exercises || !plan.exercises[exIdx]) return;
  const ex = plan.exercises[exIdx];
  currentEditingModalRow = null;
  currentEditingPlanRef = { planId, exIdx };
  openGifModal(ex.name, ex);
}

function handleGifSearch(query) {
  const q = query.toLowerCase().trim();
  const resultsBox = document.getElementById('gif-search-results');
  if (!q || q.length < 2) {
    resultsBox.style.display = 'none';
    return;
  }

  // Translate Polish words in search query so user can search in Polish OR English!
  const qWords = q.split(/\s+/).filter(Boolean);
  const expandedTokens = [];
  qWords.forEach(w => {
    expandedTokens.push(w);
    if (PL_TO_EN_TOKENS[w]) {
      PL_TO_EN_TOKENS[w].split(/\s+/).forEach(t => expandedTokens.push(t));
    }
  });

  const matches = STATE.exerciseGifs
    .map(item => {
      const nameLower = item.n.toLowerCase();
      let score = 0;
      if (nameLower.includes(q) || item.s.includes(q.replace(/\s+/g, '-'))) score += 30;
      for (const tok of expandedTokens) {
        if (tok.length >= 2 && (nameLower.includes(tok) || item.s.includes(tok))) {
          score += 10;
        }
      }
      return { item, score };
    })
    .filter(x => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 30)
    .map(x => x.item);

  if (matches.length === 0) {
    resultsBox.innerHTML = '<div style="padding: 8px; font-size: 12px; color: var(--text-muted);">Brak wyników w bazie.</div>';
    resultsBox.style.display = 'block';
    return;
  }

  resultsBox.innerHTML = matches.map(m => `
    <div onclick="selectCustomGif('${escapeHtml(m.s)}')" style="padding: 6px 8px; border-bottom: 1px solid var(--border); cursor: pointer; text-align: left; font-size: 13px; display: flex; justify-content: space-between; align-items: center; gap: 8px;">
      <div style="display: flex; align-items: center; gap: 8px; min-width: 0; flex: 1;">
        <img src="${escapeHtml(m.g)}" alt="" loading="lazy" style="width: 40px; height: 40px; border-radius: 6px; object-fit: cover; background: #fff; flex-shrink: 0;">
        <div style="min-width: 0; flex: 1;">
          <div style="font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${escapeHtml(m.n)}</div>
          <div style="font-size: 11px; color: var(--text-muted);">Partia: ${escapeHtml(m.m)} • <span style="font-family: monospace; font-size: 10px;">${escapeHtml(m.s)}</span></div>
        </div>
      </div>
      <span style="font-size: 11px; font-weight: 700; color: var(--accent); flex-shrink: 0;">Wybierz</span>
    </div>
  `).join('');
  resultsBox.style.display = 'block';
}

function selectCustomGif(slug) {
  const match = STATE.exerciseGifs.find(item => item.s === slug);
  if (!match) return;

  persistExerciseGifAssignment(currentModalExerciseName, match);
  renderGifModalMatch(match, true);
}

function saveCustomGifUrl() {
  const urlInput = document.getElementById('gif-custom-url-input');
  const customUrl = (urlInput ? urlInput.value : '').trim();
  if (!customUrl) return alert('Wklej poprawny link URL do animacji GIF!');

  // Check if this URL matches an existing ExerciseDB entry
  const existing = (STATE.exerciseGifs || []).find(item => item.g === customUrl);
  const gifObj = existing || {
    s: 'custom-url',
    n: currentModalExerciseName || 'Własna animacja GIF',
    g: customUrl,
    m: 'Własny link URL',
    i: []
  };

  persistExerciseGifAssignment(currentModalExerciseName, gifObj);
  renderGifModalMatch(gifObj, true);
}

function closeGifModal() {
  const modal = document.getElementById('gif-preview-modal');
  modal.style.display = 'none';
  const img = document.getElementById('gif-modal-img');
  img.src = '';
  currentEditingModalRow = null;
  currentEditingPlanRef = null;
}

// ============================================================================
// SERVICE WORKER & NAVIGATION
// ============================================================================
function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').then(reg => {
      try { reg.update(); } catch (e) {}
    }).catch(console.error);
  }
}

function showView(viewName) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(btn => btn.classList.remove('active'));
  
  const target = document.getElementById(`view-${viewName}`);
  if (target) target.classList.add('active');

  const navMap = { 'home': 0, 'nutrition': 1, 'body': 2, 'analysis': 3, 'coach': 4 };
  const navBtns = document.querySelectorAll('.bottom-nav .nav-item');
  if (navMap[viewName] !== undefined && navBtns[navMap[viewName]]) {
    navBtns[navMap[viewName]].classList.add('active');
  }

  if (viewName === 'home') {
    renderHomeKpis();
    if (typeof renderCalendarDashboard === 'function') renderCalendarDashboard();
  } else if (viewName === 'nutrition') {
    renderNutritionView();
  } else if (viewName === 'body') {
    renderBodyMeasurementsView();
  } else if (viewName === 'analysis') {
    refreshCoachReportBox();
  } else if (viewName === 'coach') {
    renderCoachThreadsBar();
    renderCoachChat();
  } else if (viewName === 'settings') {
    if (typeof loadGoogleDriveConfig === 'function') loadGoogleDriveConfig();
  }

  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function renderHomeKpis() {
  const workoutsEl = document.getElementById('home-kpi-workouts');
  const volumeEl = document.getElementById('home-kpi-volume');
  const weightEl = document.getElementById('home-kpi-weight');

  if (workoutsEl) {
    workoutsEl.textContent = String((STATE.history || []).length);
  }
  if (volumeEl) {
    const latestSession = (STATE.history || [])[0];
    volumeEl.textContent = latestSession ? `${latestSession.totalVolumeKg || 0} kg` : '0 kg';
  }
  if (weightEl) {
    const latestScale = (STATE.bodyMeasurements || []).find(m => m.weightKg);
    const w = (latestScale && latestScale.weightKg) || (STATE.userProfile && STATE.userProfile.weightKg);
    weightEl.textContent = w ? `${w} kg` : 'Ustaw';
  }
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
const expandedPlanPreviews = new Set();

function togglePlanExercisesPreview(planId) {
  if (expandedPlanPreviews.has(planId)) {
    expandedPlanPreviews.delete(planId);
  } else {
    expandedPlanPreviews.add(planId);
  }
  renderPlans();
}

function renderPlans() {
  const container = document.getElementById('plans-list');
  if (!container) return;
  renderHomeKpis();

  if (STATE.plans.length === 0) {
    container.innerHTML = `
      <div class="card" style="text-align: center; padding: 24px 16px;">
        <div style="font-size: 28px; margin-bottom: 6px;">📋</div>
        <div style="font-weight: 700; font-size: 15px; margin-bottom: 4px;">Brak planów treningowych</div>
        <p style="color: var(--text-muted); font-size: 13px; margin-bottom: 14px;">Stwórz własny plan lub wklej swoją notatkę z Google Keep.</p>
        <div style="display: flex; gap: 8px; justify-content: center;">
          <button class="btn btn-sm btn-accent" onclick="showView('import-keep')">📥 Import z Keep</button>
          <button class="btn btn-sm btn-primary" onclick="openNewPlanModal()">➕ Nowy Plan</button>
        </div>
      </div>
    `;
    return;
  }

  container.innerHTML = STATE.plans.map(plan => {
    const restSec = plan.restSeconds || 90;
    const ssRestSec = plan.supersetRestSeconds || 30;
    const exercises = plan.exercises || [];
    const hasSupersets = exercises.some(e => e.supersetGroup);
    const isExpanded = expandedPlanPreviews.has(plan.id);

    // Count how many exercises already have an assigned GIF
    let gifAssignedCount = 0;
    const exListHtml = exercises.map((ex, exIdx) => {
      const matched = findExerciseGif(ex.name, ex);
      const gifUrl = ex.gifUrl || (matched ? matched.g : '');
      const gifName = ex.gifName || (matched ? matched.n : '');
      const hasGif = Boolean(gifUrl);
      if (hasGif) gifAssignedCount++;
      const ssTag = ex.supersetGroup ? `<span style="color: var(--accent); font-weight: 700; font-size: 11px;">[SS ${escapeHtml(ex.supersetGroup)}]</span> ` : '';
      const loadInfo = ex.loadType === 'bodyweight'
        ? (ex.weight > 0 ? `+${ex.weight}kg` : 'Masa ciała')
        : (ex.loadType === 'dual_dumbbell' ? `2×${ex.weight || 0}kg` : `${ex.weight || 0}kg`);
      const singleRestInfo = (!ex.supersetGroup && ex.restSeconds) ? ` • ⏱️ ${ex.restSeconds}s` : '';

      return `
        <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 6px 8px; background: var(--surface-elevated); border: 1px solid var(--border); border-radius: 8px;">
          <div style="display: flex; align-items: center; gap: 8px; min-width: 0; flex: 1;">
            ${hasGif
              ? `<img src="${escapeHtml(gifUrl)}" alt="GIF" onclick="openGifModalForPlanExercise('${plan.id}', ${exIdx})" style="width: 34px; height: 34px; border-radius: 6px; object-fit: cover; background: #fff; border: 1px solid rgba(0,230,118,0.4); cursor: pointer; flex-shrink: 0;">`
              : `<div onclick="openGifModalForPlanExercise('${plan.id}', ${exIdx})" style="width: 34px; height: 34px; border-radius: 6px; background: rgba(255,255,255,0.05); border: 1px dashed var(--border); display: flex; align-items: center; justify-content: center; font-size: 14px; cursor: pointer; flex-shrink: 0;">🎬</div>`
            }
            <div style="min-width: 0; flex: 1;">
              <div style="font-size: 12px; font-weight: 700; color: var(--text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                ${ssTag}${escapeHtml(ex.name)}
              </div>
              <div style="font-size: 10px; color: ${hasGif ? 'var(--success)' : 'var(--text-muted)'}; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                ${ex.sets || 3}×${ex.reps || 10} (${loadInfo})${singleRestInfo} • ${hasGif ? `🎬 ${escapeHtml(gifName || 'Przypisany GIF')}` : '⚠️ Brak GIFa'}
              </div>
            </div>
          </div>
          <button type="button" class="btn btn-sm btn-secondary" style="width: auto; padding: 4px 8px; font-size: 11px; flex-shrink: 0; ${hasGif ? 'border-color: rgba(0,230,118,0.4); color: var(--success);' : 'border-color: var(--accent); color: var(--accent);'}" onclick="openGifModalForPlanExercise('${plan.id}', ${exIdx})">
            🎬 ${hasGif ? 'Zmień' : 'Ustaw'}
          </button>
        </div>
      `;
    }).join('');

    // Compact summary of first 3 exercise names when collapsed
    const compactExSummary = exercises.slice(0, 3).map(e => escapeHtml(e.name)).join(' • ') + (exercises.length > 3 ? ` (+${exercises.length - 3})` : '');
    const customSsSummaries = Object.entries(plan.supersets || {})
      .filter(([grp, cfg]) => cfg && (cfg.restSeconds || cfg.supersetRestSeconds))
      .map(([grp, cfg]) => `SS ${grp} (⚡ ${cfg.supersetRestSeconds || ssRestSec}s / ⏱️ ${cfg.restSeconds || restSec}s)`);

    return `
      <div class="card" style="padding: 14px; margin-bottom: 12px;">
        <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 10px; margin-bottom: 6px;">
          <div style="min-width: 0; flex: 1;">
            <div style="font-size: 16px; font-weight: 800; color: var(--text);">${escapeHtml(plan.name)}</div>
            <div style="font-size: 12px; color: var(--text-muted); margin-top: 2px;">
              <b>${exercises.length}</b> ćw. • ⏱️ ${restSec}s ${hasSupersets ? `/ ⚡ SS ${ssRestSec}s` : ''} • <span style="color: ${gifAssignedCount === exercises.length ? 'var(--success)' : 'var(--accent)'};">🎬 GIFy: ${gifAssignedCount}/${exercises.length}</span>
            </div>
            ${customSsSummaries.length > 0 ? `
              <div style="font-size: 11px; color: var(--accent); margin-top: 3px; font-weight: 600;">
                ⚡ Indywidualne czasy SS: ${escapeHtml(customSsSummaries.join(' • '))}
              </div>
            ` : ''}
          </div>
          <button class="btn btn-sm btn-primary" style="padding: 8px 16px; font-size: 13px; flex-shrink: 0;" onclick="startWorkout('${plan.id}')">▶ Start</button>
        </div>

        ${!isExpanded && exercises.length > 0 ? `
          <div style="font-size: 11px; color: var(--text-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin-bottom: 10px; padding: 5px 8px; background: rgba(255,255,255,0.03); border-radius: 6px;">
            ${compactExSummary}
          </div>
        ` : ''}

        ${isExpanded && exercises.length > 0 ? `
          <div style="display: flex; flex-direction: column; gap: 5px; margin: 10px 0;">
            ${exListHtml}
          </div>
        ` : ''}

        <div style="display: flex; justify-content: space-between; align-items: center; gap: 6px; padding-top: 6px; border-top: 1px solid rgba(255,255,255,0.06);">
          <button type="button" class="btn btn-sm btn-secondary" style="font-size: 11px; padding: 5px 10px; color: var(--accent); border-color: rgba(0,229,255,0.28);" onclick="togglePlanExercisesPreview('${plan.id}')">
            🎬 ${isExpanded ? 'Ukryj ćwiczenia i GIFy ▴' : `Ćwiczenia i GIFy (${exercises.length}) ▾`}
          </button>
          <div style="display: flex; gap: 6px;">
            <button class="btn btn-sm btn-secondary" style="font-size: 11px; padding: 5px 10px;" onclick="openEditPlanModal('${plan.id}')">✏️ Edytuj</button>
            <button class="btn btn-sm btn-secondary" style="font-size: 11px; padding: 5px 8px; color: var(--danger); border-color: rgba(255,82,82,0.3);" onclick="deletePlan('${plan.id}')" title="Usuń plan">🗑️</button>
          </div>
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
  renderHomeKpis();
  if (!container) return;

  if (STATE.history.length === 0) {
    container.innerHTML = `<p style="color: var(--text-muted); font-size: 13px;">Brak zakończonych treningów.</p>`;
    return;
  }

  container.innerHTML = STATE.history.slice(0, 10).map(session => {
    const durSec = session.durationSeconds || (session.endTime && session.startTime ? Math.round((session.endTime - session.startTime) / 1000) : 0);
    const durText = durSec > 0 ? `⏱️ ${formatDuration(durSec)}` : '';
    const avgRestText = session.avgRestSeconds ? ` • Przerwa: ${session.avgRestSeconds}s` : '';
    const hasAi = Boolean(session.coachFeedback);
    return `
      <div class="card" style="padding: 12px 14px; margin-bottom: 10px;">
        <div style="display: flex; justify-content: space-between; align-items: center; gap: 8px;">
          <div style="min-width: 0; flex: 1;">
            <div style="font-size: 14px; font-weight: 800; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
              ${escapeHtml(session.planName || 'Trening')}
            </div>
            <div style="color: var(--text-muted); font-size: 11px; margin-top: 2px;">
              ${new Date(session.endTime || Date.now()).toLocaleDateString('pl-PL', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })} • <b>${session.completedSets || 0}</b> serii ${durText ? ' • ' + durText : ''}${avgRestText}
            </div>
          </div>
          <div style="display: flex; align-items: center; gap: 6px; flex-shrink: 0;">
            <span class="badge badge-cyan" style="font-size: 11px;">${session.totalVolumeKg || 0} kg</span>
            <button class="btn btn-sm btn-secondary" style="font-size: 11px; padding: 5px 9px; ${hasAi ? 'border-color: rgba(0,230,118,0.4); color: var(--success);' : ''}" onclick="viewHistoryReport('${session.id}')">
              ${hasAi ? '📊 Raport AI' : '✨ Analizuj'}
            </button>
            <button class="btn btn-sm btn-secondary" style="font-size: 11px; padding: 5px 8px; color: var(--danger); border-color: rgba(255,82,82,0.3);" onclick="deleteHistorySession('${session.id}')" title="Usuń sesję">🗑️</button>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

function deleteHistorySession(sessionId, skipConfirm = false) {
  if (!skipConfirm && !confirm('Czy na pewno chcesz usunąć ten zapis treningu?')) return false;
  STATE.history = STATE.history.filter(s => s.id !== sessionId);
  localStorage.setItem('iron_history', JSON.stringify(STATE.history));
  if (STATE.currentCoachReportSessionId === sessionId) {
    STATE.currentCoachReportSessionId = null;
  }
  renderRecentWorkouts();
  if (typeof renderCalendarDashboard === 'function') renderCalendarDashboard();
  refreshCoachReportBox();
  return true;
}

function deleteTestWorkoutFromCoach(sessionId) {
  const deleted = deleteHistorySession(sessionId, false);
  if (deleted) {
    showView('home');
  }
}

// ============================================================================
// SET EFFORT / RPE RATING SCALE (1 = Lekko ... 5 = Bardzo ciężko, 6 = Hardcore)
// ============================================================================
const SET_EFFORT_SCALE = {
  1: {
    val: 1,
    short: 'Lekko',
    icon: '🟢',
    color: '#00E676',
    bg: 'rgba(0, 230, 118, 0.16)',
    hint: 'Duży zapas (4+ powt.) — sygnał, żeby dołożyć ciężar!'
  },
  2: {
    val: 2,
    short: 'Spokojnie',
    icon: '🩵',
    color: '#00E5FF',
    bg: 'rgba(0, 229, 255, 0.16)',
    hint: 'Dobry zapas (~3 powt.) — można lekko podbić ciężar'
  },
  3: {
    val: 3,
    short: 'Optymalnie',
    icon: '🟡',
    color: '#FFB300',
    bg: 'rgba(255, 179, 0, 0.18)',
    hint: 'W sam raz (2 powt. w zapasie) — idealny bodziec'
  },
  4: {
    val: 4,
    short: 'Ciężko',
    icon: '🟠',
    color: '#FF9100',
    bg: 'rgba(255, 145, 0, 0.20)',
    hint: 'Mocna seria (~1 powt. w zapasie) — utrzymaj lub +1 powt.'
  },
  5: {
    val: 5,
    short: 'B. ciężko',
    fullLabel: 'Bardzo ciężko',
    icon: '🔥',
    color: '#FF5722',
    bg: 'rgba(255, 87, 34, 0.22)',
    hint: 'Blisko upadku (0–0.5 powt. w zapasie) — zostań na tym ciężarze'
  },
  6: {
    val: 6,
    short: 'Hardcore',
    icon: '🔴',
    color: '#FF1744',
    bg: 'rgba(255, 23, 68, 0.24)',
    hint: 'Absolutny maks / upadek mięśniowy — nie dokładaj ciężaru'
  }
};

function getSetEffortMeta(rating) {
  const n = parseInt(rating);
  return SET_EFFORT_SCALE[n] || null;
}

function isCalisthenicsExercise(ex) {
  if (!ex) return false;
  return (ex.loadType || 'standard') === 'bodyweight' && !ex.showExtraWeight;
}

function formatRelativeWorkoutTime(msTs, workoutStartTs) {
  if (!msTs || !workoutStartTs) return '00:00';
  const diffSec = Math.max(0, Math.floor((msTs - workoutStartTs) / 1000));
  const hrs = Math.floor(diffSec / 3600);
  const mins = Math.floor((diffSec % 3600) / 60);
  const secs = diffSec % 60;
  if (hrs > 0) {
    return `${hrs}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

function getExerciseProgressionBadge(avgEffort) {
  if (!avgEffort || isNaN(avgEffort)) return '';
  if (avgEffort <= 2.4) {
    return `<span style="color: var(--success); font-weight: 800; font-size: 11px;">📈 Dołóż ciężar (${avgEffort.toFixed(1)}/6)</span>`;
  }
  if (avgEffort <= 4.3) {
    return `<span style="color: var(--primary); font-weight: 800; font-size: 11px;">🎯 Optymalnie (${avgEffort.toFixed(1)}/6)</span>`;
  }
  return `<span style="color: var(--danger); font-weight: 800; font-size: 11px;">🔥 Na limicie (${avgEffort.toFixed(1)}/6)</span>`;
}

function renderAnalysisSessionOverview(session) {
  const box = document.getElementById('analysis-session-overview');
  if (!box) return;
  if (!session) {
    box.innerHTML = '';
    return;
  }

  const durSec = session.durationSeconds || (session.endTime && session.startTime ? Math.round((session.endTime - session.startTime) / 1000) : 0);
  // Group sets by exercise name
  const exMap = new Map();
  (session.sets || []).forEach(s => {
    const key = s.exercise || 'Ćwiczenie';
    if (!exMap.has(key)) {
      exMap.set(key, { count: 0, maxW: 0, vol: 0, repsTotal: 0, loadType: s.loadType, efforts: [] });
    }
    const item = exMap.get(key);
    item.count++;
    const effW = s.effectiveWeight != null ? s.effectiveWeight : (s.loadType === 'dual_dumbbell' ? (s.weight || 0) * 2 : (s.weight || 0));
    if (effW > item.maxW) item.maxW = effW;
    item.vol += effW * (s.reps || 0);
    item.repsTotal += (s.reps || 0);
    if (s.effort && SET_EFFORT_SCALE[s.effort]) {
      item.efforts.push(parseInt(s.effort));
    }
  });

  const exRowsHtml = Array.from(exMap.entries()).map(([name, info]) => {
    const avgEffort = info.efforts.length > 0
      ? info.efforts.reduce((a, b) => a + b, 0) / info.efforts.length
      : null;
    const progBadge = avgEffort ? ` • ${getExerciseProgressionBadge(avgEffort)}` : '';
    return `
      <div style="display: flex; justify-content: space-between; align-items: center; padding: 6px 8px; font-size: 12px; border-bottom: 1px solid rgba(255,255,255,0.05); gap: 6px; flex-wrap: wrap;">
        <span style="font-weight: 700; color: var(--text);">${escapeHtml(name)}</span>
        <span style="color: var(--text-muted); font-size: 11px;">
          <b>${info.count}</b> ser. (${info.repsTotal} powt.) • ${info.maxW > 0 ? `max <b>${info.maxW}kg</b>` : `<span style="color: var(--success);">Masa ciała</span>`}${progBadge}
        </span>
      </div>
    `;
  }).join('');

  box.innerHTML = `
    <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; margin-bottom: 10px;">
      <div style="background: var(--surface-elevated); border: 1px solid var(--border); border-radius: 8px; padding: 8px 4px; text-align: center;">
        <div style="font-size: 14px; font-weight: 800; color: var(--primary);">${session.totalVolumeKg || 0} kg</div>
        <div style="font-size: 9px; color: var(--text-muted); text-transform: uppercase;">Tonaż</div>
      </div>
      <div style="background: var(--surface-elevated); border: 1px solid var(--border); border-radius: 8px; padding: 8px 4px; text-align: center;">
        <div style="font-size: 14px; font-weight: 800; color: var(--accent);">${formatDuration(durSec)}</div>
        <div style="font-size: 9px; color: var(--text-muted); text-transform: uppercase;">Czas</div>
      </div>
      <div style="background: var(--surface-elevated); border: 1px solid var(--border); border-radius: 8px; padding: 8px 4px; text-align: center;">
        <div style="font-size: 14px; font-weight: 800; color: var(--text);">${session.completedSets || 0}</div>
        <div style="font-size: 9px; color: var(--text-muted); text-transform: uppercase;">Serie</div>
      </div>
      <div style="background: var(--surface-elevated); border: 1px solid var(--border); border-radius: 8px; padding: 8px 4px; text-align: center;">
        <div style="font-size: 14px; font-weight: 800; color: var(--success);">${session.avgRestSeconds || 0}s</div>
        <div style="font-size: 9px; color: var(--text-muted); text-transform: uppercase;">Śr. przerwa</div>
      </div>
    </div>
    ${exRowsHtml ? `
      <details style="background: rgba(255,255,255,0.02); border: 1px solid var(--border); border-radius: 8px; overflow: hidden;">
        <summary style="padding: 7px 10px; font-size: 11px; font-weight: 700; color: var(--text-muted); cursor: pointer;">
          📋 Podsumowanie ćwiczeń i ocen trudności (${exMap.size})
        </summary>
        <div>${exRowsHtml}</div>
      </details>
    ` : ''}
  `;
}

function renderAnalysisSessionSelector() {
  const sel = document.getElementById('analysis-session-select');
  if (!sel) return;

  if (!Array.isArray(STATE.history) || STATE.history.length === 0) {
    sel.innerHTML = `<option value="">Brak zapisanych treningów w historii</option>`;
    renderAnalysisSessionOverview(null);
    return;
  }

  sel.innerHTML = STATE.history.map(s => {
    const dt = new Date(s.endTime || Date.now()).toLocaleString('pl-PL', {
      day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit'
    });
    const statusIcon = s.coachFeedback ? '✅' : (isWorkoutShortOrTest(s) ? '⏭️' : '📄');
    const selectedAttr = s.id === STATE.currentCoachReportSessionId ? 'selected' : '';
    return `<option value="${s.id}" ${selectedAttr}>${statusIcon} ${escapeHtml(s.planName || 'Trening')} (${dt} • ${s.totalVolumeKg || 0}kg)</option>`;
  }).join('');

  const activeSession = STATE.history.find(s => s.id === STATE.currentCoachReportSessionId) || STATE.history[0];
  renderAnalysisSessionOverview(activeSession);
}

function selectAnalysisSession(sessionId) {
  if (!sessionId) return;
  viewHistoryReport(sessionId);
}

function regenerateCurrentAnalysis() {
  const targetId = STATE.currentCoachReportSessionId || (STATE.history[0] && STATE.history[0].id);
  if (!targetId) return alert('Brak zapisanego treningu do analizy!');
  forceCoachAnalysis(targetId);
}

function refreshCoachReportBox() {
  const loading = document.getElementById('coach-loading');
  const reportBox = document.getElementById('coach-report-content');
  if (!reportBox) return;

  // Check if currentCoachReportSessionId still exists in STATE.history
  if (STATE.currentCoachReportSessionId) {
    const activeSession = STATE.history.find(s => s.id === STATE.currentCoachReportSessionId);
    if (!activeSession) {
      STATE.currentCoachReportSessionId = null;
    }
  }

  // If no active report session is selected (or it was just deleted), pick the latest session with feedback or latest session
  if (!STATE.currentCoachReportSessionId) {
    if (loading) loading.style.display = 'none';
    const latestWithFeedback = STATE.history.find(s => s.coachFeedback);
    if (latestWithFeedback) {
      STATE.currentCoachReportSessionId = latestWithFeedback.id;
      reportBox.innerHTML = formatMarkdown(latestWithFeedback.coachFeedback);
      reportBox.style.display = 'block';
    } else if (STATE.history.length > 0) {
      const latest = STATE.history[0];
      STATE.currentCoachReportSessionId = latest.id;
      if (isWorkoutShortOrTest(latest)) {
        renderSkippedShortWorkoutNotice(latest);
      } else {
        reportBox.innerHTML = `
          <div style="text-align: left;">
            <p style="color: var(--text-muted); font-size: 13px; margin-bottom: 10px;">Trening <b>${escapeHtml(latest.planName)}</b> nie ma jeszcze wygenerowanego raportu AI.</p>
            <button class="btn btn-sm btn-accent" style="width: auto;" onclick="forceCoachAnalysis('${latest.id}')">✨ Wygeneruj analizę AI dla tej sesji</button>
          </div>
        `;
        reportBox.style.display = 'block';
      }
    } else {
      reportBox.innerHTML = `<span style="color: var(--text-muted); font-size: 13px;">Brak aktywnego raportu sesji. Zakończ trening lub kliknij <b>📄 Raport AI</b> przy treningu na Pulpicie.</span>`;
      reportBox.style.display = 'block';
    }
  } else {
    const activeSession = STATE.history.find(s => s.id === STATE.currentCoachReportSessionId);
    if (activeSession && activeSession.coachFeedback && (!loading || loading.style.display === 'none')) {
      reportBox.innerHTML = formatMarkdown(activeSession.coachFeedback);
      reportBox.style.display = 'block';
    }
  }

  renderAnalysisSessionSelector();
}

function viewHistoryReport(sessionId) {
  const session = STATE.history.find(s => s.id === sessionId);
  if (!session) return;
  STATE.currentCoachReportSessionId = session.id;
  showView('analysis');
  renderAnalysisSessionSelector();
  const loading = document.getElementById('coach-loading');
  const reportBox = document.getElementById('coach-report-content');
  if (loading) loading.style.display = 'none';
  if (session.coachFeedback) {
    reportBox.innerHTML = formatMarkdown(session.coachFeedback);
    reportBox.style.display = 'block';
  } else if (isWorkoutShortOrTest(session)) {
    renderSkippedShortWorkoutNotice(session);
  } else {
    triggerCoachAnalysis(session);
  }
}

function isWorkoutShortOrTest(session) {
  if (!session) return true;
  const dur = session.durationSeconds || 0;
  const sets = session.completedSets || 0;
  // Shorter than 5 minutes (300s) OR fewer than 3 completed sets is treated as short/test
  return dur < 300 || sets < 3;
}

function renderSkippedShortWorkoutNotice(session) {
  const loading = document.getElementById('coach-loading');
  const reportBox = document.getElementById('coach-report-content');
  if (loading) loading.style.display = 'none';
  if (!reportBox) return;
  STATE.currentCoachReportSessionId = session.id;
  const durStr = formatDuration(session.durationSeconds || 0);
  reportBox.innerHTML = `
    <div style="text-align: left;">
      <div style="font-weight: 800; color: var(--primary); margin-bottom: 6px;">⏭️ Pominięto automatyczną analizę AI (Trening krótki / testowy)</div>
      <p style="font-size: 13px; color: var(--text-muted); margin-bottom: 12px;">
        Sesja <b>${escapeHtml(session.planName || 'Trening')}</b> trwała <b>${durStr}</b> i obejmowała <b>${session.completedSets || 0} ukończone serie</b>. Dla krótkich lub testowych sesji analiza AI nie uruchamia się automatycznie.
      </p>
      <div style="display: flex; gap: 8px; flex-wrap: wrap;">
        <button class="btn btn-sm btn-accent" style="width: auto;" onclick="forceCoachAnalysis('${session.id}')">✨ Wygeneruj analizę AI mimo to</button>
        <button class="btn btn-sm btn-secondary" style="width: auto; color: var(--danger);" onclick="deleteTestWorkoutFromCoach('${session.id}')">🗑️ Usuń ten testowy trening</button>
      </div>
    </div>
  `;
  reportBox.style.display = 'block';
}

function forceCoachAnalysis(sessionId) {
  const session = STATE.history.find(s => s.id === sessionId);
  if (!session) return;
  STATE.currentCoachReportSessionId = session.id;
  triggerCoachAnalysis(session);
}

// ============================================================================
// ACTIVE WORKOUT SESSION (Duration Ticker, Supersets, Rest Logging)
// ============================================================================
function findLastCompletedSessionForPlan(plan) {
  if (!plan || !Array.isArray(STATE.history)) return null;
  const normPlanName = String(plan.name || '').trim().toLowerCase();
  return STATE.history.find(h => {
    if (!h || !Array.isArray(h.sets) || h.sets.length === 0) return false;
    if (h.planId && plan.id && h.planId === plan.id) return true;
    if (normPlanName && String(h.planName || '').trim().toLowerCase() === normPlanName) return true;
    return false;
  }) || null;
}

function startWorkout(planId) {
  const plan = STATE.plans.find(p => p.id === planId);
  if (!plan) return;

  const restSeconds = parseInt(plan.restSeconds) || 90;
  const supersetRestSeconds = parseInt(plan.supersetRestSeconds) || 30;
  const lastSamePlanSession = findLastCompletedSessionForPlan(plan);
  const lastSessionEndTs = lastSamePlanSession ? (lastSamePlanSession.endTime || lastSamePlanSession.startTime || 0) : 0;

  const exercises = (plan.exercises || []).map(ex => {
    const loadType = ex.loadType || 'standard';
    const hasInitialWeight = (parseFloat(ex.weight) || 0) > 0;
    const normExName = normalizeExKey(ex.name);

    // Module 3: Check if manual edit in plan is newer than the last completed workout of this plan
    const isManualOverride = Boolean(ex.manualUpdatedAt && ex.manualUpdatedAt > lastSessionEndTs);
    const histSets = (!isManualOverride && lastSamePlanSession && Array.isArray(lastSamePlanSession.sets))
      ? lastSamePlanSession.sets.filter(s => normalizeExKey(s.exercise) === normExName)
      : [];

    let progressionSourceLabel = '';
    const numSets = parseInt(ex.sets) || 3;
    const sets = [];

    for (let i = 1; i <= numSets; i++) {
      const histSet = histSets[i - 1] || (histSets.length > 0 ? histSets[histSets.length - 1] : null);
      let defaultWeight = loadType === 'bodyweight' && !hasInitialWeight ? 0 : (parseFloat(ex.weight) || 0);
      let defaultReps = parseInt(ex.reps) || 10;

      if (histSet) {
        const lastW = parseFloat(histSet.weight) || 0;
        const lastR = parseInt(histSet.reps) || defaultReps;
        const lastEffort = parseInt(histSet.effort) || 0;

        if (loadType === 'bodyweight' && !hasInitialWeight && lastW === 0) {
          defaultWeight = 0;
          defaultReps = lastR + 1;
          progressionSourceLabel = `📈 Auto-progres z ost. sesji (+1 powt.)`;
        } else if (lastEffort >= 1 && lastEffort <= 2 && lastW > 0) {
          // Easy last time (1-2/6) -> suggest +2.5kg (or +1kg for dumbbells <= 14kg) or +1 rep
          const stepKg = (loadType === 'dual_dumbbell' || lastW < 20) ? 1 : 2.5;
          defaultWeight = Number((lastW + stepKg).toFixed(1));
          defaultReps = lastR;
          progressionSourceLabel = `📈 Auto-progres z ost. sesji (+${stepKg}kg po lekkiej serii)`;
        } else if (lastEffort >= 5) {
          // Very hard / Hardcore last time (5-6/6) -> keep exact weight & reps as target
          defaultWeight = lastW;
          defaultReps = lastR;
          progressionSourceLabel = `🎯 Z ost. sesji (utrzymanie po ciężkiej serii)`;
        } else {
          // Standard progression target: same weight from last session + 1 rep
          defaultWeight = lastW;
          defaultReps = lastR + 1;
          progressionSourceLabel = `📈 Auto-progres z ost. sesji (+1 powt.)`;
        }
      } else if (isManualOverride) {
        progressionSourceLabel = `✏️ Ręczna wartość z planu`;
      }

      sets.push({
        num: i,
        weight: defaultWeight,
        reps: defaultReps,
        completed: false,
        startedAt: null,
        completedAt: null,
        relStartStr: null,
        relEndStr: null,
        relTimeLabel: null,
        restBeforeSeconds: null,
        effort: null
      });
    }

    const matchedGif = findExerciseGif(ex.name, ex);
    const hasAnyExtraWeight = sets.some(s => (parseFloat(s.weight) || 0) > 0);
    const ssCfg = (plan.supersets && plan.supersets[ex.supersetGroup]) || {};
    const effectiveRest = ex.supersetGroup
      ? (parseInt(ssCfg.restSeconds) || parseInt(ex.restSeconds) || null)
      : (parseInt(ex.restSeconds) || null);
    const effectiveSsRest = ex.supersetGroup
      ? (parseInt(ssCfg.supersetRestSeconds) || parseInt(ex.supersetRestSeconds) || null)
      : null;

    return {
      name: ex.name,
      muscle: ex.muscle || 'Inne',
      supersetGroup: ex.supersetGroup || '',
      loadType: loadType,
      restSeconds: effectiveRest,
      supersetRestSeconds: effectiveSsRest,
      gifSlug: ex.gifSlug || (matchedGif ? matchedGif.s : ''),
      gifUrl: ex.gifUrl || (matchedGif ? matchedGif.g : ''),
      gifName: ex.gifName || (matchedGif ? matchedGif.n : ''),
      showExtraWeight: loadType === 'bodyweight' ? (hasInitialWeight || hasAnyExtraWeight) : true,
      progressionHint: progressionSourceLabel,
      sets
    };
  });

  const nowTs = Date.now();
  STATE.activeWorkout = {
    id: 'session-' + nowTs,
    planId: plan.id,
    planName: plan.name,
    restSeconds: restSeconds,
    supersetRestSeconds: supersetRestSeconds,
    supersets: JSON.parse(JSON.stringify(plan.supersets || {})),
    planSnapshot: JSON.parse(JSON.stringify(plan)),
    startTime: nowTs,
    currentSetStartedAt: nowTs,
    supersetRoundStartMap: {},
    lastSetCompletedAt: null,
    restLogs: [],
    exercises: exercises
  };
  STATE.editingEffortCoords = null;

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

// Group exercises into isolated blocks or Superset frames (Rendered Round-by-Round)
function renderActiveExercises() {
  const container = document.getElementById('workout-exercises-container');
  if (!container || !STATE.activeWorkout) return;

  const exercises = STATE.activeWorkout.exercises || [];
  const restMain = STATE.activeWorkout.restSeconds || 90;
  const restSS = STATE.activeWorkout.supersetRestSeconds || 30;

  const renderedSupersetGroups = new Set();
  const blocksHtml = [];

  exercises.forEach((ex, exIdx) => {
    const ssGroup = (ex.supersetGroup || '').trim();
    if (!ssGroup) {
      // Isolated exercise (single)
      blocksHtml.push(renderSingleExerciseCard(ex, exIdx, false));
    } else if (!renderedSupersetGroups.has(ssGroup)) {
      renderedSupersetGroups.add(ssGroup);
      const groupMembers = exercises
        .map((item, idx) => ({ item, idx }))
        .filter(entry => (entry.item.supersetGroup || '').trim() === ssGroup);

      blocksHtml.push(renderSupersetGroupCard(groupMembers, ssGroup, restSS, restMain));
    }
  });

  container.innerHTML = blocksHtml.join('');
}

function renderSupersetGroupCard(groupMembers, ssGroup, restSS, restMain) {
  const exCount = groupMembers.length;
  const maxSets = Math.max(...groupMembers.map(m => m.item.sets.length));

  const ssCfg = (STATE.activeWorkout && STATE.activeWorkout.supersets && STATE.activeWorkout.supersets[ssGroup]) || {};
  const currentSSRest = parseInt(ssCfg.supersetRestSeconds)
    || groupMembers.find(m => parseInt(m.item.supersetRestSeconds) > 0)?.item.supersetRestSeconds
    || restSS;
  const currentRoundRest = parseInt(ssCfg.restSeconds)
    || groupMembers.find(m => parseInt(m.item.restSeconds) > 0)?.item.restSeconds
    || restMain;

  // Determine active round and active exercise in superset (the first uncompleted set)
  let activeRoundIdx = null;
  let activeMemberIdx = null;
  findActive: for (let s = 0; s < maxSets; s++) {
    for (const m of groupMembers) {
      if (m.item.sets[s] && !m.item.sets[s].completed) {
        activeRoundIdx = s;
        activeMemberIdx = m.idx;
        break findActive;
      }
    }
  }

  // Quick technique preview buttons for all exercises in this superset
  const headerQuickGifs = groupMembers.map((m, i) => {
    const matched = findExerciseGif(m.item.name, m.item);
    const gUrl = m.item.gifUrl || (matched ? matched.g : '');
    return `
      <div style="display: flex; align-items: center; gap: 6px; background: rgba(0,0,0,0.35); border: 1px solid rgba(255,255,255,0.08); border-radius: 8px; padding: 4px 8px;">
        ${gUrl ? `<img src="${escapeHtml(gUrl)}" alt="" onclick="openGifModal('${escapeHtml(m.item.name)}')" style="width: 26px; height: 26px; border-radius: 4px; object-fit: cover; cursor: pointer; flex-shrink: 0;">` : ''}
        <span style="font-size: 11px; font-weight: 800; color: var(--text);">[${escapeHtml(ssGroup)}${i + 1}] ${escapeHtml(m.item.name)}</span>
        <button type="button" class="btn btn-sm btn-secondary" style="padding: 2px 6px; font-size: 10px; flex-shrink: 0;" onclick="openGifModal('${escapeHtml(m.item.name)}')">🎬</button>
      </div>
    `;
  }).join('');

  // Render round-by-round (Obwód po obwodzie)
  const roundsHtml = [];
  for (let sIdx = 0; sIdx < maxSets; sIdx++) {
    const isRoundDone = groupMembers.every(m => !m.item.sets[sIdx] || m.item.sets[sIdx].completed);
    const isActiveRound = (sIdx === activeRoundIdx);

    const itemsInThisRoundHtml = groupMembers.map((m, subIdx) => {
      const ex = m.item;
      const exIdx = m.idx;
      const set = ex.sets[sIdx];
      if (!set) return '';

      const isCurrentActive = isActiveRound && (exIdx === activeMemberIdx);
      const isDone = Boolean(set.completed);
      const isCalisthenics = isCalisthenicsExercise(ex);
      const isBodyweightNoLoad = isCalisthenics;
      const isBodyweightWithLoad = ex.loadType === 'bodyweight' && ex.showExtraWeight;
      const isDualDumbbell = ex.loadType === 'dual_dumbbell';

      const gridCols = isBodyweightNoLoad ? '36px 1fr 44px' : '36px 1fr 1fr 44px';
      const weightHeaderLabel = isDualDumbbell ? 'KG (×2)' : (isBodyweightWithLoad ? '+KG' : 'KG');
      const wVal = parseFloat(set.weight) || 0;
      const dualHint = isDualDumbbell && wVal > 0 ? `<div style="font-size: 9px; color: var(--accent); text-align: center;">= ${wVal * 2} kg</div>` : '';

      const matchedGif = findExerciseGif(ex.name, ex);
      const gifUrl = ex.gifUrl || (matchedGif ? matchedGif.g : '');

      let loadBadge = '';
      if (isDualDumbbell) loadBadge = `<span class="badge" style="font-size: 9px; background: rgba(0, 229, 255, 0.15); color: var(--accent);">2× Hantle</span>`;
      else if (isBodyweightNoLoad) loadBadge = `<span class="badge" style="font-size: 9px; background: rgba(0, 230, 118, 0.15); color: var(--success);">Masa ciała</span>`;

      // Relative time badge
      const timePillHtml = (set.completed && set.relTimeLabel)
        ? `<span style="font-size: 10px; color: var(--text-muted); background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08); padding: 2px 7px; border-radius: 999px;">⏱️ ${escapeHtml(set.relTimeLabel)}</span>`
        : '';

      // Effort rating badge / inline picker (only for weighted sets)
      const selectedEffort = getSetEffortMeta(set.effort);
      const isEditingThisEffort = STATE.editingEffortCoords && STATE.editingEffortCoords.exIdx === exIdx && STATE.editingEffortCoords.sIdx === sIdx;
      let effortSmallLabelHtml = '';
      let effortInlinePickerHtml = '';

      if (set.completed && !isCalisthenics) {
        if (selectedEffort && !isEditingThisEffort) {
          effortSmallLabelHtml = `
            <button
              type="button"
              onclick="toggleInlineEffortPicker(${exIdx}, ${sIdx})"
              title="Kliknij, aby zmienić ocenę serii"
              style="display: inline-flex; align-items: center; gap: 4px; font-size: 10px; font-weight: 800; color: ${selectedEffort.color}; background: ${selectedEffort.bg}; border: 1px solid ${selectedEffort.color}; padding: 2px 8px; border-radius: 999px; cursor: pointer;"
            >
              ${selectedEffort.icon} ${selectedEffort.val}/6 ${escapeHtml(selectedEffort.short)}
            </button>
          `;
        } else {
          effortInlinePickerHtml = `
            <div style="margin: 4px 0 6px 0; padding: 6px 8px; background: rgba(255,255,255,0.03); border: 1px solid rgba(0,229,255,0.28); border-radius: 9px;">
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px; font-size: 10px;">
                <span style="color: var(--text-muted); font-weight: 700;">🔥 Oceń trudność [${escapeHtml(ssGroup)}${subIdx + 1}]:</span>
                ${selectedEffort ? `<button type="button" onclick="toggleInlineEffortPicker(${exIdx}, ${sIdx})" style="background:none;border:none;color:var(--text-muted);font-size:10px;cursor:pointer;">Zamknij ✕</button>` : ''}
              </div>
              <div style="display: grid; grid-template-columns: repeat(6, 1fr); gap: 4px;">
                ${[1, 2, 3, 4, 5, 6].map(val => {
                  const m = SET_EFFORT_SCALE[val];
                  const isActive = parseInt(set.effort) === val;
                  return `
                    <button
                      type="button"
                      onclick="rateWorkoutSet(${exIdx}, ${sIdx}, ${val})"
                      style="
                        padding: 5px 1px;
                        border-radius: 6px;
                        border: 1px solid ${isActive ? m.color : 'var(--border)'};
                        background: ${isActive ? m.bg : '#12151b'};
                        color: ${isActive ? m.color : 'var(--text-muted)'};
                        font-weight: ${isActive ? '900' : '600'};
                        font-size: 10px;
                        cursor: pointer;
                        display: flex;
                        flex-direction: column;
                        align-items: center;
                        line-height: 1.1;
                      "
                    >
                      <span style="font-size: 12px;">${val}</span>
                      <span style="font-size: 8px;">${m.short}</span>
                    </button>
                  `;
                }).join('')}
              </div>
            </div>
          `;
        }
      }

      const metaSubRow = (timePillHtml || effortSmallLabelHtml)
        ? `<div style="display: flex; justify-content: space-between; align-items: center; gap: 6px; flex-wrap: wrap; margin-top: 4px;">
            ${timePillHtml}
            ${effortSmallLabelHtml}
          </div>`
        : '';

      return `
        <div class="superset-item-row ${isCurrentActive ? 'current-active-item' : ''}">
          <!-- Exercise Mini-Header -->
          <div style="display: flex; justify-content: space-between; align-items: center; gap: 6px; margin-bottom: 5px;">
            <div style="display: flex; align-items: center; gap: 6px; min-width: 0; flex: 1;">
              ${gifUrl
                ? `<img src="${escapeHtml(gifUrl)}" alt="" onclick="openGifModal('${escapeHtml(ex.name)}')" style="width: 28px; height: 28px; border-radius: 6px; object-fit: cover; background: #fff; cursor: pointer; flex-shrink: 0;">`
                : `<span style="font-size: 14px;">🎬</span>`
              }
              <div style="min-width: 0; flex: 1;">
                <div style="font-size: 13px; font-weight: 800; color: var(--text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                  <span style="color: var(--accent); margin-right: 2px;">[${escapeHtml(ssGroup)}${subIdx + 1}]</span> ${escapeHtml(ex.name)}
                </div>
              </div>
            </div>
            <div style="display: flex; align-items: center; gap: 4px; flex-shrink: 0;">
              ${loadBadge}
              ${isCurrentActive ? `<span class="badge" style="background: rgba(0,229,255,0.22); color: var(--accent); font-weight: 900; font-size: 10px;">👉 TERAZ</span>` : ''}
              ${isDone ? `<span style="color: var(--success); font-weight: 900; font-size: 13px;">✓</span>` : ''}
            </div>
          </div>

          <!-- Set input row -->
          <div class="set-row" style="grid-template-columns: ${gridCols}; margin-bottom: 0;">
            <div class="set-num ${isDone ? 'done' : ''}">${set.num}</div>
            ${isBodyweightNoLoad ? '' : `
              <div>
                <input type="number" step="0.5" class="input-box" value="${set.weight}" onchange="updateSetData(${exIdx}, ${sIdx}, 'weight', this.value)">
                ${dualHint}
              </div>
            `}
            <input type="number" class="input-box" value="${set.reps}" onchange="updateSetData(${exIdx}, ${sIdx}, 'reps', this.value)">
            <button class="check-btn ${isDone ? 'completed' : ''}" onclick="toggleSetComplete(${exIdx}, ${sIdx})">
              ${isDone ? '✓' : '○'}
            </button>
          </div>
          ${metaSubRow}
          ${effortInlinePickerHtml}
        </div>
      `;
    }).join('');

    roundsHtml.push(`
      <div class="superset-round-card ${isActiveRound ? 'active-round' : ''} ${isRoundDone ? 'completed-round' : ''}">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; border-bottom: 1px solid rgba(255,255,255,0.08); padding-bottom: 4px;">
          <span style="font-size: 12px; font-weight: 900; color: ${isRoundDone ? 'var(--success)' : (isActiveRound ? 'var(--accent)' : 'var(--text-muted)')}; text-transform: uppercase; letter-spacing: 0.5px;">
            ${isRoundDone ? '✅' : (isActiveRound ? '⚡' : '🔄')} OBWÓD ${sIdx + 1} z ${maxSets}
          </span>
          <span style="font-size: 10px; color: var(--text-muted);">
            ${isRoundDone ? 'Obwód ukończony' : `⏱️ ${currentSSRest}s odpoczynku w SS • ⏱️ ${currentRoundRest}s po obwodzie`}
          </span>
        </div>
        ${itemsInThisRoundHtml}
      </div>
    `);
  }

  return `
    <div class="superset-group-box">
      <div class="superset-group-header" style="flex-direction: column; align-items: stretch; gap: 8px; margin-bottom: 10px;">
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <span style="font-size: 14px; font-weight: 800; color: var(--accent);">🔗 SUPERSERIA ${escapeHtml(ssGroup)} (${exCount} ćwiczenia na przemian)</span>
          <button type="button" class="badge" style="background: rgba(0,229,255,0.14); color: var(--accent); border: 1px solid rgba(0,229,255,0.3); font-size: 10px; cursor: pointer; padding: 3px 8px; border-radius: 999px;" onclick="promptChangeSupersetRest('${escapeHtml(ssGroup)}')" title="Kliknij, aby zmienić czasy przerw dla całej Superserii ${escapeHtml(ssGroup)}">
            ⏱️ ${currentSSRest}s w SS / ⏱️ ${currentRoundRest}s obwód ✏️
          </button>
        </div>
        <div style="display: flex; gap: 6px; flex-wrap: wrap;">
          ${headerQuickGifs}
        </div>
      </div>

      <div style="margin-bottom: 8px; font-size: 11px; color: var(--text-muted); display: flex; justify-content: space-between;">
        <span>ĆWICZENIA WYKONYWANE W OBWODACH (A1 ➔ A2 ➔ A1 ➔ A2):</span>
      </div>

      ${roundsHtml.join('')}

      <div style="display: flex; justify-content: flex-end; margin-top: 8px;">
        <button type="button" class="btn btn-sm btn-secondary" style="font-size: 11px; padding: 6px 12px; color: var(--accent); border-color: rgba(0,229,255,0.35);" onclick="addSupersetRound('${escapeHtml(ssGroup)}')">
          ➕ Dodaj kolejny obwód do SS ${escapeHtml(ssGroup)}
        </button>
      </div>
    </div>
  `;
}

function addSupersetRound(ssGroup) {
  if (!STATE.activeWorkout) return;
  const groupMembers = STATE.activeWorkout.exercises.filter(
    item => (item.supersetGroup || '').trim() === ssGroup
  );
  groupMembers.forEach(ex => {
    const last = ex.sets[ex.sets.length - 1];
    ex.sets.push({
      num: ex.sets.length + 1,
      weight: last ? last.weight : 0,
      reps: last ? last.reps : 10,
      completed: false,
      startedAt: null,
      completedAt: null,
      relStartStr: null,
      relEndStr: null,
      relTimeLabel: null,
      restBeforeSeconds: null,
      effort: null
    });
  });
  saveActiveWorkout();
  renderActiveExercises();
  updateWorkoutStats();
}

function toggleInlineEffortPicker(exIdx, sIdx) {
  const cur = STATE.editingEffortCoords;
  if (cur && cur.exIdx === exIdx && cur.sIdx === sIdx) {
    STATE.editingEffortCoords = null;
  } else {
    STATE.editingEffortCoords = { exIdx, sIdx };
  }
  renderActiveExercises();
}

function renderSingleExerciseCard(ex, exIdx, isNextInSuperset) {
  const ssTag = ex.supersetGroup
    ? `<span class="badge badge-cyan" style="font-size: 10px; margin-right: 4px;">SS ${escapeHtml(ex.supersetGroup)}</span>`
    : '';
  const nextBadge = isNextInSuperset
    ? `<span class="badge" style="font-size: 10px; background: rgba(255,179,0,0.2); color: var(--primary);">👉 Kolejne w SS</span>`
    : '';

  const loadType = ex.loadType || 'standard';
  const isCalisthenics = isCalisthenicsExercise(ex);
  const isBodyweightNoLoad = isCalisthenics;
  const isBodyweightWithLoad = loadType === 'bodyweight' && ex.showExtraWeight;
  const isDualDumbbell = loadType === 'dual_dumbbell';

  let loadBadgeHtml = '';
  if (isDualDumbbell) {
    loadBadgeHtml = `<span class="badge" style="font-size: 10px; background: rgba(0, 229, 255, 0.15); color: var(--accent);">💪 2× Hantle (tonaż ×2)</span>`;
  } else if (loadType === 'bodyweight') {
    loadBadgeHtml = `<span class="badge" style="font-size: 10px; background: rgba(0, 230, 118, 0.15); color: var(--success);">🤸 Kalistenika / Masa ciała</span>`;
  }

  const progBadgeHtml = ex.progressionHint
    ? `<span class="badge" style="font-size: 9px; background: rgba(255,255,255,0.06); color: var(--text-muted); border: 1px solid var(--border);">${escapeHtml(ex.progressionHint)}</span>`
    : '';

  let extraWeightToggleBtn = '';
  if (isBodyweightNoLoad) {
    extraWeightToggleBtn = `<button class="btn btn-sm btn-secondary" style="padding: 3px 8px; font-size: 11px; color: var(--primary); border-color: rgba(255,179,0,0.4);" onclick="toggleBodyweightExtraLoad(${exIdx}, true)">➕ Dołóż ciężar</button>`;
  } else if (isBodyweightWithLoad) {
    extraWeightToggleBtn = `<button class="btn btn-sm btn-secondary" style="padding: 3px 8px; font-size: 11px;" onclick="toggleBodyweightExtraLoad(${exIdx}, false)">🤸 Tylko masa ciała</button>`;
  }

  const gridCols = isBodyweightNoLoad ? '36px 1fr 44px' : '36px 1fr 1fr 44px';
  const weightHeaderLabel = isDualDumbbell
    ? 'KG (1 HANTEL ×2)'
    : (isBodyweightWithLoad ? '+KG (DOŁOŻONE)' : 'KG');

  const matchedGif = findExerciseGif(ex.name, ex);
  const gifUrl = ex.gifUrl || (matchedGif ? matchedGif.g : '');

  return `
    <div class="exercise-block ${isNextInSuperset ? 'next-in-superset' : ''}">
      <div class="exercise-header" style="flex-direction: column; align-items: stretch; gap: 8px; margin-bottom: 10px;">
        <!-- Row 1: Thumbnail + Title + Badges + Add Set -->
        <div style="display: flex; justify-content: space-between; align-items: center; gap: 8px;">
          <div style="display: flex; align-items: center; gap: 8px; min-width: 0; flex: 1;">
            ${gifUrl
              ? `<img src="${escapeHtml(gifUrl)}" alt="GIF" onclick="openGifModal('${escapeHtml(ex.name)}')" style="width: 38px; height: 38px; border-radius: 8px; object-fit: cover; background: #fff; border: 1px solid rgba(0,229,255,0.4); cursor: pointer; flex-shrink: 0;">`
              : `<div onclick="openGifModal('${escapeHtml(ex.name)}')" style="width: 38px; height: 38px; border-radius: 8px; background: var(--surface-elevated); border: 1px dashed var(--border); display: flex; align-items: center; justify-content: center; font-size: 16px; cursor: pointer; flex-shrink: 0;">🎬</div>`
            }
            <div style="min-width: 0; flex: 1;">
              <div style="display: flex; align-items: center; gap: 4px; flex-wrap: wrap;">
                ${ssTag}
                <span class="exercise-title" style="font-size: 15px; line-height: 1.25;">${escapeHtml(ex.name)}</span>
              </div>
              <div style="display: flex; align-items: center; gap: 6px; flex-wrap: wrap; margin-top: 3px;">
                ${loadBadgeHtml}
                ${nextBadge}
                ${progBadgeHtml}
                <button type="button" class="badge" style="background: rgba(0, 230, 118, 0.12); color: var(--success); border: 1px solid rgba(0, 230, 118, 0.35); font-size: 10px; cursor: pointer; padding: 2px 7px; border-radius: 999px;" onclick="promptChangeExerciseRest(${exIdx})" title="Kliknij, aby zmienić czas odpoczynku dla tego ćwiczenia">
                  ⏱️ Odpoczynek: ${parseInt(ex.restSeconds || STATE.activeWorkout.restSeconds) || 90}s ✏️
                </button>
              </div>
            </div>
          </div>
          <button class="btn btn-sm btn-secondary" style="padding: 6px 10px; font-size: 12px; flex-shrink: 0;" onclick="addSetToExercise(${exIdx})">+ Seria</button>
        </div>

        <!-- Row 2: Clean Action Toolbar (GIF, YouTube, Bodyweight extra load) -->
        <div style="display: flex; gap: 6px; align-items: center; flex-wrap: wrap;">
          <button class="btn btn-sm btn-secondary" style="padding: 4px 10px; font-size: 11px; flex: 1;" onclick="openGifModal('${escapeHtml(ex.name)}')">🎬 Technika GIF</button>
          <a href="https://www.youtube.com/results?search_query=${encodeURIComponent('ćwiczenie ' + ex.name + ' technika')}" target="_blank" class="btn btn-sm btn-secondary" style="padding: 4px 10px; font-size: 11px; flex: 1; text-decoration: none; color: #ff5252; border-color: rgba(255,82,82,0.35);">▶️ YouTube</a>
          ${extraWeightToggleBtn}
        </div>
      </div>
      <div style="display: grid; grid-template-columns: ${gridCols}; gap: 8px; margin-bottom: 6px; font-size: 11px; color: var(--text-muted);">
        <span>SER</span>
        ${isBodyweightNoLoad ? '' : `<span>${weightHeaderLabel}</span>`}
        <span>POWT</span>
        <span>OK</span>
      </div>
      ${ex.sets.map((set, sIdx) => {
        const wVal = parseFloat(set.weight) || 0;
        const dualHint = isDualDumbbell && wVal > 0
          ? `<div style="font-size: 10px; color: var(--accent); text-align: center; margin-top: 2px;">= ${wVal * 2} kg łącznie</div>`
          : '';
        const selectedEffort = getSetEffortMeta(set.effort);
        const isEditingThisEffort = STATE.editingEffortCoords && STATE.editingEffortCoords.exIdx === exIdx && STATE.editingEffortCoords.sIdx === sIdx;

        // Relative time badge for completed set
        const timePillHtml = (set.completed && set.relTimeLabel)
          ? `<span style="display: inline-flex; align-items: center; gap: 3px; font-size: 10px; color: var(--text-muted); background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08); padding: 2px 7px; border-radius: 999px;">⏱️ ${escapeHtml(set.relTimeLabel)}</span>`
          : '';

        // Small effort label or inline 1-6 selector (ONLY for weighted exercises; calisthenics has NO scale 1-6)
        let effortSmallLabelHtml = '';
        let effortInlinePickerHtml = '';

        if (set.completed && !isCalisthenics) {
          if (selectedEffort && !isEditingThisEffort) {
            effortSmallLabelHtml = `
              <button
                type="button"
                onclick="toggleInlineEffortPicker(${exIdx}, ${sIdx})"
                title="Kliknij, aby zmienić ocenę serii"
                style="display: inline-flex; align-items: center; gap: 4px; font-size: 10px; font-weight: 800; color: ${selectedEffort.color}; background: ${selectedEffort.bg}; border: 1px solid ${selectedEffort.color}; padding: 2px 8px; border-radius: 999px; cursor: pointer;"
              >
                ${selectedEffort.icon} ${selectedEffort.val}/6 ${escapeHtml(selectedEffort.short)}
              </button>
            `;
          } else {
            effortInlinePickerHtml = `
              <div style="margin: 2px 0 8px 0; padding: 6px 8px; background: rgba(255,255,255,0.03); border: 1px solid rgba(0,229,255,0.28); border-radius: 9px;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px; font-size: 10px;">
                  <span style="color: var(--text-muted); font-weight: 700;">🔥 Oceń Serię ${set.num} (skala 1–6):</span>
                  ${selectedEffort ? `<button type="button" onclick="toggleInlineEffortPicker(${exIdx}, ${sIdx})" style="background:none;border:none;color:var(--text-muted);font-size:10px;cursor:pointer;">Zamknij ✕</button>` : ''}
                </div>
                <div style="display: grid; grid-template-columns: repeat(6, 1fr); gap: 4px;">
                  ${[1, 2, 3, 4, 5, 6].map(val => {
                    const m = SET_EFFORT_SCALE[val];
                    const isActive = parseInt(set.effort) === val;
                    return `
                      <button
                        type="button"
                        onclick="rateWorkoutSet(${exIdx}, ${sIdx}, ${val})"
                        style="
                          padding: 5px 1px;
                          border-radius: 6px;
                          border: 1px solid ${isActive ? m.color : 'var(--border)'};
                          background: ${isActive ? m.bg : '#12151b'};
                          color: ${isActive ? m.color : 'var(--text-muted)'};
                          font-weight: ${isActive ? '900' : '600'};
                          font-size: 10px;
                          cursor: pointer;
                          display: flex;
                          flex-direction: column;
                          align-items: center;
                          line-height: 1.1;
                        "
                      >
                        <span style="font-size: 12px;">${val}</span>
                        <span style="font-size: 8px; margin-top: 1px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 100%;">${m.short}</span>
                      </button>
                    `;
                  }).join('')}
                </div>
              </div>
            `;
          }
        }

        const setMetaSubRowHtml = (timePillHtml || effortSmallLabelHtml)
          ? `<div style="display: flex; justify-content: space-between; align-items: center; gap: 6px; flex-wrap: wrap; margin: -4px 0 8px 38px;">
              ${timePillHtml}
              ${effortSmallLabelHtml}
            </div>`
          : '';

        return `
          <div class="set-row" style="grid-template-columns: ${gridCols};">
            <div class="set-num ${set.completed ? 'done' : ''}">${set.num}</div>
            ${isBodyweightNoLoad ? '' : `
              <div>
                <input type="number" step="0.5" class="input-box" value="${set.weight}" onchange="updateSetData(${exIdx}, ${sIdx}, 'weight', this.value)">
                ${dualHint}
              </div>
            `}
            <input type="number" class="input-box" value="${set.reps}" onchange="updateSetData(${exIdx}, ${sIdx}, 'reps', this.value)">
            <button class="check-btn ${set.completed ? 'completed' : ''}" onclick="toggleSetComplete(${exIdx}, ${sIdx})">
              ${set.completed ? '✓' : '○'}
            </button>
          </div>
          ${setMetaSubRowHtml}
          ${effortInlinePickerHtml}
        `;
      }).join('')}
    </div>
  `;
}

function toggleBodyweightExtraLoad(exIdx, enable) {
  if (!STATE.activeWorkout) return;
  const ex = STATE.activeWorkout.exercises[exIdx];
  if (!ex) return;
  ex.showExtraWeight = !!enable;
  if (!enable) {
    ex.sets.forEach(s => {
      s.weight = 0;
      s.effort = null;
    });
  }
  saveActiveWorkout();
  renderActiveExercises();
  updateWorkoutStats();
}

function promptChangeExerciseRest(exIdx) {
  if (!STATE.activeWorkout) return;
  const ex = STATE.activeWorkout.exercises[exIdx];
  if (!ex) return;
  const cur = parseInt(ex.restSeconds || STATE.activeWorkout.restSeconds) || 90;
  const input = prompt(`⏱️ Czas odpoczynku po serii dla ćwiczenia:\n"${ex.name}"\n\nPodaj czas w sekundach (np. 45, 60, 90, 120, 180):`, cur);
  if (input === null) return;
  const parsed = parseInt(input);
  if (parsed > 0) {
    ex.restSeconds = parsed;
    saveActiveWorkout();
    renderActiveExercises();
  }
}

function promptChangeSupersetRest(ssGroup) {
  if (!STATE.activeWorkout) return;
  const groupMembers = STATE.activeWorkout.exercises.filter(
    item => (item.supersetGroup || '').trim() === ssGroup
  );
  if (groupMembers.length === 0) return;

  STATE.activeWorkout.supersets = STATE.activeWorkout.supersets || {};
  const ssCfg = STATE.activeWorkout.supersets[ssGroup] || {};

  const curMain = parseInt(ssCfg.restSeconds)
    || groupMembers.find(m => parseInt(m.restSeconds) > 0)?.restSeconds
    || STATE.activeWorkout.restSeconds
    || 90;
  const curShort = parseInt(ssCfg.supersetRestSeconds)
    || groupMembers.find(m => parseInt(m.supersetRestSeconds) > 0)?.supersetRestSeconds
    || STATE.activeWorkout.supersetRestSeconds
    || 30;

  const inputMain = prompt(`⏱️ Dłuższy odpoczynek PO CAŁYM OBWODZIE dla całej Superserii ${ssGroup}:\n\nPodaj czas w sekundach (np. 60, 90, 120, 180):`, curMain);
  if (inputMain === null) return;
  const parsedMain = parseInt(inputMain);

  const inputShort = prompt(`⚡ Krótki odpoczynek MIĘDZY ĆWICZENIAMI wewnątrz Superserii ${ssGroup}:\n\nPodaj czas w sekundach (np. 15, 30, 45):`, curShort);
  if (inputShort === null) return;
  const parsedShort = parseInt(inputShort);

  const finalMain = parsedMain > 0 ? parsedMain : curMain;
  const finalShort = parsedShort > 0 ? parsedShort : curShort;

  STATE.activeWorkout.supersets[ssGroup] = {
    restSeconds: finalMain,
    supersetRestSeconds: finalShort
  };

  groupMembers.forEach(m => {
    m.restSeconds = finalMain;
    m.supersetRestSeconds = finalShort;
  });

  saveActiveWorkout();
  renderActiveExercises();
}

function getEffectiveSetWeight(ex, set) {
  const loadType = ex.loadType || 'standard';
  if (loadType === 'bodyweight' && !ex.showExtraWeight) {
    return 0;
  }
  const rawWeight = parseFloat(set.weight) || 0;
  if (loadType === 'dual_dumbbell') {
    return rawWeight * 2;
  }
  return rawWeight;
}

function updateSetData(exIdx, sIdx, field, val) {
  if (!STATE.activeWorkout) return;
  STATE.activeWorkout.exercises[exIdx].sets[sIdx][field] = parseFloat(val) || 0;
  saveActiveWorkout();
  renderActiveExercises();
  updateWorkoutStats();
}

function rateWorkoutSet(exIdx, sIdx, rating) {
  if (!STATE.activeWorkout) return;
  const ex = STATE.activeWorkout.exercises?.[exIdx];
  const set = ex?.sets?.[sIdx];
  if (!set) return;

  if (isCalisthenicsExercise(ex)) {
    set.effort = null;
  } else {
    const val = parseInt(rating);
    set.effort = (set.effort === val) ? null : val;
  }

  // Collapse inline picker into small label once rated
  STATE.editingEffortCoords = null;

  saveActiveWorkout();
  renderActiveExercises();
  renderTimerEffortStrip();
}

function renderTimerEffortStrip() {
  const stripEl = document.getElementById('timer-effort-strip');
  if (!stripEl) return;

  const coords = STATE.lastCompletedSetCoords;
  if (!STATE.activeWorkout || !coords) {
    stripEl.innerHTML = '';
    return;
  }

  const ex = STATE.activeWorkout.exercises?.[coords.exIdx];
  const set = ex?.sets?.[coords.sIdx];
  // Calisthenics (bodyweight without extra weight) has NO 1-6 effort scale
  if (!ex || !set || !set.completed || isCalisthenicsExercise(ex)) {
    stripEl.innerHTML = '';
    return;
  }

  const selectedMeta = getSetEffortMeta(set.effort);

  stripEl.innerHTML = `
    <div style="background: rgba(5, 22, 13, 0.72); border: 1px solid ${selectedMeta ? selectedMeta.color : 'rgba(255,255,255,0.22)'}; border-radius: 12px; padding: 10px;">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; font-size: 11px; gap: 6px; flex-wrap: wrap;">
        <span style="color: #d7ffe8; font-weight: 800;">🔥 Ocena trudności S${set.num} (${escapeHtml(ex.name.slice(0, 22))}):</span>
        ${selectedMeta
          ? `<span style="color: ${selectedMeta.color}; font-weight: 900; background: rgba(0,0,0,0.45); padding: 2px 8px; border-radius: 999px;">${selectedMeta.icon} ${selectedMeta.val}/6 ${escapeHtml(selectedMeta.fullLabel || selectedMeta.short)}</span>`
          : `<span style="color: #80ffb8; font-size: 10px;">Wybierz 1–6</span>`
        }
      </div>
      <div style="display: grid; grid-template-columns: repeat(6, 1fr); gap: 4px;">
        ${[1, 2, 3, 4, 5, 6].map(val => {
          const m = SET_EFFORT_SCALE[val];
          const isActive = parseInt(set.effort) === val;
          return `
            <button
              type="button"
              onclick="rateWorkoutSet(${coords.exIdx}, ${coords.sIdx}, ${val})"
              style="
                padding: 6px 2px;
                border-radius: 8px;
                border: 1px solid ${isActive ? m.color : 'rgba(255,255,255,0.18)'};
                background: ${isActive ? m.bg : 'rgba(0,0,0,0.45)'};
                color: ${isActive ? m.color : '#eafff3'};
                font-weight: ${isActive ? '900' : '700'};
                font-size: 11px;
                cursor: pointer;
                display: flex;
                flex-direction: column;
                align-items: center;
                line-height: 1.15;
              "
            >
              <span style="font-size: 13px;">${val}</span>
              <span style="font-size: 8px; opacity: 0.95; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 100%;">${m.short}</span>
            </button>
          `;
        }).join('')}
      </div>
    </div>
  `;
}

function getNextWorkoutBlockInfo(currentExIdx, currentSsGroup) {
  if (!STATE.activeWorkout || !Array.isArray(STATE.activeWorkout.exercises)) return null;
  const exercises = STATE.activeWorkout.exercises;

  const isCurrentInSs = Boolean(currentSsGroup && currentSsGroup.trim());
  const cleanSsGroup = isCurrentInSs ? currentSsGroup.trim() : '';

  // 1. Search forward from current exercise for the next incomplete block
  let checkFromIdx = currentExIdx + 1;
  if (isCurrentInSs) {
    for (let i = exercises.length - 1; i >= 0; i--) {
      if ((exercises[i].supersetGroup || '').trim() === cleanSsGroup) {
        checkFromIdx = Math.max(checkFromIdx, i + 1);
        break;
      }
    }
  }

  for (let i = checkFromIdx; i < exercises.length; i++) {
    const candidate = exercises[i];
    const candSs = (candidate.supersetGroup || '').trim();
    if (isCurrentInSs && candSs === cleanSsGroup) continue;

    const hasIncompleteSet = Array.isArray(candidate.sets) && candidate.sets.some(s => !s.completed);
    if (hasIncompleteSet) {
      if (candSs) {
        return {
          shortName: `Superseria ${candSs}`,
          name: `Superseria ${candSs} (${candidate.name})`,
          exercise: candidate
        };
      } else {
        return {
          shortName: candidate.name,
          name: candidate.name,
          exercise: candidate
        };
      }
    }
  }

  // 2. Wrap-around search in case an earlier exercise was skipped/incomplete
  for (let i = 0; i < exercises.length; i++) {
    const candidate = exercises[i];
    const candSs = (candidate.supersetGroup || '').trim();
    if (isCurrentInSs && candSs === cleanSsGroup) continue;
    if (!isCurrentInSs && i === currentExIdx) continue;

    const hasIncompleteSet = Array.isArray(candidate.sets) && candidate.sets.some(s => !s.completed);
    if (hasIncompleteSet) {
      if (candSs) {
        return {
          shortName: `Superseria ${candSs}`,
          name: `Superseria ${candSs} (${candidate.name})`,
          exercise: candidate
        };
      } else {
        return {
          shortName: candidate.name,
          name: candidate.name,
          exercise: candidate
        };
      }
    }
  }

  return null; // All sets in all exercises of the workout are complete!
}

function toggleSetComplete(exIdx, sIdx) {
  if (!STATE.activeWorkout) return;
  const ex = STATE.activeWorkout.exercises[exIdx];
  const set = ex.sets[sIdx];
  set.completed = !set.completed;

  if (set.completed) {
    const nowTs = Date.now();
    const workoutStartTs = STATE.activeWorkout.startTime || nowTs;

    // 1. If a rest timer was active (or previous set was completed), log the rest duration
    finalizeCurrentRestLog(ex.name, set.num);

    // 2. Set / Superset Relative Time Tracking (start w MM:SS, koniec w MM:SS)
    const ssGroup = (ex.supersetGroup || '').trim();
    const ssRoundKey = ssGroup ? `${ssGroup}_${sIdx}` : '';
    if (!STATE.activeWorkout.supersetRoundStartMap) {
      STATE.activeWorkout.supersetRoundStartMap = {};
    }

    const rawSetStart = STATE.activeWorkout.currentSetStartedAt
      || STATE.activeWorkout.lastSetCompletedAt
      || workoutStartTs;
    const safeSetStart = Math.min(rawSetStart, nowTs);

    if (ssGroup && !STATE.activeWorkout.supersetRoundStartMap[ssRoundKey]) {
      STATE.activeWorkout.supersetRoundStartMap[ssRoundKey] = safeSetStart;
    }

    set.startedAt = safeSetStart;
    set.completedAt = nowTs;
    set.relStartStr = formatRelativeWorkoutTime(set.startedAt, workoutStartTs);
    set.relEndStr = formatRelativeWorkoutTime(set.completedAt, workoutStartTs);
    set.relTimeLabel = `start w ${set.relStartStr}, koniec w ${set.relEndStr}`;

    STATE.activeWorkout.lastSetCompletedAt = nowTs;
    STATE.lastCompletedSetCoords = { exIdx, sIdx };

    if (navigator.vibrate) navigator.vibrate(50);

    let mainRest = parseInt(ex.restSeconds || STATE.activeWorkout.restSeconds) || 90;
    let shortRest = parseInt(ex.supersetRestSeconds || STATE.activeWorkout.supersetRestSeconds) || 30;

    if (ssGroup) {
      // Find all exercises belonging to this superset
      const groupMembers = STATE.activeWorkout.exercises
        .map((item, idx) => ({ item, idx }))
        .filter(entry => (entry.item.supersetGroup || '').trim() === ssGroup);

      const ssCfg = (STATE.activeWorkout.supersets && STATE.activeWorkout.supersets[ssGroup]) || {};
      if (parseInt(ssCfg.restSeconds) > 0) {
        mainRest = parseInt(ssCfg.restSeconds);
      } else {
        const memberWithMain = groupMembers.find(m => parseInt(m.item.restSeconds) > 0);
        if (memberWithMain) mainRest = parseInt(memberWithMain.item.restSeconds);
      }

      if (parseInt(ssCfg.supersetRestSeconds) > 0) {
        shortRest = parseInt(ssCfg.supersetRestSeconds);
      } else {
        const memberWithShort = groupMembers.find(m => parseInt(m.item.supersetRestSeconds) > 0);
        if (memberWithShort) shortRest = parseInt(memberWithShort.item.supersetRestSeconds);
      }

      // Check if inside THIS round (sIdx) there is still an incomplete exercise
      const incompleteInSameRound = groupMembers.find(
        member => member.item.sets[sIdx] && !member.item.sets[sIdx].completed
      );

      if (incompleteInSameRound) {
        // Exercise finished, but round NOT finished yet:
        // Stations are already prepared! This is a SHORT REST BREAK between exercises in superset (count DOWN)
        const nextExName = incompleteInSameRound.item.name;
        startRestTimer(
          shortRest,
          `⏱️ ODPOCZYNEK W SUPERSERII • KOLEJNE: ${nextExName}`,
          ex.name,
          set.num,
          'superset-short',
          `⏱️ Krótki odpoczynek w superserii przed: ${nextExName} • Cel: ${shortRest}s (odliczanie w dół)`,
          `✅ OK / Gotowe (Rozpocznij: ${nextExName})`
        );
      } else {
        // Round sIdx is fully complete!
        const maxSets = Math.max(...groupMembers.map(m => m.item.sets.length));
        const hasNextRound = (sIdx + 1) < maxSets;

        if (hasNextRound) {
          // Long rest between rounds of superset (odliczanie w dół z czasem zdefiniowanym w treningu)
          startRestTimer(
            mainRest,
            `🟢 ODPOCZYNEK PO OBWODZIE ${sIdx + 1}/${maxSets} (SUPERSERIA ${ssGroup})`,
            ex.name,
            set.num,
            'superset-round',
            `⏱️ Dłuższy odpoczynek po całym obwodzie • Cel: ${mainRest}s (odliczanie w dół)`,
            `✅ OK / Gotowe (Rozpocznij Obwód ${sIdx + 2}/${maxSets})`
          );
        } else {
          // Entire Superset is fully completed (all rounds done)!
          // NOW is the time for a TECHNICAL BREAK to prepare gym stations for the next workout block!
          const nextBlock = getNextWorkoutBlockInfo(exIdx, ssGroup);
          if (nextBlock) {
            startRestTimer(
              0,
              `⚡ PRZERWA TECHNICZNA • PRZYGOTUJ STANOWISKO: ${nextBlock.shortName}`,
              ex.name,
              set.num,
              'technical-prep',
              `🔧 Przygotowanie siłowni pod kolejny zestaw: ${nextBlock.name} • Brak limitu czasu`,
              `✅ Stanowisko gotowe (Rozpocznij: ${nextBlock.shortName})`
            );
          } else {
            // Whole workout completed!
            startRestTimer(
              mainRest,
              `🎉 UKOŃCZONO TRENING! (Wszystkie serie wykonane)`,
              ex.name,
              set.num,
              'workout-done',
              `🏆 Wykonałeś cały zaplanowany trening! Kliknij aby zakończyć sesję.`,
              `🏁 Zakończ i podsumuj trening`
            );
          }
        }
      }
    } else {
      // Standard isolated exercise
      const isLastSet = sIdx >= ex.sets.length - 1;
      if (!isLastSet) {
        // Rest between sets of isolated exercise (odliczanie w dół z czasem zdefiniowanym w treningu)
        startRestTimer(
          mainRest,
          `⏱️ ODPOCZYNEK MIĘDZY SERIAMI (SERIA ${set.num}/${ex.sets.length})`,
          ex.name,
          set.num,
          'standard',
          `⏱️ Planowany odpoczynek przed Serią ${set.num + 1}/${ex.sets.length}: ${mainRest}s (odliczanie w dół)`,
          `✅ OK / Gotowe (Rozpocznij Serię ${set.num + 1}/${ex.sets.length})`
        );
      } else {
        // Entire single exercise is complete!
        // NOW is the time for a TECHNICAL BREAK to prepare gym stations for the next workout block!
        const nextBlock = getNextWorkoutBlockInfo(exIdx, null);
        if (nextBlock) {
          startRestTimer(
            0,
            `⚡ PRZERWA TECHNICZNA • PRZYGOTUJ STANOWISKO: ${nextBlock.shortName}`,
            ex.name,
            set.num,
            'technical-prep',
            `🔧 Przygotowanie siłowni pod kolejny zestaw: ${nextBlock.name} • Brak limitu czasu`,
            `✅ Stanowisko gotowe (Rozpocznij: ${nextBlock.shortName})`
          );
        } else {
          // Whole workout completed!
          startRestTimer(
            mainRest,
            `🎉 UKOŃCZONO TRENING! (Wszystkie serie wykonane)`,
            ex.name,
            set.num,
            'workout-done',
            `🏆 Wykonałeś cały zaplanowany trening! Kliknij aby zakończyć sesję.`,
            `🏁 Zakończ i podsumuj trening`
          );
        }
      }
    }
    renderTimerEffortStrip();
  } else {
    set.effort = null;
    set.startedAt = null;
    set.completedAt = null;
    set.relStartStr = null;
    set.relEndStr = null;
    set.relTimeLabel = null;
    STATE.editingEffortCoords = null;
    renderTimerEffortStrip();
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
    startedAt: null,
    completedAt: null,
    relStartStr: null,
    relEndStr: null,
    relTimeLabel: null,
    restBeforeSeconds: null,
    effort: null
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
        const effectiveW = getEffectiveSetWeight(ex, s);
        volume += (effectiveW * s.reps);
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
// MODULE 1: FOCUS OVERLAY — DUAL MODE: TECHNICAL BREAK (Count UP) vs REST TIMER (Count DOWN + Red Overtime)
// ============================================================================
function startRestTimer(
  targetSeconds = 90,
  labelText = '🟢 ODPOCZYNEK MIĘDZY SERIAMI',
  afterExercise = '',
  afterSet = 1,
  restType = 'standard',
  refText = null,
  btnText = null
) {
  clearInterval(STATE.timerInterval);

  const isTechnical = (restType === 'technical-prep' || restType === 'technical-break');
  STATE.timerIsTechnical = isTechnical;
  STATE.timerElapsedSeconds = 0;
  STATE.timerTargetSeconds = isTechnical ? 0 : (parseInt(targetSeconds) || 90);
  STATE.timerRemainingSeconds = STATE.timerTargetSeconds;
  STATE.timerSeconds = isTechnical ? 1 : STATE.timerRemainingSeconds;
  STATE.timerRefText = refText;

  STATE.currentRestInfo = {
    startedAt: Date.now(),
    plannedSeconds: isTechnical ? 0 : STATE.timerTargetSeconds,
    afterExercise: afterExercise,
    afterSet: afterSet,
    type: restType,
    logged: false
  };

  // Full screen lock: prevent scrolling and clicking background elements
  document.body.classList.add('focus-lock');

  const bar = document.getElementById('rest-timer-bar');
  const badgePill = document.getElementById('timer-badge-pill');
  const modeLabel = document.getElementById('timer-mode-label');
  const confirmBtn = document.getElementById('timer-confirm-btn');
  const quickAdjust = document.getElementById('timer-quick-adjust-row');
  const overtimeBadge = document.getElementById('timer-overtime-badge');

  if (bar) {
    bar.classList.remove('overtime');
    bar.style.display = 'flex';
  }

  if (badgePill) {
    if (isTechnical) {
      badgePill.textContent = '🔧 PRZYGOTOWANIE STANOWISKA';
    } else {
      badgePill.textContent = '⏱️ CZAS NA ODPOCZYNEK';
    }
  }

  if (modeLabel) modeLabel.textContent = labelText;

  if (confirmBtn) {
    confirmBtn.textContent = btnText || (isTechnical ? '✅ Stanowisko gotowe — Rozpocznij kolejny zestaw' : '✅ OK / Gotowe (Kolejna seria)');
  }

  if (quickAdjust) {
    quickAdjust.style.display = isTechnical ? 'none' : 'flex';
  }

  if (overtimeBadge) {
    overtimeBadge.style.display = 'none';
  }

  // Initial UI render
  updateTimerDisplayUI();

  STATE.timerInterval = setInterval(() => {
    STATE.timerElapsedSeconds++;

    if (STATE.timerIsTechnical) {
      // Technical break: counts upwards continuously from 1s, never overtime
      STATE.timerSeconds = Math.max(1, STATE.timerElapsedSeconds);
      updateTimerDisplayUI();
    } else {
      // Planned rest: counts downwards from targetSeconds
      STATE.timerRemainingSeconds--;
      STATE.timerSeconds = STATE.timerRemainingSeconds;

      if (STATE.timerRemainingSeconds === 0) {
        if (navigator.vibrate) navigator.vibrate([200, 100, 200, 100, 250]);
      }

      updateTimerDisplayUI();
    }
  }, 1000);
}

function updateTimerDisplayUI() {
  const bar = document.getElementById('rest-timer-bar');
  const display = document.getElementById('timer-display');
  const overtimeBadge = document.getElementById('timer-overtime-badge');
  const targetRef = document.getElementById('timer-target-ref');
  if (!display || !bar) return;

  if (STATE.timerIsTechnical) {
    // Technical Break: Count UP from 1s indefinitely
    const elapsed = Math.max(1, STATE.timerElapsedSeconds || 1);
    display.textContent = `${elapsed}s`;
    bar.classList.remove('overtime');
    if (overtimeBadge) overtimeBadge.style.display = 'none';
    if (targetRef) {
      targetRef.textContent = STATE.timerRefText || '🔧 Czas na przygotowanie stanowiska • Stoper liczy czas w górę (brak limitu)';
    }
  } else {
    // Planned Rest: Count DOWN from targetSeconds
    const remaining = STATE.timerRemainingSeconds;
    const target = STATE.timerTargetSeconds || 90;

    if (remaining > 0) {
      // On track: green background
      bar.classList.remove('overtime');
      display.textContent = `${remaining}s`;
      if (overtimeBadge) overtimeBadge.style.display = 'none';
      if (targetRef) {
        targetRef.textContent = STATE.timerRefText || `⏱️ Planowany odpoczynek: ${target}s (odliczanie w dół)`;
      }
    } else if (remaining === 0) {
      // Hit 0s
      bar.classList.remove('overtime');
      display.textContent = `0s`;
      if (overtimeBadge) {
        overtimeBadge.style.display = 'inline-block';
        overtimeBadge.textContent = `🔔 CZAS MINĄŁ — ROZPOCZNIJ SERIĘ!`;
      }
      if (targetRef) {
        targetRef.textContent = `🔔 Koniec zaplanowanego odpoczynku (${target}s)`;
      }
    } else {
      // Overtime! (remaining < 0) -> Count in reverse (+1s, +2s...) with RED background
      bar.classList.add('overtime');
      const overSec = Math.abs(remaining);
      display.textContent = `+${overSec}s`;
      if (overtimeBadge) {
        overtimeBadge.style.display = 'inline-block';
        overtimeBadge.textContent = `⚠️ ZA DŁUGI ODPOCZYNEK: +${overSec}s`;
      }
      if (targetRef) {
        targetRef.textContent = `⚠️ Przekroczono zaplanowany czas odpoczynku (${target}s)`;
      }
    }
  }
}

function addTimerSeconds(secs) {
  if (STATE.timerIsTechnical) return;
  STATE.timerTargetSeconds = Math.max(10, (STATE.timerTargetSeconds || 90) + secs);
  STATE.timerRemainingSeconds = (STATE.timerRemainingSeconds || 0) + secs;
  if (STATE.currentRestInfo) {
    STATE.currentRestInfo.plannedSeconds = STATE.timerTargetSeconds;
  }
  updateTimerDisplayUI();
}

function finalizeCurrentRestLog(nextExerciseName = null, nextSetNum = null) {
  if (!STATE.activeWorkout) return;
  if (!STATE.activeWorkout.restLogs) STATE.activeWorkout.restLogs = [];

  if (STATE.currentRestInfo && !STATE.currentRestInfo.logged) {
    const isTech = (STATE.currentRestInfo.type === 'technical-prep' || STATE.currentRestInfo.type === 'technical-break');
    const actualSec = Math.max(1, STATE.timerElapsedSeconds || Math.round((Date.now() - STATE.currentRestInfo.startedAt) / 1000));
    const plannedSec = isTech ? 0 : (STATE.currentRestInfo.plannedSeconds || 90);
    const overtimeSec = isTech ? 0 : Math.max(0, actualSec - plannedSec);

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
  const isWorkoutDoneType = (STATE.currentRestInfo && STATE.currentRestInfo.type === 'workout-done');
  if (STATE.currentRestInfo && !STATE.currentRestInfo.logged) {
    finalizeCurrentRestLog();
  }
  if (STATE.activeWorkout) {
    // Module 4: Pressing OK / Gotowe starts relative timer for the next set/superset
    STATE.activeWorkout.currentSetStartedAt = Date.now();
    saveActiveWorkout();
  }
  clearInterval(STATE.timerInterval);
  STATE.timerInterval = null;
  document.body.classList.remove('focus-lock');
  const bar = document.getElementById('rest-timer-bar');
  if (bar) {
    bar.classList.remove('overtime');
    bar.style.display = 'none';
  }
  if (isWorkoutDoneType) {
    finishCurrentWorkout();
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
    const isCalisthenics = isCalisthenicsExercise(ex);
    ex.sets.forEach(s => {
      totalSets++;
      if (s.completed) {
        completedSets++;
        const effectiveWeight = getEffectiveSetWeight(ex, s);
        totalVolumeKg += (effectiveWeight * s.reps);
        const relStartStr = s.relStartStr || formatRelativeWorkoutTime(s.startedAt || startTime, startTime);
        const relEndStr = s.relEndStr || formatRelativeWorkoutTime(s.completedAt || endTime, startTime);
        completedSetsList.push({
          exercise: ex.name,
          muscle: ex.muscle || 'Inne',
          supersetGroup: ex.supersetGroup || '',
          loadType: ex.loadType || 'standard',
          setNum: s.num,
          weight: s.weight,
          effectiveWeight: effectiveWeight,
          reps: s.reps,
          effort: isCalisthenics ? null : (s.effort || null),
          startedAt: s.startedAt || null,
          completedAt: s.completedAt || null,
          relStartStr: relStartStr,
          relEndStr: relEndStr,
          relTimeLabel: s.relTimeLabel || `start w ${relStartStr}, koniec w ${relEndStr}`
        });
      }
    });
  });

  const restLogs = STATE.activeWorkout.restLogs || [];
  const avgRestSeconds = restLogs.length > 0
    ? Math.round(restLogs.reduce((acc, r) => acc + (r.actualSeconds || 0), 0) / restLogs.length)
    : 0;

  // If 0 sets were completed, discard as an empty test session without saving or running AI
  if (completedSets === 0) {
    STATE.activeWorkout = null;
    localStorage.removeItem('iron_active_workout');
    checkActiveWorkout();
    showView('home');
    alert('Trening testowy (0 ukończonych serii) został zamknięty bez zapisywania i bez analizy AI.');
    return;
  }

  const burnedKcal = Math.round(((durationSeconds / 60) * 6.5) + (totalVolumeKg * 0.012));
  const epocKcal = Math.round(burnedKcal * 0.15);

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
    burnedKcal: burnedKcal,
    epocKcal: epocKcal,
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
  if (typeof renderCalendarDashboard === 'function') renderCalendarDashboard();

  STATE.currentCoachReportSessionId = session.id;
  showView('analysis');
  if (isWorkoutShortOrTest(session)) {
    renderSkippedShortWorkoutNotice(session);
  } else {
    triggerCoachAnalysis(session);
  }
}

// ============================================================================
// GEMINI AI INTEGRATION (Supports Text & Multi-Image/PDF Multimodal Requests)
// ============================================================================
function extractJsonFromGemini(rawText) {
  if (!rawText || typeof rawText !== 'string') {
    throw new Error('Pusta odpowiedź od modelu AI.');
  }
  const stripped = rawText.replace(/```json/gi, '').replace(/```/g, '').trim();
  try {
    return JSON.parse(stripped);
  } catch (_) {
    // Try extracting the outermost JSON object or array
    const firstBrace = stripped.indexOf('{');
    const lastBrace = stripped.lastIndexOf('}');
    const firstBracket = stripped.indexOf('[');
    const lastBracket = stripped.lastIndexOf(']');

    let candidate = '';
    if (firstBrace !== -1 && lastBrace > firstBrace && (firstBracket === -1 || firstBrace < firstBracket)) {
      candidate = stripped.slice(firstBrace, lastBrace + 1);
    } else if (firstBracket !== -1 && lastBracket > firstBracket) {
      candidate = stripped.slice(firstBracket, lastBracket + 1);
    }
    if (candidate) {
      const cleanedTrailingCommas = candidate.replace(/,\s*([}\]])/g, '$1');
      return JSON.parse(cleanedTrailingCommas);
    }
    throw new Error('Model AI zwrócił odpowiedź w nieoczekiwanym formacie.');
  }
}

function getGeminiModelTier(modelName) {
  const n = (modelName || '').toLowerCase();
  // Tier 1: Pro reasoning models (Highest quality, lowest free quota)
  if (n.includes('pro') && !n.includes('flash')) return 1;
  // Tier 3: Flash-Lite / 8B (Highest quota capacity, fast fallback)
  if (n.includes('lite') || n.includes('8b')) return 3;
  // Tier 2: Standard Flash models (Balanced quality & high quota)
  if (n.includes('flash')) return 2;
  return 4; // other experimental
}

function getGeminiModelVersionScore(modelName) {
  const n = (modelName || '').toLowerCase();
  let score = 0;
  if (n.includes('3.8')) score += 50;
  else if (n.includes('3.6')) score += 48;
  else if (n.includes('3.5')) score += 45;
  else if (n.includes('3.1')) score += 42;
  else if (n.includes('3-') || n.includes('3.0') || n.includes('3_') || n.includes('gemini-3-') || n.includes('gemini-3 ')) score += 40;
  else if (n.includes('2.5')) score += 30;
  else if (n.includes('2.0') || n.includes('2-') || n.includes('gemini-2-') || n.includes('gemini-2 ')) score += 20;
  else if (n.includes('1.5')) score += 10;
  if (!n.includes('preview') && !n.includes('exp')) score += 5;
  return score;
}

function updateGeminiModelBadges(model, isFallback = false, keyLabel = '') {
  STATE.lastUsedGeminiModel = model;

  const isP2 = keyLabel && (keyLabel.includes('2') || keyLabel.toLowerCase().includes('zapasowy'));
  const keyTag = isP2 ? ' [P2]' : (keyLabel ? ' [P1]' : '');

  const coachBadge = document.getElementById('coach-model-badge');
  if (coachBadge) {
    coachBadge.textContent = isFallback ? `🤖 ${model}${keyTag} (fallback)` : `🤖 ${model}${keyTag}`;
    coachBadge.title = `Model: ${model} | ${keyLabel || 'Klucz główny'}${isFallback ? ' (użyty przez fallback)' : ''}`;
    coachBadge.style.display = 'inline-block';
    if (isFallback) {
      coachBadge.style.color = '#ffb74d';
      coachBadge.style.borderColor = 'rgba(255, 183, 77, 0.4)';
    } else {
      coachBadge.style.color = 'var(--accent)';
      coachBadge.style.borderColor = 'rgba(0, 229, 255, 0.25)';
    }
  }

  const nutritionBadge = document.getElementById('nutrition-model-badge');
  if (nutritionBadge) {
    nutritionBadge.textContent = isFallback ? `🤖 ${model}${keyTag} (fallback)` : `🤖 ${model}${keyTag}`;
  }

  const settingsInfo = document.getElementById('gemini-last-used-info');
  if (settingsInfo) {
    const keyInfo = keyLabel ? ` [${keyLabel}]` : '';
    settingsInfo.innerHTML = `Ostatnio użyty model: <b>${escapeHtml(model)}</b>${escapeHtml(keyInfo)} ${isFallback ? '<span style="color: #ffb74d;">(aktywowany fallback)</span>' : '<span style="color: var(--success);">(główny)</span>'}`;
    settingsInfo.style.display = 'block';
  }
}

async function discoverGeminiModelsForKey(key) {
  const discovered = [];
  const versions = ['v1', 'v1beta'];
  const errors = [];

  for (const ver of versions) {
    try {
      const res = await fetch(`https://generativelanguage.googleapis.com/${ver}/models?key=${key}`);
      const data = await res.json();
      if (data.models && Array.isArray(data.models)) {
        for (const m of data.models) {
          const rawName = (m.name || '').replace(/^models\//, '');
          if (!rawName) continue;
          const methods = m.supportedGenerationMethods || [];
          if (methods.includes('generateContent')) {
            const n = rawName.toLowerCase();
            if (!n.startsWith('gemini-')) continue;
            if (n === 'gemini-pro' || n === 'gemini-pro-vision') continue; // legacy 1.0 deprecated
            if (n.includes('embedding') || n.includes('aqa') || n.includes('imagen')) continue;

            if (!discovered.some(d => d.name === rawName && d.apiVersion === ver)) {
              discovered.push({
                name: rawName,
                apiVersion: ver,
                displayName: m.displayName || rawName,
                tier: getGeminiModelTier(rawName),
                score: getGeminiModelVersionScore(rawName)
              });
            }
          }
        }
      } else if (data.error) {
        errors.push({ version: ver, ...data.error });
      }
    } catch (e) {
      errors.push({ version: ver, message: e.message });
    }
  }

  return { models: discovered, errors };
}

async function callGemini(prompt, preferredTier = 'fast', inlineData = null) {
  const primaryKey = (STATE.apiKey || '').trim();
  const backupKey = (STATE.backupApiKey || '').trim();

  const keysToTry = [];
  if (primaryKey) keysToTry.push({ key: primaryKey, label: 'Klucz główny' });
  if (backupKey && backupKey !== primaryKey) keysToTry.push({ key: backupKey, label: 'Klucz zapasowy (Projekt 2)' });

  if (keysToTry.length === 0) {
    alert('Podaj klucz Gemini API w zakładce Ustawienia!');
    showView('settings');
    throw new Error('Brak klucza Gemini API');
  }

  // Discover actual available models dynamically across both v1 and v1beta
  let discoveredList = [];
  for (const { key } of keysToTry) {
    const disc = await discoverGeminiModelsForKey(key);
    if (disc.models && disc.models.length > 0) {
      discoveredList = disc.models;
      break;
    }
  }

  const STATIC_FALLBACKS = [
    // Tier 1 Pro
    { name: 'gemini-3.1-pro', apiVersion: 'v1beta', tier: 1, score: 42 },
    { name: 'gemini-2.5-pro', apiVersion: 'v1beta', tier: 1, score: 30 },
    { name: 'gemini-1.5-pro', apiVersion: 'v1', tier: 1, score: 20 },
    // Tier 2 Flash (matches active AI Studio models)
    { name: 'gemini-3.8-flash', apiVersion: 'v1beta', tier: 2, score: 50 },
    { name: 'gemini-3.6-flash', apiVersion: 'v1beta', tier: 2, score: 48 },
    { name: 'gemini-3-flash', apiVersion: 'v1beta', tier: 2, score: 40 },
    { name: 'gemini-2.5-flash', apiVersion: 'v1beta', tier: 2, score: 30 },
    { name: 'gemini-2-flash', apiVersion: 'v1beta', tier: 2, score: 22 },
    { name: 'gemini-1.5-flash', apiVersion: 'v1', tier: 2, score: 20 },
    // Tier 3 Lite (500 requests/day in AI Studio!)
    { name: 'gemini-3.5-flash-lite', apiVersion: 'v1beta', tier: 3, score: 45 },
    { name: 'gemini-3.1-flash-lite', apiVersion: 'v1beta', tier: 3, score: 42 },
    { name: 'gemini-2.5-flash-lite', apiVersion: 'v1beta', tier: 3, score: 30 },
    { name: 'gemini-2-flash-lite', apiVersion: 'v1beta', tier: 3, score: 22 },
    { name: 'gemini-1.5-flash-8b', apiVersion: 'v1', tier: 3, score: 10 }
  ];

  const pool = discoveredList.length > 0 ? discoveredList : STATIC_FALLBACKS;

  const tier1Models = pool.filter(m => m.tier === 1);
  const tier2Models = pool.filter(m => m.tier === 2);
  const tier3Models = pool.filter(m => m.tier === 3);
  const tier4Models = pool.filter(m => m.tier === 4);

  const sortByScore = (list) => [...list].sort((a, b) => b.score - a.score);

  const sortedTier1 = sortByScore(tier1Models);
  const sortedTier2 = sortByScore(tier2Models);
  const sortedTier3 = sortByScore(tier3Models);
  const sortedTier4 = sortByScore(tier4Models);

  // Quality-First Tier Ordering:
  // We prioritize higher tier models across ALL keys before degrading to lower tiers!
  const orderedTiers = [];
  if (preferredTier === 'smart') {
    orderedTiers.push({ tierNum: 1, name: 'Pro', models: sortedTier1 });
    orderedTiers.push({ tierNum: 2, name: 'Flash', models: sortedTier2 });
    orderedTiers.push({ tierNum: 3, name: 'Lite', models: sortedTier3 });
    if (sortedTier4.length > 0) orderedTiers.push({ tierNum: 4, name: 'Exp', models: sortedTier4 });
  } else if (preferredTier === 'lite') {
    orderedTiers.push({ tierNum: 3, name: 'Lite', models: sortedTier3 });
    orderedTiers.push({ tierNum: 2, name: 'Flash', models: sortedTier2 });
    orderedTiers.push({ tierNum: 1, name: 'Pro', models: sortedTier1 });
    if (sortedTier4.length > 0) orderedTiers.push({ tierNum: 4, name: 'Exp', models: sortedTier4 });
  } else {
    // Default 'fast'
    orderedTiers.push({ tierNum: 2, name: 'Flash', models: sortedTier2 });
    orderedTiers.push({ tierNum: 3, name: 'Lite', models: sortedTier3 });
    orderedTiers.push({ tierNum: 1, name: 'Pro', models: sortedTier1 });
    if (sortedTier4.length > 0) orderedTiers.push({ tierNum: 4, name: 'Exp', models: sortedTier4 });
  }

  const parts = [{ text: prompt }];
  if (Array.isArray(inlineData)) {
    inlineData.forEach(item => {
      if (item && item.data && item.mimeType) {
        parts.push({
          inlineData: {
            mimeType: item.mimeType,
            data: item.data
          }
        });
      }
    });
  } else if (inlineData && inlineData.data && inlineData.mimeType) {
    parts.push({
      inlineData: {
        mimeType: inlineData.mimeType,
        data: inlineData.data
      }
    });
  }

  const allAttempts = [];
  let attemptCount = 0;
  const quotaExhaustedKeyIndices = new Set();

  for (let tIdx = 0; tIdx < orderedTiers.length; tIdx++) {
    const tierObj = orderedTiers[tIdx];
    const tierModels = tierObj.models;
    if (!tierModels || tierModels.length === 0) continue;

    // Reset quota exhaustion tracker for this tier
    quotaExhaustedKeyIndices.clear();

    for (let mIdx = 0; mIdx < tierModels.length; mIdx++) {
      const modelObj = tierModels[mIdx];
      const modelName = modelObj.name;
      const primaryApiVer = modelObj.apiVersion || 'v1';

      if (quotaExhaustedKeyIndices.size >= keysToTry.length) {
        break;
      }

      for (let kIdx = 0; kIdx < keysToTry.length; kIdx++) {
        if (quotaExhaustedKeyIndices.has(kIdx)) {
          continue;
        }

        const { key, label } = keysToTry[kIdx];
        attemptCount++;

        // Support dual version resolution (try primaryApiVer, then alternate if 404)
        const apiVersionsToTry = [primaryApiVer, primaryApiVer === 'v1' ? 'v1beta' : 'v1'];

        for (const ver of apiVersionsToTry) {
          try {
            const url = `https://generativelanguage.googleapis.com/${ver}/models/${modelName}:generateContent?key=${key}`;
            const response = await fetch(url, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ contents: [{ parts: parts }] })
            });

            if (response.ok) {
              const data = await response.json();
              const resParts = data.candidates?.[0]?.content?.parts || [];
              const text = resParts.map(p => p.text || '').join('').trim();
              if (text) {
                const isFallback = (attemptCount > 1 || kIdx > 0 || tIdx > 0);
                if (isFallback) {
                  const reasonsSummary = allAttempts.map(a => `${a.model} [${a.keyLabel}] (${a.reason})`).join(', ');
                  console.warn(`[Gemini Auto-Fallback] Użyto ${modelName} (${ver}) [${label}] po wcześniejszych próbach: ${reasonsSummary}`);
                  STATE.lastGeminiFallback = {
                    usedModel: `${modelName} (${ver})`,
                    usedKeyLabel: label,
                    failedModels: [...allAttempts],
                    timestamp: Date.now()
                  };
                } else {
                  STATE.lastGeminiFallback = null;
                }

                updateGeminiModelBadges(modelName, isFallback, label);
                return text;
              } else {
                allAttempts.push({ keyLabel: label, model: `${modelName} (${ver})`, status: 200, reason: 'Pusta odpowiedź (brak treści)' });
              }
            } else {
              const errJson = await response.json().catch(() => ({}));
              const status = response.status;
              const rawMsg = errJson.error?.message || `HTTP ${status}`;

              if (status === 404 && ver === apiVersionsToTry[0]) {
                // Try alternate API version before giving up
                continue;
              }

              let reason = `HTTP ${status}`;
              if (status === 429 || rawMsg.toLowerCase().includes('quota') || rawMsg.toLowerCase().includes('resource_exhausted')) {
                reason = 'Wyczerpany limit (Quota / 429)';
                quotaExhaustedKeyIndices.add(kIdx);
              } else if (status === 404) {
                reason = 'Model niedostępny (404)';
              } else if (status === 503 || status === 500) {
                reason = 'Serwer przeciążony (503)';
              }

              allAttempts.push({ keyLabel: label, model: `${modelName} (${ver})`, status, reason, details: rawMsg });
              console.warn(`[Gemini Auto-Fallback] ${label} | Model ${modelName} (${ver}) zwrócił ${reason}. Przechodzę do kolejnej próby...`);
              break; // Don't try other version if not 404
            }
          } catch (networkErr) {
            allAttempts.push({ keyLabel: label, model: `${modelName} (${ver})`, status: 0, reason: 'Błąd sieci', details: networkErr.message });
            console.warn(`[Gemini Auto-Fallback] Błąd sieci dla modelu ${modelName} (${ver}) [${label}]:`, networkErr);
            break;
          }
        }
      }
    }
  }

  // Only reached if ALL keys and ALL tiers/models failed!
  const keyDiagnostics = keysToTry.map((kObj) => {
    const kAttempts = allAttempts.filter(a => a.keyLabel === kObj.label);
    if (kAttempts.length === 0) {
      return `• ${kObj.label}: nie sprawdzono`;
    }

    const authFailure = kAttempts.find(a => a.status === 400 || a.status === 403 || (a.details && (a.details.toLowerCase().includes('api_key') || a.details.toLowerCase().includes('permission'))));
    if (authFailure) {
      return `• ${kObj.label}: ❌ Błąd klucza (${authFailure.details || authFailure.reason})`;
    }

    const quotaFailure = kAttempts.find(a => a.status === 429 || (a.details && a.details.toLowerCase().includes('quota')));
    if (quotaFailure) {
      return `• ${kObj.label}: ⏳ Wyczerpany limit (Quota / 429)`;
    }

    const last = kAttempts[kAttempts.length - 1];
    return `• ${kObj.label}: ⚠️ ${last.reason} (${last.details || ''})`;
  }).join('\n');

  if (keysToTry.length === 1) {
    throw new Error(`Wykryto tylko 1 aktywny klucz API:\n${keyDiagnostics}\n\n👉 Limit dobowy tego projektu został wyczerpany. Wklej Klucz zapasowy z NOWEGO projektu w Ustawieniach i kliknij 'Zapisz Klucze'.`);
  } else {
    const bothQuota = keysToTry.every(k => allAttempts.some(a => a.keyLabel === k.label && (a.status === 429 || (a.details && a.details.toLowerCase().includes('quota')))));
    if (bothQuota) {
      throw new Error(`Oba skonfigurowane klucze zwróciły wyczerpanie limitu (Quota / 429):\n${keyDiagnostics}\n\n⚠️ Ważne: Jeśli Klucz zapasowy został utworzony w TYM SAMYM projekcie Google co główny, dzielą one ten sam limit! W Google AI Studio kliknij 'Create API key' i koniecznie wybierz opcję 'Create API key in NEW project' (w osobnym nowym projekcie).`);
    } else {
      throw new Error(`Błąd połączenia ze skonfigurowanymi projektami:\n${keyDiagnostics}`);
    }
  }
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
Rozpoznaj również:
1) Superserie (np. oznaczone jako 1a/1b, A1/A2, "superseria", lub połączone znakiem "+") i nadaj im wspólny identyfikator "supersetGroup": "A", "B", "C" (lub "" dla pojedynczych ćwiczeń).
2) Typ obciążenia "loadType":
   - "bodyweight" dla ćwiczeń z masą własnego ciała bez ciężaru (np. pompki, podciąganie bez obciążenia, deska, brzuszki),
   - "dual_dumbbell" dla ćwiczeń wykonywanych dwoma hantlami naraz na obie ręce (np. wyciskanie hantli, wznosy bokiem z hantlami, uginanie z hantlami, RDL z hantlami),
   - "standard" dla ćwiczeń ze sztangą, na maszynie, wyciągu lub jednorącz.

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
        "supersetGroup": "",
        "loadType": "standard"
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
    let parsed = extractJsonFromGemini(rawResponse);

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
        ${(p.exercises || []).map(ex => {
          const ltBadge = ex.loadType === 'dual_dumbbell'
            ? `<span style="color: var(--accent); font-size: 11px;">[2× Hantle]</span> `
            : (ex.loadType === 'bodyweight' ? `<span style="color: var(--success); font-size: 11px;">[Masa ciała]</span> ` : '');
          const wDisp = ex.loadType === 'bodyweight' && !ex.weight
            ? 'Masa ciała'
            : (ex.weight ? (ex.loadType === 'dual_dumbbell' ? `2×${ex.weight}kg` : `${ex.weight}kg`) : '');
          return `
            <div style="display: flex; justify-content: space-between; padding: 4px 0; border-bottom: 1px solid var(--border); font-size: 13px;">
              <span>
                ${ex.supersetGroup ? `<b style="color: var(--accent);">[SS ${escapeHtml(ex.supersetGroup)}]</b> ` : ''}
                ${ltBadge}<b>${escapeHtml(ex.name)}</b> (${ex.muscle || 'Inne'})
              </span>
              <span>${ex.sets}x${ex.reps} ${wDisp}</span>
            </div>
          `;
        }).join('')}
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
      exercises: (p.exercises || []).map(ex => {
        const matchedGif = findExerciseGif(ex.name, ex);
        return {
          name: ex.name,
          muscle: ex.muscle || 'Inne',
          sets: parseInt(ex.sets) || 3,
          reps: parseInt(ex.reps) || 10,
          weight: parseFloat(ex.weight) || 0,
          supersetGroup: ex.supersetGroup || '',
          loadType: ex.loadType || 'standard',
          restSeconds: parseInt(ex.restSeconds) || null,
          supersetRestSeconds: parseInt(ex.supersetRestSeconds) || null,
          gifSlug: ex.gifSlug || (matchedGif ? matchedGif.s : ''),
          gifUrl: ex.gifUrl || (matchedGif ? matchedGif.g : ''),
          gifName: ex.gifName || (matchedGif ? matchedGif.n : '')
        };
      })
    });
  });

  localStorage.setItem('iron_plans', JSON.stringify(STATE.plans));
  renderPlans();
  alert(`Zapisano pomyślnie ${STATE.parsedKeepPlans.length} plan(ów)!`);
  showView('home');
}

// ============================================================================
// MODAL FOR ADDING / EDITING PLANS (WITH SUPERSETS, LOAD TYPES & REST CONFIG)
// ============================================================================
let editingPlanId = null;

let currentModalPlanSupersets = {};

function openNewPlanModal() {
  editingPlanId = null;
  currentModalPlanSupersets = {};

  const ssSettingsContainer = document.getElementById('modal-supersets-settings');
  if (ssSettingsContainer) {
    ssSettingsContainer.innerHTML = '';
    ssSettingsContainer.style.display = 'none';
  }

  document.getElementById('plan-modal-title').textContent = 'Nowy Plan Treningowy';
  document.getElementById('modal-plan-name').value = '';
  document.getElementById('modal-plan-desc').value = '';
  document.getElementById('modal-plan-rest').value = 90;
  document.getElementById('modal-plan-ss-rest').value = 30;
  document.getElementById('modal-exercises-list').innerHTML = '';
  addModalExerciseRow('Wyciskanie sztangi leżąc', 4, 8, 80, '', 'standard');
  addModalExerciseRow('Wyciskanie hantli skos', 3, 10, 26, 'A', 'dual_dumbbell');
  addModalExerciseRow('Pompki na poręczach (Dipy)', 3, 10, 0, 'A', 'bodyweight');
  updateModalSupersetsView();
  const modal = document.getElementById('plan-modal');
  modal.style.display = 'flex';
}

function openEditPlanModal(planId) {
  const plan = STATE.plans.find(p => p.id === planId);
  if (!plan) return;
  editingPlanId = planId;

  // 1. Always purge modal superset settings container DOM so values from other plans never leak!
  const ssSettingsContainer = document.getElementById('modal-supersets-settings');
  if (ssSettingsContainer) {
    ssSettingsContainer.innerHTML = '';
    ssSettingsContainer.style.display = 'none';
  }

  // 2. Freshly clone ONLY this specific plan's superset configs
  currentModalPlanSupersets = JSON.parse(JSON.stringify(plan.supersets || {}));

  // Backwards compatibility: if plan.supersets was not defined, populate strictly from THIS plan's exercises
  (plan.exercises || []).forEach(ex => {
    const grp = (ex.supersetGroup || '').trim();
    if (grp && !currentModalPlanSupersets[grp]) {
      currentModalPlanSupersets[grp] = {
        restSeconds: (ex.restSeconds !== undefined && ex.restSeconds !== null) ? parseInt(ex.restSeconds) : null,
        supersetRestSeconds: (ex.supersetRestSeconds !== undefined && ex.supersetRestSeconds !== null) ? parseInt(ex.supersetRestSeconds) : null
      };
    }
  });

  document.getElementById('plan-modal-title').textContent = 'Edycja Planu Treningowego';
  document.getElementById('modal-plan-name').value = plan.name || '';
  document.getElementById('modal-plan-desc').value = plan.description || '';
  document.getElementById('modal-plan-rest').value = plan.restSeconds || 90;
  document.getElementById('modal-plan-ss-rest').value = plan.supersetRestSeconds || 30;
  
  const listEl = document.getElementById('modal-exercises-list');
  listEl.innerHTML = '';
  (plan.exercises || []).forEach(ex => {
    addModalExerciseRow(ex.name, ex.sets, ex.reps, ex.weight, ex.supersetGroup || '', ex.loadType || 'standard', ex);
  });
  if ((plan.exercises || []).length === 0) {
    addModalExerciseRow('', 3, 10, 0, '', 'standard');
  }

  updateModalSupersetsView();
  const modal = document.getElementById('plan-modal');
  modal.style.display = 'flex';
}

function closePlanModal() {
  editingPlanId = null;
  currentModalPlanSupersets = {};
  const ssSettingsContainer = document.getElementById('modal-supersets-settings');
  if (ssSettingsContainer) {
    ssSettingsContainer.innerHTML = '';
    ssSettingsContainer.style.display = 'none';
  }
  const modal = document.getElementById('plan-modal');
  modal.style.display = 'none';
}

function removeModalExerciseRow(btn) {
  const row = btn.closest('.modal-ex-row');
  if (row) {
    row.remove();
    updateModalSupersetsView();
  }
}

function handleModalSsChange(selectEl) {
  const row = selectEl.closest('.modal-ex-row');
  if (!row) return;
  row.dataset.manualEdited = '1';
  updateModalSupersetsView();
}

function syncModalSsRestInput(ssGroup) {
  const card = document.querySelector(`.modal-ss-config-card[data-ss-group="${ssGroup}"]`);
  if (!card) return;
  const shortInput = card.querySelector('.modal-ss-rest-short');
  const mainInput = card.querySelector('.modal-ss-rest-main');
  currentModalPlanSupersets[ssGroup] = {
    restSeconds: (mainInput && mainInput.value.trim() !== '') ? parseInt(mainInput.value) : null,
    supersetRestSeconds: (shortInput && shortInput.value.trim() !== '') ? parseInt(shortInput.value) : null
  };
}

function updateModalSupersetsView() {
  const listEl = document.getElementById('modal-exercises-list');
  const ssSettingsContainer = document.getElementById('modal-supersets-settings');
  if (!listEl || !ssSettingsContainer) return;

  const rows = listEl.querySelectorAll('.modal-ex-row');
  const activeSupersets = {}; // grp -> array of exercise names

  rows.forEach(r => {
    const ssSelect = r.querySelector('.modal-ex-ss');
    const grp = ssSelect ? ssSelect.value.trim() : '';
    const nameInput = r.querySelector('.modal-ex-name');
    const name = nameInput ? nameInput.value.trim() : '';
    const singleRestBox = r.querySelector('.modal-ex-single-rest-box');
    const ssInfoBadge = r.querySelector('.modal-ex-ss-info-badge');

    if (grp) {
      if (!activeSupersets[grp]) activeSupersets[grp] = [];
      activeSupersets[grp].push(name || 'Bez nazwy');
      if (singleRestBox) singleRestBox.style.display = 'none';
      if (ssInfoBadge) {
        ssInfoBadge.style.display = 'flex';
        const ssNameSpan = ssInfoBadge.querySelector('.modal-ex-ss-badge-name');
        if (ssNameSpan) ssNameSpan.textContent = `Superseria ${grp}`;
      }
    } else {
      if (singleRestBox) singleRestBox.style.display = 'flex';
      if (ssInfoBadge) ssInfoBadge.style.display = 'none';
    }
  });

  // Preserve any currently typed values in modal-supersets-settings for active groups in this plan
  const existingCards = ssSettingsContainer.querySelectorAll('.modal-ss-config-card');
  existingCards.forEach(c => {
    const g = c.dataset.ssGroup;
    if (g && activeSupersets[g]) {
      const shortInput = c.querySelector('.modal-ss-rest-short');
      const mainInput = c.querySelector('.modal-ss-rest-main');
      if (shortInput && mainInput) {
        currentModalPlanSupersets[g] = {
          restSeconds: (mainInput.value.trim() !== '') ? parseInt(mainInput.value) : null,
          supersetRestSeconds: (shortInput.value.trim() !== '') ? parseInt(shortInput.value) : null
        };
      }
    }
  });

  const ssGroups = Object.keys(activeSupersets).sort();
  if (ssGroups.length === 0) {
    ssSettingsContainer.style.display = 'none';
    ssSettingsContainer.innerHTML = '';
    return;
  }

  const defaultMain = parseInt(document.getElementById('modal-plan-rest')?.value) || 90;
  const defaultShort = parseInt(document.getElementById('modal-plan-ss-rest')?.value) || 30;

  ssSettingsContainer.style.display = 'flex';
  ssSettingsContainer.innerHTML = `
    <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 4px; margin-bottom: 2px;">
      <span style="font-size: 12px; font-weight: 800; color: var(--accent);">🔗 PRZERWY DLA SUPERSERII (dla całej grupy):</span>
    </div>
    ${ssGroups.map(grp => {
      const exNames = activeSupersets[grp].join(', ');
      const cfg = currentModalPlanSupersets[grp] || {};
      const mainVal = (cfg.restSeconds !== null && cfg.restSeconds !== undefined) ? cfg.restSeconds : '';
      const shortVal = (cfg.supersetRestSeconds !== null && cfg.supersetRestSeconds !== undefined) ? cfg.supersetRestSeconds : '';

      return `
        <div class="modal-ss-config-card" data-ss-group="${escapeHtml(grp)}" style="background: rgba(0, 229, 255, 0.05); border: 1px solid rgba(0, 229, 255, 0.28); border-radius: 10px; padding: 9px 12px;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; flex-wrap: wrap; gap: 4px;">
            <span style="font-size: 13px; font-weight: 800; color: var(--accent);">🔗 SUPERSERIA ${escapeHtml(grp)}</span>
            <span style="font-size: 11px; color: var(--text-muted); max-width: 280px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${escapeHtml(exNames)}">
              Ćwiczenia: <b style="color: var(--text);">${escapeHtml(exNames)}</b>
            </span>
          </div>
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
            <div>
              <label style="font-size: 10px; color: var(--accent); display: block; margin-bottom: 2px; font-weight: 700;">⚡ Wewnątrz obwodu (zmiana stacji)</label>
              <div style="display: flex; align-items: center; gap: 4px;">
                <input type="number" step="5" class="input-box modal-ss-rest-short" data-ss-group="${escapeHtml(grp)}" style="font-size: 12px; padding: 4px 6px; width: 70px; text-align: center;" placeholder="${defaultShort}" value="${shortVal}" oninput="syncModalSsRestInput('${escapeHtml(grp)}')">
                <span style="font-size: 10px; color: var(--text-muted);">s (puste = ${defaultShort}s)</span>
              </div>
            </div>
            <div>
              <label style="font-size: 10px; color: #b9f6ca; display: block; margin-bottom: 2px; font-weight: 700;">⏱️ Po pełnym obwodzie</label>
              <div style="display: flex; align-items: center; gap: 4px;">
                <input type="number" step="5" class="input-box modal-ss-rest-main" data-ss-group="${escapeHtml(grp)}" style="font-size: 12px; padding: 4px 6px; width: 70px; text-align: center;" placeholder="${defaultMain}" value="${mainVal}" oninput="syncModalSsRestInput('${escapeHtml(grp)}')">
                <span style="font-size: 10px; color: var(--text-muted);">s (puste = ${defaultMain}s)</span>
              </div>
            </div>
          </div>
        </div>
      `;
    }).join('')}
  `;
}

function addModalExerciseRow(name = '', sets = 3, reps = 10, weight = 0, supersetGroup = '', loadType = 'standard', exObj = null) {
  const listEl = document.getElementById('modal-exercises-list');
  const row = document.createElement('div');
  row.className = 'modal-ex-row';
  row.style.cssText = 'background: var(--surface-elevated); border: 1px solid var(--border); border-radius: 10px; padding: 8px; margin-bottom: 8px;';

  const matchedGif = name ? findExerciseGif(name, exObj) : null;
  const initSlug = (exObj && exObj.gifSlug) || (matchedGif ? matchedGif.s : '');
  const initUrl = (exObj && exObj.gifUrl) || (matchedGif ? matchedGif.g : '');
  const initGifName = (exObj && exObj.gifName) || (matchedGif ? matchedGif.n : '');

  // Rest for single exercises
  const exRest = (!supersetGroup && exObj && exObj.restSeconds) ? parseInt(exObj.restSeconds) : '';

  if (initSlug) row.dataset.gifSlug = initSlug;
  if (initUrl) row.dataset.gifUrl = initUrl;
  if (initGifName) row.dataset.gifName = initGifName;
  if (exObj && exObj.gifUrl) row.dataset.gifLocked = '1';
  if (exObj && exObj.manualUpdatedAt) row.dataset.manualUpdatedAt = String(exObj.manualUpdatedAt);
  row.dataset.origSets = String(sets);
  row.dataset.origReps = String(reps);
  row.dataset.origWeight = String(weight);

  const ssOptions = [
    { val: '', label: 'Pojedyncze (Izolacja)' },
    { val: 'A', label: '🔗 Superseria A' },
    { val: 'B', label: '🔗 Superseria B' },
    { val: 'C', label: '🔗 Superseria C' },
    { val: 'D', label: '🔗 Superseria D' }
  ];

  const loadOptions = [
    { val: 'standard', label: '🏋️ Ciężar standard (1×)' },
    { val: 'dual_dumbbell', label: '💪 2× Hantle (licz ×2)' },
    { val: 'bodyweight', label: '🤸 Masa ciała (bez ciężaru)' }
  ];

  const hasExtraBwWeight = loadType === 'bodyweight' && (parseFloat(weight) || 0) > 0;
  const hideWeightBox = loadType === 'bodyweight' && !hasExtraBwWeight;
  const weightLabelText = loadType === 'dual_dumbbell'
    ? '1 HANTEL (KG ×2)'
    : (loadType === 'bodyweight' ? '+DOŁOŻONO (KG)' : 'CIĘŻAR (KG)');

  const hasGifAssigned = Boolean(initUrl);

  row.innerHTML = `
    <div style="display: flex; gap: 6px; align-items: center; margin-bottom: 6px;">
      <input type="text" class="input-box modal-ex-name" style="text-align: left; font-size: 13px; flex: 1;" placeholder="Nazwa ćwiczenia (np. RDL, Back Squat)" value="${escapeHtml(name)}" oninput="handleModalExNameInput(this)">
      <button type="button" style="background: none; border: none; color: var(--danger); font-size: 18px; padding: 0 6px; cursor: pointer;" onclick="removeModalExerciseRow(this)" title="Usuń ćwiczenie">✕</button>
    </div>

    <!-- Dedicated GIF Assignment Bar inside Plan Editor Row -->
    <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px; background: rgba(0,0,0,0.28); border: 1px solid rgba(255,255,255,0.08); border-radius: 8px; padding: 6px 8px; margin-bottom: 6px;">
      <div style="display: flex; align-items: center; gap: 8px; min-width: 0; flex: 1; cursor: pointer;" onclick="openGifModalFromPlanRow(this)">
        <img class="modal-ex-gif-thumb" src="${hasGifAssigned ? escapeHtml(initUrl) : ''}" alt="GIF" style="width: 38px; height: 38px; border-radius: 6px; object-fit: cover; background: #fff; border: 1px solid var(--success); flex-shrink: 0; ${hasGifAssigned ? 'display: block;' : 'display: none;'}">
        <div class="modal-ex-gif-empty" style="width: 38px; height: 38px; border-radius: 6px; background: rgba(255,255,255,0.05); border: 1px dashed var(--border); align-items: center; justify-content: center; font-size: 16px; flex-shrink: 0; ${hasGifAssigned ? 'display: none;' : 'display: flex;'}">🎬</div>
        <div style="min-width: 0; flex: 1;">
          <div style="font-size: 10px; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.4px;">Animacja GIF w planie:</div>
          <div class="modal-ex-gif-title" style="font-size: 12px; font-weight: 700; color: ${hasGifAssigned ? 'var(--success)' : 'var(--text-muted)'}; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
            ${hasGifAssigned ? `🎬 ${escapeHtml(initGifName || 'Przypisany GIF')}` : 'Brak przypisanego GIFa'}
          </div>
        </div>
      </div>
      <button type="button" class="btn btn-sm btn-secondary modal-ex-gif-btn" style="font-size: 11px; padding: 6px 10px; width: auto; flex-shrink: 0; ${hasGifAssigned ? 'border-color: var(--success); color: var(--success);' : 'border-color: var(--accent); color: var(--accent);'}" onclick="openGifModalFromPlanRow(this)">
        ${hasGifAssigned ? '🎬 Zmień GIF' : '🎬 Ustaw GIF'}
      </button>
    </div>

    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 6px; margin-bottom: 6px;">
      <select class="input-box modal-ex-ss" style="font-size: 11px; padding: 6px 4px; color: var(--accent);" onchange="handleModalSsChange(this)">
        ${ssOptions.map(o => `<option value="${o.val}" ${supersetGroup === o.val ? 'selected' : ''}>${o.label}</option>`).join('')}
      </select>
      <select class="input-box modal-ex-loadtype" style="font-size: 11px; padding: 6px 4px; color: var(--primary);" onchange="handleModalLoadTypeChange(this)">
        ${loadOptions.map(o => `<option value="${o.val}" ${loadType === o.val ? 'selected' : ''}>${o.label}</option>`).join('')}
      </select>
    </div>
    <div style="display: grid; grid-template-columns: 1fr 1fr 1.2fr; gap: 6px; align-items: center;">
      <div style="position: relative;">
        <input type="number" class="input-box modal-ex-sets" style="font-size: 13px; padding: 6px;" placeholder="Ser" value="${sets}" title="Serie" oninput="this.closest('.modal-ex-row').dataset.manualEdited='1'">
        <span style="font-size: 9px; color: var(--text-muted); display: block; text-align: center;">SERIE</span>
      </div>
      <div style="position: relative;">
        <input type="number" class="input-box modal-ex-reps" style="font-size: 13px; padding: 6px;" placeholder="Powt" value="${reps}" title="Powtórzenia" oninput="this.closest('.modal-ex-row').dataset.manualEdited='1'">
        <span style="font-size: 9px; color: var(--text-muted); display: block; text-align: center;">POWT</span>
      </div>
      <div class="modal-weight-container" style="position: relative; ${hideWeightBox ? 'display: none;' : ''}">
        <input type="number" step="0.5" class="input-box modal-ex-weight" style="font-size: 13px; padding: 6px;" placeholder="kg" value="${weight}" title="Ciężar (kg)" oninput="this.closest('.modal-ex-row').dataset.manualEdited='1'">
        <span class="modal-weight-label" style="font-size: 9px; color: var(--text-muted); display: block; text-align: center;">${weightLabelText}</span>
      </div>
      <div class="modal-bw-add-container" style="${hideWeightBox ? 'display: flex;' : 'display: none;'} flex-direction: column; align-items: center; justify-content: center;">
        <button type="button" class="btn btn-sm btn-secondary" style="font-size: 11px; padding: 6px 8px; width: 100%; color: var(--primary);" onclick="enableModalBwExtraWeight(this)">➕ Dołóż ciężar</button>
        <span style="font-size: 9px; color: var(--success); display: block; text-align: center; margin-top: 2px;">MASA CIAŁA</span>
      </div>
    </div>

    <!-- Rest bar: Shown ONLY for single/isolated exercises -->
    <div class="modal-ex-single-rest-box" style="display: ${supersetGroup ? 'none' : 'flex'}; align-items: center; justify-content: space-between; gap: 8px; margin-top: 6px; padding: 5px 8px; background: rgba(0,0,0,0.22); border-radius: 8px; border: 1px solid rgba(255,255,255,0.06);">
      <div style="display: flex; align-items: center; gap: 6px;">
        <span style="font-size: 11px; color: #b9f6ca; font-weight: 700; white-space: nowrap;">⏱️ Odpoczynek po serii:</span>
        <input type="number" step="5" class="input-box modal-ex-rest" style="font-size: 12px; padding: 4px 6px; width: 75px; text-align: center;" placeholder="z planu" value="${exRest}" title="Własny czas odpoczynku po serii w sekundach. Puste = domyślny z planu." oninput="this.closest('.modal-ex-row').dataset.manualEdited='1'">
        <span style="font-size: 10px; color: var(--text-muted); white-space: nowrap;">s (puste = domyślny z planu)</span>
      </div>
    </div>

    <!-- Superset Info Badge: Shown ONLY when exercise is assigned to a superset -->
    <div class="modal-ex-ss-info-badge" style="display: ${supersetGroup ? 'flex' : 'none'}; align-items: center; justify-content: space-between; gap: 8px; margin-top: 6px; padding: 5px 8px; background: rgba(0, 229, 255, 0.08); border-radius: 8px; border: 1px solid rgba(0, 229, 255, 0.22);">
      <div style="display: flex; align-items: center; gap: 6px;">
        <span style="font-size: 11px; color: var(--accent); font-weight: 700;">🔗</span>
        <span class="modal-ex-ss-badge-name" style="font-size: 11px; color: var(--accent); font-weight: 700;">Superseria ${escapeHtml(supersetGroup)}</span>
      </div>
      <span style="font-size: 10px; color: var(--text-muted);">Przerwy określa konfiguracja Superserii powyżej ⬆️</span>
    </div>
  `;
  listEl.appendChild(row);
}

function handleModalExNameInput(inputEl) {
  const row = inputEl.closest('.modal-ex-row');
  if (row && row.dataset.gifLocked !== '1') {
    const exName = inputEl.value.trim();
    const matched = exName ? findExerciseGif(exName) : null;
    updateModalRowGifPreview(row, matched);
  }
  updateModalSupersetsView();
}

function openGifModalFromPlanRow(btnEl) {
  const row = btnEl.closest('.modal-ex-row');
  if (!row) return;
  const nameInput = row.querySelector('.modal-ex-name');
  const exName = nameInput ? nameInput.value.trim() : '';
  if (!exName) return alert('Wpisz najpierw nazwę ćwiczenia w tym wierszu!');
  currentEditingModalRow = row;
  currentEditingPlanRef = null;
  const rowGifObj = {
    gifSlug: row.dataset.gifSlug || '',
    gifUrl: row.dataset.gifUrl || '',
    gifName: row.dataset.gifName || ''
  };
  openGifModal(exName, rowGifObj);
}

function handleModalLoadTypeChange(selectEl) {
  const row = selectEl.closest('.modal-ex-row');
  if (!row) return;
  const val = selectEl.value;
  const weightContainer = row.querySelector('.modal-weight-container');
  const bwAddContainer = row.querySelector('.modal-bw-add-container');
  const weightInput = row.querySelector('.modal-ex-weight');
  const weightLabel = row.querySelector('.modal-weight-label');

  if (val === 'bodyweight') {
    weightInput.value = 0;
    weightContainer.style.display = 'none';
    bwAddContainer.style.display = 'flex';
  } else {
    weightContainer.style.display = 'block';
    bwAddContainer.style.display = 'none';
    weightLabel.textContent = val === 'dual_dumbbell' ? '1 HANTEL (KG ×2)' : 'CIĘŻAR (KG)';
  }
}

function enableModalBwExtraWeight(btnEl) {
  const row = btnEl.closest('.modal-ex-row');
  if (!row) return;
  const weightContainer = row.querySelector('.modal-weight-container');
  const bwAddContainer = row.querySelector('.modal-bw-add-container');
  const weightLabel = row.querySelector('.modal-weight-label');
  const weightInput = row.querySelector('.modal-ex-weight');

  bwAddContainer.style.display = 'none';
  weightContainer.style.display = 'block';
  weightLabel.textContent = '+DOŁOŻONO (KG)';
  weightInput.focus();
}

function saveModalPlan() {
  const name = document.getElementById('modal-plan-name').value.trim();
  if (!name) return alert('Podaj nazwę planu!');
  const desc = document.getElementById('modal-plan-desc').value.trim();
  const restSeconds = parseInt(document.getElementById('modal-plan-rest').value) || 90;
  const supersetRestSeconds = parseInt(document.getElementById('modal-plan-ss-rest').value) || 30;

  // Collect superset configurations from modal
  const supersets = {};
  const ssCards = document.querySelectorAll('#modal-supersets-settings .modal-ss-config-card');
  ssCards.forEach(card => {
    const grp = card.dataset.ssGroup;
    if (!grp) return;
    const shortRest = parseInt(card.querySelector('.modal-ss-rest-short')?.value) || null;
    const mainRest = parseInt(card.querySelector('.modal-ss-rest-main')?.value) || null;
    supersets[grp] = {
      restSeconds: mainRest,
      supersetRestSeconds: shortRest
    };
  });

  const rows = document.querySelectorAll('#modal-exercises-list .modal-ex-row');
  const exercises = [];
  rows.forEach(r => {
    const exName = r.querySelector('.modal-ex-name').value.trim();
    const sets = parseInt(r.querySelector('.modal-ex-sets').value) || 3;
    const reps = parseInt(r.querySelector('.modal-ex-reps').value) || 10;
    const loadType = r.querySelector('.modal-ex-loadtype').value || 'standard';
    const weightContainer = r.querySelector('.modal-weight-container');
    const isWeightHidden = weightContainer && weightContainer.style.display === 'none';
    const weight = isWeightHidden ? 0 : (parseFloat(r.querySelector('.modal-ex-weight').value) || 0);
    const supersetGroup = r.querySelector('.modal-ex-ss').value || '';
    
    let customRest = null;
    let customSsRest = null;
    if (supersetGroup) {
      customRest = supersets[supersetGroup]?.restSeconds || null;
      customSsRest = supersets[supersetGroup]?.supersetRestSeconds || null;
    } else {
      customRest = parseInt(r.querySelector('.modal-ex-rest')?.value) || null;
    }

    if (exName) {
      const existingGifObj = {
        gifSlug: r.dataset.gifSlug || '',
        gifUrl: r.dataset.gifUrl || '',
        gifName: r.dataset.gifName || ''
      };
      const matched = findExerciseGif(exName, existingGifObj);
      const gifSlug = existingGifObj.gifSlug || (matched ? matched.s : '');
      const gifUrl = existingGifObj.gifUrl || (matched ? matched.g : '');
      const gifName = existingGifObj.gifName || (matched ? matched.n : '');

      if (gifUrl) {
        persistExerciseGifAssignment(exName, { s: gifSlug, g: gifUrl, n: gifName });
      }

      // Module 3 Exception: Manual change in plan overrides historical auto-progression
      const wasEditedInModal = r.dataset.manualEdited === '1'
        || String(sets) !== (r.dataset.origSets || '')
        || String(reps) !== (r.dataset.origReps || '')
        || String(weight) !== (r.dataset.origWeight || '');
      const manualUpdatedAt = wasEditedInModal
        ? Date.now()
        : (parseInt(r.dataset.manualUpdatedAt) || null);

      exercises.push({
        name: exName,
        sets,
        reps,
        weight,
        supersetGroup,
        loadType,
        restSeconds: customRest,
        supersetRestSeconds: customSsRest,
        muscle: (matched && matched.m) || 'Ogólne',
        gifSlug,
        gifUrl,
        gifName,
        manualUpdatedAt
      });
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
      STATE.plans[idx].supersets = supersets;
      STATE.plans[idx].exercises = exercises;
    }
  } else {
    STATE.plans.push({
      id: 'plan-' + Date.now(),
      name: name,
      description: desc,
      restSeconds: restSeconds,
      supersetRestSeconds: supersetRestSeconds,
      supersets: supersets,
      exercises: exercises
    });
  }

  localStorage.setItem('iron_plans', JSON.stringify(STATE.plans));
  renderPlans();
  closePlanModal();
}

// ============================================================================
// BODY MEASUREMENTS, MULTI-FILE SMART IMPORTER, DEDUPLICATION & SAME-DAY MERGE
// ============================================================================
const SCALAR_BODY_KEYS = [
  'weightKg', 'bmi', 'bodyFatPct', 'fatMassKg', 'ffmKg', 'muscleMassKg',
  'muscleRatePct', 'skeletalMusclePct', 'boneMassKg', 'proteinMassKg',
  'proteinPct', 'waterMassKg', 'bodyWaterPct', 'subcutaneousFatPct',
  'visceralFat', 'bmrKcal', 'bodyAge', 'whr', 'idealWeightKg',
  'obesityLevel', 'bodyType',
  'waistCm', 'beltCm', 'chestCm', 'shouldersCm', 'bicepsCm', 'thighCm'
];

function getMeasurementDayKey(entry) {
  if (!entry) return new Date().toISOString().slice(0, 10);
  if (entry.dayKey && /^\d{4}-\d{2}-\d{2}$/.test(entry.dayKey)) {
    return entry.dayKey;
  }
  if (entry.isoDate && typeof entry.isoDate === 'string') {
    const mIso = entry.isoDate.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (mIso) return `${mIso[1]}-${mIso[2]}-${mIso[3]}`;
  }
  if (entry.dateLabel && typeof entry.dateLabel === 'string') {
    const mPl = entry.dateLabel.match(/(\d{1,2})[./-](\d{1,2})[./-](\d{4})/);
    if (mPl) {
      const dd = mPl[1].padStart(2, '0');
      const mm = mPl[2].padStart(2, '0');
      const yyyy = mPl[3];
      return `${yyyy}-${mm}-${dd}`;
    }
    const mIso2 = entry.dateLabel.match(/(\d{4})[./-](\d{1,2})[./-](\d{1,2})/);
    if (mIso2) {
      return `${mIso2[1]}-${mIso2[2].padStart(2, '0')}-${mIso2[3].padStart(2, '0')}`;
    }
  }
  const ts = entry.timestamp && !isNaN(entry.timestamp) ? entry.timestamp : Date.now();
  const d = new Date(ts);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function mergeNestedStatusObject(targetObj, sourceObj) {
  if (!sourceObj || typeof sourceObj !== 'object') return targetObj || null;
  const out = { ...(targetObj || {}) };
  Object.keys(sourceObj).forEach(k => {
    const v = sourceObj[k];
    if (v != null && v !== '') {
      out[k] = v;
    }
  });
  return Object.keys(out).length > 0 ? out : null;
}

function mergeSegmentalObject(targetSeg, sourceSeg) {
  if (!sourceSeg || typeof sourceSeg !== 'object') return targetSeg || null;
  const out = { ...(targetSeg || {}) };
  ['leftArm', 'rightArm', 'trunk', 'leftLeg', 'rightLeg'].forEach(limb => {
    const srcLimb = sourceSeg[limb];
    if (srcLimb && typeof srcLimb === 'object') {
      const curLimb = out[limb] || { kg: null, pct: null, status: '' };
      out[limb] = {
        kg: srcLimb.kg != null && !isNaN(parseFloat(srcLimb.kg)) ? parseFloat(srcLimb.kg) : curLimb.kg,
        pct: srcLimb.pct != null && !isNaN(parseFloat(srcLimb.pct)) ? parseFloat(srcLimb.pct) : curLimb.pct,
        status: srcLimb.status || curLimb.status || ''
      };
    }
  });
  const hasAny = Object.values(out).some(l => l && (l.kg != null || l.pct != null));
  return hasAny ? out : null;
}

function mergeWeightControlObject(targetWc, sourceWc) {
  if (!sourceWc || typeof sourceWc !== 'object') return targetWc || null;
  const out = { ...(targetWc || {}) };
  ['targetWeightKg', 'weightControlKg', 'fatControlKg', 'muscleControlKg'].forEach(k => {
    if (sourceWc[k] != null && !isNaN(parseFloat(sourceWc[k]))) {
      out[k] = parseFloat(sourceWc[k]);
    }
  });
  const hasAny = Object.values(out).some(v => v != null);
  return hasAny ? out : null;
}

// Upsert and merge a body measurement into STATE.bodyMeasurements by dayKey (YYYY-MM-DD).
// Returns { status: 'new' | 'merged' | 'duplicate', entry }
function upsertAndMergeBodyMeasurement(incoming) {
  if (!incoming) return { status: 'duplicate', entry: null };

  const dayKey = getMeasurementDayKey(incoming);
  incoming.dayKey = dayKey;

  const existing = STATE.bodyMeasurements.find(m => getMeasurementDayKey(m) === dayKey);
  if (!existing) {
    STATE.bodyMeasurements.unshift(incoming);
    return { status: 'new', entry: incoming };
  }

  let addedOrChangedAnyField = false;

  // Check scalar keys
  SCALAR_BODY_KEYS.forEach(k => {
    const incVal = incoming[k];
    if (incVal != null && incVal !== '') {
      if (existing[k] == null || existing[k] === '') {
        existing[k] = incVal;
        addedOrChangedAnyField = true;
      } else if (String(existing[k]) !== String(incVal)) {
        existing[k] = incVal;
        addedOrChangedAnyField = true;
      }
    }
  });

  // Check nested statuses
  if (incoming.statuses && typeof incoming.statuses === 'object') {
    const beforeJson = JSON.stringify(existing.statuses || {});
    existing.statuses = mergeNestedStatusObject(existing.statuses, incoming.statuses);
    if (JSON.stringify(existing.statuses || {}) !== beforeJson) {
      addedOrChangedAnyField = true;
    }
  }

  // Check segmentalFat
  if (incoming.segmentalFat && typeof incoming.segmentalFat === 'object') {
    const beforeJson = JSON.stringify(existing.segmentalFat || {});
    existing.segmentalFat = mergeSegmentalObject(existing.segmentalFat, incoming.segmentalFat);
    if (JSON.stringify(existing.segmentalFat || {}) !== beforeJson) {
      addedOrChangedAnyField = true;
    }
  }

  // Check segmentalMuscle
  if (incoming.segmentalMuscle && typeof incoming.segmentalMuscle === 'object') {
    const beforeJson = JSON.stringify(existing.segmentalMuscle || {});
    existing.segmentalMuscle = mergeSegmentalObject(existing.segmentalMuscle, incoming.segmentalMuscle);
    if (JSON.stringify(existing.segmentalMuscle || {}) !== beforeJson) {
      addedOrChangedAnyField = true;
    }
  }

  // Check weightControl
  if (incoming.weightControl && typeof incoming.weightControl === 'object') {
    const beforeJson = JSON.stringify(existing.weightControl || {});
    existing.weightControl = mergeWeightControlObject(existing.weightControl, incoming.weightControl);
    if (JSON.stringify(existing.weightControl || {}) !== beforeJson) {
      addedOrChangedAnyField = true;
    }
  }

  if (!addedOrChangedAnyField) {
    return { status: 'duplicate', entry: existing };
  }

  // Update source label to reflect merged data
  const hasScaleData = existing.bodyFatPct != null || existing.muscleMassKg != null || existing.bmi != null;
  const hasCircData = existing.waistCm != null || existing.beltCm != null || existing.chestCm != null || existing.bicepsCm != null || existing.thighCm != null || existing.shouldersCm != null;
  if (hasScaleData && hasCircData) {
    existing.source = 'Połączono (Waga + Obwody)';
  } else if (incoming.source && existing.source && !existing.source.includes(incoming.source)) {
    existing.source = 'Połączony raport dnia';
  }

  existing.dayKey = dayKey;
  return { status: 'merged', entry: existing };
}

// Consolidate any existing same-day entries in STATE.bodyMeasurements
function consolidateSameDayBodyMeasurements() {
  if (!Array.isArray(STATE.bodyMeasurements) || STATE.bodyMeasurements.length <= 1) {
    return { mergedCount: 0, duplicateCount: 0 };
  }

  // Process oldest to newest so newer values on the same day win
  const chronological = [...STATE.bodyMeasurements].sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
  STATE.bodyMeasurements = [];

  let mergedCount = 0;
  let duplicateCount = 0;

  chronological.forEach(item => {
    const res = upsertAndMergeBodyMeasurement(item);
    if (res.status === 'merged') mergedCount++;
    else if (res.status === 'duplicate') duplicateCount++;
  });

  STATE.bodyMeasurements.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
  localStorage.setItem('iron_body_measurements', JSON.stringify(STATE.bodyMeasurements));
  return { mergedCount, duplicateCount };
}

function manualConsolidateMeasurements() {
  const { mergedCount, duplicateCount } = consolidateSameDayBodyMeasurements();
  renderBodyMeasurementsView();
  if (mergedCount === 0 && duplicateCount === 0) {
    alert('✅ Wszystkie pomiary są już uporządkowane — każdy dzień ma jeden spójny wpis i brak duplikatów.');
  } else {
    alert(`🧩 Uporządkowano historię pomiarów!\n• Połączono częściowe pomiary z tego samego dnia: ${mergedCount}\n• Usunięto dokładne duplikaty: ${duplicateCount}`);
  }
}

function initBodyMeasurements() {
  if (!Array.isArray(STATE.bodyMeasurements)) {
    STATE.bodyMeasurements = [];
  }

  // Clean up legacy pre-seeded scan if it was stored in localStorage from v15
  const hadHardcodedScan = STATE.bodyMeasurements.some(m => m.id === 'scan-fitdays-20261021');
  if (hadHardcodedScan) {
    STATE.bodyMeasurements = STATE.bodyMeasurements.filter(m => m.id !== 'scan-fitdays-20261021');
    localStorage.setItem('iron_body_measurements', JSON.stringify(STATE.bodyMeasurements));

    // Also clear default 88.1/185 from userProfile if no other measurements exist
    if (STATE.bodyMeasurements.length === 0 && STATE.userProfile && STATE.userProfile.weightKg == 88.1 && STATE.userProfile.heightCm == 185) {
      STATE.userProfile.weightKg = '';
      STATE.userProfile.heightCm = '';
      localStorage.setItem('iron_user_profile', JSON.stringify(STATE.userProfile));
      loadUserProfile();
    }
  }

  // Automatically consolidate any same-day records or duplicates on startup
  consolidateSameDayBodyMeasurements();

  // Ensure sorted newest first
  STATE.bodyMeasurements.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

  renderBodyMeasurementsView();
}

function switchBodySubTab(tabName) {
  const tabs = ['charts', 'scale', 'history'];
  tabs.forEach(t => {
    const viewEl = document.getElementById(`body-subview-${t}`);
    const btnEl = document.getElementById(`body-subtab-btn-${t}`);
    if (viewEl) viewEl.style.display = t === tabName ? 'block' : 'none';
    if (btnEl) {
      if (t === tabName) btnEl.classList.add('active');
      else btnEl.classList.remove('active');
    }
  });
  if (tabName === 'charts') {
    renderBodyChart();
  }
}

function renderBodyMeasurementsView() {
  renderLatestScaleReport();
  populateCircumferenceInputs();
  renderBodyChart();
  renderBodyHistoryList();
  renderHomeKpis();
  if (typeof renderCalendarDashboard === 'function') renderCalendarDashboard();
}

function getSelectedOrLatestScaleEntry() {
  if (STATE.selectedBodyMeasurementId) {
    const found = STATE.bodyMeasurements.find(m => m.id === STATE.selectedBodyMeasurementId);
    if (found) return found;
  }
  return STATE.bodyMeasurements.find(m => m.weightKg || m.bodyFatPct || m.muscleMassKg) || STATE.bodyMeasurements[0] || null;
}

function statusBadgeHtml(statusText) {
  if (!statusText) return '';
  const s = String(statusText).toLowerCase();
  let bg = 'rgba(0, 229, 255, 0.14)';
  let col = 'var(--accent)';
  if (s.includes('doskona') || s.includes('norm') || s.includes('optym')) {
    bg = 'rgba(0, 230, 118, 0.16)';
    col = 'var(--success)';
  } else if (s.includes('wysok') || s.includes('nisk') || s.includes('otył')) {
    bg = 'rgba(255, 82, 82, 0.18)';
    col = 'var(--danger)';
  }
  return `<span style="padding: 2px 7px; border-radius: 6px; font-size: 11px; font-weight: 700; background: ${bg}; color: ${col};">${escapeHtml(statusText)}</span>`;
}

function renderLatestScaleReport() {
  const container = document.getElementById('scale-latest-report-container');
  if (!container) return;

  const entry = getSelectedOrLatestScaleEntry();
  if (!entry) {
    container.innerHTML = `<p style="color: var(--text-muted); font-size: 13px;">Brak zaimportowanych raportów z wagi.</p>`;
    return;
  }

  const dateStr = entry.dateLabel || new Date(entry.timestamp || Date.now()).toLocaleString('pl-PL');

  const st = entry.statuses || {};
  const metricsRows = [
    { label: 'Waga', val: entry.weightKg != null ? `${entry.weightKg} kg` : null, status: st.weightKg || '' },
    { label: 'BMI', val: entry.bmi != null ? `${entry.bmi}` : null, status: st.bmi || '' },
    { label: 'Tkanka tłuszczowa', val: entry.bodyFatPct != null ? `${entry.bodyFatPct}%` : null, status: st.bodyFatPct || '' },
    { label: 'Masa tłuszczowa', val: entry.fatMassKg != null ? `${entry.fatMassKg} kg` : null, status: st.fatMassKg || '' },
    { label: 'Beztłuszczowa masa ciała (FFM)', val: entry.ffmKg != null ? `${entry.ffmKg} kg` : null, status: st.ffmKg || '' },
    { label: 'Masa mięśniowa', val: entry.muscleMassKg != null ? `${entry.muscleMassKg} kg` : null, status: st.muscleMassKg || '' },
    { label: 'Wskaźnik mięśniowy', val: entry.muscleRatePct != null ? `${entry.muscleRatePct}%` : null, status: st.muscleRatePct || '' },
    { label: 'Mięśnie szkieletowe', val: entry.skeletalMusclePct != null ? `${entry.skeletalMusclePct}%` : null, status: st.skeletalMusclePct || '' },
    { label: 'Masa kostna', val: entry.boneMassKg != null ? `${entry.boneMassKg} kg` : null, status: st.boneMassKg || '' },
    { label: 'Masa białkowa', val: entry.proteinMassKg != null ? `${entry.proteinMassKg} kg` : null, status: st.proteinMassKg || '' },
    { label: 'Białko', val: entry.proteinPct != null ? `${entry.proteinPct}%` : null, status: st.proteinPct || '' },
    { label: 'Masa wody', val: entry.waterMassKg != null ? `${entry.waterMassKg} kg` : null, status: st.waterMassKg || '' },
    { label: 'Woda w organizmie', val: entry.bodyWaterPct != null ? `${entry.bodyWaterPct}%` : null, status: st.bodyWaterPct || '' },
    { label: 'Tłuszcz podskórny', val: entry.subcutaneousFatPct != null ? `${entry.subcutaneousFatPct}%` : null, status: st.subcutaneousFatPct || '' },
    { label: 'Tłuszcz trzewny (wisceralny)', val: entry.visceralFat != null ? `${entry.visceralFat}` : null, status: st.visceralFat || '' },
    { label: 'BMR (Przemiana materii)', val: entry.bmrKcal != null ? `${entry.bmrKcal} kcal` : null, status: st.bmrKcal || '' },
    { label: 'Wiek ciała', val: entry.bodyAge != null ? `${entry.bodyAge} lat` : null, status: st.bodyAge || '' },
    { label: 'WHR (Talia/Biodra)', val: entry.whr != null ? `${entry.whr}` : null, status: st.whr || '' },
    { label: 'Idealna masa ciała', val: entry.idealWeightKg != null ? `${entry.idealWeightKg} kg` : null, status: st.idealWeightKg || '' },
    { label: 'Poziom otyłości', val: entry.obesityLevel || null, status: st.obesityLevel || '' },
    { label: 'Typ ciała', val: entry.bodyType || null, status: st.bodyType || '' }
  ].filter(r => r.val !== null);

  // Segmental Fat & Muscle HTML
  const sf = entry.segmentalFat;
  const sm = entry.segmentalMuscle;
  let segmentalHtml = '';
  if (sf || sm) {
    const renderSegRow = (name, obj) => {
      if (!obj) return '';
      return `
        <div style="display: flex; justify-content: space-between; align-items: center; padding: 5px 0; border-bottom: 1px solid rgba(255,255,255,0.06); font-size: 12px;">
          <span style="color: var(--text-muted);">${name}</span>
          <span><b>${obj.kg != null ? obj.kg + ' kg' : ''}</b> ${obj.pct != null ? `(${obj.pct}%)` : ''}</span>
          ${statusBadgeHtml(obj.status || '')}
        </div>
      `;
    };

    segmentalHtml = `
      <div style="margin-top: 14px; display: grid; grid-template-columns: 1fr; gap: 10px;">
        ${sf ? `
          <div style="background: var(--surface-elevated); padding: 10px 12px; border-radius: 10px; border: 1px solid var(--border);">
            <div style="font-weight: 800; font-size: 13px; color: var(--primary); margin-bottom: 6px;">🦵 Segmentowa analiza tłuszczu (Kończyny i Tułów)</div>
            ${renderSegRow('Lewa ręka (L)', sf.leftArm)}
            ${renderSegRow('Prawa ręka (R)', sf.rightArm)}
            ${renderSegRow('Tułów', sf.trunk)}
            ${renderSegRow('Lewa noga (L)', sf.leftLeg)}
            ${renderSegRow('Prawa noga (R)', sf.rightLeg)}
          </div>
        ` : ''}
        ${sm ? `
          <div style="background: var(--surface-elevated); padding: 10px 12px; border-radius: 10px; border: 1px solid var(--border);">
            <div style="font-weight: 800; font-size: 13px; color: var(--accent); margin-bottom: 6px;">💪 Równowaga mięśniowa (Kończyny i Tułów)</div>
            ${renderSegRow('Lewa ręka (L)', sm.leftArm)}
            ${renderSegRow('Prawa ręka (R)', sm.rightArm)}
            ${renderSegRow('Tułów', sm.trunk)}
            ${renderSegRow('Lewa noga (L)', sm.leftLeg)}
            ${renderSegRow('Prawa noga (R)', sm.rightLeg)}
          </div>
        ` : ''}
      </div>
    `;
  }

  // Weight Control HTML
  const wc = entry.weightControl;
  let weightControlHtml = '';
  if (wc && (wc.targetWeightKg != null || wc.fatControlKg != null)) {
    weightControlHtml = `
      <div style="margin-top: 10px; background: rgba(0, 229, 255, 0.06); padding: 10px 12px; border-radius: 10px; border: 1px solid rgba(0, 229, 255, 0.25);">
        <div style="font-weight: 800; font-size: 13px; color: var(--accent); margin-bottom: 6px;">🎯 Kontrola wagi (Fitdays)</div>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 6px; font-size: 12px;">
          <div>Zalecana waga docelowa: <b>${wc.targetWeightKg ?? '-'} kg</b></div>
          <div>Kontrola wagi: <b>${wc.weightControlKg > 0 ? '+' : ''}${wc.weightControlKg ?? '-'} kg</b></div>
          <div>Kontrola tłuszczu: <b style="color: var(--primary);">${wc.fatControlKg > 0 ? '+' : ''}${wc.fatControlKg ?? '-'} kg</b></div>
          <div>Kontrola mięśni: <b style="color: var(--success);">${wc.muscleControlKg > 0 ? '+' : ''}${wc.muscleControlKg ?? '-'} kg</b></div>
        </div>
      </div>
    `;
  }

  // Circumferences attached to this entry (if any)
  const circItems = [
    entry.waistCm ? `Talia: <b>${entry.waistCm} cm</b>` : null,
    entry.beltCm ? `Pas: <b>${entry.beltCm} cm</b>` : null,
    entry.chestCm ? `Klatka: <b>${entry.chestCm} cm</b>` : null,
    entry.shouldersCm ? `Ramiona: <b>${entry.shouldersCm} cm</b>` : null,
    entry.bicepsCm ? `Biceps: <b>${entry.bicepsCm} cm</b>` : null,
    entry.thighCm ? `Udo: <b>${entry.thighCm} cm</b>` : null
  ].filter(Boolean);

  container.innerHTML = `
    <div style="background: var(--surface-elevated); border-radius: 12px; padding: 12px; border: 1px solid var(--border);">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
        <span style="font-size: 12px; color: var(--text-muted);">📅 Pomiar z dnia: <b style="color: var(--text);">${escapeHtml(dateStr)}</b></span>
        <span class="badge">${escapeHtml(entry.source || 'Waga / Pomiar')}</span>
      </div>

      <!-- Top 3 Hero KPIs like Fitdays Header -->
      ${entry.weightKg != null ? `
        <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px; text-align: center; background: #12151b; padding: 12px 8px; border-radius: 10px; margin-bottom: 12px; border: 1px solid var(--border);">
          <div>
            <div style="font-size: 20px; font-weight: 900; color: var(--primary);">${entry.weightKg} <span style="font-size: 12px;">kg</span></div>
            <div style="font-size: 11px; color: var(--text-muted);">Waga</div>
          </div>
          <div style="border-left: 1px solid var(--border); border-right: 1px solid var(--border);">
            <div style="font-size: 20px; font-weight: 900; color: var(--text);">${entry.bmi ?? '-'}</div>
            <div style="font-size: 11px; color: var(--text-muted);">BMI</div>
          </div>
          <div>
            <div style="font-size: 20px; font-weight: 900; color: var(--accent);">${entry.bodyFatPct ?? '-'}<span style="font-size: 12px;">%</span></div>
            <div style="font-size: 11px; color: var(--text-muted);">Tkanka tłuszcz.</div>
          </div>
        </div>
      ` : ''}

      <!-- Full Indicators Table -->
      ${metricsRows.length > 0 ? `
        <div style="max-height: 340px; overflow-y: auto; padding-right: 4px;">
          ${metricsRows.map(r => `
            <div style="display: flex; justify-content: space-between; align-items: center; padding: 6px 4px; border-bottom: 1px solid rgba(255,255,255,0.06); font-size: 13px;">
              <span style="color: var(--text-muted);">${escapeHtml(r.label)}</span>
              <div style="display: flex; align-items: center; gap: 8px;">
                <b style="color: var(--text);">${escapeHtml(String(r.val))}</b>
                ${statusBadgeHtml(r.status)}
              </div>
            </div>
          `).join('')}
        </div>
      ` : ''}

      ${segmentalHtml}
      ${weightControlHtml}

      ${circItems.length > 0 ? `
        <div style="margin-top: 10px; padding: 8px 10px; background: rgba(255, 179, 0, 0.08); border-radius: 8px; font-size: 12px;">
          <div style="font-weight: 700; color: var(--primary); margin-bottom: 4px;">📏 Zapisane obwody w tym pomiarze:</div>
          <div>${circItems.join(' • ')}</div>
        </div>
      ` : ''}
    </div>
  `;
}

// Helper to resize image files on canvas before sending to Gemini Vision
async function fileToGeminiInlinePart(file, maxDim = 1500, quality = 0.84) {
  if (file.type === 'application/pdf') {
    const base64Data = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || '').split(',')[1] || '');
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
    return { mimeType: 'application/pdf', data: base64Data };
  }

  if (file.type.startsWith('image/')) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          let w = img.width;
          let h = img.height;
          if (w > maxDim || h > maxDim) {
            if (w > h) {
              h = Math.round((h * maxDim) / w);
              w = maxDim;
            } else {
              w = Math.round((w * maxDim) / h);
              h = maxDim;
            }
          }
          const canvas = document.createElement('canvas');
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, w, h);
          const dataUrl = canvas.toDataURL('image/jpeg', quality);
          resolve({
            mimeType: 'image/jpeg',
            data: dataUrl.split(',')[1] || '',
            previewDataUrl: dataUrl
          });
        };
        img.onerror = reject;
        img.src = e.target.result;
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  return null;
}

function normalizeParsedScaleEntry(parsed, idx = 0) {
  let parsedTime = Date.now();
  if (parsed.isoDate) {
    const t = new Date(parsed.isoDate).getTime();
    if (!isNaN(t) && t > 946684800000) parsedTime = t;
  } else if (parsed.dateLabel) {
    const mPl = String(parsed.dateLabel).match(/(\d{1,2})[./-](\d{1,2})[./-](\d{4})/);
    if (mPl) {
      const t = new Date(`${mPl[3]}-${mPl[2].padStart(2, '0')}-${mPl[1].padStart(2, '0')}T12:00:00`).getTime();
      if (!isNaN(t)) parsedTime = t;
    }
  }

  const entry = {
    id: 'scan-' + Date.now() + '-' + idx + '-' + Math.random().toString(36).slice(2, 6),
    timestamp: parsedTime,
    isoDate: parsed.isoDate || null,
    dateLabel: parsed.dateLabel || new Date(parsedTime).toLocaleString('pl-PL'),
    source: parsed.source || 'AI Multi-Import',
    weightKg: parseFloat(parsed.weightKg) || null,
    bmi: parseFloat(parsed.bmi) || null,
    bodyFatPct: parseFloat(parsed.bodyFatPct) || null,
    fatMassKg: parseFloat(parsed.fatMassKg) || null,
    ffmKg: parseFloat(parsed.ffmKg) || null,
    muscleMassKg: parseFloat(parsed.muscleMassKg) || null,
    muscleRatePct: parseFloat(parsed.muscleRatePct) || null,
    skeletalMusclePct: parseFloat(parsed.skeletalMusclePct) || null,
    boneMassKg: parseFloat(parsed.boneMassKg) || null,
    proteinMassKg: parseFloat(parsed.proteinMassKg) || null,
    proteinPct: parseFloat(parsed.proteinPct) || null,
    waterMassKg: parseFloat(parsed.waterMassKg) || null,
    bodyWaterPct: parseFloat(parsed.bodyWaterPct) || null,
    subcutaneousFatPct: parseFloat(parsed.subcutaneousFatPct) || null,
    visceralFat: parseFloat(parsed.visceralFat) || null,
    bmrKcal: parseInt(parsed.bmrKcal) || null,
    bodyAge: parseInt(parsed.bodyAge) || null,
    whr: parseFloat(parsed.whr) || null,
    idealWeightKg: parseFloat(parsed.idealWeightKg) || null,
    obesityLevel: parsed.obesityLevel || null,
    bodyType: parsed.bodyType || null,
    statuses: parsed.statuses || null,
    segmentalFat: parsed.segmentalFat || null,
    segmentalMuscle: parsed.segmentalMuscle || null,
    weightControl: parsed.weightControl || null,
    waistCm: parseFloat(parsed.waistCm) || null,
    beltCm: parseFloat(parsed.beltCm) || null,
    chestCm: parseFloat(parsed.chestCm) || null,
    shouldersCm: parseFloat(parsed.shouldersCm) || null,
    bicepsCm: parseFloat(parsed.bicepsCm) || null,
    thighCm: parseFloat(parsed.thighCm) || null
  };
  entry.dayKey = getMeasurementDayKey(entry);
  return entry;
}

// Import 1 or MULTIPLE Fitdays screenshots, PDFs, CSVs, or circumference notes using Gemini Vision
async function importScaleReportFile(event) {
  const files = Array.from(event.target.files || []);
  if (files.length === 0) return;

  const loadingEl = document.getElementById('scale-import-loading');
  const loadingTextEl = document.getElementById('scale-import-loading-text');
  const summaryEl = document.getElementById('scale-import-summary');

  if (loadingEl) loadingEl.style.display = 'block';
  if (summaryEl) summaryEl.style.display = 'none';
  if (loadingTextEl) {
    loadingTextEl.textContent = `⏳ AI analizuje ${files.length} plik(ów), łączy częściowe zrzuty i wykrywa duplikaty...`;
  }

  const todayIso = new Date().toISOString().slice(0, 10);

  const prompt = `
Jesteś ekspertem analizy składu ciała i antropometrii. Użytkownik przesłał ${files.length} plik(ów) (mogą to być częściowe zrzuty ekranu z aplikacji wagi np. Fitdays, raporty PDF, zdjęcia tabel, notatki z obwodami ciała w cm lub pliki CSV).
Twoje zadanie:
1. Odczytaj WSZYSTKIE dane o wadze, składzie ciała (21 parametrów Fitdays + analiza segmentowa + kontrola wagi) ORAZ obwodach ciała w centymetrach (talia, pas, klatka, ramiona/barki, biceps, udo) ze wszystkich załączonych plików.
2. Jeśli kilka zrzutów ekranu lub plików dotyczy TEGO SAMEGO DNIA (np. jeden zrzut pokazuje górę tabeli Fitdays, drugi dół tabeli lub analizę segmentową, a trzeci obwody z tego samego dnia), POŁĄCZ je od razu w jeden kompletny wpis dla tego dnia!
3. Jeśli wśród plików jest dokładnie ten sam zrzut wrzucony podwójnie, pomiń duplikat.
4. Jeśli na którymś zrzucie nie widać daty, użyj daty z pozostałych zrzutów z tej samej serii lub dzisiejszej daty (${todayIso}).

Zwróć WYŁĄCZNIE poprawny obiekt JSON bez znaczników markdown o strukturze:
{
  "entries": [
    {
      "dateLabel": "DD.MM.YYYY, HH:MM",
      "isoDate": "YYYY-MM-DDTHH:MM:00",
      "weightKg": null,
      "bmi": null,
      "bodyFatPct": null,
      "fatMassKg": null,
      "ffmKg": null,
      "muscleMassKg": null,
      "muscleRatePct": null,
      "skeletalMusclePct": null,
      "boneMassKg": null,
      "proteinMassKg": null,
      "proteinPct": null,
      "waterMassKg": null,
      "bodyWaterPct": null,
      "subcutaneousFatPct": null,
      "visceralFat": null,
      "bmrKcal": null,
      "bodyAge": null,
      "whr": null,
      "idealWeightKg": null,
      "obesityLevel": null,
      "bodyType": null,
      "waistCm": null,
      "beltCm": null,
      "chestCm": null,
      "shouldersCm": null,
      "bicepsCm": null,
      "thighCm": null,
      "statuses": {
        "weightKg": "",
        "bmi": "",
        "bodyFatPct": "",
        "fatMassKg": "",
        "muscleMassKg": "",
        "muscleRatePct": "",
        "skeletalMusclePct": "",
        "boneMassKg": "",
        "proteinMassKg": "",
        "proteinPct": "",
        "waterMassKg": "",
        "bodyWaterPct": "",
        "subcutaneousFatPct": "",
        "visceralFat": "",
        "bodyAge": "",
        "whr": ""
      },
      "segmentalFat": {
        "leftArm": { "kg": null, "pct": null, "status": "" },
        "rightArm": { "kg": null, "pct": null, "status": "" },
        "trunk": { "kg": null, "pct": null, "status": "" },
        "leftLeg": { "kg": null, "pct": null, "status": "" },
        "rightLeg": { "kg": null, "pct": null, "status": "" }
      },
      "segmentalMuscle": {
        "leftArm": { "kg": null, "pct": null, "status": "" },
        "rightArm": { "kg": null, "pct": null, "status": "" },
        "trunk": { "kg": null, "pct": null, "status": "" },
        "leftLeg": { "kg": null, "pct": null, "status": "" },
        "rightLeg": { "kg": null, "pct": null, "status": "" }
      },
      "weightControl": {
        "targetWeightKg": null,
        "weightControlKg": null,
        "fatControlKg": null,
        "muscleControlKg": null
      }
    }
  ]
}`;

  try {
    const inlineParts = [];
    const textSnippets = [];

    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      if (f.type.startsWith('image/') || f.type === 'application/pdf') {
        const part = await fileToGeminiInlinePart(f, 1500, 0.84);
        if (part) inlineParts.push({ mimeType: part.mimeType, data: part.data });
      } else {
        const txt = await f.text();
        textSnippets.push(`--- Plik ${i + 1}: ${f.name} ---\n${txt}`);
      }
    }

    const fullPrompt = textSnippets.length > 0
      ? `${prompt}\n\nDodatkowe dane tekstowe z załączonych plików:\n${textSnippets.join('\n\n')}`
      : prompt;

    const rawResponse = await callGemini(fullPrompt, 'smart', inlineParts);
    const parsedRoot = extractJsonFromGemini(rawResponse);

    const rawEntries = Array.isArray(parsedRoot)
      ? parsedRoot
      : (Array.isArray(parsedRoot.entries) ? parsedRoot.entries : [parsedRoot]);

    let addedNew = 0;
    let mergedSameDay = 0;
    let skippedDuplicates = 0;
    let lastAffectedEntry = null;

    rawEntries.forEach((rawItem, idx) => {
      const normEntry = normalizeParsedScaleEntry(rawItem, idx);
      const hasAnyValue = SCALAR_BODY_KEYS.some(k => normEntry[k] != null) || normEntry.segmentalFat || normEntry.segmentalMuscle;
      if (!hasAnyValue) return;

      const res = upsertAndMergeBodyMeasurement(normEntry);
      if (res.status === 'new') addedNew++;
      else if (res.status === 'merged') mergedSameDay++;
      else if (res.status === 'duplicate') skippedDuplicates++;

      if (res.entry) lastAffectedEntry = res.entry;
    });

    STATE.bodyMeasurements.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
    if (lastAffectedEntry) {
      STATE.selectedBodyMeasurementId = lastAffectedEntry.id;
    }
    localStorage.setItem('iron_body_measurements', JSON.stringify(STATE.bodyMeasurements));

    // Update current weight in userProfile from the newest measurement that has weightKg
    const newestWithWeight = STATE.bodyMeasurements.find(m => m.weightKg);
    if (newestWithWeight && newestWithWeight.weightKg) {
      STATE.userProfile.weightKg = newestWithWeight.weightKg;
      localStorage.setItem('iron_user_profile', JSON.stringify(STATE.userProfile));
      loadUserProfile();
    }

    renderBodyMeasurementsView();

    if (summaryEl) {
      summaryEl.innerHTML = `
        <div style="font-weight: 800; color: var(--success); margin-bottom: 4px;">
          ✅ Przeanalizowano plików: ${files.length}
        </div>
        <div style="color: var(--text);">
          🆕 Nowe dni pomiarowe: <b>${addedNew}</b> •
          🧩 Połączono z tego samego dnia: <b>${mergedSameDay}</b> •
          ♻️ Pominięto duplikaty: <b>${skippedDuplicates}</b>
        </div>
      `;
      summaryEl.style.display = 'block';
    }
  } catch (err) {
    alert('Błąd podczas analizy plików z pomiarami: ' + err.message);
  } finally {
    if (loadingEl) loadingEl.style.display = 'none';
    event.target.value = '';
  }
}

function populateCircumferenceInputs() {
  const latestWithCirc = STATE.bodyMeasurements.find(
    m => m.waistCm || m.beltCm || m.chestCm || m.shouldersCm || m.bicepsCm || m.thighCm
  );
  if (!latestWithCirc) return;

  const setIfEmpty = (id, val) => {
    const el = document.getElementById(id);
    if (el && !el.value && val != null) el.value = val;
  };
  setIfEmpty('circ-waist', latestWithCirc.waistCm);
  setIfEmpty('circ-belt', latestWithCirc.beltCm);
  setIfEmpty('circ-chest', latestWithCirc.chestCm);
  setIfEmpty('circ-shoulders', latestWithCirc.shouldersCm);
  setIfEmpty('circ-biceps', latestWithCirc.bicepsCm);
  setIfEmpty('circ-thigh', latestWithCirc.thighCm);
}

function saveBodyCircumferences() {
  const waistCm = parseFloat(document.getElementById('circ-waist')?.value) || null;
  const beltCm = parseFloat(document.getElementById('circ-belt')?.value) || null;
  const chestCm = parseFloat(document.getElementById('circ-chest')?.value) || null;
  const shouldersCm = parseFloat(document.getElementById('circ-shoulders')?.value) || null;
  const bicepsCm = parseFloat(document.getElementById('circ-biceps')?.value) || null;
  const thighCm = parseFloat(document.getElementById('circ-thigh')?.value) || null;

  if (!waistCm && !beltCm && !chestCm && !shouldersCm && !bicepsCm && !thighCm) {
    return alert('Wpisz przynajmniej jeden obwód (w cm)!');
  }

  const now = Date.now();
  const newEntry = {
    id: 'circ-' + now,
    timestamp: now,
    dateLabel: new Date(now).toLocaleString('pl-PL'),
    source: 'Pomiar obwodów (cm)',
    weightKg: parseFloat(STATE.userProfile?.weightKg) || null,
    waistCm,
    beltCm,
    chestCm,
    shouldersCm,
    bicepsCm,
    thighCm
  };

  // Upsert & merge into today's entry if one already exists on the same day
  const res = upsertAndMergeBodyMeasurement(newEntry);
  if (res.entry) {
    STATE.selectedBodyMeasurementId = res.entry.id;
  }

  STATE.bodyMeasurements.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
  localStorage.setItem('iron_body_measurements', JSON.stringify(STATE.bodyMeasurements));

  // Switch chart metric to the first entered circumference so user immediately sees it on the chart
  const chartSelect = document.getElementById('body-chart-metric');
  if (chartSelect && !chartSelect.value.endsWith('Cm')) {
    if (waistCm) chartSelect.value = 'waistCm';
    else if (bicepsCm) chartSelect.value = 'bicepsCm';
    else if (chestCm) chartSelect.value = 'chestCm';
  }

  renderBodyMeasurementsView();

  const statusEl = document.getElementById('circ-save-status');
  if (statusEl) {
    statusEl.textContent = res.status === 'merged'
      ? '✅ Obwody połączono z dzisiejszym pomiarem i zaktualizowano na wykresie!'
      : '✅ Obwody zapisane i zaktualizowane na wykresie!';
    statusEl.style.display = 'block';
    setTimeout(() => { statusEl.style.display = 'none'; }, 3500);
  }
}

// Render interactive SVG Line Chart for any selected body metric over time
function renderBodyChart() {
  const container = document.getElementById('body-chart-container');
  const selectEl = document.getElementById('body-chart-metric');
  const deltaBadge = document.getElementById('chart-delta-badge');
  if (!container || !selectEl) return;

  const metricKey = selectEl.value || 'weightKg';
  const metricLabel = selectEl.options[selectEl.selectedIndex]?.text || metricKey;

  // Gather chronological points (oldest -> newest)
  const points = [...STATE.bodyMeasurements]
    .filter(m => m[metricKey] != null && !isNaN(parseFloat(m[metricKey])))
    .sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0))
    .map(m => ({
      val: parseFloat(m[metricKey]),
      ts: m.timestamp || Date.now(),
      dateShort: new Date(m.timestamp || Date.now()).toLocaleDateString('pl-PL', { day: '2-digit', month: '2-digit' })
    }));

  if (points.length === 0) {
    if (deltaBadge) deltaBadge.textContent = 'Brak danych';
    container.innerHTML = `
      <div style="text-align: center; color: var(--text-muted); padding: 36px 12px; font-size: 13px;">
        Brak zapisanych pomiarów dla wskaźnika: <b>${escapeHtml(metricLabel)}</b>.<br>
        Dodaj obwody powyżej lub zaimportuj raport z wagi!
      </div>
    `;
    return;
  }

  const firstVal = points[0].val;
  const lastVal = points[points.length - 1].val;
  const diff = +(lastVal - firstVal).toFixed(2);
  if (deltaBadge) {
    if (points.length === 1) {
      deltaBadge.textContent = `Aktualnie: ${lastVal}`;
    } else {
      const sign = diff > 0 ? '+' : '';
      deltaBadge.textContent = `Zmiana: ${sign}${diff} (od ${points[0].dateShort})`;
    }
  }

  const width = 500;
  const height = 180;
  const padLeft = 42;
  const padRight = 24;
  const padTop = 26;
  const padBottom = 32;
  const plotW = width - padLeft - padRight;
  const plotH = height - padTop - padBottom;

  const vals = points.map(p => p.val);
  let minVal = Math.min(...vals);
  let maxVal = Math.max(...vals);
  if (minVal === maxVal) {
    minVal = minVal - 2;
    maxVal = maxVal + 2;
  } else {
    const margin = (maxVal - minVal) * 0.15;
    minVal -= margin;
    maxVal += margin;
  }

  const coords = points.map((p, idx) => {
    const x = points.length === 1
      ? padLeft + plotW / 2
      : padLeft + (idx / (points.length - 1)) * plotW;
    const y = padTop + plotH - ((p.val - minVal) / (maxVal - minVal)) * plotH;
    return { ...p, x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10 };
  });

  const polylinePoints = coords.map(c => `${c.x},${c.y}`).join(' ');
  const areaPoints = coords.length > 1
    ? `${coords[0].x},${padTop + plotH} ${polylinePoints} ${coords[coords.length - 1].x},${padTop + plotH}`
    : '';

  container.innerHTML = `
    <svg viewBox="0 0 ${width} ${height}" style="width: 100%; height: auto; display: block; overflow: visible;">
      <defs>
        <linearGradient id="chartGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#00E5FF" stop-opacity="0.32"/>
          <stop offset="100%" stop-color="#00E5FF" stop-opacity="0.0"/>
        </linearGradient>
      </defs>

      <!-- Horizontal reference lines -->
      <line x1="${padLeft}" y1="${padTop}" x2="${width - padRight}" y2="${padTop}" stroke="#242832" stroke-dasharray="4 4" stroke-width="1"/>
      <line x1="${padLeft}" y1="${padTop + plotH / 2}" x2="${width - padRight}" y2="${padTop + plotH / 2}" stroke="#242832" stroke-dasharray="4 4" stroke-width="1"/>
      <line x1="${padLeft}" y1="${padTop + plotH}" x2="${width - padRight}" y2="${padTop + plotH}" stroke="#2C323E" stroke-width="1"/>

      <!-- Y-axis labels -->
      <text x="${padLeft - 6}" y="${padTop + 4}" fill="#8E99A8" font-size="10" text-anchor="end">${maxVal.toFixed(1)}</text>
      <text x="${padLeft - 6}" y="${padTop + plotH / 2 + 4}" fill="#8E99A8" font-size="10" text-anchor="end">${((maxVal + minVal) / 2).toFixed(1)}</text>
      <text x="${padLeft - 6}" y="${padTop + plotH + 4}" fill="#8E99A8" font-size="10" text-anchor="end">${minVal.toFixed(1)}</text>

      <!-- Area & Line -->
      ${areaPoints ? `<polygon points="${areaPoints}" fill="url(#chartGrad)"/>` : ''}
      ${coords.length > 1 ? `<polyline fill="none" stroke="#00E5FF" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" points="${polylinePoints}"/>` : ''}

      <!-- Points & Value Labels -->
      ${coords.map((c, i) => {
        const showLabel = coords.length <= 8 || i === 0 || i === coords.length - 1 || i % Math.ceil(coords.length / 6) === 0;
        return `
          <circle cx="${c.x}" cy="${c.y}" r="5" fill="#FFB300" stroke="#101216" stroke-width="2"/>
          ${showLabel ? `
            <text x="${c.x}" y="${c.y - 10}" fill="#F0F3F8" font-size="11" font-weight="700" text-anchor="middle">${c.val}</text>
            <text x="${c.x}" y="${padTop + plotH + 18}" fill="#8E99A8" font-size="10" text-anchor="middle">${c.dateShort}</text>
          ` : ''}
        `;
      }).join('')}
    </svg>
  `;
}

function renderBodyHistoryList() {
  const listEl = document.getElementById('body-history-list');
  const countEl = document.getElementById('body-history-count');
  if (!listEl) return;

  if (countEl) countEl.textContent = `${STATE.bodyMeasurements.length}`;

  if (STATE.bodyMeasurements.length === 0) {
    listEl.innerHTML = `<p style="color: var(--text-muted); font-size: 13px;">Brak zapisanych pomiarów.</p>`;
    return;
  }

  listEl.innerHTML = STATE.bodyMeasurements.map(m => {
    const dStr = m.dateLabel || new Date(m.timestamp || Date.now()).toLocaleString('pl-PL');
    const tags = [];
    if (m.weightKg) tags.push(`⚖️ <b>${m.weightKg} kg</b>`);
    if (m.bodyFatPct) tags.push(`BF: <b>${m.bodyFatPct}%</b>`);
    if (m.muscleMassKg) tags.push(`Mięśnie: <b>${m.muscleMassKg} kg</b>`);
    if (m.waistCm) tags.push(`Talia: <b>${m.waistCm} cm</b>`);
    if (m.beltCm) tags.push(`Pas: <b>${m.beltCm} cm</b>`);
    if (m.chestCm) tags.push(`Klatka: <b>${m.chestCm} cm</b>`);
    if (m.shouldersCm) tags.push(`Ramiona: <b>${m.shouldersCm} cm</b>`);
    if (m.bicepsCm) tags.push(`Biceps: <b>${m.bicepsCm} cm</b>`);
    if (m.thighCm) tags.push(`Udo: <b>${m.thighCm} cm</b>`);

    const isSelected = STATE.selectedBodyMeasurementId === m.id;
    return `
      <div style="background: var(--surface-elevated); border: 1px solid ${isSelected ? 'var(--accent)' : 'var(--border)'}; border-radius: 10px; padding: 10px 12px; margin-bottom: 8px;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
          <span style="font-size: 12px; font-weight: 700; color: var(--primary);">${escapeHtml(dStr)}</span>
          <span style="font-size: 11px; color: var(--text-muted);">${escapeHtml(m.source || '')}</span>
        </div>
        <div style="font-size: 12px; color: var(--text); margin-bottom: 8px; line-height: 1.5;">
          ${tags.join(' • ') || 'Zapis pomiaru'}
        </div>
        <div style="display: flex; gap: 6px; justify-content: flex-end;">
          ${m.bodyFatPct || m.muscleMassKg ? `<button class="btn btn-sm btn-secondary" style="font-size: 11px; padding: 4px 8px;" onclick="selectBodyMeasurement('${m.id}')">👁️ Pokaż w tabeli</button>` : ''}
          <button class="btn btn-sm btn-secondary" style="font-size: 11px; padding: 4px 8px; color: var(--danger);" onclick="deleteBodyMeasurement('${m.id}')">Usuń</button>
        </div>
      </div>
    `;
  }).join('');
}

function selectBodyMeasurement(id) {
  STATE.selectedBodyMeasurementId = id;
  renderLatestScaleReport();
  renderBodyHistoryList();
  switchBodySubTab('scale');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function deleteBodyMeasurement(id) {
  if (!confirm('Czy na pewno chcesz usunąć ten pomiar z historii?')) return;
  STATE.bodyMeasurements = STATE.bodyMeasurements.filter(m => m.id !== id);
  if (STATE.selectedBodyMeasurementId === id) {
    STATE.selectedBodyMeasurementId = null;
  }
  localStorage.setItem('iron_body_measurements', JSON.stringify(STATE.bodyMeasurements));
  renderBodyMeasurementsView();
}

// ============================================================================
// NUTRITION GOALS, HIGH-MODEL AI MEAL PHOTO ANALYZER & DAILY FOOD DIARY
// ============================================================================
function initNutritionView() {
  if (!STATE.nutritionGoals || typeof STATE.nutritionGoals !== 'object') {
    STATE.nutritionGoals = { kcal: 2500, proteinG: 180, carbsG: 276, fatG: 75 };
  }
  if (!Array.isArray(STATE.nutritionDiary)) {
    STATE.nutritionDiary = [];
  }
  if (!STATE.selectedNutritionDate) {
    STATE.selectedNutritionDate = getTodayIsoDate();
  }
  STATE.lastAnalyzedMealPhotos = [];
  renderNutritionView();
}

function getTodayIsoDate() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function getOffsetIsoDate(baseIsoStr, deltaDays) {
  const d = new Date(`${baseIsoStr || getTodayIsoDate()}T12:00:00`);
  if (isNaN(d.getTime())) return getTodayIsoDate();
  d.setDate(d.getDate() + deltaDays);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function formatNutritionDateHeading(isoDateStr) {
  const today = getTodayIsoDate();
  const d = new Date(`${isoDateStr}T12:00:00`);
  if (isNaN(d.getTime())) return isoDateStr;

  const yesterdayIso = getOffsetIsoDate(today, -1);
  const tomorrowIso = getOffsetIsoDate(today, 1);

  const dateFmt = d.toLocaleDateString('pl-PL', { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' });
  if (isoDateStr === today) return `Dzisiaj (${dateFmt})`;
  if (isoDateStr === yesterdayIso) return `Wczoraj (${dateFmt})`;
  if (isoDateStr === tomorrowIso) return `Jutro (${dateFmt})`;
  return dateFmt;
}

function changeNutritionDay(deltaDays) {
  STATE.selectedNutritionDate = getOffsetIsoDate(STATE.selectedNutritionDate || getTodayIsoDate(), deltaDays);
  renderNutritionView();
}

function selectNutritionDay(isoDateStr) {
  if (!isoDateStr) return;
  STATE.selectedNutritionDate = isoDateStr;
  renderNutritionView();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function toggleNutritionGoalsDrawer() {
  const drawer = document.getElementById('nutrition-goals-drawer');
  if (!drawer) return;
  const isHidden = drawer.style.display === 'none' || !drawer.style.display;
  drawer.style.display = isHidden ? 'block' : 'none';
  if (isHidden) {
    updateGoalMacroMathPreview();
  }
}

// Live Macro <-> Calorie synchronization when manually editing KCAL or Macros
function onGoalKcalInput() {
  const kEl = document.getElementById('goal-kcal-input');
  const pEl = document.getElementById('goal-protein-input');
  const cEl = document.getElementById('goal-carbs-input');
  const fEl = document.getElementById('goal-fat-input');
  if (!kEl || !pEl || !cEl || !fEl) return;

  const targetKcal = Math.max(0, parseInt(kEl.value) || 0);
  if (targetKcal < 400) {
    updateGoalMacroMathPreview();
    return;
  }

  const curP = Math.max(0, parseFloat(pEl.value) || 0);
  const curC = Math.max(0, parseFloat(cEl.value) || 0);
  const curF = Math.max(0, parseFloat(fEl.value) || 0);
  const curMacroKcal = curP * 4 + curC * 4 + curF * 9;

  // Preserve user's existing macro proportions if valid, otherwise use balanced athletic ratio (30% P, 43% C, 27% F)
  let pShare = 0.30;
  let fShare = 0.27;
  if (curMacroKcal > 200) {
    pShare = Math.min(0.55, Math.max(0.15, (curP * 4) / curMacroKcal));
    fShare = Math.min(0.50, Math.max(0.15, (curF * 9) / curMacroKcal));
    if (pShare + fShare > 0.85) {
      fShare = 0.85 - pShare;
    }
  }

  const newProteinG = Math.round((targetKcal * pShare) / 4);
  const newFatG = Math.round((targetKcal * fShare) / 9);
  const remainingKcalForCarbs = Math.max(0, targetKcal - (newProteinG * 4 + newFatG * 9));
  const newCarbsG = Math.round(remainingKcalForCarbs / 4);

  pEl.value = newProteinG;
  fEl.value = newFatG;
  cEl.value = newCarbsG;

  updateGoalMacroMathPreview();
}

function onGoalMacroInput(changedField) {
  const kEl = document.getElementById('goal-kcal-input');
  const pEl = document.getElementById('goal-protein-input');
  const cEl = document.getElementById('goal-carbs-input');
  const fEl = document.getElementById('goal-fat-input');
  if (!kEl || !pEl || !cEl || !fEl) return;

  let kcal = Math.max(0, parseInt(kEl.value) || 0);
  let p = Math.max(0, parseInt(pEl.value) || 0);
  let c = Math.max(0, parseInt(cEl.value) || 0);
  let f = Math.max(0, parseInt(fEl.value) || 0);

  if (changedField === 'protein' || changedField === 'fat') {
    // Keep target KCAL locked and adjust Carbs so B*4 + W*4 + T*9 == KCAL
    const pfKcal = p * 4 + f * 9;
    if (kcal >= pfKcal) {
      c = Math.round((kcal - pfKcal) / 4);
      cEl.value = c;
    } else {
      c = 0;
      cEl.value = 0;
      kcal = pfKcal;
      kEl.value = kcal;
    }
  } else if (changedField === 'carbs') {
    // User explicitly edited Carbs -> recalculate total KCAL from B*4 + W*4 + T*9
    kcal = Math.round(p * 4 + c * 4 + f * 9);
    kEl.value = kcal;
  }

  updateGoalMacroMathPreview();
}

function updateGoalMacroMathPreview() {
  const previewEl = document.getElementById('goal-macro-math-preview');
  if (!previewEl) return;

  const kcal = parseInt(document.getElementById('goal-kcal-input')?.value) || 0;
  const p = parseInt(document.getElementById('goal-protein-input')?.value) || 0;
  const c = parseInt(document.getElementById('goal-carbs-input')?.value) || 0;
  const f = parseInt(document.getElementById('goal-fat-input')?.value) || 0;

  const pKcal = p * 4;
  const cKcal = c * 4;
  const fKcal = f * 9;
  const sumKcal = pKcal + cKcal + fKcal;
  const pPct = sumKcal > 0 ? Math.round((pKcal / sumKcal) * 100) : 0;
  const cPct = sumKcal > 0 ? Math.round((cKcal / sumKcal) * 100) : 0;
  const fPct = sumKcal > 0 ? Math.max(0, 100 - pPct - cPct) : 0;

  previewEl.innerHTML = `
    ⚖️ Bilans makro: <b style="color: var(--success);">${p}g B</b> (${pKcal} kcal, ${pPct}%) +
    <b style="color: var(--accent);">${c}g W</b> (${cKcal} kcal, ${cPct}%) +
    <b style="color: var(--primary);">${f}g T</b> (${fKcal} kcal, ${fPct}%) =
    <b style="color: var(--text);">${sumKcal} kcal</b>
    ${Math.abs(sumKcal - kcal) > 8 ? `<span style="color: var(--accent);"> (Cel: ${kcal} kcal)</span>` : `<span style="color: var(--success);"> ✓ Spięte w 100%</span>`}
  `;
}

function saveNutritionGoals() {
  const p = Math.max(10, parseInt(document.getElementById('goal-protein-input')?.value) || 180);
  const c = Math.max(0, parseInt(document.getElementById('goal-carbs-input')?.value) || 260);
  const f = Math.max(10, parseInt(document.getElementById('goal-fat-input')?.value) || 75);
  const rawKcal = parseInt(document.getElementById('goal-kcal-input')?.value) || 0;
  const macroKcal = p * 4 + c * 4 + f * 9;
  const kcal = Math.abs(rawKcal - macroKcal) <= 15 && rawKcal > 0 ? rawKcal : macroKcal;

  const kEl = document.getElementById('goal-kcal-input');
  if (kEl) kEl.value = kcal;

  STATE.nutritionGoals = { kcal, proteinG: p, carbsG: c, fatG: f };
  localStorage.setItem('iron_nutrition_goals', JSON.stringify(STATE.nutritionGoals));
  updateGoalMacroMathPreview();
  renderNutritionView();

  const statusEl = document.getElementById('nutrition-goals-status');
  if (statusEl) {
    statusEl.style.color = 'var(--success)';
    statusEl.textContent = `✅ Zapisano cel: ${kcal} kcal (B: ${p}g, W: ${c}g, T: ${f}g)`;
    statusEl.style.display = 'block';
    setTimeout(() => { statusEl.style.display = 'none'; }, 4000);
  }
}

async function calculateNutritionGoalsWithAI() {
  const statusEl = document.getElementById('nutrition-goals-status');
  const calcBtn = document.getElementById('ai-calc-goals-btn');
  if (calcBtn) {
    calcBtn.disabled = true;
    calcBtn.textContent = '⏳ Liczę...';
  }
  if (statusEl) {
    statusEl.style.color = 'var(--accent)';
    statusEl.textContent = '⏳ AI analizuje Twój profil, BMR z wagi Fitdays oraz treningi i wylicza optymalne zapotrzebowanie...';
    statusEl.style.display = 'block';
  }

  const { profileSection, plansSection } = buildCoachProfileAndPlansContext();

  const prompt = `
Jesteś dietetykiem sportowym w aplikacji IronCoach. Na podstawie poniższego profilu użytkownika, jego raportu składu ciała z wagi Fitdays (w tym BMR, % tkanki tłuszczowej, masy mięśniowej), obwodów ciała oraz planu treningowego, wylicz optymalny DZIENNY cel kaloryczny i makroskładniki.
WAŻNE: Zadbaj, aby kalorie dokładnie spinały się z makroskładnikami wg przelicznika: kcal = proteinG * 4 + carbsG * 4 + fatG * 9.

=== PROFIL I SKŁAD CIAŁA UŻYTKOWNIKA ===
${profileSection}

=== PLANY TRENINGOWE ===
${plansSection}

Zwróć WYŁĄCZNIE poprawny obiekt JSON bez znaczników markdown:
{
  "kcal": 2650,
  "proteinG": 190,
  "carbsG": 297,
  "fatG": 78,
  "explanation": "Krótkie 1-2 zdaniowe wyjaśnienie po polsku (np. jak wyliczono TDEE względem BMR i celu sylwetkowego)"
}`;

  try {
    const raw = await callGemini(prompt, 'smart');
    const parsed = extractJsonFromGemini(raw);

    const proteinG = Math.max(40, parseInt(parsed.proteinG) || 180);
    const fatG = Math.max(30, parseInt(parsed.fatG) || 75);
    const rawKcal = Math.max(1000, parseInt(parsed.kcal) || 2500);
    // Ensure carbsG makes proteinG*4 + carbsG*4 + fatG*9 spin together with kcal
    const carbsG = Math.max(0, Math.round((rawKcal - (proteinG * 4 + fatG * 9)) / 4));
    const kcal = proteinG * 4 + carbsG * 4 + fatG * 9;

    const kEl = document.getElementById('goal-kcal-input');
    const pEl = document.getElementById('goal-protein-input');
    const cEl = document.getElementById('goal-carbs-input');
    const fEl = document.getElementById('goal-fat-input');
    if (kEl) kEl.value = kcal;
    if (pEl) pEl.value = proteinG;
    if (cEl) cEl.value = carbsG;
    if (fEl) fEl.value = fatG;

    STATE.nutritionGoals = { kcal, proteinG, carbsG, fatG };
    localStorage.setItem('iron_nutrition_goals', JSON.stringify(STATE.nutritionGoals));
    updateGoalMacroMathPreview();
    renderNutritionView();

    if (statusEl) {
      statusEl.style.color = 'var(--success)';
      statusEl.innerHTML = `🤖 <b>Wyliczono i zapisano: ${kcal} kcal</b> (B: ${proteinG}g, W: ${carbsG}g, T: ${fatG}g).<br><span style="color: var(--text-muted); font-size: 11px;">${escapeHtml(parsed.explanation || '')}</span>`;
      statusEl.style.display = 'block';
    }
  } catch (err) {
    if (statusEl) {
      statusEl.style.color = 'var(--danger)';
      statusEl.textContent = '⚠️ Błąd wyliczania celu przez AI: ' + err.message;
      statusEl.style.display = 'block';
    } else {
      alert('Błąd wyliczania celu przez AI: ' + err.message);
    }
  } finally {
    if (calcBtn) {
      calcBtn.disabled = false;
      calcBtn.textContent = '🤖 Wylicz przez AI';
    }
  }
}

async function handleMealPhotosSelected(event) {
  const files = Array.from(event.target.files || []);
  if (files.length === 0) return;

  for (const file of files) {
    if (!file.type.startsWith('image/')) continue;
    try {
      const fullPart = await fileToGeminiInlinePart(file, 1280, 0.82);
      const thumbPart = await fileToGeminiInlinePart(file, 110, 0.65);
      if (fullPart) {
        STATE.pendingMealPhotos.push({
          mimeType: fullPart.mimeType,
          data: fullPart.data,
          previewUrl: fullPart.previewDataUrl,
          thumbUrl: thumbPart ? thumbPart.previewDataUrl : fullPart.previewDataUrl
        });
      }
    } catch (e) {
      console.warn('Could not process meal photo', e);
    }
  }

  event.target.value = '';
  renderPendingMealPhotosPreview();
}

function removePendingMealPhoto(index) {
  STATE.pendingMealPhotos.splice(index, 1);
  renderPendingMealPhotosPreview();
}

function renderPendingMealPhotosPreview() {
  const container = document.getElementById('meal-photos-preview');
  if (!container) return;

  if (!STATE.pendingMealPhotos || STATE.pendingMealPhotos.length === 0) {
    container.style.display = 'none';
    container.innerHTML = '';
    return;
  }

  container.style.display = 'flex';
  container.innerHTML = STATE.pendingMealPhotos.map((p, idx) => `
    <div style="position: relative; width: 72px; height: 72px; border-radius: 10px; overflow: hidden; border: 1px solid var(--accent); flex-shrink: 0;">
      <img src="${p.previewUrl}" alt="Posiłek" style="width: 100%; height: 100%; object-fit: cover;">
      <button
        type="button"
        onclick="removePendingMealPhoto(${idx})"
        style="position: absolute; top: 2px; right: 2px; width: 20px; height: 20px; border-radius: 50%; background: rgba(0,0,0,0.75); color: #fff; border: none; font-size: 11px; cursor: pointer; display: flex; align-items: center; justify-content: center;"
      >✕</button>
    </div>
  `).join('');
}

async function analyzeMealWithHighModel() {
  const descInput = document.getElementById('meal-desc-input');
  const hint = (descInput?.value || '').trim();
  const photos = STATE.pendingMealPhotos || [];

  if (photos.length === 0 && !hint) {
    return alert('Zrób zdjęcie posiłku aparatem, wybierz zdjęcie z galerii lub wpisz krótki opis posiłku!');
  }

  const loadingEl = document.getElementById('meal-ai-loading');
  const analyzeBtn = document.getElementById('analyze-meal-btn');
  if (loadingEl) loadingEl.style.display = 'block';
  if (analyzeBtn) analyzeBtn.disabled = true;

  const prompt = `
Jesteś zaawansowanym dietetykiem klinicznym i sportowym. Przeanalizuj załączone zdjęcie/zdjęcia posiłku (lub etykietę wartości odżywczych) oraz opis od użytkownika: "${hint || 'brak dodatkowego opisu'}".
Twoje zadanie:
1. Rozpoznaj wszystkie składniki widoczne na talerzu/opakowaniu i oszacuj ich gramaturę (w gramach lub ml) na podstawie wielkości porcji.
2. Oblicz łączną kaloryczność (kcal), ilość białka (proteinG), węglowodanów przyswajalnych (carbsG) oraz tłuszczów (fatG).
3. Dodaj krótki, praktyczny komentarz trenerski (1-2 zdania, np. jakość białka, indeks glikemiczny, jak posiłek wpisuje się w cel sylwetkowy).

Zwróć WYŁĄCZNIE poprawny obiekt JSON bez znaczników markdown:
{
  "name": "Nazwa posiłku (np. Pierś z kurczaka z ryżem i brokułami)",
  "ingredientsSummary": "Kurczak ~200g, ryż biały ugotowany ~180g, brokuły ~100g, oliwa ~10g",
  "kcal": 640,
  "proteinG": 52,
  "carbsG": 68,
  "fatG": 16,
  "coachComment": "Świetny posiłek potreningowy o wysokiej zawartości pełnowartościowego białka."
}`;

  try {
    const inlineParts = photos.map(p => ({ mimeType: p.mimeType, data: p.data }));
    // Keep a copy of the analyzed photos so follow-up corrections in refineMealEstimateWithAI can still reference them
    STATE.lastAnalyzedMealPhotos = [...photos];

    const rawResponse = await callGemini(prompt, 'smart', inlineParts);
    const parsed = extractJsonFromGemini(rawResponse);

    // Clear the prompt text field immediately after analysis as requested!
    if (descInput) descInput.value = '';

    STATE.editingMealId = null;
    openMealEditorWithValues({
      name: parsed.name || (hint ? hint.slice(0, 45) : 'Posiłek ze zdjęcia'),
      kcal: Math.round(parseFloat(parsed.kcal) || 0),
      proteinG: Math.round(parseFloat(parsed.proteinG) || 0),
      carbsG: Math.round(parseFloat(parsed.carbsG) || 0),
      fatG: Math.round(parseFloat(parsed.fatG) || 0),
      ingredientsSummary: parsed.ingredientsSummary || '',
      coachComment: parsed.coachComment || '',
      userComment: '',
      modelUsed: STATE.lastUsedGeminiModel || 'Gemini Pro'
    });
  } catch (err) {
    alert('Błąd analizy posiłku przez AI: ' + err.message);
  } finally {
    if (loadingEl) loadingEl.style.display = 'none';
    if (analyzeBtn) analyzeBtn.disabled = false;
  }
}

// Allow user to challenge/correct/ask AI about the meal estimate right inside the preview editor
async function refineMealEstimateWithAI() {
  const followupInput = document.getElementById('meal-ai-followup-input');
  const followupBtn = document.getElementById('meal-ai-followup-btn');
  const userFeedback = (followupInput?.value || '').trim();
  if (!userFeedback) {
    return alert('Wpisz uwagę lub poprawkę dla AI (np. "To był indyk 150g a nie kurczak" lub "Dolicz łyżkę masła")!');
  }

  const curName = document.getElementById('edit-meal-name')?.value || 'Posiłek';
  const curKcal = document.getElementById('edit-meal-kcal')?.value || 0;
  const curP = document.getElementById('edit-meal-protein')?.value || 0;
  const curC = document.getElementById('edit-meal-carbs')?.value || 0;
  const curF = document.getElementById('edit-meal-fat')?.value || 0;
  const notesEl = document.getElementById('edit-meal-ingredients');
  const curIngredients = notesEl?.dataset?.ingredients || '';
  const curCoachComment = notesEl?.dataset?.comment || '';

  if (followupBtn) {
    followupBtn.disabled = true;
    followupBtn.textContent = '⏳ Przeliczam...';
  }

  const prompt = `
Jesteś zaawansowanym dietetykiem sportowym w aplikacji IronCoach.
Wcześniej oszacowałeś (lub użytkownik edytował) następujący posiłek:
- Nazwa: ${curName}
- Rozpoznane składniki: ${curIngredients || 'brak listy'}
- Kalorie: ${curKcal} kcal (Białko: ${curP}g, Węglowodany: ${curC}g, Tłuszcz: ${curF}g)
- Poprzedni komentarz: ${curCoachComment}

Użytkownik zgłasza uwagę / korektę / pytanie do tego posiłku:
"${userFeedback}"

Zaktualizuj oszacowanie posiłku zgodnie z informacją od użytkownika (uwzględnij też załączone zdjęcie, jeśli jest dostępne) i odpowiedz krótko w polu "coachComment".
Zwróć WYŁĄCZNIE poprawny obiekt JSON bez znaczników markdown:
{
  "name": "Zaktualizowana nazwa posiłku",
  "ingredientsSummary": "Zaktualizowana lista składników i gramatur",
  "kcal": 580,
  "proteinG": 48,
  "carbsG": 60,
  "fatG": 14,
  "coachComment": "Krótka odpowiedź na uwagę użytkownika i komentarz dietetyczny"
}`;

  try {
    const photos = (STATE.lastAnalyzedMealPhotos && STATE.lastAnalyzedMealPhotos.length > 0)
      ? STATE.lastAnalyzedMealPhotos
      : (STATE.pendingMealPhotos || []);
    const inlineParts = photos.map(p => ({ mimeType: p.mimeType, data: p.data }));

    const rawResponse = await callGemini(prompt, 'smart', inlineParts);
    const parsed = extractJsonFromGemini(rawResponse);

    if (followupInput) followupInput.value = '';
    const existingUserComment = document.getElementById('edit-meal-user-comment')?.value || '';

    openMealEditorWithValues({
      name: parsed.name || curName,
      kcal: Math.round(parseFloat(parsed.kcal) || 0),
      proteinG: Math.round(parseFloat(parsed.proteinG) || 0),
      carbsG: Math.round(parseFloat(parsed.carbsG) || 0),
      fatG: Math.round(parseFloat(parsed.fatG) || 0),
      ingredientsSummary: parsed.ingredientsSummary || curIngredients,
      coachComment: parsed.coachComment || curCoachComment,
      userComment: existingUserComment,
      modelUsed: STATE.lastUsedGeminiModel || 'Gemini Pro'
    });
  } catch (err) {
    alert('Błąd podczas przeliczania posiłku przez AI: ' + err.message);
  } finally {
    if (followupBtn) {
      followupBtn.disabled = false;
      followupBtn.textContent = '🔄 Przelicz z AI';
    }
  }
}

function onEditMealMacroInput() {
  const p = Math.max(0, parseFloat(document.getElementById('edit-meal-protein')?.value) || 0);
  const c = Math.max(0, parseFloat(document.getElementById('edit-meal-carbs')?.value) || 0);
  const f = Math.max(0, parseFloat(document.getElementById('edit-meal-fat')?.value) || 0);
  const kcalEl = document.getElementById('edit-meal-kcal');
  if (kcalEl) {
    kcalEl.value = Math.round(p * 4 + c * 4 + f * 9);
  }
}

function openMealEditorWithValues(data) {
  const box = document.getElementById('meal-editor-box');
  if (!box) return;

  document.getElementById('edit-meal-name').value = data.name || '';
  document.getElementById('edit-meal-kcal').value = data.kcal ?? '';
  document.getElementById('edit-meal-protein').value = data.proteinG ?? '';
  document.getElementById('edit-meal-carbs').value = data.carbsG ?? '';
  document.getElementById('edit-meal-fat').value = data.fatG ?? '';

  const userCommentEl = document.getElementById('edit-meal-user-comment');
  if (userCommentEl) {
    userCommentEl.value = data.userComment || '';
  }

  const notesEl = document.getElementById('edit-meal-ingredients');
  if (notesEl) {
    const parts = [];
    if (data.modelUsed) parts.push(`🤖 Model: <b>${escapeHtml(data.modelUsed)}</b>`);
    if (data.ingredientsSummary) parts.push(`⚖️ Składniki: ${escapeHtml(data.ingredientsSummary)}`);
    if (data.coachComment) parts.push(`💡 Trener AI: <i>${escapeHtml(data.coachComment)}</i>`);
    if (parts.length > 0) {
      notesEl.innerHTML = parts.join('<br>');
      notesEl.style.display = 'block';
      notesEl.dataset.ingredients = data.ingredientsSummary || '';
      notesEl.dataset.comment = data.coachComment || '';
    } else {
      notesEl.style.display = 'none';
      notesEl.innerHTML = '';
      notesEl.dataset.ingredients = '';
      notesEl.dataset.comment = '';
    }
  }

  box.style.display = 'block';
}

function openManualMealEditor() {
  STATE.editingMealId = null;
  STATE.lastAnalyzedMealPhotos = [];
  const descInput = document.getElementById('meal-desc-input');
  const hint = (descInput?.value || '').trim();
  if (descInput) descInput.value = '';
  openMealEditorWithValues({
    name: hint || '',
    kcal: '',
    proteinG: '',
    carbsG: '',
    fatG: '',
    ingredientsSummary: '',
    coachComment: '',
    userComment: ''
  });
}

function closeMealEditorBox() {
  const box = document.getElementById('meal-editor-box');
  if (box) box.style.display = 'none';
  STATE.editingMealId = null;
  STATE.lastAnalyzedMealPhotos = [];
}

function saveEditedMealToDiary() {
  const name = (document.getElementById('edit-meal-name')?.value || '').trim() || 'Posiłek';
  const kcal = Math.max(0, Math.round(parseFloat(document.getElementById('edit-meal-kcal')?.value) || 0));
  const proteinG = Math.max(0, Math.round((parseFloat(document.getElementById('edit-meal-protein')?.value) || 0) * 10) / 10);
  const carbsG = Math.max(0, Math.round((parseFloat(document.getElementById('edit-meal-carbs')?.value) || 0) * 10) / 10);
  const fatG = Math.max(0, Math.round((parseFloat(document.getElementById('edit-meal-fat')?.value) || 0) * 10) / 10);
  const userComment = (document.getElementById('edit-meal-user-comment')?.value || '').trim();

  if (kcal === 0 && proteinG === 0 && carbsG === 0 && fatG === 0) {
    return alert('Podaj kalorie lub makroskładniki posiłku!');
  }

  const notesEl = document.getElementById('edit-meal-ingredients');
  const ingredientsSummary = notesEl?.dataset?.ingredients || '';
  const coachComment = notesEl?.dataset?.comment || '';
  const thumbUrl = STATE.pendingMealPhotos?.[0]?.thumbUrl || STATE.lastAnalyzedMealPhotos?.[0]?.thumbUrl || null;
  const dateKey = STATE.selectedNutritionDate || getTodayIsoDate();

  if (STATE.editingMealId) {
    const existing = STATE.nutritionDiary.find(m => m.id === STATE.editingMealId);
    if (existing) {
      existing.name = name;
      existing.kcal = kcal;
      existing.proteinG = proteinG;
      existing.carbsG = carbsG;
      existing.fatG = fatG;
      existing.ingredientsSummary = ingredientsSummary;
      existing.coachComment = coachComment;
      existing.userComment = userComment;
      if (thumbUrl) existing.thumbUrl = thumbUrl;
    }
  } else {
    const now = new Date();
    const timeStr = now.toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' });
    STATE.nutritionDiary.unshift({
      id: 'meal-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
      dateKey,
      timeLabel: timeStr,
      timestamp: Date.now(),
      name,
      kcal,
      proteinG,
      carbsG,
      fatG,
      ingredientsSummary,
      coachComment,
      userComment,
      thumbUrl
    });
  }

  STATE.editingMealId = null;
  STATE.pendingMealPhotos = [];
  STATE.lastAnalyzedMealPhotos = [];
  const descInput = document.getElementById('meal-desc-input');
  if (descInput) descInput.value = '';
  const followupInput = document.getElementById('meal-ai-followup-input');
  if (followupInput) followupInput.value = '';

  renderPendingMealPhotosPreview();
  closeMealEditorBox();

  localStorage.setItem('iron_nutrition_diary', JSON.stringify(STATE.nutritionDiary));
  renderNutritionView();
  renderHomeKpis();
}

function editDiaryMeal(mealId) {
  const meal = STATE.nutritionDiary.find(m => m.id === mealId);
  if (!meal) return;
  STATE.editingMealId = meal.id;
  STATE.lastAnalyzedMealPhotos = [];
  openMealEditorWithValues({
    name: meal.name,
    kcal: meal.kcal,
    proteinG: meal.proteinG,
    carbsG: meal.carbsG,
    fatG: meal.fatG,
    ingredientsSummary: meal.ingredientsSummary || '',
    coachComment: meal.coachComment || '',
    userComment: meal.userComment || ''
  });
  const box = document.getElementById('meal-editor-box');
  if (box) box.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function deleteDiaryMeal(mealId) {
  if (!confirm('Czy na pewno chcesz usunąć ten posiłek z dziennika?')) return;
  STATE.nutritionDiary = STATE.nutritionDiary.filter(m => m.id !== mealId);
  localStorage.setItem('iron_nutrition_diary', JSON.stringify(STATE.nutritionDiary));
  renderNutritionView();
  renderHomeKpis();
}

// ============================================================================
// MEAL & WHOLE-DAY COPY / MOVE TOOLS
// ============================================================================
function toggleMealTransferBar(mealId) {
  const bar = document.getElementById(`meal-transfer-bar-${mealId}`);
  if (!bar) return;
  const isHidden = bar.style.display === 'none' || !bar.style.display;
  bar.style.display = isHidden ? 'block' : 'none';
  if (isHidden) {
    const dateInput = document.getElementById(`meal-transfer-date-${mealId}`);
    if (dateInput && !dateInput.value) {
      dateInput.value = getTodayIsoDate();
    }
  }
}

function setMealTransferQuickDate(mealId, offsetFromToday) {
  const dateInput = document.getElementById(`meal-transfer-date-${mealId}`);
  if (!dateInput) return;
  dateInput.value = getOffsetIsoDate(getTodayIsoDate(), offsetFromToday);
}

function copyOrMoveMeal(mealId, mode = 'copy') {
  const meal = STATE.nutritionDiary.find(m => m.id === mealId);
  if (!meal) return;

  const dateInput = document.getElementById(`meal-transfer-date-${mealId}`);
  const targetDate = (dateInput?.value || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(targetDate)) {
    return alert('Wybierz docelową datę!');
  }

  if (mode === 'move') {
    if (meal.dateKey === targetDate) {
      return alert('Ten posiłek jest już przypisany do tego dnia!');
    }
    meal.dateKey = targetDate;
    localStorage.setItem('iron_nutrition_diary', JSON.stringify(STATE.nutritionDiary));
    renderNutritionView();
    alert(`➡️ Przeniesiono posiłek "${meal.name}" na dzień ${formatNutritionDateHeading(targetDate)}!`);
  } else {
    const cloned = {
      ...meal,
      id: 'meal-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
      dateKey: targetDate,
      timestamp: Date.now()
    };
    STATE.nutritionDiary.unshift(cloned);
    localStorage.setItem('iron_nutrition_diary', JSON.stringify(STATE.nutritionDiary));
    renderNutritionView();
    alert(`📋 Skopiowano posiłek "${meal.name}" na dzień ${formatNutritionDateHeading(targetDate)}!`);
  }
}

function toggleDayTransferDrawer() {
  const drawer = document.getElementById('nutrition-day-transfer-drawer');
  if (!drawer) return;
  const isHidden = drawer.style.display === 'none' || !drawer.style.display;
  drawer.style.display = isHidden ? 'block' : 'none';
  if (isHidden) {
    const dateInput = document.getElementById('day-transfer-target-date');
    if (dateInput && !dateInput.value) {
      dateInput.value = getTodayIsoDate();
    }
  }
}

function setDayTransferQuickDate(offsetFromToday) {
  const dateInput = document.getElementById('day-transfer-target-date');
  if (!dateInput) return;
  dateInput.value = getOffsetIsoDate(getTodayIsoDate(), offsetFromToday);
}

function copyAllMealsFromYesterdayToCurrent() {
  const curDate = STATE.selectedNutritionDate || getTodayIsoDate();
  const prevDate = getOffsetIsoDate(curDate, -1);
  const prevMeals = (STATE.nutritionDiary || []).filter(m => m.dateKey === prevDate);

  if (prevMeals.length === 0) {
    return alert(`Brak zapisanych posiłków w poprzednim dniu (${formatNutritionDateHeading(prevDate)}).`);
  }

  prevMeals.forEach((m, idx) => {
    STATE.nutritionDiary.unshift({
      ...m,
      id: 'meal-' + Date.now() + '-' + idx + '-' + Math.random().toString(36).slice(2, 6),
      dateKey: curDate,
      timestamp: Date.now() + idx
    });
  });

  localStorage.setItem('iron_nutrition_diary', JSON.stringify(STATE.nutritionDiary));
  renderNutritionView();
  alert(`📥 Skopiowano ${prevMeals.length} posiłek/posiłków z dnia ${formatNutritionDateHeading(prevDate)} do ${formatNutritionDateHeading(curDate)}!`);
}

function copyOrMoveWholeDay(mode = 'copy') {
  const sourceDate = STATE.selectedNutritionDate || getTodayIsoDate();
  const targetDate = (document.getElementById('day-transfer-target-date')?.value || '').trim();

  if (!/^\d{4}-\d{2}-\d{2}$/.test(targetDate)) {
    return alert('Wybierz datę docelową!');
  }
  if (sourceDate === targetDate) {
    return alert('Wybierz inną datę docelową niż aktualnie otwarty dzień!');
  }

  const dayMeals = (STATE.nutritionDiary || []).filter(m => m.dateKey === sourceDate);
  if (dayMeals.length === 0) {
    return alert('W aktualnie wybranym dniu nie ma żadnych posiłków do skopiowania/przeniesienia.');
  }

  if (mode === 'move') {
    dayMeals.forEach(m => { m.dateKey = targetDate; });
    localStorage.setItem('iron_nutrition_diary', JSON.stringify(STATE.nutritionDiary));
    STATE.selectedNutritionDate = targetDate;
    renderNutritionView();
    alert(`➡️ Przeniesiono wszystkie posiłki (${dayMeals.length}) na dzień ${formatNutritionDateHeading(targetDate)}!`);
  } else {
    dayMeals.forEach((m, idx) => {
      STATE.nutritionDiary.unshift({
        ...m,
        id: 'meal-' + Date.now() + '-' + idx + '-' + Math.random().toString(36).slice(2, 6),
        dateKey: targetDate,
        timestamp: Date.now() + idx
      });
    });
    localStorage.setItem('iron_nutrition_diary', JSON.stringify(STATE.nutritionDiary));
    STATE.selectedNutritionDate = targetDate;
    renderNutritionView();
    alert(`📋 Skopiowano wszystkie posiłki (${dayMeals.length}) na dzień ${formatNutritionDateHeading(targetDate)}!`);
  }
}

function getNutritionDayTotals(dateKey) {
  const meals = (STATE.nutritionDiary || []).filter(m => m.dateKey === dateKey);
  return meals.reduce((acc, m) => {
    acc.kcal += (parseFloat(m.kcal) || 0);
    acc.proteinG += (parseFloat(m.proteinG) || 0);
    acc.carbsG += (parseFloat(m.carbsG) || 0);
    acc.fatG += (parseFloat(m.fatG) || 0);
    acc.count += 1;
    return acc;
  }, { kcal: 0, proteinG: 0, carbsG: 0, fatG: 0, count: 0, meals });
}

function renderNutritionView() {
  const dateKey = STATE.selectedNutritionDate || getTodayIsoDate();
  const goals = STATE.nutritionGoals || { kcal: 2500, proteinG: 180, carbsG: 260, fatG: 75 };

  // Populate goal inputs if not currently focused
  const kEl = document.getElementById('goal-kcal-input');
  const pEl = document.getElementById('goal-protein-input');
  const cEl = document.getElementById('goal-carbs-input');
  const fEl = document.getElementById('goal-fat-input');
  if (kEl && document.activeElement !== kEl) kEl.value = goals.kcal;
  if (pEl && document.activeElement !== pEl) pEl.value = goals.proteinG;
  if (cEl && document.activeElement !== cEl) cEl.value = goals.carbsG;
  if (fEl && document.activeElement !== fEl) fEl.value = goals.fatG;

  updateGoalMacroMathPreview();

  const dateLabelEl = document.getElementById('nutrition-date-label');
  if (dateLabelEl) {
    dateLabelEl.textContent = formatNutritionDateHeading(dateKey);
  }

  const totals = getNutritionDayTotals(dateKey);

  // 1. Render Progress Bars
  const progContainer = document.getElementById('nutrition-daily-progress');
  if (progContainer) {
    const kcalPct = Math.min(100, Math.round((totals.kcal / (goals.kcal || 1)) * 100));
    const kcalRemaining = goals.kcal - Math.round(totals.kcal);
    const pPct = Math.min(100, Math.round((totals.proteinG / (goals.proteinG || 1)) * 100));
    const cPct = Math.min(100, Math.round((totals.carbsG / (goals.carbsG || 1)) * 100));
    const fPct = Math.min(100, Math.round((totals.fatG / (goals.fatG || 1)) * 100));

    progContainer.innerHTML = `
      <div style="background: var(--surface-elevated); padding: 12px; border-radius: 12px; border: 1px solid var(--border);">
        <div style="display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 6px;">
          <div>
            <span style="font-size: 24px; font-weight: 900; color: var(--primary);">${Math.round(totals.kcal)}</span>
            <span style="font-size: 13px; color: var(--text-muted);"> / ${goals.kcal} kcal</span>
          </div>
          <span style="font-size: 12px; font-weight: 700; color: ${kcalRemaining >= 0 ? 'var(--accent)' : 'var(--danger)'};">
            ${kcalRemaining >= 0 ? `Pozostało: ${kcalRemaining} kcal` : `Nadwyżka: +${Math.abs(kcalRemaining)} kcal`}
          </span>
        </div>
        <div style="width: 100%; height: 10px; background: #12151b; border-radius: 999px; overflow: hidden; margin-bottom: 12px; border: 1px solid var(--border);">
          <div style="width: ${kcalPct}%; height: 100%; background: linear-gradient(90deg, var(--primary), var(--accent)); border-radius: 999px; transition: width 0.25s;"></div>
        </div>

        <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px;">
          <div style="background: #12151b; padding: 8px; border-radius: 8px; border: 1px solid var(--border);">
            <div style="display: flex; justify-content: space-between; font-size: 11px; margin-bottom: 4px;">
              <span style="color: var(--text-muted); font-weight: 700;">🥩 Białko</span>
              <b style="color: var(--success);">${Math.round(totals.proteinG)}/${goals.proteinG}g</b>
            </div>
            <div style="width: 100%; height: 6px; background: #1e232d; border-radius: 999px; overflow: hidden;">
              <div style="width: ${pPct}%; height: 100%; background: var(--success);"></div>
            </div>
          </div>

          <div style="background: #12151b; padding: 8px; border-radius: 8px; border: 1px solid var(--border);">
            <div style="display: flex; justify-content: space-between; font-size: 11px; margin-bottom: 4px;">
              <span style="color: var(--text-muted); font-weight: 700;">🍚 Węgle</span>
              <b style="color: var(--accent);">${Math.round(totals.carbsG)}/${goals.carbsG}g</b>
            </div>
            <div style="width: 100%; height: 6px; background: #1e232d; border-radius: 999px; overflow: hidden;">
              <div style="width: ${cPct}%; height: 100%; background: var(--accent);"></div>
            </div>
          </div>

          <div style="background: #12151b; padding: 8px; border-radius: 8px; border: 1px solid var(--border);">
            <div style="display: flex; justify-content: space-between; font-size: 11px; margin-bottom: 4px;">
              <span style="color: var(--text-muted); font-weight: 700;">🥑 Tłuszcz</span>
              <b style="color: var(--primary);">${Math.round(totals.fatG)}/${goals.fatG}g</b>
            </div>
            <div style="width: 100%; height: 6px; background: #1e232d; border-radius: 999px; overflow: hidden;">
              <div style="width: ${fPct}%; height: 100%; background: var(--primary);"></div>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  // 2. Render Meals List for selected day
  const mealsListEl = document.getElementById('nutrition-meals-list');
  const countBadge = document.getElementById('nutrition-meals-count');
  if (countBadge) countBadge.textContent = `${totals.count} posiłków`;

  if (mealsListEl) {
    if (totals.meals.length === 0) {
      mealsListEl.innerHTML = `
        <p style="color: var(--text-muted); font-size: 13px; text-align: center; padding: 14px 0;">
          Brak zapisanych posiłków w tym dniu. Zrób zdjęcie talerza powyżej, dodaj ręcznie lub skopiuj posiłki z innego dnia!
        </p>
      `;
    } else {
      mealsListEl.innerHTML = totals.meals.map(m => `
        <div style="background: var(--surface-elevated); border: 1px solid var(--border); border-radius: 10px; padding: 10px 12px; margin-bottom: 8px;">
          <div style="display: flex; gap: 10px; align-items: flex-start;">
            ${m.thumbUrl ? `<img src="${m.thumbUrl}" alt="Posiłek" style="width: 54px; height: 54px; border-radius: 8px; object-fit: cover; flex-shrink: 0; border: 1px solid var(--border);">` : ''}
            <div style="flex: 1; min-width: 0;">
              <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 6px;">
                <div style="font-weight: 800; font-size: 14px; color: var(--text);">
                  ${escapeHtml(m.name)}
                  ${m.timeLabel ? `<span style="font-size: 11px; color: var(--text-muted); font-weight: 500; margin-left: 4px;">${escapeHtml(m.timeLabel)}</span>` : ''}
                </div>
                <span style="font-weight: 900; font-size: 14px; color: var(--primary); white-space: nowrap;">${Math.round(m.kcal)} kcal</span>
              </div>
              <div style="font-size: 12px; color: var(--text-muted); margin-top: 3px;">
                🥩 B: <b style="color: var(--success);">${Math.round(m.proteinG)}g</b> •
                🍚 W: <b style="color: var(--accent);">${Math.round(m.carbsG)}g</b> •
                🥑 T: <b style="color: var(--primary);">${Math.round(m.fatG)}g</b>
              </div>
              ${m.ingredientsSummary ? `<div style="font-size: 11px; color: var(--text-muted); margin-top: 3px;">⚖️ ${escapeHtml(m.ingredientsSummary)}</div>` : ''}
              ${m.coachComment ? `<div style="font-size: 11px; color: var(--accent); margin-top: 3px;">💡 AI: ${escapeHtml(m.coachComment)}</div>` : ''}
              ${m.userComment ? `<div style="font-size: 11px; color: var(--primary); margin-top: 3px;">📝 Notatka: ${escapeHtml(m.userComment)}</div>` : ''}
              <div style="display: flex; justify-content: flex-end; gap: 6px; margin-top: 7px; flex-wrap: wrap;">
                <button type="button" class="btn btn-sm btn-secondary" style="padding: 3px 8px; font-size: 11px; color: var(--accent);" onclick="toggleMealTransferBar('${m.id}')">📅 Przenieś / Kopiuj</button>
                <button type="button" class="btn btn-sm btn-secondary" style="padding: 3px 8px; font-size: 11px;" onclick="editDiaryMeal('${m.id}')">✏️ Edytuj / Dopytaj AI</button>
                <button type="button" class="btn btn-sm btn-secondary" style="padding: 3px 8px; font-size: 11px; color: var(--danger);" onclick="deleteDiaryMeal('${m.id}')">Usuń</button>
              </div>
            </div>
          </div>

          <!-- Inline Per-Meal Copy / Move Bar -->
          <div id="meal-transfer-bar-${m.id}" style="display: none; margin-top: 8px; padding-top: 8px; border-top: 1px dashed var(--border);">
            <div style="font-size: 11px; color: var(--text-muted); margin-bottom: 5px;">Wybierz dzień docelowy dla posiłku <b>${escapeHtml(m.name)}</b>:</div>
            <div style="display: flex; gap: 5px; align-items: center; margin-bottom: 6px; flex-wrap: wrap;">
              <input type="date" id="meal-transfer-date-${m.id}" class="input-box" style="flex: 1; font-size: 12px; padding: 5px 8px; min-width: 130px;" value="${getTodayIsoDate()}">
              <button type="button" class="btn btn-sm btn-secondary" style="padding: 4px 7px; font-size: 10px;" onclick="setMealTransferQuickDate('${m.id}', -1)">Wczoraj</button>
              <button type="button" class="btn btn-sm btn-secondary" style="padding: 4px 7px; font-size: 10px;" onclick="setMealTransferQuickDate('${m.id}', 0)">Dzisiaj</button>
              <button type="button" class="btn btn-sm btn-secondary" style="padding: 4px 7px; font-size: 10px;" onclick="setMealTransferQuickDate('${m.id}', 1)">Jutro</button>
            </div>
            <div style="display: flex; gap: 6px;">
              <button type="button" class="btn btn-sm btn-accent" style="flex: 1; padding: 6px; font-size: 11px;" onclick="copyOrMoveMeal('${m.id}', 'copy')">📋 Kopiuj tam</button>
              <button type="button" class="btn btn-sm btn-primary" style="flex: 1; padding: 6px; font-size: 11px;" onclick="copyOrMoveMeal('${m.id}', 'move')">➡️ Przenieś tam</button>
            </div>
          </div>
        </div>
      `).join('');
    }
  }

  // 3. Render 7-Day History Summary
  const histEl = document.getElementById('nutrition-days-history');
  if (histEl) {
    const uniqueDates = Array.from(new Set([
      getTodayIsoDate(),
      ...STATE.nutritionDiary.map(m => m.dateKey).filter(Boolean)
    ])).sort((a, b) => b.localeCompare(a)).slice(0, 10);

    histEl.innerHTML = uniqueDates.map(dKey => {
      const dt = getNutritionDayTotals(dKey);
      const isSelected = dKey === dateKey;
      const pct = Math.min(100, Math.round((dt.kcal / (goals.kcal || 1)) * 100));
      return `
        <div
          onclick="selectNutritionDay('${dKey}')"
          style="cursor: pointer; background: var(--surface-elevated); border: 1px solid ${isSelected ? 'var(--accent)' : 'var(--border)'}; border-radius: 10px; padding: 9px 12px; margin-bottom: 6px; display: flex; justify-content: space-between; align-items: center;"
        >
          <div>
            <div style="font-size: 13px; font-weight: 800; color: ${isSelected ? 'var(--accent)' : 'var(--text)'};">
              ${escapeHtml(formatNutritionDateHeading(dKey))}
            </div>
            <div style="font-size: 11px; color: var(--text-muted);">
              Posiłków: ${dt.count} • B: ${Math.round(dt.proteinG)}g • W: ${Math.round(dt.carbsG)}g • T: ${Math.round(dt.fatG)}g
            </div>
          </div>
          <div style="text-align: right;">
            <div style="font-size: 14px; font-weight: 900; color: var(--primary);">${Math.round(dt.kcal)} / ${goals.kcal} kcal</div>
            <div style="font-size: 11px; color: var(--text-muted);">${pct}% celu</div>
          </div>
        </div>
      `;
    }).join('');
  }
}

// ============================================================================
// COACH AI ANALYSIS & CONVERSATIONAL CHAT (Includes Profile, Fitdays Scan, Circumferences, Duration, Rests & LoadTypes)
// ============================================================================
function buildCoachProfileAndPlansContext() {
  const p = STATE.userProfile || {};
  const latestScale = STATE.bodyMeasurements.find(m => m.weightKg && (m.bodyFatPct || m.muscleMassKg)) || STATE.bodyMeasurements[0] || {};
  const latestCirc = STATE.bodyMeasurements.find(m => m.waistCm || m.beltCm || m.chestCm || m.shouldersCm || m.bicepsCm || m.thighCm) || {};

  const weightVal = parseFloat(p.weightKg) || parseFloat(latestScale.weightKg) || 0;
  const heightVal = parseFloat(p.heightCm) || 0;
  let bmiStr = '';
  if (weightVal > 0 && heightVal > 0) {
    const bmi = (weightVal / Math.pow(heightVal / 100, 2)).toFixed(1);
    bmiStr = ` (BMI: ${bmi})`;
  }

  // Build detailed Fitdays body composition report for LLM
  let fitdaysContext = 'Brak szczegółowego raportu z wagi.';
  if (latestScale && (latestScale.bodyFatPct || latestScale.muscleMassKg)) {
    const sf = latestScale.segmentalFat || {};
    const sm = latestScale.segmentalMuscle || {};
    const wc = latestScale.weightControl || {};
    fitdaysContext = [
      `Data pomiaru z wagi Fitdays: ${latestScale.dateLabel || ''}`,
      `• Waga: ${latestScale.weightKg} kg | BMI: ${latestScale.bmi} | Tkanka tłuszczowa: ${latestScale.bodyFatPct}% (Masa tłuszczowa: ${latestScale.fatMassKg} kg)`,
      `• Beztłuszczowa masa ciała (FFM): ${latestScale.ffmKg} kg | Masa mięśniowa: ${latestScale.muscleMassKg} kg (Wskaźnik mięśniowy: ${latestScale.muscleRatePct}%)`,
      `• Mięśnie szkieletowe: ${latestScale.skeletalMusclePct}% | Masa kostna: ${latestScale.boneMassKg} kg`,
      `• Masa białkowa: ${latestScale.proteinMassKg} kg (Białko: ${latestScale.proteinPct}%) | Masa wody: ${latestScale.waterMassKg} kg (Woda: ${latestScale.bodyWaterPct}%)`,
      `• Tłuszcz podskórny: ${latestScale.subcutaneousFatPct}% | Tłuszcz trzewny (wisceralny): ${latestScale.visceralFat}`,
      `• BMR (Podstawowa przemiana materii): ${latestScale.bmrKcal} kcal | Wiek metaboliczny ciała: ${latestScale.bodyAge} lat | WHR: ${latestScale.whr}`,
      `• Idealna masa ciała wg wagi: ${latestScale.idealWeightKg} kg | Typ sylwetki: ${latestScale.bodyType || 'Tłuszcz mięśniowy'}`,
      sf.trunk ? `• Segmentowa analiza tłuszczu: Lewa ręka ${sf.leftArm?.kg}kg (${sf.leftArm?.pct}%), Prawa ręka ${sf.rightArm?.kg}kg (${sf.rightArm?.pct}%), Tułów ${sf.trunk?.kg}kg (${sf.trunk?.pct}%), Lewa noga ${sf.leftLeg?.kg}kg (${sf.leftLeg?.pct}%), Prawa noga ${sf.rightLeg?.kg}kg (${sf.rightLeg?.pct}%)` : null,
      sm.trunk ? `• Segmentowa równowaga mięśniowa: Lewa ręka ${sm.leftArm?.kg}kg (${sm.leftArm?.pct}% - ${sm.leftArm?.status}), Prawa ręka ${sm.rightArm?.kg}kg (${sm.rightArm?.pct}% - ${sm.rightArm?.status}), Tułów ${sm.trunk?.kg}kg (${sm.trunk?.pct}%), Lewa noga ${sm.leftLeg?.kg}kg (${sm.leftLeg?.pct}% - ${sm.leftLeg?.status}), Prawa noga ${sm.rightLeg?.kg}kg (${sm.rightLeg?.pct}% - ${sm.rightLeg?.status})` : null,
      wc.targetWeightKg ? `• Zalecenia kontroli wagi Fitdays: Docelowa waga ${wc.targetWeightKg}kg (Kontrola tłuszczu: ${wc.fatControlKg}kg, Kontrola mięśni: ${wc.muscleControlKg}kg)` : null
    ].filter(Boolean).join('\n');
  }

  // Build circumferences summary for LLM
  const circParts = [
    latestCirc.waistCm ? `Talia: ${latestCirc.waistCm} cm` : null,
    latestCirc.beltCm ? `Pas: ${latestCirc.beltCm} cm` : null,
    latestCirc.chestCm ? `Klatka piersiowa: ${latestCirc.chestCm} cm` : null,
    latestCirc.shouldersCm ? `Ramiona/Barki: ${latestCirc.shouldersCm} cm` : null,
    latestCirc.bicepsCm ? `Biceps: ${latestCirc.bicepsCm} cm` : null,
    latestCirc.thighCm ? `Udo: ${latestCirc.thighCm} cm` : null
  ].filter(Boolean);
  const circContext = circParts.length > 0
    ? `Ostatnie obwody ciała (${latestCirc.dateLabel || ''}): ${circParts.join(', ')}`
    : 'Brak wpisanych obwodów centymetrem.';

  // Build historical trend of body measurements (up to last 6 entries)
  const bodyTrendContext = STATE.bodyMeasurements.slice(0, 6).map(m => {
    const items = [];
    if (m.weightKg) items.push(`waga ${m.weightKg}kg`);
    if (m.bodyFatPct) items.push(`BF ${m.bodyFatPct}%`);
    if (m.muscleMassKg) items.push(`mięśnie ${m.muscleMassKg}kg`);
    if (m.waistCm) items.push(`talia ${m.waistCm}cm`);
    if (m.beltCm) items.push(`pas ${m.beltCm}cm`);
    if (m.chestCm) items.push(`klatka ${m.chestCm}cm`);
    if (m.shouldersCm) items.push(`ramiona ${m.shouldersCm}cm`);
    if (m.bicepsCm) items.push(`biceps ${m.bicepsCm}cm`);
    if (m.thighCm) items.push(`udo ${m.thighCm}cm`);
    return `- ${m.dateLabel || new Date(m.timestamp).toLocaleDateString('pl-PL')}: ${items.join(', ')}`;
  }).join('\n');

  // Build Nutrition Goals & Daily Food Diary summary for LLM
  const ng = STATE.nutritionGoals || { kcal: 2500, proteinG: 180, carbsG: 260, fatG: 75 };
  const todayKey = getTodayIsoDate();
  const todayTotals = getNutritionDayTotals(todayKey);
  const recentDietDays = Array.from(new Set([todayKey, ...(STATE.nutritionDiary || []).map(m => m.dateKey).filter(Boolean)]))
    .sort((a, b) => b.localeCompare(a))
    .slice(0, 7)
    .map(dKey => {
      const t = getNutritionDayTotals(dKey);
      const mealsNames = t.meals.map(m => `${m.name} (${m.kcal}kcal, B:${m.proteinG}g)`).join('; ');
      return `- ${dKey}: łącznie ${Math.round(t.kcal)}/${ng.kcal} kcal (B: ${Math.round(t.proteinG)}/${ng.proteinG}g, W: ${Math.round(t.carbsG)}/${ng.carbsG}g, T: ${Math.round(t.fatG)}/${ng.fatG}g)${mealsNames ? ` | Posiłki: ${mealsNames}` : ''}`;
    }).join('\n');

  const nutritionContext = [
    `• Dzienny cel kaloryczny i makro: ${ng.kcal} kcal | Białko: ${ng.proteinG}g | Węglowodany: ${ng.carbsG}g | Tłuszcze: ${ng.fatG}g`,
    `• Dzisiejsze spożycie (${todayKey}): ${Math.round(todayTotals.kcal)} kcal (B: ${Math.round(todayTotals.proteinG)}g, W: ${Math.round(todayTotals.carbsG)}g, T: ${Math.round(todayTotals.fatG)}g w ${todayTotals.count} posiłkach)`,
    recentDietDays ? `• Historia dziennika żywieniowego (ostatnie dni):\n${recentDietDays}` : null
  ].filter(Boolean).join('\n');

  const profileSection = [
    `• Waga użytkownika: ${weightVal > 0 ? weightVal + ' kg' : 'nie podano'}`,
    `• Wzrost użytkownika: ${heightVal > 0 ? heightVal + ' cm' + bmiStr : 'nie podano'}`,
    `• Główny cel treningowy: ${p.goal || 'Budowa masy mięśniowej (Hipertrofia)'}`,
    p.goalNotes ? `• Dodatkowe priorytety / uwagi / kontuzje: ${p.goalNotes}` : null,
    `\n=== PEŁNY RAPORT SKŁADU CIAŁA Z WAGI (FITDAYS) ===\n${fitdaysContext}`,
    `\n=== OBWODY CIAŁA (CM) ===\n${circContext}`,
    `\n=== HISTORIA ZMIAN PARAMETRÓW CIAŁA I OBWODÓW W CZASIE ===\n${bodyTrendContext}`,
    `\n=== DZIENNIK ŻYWIENIOWY, KALORIE I MAKROSKŁADNIKI ===\n${nutritionContext}`
  ].filter(Boolean).join('\n');

  const plansSection = (STATE.plans && STATE.plans.length > 0)
    ? STATE.plans.map(pl => {
        const exList = (pl.exercises || []).map(e => {
          const ss = e.supersetGroup ? `[SS ${e.supersetGroup}] ` : '';
          const lt = e.loadType === 'dual_dumbbell'
            ? `(2x hantle po ${e.weight}kg = ${e.weight * 2}kg)`
            : (e.loadType === 'bodyweight'
                ? (e.weight > 0 ? `(Masa ciała + ${e.weight}kg)` : `(Masa własnego ciała)`)
                : `${e.weight}kg`);
          return `${ss}${e.name} ${e.sets}x${e.reps} ${lt}`;
        }).join(', ');
        return `- ${pl.name} (przerwa główna: ${pl.restSeconds || 90}s, w superserii: ${pl.supersetRestSeconds || 30}s): ${exList}`;
      }).join('\n')
    : 'Brak zapisanych planów.';

  return { profileSection, plansSection, userWeightKg: weightVal };
}

function formatSessionDetailsForCoach(session, userWeightKg = 0) {
  if (!session) return 'Brak danych sesji.';
  const durSec = session.durationSeconds || (session.endTime && session.startTime ? Math.round((session.endTime - session.startTime) / 1000) : 0);

  const setsSummary = (session.sets || []).map(s => {
    let wDesc = `${s.weight}kg`;
    if (s.loadType === 'dual_dumbbell') {
      wDesc = `2x hantle po ${s.weight}kg (łącznie ${s.effectiveWeight || s.weight * 2}kg na serię)`;
    } else if (s.loadType === 'bodyweight') {
      const bwBase = userWeightKg > 0 ? `Masa ciała (${userWeightKg}kg)` : `Masa własnego ciała (BW)`;
      wDesc = s.weight > 0 ? `${bwBase} + dołożone ${s.weight}kg` : bwBase;
    }
    const effMeta = getSetEffortMeta(s.effort);
    const effortDesc = effMeta
      ? ` | Subiektywna ocena trudności serii (1-6): ${effMeta.val}/6 (${effMeta.fullLabel || effMeta.short} — ${effMeta.hint})`
      : (s.loadType === 'bodyweight' && !(s.weight > 0) ? ' | Kalistenika (wyznacznikiem jest maks. liczba powtórzeń)' : '');
    const timeDesc = s.relTimeLabel
      ? ` | Czas serii: ${s.relTimeLabel}`
      : (s.relStartStr && s.relEndStr ? ` | Czas serii: start w ${s.relStartStr}, koniec w ${s.relEndStr}` : '');
    return `${s.supersetGroup ? `[Superseria ${s.supersetGroup}] ` : '[Izolacja] '}${s.exercise}: Seria ${s.setNum} -> ${wDesc} x ${s.reps} powt.${timeDesc}${effortDesc}`;
  }).join('\n');

  const restsSummary = (session.restLogs && session.restLogs.length > 0)
    ? session.restLogs.map((r, i) => {
        const rTypeLabel = r.type === 'superset-short' ? 'wewnątrz superserii' : (r.type === 'superset-round' ? 'po obwodzie superserii' : 'między seriami');
        return `Przerwa #${i + 1} (${rTypeLabel}, po ${r.afterExercise} S${r.afterSet}): planowana ${r.plannedSeconds}s, rzeczywista ${r.actualSeconds}s${r.overtimeSeconds > 0 ? ` (PRZEKROCZONO o +${r.overtimeSeconds}s)` : ' (w normie)'}`;
      }).join('\n')
    : 'Brak szczegółowych pomiarów przerw.';

  return `Plan: ${session.planName}
Data: ${new Date(session.endTime || Date.now()).toLocaleString('pl-PL')}
Całkowity czas treningu: ${formatDuration(durSec)} (${durSec} sekund)
Średnia przerwa między seriami/ćwiczeniami: ${session.avgRestSeconds || 0} sekund
Całkowity tonaż (z uwzględnieniem podwójnych hantli): ${session.totalVolumeKg} kg
Ukończone serie: ${session.completedSets}

Wykonane serie (z uwzględnieniem superserii, 2x hantli i masy ciała):
${setsSummary}

Zarejestrowane przerwy między ćwiczeniami/seriami:
${restsSummary}`;
}

async function triggerCoachAnalysis(session) {
  STATE.currentCoachReportSessionId = session.id;
  const loading = document.getElementById('coach-loading');
  const reportBox = document.getElementById('coach-report-content');
  loading.style.display = 'block';
  reportBox.style.display = 'none';

  const { profileSection, plansSection, userWeightKg } = buildCoachProfileAndPlansContext();
  const currentSessionDetails = formatSessionDetailsForCoach(session, userWeightKg);

  // Also include brief summary of up to 3 previous valid workouts for progression context
  const validHistory = STATE.history.filter(h => h.id !== session.id && !isWorkoutShortOrTest(h));
  const prevSource = validHistory.length > 0 ? validHistory : STATE.history.filter(h => h.id !== session.id);
  const prevWorkouts = prevSource
    .slice(0, 3)
    .map(h => `- ${new Date(h.endTime).toLocaleDateString('pl-PL')} (${h.planName}): tonaż ${h.totalVolumeKg}kg, serii ${h.completedSets}, czas ${formatDuration(h.durationSeconds || 0)}, śr. przerwa ${h.avgRestSeconds || 0}s`)
    .join('\n') || 'To pierwszy zarejestrowany trening.';

  const prompt = `
Działasz jako doświadczony, zaawansowany trener personalny i fizjolog sportowy w aplikacji IronCoach.
Przeanalizuj zakończony trening użytkownika, biorąc pod uwagę WSZYSTKIE poniższe dane: jego wagę, wzrost, cel treningowy, pełny raport składu ciała z wagi Fitdays (21 wskaźników + analiza segmentowa tłuszczu i równowagi mięśniowej kończyn/tułowia), obwody ciała (talia, pas, klatka, ramiona, biceps, udo), historię zmian składu ciała w czasie, superserie, ćwiczenia z masą własnego ciała, ćwiczenia z dwoma hantlami (tonaż liczony podwójnie), czas trwania całego treningu oraz czasy poszczególnych przerw (w tym przekroczenia czasu przerwy).

=== PROFIL, SKŁAD CIAŁA (FITDAYS), OBWODY I CEL UŻYTKOWNIKA ===
${profileSection}

=== SZCZEGÓŁY ZAKOŃCZONEGO TRENINGU ===
${currentSessionDetails}

=== POPRZEDNIE TRENINGI (DO PORÓWNANIA PROGRESU) ===
${prevWorkouts}

=== AKTUALNE PLANY TRENINGOWE UŻYTKOWNIKA ===
${plansSection}

Przygotuj pogłębioną, spersonalizowaną analizę w języku polskim:
1. 📊 Ocena sesji pod kątem celu użytkownika (${STATE.userProfile?.goal || 'Hipertrofia'}) oraz jego składu ciała Fitdays i obwodów: oceń objętość, tonaż (w tym ćwiczenia z masą własnego ciała i 2x hantle), gęstość treningową (całkowity czas sesji oraz relatywne czasy rozpoczęcia i zakończenia poszczególnych serii), subiektywne oceny trudności serii dla ćwiczeń z ciężarem w skali 1–6 (gdzie 1=Lekko, 2=Spokojnie, 3=Optymalnie, 4=Ciężko, 5=Bardzo ciężko, 6=Hardcore; w kalistenice wyznacznikiem jest liczba powtórzeń) oraz dyscyplinę przerw między ćwiczeniami i wewnątrz superserii.
2. 🎯 Konkretna periodyzacja i progresywne przeładowanie na kolejny trening (OPARTE NA OCENACH 1–6 ORAZ KALISTENICE): wskaż dokładnie, w których ćwiczeniach użytkownik ocenił serie na 1–2 (lub łatwe 3) i powinien podnieść ciężar (podaj o ile kg!), w których ćwiczeniach było 3–4 (utrzymać ciężar / dołożyć +1 powtórzenie), a gdzie było 5/6 Bardzo ciężko lub 6/6 Hardcore (zostać na obecnym ciężarze lub wydłużyć przerwę).
3. ⚡ Praktyczne wskazówki biomechaniczne, żywieniowe (dopasowane do BMR, dziennika kalorii/makro, % tkanki tłuszczowej i celu) oraz regeneracyjne.
Używaj czytelnego formatowania punktowego.`;

  try {
    const tier = STATE.preferredGeminiTier || 'smart';
    const feedback = await callGemini(prompt, tier);
    // Only save and display if session still exists in history
    const stillExists = STATE.history.some(s => s.id === session.id);
    if (!stillExists) {
      refreshCoachReportBox();
      return;
    }
    session.coachFeedback = feedback;
    localStorage.setItem('iron_history', JSON.stringify(STATE.history));
    renderAnalysisSessionSelector();
    if (STATE.currentCoachReportSessionId === session.id) {
      reportBox.innerHTML = formatMarkdown(feedback);
      reportBox.style.display = 'block';
    }
  } catch (err) {
    if (STATE.currentCoachReportSessionId === session.id) {
      reportBox.innerHTML = `<p style="color: var(--danger);">Nie udało się pobrać raportu trenera: ${err.message}</p>`;
      reportBox.style.display = 'block';
    }
  } finally {
    loading.style.display = 'none';
  }
}

// ============================================================================
// MULTI-THREAD COACH CHAT (Simultaneous Conversations Support)
// ============================================================================
function initCoachThreads() {
  if (!Array.isArray(STATE.coachThreads)) {
    STATE.coachThreads = [];
  }

  // Migrate legacy single-thread STATE.coachChat if coachThreads is empty
  if (STATE.coachThreads.length === 0) {
    const legacyMsgs = Array.isArray(STATE.coachChat) && STATE.coachChat.length > 0
      ? STATE.coachChat
      : [];
    let firstTitle = 'Czat #1';
    const firstUserMsg = legacyMsgs.find(m => m.role === 'user');
    if (firstUserMsg && firstUserMsg.text) {
      firstTitle = firstUserMsg.text.slice(0, 24) + (firstUserMsg.text.length > 24 ? '…' : '');
    }
    const defaultThread = {
      id: 'thread-' + Date.now(),
      title: firstTitle,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      isThinking: false,
      messages: legacyMsgs
    };
    STATE.coachThreads = [defaultThread];
    STATE.activeCoachThreadId = defaultThread.id;
    saveCoachThreads();
  }

  // Ensure activeCoachThreadId points to an existing thread
  if (!STATE.activeCoachThreadId || !STATE.coachThreads.some(t => t.id === STATE.activeCoachThreadId)) {
    STATE.activeCoachThreadId = STATE.coachThreads[0].id;
    localStorage.setItem('iron_active_coach_thread_id', STATE.activeCoachThreadId);
  }

  // Clear any stuck isThinking flags from page reload
  STATE.coachThreads.forEach(t => { t.isThinking = false; });

  renderCoachThreadsBar();
  renderCoachChat();
}

function getActiveCoachThread() {
  if (!Array.isArray(STATE.coachThreads) || STATE.coachThreads.length === 0) {
    initCoachThreads();
  }
  return STATE.coachThreads.find(t => t.id === STATE.activeCoachThreadId) || STATE.coachThreads[0];
}

function createNewCoachThread() {
  const nextNum = STATE.coachThreads.length + 1;
  const newThread = {
    id: 'thread-' + Date.now() + '-' + Math.floor(Math.random() * 1000),
    title: `Czat #${nextNum}`,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    isThinking: false,
    messages: []
  };
  STATE.coachThreads.unshift(newThread);
  STATE.activeCoachThreadId = newThread.id;
  saveCoachThreads();
  renderCoachThreadsBar();
  renderCoachChat();
  const inputEl = document.getElementById('coach-question-input');
  if (inputEl) inputEl.focus();
}

function selectCoachThread(threadId) {
  const found = STATE.coachThreads.find(t => t.id === threadId);
  if (!found) return;
  STATE.activeCoachThreadId = found.id;
  localStorage.setItem('iron_active_coach_thread_id', STATE.activeCoachThreadId);
  renderCoachThreadsBar();
  renderCoachChat();
}

function renameActiveCoachThread() {
  const thread = getActiveCoachThread();
  if (!thread) return;
  const newTitle = prompt('Podaj nową nazwę dla tego wątku czatu:', thread.title || 'Czat');
  if (newTitle && newTitle.trim()) {
    thread.title = newTitle.trim().slice(0, 35);
    saveCoachThreads();
    renderCoachThreadsBar();
  }
}

function deleteActiveCoachThread() {
  const thread = getActiveCoachThread();
  if (!thread) return;
  if (!confirm(`Czy na pewno chcesz usunąć wątek "${thread.title}"?`)) return;

  STATE.coachThreads = STATE.coachThreads.filter(t => t.id !== thread.id);
  if (STATE.coachThreads.length === 0) {
    const fresh = {
      id: 'thread-' + Date.now(),
      title: 'Czat #1',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      isThinking: false,
      messages: []
    };
    STATE.coachThreads = [fresh];
  }
  STATE.activeCoachThreadId = STATE.coachThreads[0].id;
  saveCoachThreads();
  renderCoachThreadsBar();
  renderCoachChat();
}

function renderCoachThreadsBar() {
  const bar = document.getElementById('coach-threads-bar');
  if (!bar) return;

  bar.innerHTML = STATE.coachThreads.map(t => {
    const isActive = t.id === STATE.activeCoachThreadId;
    const msgCount = (t.messages || []).length;
    return `
      <button
        onclick="selectCoachThread('${t.id}')"
        style="
          flex: 0 0 auto;
          padding: 6px 12px;
          border-radius: 999px;
          font-size: 12px;
          font-weight: ${isActive ? '800' : '600'};
          cursor: pointer;
          border: 1px solid ${isActive ? 'var(--accent)' : 'var(--border)'};
          background: ${isActive ? 'rgba(0, 229, 255, 0.16)' : 'var(--surface-elevated)'};
          color: ${isActive ? 'var(--accent)' : 'var(--text-muted)'};
          display: inline-flex;
          align-items: center;
          gap: 6px;
          white-space: nowrap;
        "
      >
        <span>${t.isThinking ? '⏳' : '💬'} ${escapeHtml(t.title || 'Czat')}</span>
        <span style="font-size: 10px; opacity: 0.75;">(${msgCount})</span>
      </button>
    `;
  }).join('');
}

function prefillCoachPrompt(promptText) {
  const inputEl = document.getElementById('coach-question-input');
  if (!inputEl) return;
  inputEl.value = promptText;
  askCoachQuestion();
}

async function askCoachQuestion() {
  const inputEl = document.getElementById('coach-question-input');
  const q = inputEl.value.trim();
  if (!q) return;

  const targetThread = getActiveCoachThread();
  if (!targetThread) return;

  const userMsg = { role: 'user', text: q, time: Date.now() };
  targetThread.messages.push(userMsg);
  targetThread.updatedAt = Date.now();

  // Auto-title thread from first user question if it still has a generic "Czat #N" title
  const userMsgsCount = targetThread.messages.filter(m => m.role === 'user').length;
  if (userMsgsCount === 1 && /^Czat #\d+$/i.test(targetThread.title || '')) {
    targetThread.title = q.slice(0, 26) + (q.length > 26 ? '…' : '');
  }

  targetThread.isThinking = true;
  inputEl.value = '';
  saveCoachThreads();
  renderCoachThreadsBar();
  renderCoachChat();

  const { profileSection, plansSection, userWeightKg } = buildCoachProfileAndPlansContext();
  const validWorkouts = STATE.history.filter(h => !isWorkoutShortOrTest(h));
  const lastWorkout = validWorkouts[0] || STATE.history[0];
  const lastWorkoutDetails = lastWorkout
    ? formatSessionDetailsForCoach(lastWorkout, userWeightKg)
    : `Brak zarejestrowanych sesji w historii.`;

  const historyForSummary = validWorkouts.length > 0 ? validWorkouts : STATE.history;
  const recentHistorySummary = historyForSummary.slice(0, 5).map(h =>
    `• ${new Date(h.endTime).toLocaleDateString('pl-PL')} - ${h.planName}: ${h.totalVolumeKg}kg, ${h.completedSets} serii, czas ${formatDuration(h.durationSeconds || 0)}, śr. przerwa ${h.avgRestSeconds || 0}s`
  ).join('\n') || 'Brak historii.';

  const conversationHistory = targetThread.messages.slice(-12).map(m => 
    `${m.role === 'user' ? 'Użytkownik' : 'Trener'}: ${m.text}`
  ).join('\n\n');

  const fullPrompt = `
Jesteś doświadczonym, empatycznym trenerem personalnym i fizjologiem w aplikacji IronCoach.
Rozmawiasz z użytkownikiem w wątku czatu pt. "${targetThread.title}". Zawsze bierz pod uwagę jego wagę, wzrost, cel treningowy, pełny raport składu ciała z wagi Fitdays (21 wskaźników, BMR, % tkanki tłuszczowej, masa mięśniowa, segmentowa analiza kończyn i tułowia), obwody ciała (talia, pas, klatka, ramiona, biceps, udo), historię zmian pomiarów w czasie, strukturę planów (superserie, ćwiczenia z masą ciała, ćwiczenia 2x hantle) oraz pełne dane z jego ostatnich treningów (czas trwania, tonaż, rzeczywiste przerwy między seriami).

=== PROFIL, SKŁAD CIAŁA (FITDAYS), OBWODY I CEL UŻYTKOWNIKA ===
${profileSection}

=== AKTUALNE PLANY TRENINGOWE ===
${plansSection}

=== OSTATNI ZAREJESTROWANY TRENING (SZCZEGÓŁY SERII I PRZERW) ===
${lastWorkoutDetails}

=== HISTORIA OSTATNICH SESJI ===
${recentHistorySummary}

=== DOTYCHCZASOWY PRZEBIEG ROZMOWY W TYM WĄTKU ===
${conversationHistory}

Udziel naturalnej, merytorycznej, spersonalizowanej odpowiedzi po polsku jako Trener na ostatnią wiadomość użytkownika.
`;

  try {
    const tier = STATE.preferredGeminiTier || 'smart';
    const ans = await callGemini(fullPrompt, tier);
    const wasFallback = Boolean(STATE.lastGeminiFallback && STATE.lastGeminiFallback.usedModel);
    const fallbackNote = wasFallback
      ? `\n\n*(⚡ Odpowiedź wygenerowana przez model fallback: **${STATE.lastUsedGeminiModel}** z powodu wyczerpania limitu na modelu wyższym)*`
      : '';
    targetThread.messages.push({ role: 'assistant', text: ans + fallbackNote, time: Date.now() });
    targetThread.updatedAt = Date.now();
  } catch (err) {
    targetThread.messages.push({ role: 'assistant', text: `⚠️ Błąd: ${err.message}`, time: Date.now() });
  } finally {
    targetThread.isThinking = false;
    saveCoachThreads();
    renderCoachThreadsBar();
    renderCoachChat();
  }
}

function renderCoachChat() {
  const container = document.getElementById('coach-chat-messages');
  if (!container) return;

  const activeThread = getActiveCoachThread();
  const msgs = activeThread ? (activeThread.messages || []) : [];

  if (msgs.length === 0 && (!activeThread || !activeThread.isThinking)) {
    container.innerHTML = `
      <div style="text-align: center; color: var(--text-muted); padding: 24px 12px; font-size: 13px;">
        👋 Cześć! Jestem Twoim trenerem personalnym AI.<br>
        Wątek: <b style="color: var(--accent);">${escapeHtml(activeThread?.title || 'Nowy czat')}</b><br>
        Możesz prowadzić kilka czatów jednocześnie (np. osobny o diecie, osobny o technice czy planie).
      </div>
    `;
    return;
  }

  const bubblesHtml = msgs.map(m => {
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

  const thinkingHtml = activeThread && activeThread.isThinking ? `
    <div style="display: flex; justify-content: flex-start; margin-bottom: 10px;">
      <div style="
        padding: 10px 14px;
        border-radius: 14px 14px 14px 2px;
        background: var(--surface-elevated);
        color: var(--accent);
        font-size: 13px;
        border: 1px dashed var(--accent);
      ">
        ⏳ Trener analizuje i pisze odpowiedź w tym wątku... (możesz w tym czasie przełączyć się na inny czat)
      </div>
    </div>
  ` : '';

  container.innerHTML = bubblesHtml + thinkingHtml;
  container.scrollTop = container.scrollHeight;
}

function saveCoachThreads() {
  localStorage.setItem('iron_coach_threads', JSON.stringify(STATE.coachThreads));
  if (STATE.activeCoachThreadId) {
    localStorage.setItem('iron_active_coach_thread_id', STATE.activeCoachThreadId);
  }
  // Keep legacy STATE.coachChat synced with active thread for backward compatibility
  const active = STATE.coachThreads.find(t => t.id === STATE.activeCoachThreadId);
  if (active) {
    STATE.coachChat = active.messages || [];
    localStorage.setItem('iron_coach_chat', JSON.stringify(STATE.coachChat));
  }
}

function saveCoachChat() {
  saveCoachThreads();
}

function clearCoachChat() {
  deleteActiveCoachThread();
}

// ============================================================================
// USER PROFILE, API KEY & ROBUST EXPORT / IMPORT
// ============================================================================
function loadUserProfile() {
  const p = STATE.userProfile || {};
  const wInput = document.getElementById('profile-weight');
  const hInput = document.getElementById('profile-height');
  const gInput = document.getElementById('profile-goal');
  const gnInput = document.getElementById('profile-goal-notes');

  if (wInput) wInput.value = p.weightKg || '';
  if (hInput) hInput.value = p.heightCm || '';
  if (gInput && p.goal) gInput.value = p.goal;
  if (gnInput) gnInput.value = p.goalNotes || '';

  updateProfileSummaryUI();
}

function saveUserProfile() {
  const weightKg = parseFloat(document.getElementById('profile-weight')?.value) || '';
  const heightCm = parseFloat(document.getElementById('profile-height')?.value) || '';
  const goal = document.getElementById('profile-goal')?.value || 'Budowa masy mięśniowej (Hipertrofia)';
  const goalNotes = (document.getElementById('profile-goal-notes')?.value || '').trim();

  STATE.userProfile = { weightKg, heightCm, goal, goalNotes };
  localStorage.setItem('iron_user_profile', JSON.stringify(STATE.userProfile));
  updateProfileSummaryUI();

  const status = document.getElementById('profile-save-status');
  if (status) {
    status.style.display = 'block';
    setTimeout(() => { status.style.display = 'none'; }, 3500);
  }
}

function updateProfileSummaryUI() {
  const p = STATE.userProfile || {};
  const w = parseFloat(p.weightKg) || 0;
  const h = parseFloat(p.heightCm) || 0;

  const bmiBadge = document.getElementById('profile-bmi-badge');
  if (bmiBadge) {
    if (w > 0 && h > 0) {
      const bmi = (w / Math.pow(h / 100, 2)).toFixed(1);
      bmiBadge.textContent = `BMI: ${bmi}`;
      bmiBadge.style.display = 'inline-block';
    } else {
      bmiBadge.style.display = 'none';
    }
  }

  const parts = [];
  if (w > 0) parts.push(`Waga: <b>${w} kg</b>`);
  if (h > 0) parts.push(`Wzrost: <b>${h} cm</b>`);
  if (p.goal) parts.push(`Cel: <b>${escapeHtml(p.goal)}</b>`);
  if (p.goalNotes) parts.push(`Uwagi: <i>${escapeHtml(p.goalNotes)}</i>`);

  const summaryHtml = parts.length > 0
    ? parts.join(' • ')
    : 'Nie podano jeszcze wagi i wzrostu — kliknij "Zmień", aby uzupełnić profil';

  const coachSummary = document.getElementById('coach-profile-summary');
  if (coachSummary) coachSummary.innerHTML = summaryHtml;

  const analysisSummary = document.getElementById('analysis-profile-summary');
  if (analysisSummary) analysisSummary.innerHTML = summaryHtml;
}

function toggleApiKeyVisibility(inputId = 'gemini-api-key') {
  const input = document.getElementById(inputId);
  if (!input) return;
  input.type = input.type === 'password' ? 'text' : 'password';
}

function savePreferredGeminiTier(tier) {
  STATE.preferredGeminiTier = tier || 'fast';
  localStorage.setItem('iron_gemini_preferred_tier', STATE.preferredGeminiTier);
}

function loadApiKey() {
  const input = document.getElementById('gemini-api-key');
  if (input) input.value = STATE.apiKey || '';
  const backupInput = document.getElementById('gemini-backup-api-key');
  if (backupInput) backupInput.value = STATE.backupApiKey || '';
  const tierSelect = document.getElementById('gemini-preferred-tier');
  if (tierSelect) tierSelect.value = STATE.preferredGeminiTier || 'fast';
  if (STATE.lastUsedGeminiModel) {
    updateGeminiModelBadges(STATE.lastUsedGeminiModel, Boolean(STATE.lastGeminiFallback));
  }
}

function saveApiKey() {
  const val = document.getElementById('gemini-api-key')?.value.trim() || '';
  const backupVal = document.getElementById('gemini-backup-api-key')?.value.trim() || '';
  STATE.apiKey = val;
  STATE.backupApiKey = backupVal;
  localStorage.setItem('iron_gemini_api_key', val);
  localStorage.setItem('iron_gemini_backup_api_key', backupVal);
  const status = document.getElementById('api-key-status');
  if (status) {
    status.style.display = 'block';
    setTimeout(() => { status.style.display = 'none'; }, 3000);
  }
}

async function testApiKeysConnection() {
  const primaryKey = (document.getElementById('gemini-api-key')?.value || STATE.apiKey || '').trim();
  const backupKey = (document.getElementById('gemini-backup-api-key')?.value || STATE.backupApiKey || '').trim();

  const statusEl = document.getElementById('api-key-test-results');
  if (!statusEl) return;

  statusEl.style.display = 'block';
  statusEl.innerHTML = '<span style="color: var(--accent);">⏳ Badam listę modeli (v1 i v1beta) i testuję połączenie z Google...</span>';

  const testKey = async (key, label) => {
    if (!key) return `• <b>${label}</b>: <span style="color: var(--text-muted);">⚪ Brak wpisanego klucza</span>`;
    
    // Step 1: Discover models dynamically across v1 and v1beta
    const { models, errors } = await discoverGeminiModelsForKey(key);
    
    if (models.length === 0 && errors.length > 0) {
      const firstErr = errors[0];
      const errMsg = firstErr.message || JSON.stringify(firstErr);
      const isAuth = firstErr.code === 400 || firstErr.code === 403 || errMsg.toLowerCase().includes('api_key');
      const isQuota = firstErr.code === 429 || errMsg.toLowerCase().includes('quota');
      if (isAuth) {
        return `• <b>${label}</b>: <span style="color: var(--danger); font-weight: 700;">❌ Błąd klucza (${escapeHtml(errMsg)})</span>`;
      }
      if (isQuota) {
        return `• <b>${label}</b>: <span style="color: #ffb74d; font-weight: 700;">⏳ Limit zapytań wyczerpany (Quota 429: ${escapeHtml(errMsg)})</span>`;
      }
      return `• <b>${label}</b>: <span style="color: var(--danger);">⚠️ Błąd pobierania modeli: ${escapeHtml(errMsg)}</span>`;
    }

    // Step 2: Candidates to ping
    const pool = models.length > 0 ? models : [
      { name: 'gemini-3.8-flash', apiVersion: 'v1beta', tier: 2, score: 50 },
      { name: 'gemini-3.6-flash', apiVersion: 'v1beta', tier: 2, score: 48 },
      { name: 'gemini-3.5-flash-lite', apiVersion: 'v1beta', tier: 3, score: 45 },
      { name: 'gemini-2.5-flash', apiVersion: 'v1beta', tier: 2, score: 30 },
      { name: 'gemini-1.5-flash', apiVersion: 'v1', tier: 2, score: 20 }
    ];

    const sorted = [...pool].sort((a, b) => {
      if (a.tier === 2 && b.tier !== 2) return -1;
      if (b.tier === 2 && a.tier !== 2) return 1;
      return b.score - a.score;
    });

    const modelNamesList = models.map(m => `${m.name} (${m.apiVersion})`).slice(0, 6).join(', ');

    let pingSuccess = false;
    let pingModelUsed = '';
    let pingErrorMsg = '';

    for (const cand of sorted.slice(0, 4)) {
      const vers = [cand.apiVersion, cand.apiVersion === 'v1' ? 'v1beta' : 'v1'];
      for (const ver of vers) {
        try {
          const pingUrl = `https://generativelanguage.googleapis.com/${ver}/models/${cand.name}:generateContent?key=${key}`;
          const pRes = await fetch(pingUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contents: [{ parts: [{ text: 'ping' }] }] })
          });
          if (pRes.ok) {
            pingSuccess = true;
            pingModelUsed = `${cand.name} (${ver})`;
            break;
          } else {
            const pErr = await pRes.json().catch(() => ({}));
            pingErrorMsg = pErr.error?.message || `HTTP ${pRes.status}`;
            if (pRes.status === 429) break;
          }
        } catch (e) {
          pingErrorMsg = e.message;
        }
      }
      if (pingSuccess) break;
      if (pingErrorMsg.toLowerCase().includes('quota') || pingErrorMsg.includes('429')) break;
    }

    if (pingSuccess) {
      const listInfo = modelNamesList ? `<br><span style="font-size: 11px; color: var(--text-muted); padding-left: 14px;">Dostępne w Twoim projekcie: ${escapeHtml(modelNamesList)}</span>` : '';
      return `• <b>${label}</b>: <span style="color: var(--success); font-weight: 700;">✅ Działa! Połączenie nawiązane (${escapeHtml(pingModelUsed)})</span>${listInfo}`;
    }

    if (pingErrorMsg.toLowerCase().includes('quota') || pingErrorMsg.includes('429')) {
      return `• <b>${label}</b>: <span style="color: #ffb74d; font-weight: 700;">⏳ Limit dobowy wyczerpany (Quota 429: ${escapeHtml(pingErrorMsg)})</span>`;
    }

    return `• <b>${label}</b>: <span style="color: var(--danger); font-weight: 700;">⚠️ Błąd testu: ${escapeHtml(pingErrorMsg)}</span>`;
  };

  const res1 = await testKey(primaryKey, 'Klucz główny');
  const res2 = await testKey(backupKey, 'Klucz zapasowy');

  let hint = '';
  if (primaryKey && backupKey && primaryKey === backupKey) {
    hint = '<div style="margin-top: 8px; color: #ffb74d;">⚠️ <b>Uwaga:</b> Oba wpisane klucze są identyczne! Klucz zapasowy musi pochodzić z osobnego projektu.</div>';
  } else if (res1.includes('429') && res2.includes('429')) {
    hint = '<div style="margin-top: 8px; color: #ffb74d;">💡 <b>Diagnoza:</b> Oba klucze zwróciły Quota 429. Oznacza to, że klucz zapasowy został wygenerowany w <u>tym samym projekcie Google Cloud</u> co klucz główny i dzielą tę samą wyczerpaną pulę. W Google AI Studio kliknij "Create API key in <b>NEW project</b>".</div>';
  } else if (res2.includes('Działa')) {
    hint = '<div style="margin-top: 8px; color: var(--success);">🎉 <b>Super!</b> Klucz zapasowy działa poprawnie!</div>';
  }

  statusEl.innerHTML = `<div style="text-align: left; font-size: 12px; line-height: 1.6;">${res1}<br>${res2}${hint}</div>`;
}

function buildFullBackupObject() {
  const enrichedPlans = (STATE.plans || []).map(p => ({
    ...p,
    exercises: (p.exercises || []).map(ex => {
      const matched = findExerciseGif(ex.name, ex);
      return {
        ...ex,
        gifSlug: ex.gifSlug || (matched ? matched.s : ''),
        gifUrl: ex.gifUrl || (matched ? matched.g : ''),
        gifName: ex.gifName || (matched ? matched.n : '')
      };
    })
  }));

  return {
    schemaVersion: 8,
    exportedAt: new Date().toISOString(),
    userProfile: STATE.userProfile,
    bodyMeasurements: STATE.bodyMeasurements,
    nutritionGoals: STATE.nutritionGoals,
    nutritionDiary: STATE.nutritionDiary,
    plans: enrichedPlans,
    history: STATE.history,
    calendarAiSummaries: STATE.calendarAiSummaries || {},
    customGifMap: JSON.parse(localStorage.getItem('iron_custom_gif_map') || '{}'),
    coachThreads: STATE.coachThreads,
    activeCoachThreadId: STATE.activeCoachThreadId,
    coachChat: STATE.coachChat
  };
}

function exportDataJson() {
  const backup = buildFullBackupObject();
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

      // 0a. Restore custom GIF mappings first so plan exercises can use them immediately
      if (data.customGifMap && typeof data.customGifMap === 'object') {
        const currentMap = JSON.parse(localStorage.getItem('iron_custom_gif_map') || '{}');
        localStorage.setItem('iron_custom_gif_map', JSON.stringify({ ...currentMap, ...data.customGifMap }));
      }

      // 0b. Restore user profile & body measurements if present
      if (data.userProfile && typeof data.userProfile === 'object') {
        STATE.userProfile = {
          weightKg: data.userProfile.weightKg || '',
          heightCm: data.userProfile.heightCm || '',
          goal: data.userProfile.goal || 'Budowa masy mięśniowej (Hipertrofia)',
          goalNotes: data.userProfile.goalNotes || ''
        };
        localStorage.setItem('iron_user_profile', JSON.stringify(STATE.userProfile));
        loadUserProfile();
      }

      if (Array.isArray(data.bodyMeasurements)) {
        data.bodyMeasurements.forEach(item => {
          upsertAndMergeBodyMeasurement(item);
        });
        STATE.bodyMeasurements.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
        localStorage.setItem('iron_body_measurements', JSON.stringify(STATE.bodyMeasurements));
        renderBodyMeasurementsView();
      }

      if (data.nutritionGoals && typeof data.nutritionGoals === 'object') {
        STATE.nutritionGoals = {
          kcal: parseInt(data.nutritionGoals.kcal) || 2500,
          proteinG: parseInt(data.nutritionGoals.proteinG) || 180,
          carbsG: parseInt(data.nutritionGoals.carbsG) || 260,
          fatG: parseInt(data.nutritionGoals.fatG) || 75
        };
        localStorage.setItem('iron_nutrition_goals', JSON.stringify(STATE.nutritionGoals));
      }

      if (Array.isArray(data.nutritionDiary)) {
        const mergedDiary = [...(STATE.nutritionDiary || [])];
        data.nutritionDiary.forEach(meal => {
          if (!meal || !meal.id) return;
          const idx = mergedDiary.findIndex(x => x.id === meal.id);
          if (idx !== -1) mergedDiary[idx] = meal;
          else mergedDiary.push(meal);
        });
        mergedDiary.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
        STATE.nutritionDiary = mergedDiary;
        localStorage.setItem('iron_nutrition_diary', JSON.stringify(STATE.nutritionDiary));
        renderNutritionView();
      }

      // 1. Safely normalize and import plans (including direct gifUrl and gifSlug per exercise!)
      if (Array.isArray(data.plans)) {
        const savedMappings = JSON.parse(localStorage.getItem('iron_custom_gif_map') || '{}');
        const normalizedPlans = data.plans.map((p, idx) => ({
          id: p.id || ('plan-imp-' + Date.now() + '-' + idx),
          name: p.name || 'Zaimportowany Plan',
          description: p.description || '',
          restSeconds: parseInt(p.restSeconds) || 90,
          supersetRestSeconds: parseInt(p.supersetRestSeconds) || 30,
          exercises: Array.isArray(p.exercises) ? p.exercises.map(ex => {
            const exName = ex.name || 'Ćwiczenie';
            const gifSlug = ex.gifSlug || '';
            const gifUrl = ex.gifUrl || '';
            const gifName = ex.gifName || '';
            if (gifUrl || gifSlug) {
              const payload = { slug: gifSlug || 'custom-url', url: gifUrl, name: gifName || exName };
              savedMappings[exName] = payload;
              const normKey = normalizeExKey(exName);
              if (normKey) savedMappings[normKey] = payload;
            }
            return {
              name: exName,
              muscle: ex.muscle || 'Inne',
              sets: parseInt(ex.sets) || 3,
              reps: parseInt(ex.reps) || 10,
              weight: parseFloat(ex.weight) || 0,
              supersetGroup: ex.supersetGroup || '',
              loadType: ex.loadType || 'standard',
              gifSlug,
              gifUrl,
              gifName,
              manualUpdatedAt: ex.manualUpdatedAt || null
            };
          }) : []
        }));
        localStorage.setItem('iron_custom_gif_map', JSON.stringify(savedMappings));
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
            burnedKcal: h.burnedKcal || null,
            epocKcal: h.epocKcal || null,
            completedSets: parseInt(h.completedSets) || (Array.isArray(h.sets) ? h.sets.length : 0),
            sets: Array.isArray(h.sets) ? h.sets.map((s, sIdx) => ({
              exercise: s.exercise || 'Ćwiczenie',
              muscle: s.muscle || 'Inne',
              supersetGroup: s.supersetGroup || '',
              loadType: s.loadType || 'standard',
              setNum: s.setNum || (sIdx + 1),
              weight: parseFloat(s.weight) || 0,
              effectiveWeight: parseFloat(s.effectiveWeight) || (s.loadType === 'dual_dumbbell' ? (parseFloat(s.weight) || 0) * 2 : (parseFloat(s.weight) || 0)),
              reps: parseInt(s.reps) || 0,
              effort: parseInt(s.effort) || null,
              startedAt: s.startedAt || null,
              completedAt: s.completedAt || null,
              relStartStr: s.relStartStr || null,
              relEndStr: s.relEndStr || null,
              relTimeLabel: s.relTimeLabel || null
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

      // 4. Restore Coach AI chat threads (or legacy single coachChat) if present
      if (Array.isArray(data.coachThreads) && data.coachThreads.length > 0) {
        const mergedThreads = [...STATE.coachThreads];
        data.coachThreads.forEach(item => {
          const idx = mergedThreads.findIndex(x => x.id === item.id);
          if (idx !== -1) mergedThreads[idx] = { ...item, isThinking: false };
          else mergedThreads.push({ ...item, isThinking: false });
        });
        STATE.coachThreads = mergedThreads;
        if (data.activeCoachThreadId) STATE.activeCoachThreadId = data.activeCoachThreadId;
        saveCoachThreads();
        renderCoachThreadsBar();
        renderCoachChat();
      } else if (Array.isArray(data.coachChat) && data.coachChat.length > 0) {
        STATE.coachChat = data.coachChat;
        STATE.coachThreads = [];
        initCoachThreads();
      }

      if (data.calendarAiSummaries && typeof data.calendarAiSummaries === 'object') {
        STATE.calendarAiSummaries = { ...(STATE.calendarAiSummaries || {}), ...data.calendarAiSummaries };
        localStorage.setItem('iron_calendar_ai_summaries', JSON.stringify(STATE.calendarAiSummaries));
      }

      renderPlans();
      renderRecentWorkouts();
      if (typeof renderCalendarDashboard === 'function') renderCalendarDashboard();
      alert('Dane i historia zostały bezpiecznie zaimportowane!');
    } catch (err) {
      alert('Niepoprawny plik JSON: ' + err.message);
    }
  };
  reader.readAsText(file);
}

// ============================================================================
// MODULE 5: CALENDAR & GEMINI AI DASHBOARD (Workout / Rest & Weight / Mixed Cards)
// ============================================================================
function getIsoDateFromTimestamp(ts) {
  const d = new Date(ts || Date.now());
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function getWorkoutsForDateKey(dateKey) {
  if (!dateKey || !Array.isArray(STATE.history)) return [];
  return STATE.history.filter(h => {
    const k = getIsoDateFromTimestamp(h.endTime || h.startTime);
    return k === dateKey;
  });
}

function getMeasurementsForDateKey(dateKey) {
  if (!dateKey || !Array.isArray(STATE.bodyMeasurements)) return [];
  return STATE.bodyMeasurements.filter(m => getMeasurementDayKey(m) === dateKey);
}

function initCalendarDashboard() {
  const now = new Date();
  STATE.calendarYear = now.getFullYear();
  STATE.calendarMonth = now.getMonth();
  const todayIso = getIsoDateFromTimestamp(now.getTime());

  // Default selected calendar day to today if it has data, or the latest day with workout/measurement in current month
  const todayHasData = getWorkoutsForDateKey(todayIso).length > 0 || getMeasurementsForDateKey(todayIso).length > 0;
  if (todayHasData) {
    STATE.selectedCalendarDate = todayIso;
  } else {
    const latestWorkout = (STATE.history || [])[0];
    const latestMeas = (STATE.bodyMeasurements || [])[0];
    const wTs = latestWorkout ? (latestWorkout.endTime || latestWorkout.startTime || 0) : 0;
    const mTs = latestMeas ? (latestMeas.timestamp || 0) : 0;
    if (wTs >= mTs && wTs > 0) {
      const d = new Date(wTs);
      STATE.calendarYear = d.getFullYear();
      STATE.calendarMonth = d.getMonth();
      STATE.selectedCalendarDate = getIsoDateFromTimestamp(wTs);
    } else if (mTs > 0) {
      const dKey = getMeasurementDayKey(latestMeas);
      const parts = dKey.split('-');
      if (parts.length === 3) {
        STATE.calendarYear = parseInt(parts[0]) || now.getFullYear();
        STATE.calendarMonth = (parseInt(parts[1]) || 1) - 1;
      }
      STATE.selectedCalendarDate = dKey;
    } else {
      STATE.selectedCalendarDate = todayIso;
    }
  }
  renderCalendarDashboard();
}

function changeCalendarMonth(delta) {
  let m = STATE.calendarMonth + delta;
  let y = STATE.calendarYear;
  if (m < 0) {
    m = 11;
    y--;
  } else if (m > 11) {
    m = 0;
    y++;
  }
  STATE.calendarMonth = m;
  STATE.calendarYear = y;
  renderCalendarDashboard();
}

function selectCalendarDay(dateKey) {
  STATE.selectedCalendarDate = dateKey;
  renderCalendarDashboard();
}

function renderCalendarDashboard() {
  const monthLabelEl = document.getElementById('calendar-month-label');
  const gridEl = document.getElementById('home-calendar-grid');
  if (!monthLabelEl || !gridEl) return;

  const year = STATE.calendarYear;
  const month = STATE.calendarMonth;
  const monthNamesPl = [
    'Styczeń', 'Luty', 'Marzec', 'Kwiecień', 'Maj', 'Czerwiec',
    'Lipiec', 'Sierpień', 'Wrzesień', 'Październik', 'Listopad', 'Grudzień'
  ];
  monthLabelEl.textContent = `${monthNamesPl[month] || ''} ${year}`;

  const firstDay = new Date(year, month, 1);
  // Convert JS Sunday=0..Saturday=6 into Monday=0..Sunday=6
  const startWeekday = (firstDay.getDay() + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const todayIso = getIsoDateFromTimestamp(Date.now());

  const cellsHtml = [];
  for (let i = 0; i < startWeekday; i++) {
    cellsHtml.push(`<div></div>`);
  }

  for (let day = 1; day <= daysInMonth; day++) {
    const dateKey = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const hasWorkout = getWorkoutsForDateKey(dateKey).length > 0;
    const hasMeas = getMeasurementsForDateKey(dateKey).length > 0;
    const isSelected = STATE.selectedCalendarDate === dateKey;
    const isToday = dateKey === todayIso;

    let bg = 'var(--surface-elevated)';
    let border = '1px solid var(--border)';
    let badgeIcons = '';

    if (hasWorkout && hasMeas) {
      bg = 'linear-gradient(135deg, rgba(255,179,0,0.22), rgba(0,229,255,0.22))';
      border = '1px solid var(--primary)';
      badgeIcons = '🏋️⚖️';
    } else if (hasWorkout) {
      bg = 'rgba(255, 179, 0, 0.16)';
      border = '1px solid rgba(255, 179, 0, 0.45)';
      badgeIcons = '🏋️';
    } else if (hasMeas) {
      bg = 'rgba(0, 229, 255, 0.14)';
      border = '1px solid rgba(0, 229, 255, 0.45)';
      badgeIcons = '⚖️';
    }

    if (isSelected) {
      border = '2px solid #00E676';
    }

    cellsHtml.push(`
      <button
        type="button"
        onclick="selectCalendarDay('${dateKey}')"
        style="
          background: ${bg};
          border: ${border};
          border-radius: 8px;
          padding: 5px 2px;
          min-height: 42px;
          color: var(--text);
          cursor: pointer;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 2px;
          box-shadow: ${isSelected ? '0 0 10px rgba(0,230,118,0.35)' : 'none'};
        "
      >
        <span style="font-size: 12px; font-weight: ${isToday || isSelected ? '900' : '700'}; color: ${isToday ? 'var(--success)' : 'var(--text)'};">${day}</span>
        <span style="font-size: 9px; line-height: 1; min-height: 10px;">${badgeIcons}</span>
      </button>
    `);
  }

  gridEl.innerHTML = cellsHtml.join('');
  renderCalendarDaySummaryCard(STATE.selectedCalendarDate);
}

function getWeightTrendForMeasurement(entry) {
  if (!entry || !entry.weightKg) {
    return { arrow: '→', color: 'var(--text-muted)', deltaStr: 'stabilnie' };
  }
  const currentDayKey = getMeasurementDayKey(entry);
  // Find previous measurement with weightKg before currentDayKey
  const olderWithWeight = (STATE.bodyMeasurements || [])
    .filter(m => m.weightKg && getMeasurementDayKey(m) < currentDayKey)
    .sort((a, b) => getMeasurementDayKey(b).localeCompare(getMeasurementDayKey(a)));

  const prev = olderWithWeight[0];
  if (!prev || !prev.weightKg) {
    return { arrow: '→', color: 'var(--accent)', deltaStr: 'pierwszy pomiar' };
  }
  const diff = Number((parseFloat(entry.weightKg) - parseFloat(prev.weightKg)).toFixed(1));
  if (diff > 0.1) {
    return { arrow: '↑', color: 'var(--primary)', deltaStr: `+${diff} kg` };
  }
  if (diff < -0.1) {
    return { arrow: '↓', color: 'var(--success)', deltaStr: `${diff} kg` };
  }
  return { arrow: '→', color: 'var(--accent)', deltaStr: '0.0 kg' };
}

function buildWorkoutDayModuleHtml(dateKey, dayWorkouts, aiCache) {
  const totalVol = dayWorkouts.reduce((acc, w) => acc + (parseFloat(w.totalVolumeKg) || 0), 0);
  const totalDurSec = dayWorkouts.reduce((acc, w) => {
    const d = w.durationSeconds || (w.endTime && w.startTime ? Math.round((w.endTime - w.startTime) / 1000) : 0);
    return acc + d;
  }, 0);
  const totalSets = dayWorkouts.reduce((acc, w) => acc + (parseInt(w.completedSets) || 0), 0);
  const burnedKcal = dayWorkouts.reduce((acc, w) => {
    if (w.burnedKcal) return acc + w.burnedKcal;
    const dMin = (w.durationSeconds || 1800) / 60;
    return acc + Math.round((dMin * 6.5) + ((w.totalVolumeKg || 0) * 0.012));
  }, 0);
  const epocKcal = Math.round(burnedKcal * 0.15);
  const planNames = dayWorkouts.map(w => w.planName || 'Trening').join(' + ');

  const twoLineSummary = (aiCache && aiCache.workoutSummary)
    ? aiCache.workoutSummary
    : `Mocna sesja ${planNames} (${totalSets} serii, tonaż ${Math.round(totalVol)} kg).\nWysoki bodziec metaboliczny — zadbaj o białko i sen pod kątem superkompensacji.`;

  return `
    <div>
      <div style="display: flex; justify-content: space-between; align-items: center; gap: 6px; margin-bottom: 8px; flex-wrap: wrap;">
        <span class="badge" style="background: rgba(255,179,0,0.18); color: var(--primary); font-size: 11px;">🏋️ DZIEŃ TRENINGOWY • ${escapeHtml(planNames)}</span>
        <button type="button" class="btn btn-sm btn-secondary" style="width: auto; padding: 3px 8px; font-size: 10px;" onclick="generateCalendarDayAiSummary('${dateKey}', true)">🤖 Odśwież Gemini</button>
      </div>
      <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; margin-bottom: 8px;">
        <div style="background: rgba(0,0,0,0.28); border: 1px solid var(--border); border-radius: 8px; padding: 7px 4px; text-align: center;">
          <div style="font-size: 13px; font-weight: 900; color: var(--primary);">${Math.round(totalVol)} kg</div>
          <div style="font-size: 9px; color: var(--text-muted); text-transform: uppercase;">Tonaż całk.</div>
        </div>
        <div style="background: rgba(0,0,0,0.28); border: 1px solid var(--border); border-radius: 8px; padding: 7px 4px; text-align: center;">
          <div style="font-size: 13px; font-weight: 900; color: var(--accent);">${formatDuration(totalDurSec)}</div>
          <div style="font-size: 9px; color: var(--text-muted); text-transform: uppercase;">Czas trwania</div>
        </div>
        <div style="background: rgba(0,0,0,0.28); border: 1px solid var(--border); border-radius: 8px; padding: 7px 4px; text-align: center;">
          <div style="font-size: 13px; font-weight: 900; color: var(--success);">~${burnedKcal} kcal</div>
          <div style="font-size: 9px; color: var(--text-muted); text-transform: uppercase;">Spalone kcal</div>
        </div>
        <div style="background: rgba(0,0,0,0.28); border: 1px solid var(--border); border-radius: 8px; padding: 7px 4px; text-align: center;">
          <div style="font-size: 13px; font-weight: 900; color: #ff9100;">+${epocKcal} kcal</div>
          <div style="font-size: 9px; color: var(--text-muted); text-transform: uppercase;">Efekt EPOC</div>
        </div>
      </div>
      <div style="background: rgba(255,179,0,0.07); border-left: 3px solid var(--primary); border-radius: 6px; padding: 7px 10px; font-size: 12px; line-height: 1.45; color: var(--text);">
        <div style="font-size: 10px; font-weight: 800; color: var(--primary); text-transform: uppercase; margin-bottom: 2px;">✨ Podsumowanie Gemini (2-linijkowe):</div>
        <div>${escapeHtml(twoLineSummary).replace(/\n/g, '<br>')}</div>
      </div>
    </div>
  `;
}

function buildMeasurementDayModuleHtml(dateKey, measEntry, aiCache, isCompactPanel = false) {
  const trend = getWeightTrendForMeasurement(measEntry);
  const oneWord = (aiCache && aiCache.oneWordStatus) ? aiCache.oneWordStatus : 'Regeneracja';

  // Pick 3-4 key indicators available on this measurement
  const indicators = [];
  if (measEntry.bodyFatPct != null) indicators.push({ label: 'Tkanka tł. (BF)', val: `${measEntry.bodyFatPct}%` });
  if (measEntry.muscleMassKg != null) indicators.push({ label: 'Mięśnie', val: `${measEntry.muscleMassKg} kg` });
  if (measEntry.bodyWaterPct != null) indicators.push({ label: 'Woda', val: `${measEntry.bodyWaterPct}%` });
  if (measEntry.waistCm != null) indicators.push({ label: 'Talia', val: `${measEntry.waistCm} cm` });
  if (measEntry.beltCm != null && indicators.length < 4) indicators.push({ label: 'Pas', val: `${measEntry.beltCm} cm` });
  if (measEntry.bicepsCm != null && indicators.length < 4) indicators.push({ label: 'Biceps', val: `${measEntry.bicepsCm} cm` });
  if (measEntry.bmrKcal != null && indicators.length < 4) indicators.push({ label: 'BMR', val: `${measEntry.bmrKcal} kcal` });
  if (measEntry.bmi != null && indicators.length < 4) indicators.push({ label: 'BMI', val: `${measEntry.bmi}` });

  const topIndicators = indicators.slice(0, 4);

  return `
    <div>
      <div style="display: flex; justify-content: space-between; align-items: center; gap: 6px; margin-bottom: 8px; flex-wrap: wrap;">
        <span class="badge badge-cyan" style="font-size: 11px;">⚖️ ${isCompactPanel ? 'PANEL WYMIARÓW I WAGI' : 'DZIEŃ BEZ TRENINGU (POMIARY / WAGA)'}</span>
        <span class="badge" style="background: rgba(0,230,118,0.16); color: var(--success); font-size: 11px; font-weight: 900;">✨ Gemini: „${escapeHtml(oneWord)}”</span>
      </div>
      <div style="display: flex; align-items: center; justify-content: space-between; background: rgba(0,0,0,0.28); border: 1px solid var(--border); border-radius: 10px; padding: 8px 12px; margin-bottom: 8px;">
        <div>
          <div style="font-size: 10px; color: var(--text-muted); text-transform: uppercase;">Waga i trend</div>
          <div style="font-size: 18px; font-weight: 900; color: var(--text);">
            ${measEntry.weightKg != null ? `${measEntry.weightKg} kg` : 'Pomiar obwodów'}
            <span style="color: ${trend.color}; font-size: 18px; margin-left: 4px;">${trend.arrow}</span>
            <span style="font-size: 11px; color: ${trend.color}; font-weight: 700; margin-left: 4px;">(${escapeHtml(trend.deltaStr)})</span>
          </div>
        </div>
        ${!isCompactPanel ? `<button type="button" class="btn btn-sm btn-secondary" style="width: auto; padding: 4px 8px; font-size: 10px;" onclick="generateCalendarDayAiSummary('${dateKey}', true)">🤖 Odśwież AI</button>` : ''}
      </div>
      ${topIndicators.length > 0 ? `
        <div style="display: grid; grid-template-columns: repeat(${Math.min(4, topIndicators.length)}, 1fr); gap: 6px;">
          ${topIndicators.map(ind => `
            <div style="background: rgba(0,0,0,0.22); border: 1px solid var(--border); border-radius: 8px; padding: 6px 4px; text-align: center;">
              <div style="font-size: 12px; font-weight: 800; color: var(--accent);">${escapeHtml(ind.val)}</div>
              <div style="font-size: 9px; color: var(--text-muted);">${escapeHtml(ind.label)}</div>
            </div>
          `).join('')}
        </div>
      ` : ''}
    </div>
  `;
}

function renderCalendarDaySummaryCard(dateKey) {
  const cardEl = document.getElementById('calendar-day-summary-card');
  if (!cardEl) return;

  const dayWorkouts = getWorkoutsForDateKey(dateKey);
  const dayMeasurements = getMeasurementsForDateKey(dateKey);
  const measEntry = dayMeasurements[0] || null;
  const aiCache = (STATE.calendarAiSummaries && STATE.calendarAiSummaries[dateKey]) || null;

  if (dayWorkouts.length === 0 && !measEntry) {
    cardEl.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center;">
        <div>
          <div style="font-size: 12px; font-weight: 800; color: var(--text);">📅 ${escapeHtml(dateKey)} — Dzień wolny</div>
          <div style="font-size: 11px; color: var(--text-muted); margin-top: 2px;">Brak zarejestrowanego treningu lub pomiaru wagi w tym dniu.</div>
        </div>
        <span class="badge" style="background: rgba(255,255,255,0.06); color: var(--text-muted);">Odpoczynek</span>
      </div>
    `;
    return;
  }

  // Case 1: Mixed Day (Workout + Weight/Measurements integrated card)
  if (dayWorkouts.length > 0 && measEntry) {
    cardEl.innerHTML = `
      <div style="font-size: 11px; font-weight: 900; color: var(--success); text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 8px;">
        🔥 DZIEŃ MIESZANY (${escapeHtml(dateKey)}) — ZINTEGROWANA KARTA TRENINGU I POMIARÓW
      </div>
      ${buildWorkoutDayModuleHtml(dateKey, dayWorkouts, aiCache)}
      <div style="margin-top: 10px; padding-top: 10px; border-top: 1px dashed rgba(255,255,255,0.14);">
        ${buildMeasurementDayModuleHtml(dateKey, measEntry, aiCache, true)}
      </div>
    `;
  } else if (dayWorkouts.length > 0) {
    // Case 2: Workout Day only
    cardEl.innerHTML = buildWorkoutDayModuleHtml(dateKey, dayWorkouts, aiCache);
  } else if (measEntry) {
    // Case 3: Non-Workout Day (Weight/Measurements only)
    cardEl.innerHTML = buildMeasurementDayModuleHtml(dateKey, measEntry, aiCache, false);
  }

  // Automatically generate Gemini summary in background if API key is present and not yet cached
  if (STATE.apiKey && (!aiCache || (!aiCache.workoutSummary && dayWorkouts.length > 0) || (!aiCache.oneWordStatus && measEntry))) {
    generateCalendarDayAiSummary(dateKey, false);
  }
}

const pendingCalendarAiDates = new Set();

async function generateCalendarDayAiSummary(dateKey, force = false) {
  if (!dateKey || !STATE.apiKey) {
    if (force && !STATE.apiKey) alert('Podaj klucz Gemini API w Ustawieniach!');
    return;
  }
  if (pendingCalendarAiDates.has(dateKey)) return;

  const dayWorkouts = getWorkoutsForDateKey(dateKey);
  const dayMeasurements = getMeasurementsForDateKey(dateKey);
  const measEntry = dayMeasurements[0] || null;
  if (dayWorkouts.length === 0 && !measEntry) return;

  pendingCalendarAiDates.add(dateKey);

  try {
    const wContext = dayWorkouts.map(w => {
      const setsStr = (w.sets || []).map(s => `${s.exercise} ${s.weight}kgx${s.reps}${s.effort ? ` (ocena ${s.effort}/6)` : ''}`).join(', ');
      return `Trening: ${w.planName}, tonaż ${w.totalVolumeKg}kg, czas ${formatDuration(w.durationSeconds || 0)}, serie: ${setsStr}`;
    }).join('\n');

    const mContext = measEntry
      ? `Waga: ${measEntry.weightKg || '-'}kg, BF: ${measEntry.bodyFatPct || '-'}%, Mięśnie: ${measEntry.muscleMassKg || '-'}kg, Talia: ${measEntry.waistCm || '-'}cm`
      : '';

    const prompt = `
Jesteś silnikiem analitycznym Gemini w aplikacji IronCoach AI. Przygotuj zwięzłe podsumowanie dnia (${dateKey}) do kafelka Dashboardu.
Dane treningowe z tego dnia:
${wContext || 'Brak treningu'}
Dane pomiarowe z tego dnia:
${mContext || 'Brak pomiaru wagi'}

Zwróć WYŁĄCZNIE poprawny obiekt JSON:
{
  "workoutSummary": "Dokładnie 2 krótkie, konkretne linijki tekstu po polsku (oddzielone znakiem \\n) podsumowujące wykonany trening, objętość i efekt potreningowy EPOC.",
  "oneWordStatus": "Dokładnie 1 słowo po polsku określające stan dnia bez treningu / pomiaru (np. Regeneracja, Rekompozycja, Adaptacja, Redukcja, Superkompensacja)"
}
Bez znaczników markdown.`;

    const raw = await callGemini(prompt, 'fast');
    const parsed = extractJsonFromGemini(raw);
    if (!STATE.calendarAiSummaries) STATE.calendarAiSummaries = {};
    STATE.calendarAiSummaries[dateKey] = {
      workoutSummary: parsed.workoutSummary || null,
      oneWordStatus: String(parsed.oneWordStatus || 'Regeneracja').trim().split(/\s+/)[0],
      updatedAt: Date.now()
    };
    localStorage.setItem('iron_calendar_ai_summaries', JSON.stringify(STATE.calendarAiSummaries));
    if (STATE.selectedCalendarDate === dateKey) {
      renderCalendarDaySummaryCard(dateKey);
    }
  } catch (e) {
    console.warn('Calendar AI summary error:', e);
    if (force) alert('Błąd generowania podsumowania AI: ' + e.message);
  } finally {
    pendingCalendarAiDates.delete(dateKey);
  }
}

// ============================================================================
// MODULE 6: AUTOMATIC GOOGLE DRIVE BACKUP (Morning Trigger on First App Open)
// ============================================================================
function loadGoogleDriveConfig() {
  const whInput = document.getElementById('gdrive-webhook-url');
  const tokInput = document.getElementById('gdrive-oauth-token');
  const statusEl = document.getElementById('gdrive-last-backup-status');

  if (whInput) whInput.value = STATE.gdriveWebhookUrl || '';
  const secInput = document.getElementById('gdrive-webhook-secret');
  if (secInput) secInput.value = STATE.gdriveWebhookSecret || '';
  if (tokInput) tokInput.value = STATE.gdriveOauthToken || '';

  const lastDate = localStorage.getItem('iron_last_morning_backup_date') || 'Brak';
  const lastMode = localStorage.getItem('iron_last_morning_backup_mode') || 'lokalny snapshot';
  if (statusEl) {
    statusEl.innerHTML = `📅 Ostatni poranny auto-backup: <b style="color: var(--success);">${escapeHtml(lastDate)}</b> (${escapeHtml(lastMode)}) • Zakres: <b>${(STATE.history || []).length}</b> sesji, <b>${(STATE.bodyMeasurements || []).length}</b> pomiarów ciała, analizy Gemini.`;
  }
}

function saveGoogleDriveConfig() {
  const wh = (document.getElementById('gdrive-webhook-url')?.value || '').trim();
  const tok = (document.getElementById('gdrive-oauth-token')?.value || '').trim();
  const sec = (document.getElementById('gdrive-webhook-secret')?.value || '').trim();
  STATE.gdriveWebhookUrl = wh;
  STATE.gdriveWebhookSecret = sec;
  localStorage.setItem('iron_gdrive_webhook_secret', sec);
  STATE.gdriveOauthToken = tok;
  localStorage.setItem('iron_gdrive_webhook_url', wh);
  localStorage.setItem('iron_gdrive_oauth_token', tok);
  loadGoogleDriveConfig();
  alert('✅ Zapisano konfigurację automatycznego backupu Google Drive!');
}

function toggleSecretVisibility() {
  const input = document.getElementById('gdrive-webhook-secret');
  if (!input) return;
  input.type = input.type === 'password' ? 'text' : 'password';
}

function dismissMorningBackupBanner() {
  const banner = document.getElementById('morning-backup-banner');
  if (banner) banner.style.display = 'none';
}

async function checkMorningAutoBackup() {
  const todayIso = getIsoDateFromTimestamp(Date.now());
  const lastBackupDate = localStorage.getItem('iron_last_morning_backup_date');

  // Trigger once every day upon the first opening of the application
  if (lastBackupDate === todayIso) {
    loadGoogleDriveConfig();
    return;
  }

  const backupObj = buildFullBackupObject();
  try {
    localStorage.setItem('iron_morning_auto_snapshot', JSON.stringify(backupObj));
    localStorage.setItem('iron_last_morning_backup_date', todayIso);
  } catch (e) {
    console.warn('Morning local snapshot storage warning:', e);
  }

  const banner = document.getElementById('morning-backup-banner');
  const subText = document.getElementById('morning-backup-banner-text');

  if (STATE.gdriveWebhookUrl || STATE.gdriveOauthToken) {
    const res = await uploadBackupToGoogleDrive(backupObj, true);
    if (res.ok) {
      localStorage.setItem('iron_last_morning_backup_mode', 'Google Drive Cloud');
      if (banner && subText) {
        subText.textContent = `Przesłano automatycznie pełny backup (${todayIso}) na Twój Google Drive.`;
        banner.style.display = 'block';
      }
    } else {
      localStorage.setItem('iron_last_morning_backup_mode', 'Snapshot + gotowy do wysłania');
      if (banner && subText) {
        subText.textContent = `Utworzono poranny backup (${todayIso}). Kliknij „Wyślij na Drive”, aby zapisać w chmurze.`;
        banner.style.display = 'block';
      }
    }
  } else {
    localStorage.setItem('iron_last_morning_backup_mode', 'Gotowy poranny snapshot');
    if (banner && subText) {
      subText.textContent = `Przygotowano poranny backup z dnia ${todayIso} (sesje, ciężary, pomiary i analizy Gemini).`;
      banner.style.display = 'block';
    }
  }

  loadGoogleDriveConfig();
}

async function uploadBackupToGoogleDrive(backupObj, silent = false) {
  const fileName = `ironcoach-auto-backup-${getIsoDateFromTimestamp(Date.now())}.json`;
  const jsonContent = JSON.stringify(backupObj, null, 2);

  // 1. If Google Apps Script Webhook URL is configured, POST directly (no OAuth expiration issues)
  if (STATE.gdriveWebhookUrl) {
    const trimmedSecret = String(STATE.gdriveWebhookSecret || '').trim();
    if (!trimmedSecret) {
      return { ok: false, error: 'Brak wpisanego tajnego klucza webhooka w Opcjach aplikacji (wklej ten sam klucz co SECRET_KEY we Właściwościach projektu w Apps Script).' };
    }
    try {
      // Apps Script: { secret, payload } -> odpowiedź JSON { status: "success" | "error" }
      const response = await fetch(STATE.gdriveWebhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({
          secret: trimmedSecret,
          payload: backupObj
        })
      });
      if (response.ok) {
        const result = await response.json().catch(() => null);
        if (result && result.status === 'success') {
          return { ok: true, method: 'webhook' };
        }
        console.warn('Webhook rejected:', result && result.message);
        return { ok: false, error: (result && result.message) || 'Nieprawidłowa odpowiedź skryptu (sprawdź czy klucz SECRET_KEY jest zgodny)' };
      } else {
        return { ok: false, error: `Błąd serwera Google: HTTP ${response.status}` };
      }
    } catch (e) {
      console.warn('Webhook upload failed:', e);
      return {
        ok: false,
        error: `Błąd połączenia z Google Apps Script: ${e.message || e}\n\n👉 Najczęstsza przyczyna: W ustawieniach wdrożenia Apps Script opcja "Kto ma dostęp (Who has access)" NIE jest ustawiona na "Każdy (Anyone)". Jeśli jest ustawione "Tylko ja", Google blokuje telefon!`
      };
    }
  }

  // 2. If Google Drive REST API OAuth Token is configured, upload via multipart Drive v3 API
  if (STATE.gdriveOauthToken) {
    try {
      const metadata = {
        name: fileName,
        mimeType: 'application/json',
        description: 'Automatyczny backup IronCoach AI (sesje, obciążenia, pomiary, analizy Gemini)'
      };
      const boundary = '-------IronCoachDriveBoundary' + Date.now();
      const body =
        `--${boundary}\r\n` +
        `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
        `${JSON.stringify(metadata)}\r\n` +
        `--${boundary}\r\n` +
        `Content-Type: application/json\r\n\r\n` +
        `${jsonContent}\r\n` +
        `--${boundary}--`;

      const res = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${STATE.gdriveOauthToken}`,
          'Content-Type': `multipart/related; boundary=${boundary}`
        },
        body: body
      });
      if (res.ok) {
        return { ok: true, method: 'oauth' };
      }
    } catch (e) {
      console.warn('Drive API upload failed:', e);
    }
  }

  if (!silent) {
    return { ok: false };
  }
  return { ok: false };
}

async function triggerGoogleDriveBackupNow() {
  // Sync whatever is currently typed in the input fields if user didn't hit 'Zapisz konfigurację' yet
  const whInput = document.getElementById('gdrive-webhook-url');
  const secInput = document.getElementById('gdrive-webhook-secret');
  if (whInput && whInput.value.trim()) {
    STATE.gdriveWebhookUrl = whInput.value.trim();
    localStorage.setItem('iron_gdrive_webhook_url', STATE.gdriveWebhookUrl);
  }
  if (secInput && secInput.value.trim()) {
    STATE.gdriveWebhookSecret = secInput.value.trim();
    localStorage.setItem('iron_gdrive_webhook_secret', STATE.gdriveWebhookSecret);
  }

  const backupObj = buildFullBackupObject();
  const todayIso = getIsoDateFromTimestamp(Date.now());
  localStorage.setItem('iron_morning_auto_snapshot', JSON.stringify(backupObj));
  localStorage.setItem('iron_last_morning_backup_date', todayIso);

  if (STATE.gdriveWebhookUrl || STATE.gdriveOauthToken) {
    const res = await uploadBackupToGoogleDrive(backupObj, false);
    if (res.ok) {
      localStorage.setItem('iron_last_morning_backup_mode', 'Google Drive Cloud');
      loadGoogleDriveConfig();
      dismissMorningBackupBanner();
      alert('✅ Sukces! Pełny backup został zapisany na Google Drive w folderze "IronCoach Backups"!');
      return;
    } else {
      alert(`⚠️ Nie udało się przesłać pliku do Google Drive:\n\n${res.error || 'Nieznany błąd serwera'}`);
      if (!confirm('Czy chcesz zamiast tego pobrać/zapisać plik kopii zapasowej lokalnie na urządzeniu?')) {
        return;
      }
    }
  } else {
    alert('ℹ️ Nie skonfigurowano jeszcze Webhooka Google Drive. Wklej URL skryptu oraz tajny klucz w sekcji poniżej.');
  }

  // Fallback to mobile native Share Sheet (allows 1-tap "Save to Google Drive" on Android/iOS) or file download
  await shareBackupToGoogleDriveApp();
}

async function shareBackupToGoogleDriveApp() {
  const backupObj = buildFullBackupObject();
  const todayIso = getIsoDateFromTimestamp(Date.now());
  const fileName = `ironcoach-backup-${todayIso}.json`;
  const jsonStr = JSON.stringify(backupObj, null, 2);

  localStorage.setItem('iron_last_morning_backup_date', todayIso);
  localStorage.setItem('iron_last_morning_backup_mode', 'Udostępniono do Google Drive');
  loadGoogleDriveConfig();
  dismissMorningBackupBanner();

  try {
    const file = new File([jsonStr], fileName, { type: 'application/json' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({
        title: `IronCoach Backup (${todayIso})`,
        text: 'Kopia zapasowa IronCoach AI (historia sesji, ciężary, pomiary ciała i analizy Gemini)',
        files: [file]
      });
      return;
    }
  } catch (e) {
    if (e && e.name === 'AbortError') return;
  }

  // Standard download fallback if Web Share API is not supported on desktop
  exportDataJson();
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
