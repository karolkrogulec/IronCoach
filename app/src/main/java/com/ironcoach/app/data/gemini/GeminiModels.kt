package com.ironcoach.app.data.gemini

data class ParsedKeepPlan(
    val planName: String,
    val description: String = "",
    val exercises: List<ParsedExercise>
)

data class ParsedExercise(
    val name: String,
    val muscleGroup: String = "Inne",
    val targetSets: Int = 3,
    val targetReps: Int = 10,
    val targetWeightKg: Double = 0.0,
    val notes: String = ""
)

data class SessionSetSummary(
    val exerciseName: String,
    val setNumber: Int,
    val weightKg: Double,
    val reps: Int,
    val rpe: Double? = null
)

data class SessionAnalysisRequest(
    val planName: String,
    val durationMinutes: Long,
    val totalVolumeKg: Double,
    val sets: List<SessionSetSummary>,
    val userNotes: String = ""
)
