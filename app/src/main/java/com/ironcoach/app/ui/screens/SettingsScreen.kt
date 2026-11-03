package com.ironcoach.app.ui.screens

import android.content.Intent
import android.net.Uri
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
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.ironcoach.app.IronCoachApp
import com.ironcoach.app.ui.theme.GeminiCyan
import com.ironcoach.app.ui.theme.NeonAmber
import com.ironcoach.app.ui.theme.SuccessGreen
import com.ironcoach.app.ui.theme.SurfaceElevated
import kotlinx.coroutines.launch

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SettingsScreen(
    onNavigateBack: () -> Unit
) {
    val context = LocalContext.current
    val userPrefs = remember { IronCoachApp.instance.userPreferencesRepository }
    val scope = rememberCoroutineScope()

    val savedApiKey by userPrefs.geminiApiKey.collectAsState(initial = "")
    var apiKeyInput by remember { mutableStateOf("") }
    var isApiKeyVisible by remember { mutableStateOf(false) }
    var saveSuccess by remember { mutableStateOf(false) }

    LaunchedEffect(savedApiKey) {
        apiKeyInput = savedApiKey
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Ustawienia") },
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
            // Gemini API Key Section
            item {
                Card(
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(16.dp),
                    colors = CardDefaults.cardColors(containerColor = SurfaceElevated)
                ) {
                    Column(modifier = Modifier.padding(16.dp)) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Icon(Icons.Default.VpnKey, contentDescription = null, tint = GeminiCyan)
                            Spacer(modifier = Modifier.width(8.dp))
                            Text(
                                text = "Klucz Gemini API",
                                fontSize = 17.sp,
                                fontWeight = FontWeight.Bold
                            )
                        }

                        Spacer(modifier = Modifier.height(8.dp))

                        Text(
                            text = "Klucz jest potrzebny do automatycznego parsowania notatek z Keep oraz działania wirtualnego trenera. Możesz go wygenerować za darmo w Google AI Studio.",
                            fontSize = 13.sp,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )

                        Spacer(modifier = Modifier.height(12.dp))

                        OutlinedTextField(
                            value = apiKeyInput,
                            onValueChange = {
                                apiKeyInput = it
                                saveSuccess = false
                            },
                            label = { Text("Klucz API") },
                            placeholder = { Text("AIzaSy...") },
                            visualTransformation = if (isApiKeyVisible) VisualTransformation.None else PasswordVisualTransformation(),
                            trailingIcon = {
                                IconButton(onClick = { isApiKeyVisible = !isApiKeyVisible }) {
                                    Icon(
                                        imageVector = if (isApiKeyVisible) Icons.Default.VisibilityOff else Icons.Default.Visibility,
                                        contentDescription = null
                                    )
                                }
                            },
                            singleLine = true,
                            modifier = Modifier.fillMaxWidth(),
                            shape = RoundedCornerShape(10.dp)
                        )

                        Spacer(modifier = Modifier.height(12.dp))

                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            TextButton(
                                onClick = {
                                    val intent = Intent(Intent.ACTION_VIEW, Uri.parse("https://aistudio.google.com/app/apikey"))
                                    context.startActivity(intent)
                                }
                            ) {
                                Text("Pobierz darmowy klucz", color = GeminiCyan)
                            }

                            Button(
                                onClick = {
                                    scope.launch {
                                        userPrefs.saveGeminiApiKey(apiKeyInput)
                                        saveSuccess = true
                                    }
                                },
                                colors = ButtonDefaults.buttonColors(containerColor = NeonAmber)
                            ) {
                                Text("Zapisz", color = Color.Black, fontWeight = FontWeight.Bold)
                            }
                        }

                        if (saveSuccess) {
                            Spacer(modifier = Modifier.height(8.dp))
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Icon(Icons.Default.CheckCircle, contentDescription = null, tint = SuccessGreen, modifier = Modifier.size(16.dp))
                                Spacer(modifier = Modifier.width(6.dp))
                                Text("Klucz zapisany pomyślnie!", color = SuccessGreen, fontSize = 13.sp)
                            }
                        }
                    }
                }
            }

            // Online Backup Section
            item {
                Card(
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(16.dp),
                    colors = CardDefaults.cardColors(containerColor = SurfaceElevated)
                ) {
                    Column(modifier = Modifier.padding(16.dp)) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Icon(Icons.Default.CloudSync, contentDescription = null, tint = SuccessGreen)
                            Spacer(modifier = Modifier.width(8.dp))
                            Text(
                                text = "Kopia Zapasowa Online",
                                fontSize = 17.sp,
                                fontWeight = FontWeight.Bold
                            )
                        }

                        Spacer(modifier = Modifier.height(8.dp))

                        Text(
                            text = "Aplikacja działa w trybie Offline-First (baza SQLite Room). Twoje treningi, plany i serie są automatycznie zabezpieczane w chmurze konta Google (Google Drive App Data Backup). Nawet po zmianie telefonu Twoje dane zostaną przywrócone.",
                            fontSize = 13.sp,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                }
            }

            // Keep Integration Info
            item {
                Card(
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(16.dp),
                    colors = CardDefaults.cardColors(containerColor = SurfaceElevated)
                ) {
                    Column(modifier = Modifier.padding(16.dp)) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Icon(Icons.Default.Notes, contentDescription = null, tint = NeonAmber)
                            Spacer(modifier = Modifier.width(8.dp))
                            Text(
                                text = "Jak importować z Google Keep?",
                                fontSize = 17.sp,
                                fontWeight = FontWeight.Bold
                            )
                        }

                        Spacer(modifier = Modifier.height(8.dp))

                        Text(
                            text = "1. Otwórz notatkę w aplikacji Google Keep na telefonie.\n2. Kliknij ikonę trzech kropek -> 'Wyślij' (Udostępnij przez inną aplikację).\n3. Wybierz 'IronCoach AI' z listy.\n4. Treść zostanie automatycznie załadowana do analizatora Gemini!",
                            fontSize = 13.sp,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
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
