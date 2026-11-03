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
    container.innerHTML = `<p style="color: var(--text-muted); font-size: 14px;">Brak planów. Zaimportuj notatkę z Keep!</p>`;
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
        <button class="btn btn-sm btn-secondary" onclick="deletePlan('${plan.id}')">Usuń</button>
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

  container.innerHTML = STATE.history.slice(0, 5).map(session => `
    <div class="card" onclick="openSessionDetails('${session.id}')" style="cursor: pointer;">
      <div class="card-title" style="font-size: 15px;">
        <span>${escapeHtml(session.planName)}</span>
        <span class="badge badge-cyan">${session.totalVolumeKg} kg</span>
      </div>
      <p style="color: var(--text-muted); font-size: 12px;">
        ${new Date(session.endTime).toLocaleString('pl-PL')} • ${session.completedSets} serii
      </p>
    </div>
  `).join('');
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

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${key}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }]
    })
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error?.message || `HTTP ${response.status}`);
  }

  const data = await response.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
}

// Parse Note from Google Keep
async function parseKeepWithGemini() {
  const rawText = document.getElementById('keep-text-input').value.trim();
  if (!rawText) return alert('Wklej najpierw treść notatki z Keep!');

  const loading = document.getElementById('keep-parse-loading');
  const preview = document.getElementById('parsed-plan-preview');
  loading.style.display = 'block';
  preview.style.display = 'none';

  const prompt = `
Jesteś ekspertem treningu siłowego. Przekształć poniższą notatkę z Google Keep w czysty format JSON.
Zwróć WYŁĄCZNIE poprawny JSON (bez żadnego formatowania markdown \`\`\`json):
{
  "name": "Nazwa planu (np. Klatka + Triceps)",
  "description": "Krótki opis",
  "exercises": [
    {
      "name": "Nazwa ćwiczenia",
      "muscle": "Partia (Klatka, Plecy, Nogi, Barki, Ramiona)",
      "sets": 3,
      "reps": 10,
      "weight": 80
    }
  ]
}

Treść notatki:
"""
${rawText}
"""`;

  try {
    const rawResponse = await callGemini(prompt);
    const cleaned = rawResponse.replace(/```json/g, '').replace(/```/g, '').trim();
    const parsed = JSON.parse(cleaned);

    STATE.parsedKeepPlan = parsed;
    document.getElementById('preview-plan-name').textContent = parsed.name || 'Nowy Plan';
    document.getElementById('preview-exercises-list').innerHTML = (parsed.exercises || []).map(ex => `
      <div style="display: flex; justify-content: space-between; padding: 6px 0; border-bottom: 1px solid var(--border); font-size: 13px;">
        <span><b>${escapeHtml(ex.name)}</b> (${ex.muscle})</span>
        <span>${ex.sets}x${ex.reps} ${ex.weight ? ex.weight + 'kg' : ''}</span>
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
  if (!STATE.parsedKeepPlan) return;
  const newPlan = {
    id: 'plan-' + Date.now(),
    name: STATE.parsedKeepPlan.name || 'Plan z Keep',
    description: STATE.parsedKeepPlan.description || '',
    exercises: STATE.parsedKeepPlan.exercises || []
  };

  STATE.plans.push(newPlan);
  localStorage.setItem('iron_plans', JSON.stringify(STATE.plans));
  renderPlans();
  alert('Plan został pomyślnie zapisany w aplikacji!');
  showView('home');
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
