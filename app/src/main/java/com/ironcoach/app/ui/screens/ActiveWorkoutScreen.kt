package com.ironcoach.app.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.ironcoach.app.IronCoachApp
import com.ironcoach.app.data.local.entity.WorkoutSetEntity
import com.ironcoach.app.ui.theme.GeminiCyan
import com.ironcoach.app.ui.theme.NeonAmber
import com.ironcoach.app.ui.theme.SuccessGreen
import com.ironcoach.app.ui.theme.SurfaceElevated
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ActiveWorkoutScreen(
    sessionId: Long,
    onNavigateBack: () -> Unit,
    onFinishWorkout: (Long) -> Unit
) {
    val repository = remember { IronCoachApp.instance.workoutRepository }
    val scope = rememberCoroutineScope()

    val sessionFlow by repository.getSessionFlow(sessionId).collectAsState(initial = null)
    val sets by repository.getSetsForSession(sessionId).collectAsState(initial = emptyList())

    var restSecondsLeft by remember { mutableStateOf(0) }
    var isTimerRunning by remember { mutableStateOf(false) }
    var workoutNotes by remember { mutableStateOf("") }
    var showFinishDialog by remember { mutableStateOf(false) }

    // Rest timer countdown effect
    LaunchedEffect(isTimerRunning, restSecondsLeft) {
        if (isTimerRunning && restSecondsLeft > 0) {
            delay(1000L)
            restSecondsLeft -= 1
            if (restSecondsLeft == 0) {
                isTimerRunning = false
            }
        }
    }

    val groupedSets = remember(sets) {
        sets.groupBy { it.exerciseName }
    }

    val completedCount = sets.count { it.isCompleted }
    val totalVolume = sets.filter { it.isCompleted }.sumOf { it.weightKg * it.reps }

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Column {
                        Text(
                            text = sessionFlow?.planName ?: "Trening",
                            fontWeight = FontWeight.Bold,
                            fontSize = 18.sp
                        )
                        Text(
                            text = "Serii: $completedCount/${sets.size}  •  Tonaż: ${totalVolume.toInt()} kg",
                            fontSize = 12.sp,
                            color = NeonAmber
                        )
                    }
                },
                navigationIcon = {
                    IconButton(onClick = onNavigateBack) {
                        Icon(Icons.Default.ArrowBack, contentDescription = "Wstecz")
                    }
                },
                actions = {
                    Button(
                        onClick = { showFinishDialog = true },
                        colors = ButtonDefaults.buttonColors(containerColor = NeonAmber),
                        contentPadding = PaddingValues(horizontal = 12.dp, vertical = 6.dp)
                    ) {
                        Text("Zakończ", color = Color.Black, fontWeight = FontWeight.Bold)
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = MaterialTheme.colorScheme.background
                )
            )
        },
        bottomBar = {
            // Rest Timer Floating Bar if active
            if (isTimerRunning || restSecondsLeft > 0) {
                Surface(
                    color = MaterialTheme.colorScheme.surfaceVariant,
                    tonalElevation = 8.dp,
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(horizontal = 16.dp, vertical = 10.dp),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Icon(Icons.Default.Timer, contentDescription = null, tint = GeminiCyan)
                            Spacer(modifier = Modifier.width(8.dp))
                            Text(
                                text = "Przerwa: ${restSecondsLeft}s",
                                fontWeight = FontWeight.Bold,
                                fontSize = 16.sp,
                                color = GeminiCyan
                            )
                        }
                        Row {
                            TextButton(onClick = { restSecondsLeft += 30 }) {
                                Text("+30s", color = NeonAmber)
                            }
                            IconButton(onClick = {
                                isTimerRunning = false
                                restSecondsLeft = 0
                            }) {
                                Icon(Icons.Default.Close, contentDescription = "Pomiń")
                            }
                        }
                    }
                }
            }
        }
    ) { padding ->
        LazyColumn(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .padding(horizontal = 16.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            groupedSets.forEach { (exerciseName, exerciseSets) ->
                item(key = exerciseName) {
                    ExerciseGroupCard(
                        exerciseName = exerciseName,
                        sets = exerciseSets,
                        onUpdateSet = { updatedSet ->
                            scope.launch {
                                repository.updateSet(updatedSet)
                                // If set was just completed, trigger 90-second rest timer
                                if (updatedSet.isCompleted) {
                                    restSecondsLeft = 90
                                    isTimerRunning = true
                                }
                            }
                        },
                        onAddSet = {
                            scope.launch {
                                val lastSet = exerciseSets.lastOrNull()
                                repository.addSetToSession(
                                    sessionId = sessionId,
                                    exerciseName = exerciseName,
                                    weight = lastSet?.weightKg ?: 0.0,
                                    reps = lastSet?.reps ?: 10
                                )
                            }
                        }
                    )
                }
            }

            item {
                Spacer(modifier = Modifier.height(60.dp))
            }
        }
    }

    if (showFinishDialog) {
        AlertDialog(
            onDismissRequest = { showFinishDialog = false },
            title = { Text("Zakończyć sesję treningową?") },
            text = {
                Column {
                    Text("Łączny tonaż: ${totalVolume.toInt()} kg.")
                    Text("Ukończono $completedCount serii.")
                    Spacer(modifier = Modifier.height(12.dp))
                    OutlinedTextField(
                        value = workoutNotes,
                        onValueChange = { workoutNotes = it },
                        label = { Text("Uwagi do treningu (opcjonalnie)") },
                        placeholder = { Text("np. Lekki ból barku, dobra pompa, lekki ciężar") },
                        modifier = Modifier.fillMaxWidth()
                    )
                }
            },
            confirmButton = {
                Button(
                    onClick = {
                        showFinishDialog = false
                        scope.launch {
                            repository.finishWorkout(sessionId, workoutNotes)
                            onFinishWorkout(sessionId)
                        }
                    },
                    colors = ButtonDefaults.buttonColors(containerColor = NeonAmber)
                ) {
                    Text("Zakończ i Przeanalizuj AI", color = Color.Black, fontWeight = FontWeight.Bold)
                }
            },
            dismissButton = {
                TextButton(onClick = { showFinishDialog = false }) {
                    Text("Wróć do treningu")
                }
            }
        )
    }
}

