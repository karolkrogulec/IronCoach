package com.ironcoach.app.data.local.dao

import androidx.room.Dao
import androidx.room.Delete
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import androidx.room.Update
import com.ironcoach.app.data.local.entity.WorkoutPlanEntity
import kotlinx.coroutines.flow.Flow

@Dao
interface WorkoutPlanDao {
    @Query("SELECT * FROM workout_plans ORDER BY createdAt DESC")
    fun getAllPlans(): Flow<List<WorkoutPlanEntity>>

    @Query("SELECT * FROM workout_plans WHERE id = :planId")
    suspend fun getPlanById(planId: Long): WorkoutPlanEntity?

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertPlan(plan: WorkoutPlanEntity): Long

    @Update
    suspend fun updatePlan(plan: WorkoutPlanEntity)

    @Delete
    suspend fun deletePlan(plan: WorkoutPlanEntity)

    @Query("DELETE FROM workout_plans WHERE id = :planId")
    suspend fun deletePlanById(planId: Long)
}
