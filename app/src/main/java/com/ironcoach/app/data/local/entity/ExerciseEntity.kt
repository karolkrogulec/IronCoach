package com.ironcoach.app.data.local.entity

import androidx.room.Entity
import androidx.room.ForeignKey
import androidx.room.Index
import androidx.room.PrimaryKey

@Entity(
    tableName = "exercises",
    foreignKeys = [
        ForeignKey(
            entity = WorkoutPlanEntity::class,
            parentColumns = ["id"],
            childColumns = ["planId"],
            onDelete = ForeignKey.CASCADE
        )
    ],
    indices = [Index("planId")]
)
data class ExerciseEntity(
    @PrimaryKey(autoGenerate = true)
    val id: Long = 0,
    val planId: Long,
    val name: String,
    val muscleGroup: String = "Inne",
    val targetSets: Int = 3,
    val targetReps: Int = 10,
    val targetWeightKg: Double = 0.0,
    val orderIndex: Int = 0,
    val notes: String = ""
)
