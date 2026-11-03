package com.ironcoach.app

import android.content.Intent
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import androidx.navigation.navArgument
import com.ironcoach.app.ui.navigation.Screen
import com.ironcoach.app.ui.screens.*
import com.ironcoach.app.ui.theme.IronCoachTheme

class MainActivity : ComponentActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // Check if opened via "Share" from Google Keep or another notes app
        val sharedText = extractSharedText(intent)

        setContent {
            IronCoachTheme {
                Surface(
                    modifier = Modifier.fillMaxSize(),
                    color = MaterialTheme.colorScheme.background
                ) {
                    val navController = rememberNavController()
                    val startDestination = if (!sharedText.isNullOrBlank()) {
                        Screen.ImportKeep.route
                    } else {
                        Screen.Home.route
                    }

                    NavHost(
                        navController = navController,
                        startDestination = startDestination
                    ) {
                        composable(Screen.Home.route) {
                            HomeScreen(
                                onNavigateToActiveWorkout = { sessionId ->
                                    navController.navigate(Screen.ActiveWorkout.createRoute(sessionId))
                                },
                                onNavigateToImportKeep = {
                                    navController.navigate(Screen.ImportKeep.route)
                                },
                                onNavigateToCoach = { sessionId ->
                                    navController.navigate(Screen.Coach.createRoute(sessionId))
                                },
                                onNavigateToSettings = {
                                    navController.navigate(Screen.Settings.route)
                                }
                            )
                        }

                        composable(Screen.ImportKeep.route) {
                            ImportKeepScreen(
                                initialNoteText = sharedText ?: "",
                                onNavigateBack = {
                                    navController.popBackStack()
                                },
                                onNavigateToHome = {
                                    navController.navigate(Screen.Home.route) {
                                        popUpTo(Screen.Home.route) { inclusive = true }
                                    }
                                },
                                onNavigateToSettings = {
                                    navController.navigate(Screen.Settings.route)
                                }
                            )
                        }

                        composable(
                            route = Screen.ActiveWorkout.route,
                            arguments = listOf(navArgument("sessionId") { type = NavType.LongType })
                        ) { backStackEntry ->
                            val sessionId = backStackEntry.arguments?.getLong("sessionId") ?: 0L
                            ActiveWorkoutScreen(
                                sessionId = sessionId,
                                onNavigateBack = {
                                    navController.popBackStack()
                                },
                                onFinishWorkout = { finishedSessionId ->
                                    navController.navigate(Screen.Coach.createRoute(finishedSessionId)) {
                                        popUpTo(Screen.Home.route)
                                    }
                                }
                            )
                        }

                        composable(
                            route = Screen.Coach.route,
                            arguments = listOf(navArgument("sessionId") { type = NavType.LongType })
                        ) { backStackEntry ->
                            val sessionId = backStackEntry.arguments?.getLong("sessionId") ?: 0L
                            CoachScreen(
                                sessionId = sessionId,
                                onNavigateBack = {
                                    navController.popBackStack()
                                },
                                onNavigateToHome = {
                                    navController.navigate(Screen.Home.route) {
                                        popUpTo(Screen.Home.route) { inclusive = true }
                                    }
                                },
                                onNavigateToSettings = {
                                    navController.navigate(Screen.Settings.route)
                                }
                            )
                        }

                        composable(Screen.Settings.route) {
                            SettingsScreen(
                                onNavigateBack = {
                                    navController.popBackStack()
                                }
                            )
                        }
                    }
                }
            }
        }
    }

    private fun extractSharedText(intent: Intent?): String? {
        if (intent?.action == Intent.ACTION_SEND && intent.type == "text/plain") {
            return intent.getStringExtra(Intent.EXTRA_TEXT)
        }
        return null
    }
}
