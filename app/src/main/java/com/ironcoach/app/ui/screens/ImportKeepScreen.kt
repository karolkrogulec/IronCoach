package com.ironcoach.app.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.ironcoach.app.IronCoachApp
import com.ironcoach.app.data.gemini.ParsedKeepPlan
import com.ironcoach.app.ui.theme.GeminiCyan
import com.ironcoach.app.ui.theme.NeonAmber
import com.ironcoach.app.ui.theme.SurfaceElevated
import kotlinx.coroutines.launch

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ImportKeepScreen(
    initialNoteText: String = "",
    onNavigateBack: () -> Unit,
    onNavigateToHome: () -> Unit,
    onNavigateToSettings: () -> Unit
) {
    val geminiService = remember { IronCoachApp.instance.geminiService }
    val userPrefs = remember { IronCoachApp.instance.userPreferencesRepository }
    val workoutRepository = remember { IronCoachApp.instance.workoutRepository }
    val scope = rememberCoroutineScope()

    val apiKey by userPrefs.geminiApiKey.collectAsState(initial = "")

    var noteText by remember { mutableStateOf(initialNoteText) }
    var isLoading by remember { mutableStateOf(false) }
    var errorMessage by remember { mutableStateOf<String?>(null) }
    var parsedPlan by remember { mutableStateOf<ParsedKeepPlan?>(null) }
    var isSaving by remember { mutableStateOf(false) }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Import z Google Keep") },
                navigationIcon = {
                    IconButton(onClick = onNavigateBack) {
                        Icon(Icons.Default.ArrowBack, contentDescription = "Wstecz")
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
            item {
                Text(
                    text = "Wklej swoje zapiski z Keep",
                    fontSize = 20.sp,
                    fontWeight = FontWeight.Bold
                )
                Spacer(modifier = Modifier.height(4.dp))
                Text(
                    text = "Nie musisz dbać o idealny format. Gemini AI zrozumie Twoje skróty, ciężary i powtórzenia.",
                    fontSize = 14.sp,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }

            item {
                OutlinedTextField(
                    value = noteText,
                    onValueChange = { noteText = it },
                    modifier = Modifier
                        .fillMaxWidth()
                        .heightIn(min = 160.dp, max = 240.dp),
                    placeholder = {
                        Text(
                            "Przykład:\nPoniedziałek - Klatka i Triceps\n1. Wyciskanie sztangi leżąc 4x8 80kg\n2. Hantle skos 3x10 26kg\n3. Rozpiętki na bramie 3x12\n4. Wyciskanie francuskie 3x10 30kg"
                        )
                    },
                    shape = RoundedCornerShape(12.dp)
                )
            }

            if (apiKey.isBlank()) {
                item {
                    Card(
                        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.errorContainer),
                        shape = RoundedCornerShape(12.dp)
                    ) {
                        Column(modifier = Modifier.padding(16.dp)) {
                            Text(
                                text = "Wymagany klucz Gemini API",
                                fontWeight = FontWeight.Bold,
                                color = MaterialTheme.colorScheme.onErrorContainer
                            )
                            Spacer(modifier = Modifier.height(4.dp))
                            Text(
                                text = "Aby przetłumaczyć notatkę, podaj darmowy klucz API w ustawieniach aplikacji.",
                                fontSize = 13.sp,
                                color = MaterialTheme.colorScheme.onErrorContainer
                            )
                            Spacer(modifier = Modifier.height(8.dp))
                            Button(
                                onClick = onNavigateToSettings,
                                colors = ButtonDefaults.buttonColors(containerColor = MaterialTheme.colorScheme.error)
                            ) {
                                Text("Przejdź do Ustawień")
                            }
                        }
                    }
                }
            }

            errorMessage?.let { error ->
                item {
                    Text(
                        text = error,
                        color = MaterialTheme.colorScheme.error,
                        fontSize = 14.sp
                    )
                }
            }

            // Parse Button
            item {
                Button(
                    onClick = {
                        if (noteText.isBlank()) {
                            errorMessage = "Wklej treść notatki z Keep"
                            return@Button
                        }
                        if (apiKey.isBlank()) {
                            errorMessage = "Uzupełnij klucz API w ustawieniach"
                            return@Button
                        }
                        isLoading = true
                        errorMessage = null
                        scope.launch {
                            val result = geminiService.parseKeepNote(noteText, apiKey)
                            result.fold(
                                onSuccess = { plan ->
                                    parsedPlan = plan
                                    isLoading = false
                                },
                                onFailure = { ex ->
                                    errorMessage = "Błąd analizy Gemini: ${ex.localizedMessage ?: "Spróbuj ponownie"}"
                                    isLoading = false
                                }
                            )
                        }
                    },
                    enabled = !isLoading && noteText.isNotBlank() && apiKey.isNotBlank(),
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(52.dp),
                    colors = ButtonDefaults.buttonColors(containerColor = GeminiCyan),
                    shape = RoundedCornerShape(12.dp)
                ) {
                    if (isLoading) {
                        CircularProgressIndicator(
                            color = Color.Black,
                            modifier = Modifier.size(24.dp),
                            strokeWidth = 2.dp
                        )
                        Spacer(modifier = Modifier.width(10.dp))
                        Text("Gemini przetwarza notatkę...", color = Color.Black)
                    } else {
                        Icon(Icons.Default.AutoAwesome, contentDescription = null, tint = Color.Black)
                        Spacer(modifier = Modifier.width(8.dp))
                        Text(
                            "Rozpoznaj Plan z Gemini",
                            color = Color.Black,
                            fontWeight = FontWeight.Bold,
                            fontSize = 16.sp
                        )
                    }
                }
            }

            // Parsed Result Preview
            parsedPlan?.let { plan ->
                item {
                    Spacer(modifier = Modifier.height(8.dp))
                    Text(
                        text = "Wynik analizy (Podgląd planu):",
                        fontWeight = FontWeight.Bold,
                        fontSize = 18.sp
                    )
                }

                item {
                    Card(
                        modifier = Modifier.fillMaxWidth(),
                        colors = CardDefaults.cardColors(containerColor = SurfaceElevated),
                        shape = RoundedCornerShape(14.dp)
                    ) {
                        Column(modifier = Modifier.padding(16.dp)) {
                            Text(
                                text = plan.planName,
                                fontSize = 20.sp,
                                fontWeight = FontWeight.Bold,
                                color = NeonAmber
                            )
                            if (plan.description.isNotBlank()) {
                                Text(
                                    text = plan.description,
                                    fontSize = 13.sp,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant
                                )
                            }
                        }
                    }
                }

                items(plan.exercises) { ex ->
                    Card(
                        modifier = Modifier.fillMaxWidth(),
                        colors = CardDefaults.cardColors(containerColor = SurfaceElevated),
                        shape = RoundedCornerShape(12.dp)
                    ) {
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(14.dp),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Column(modifier = Modifier.weight(1f)) {
                                Text(
                                    text = ex.name,
                                    fontWeight = FontWeight.SemiBold,
                                    fontSize = 16.sp
                                )
                                Text(
                                    text = "Partia: ${ex.muscleGroup}",
                                    fontSize = 12.sp,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant
                                )
                            }
                            Column(horizontalAlignment = Alignment.End) {
                                Text(
                                    text = "${ex.targetSets} x ${ex.targetReps}",
                                    fontWeight = FontWeight.Bold,
                                    fontSize = 15.sp,
                                    color = NeonAmber
                                )
                                if (ex.targetWeightKg > 0.0) {
                                    Text(
                                        text = "${ex.targetWeightKg} kg",
                                        fontSize = 13.sp,
                                        color = MaterialTheme.colorScheme.onSurfaceVariant
                                    )
                                }
                            }
                        }
                    }
                }

                item {
                    Button(
                        onClick = {
                            isSaving = true
                            scope.launch {
                                workoutRepository.saveImportedPlan(plan)
                                isSaving = false
                                onNavigateToHome()
                            }
                        },
                        enabled = !isSaving,
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(52.dp),
                        colors = ButtonDefaults.buttonColors(containerColor = NeonAmber),
                        shape = RoundedCornerShape(12.dp)
                    ) {
                        Icon(Icons.Default.Check, contentDescription = null, tint = Color.Black)
                        Spacer(modifier = Modifier.width(8.dp))
                        Text(
                            "Zapisz w aplikacji",
                            color = Color.Black,
                            fontWeight = FontWeight.Bold,
                            fontSize = 16.sp
                        )
                    }
                }
            }

            item {
                Spacer(modifier = Modifier.height(40.dp))
            }
        }
    }
}
