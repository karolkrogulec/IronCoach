package com.ironcoach.app.data.local.entity

import androidx.room.Entity
import androidx.room.PrimaryKey

@Entity(tableName = "workout_sessions")
data class WorkoutSessionEntity(
    @PrimaryKey(autoGenerate = true)
    val id: Long = 0,
    val planId: Long,
    val planName: String,
    val startTimeMs: Long = System.currentTimeMillis(),
    val endTimeMs: Long? = null,
    val isFinished: Boolean = false,
    val totalVolumeKg: Double = 0.0,
    val totalSetsCompleted: Int = 0,
    val notes: String = "",
    val coachFeedback: String? = null
)
