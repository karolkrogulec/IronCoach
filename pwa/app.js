// IronCoach AI - Mobile PWA Engine

const STATE = {
  plans: JSON.parse(localStorage.getItem('iron_plans')) || [
    {
      id: 'default-1',
      name: 'Push (Klatka + Barki + Triceps)',
      description: 'Przykładowy plan demonstracyjny',
      exercises: [
        { name: 'Wyciskanie sztangi leżąc', sets: 4, reps: 8, weight: 80, muscle: 'Klatka' },
        { name: 'Wyciskanie hantli skos dodatni', sets: 3, reps: 10, weight: 26, muscle: 'Klatka' },
        { name: 'Wyciskanie żołnierskie OHP', sets: 3, reps: 8, weight: 50, muscle: 'Barki' },
        { name: 'Wznosy bokiem na bramie', sets: 3, reps: 12, weight: 12, muscle: 'Barki' },
        { name: 'Prostowanie ramion na wyciągu', sets: 3, reps: 12, weight: 30, muscle: 'Triceps' }
      ]
    }
  ],
  history: JSON.parse(localStorage.getItem('iron_history')) || [],
  activeWorkout: JSON.parse(localStorage.getItem('iron_active_workout')) || null,
  apiKey: localStorage.getItem('iron_gemini_api_key') || '',
  timerInterval: null,
  timerSeconds: 0,
  parsedKeepPlan: null
};

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  registerServiceWorker();
  checkSharedParams();
  loadApiKey();
  renderPlans();
  renderRecentWorkouts();
  checkActiveWorkout();
});

// PWA Service Worker
function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(console.error);
  }
}

// Navigation
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

// Handle Android Share Target from Google Keep
function checkSharedParams() {
  const params = new URLSearchParams(window.location.search);
  const sharedText = params.get('text') || params.get('title');
  if (sharedText) {
    const keepInput = document.getElementById('keep-text-input');
    if (keepInput) keepInput.value = sharedText;
    showView('import-keep');
  }
}

// Render Workout Plans on Dashboard
function renderPlans() {
  const container = document.getElementById('plans-list');
  if (!container) return;

  if (STATE.plans.length === 0) {
    container.innerHTML = `<p style="color: var(--text-muted); font-size: 14px;">Brak planów. Zaimportuj notatkę z Keep lub kliknij 'Nowy Plan'!</p>`;
    return;
  }

  container.innerHTML = STATE.plans.map(plan => `
    <div class="card">
      <div class="card-title">
        <span>${escapeHtml(plan.name)}</span>
        <button class="btn btn-sm btn-primary" onclick="startWorkout('${plan.id}')">▶ Start</button>
      </div>
      <p style="color: var(--text-muted); font-size: 13px; margin-bottom: 8px;">
        ${plan.exercises.length} ćwiczeń • ${escapeHtml(plan.description || '')}
      </p>
      <div style="display: flex; gap: 8px; justify-content: flex-end;">
        <button class="btn btn-sm btn-secondary" onclick="openEditPlanModal('${plan.id}')">✏️ Edytuj</button>
        <button class="btn btn-sm btn-secondary" style="color: var(--danger); border-color: rgba(255,82,82,0.3);" onclick="deletePlan('${plan.id}')">🗑️ Usuń</button>
      </div>
    </div>
  `).join('');
}