@Composable
fun ExerciseGroupCard(
    exerciseName: String,
    sets: List<WorkoutSetEntity>,
    onUpdateSet: (WorkoutSetEntity) -> Unit,
    onAddSet: () -> Unit
) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(16.dp),
        colors = CardDefaults.cardColors(containerColor = SurfaceElevated)
    ) {
        Column(modifier = Modifier.padding(14.dp)) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    text = exerciseName,
                    fontSize = 17.sp,
                    fontWeight = FontWeight.Bold,
                    color = MaterialTheme.colorScheme.onSurface
                )
                IconButton(onClick = onAddSet, modifier = Modifier.size(28.dp)) {
                    Icon(
                        Icons.Default.AddCircleOutline,
                        contentDescription = "Dodaj serię",
                        tint = GeminiCyan
                    )
                }
            }

            Spacer(modifier = Modifier.height(8.dp))

            // Header labels
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween
            ) {
                Text("SERIA", fontSize = 11.sp, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.width(42.dp))
                Text("CIĘŻAR (KG)", fontSize = 11.sp, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.width(90.dp))
                Text("POWT.", fontSize = 11.sp, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.width(70.dp))
                Text("STATUS", fontSize = 11.sp, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.width(44.dp))
            }

            Divider(modifier = Modifier.padding(vertical = 6.dp), color = MaterialTheme.colorScheme.surface)

            sets.forEach { setItem ->
                SetRowItem(
                    setItem = setItem,
                    onUpdate = onUpdateSet
                )
            }
        }
    }
}

@Composable
fun SetRowItem(
    setItem: WorkoutSetEntity,
    onUpdate: (WorkoutSetEntity) -> Unit
) {
    var weightText by remember(setItem.weightKg) {
        mutableStateOf(if (setItem.weightKg == 0.0) "" else setItem.weightKg.toString())
    }
    var repsText by remember(setItem.reps) {
        mutableStateOf(setItem.reps.toString())
    }

    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 4.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.SpaceBetween
    ) {
        // Set number badge
        Box(
            modifier = Modifier
                .size(28.dp)
                .clip(CircleShape)
                .background(if (setItem.isCompleted) SuccessGreen.copy(alpha = 0.2f) else MaterialTheme.colorScheme.surface),
            contentAlignment = Alignment.Center
        ) {
            Text(
                text = "${setItem.setNumber}",
                fontWeight = FontWeight.Bold,
                fontSize = 13.sp,
                color = if (setItem.isCompleted) SuccessGreen else MaterialTheme.colorScheme.onSurface
            )
        }

        // Weight Input
        OutlinedTextField(
            value = weightText,
            onValueChange = { input ->
                weightText = input
                val parsed = input.toDoubleOrNull() ?: 0.0
                onUpdate(setItem.copy(weightKg = parsed))
            },
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
            singleLine = true,
            modifier = Modifier.width(88.dp),
            shape = RoundedCornerShape(8.dp)
        )

        // Reps Input
        OutlinedTextField(
            value = repsText,
            onValueChange = { input ->
                repsText = input
                val parsed = input.toIntOrNull() ?: 0
                onUpdate(setItem.copy(reps = parsed))
            },
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
            singleLine = true,
            modifier = Modifier.width(68.dp),
            shape = RoundedCornerShape(8.dp)
        )

        // Checkmark toggle
        IconButton(
            onClick = {
                val nextState = !setItem.isCompleted
                onUpdate(
                    setItem.copy(
                        isCompleted = nextState,
                        completedAtMs = if (nextState) System.currentTimeMillis() else null
                    )
                )
            },
            modifier = Modifier
                .size(36.dp)
                .clip(CircleShape)
                .background(if (setItem.isCompleted) SuccessGreen else MaterialTheme.colorScheme.surface)
        ) {
            Icon(
                imageVector = Icons.Default.Check,
                contentDescription = "Zalicz serię",
                tint = if (setItem.isCompleted) Color.Black else MaterialTheme.colorScheme.onSurfaceVariant
            )
        }
    }
}
