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
import com.ironcoach.app.data.local.entity.WorkoutPlanEntity
import com.ironcoach.app.data.local.entity.WorkoutSessionEntity
import com.ironcoach.app.ui.theme.GeminiCyan
import com.ironcoach.app.ui.theme.NeonAmber
import com.ironcoach.app.ui.theme.SurfaceElevated
import kotlinx.coroutines.launch
import java.text.SimpleDateFormat
import java.util.*

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun HomeScreen(
    onNavigateToActiveWorkout: (Long) -> Unit,
    onNavigateToImportKeep: () -> Unit,
    onNavigateToCoach: (Long) -> Unit,
    onNavigateToSettings: () -> Unit
) {
    val repository = remember { IronCoachApp.instance.workoutRepository }
    val scope = rememberCoroutineScope()

    val plans by repository.getAllPlans().collectAsState(initial = emptyList())
    val recentSessions by repository.getRecentCompletedSessions().collectAsState(initial = emptyList())
    var activeSession by remember { mutableStateOf<WorkoutSessionEntity?>(null) }

    LaunchedEffect(Unit) {
        activeSession = repository.getActiveSession()
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Icon(
                            imageVector = Icons.Default.FitnessCenter,
                            contentDescription = null,
                            tint = NeonAmber,
                            modifier = Modifier.size(28.dp)
                        )
                        Spacer(modifier = Modifier.width(10.dp))
                        Text(
                            text = "IronCoach AI",
                            fontWeight = FontWeight.Bold,
                            fontSize = 22.sp
                        )
                    }
                },
                actions = {
                    IconButton(onClick = onNavigateToSettings) {
                        Icon(Icons.Default.Settings, contentDescription = "Ustawienia")
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = MaterialTheme.colorScheme.background
                )
            )
        },
        floatingActionButton = {
            ExtendedFloatingActionButton(
                onClick = onNavigateToImportKeep,
                icon = { Icon(Icons.Default.Add, contentDescription = null) },
                text = { Text("Import z Keep") },
                containerColor = GeminiCyan,
                contentColor = Color.Black
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
            // Active session banner if in progress
            activeSession?.let { current ->
                item {
                    Card(
                        modifier = Modifier.fillMaxWidth(),
                        colors = CardDefaults.cardColors(containerColor = NeonAmber.copy(alpha = 0.15f)),
                        shape = RoundedCornerShape(16.dp)
                    ) {
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(16.dp),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Column {
                                Text(
                                    text = "Trwający Trening",
                                    color = NeonAmber,
                                    fontWeight = FontWeight.Bold,
                                    fontSize = 12.sp
                                )
                                Text(
                                    text = current.planName,
                                    fontWeight = FontWeight.Bold,
                                    fontSize = 18.sp
                                )
                            }
                            Button(
                                onClick = { onNavigateToActiveWorkout(current.id) },
                                colors = ButtonDefaults.buttonColors(containerColor = NeonAmber)
                            ) {
                                Text("Wznów", color = Color.Black, fontWeight = FontWeight.Bold)
                            }
                        }
                    }
                }
            }

            // Quick Banner for Keep Import if no plans yet
            if (plans.isEmpty()) {
                item {
                    Card(
                        modifier = Modifier.fillMaxWidth(),
                        colors = CardDefaults.cardColors(containerColor = SurfaceElevated),
                        shape = RoundedCornerShape(16.dp)
                    ) {
                        Column(modifier = Modifier.padding(20.dp)) {
                            Text(
                                text = "Rozpocznij od zaimportowania notatek",
                                fontWeight = FontWeight.Bold,
                                fontSize = 18.sp
                            )
                            Spacer(modifier = Modifier.height(6.dp))
                            Text(
                                text = "Skopiuj swój plan z Google Keep lub udostępnij notatkę bezpośrednio do IronCoach. Gemini rozpozna ćwiczenia i serie.",
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                                fontSize = 14.sp
                            )
                            Spacer(modifier = Modifier.height(14.dp))
                            Button(
                                onClick = onNavigateToImportKeep,
                                colors = ButtonDefaults.buttonColors(containerColor = GeminiCyan)
                            ) {
                                Text("Importuj z Keep", color = Color.Black, fontWeight = FontWeight.Bold)
                            }
                        }
                    }
                }
            }

            // Workout Plans Section
            if (plans.isNotEmpty()) {
                item {
                    Text(
                        text = "Twoje Plany Treningowe",
                        fontSize = 18.sp,
                        fontWeight = FontWeight.Bold,
                        color = MaterialTheme.colorScheme.onBackground
                    )
                }

                items(plans) { plan ->
                    PlanCard(
                        plan = plan,
                        onStartWorkout = {
                            scope.launch {
                                val sessionId = repository.startWorkout(plan.id, plan.name)
                                onNavigateToActiveWorkout(sessionId)
                            }
                        },
                        onDeletePlan = {
                            scope.launch {
                                repository.deletePlan(plan.id)
                            }
                        }
                    )
                }
            }

            // Recent Sessions Section
            if (recentSessions.isNotEmpty()) {
                item {
                    Spacer(modifier = Modifier.height(8.dp))
                    Text(
                        text = "Ostatnie Treningi & Analizy AI",
                        fontSize = 18.sp,
                        fontWeight = FontWeight.Bold,
                        color = MaterialTheme.colorScheme.onBackground
                    )
                }

                items(recentSessions) { session ->
                    RecentSessionCard(
                        session = session,
                        onClick = { onNavigateToCoach(session.id) }
                    )
                }
            }

            item {
                Spacer(modifier = Modifier.height(80.dp))
            }
        }
    }
}