// Render Recent Completed Workouts
function renderRecentWorkouts() {
  const container = document.getElementById('recent-workouts-list');
  if (!container) return;

  if (STATE.history.length === 0) {
    container.innerHTML = `<p style="color: var(--text-muted); font-size: 13px;">Brak zakończonych treningów.</p>`;
    return;
  }

  container.innerHTML = STATE.history.slice(0, 10).map(session => `
    <div class="card">
      <div class="card-title" style="font-size: 15px;">
        <span>${escapeHtml(session.planName)}</span>
        <span class="badge badge-cyan">${session.totalVolumeKg} kg</span>
      </div>
      <p style="color: var(--text-muted); font-size: 12px; margin-bottom: 8px;">
        ${new Date(session.endTime).toLocaleString('pl-PL')} • ${session.completedSets} serii
      </p>
      <div style="display: flex; gap: 8px; justify-content: flex-end;">
        <button class="btn btn-sm btn-secondary" onclick="viewHistoryReport('${session.id}')">📄 Raport AI</button>
        <button class="btn btn-sm btn-secondary" style="color: var(--danger); border-color: rgba(255,82,82,0.3);" onclick="deleteHistorySession('${session.id}')">Usuń</button>
      </div>
    </div>
  `).join('');
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

// Start Workout Session
function startWorkout(planId) {
  const plan = STATE.plans.find(p => p.id === planId);
  if (!plan) return;

  const exercises = plan.exercises.map(ex => {
    const sets = [];
    for (let i = 1; i <= (ex.sets || 3); i++) {
      sets.push({
        num: i,
        weight: ex.weight || 0,
        reps: ex.reps || 10,
        completed: false
      });
    }
    return { name: ex.name, muscle: ex.muscle || 'Inne', sets };
  });

  STATE.activeWorkout = {
    id: 'session-' + Date.now(),
    planId: plan.id,
    planName: plan.name,
    startTime: Date.now(),
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
  } else {
    banner.style.display = 'none';
  }
}

function resumeActiveWorkout() {
  if (STATE.activeWorkout) {
    loadActiveWorkoutUI();
    showView('active-workout');
  }
}

function loadActiveWorkoutUI() {
  if (!STATE.activeWorkout) return;
  document.getElementById('workout-plan-title').textContent = STATE.activeWorkout.planName;
  renderActiveExercises();
  updateWorkoutStats();
}

function renderActiveExercises() {
  const container = document.getElementById('workout-exercises-container');
  if (!container || !STATE.activeWorkout) return;

  container.innerHTML = STATE.activeWorkout.exercises.map((ex, exIdx) => `
    <div class="exercise-block">
      <div class="exercise-header">
        <span class="exercise-title">${escapeHtml(ex.name)}</span>
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
  `).join('');
}

function updateSetData(exIdx, sIdx, field, val) {
  if (!STATE.activeWorkout) return;
  STATE.activeWorkout.exercises[exIdx].sets[sIdx][field] = parseFloat(val) || 0;
  saveActiveWorkout();
  updateWorkoutStats();
}

function toggleSetComplete(exIdx, sIdx) {
  if (!STATE.activeWorkout) return;
  const set = STATE.activeWorkout.exercises[exIdx].sets[sIdx];
  set.completed = !set.completed;
  saveActiveWorkout();
  renderActiveExercises();
  updateWorkoutStats();

  if (set.completed) {
    if (navigator.vibrate) navigator.vibrate(50);
    startRestTimer(90);
  }
}

function addSetToExercise(exIdx) {
  if (!STATE.activeWorkout) return;
  const ex = STATE.activeWorkout.exercises[exIdx];
  const last = ex.sets[ex.sets.length - 1];
  ex.sets.push({
    num: ex.sets.length + 1,
    weight: last ? last.weight : 0,
    reps: last ? last.reps : 10,
    completed: false
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
}

// Rest Timer
function startRestTimer(seconds) {
  clearInterval(STATE.timerInterval);
  STATE.timerSeconds = seconds;
  const bar = document.getElementById('rest-timer-bar');
  const display = document.getElementById('timer-display');
  if (bar) bar.style.display = 'flex';

  const updateDisplay = () => {
    if (display) display.textContent = `${STATE.timerSeconds}s`;
  };
  updateDisplay();

  STATE.timerInterval = setInterval(() => {
    STATE.timerSeconds--;
    if (STATE.timerSeconds <= 0) {
      stopTimer();
      if (navigator.vibrate) navigator.vibrate([100, 50, 100]);
    } else {
      updateDisplay();
    }
  }, 1000);
}

function addTimerSeconds(secs) {
  STATE.timerSeconds += secs;
  const display = document.getElementById('timer-display');
  if (display) display.textContent = `${STATE.timerSeconds}s`;
}

function stopTimer() {
  clearInterval(STATE.timerInterval);
  const bar = document.getElementById('rest-timer-bar');
  if (bar) bar.style.display = 'none';
}

// Finish Workout Session
async function finishCurrentWorkout() {
  if (!STATE.activeWorkout) return;
  stopTimer();

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
          setNum: s.num,
          weight: s.weight,
          reps: s.reps
        });
      }
    });
  });

  const session = {
    id: STATE.activeWorkout.id,
    planName: STATE.activeWorkout.planName,
    startTime: STATE.activeWorkout.startTime,
    endTime: Date.now(),
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

  // Switch to Coach View and trigger Gemini feedback
  showView('coach');
  triggerCoachAnalysis(session);
}

