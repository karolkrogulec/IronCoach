package com.ironcoach.app.ui.navigation

sealed class Screen(val route: String, val title: String) {
    object Home : Screen("home", "Dashboard")
    object ImportKeep : Screen("import_keep", "Import z Keep")
    object ActiveWorkout : Screen("active_workout/{sessionId}", "Trening") {
        fun createRoute(sessionId: Long) = "active_workout/$sessionId"
    }
    object Coach : Screen("coach/{sessionId}", "Trener Gemini") {
        fun createRoute(sessionId: Long) = "coach/$sessionId"
    }
    object Settings : Screen("settings", "Ustawienia")
}
