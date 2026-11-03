package com.ironcoach.app.data.local

import android.content.Context
import androidx.room.Database
import androidx.room.Room
import androidx.room.RoomDatabase
import com.ironcoach.app.data.local.dao.ExerciseDao
import com.ironcoach.app.data.local.dao.WorkoutPlanDao
import com.ironcoach.app.data.local.dao.WorkoutSessionDao
import com.ironcoach.app.data.local.dao.WorkoutSetDao
import com.ironcoach.app.data.local.entity.ExerciseEntity
import com.ironcoach.app.data.local.entity.WorkoutPlanEntity
import com.ironcoach.app.data.local.entity.WorkoutSessionEntity
import com.ironcoach.app.data.local.entity.WorkoutSetEntity

@Database(
    entities = [
        WorkoutPlanEntity::class,
        ExerciseEntity::class,
        WorkoutSessionEntity::class,
        WorkoutSetEntity::class
    ],
    version = 1,
    exportSchema = false
)
abstract class IronCoachDatabase : RoomDatabase() {
    abstract fun workoutPlanDao(): WorkoutPlanDao
    abstract fun exerciseDao(): ExerciseDao
    abstract fun workoutSessionDao(): WorkoutSessionDao
    abstract fun workoutSetDao(): WorkoutSetDao

    companion object {
        @Volatile
        private var INSTANCE: IronCoachDatabase? = null

        fun getDatabase(context: Context): IronCoachDatabase {
            return INSTANCE ?: synchronized(this) {
                val instance = Room.databaseBuilder(
                    context.applicationContext,
                    IronCoachDatabase::class.java,
                    "iron_coach_database"
                )
                    .fallbackToDestructiveMigration()
                    .build()
                INSTANCE = instance
                instance
            }
        }
    }
}