// Gemini AI Integration
async function callGemini(prompt) {
  const key = STATE.apiKey.trim();
  if (!key) {
    alert('Podaj klucz Gemini API w zakładce Ustawienia!');
    showView('settings');
    throw new Error('Missing API Key');
  }

  // 1. Fetch available models for this specific API key
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

  // 2. Build list of actual available models, sorted by best choice
  let modelsToTry = [];
  if (availableModels.length > 0) {
    // Put flash first, then pro, then the rest
    const flashModels = availableModels.filter(m => m.includes('flash'));
    const proModels = availableModels.filter(m => m.includes('pro') && !m.includes('flash'));
    const others = availableModels.filter(m => !m.includes('flash') && !m.includes('pro'));
    modelsToTry = [...flashModels, ...proModels, ...others];
  } else {
    // If listing failed, try standard Gemini 1.5 endpoints
    modelsToTry = ['gemini-1.5-flash-latest', 'gemini-1.5-flash', 'gemini-1.5-pro', 'gemini-1.0-pro'];
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

// Parse Note from Google Keep (supports single or multiple plans in one note)
async function parseKeepWithGemini() {
  const rawText = document.getElementById('keep-text-input').value.trim();
  if (!rawText) return alert('Wklej najpierw treść notatki z Keep!');

  const loading = document.getElementById('keep-parse-loading');
  const preview = document.getElementById('parsed-plan-preview');
  loading.style.display = 'block';
  preview.style.display = 'none';

  const prompt = `
Jesteś ekspertem treningu siłowego. Przekształć poniższą notatkę z Google Keep w strukturę planów treningowych.
Uwaga: W notatce może znajdować się JEDEN lub KILKA planów (np. Dzień 1 / Dzień 2, lub Push / Pull / Legs, lub osobne bloki treningowe).
Zwróć WYŁĄCZNIE poprawny format JSON (tablicę planów):
[
  {
    "name": "Nazwa planu (np. Trening A: Klatka i Triceps)",
    "description": "Krótki opis lub data",
    "exercises": [
      {
        "name": "Nazwa ćwiczenia",
        "muscle": "Partia (Klatka, Plecy, Nogi, Barki, Ramiona, Brzuch)",
        "sets": 3,
        "reps": 10,
        "weight": 80
      }
    ]
  }
]

Zasady:
1. Zawsze zwróć tablicę JSON, nawet jeśli notatka ma tylko 1 plan (wtedy tablica z 1 elementem).
2. Jeśli w notatce jest kilka dni treningowych/superserii z osobnymi dniami, stwórz osobny obiekt planu dla każdego z nich.
3. Bez żadnych dodatkowych komentarzy i bez znaczników markdown.

Treść notatki:
"""
${rawText}
"""`;

  try {
    const rawResponse = await callGemini(prompt);
    const cleaned = rawResponse.replace(/```json/g, '').replace(/```/g, '').trim();
    let parsed = JSON.parse(cleaned);

    // Normalize: if Gemini returned a single object instead of array, wrap it
    if (!Array.isArray(parsed)) {
      parsed = [parsed];
    }

    STATE.parsedKeepPlans = parsed;

    // Render preview of all recognized plans
    const previewContainer = document.getElementById('preview-exercises-list');
    document.getElementById('preview-plan-name').textContent = `Rozpoznano planów: ${parsed.length}`;

    previewContainer.innerHTML = parsed.map((p, idx) => `
      <div style="margin-bottom: 14px; padding: 10px; background: var(--surface-elevated); border-radius: 8px;">
        <div style="font-weight: 800; font-size: 15px; color: var(--primary); margin-bottom: 6px;">
          ${idx + 1}. ${escapeHtml(p.name || 'Plan')}
        </div>
        ${(p.exercises || []).map(ex => `
          <div style="display: flex; justify-content: space-between; padding: 4px 0; border-bottom: 1px solid var(--border); font-size: 13px;">
            <span><b>${escapeHtml(ex.name)}</b> (${ex.muscle || 'Inne'})</span>
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
      exercises: p.exercises || []
    });
  });

  localStorage.setItem('iron_plans', JSON.stringify(STATE.plans));
  renderPlans();
  alert(`Zapisano pomyślnie ${STATE.parsedKeepPlans.length} plan(ów)!`);
  showView('home');
}