@Composable
fun PlanCard(
    plan: WorkoutPlanEntity,
    onStartWorkout: () -> Unit,
    onDeletePlan: () -> Unit
) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(14.dp),
        colors = CardDefaults.cardColors(containerColor = SurfaceElevated)
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = plan.name,
                        fontSize = 18.sp,
                        fontWeight = FontWeight.Bold
                    )
                    if (plan.description.isNotBlank()) {
                        Text(
                            text = plan.description,
                            fontSize = 13.sp,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                }

                Row {
                    IconButton(onClick = onDeletePlan) {
                        Icon(
                            imageVector = Icons.Default.DeleteOutline,
                            contentDescription = "Usuń",
                            tint = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                    Button(
                        onClick = onStartWorkout,
                        colors = ButtonDefaults.buttonColors(containerColor = NeonAmber)
                    ) {
                        Icon(Icons.Default.PlayArrow, contentDescription = null, tint = Color.Black)
                        Spacer(modifier = Modifier.width(4.dp))
                        Text("Start", color = Color.Black, fontWeight = FontWeight.Bold)
                    }
                }
            }
        }
    }
}

@Composable
fun RecentSessionCard(
    session: WorkoutSessionEntity,
    onClick: () -> Unit
) {
    val dateFormat = remember { SimpleDateFormat("dd.MM.yyyy, HH:mm", Locale.getDefault()) }
    val dateStr = remember(session.startTimeMs) { dateFormat.format(Date(session.startTimeMs)) }

    Card(
        onClick = onClick,
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(14.dp),
        colors = CardDefaults.cardColors(containerColor = SurfaceElevated)
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(16.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Column {
                Text(
                    text = session.planName,
                    fontSize = 16.sp,
                    fontWeight = FontWeight.SemiBold
                )
                Text(
                    text = dateStr,
                    fontSize = 12.sp,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
                Spacer(modifier = Modifier.height(4.dp))
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(
                        text = "Objętość: ${session.totalVolumeKg.toInt()} kg",
                        fontSize = 13.sp,
                        fontWeight = FontWeight.Medium,
                        color = NeonAmber
                    )
                    Text(
                        text = "  •  ${session.totalSetsCompleted} serii",
                        fontSize = 13.sp,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
            }

            if (!session.coachFeedback.isNullOrBlank()) {
                Box(
                    modifier = Modifier
                        .clip(RoundedCornerShape(8.dp))
                        .background(GeminiCyan.copy(alpha = 0.15f))
                        .padding(horizontal = 10.dp, vertical = 6.dp)
                ) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Icon(
                            imageVector = Icons.Default.AutoAwesome,
                            contentDescription = null,
                            tint = GeminiCyan,
                            modifier = Modifier.size(14.dp)
                        )
                        Spacer(modifier = Modifier.width(4.dp))
                        Text(
                            text = "Raport AI",
                            color = GeminiCyan,
                            fontSize = 12.sp,
                            fontWeight = FontWeight.Bold
                        )
                    }
                }
            } else {
                Icon(
                    imageVector = Icons.Default.ChevronRight,
                    contentDescription = null,
                    tint = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
        }
    }
}
