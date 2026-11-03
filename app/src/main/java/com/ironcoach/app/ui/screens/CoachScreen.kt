package com.ironcoach.app.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.ironcoach.app.IronCoachApp
import com.ironcoach.app.data.gemini.SessionAnalysisRequest
import com.ironcoach.app.data.gemini.SessionSetSummary
import com.ironcoach.app.ui.theme.GeminiCyan
import com.ironcoach.app.ui.theme.NeonAmber
import com.ironcoach.app.ui.theme.SurfaceElevated
import kotlinx.coroutines.launch

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun CoachScreen(
    sessionId: Long,
    onNavigateBack: () -> Unit,
    onNavigateToHome: () -> Unit,
    onNavigateToSettings: () -> Unit
) {
    val repository = remember { IronCoachApp.instance.workoutRepository }
    val geminiService = remember { IronCoachApp.instance.geminiService }
    val userPrefs = remember { IronCoachApp.instance.userPreferencesRepository }
    val scope = rememberCoroutineScope()

    val apiKey by userPrefs.geminiApiKey.collectAsState(initial = "")
    val session by repository.getSessionFlow(sessionId).collectAsState(initial = null)
    val sets by repository.getSetsForSession(sessionId).collectAsState(initial = emptyList())

    var isAnalyzing by remember { mutableStateOf(false) }
    var coachFeedback by remember { mutableStateOf<String?>(null) }
    var userQuestion by remember { mutableStateOf("") }
    var coachAnswer by remember { mutableStateOf<String?>(null) }
    var isAnsweringQuestion by remember { mutableStateOf(false) }

    LaunchedEffect(session?.coachFeedback) {
        if (!session?.coachFeedback.isNullOrBlank()) {
            coachFeedback = session?.coachFeedback
        }
    }

    // Auto-trigger analysis if not yet generated and apiKey is set
    LaunchedEffect(session, apiKey) {
        val currentSession = session
        if (currentSession != null && currentSession.coachFeedback.isNullOrBlank() && coachFeedback == null && apiKey.isNotBlank() && !isAnalyzing) {
            isAnalyzing = true
            val durationMinutes = if (currentSession.endTimeMs != null) {
                ((currentSession.endTimeMs - currentSession.startTimeMs) / 60000).coerceAtLeast(1)
            } else 45

            val summaries = sets.filter { it.isCompleted }.map {
                SessionSetSummary(
                    exerciseName = it.exerciseName,
                    setNumber = it.setNumber,
                    weightKg = it.weightKg,
                    reps = it.reps,
                    rpe = it.rpe
                )
            }

            val request = SessionAnalysisRequest(
                planName = currentSession.planName,
                durationMinutes = durationMinutes,
                totalVolumeKg = currentSession.totalVolumeKg,
                sets = summaries,
                userNotes = currentSession.notes
            )

            val result = geminiService.analyzeWorkoutSession(request, apiKey)
            result.fold(
                onSuccess = { feedback ->
                    coachFeedback = feedback
                    repository.updateSessionFeedback(sessionId, feedback)
                    isAnalyzing = false
                },
                onFailure = {
                    isAnalyzing = false
                }
            )
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Icon(Icons.Default.AutoAwesome, contentDescription = null, tint = GeminiCyan)
                        Spacer(modifier = Modifier.width(8.dp))
                        Text("Trener Gemini AI", fontWeight = FontWeight.Bold)
                    }
                },
                navigationIcon = {
                    IconButton(onClick = onNavigateBack) {
                        Icon(Icons.Default.ArrowBack, contentDescription = "Wstecz")
                    }
                },
                actions = {
                    IconButton(onClick = onNavigateToHome) {
                        Icon(Icons.Default.Home, contentDescription = "Pulpit")
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = MaterialTheme.colorScheme.background
                )
            )
        }
    ) { padding ->
        LazyColumn(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .padding(horizontal = 16.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            // Stats Header
            session?.let { current ->
                item {
                    Card(
                        modifier = Modifier.fillMaxWidth(),
                        shape = RoundedCornerShape(16.dp),
                        colors = CardDefaults.cardColors(containerColor = SurfaceElevated)
                    ) {
                        Column(modifier = Modifier.padding(16.dp)) {
                            Text(
                                text = "Podsumowanie: ${current.planName}",
                                fontSize = 18.sp,
                                fontWeight = FontWeight.Bold
                            )
                            Spacer(modifier = Modifier.height(10.dp))
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.SpaceBetween
                            ) {
                                Column {
                                    Text("Tonaż sesji", fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                                    Text("${current.totalVolumeKg.toInt()} kg", fontSize = 20.sp, fontWeight = FontWeight.Bold, color = NeonAmber)
                                }
                                Column {
                                    Text("Ukończone serie", fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                                    Text("${current.totalSetsCompleted}", fontSize = 20.sp, fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.onSurface)
                                }
                                Column {
                                    Text("Czas trwania", fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                                    val mins = if (current.endTimeMs != null) ((current.endTimeMs - current.startTimeMs) / 60000).coerceAtLeast(1) else 0
                                    Text("${mins} min", fontSize = 20.sp, fontWeight = FontWeight.Bold, color = GeminiCyan)
                                }
                            }
                        }
                    }
                }
            }

            // Gemini Feedback Section
            item {
                Card(
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(16.dp),
                    colors = CardDefaults.cardColors(containerColor = SurfaceElevated)
                ) {
                    Column(modifier = Modifier.padding(16.dp)) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Icon(Icons.Default.Psychology, contentDescription = null, tint = GeminiCyan)
                            Spacer(modifier = Modifier.width(8.dp))
                            Text(
                                text = "Analiza & Periodyzacja Trenera",
                                fontWeight = FontWeight.Bold,
                                fontSize = 17.sp,
                                color = GeminiCyan
                            )
                        }

                        Spacer(modifier = Modifier.height(12.dp))

                        if (apiKey.isBlank()) {
                            Text(
                                text = "Podaj klucz Gemini API w ustawieniach, aby otrzymać automatyczną analizę progresu i sugestie obciążeń.",
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                            Spacer(modifier = Modifier.height(8.dp))
                            Button(
                                onClick = onNavigateToSettings,
                                colors = ButtonDefaults.buttonColors(containerColor = GeminiCyan)
                            ) {
                                Text("Wprowadź klucz API", color = Color.Black)
                            }
                        } else if (isAnalyzing) {
                            Row(
                                verticalAlignment = Alignment.CenterVertically,
                                modifier = Modifier.padding(vertical = 12.dp)
                            ) {
                                CircularProgressIndicator(
                                    modifier = Modifier.size(24.dp),
                                    color = GeminiCyan,
                                    strokeWidth = 2.dp
                                )
                                Spacer(modifier = Modifier.width(12.dp))
                                Text("Trener Gemini analizuje Twoje serie i tonaż...")
                            }
                        } else if (!coachFeedback.isNullOrBlank()) {
                            Text(
                                text = coachFeedback.orEmpty(),
                                style = MaterialTheme.typography.bodyMedium,
                                color = MaterialTheme.colorScheme.onSurface,
                                lineHeight = 22.sp
                            )
                        } else {
                            Text("Brak wygenerowanego raportu.")
                        }
                    }
                }
            }

            // Ask Coach Section
            item {
                Card(
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(16.dp),
                    colors = CardDefaults.cardColors(containerColor = SurfaceElevated)
                ) {
                    Column(modifier = Modifier.padding(16.dp)) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Icon(Icons.Default.Chat, contentDescription = null, tint = NeonAmber)
                            Spacer(modifier = Modifier.width(8.dp))
                            Text(
                                text = "Zapytaj Trenera",
                                fontWeight = FontWeight.Bold,
                                fontSize = 17.sp,
                                color = NeonAmber
                            )
                        }
                        Spacer(modifier = Modifier.height(8.dp))
                        Text(
                            text = "Masz pytanie o technikę, zamiennik ćwiczenia lub regenerację?",
                            fontSize = 13.sp,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                        Spacer(modifier = Modifier.height(10.dp))

                        OutlinedTextField(
                            value = userQuestion,
                            onValueChange = { userQuestion = it },
                            placeholder = { Text("np. Co zrobić, gdy czuję bark przy wyciskaniu?") },
                            modifier = Modifier.fillMaxWidth(),
                            shape = RoundedCornerShape(10.dp)
                        )

                        Spacer(modifier = Modifier.height(10.dp))

                        Button(
                            onClick = {
                                if (userQuestion.isBlank() || apiKey.isBlank()) return@Button
                                isAnsweringQuestion = true
                                scope.launch {
                                    val contextText = "Plan: ${session?.planName}, tonaż: ${session?.totalVolumeKg}kg"
                                    val result = geminiService.askCoach(userQuestion, contextText, apiKey)
                                    result.fold(
                                        onSuccess = { answer ->
                                            coachAnswer = answer
                                            isAnsweringQuestion = false
                                        },
                                        onFailure = {
                                            coachAnswer = "Nie udało się połączyć z trenerem."
                                            isAnsweringQuestion = false
                                        }
                                    )
                                }
                            },
                            enabled = !isAnsweringQuestion && userQuestion.isNotBlank() && apiKey.isNotBlank(),
                            colors = ButtonDefaults.buttonColors(containerColor = NeonAmber)
                        ) {
                            if (isAnsweringQuestion) {
                                CircularProgressIndicator(color = Color.Black, modifier = Modifier.size(18.dp), strokeWidth = 2.dp)
                                Spacer(modifier = Modifier.width(6.dp))
                                Text("Myśli...", color = Color.Black)
                            } else {
                                Text("Wyślij pytanie", color = Color.Black, fontWeight = FontWeight.Bold)
                            }
                        }

                        coachAnswer?.let { ans ->
                            Spacer(modifier = Modifier.height(14.dp))
                            Box(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .background(MaterialTheme.colorScheme.surface, RoundedCornerShape(10.dp))
                                    .padding(12.dp)
                            ) {
                                Text(
                                    text = ans,
                                    fontSize = 14.sp,
                                    color = MaterialTheme.colorScheme.onSurface
                                )
                            }
                        }
                    }
                }
            }

            item {
                Spacer(modifier = Modifier.height(40.dp))
            }
        }
    }
}