// Modal for adding / editing plans
let editingPlanId = null;

function openNewPlanModal() {
  editingPlanId = null;
  document.getElementById('plan-modal-title').textContent = 'Nowy Plan Treningowy';
  document.getElementById('modal-plan-name').value = '';
  document.getElementById('modal-plan-desc').value = '';
  document.getElementById('modal-exercises-list').innerHTML = '';
  addModalExerciseRow('Wyciskanie sztangi leżąc', 4, 8, 80);
  addModalExerciseRow('Wyciskanie hantli skos', 3, 10, 26);
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
  
  const listEl = document.getElementById('modal-exercises-list');
  listEl.innerHTML = '';
  (plan.exercises || []).forEach(ex => {
    addModalExerciseRow(ex.name, ex.sets, ex.reps, ex.weight);
  });
  if ((plan.exercises || []).length === 0) {
    addModalExerciseRow('', 3, 10, 0);
  }

  const modal = document.getElementById('plan-modal');
  modal.style.display = 'flex';
}

function closePlanModal() {
  const modal = document.getElementById('plan-modal');
  modal.style.display = 'none';
}

function addModalExerciseRow(name = '', sets = 3, reps = 10, weight = 0) {
  const listEl = document.getElementById('modal-exercises-list');
  const row = document.createElement('div');
  row.className = 'modal-ex-row';
  row.style.cssText = 'display: grid; grid-template-columns: 1fr 50px 50px 60px 30px; gap: 6px; align-items: center; margin-bottom: 8px;';
  row.innerHTML = `
    <input type="text" class="input-box modal-ex-name" style="text-align: left; font-size: 13px;" placeholder="Ćwiczenie" value="${escapeHtml(name)}">
    <input type="number" class="input-box modal-ex-sets" placeholder="Ser" value="${sets}" title="Serie">
    <input type="number" class="input-box modal-ex-reps" placeholder="Powt" value="${reps}" title="Powtórzenia">
    <input type="number" step="0.5" class="input-box modal-ex-weight" placeholder="kg" value="${weight}" title="Ciężar (kg)">
    <button type="button" style="background: none; border: none; color: var(--danger); font-size: 16px; cursor: pointer;" onclick="this.parentElement.remove()">✕</button>
  `;
  listEl.appendChild(row);
}

