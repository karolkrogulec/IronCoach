package com.ironcoach.app.data.local.dao

import androidx.room.Dao
import androidx.room.Delete
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import androidx.room.Update
import com.ironcoach.app.data.local.entity.WorkoutSetEntity
import kotlinx.coroutines.flow.Flow

@Dao
interface WorkoutSetDao {
    @Query("SELECT * FROM workout_sets WHERE sessionId = :sessionId ORDER BY exerciseName, setNumber ASC")
    fun getSetsForSession(sessionId: Long): Flow<List<WorkoutSetEntity>>

    @Query("SELECT * FROM workout_sets WHERE sessionId = :sessionId ORDER BY exerciseName, setNumber ASC")
    suspend fun getSetsForSessionDirect(sessionId: Long): List<WorkoutSetEntity>

    @Query("""
        SELECT * FROM workout_sets 
        WHERE exerciseName = :exerciseName AND isCompleted = 1 
        ORDER BY completedAtMs DESC LIMIT 5
    """)
    suspend fun getRecentSetsForExercise(exerciseName: String): List<WorkoutSetEntity>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertSet(set: WorkoutSetEntity): Long

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertSets(sets: List<WorkoutSetEntity>)

    @Update
    suspend fun updateSet(set: WorkoutSetEntity)

    @Delete
    suspend fun deleteSet(set: WorkoutSetEntity)
}
