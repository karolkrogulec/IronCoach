package com.ironcoach.app.data.repository

import com.ironcoach.app.data.gemini.ParsedKeepPlan
import com.ironcoach.app.data.local.IronCoachDatabase
import com.ironcoach.app.data.local.entity.ExerciseEntity
import com.ironcoach.app.data.local.entity.WorkoutPlanEntity
import com.ironcoach.app.data.local.entity.WorkoutSessionEntity
import com.ironcoach.app.data.local.entity.WorkoutSetEntity
import kotlinx.coroutines.flow.Flow

class WorkoutRepository(private val database: IronCoachDatabase) {

    private val planDao = database.workoutPlanDao()
    private val exerciseDao = database.exerciseDao()
    private val sessionDao = database.workoutSessionDao()
    private val setDao = database.workoutSetDao()

    // Plans
    fun getAllPlans(): Flow<List<WorkoutPlanEntity>> = planDao.getAllPlans()

    suspend fun getPlanById(id: Long): WorkoutPlanEntity? = planDao.getPlanById(id)

    suspend fun deletePlan(id: Long) = planDao.deletePlanById(id)

    fun getExercisesForPlan(planId: Long): Flow<List<ExerciseEntity>> =
        exerciseDao.getExercisesForPlan(planId)

    // Save imported plan from Gemini Keep parser
    suspend fun saveImportedPlan(parsed: ParsedKeepPlan): Long {
        val planEntity = WorkoutPlanEntity(
            name = parsed.planName,
            description = parsed.description
        )
        val planId = planDao.insertPlan(planEntity)

        val exercises = parsed.exercises.mapIndexed { index, ex ->
            ExerciseEntity(
                planId = planId,
                name = ex.name,
                muscleGroup = ex.muscleGroup,
                targetSets = ex.targetSets,
                targetReps = ex.targetReps,
                targetWeightKg = ex.targetWeightKg,
                orderIndex = index,
                notes = ex.notes
            )
        }
        exerciseDao.insertExercises(exercises)
        return planId
    }

    // Sessions
    suspend fun getActiveSession(): WorkoutSessionEntity? = sessionDao.getActiveSession()

    fun getRecentCompletedSessions(): Flow<List<WorkoutSessionEntity>> =
        sessionDao.getRecentCompletedSessions()

    fun getSessionFlow(sessionId: Long): Flow<WorkoutSessionEntity?> =
        sessionDao.getSessionFlowById(sessionId)

    suspend fun startWorkout(planId: Long, planName: String): Long {
        // If an active session already exists, return it
        val currentActive = sessionDao.getActiveSession()
        if (currentActive != null) return currentActive.id

        val newSession = WorkoutSessionEntity(
            planId = planId,
            planName = planName,
            startTimeMs = System.currentTimeMillis(),
            isFinished = false
        )
        val sessionId = sessionDao.insertSession(newSession)

        // Pre-populate sets from plan exercises
        val exercises = exerciseDao.getExercisesForPlanDirect(planId)
        val initialSets = mutableListOf<WorkoutSetEntity>()

        for (ex in exercises) {
            val setsCount = if (ex.targetSets > 0) ex.targetSets else 3
            for (setNum in 1..setsCount) {
                initialSets.add(
                    WorkoutSetEntity(
                        sessionId = sessionId,
                        exerciseName = ex.name,
                        setNumber = setNum,
                        weightKg = ex.targetWeightKg,
                        reps = ex.targetReps,
                        isCompleted = false
                    )
                )
            }
        }
        setDao.insertSets(initialSets)
        return sessionId
    }

    fun getSetsForSession(sessionId: Long): Flow<List<WorkoutSetEntity>> =
        setDao.getSetsForSession(sessionId)

    suspend fun updateSet(set: WorkoutSetEntity) {
        setDao.updateSet(set)
    }

    suspend fun addSetToSession(sessionId: Long, exerciseName: String, weight: Double, reps: Int) {
        val currentSets = setDao.getSetsForSessionDirect(sessionId)
            .filter { it.exerciseName == exerciseName }
        val nextNumber = (currentSets.maxOfOrNull { it.setNumber } ?: 0) + 1

        val newSet = WorkoutSetEntity(
            sessionId = sessionId,
            exerciseName = exerciseName,
            setNumber = nextNumber,
            weightKg = weight,
            reps = reps,
            isCompleted = false
        )
        setDao.insertSet(newSet)
    }

    suspend fun finishWorkout(sessionId: Long, notes: String, coachFeedback: String? = null) {
        val sets = setDao.getSetsForSessionDirect(sessionId)
        val completedSets = sets.filter { it.isCompleted }
        val totalVolume = completedSets.sumOf { it.weightKg * it.reps }

        val existing = sessionDao.getSessionById(sessionId) ?: return
        val updated = existing.copy(
            endTimeMs = System.currentTimeMillis(),
            isFinished = true,
            totalVolumeKg = totalVolume,
            totalSetsCompleted = completedSets.size,
            notes = notes,
            coachFeedback = coachFeedback
        )
        sessionDao.updateSession(updated)
    }

    suspend fun updateSessionFeedback(sessionId: Long, feedback: String) {
        val existing = sessionDao.getSessionById(sessionId) ?: return
        sessionDao.updateSession(existing.copy(coachFeedback = feedback))
    }

    suspend fun getPreviousPerformanceForExercise(exerciseName: String): List<WorkoutSetEntity> {
        return setDao.getRecentSetsForExercise(exerciseName)
    }
}