function saveModalPlan() {
  const name = document.getElementById('modal-plan-name').value.trim();
  if (!name) return alert('Podaj nazwę planu!');
  const desc = document.getElementById('modal-plan-desc').value.trim();

  const rows = document.querySelectorAll('#modal-exercises-list .modal-ex-row');
  const exercises = [];
  rows.forEach(r => {
    const exName = r.querySelector('.modal-ex-name').value.trim();
    const sets = parseInt(r.querySelector('.modal-ex-sets').value) || 3;
    const reps = parseInt(r.querySelector('.modal-ex-reps').value) || 10;
    const weight = parseFloat(r.querySelector('.modal-ex-weight').value) || 0;
    if (exName) {
      exercises.push({ name: exName, sets, reps, weight, muscle: 'Ogólne' });
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
      STATE.plans[idx].exercises = exercises;
    }
  } else {
    STATE.plans.push({
      id: 'plan-' + Date.now(),
      name: name,
      description: desc,
      exercises: exercises
    });
  }

  localStorage.setItem('iron_plans', JSON.stringify(STATE.plans));
  renderPlans();
  closePlanModal();
}

// Coach Analysis
async function triggerCoachAnalysis(session) {
  const loading = document.getElementById('coach-loading');
  const reportBox = document.getElementById('coach-report-content');
  loading.style.display = 'block';
  reportBox.style.display = 'none';

  const setsSummary = session.sets.map(s => `${s.exercise}: S${s.setNum} ${s.weight}kg x ${s.reps}`).join('\n');
  const prompt = `
Działasz jako doświadczony trener siłowy i analityk periodyzacji w aplikacji IronCoach.
Właśnie zakończył się trening użytkownika:
Plan: ${session.planName}
Całkowity tonaż: ${session.totalVolumeKg} kg
Ukończone serie: ${session.completedSets}
Szczegóły serii:
${setsSummary}

Przygotuj krótką, merytoryczną analizę w języku polskim:
1. 📊 Ocena objętości i tonażu sesji.
2. 🎯 Wskazówka na kolejny trening (Progresywne przeładowanie - np. do jakich ćwiczeń dodać ciężar lub powtórzenia).
3. ⚡ Krótka uwaga o regeneracji.
Bądź konkretny i zwięzły.`;

  try {
    const feedback = await callGemini(prompt);
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
  const q = document.getElementById('coach-question-input').value.trim();
  if (!q) return;

  const ansBox = document.getElementById('coach-answer-box');
  ansBox.style.display = 'block';
  ansBox.textContent = 'Trener myśli... 🧠';

  try {
    const ans = await callGemini(`Jesteś trenerem personalnym siłowym w aplikacji IronCoach. Odpowiedz krótko i konkretnie po polsku na pytanie: ${q}`);
    ansBox.innerHTML = formatMarkdown(ans);
  } catch (err) {
    ansBox.textContent = 'Błąd: ' + err.message;
  }
}

// API Key & Settings
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
    plans: STATE.plans,
    history: STATE.history,
    exportedAt: new Date().toISOString()
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
      if (data.plans) STATE.plans = data.plans;
      if (data.history) STATE.history = data.history;
      localStorage.setItem('iron_plans', JSON.stringify(STATE.plans));
      localStorage.setItem('iron_history', JSON.stringify(STATE.history));
      renderPlans();
      renderRecentWorkouts();
      alert('Dane zostały pomyślnie zaimportowane!');
    } catch {
      alert('Niepoprawny plik JSON!');
    }
  };
  reader.readAsText(file);
}

// Helpers
function saveActiveWorkout() {
  localStorage.setItem('iron_active_workout', JSON.stringify(STATE.activeWorkout));
  checkActiveWorkout();
}

function deletePlan(id) {
  if (!confirm('Czy na pewno chcesz usunąć ten plan?')) return;
  STATE.plans = STATE.plans.filter(p => p.id !== id);
  localStorage.setItem('iron_plans', JSON.stringify(STATE.plans));
  renderPlans();
}

function escapeHtml(str) {
  return (str || '').replace(/[&<>'"]/g, tag => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
  }[tag] || tag));
}

function formatMarkdown(text) {
  return (text || '')
    .replace(/\*\*(.*?)\*\*/g, '<b>$1</b>')
    .replace(/\*(.*?)\*/g, '<i>$1</i>')
    .replace(/\n/g, '<br>');
}
