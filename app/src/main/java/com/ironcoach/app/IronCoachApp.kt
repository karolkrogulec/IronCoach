package com.ironcoach.app

import android.app.Application
import com.ironcoach.app.data.gemini.GeminiService
import com.ironcoach.app.data.local.IronCoachDatabase
import com.ironcoach.app.data.repository.UserPreferencesRepository
import com.ironcoach.app.data.repository.WorkoutRepository

class IronCoachApp : Application() {

    val database by lazy { IronCoachDatabase.getDatabase(this) }
    val workoutRepository by lazy { WorkoutRepository(database) }
    val userPreferencesRepository by lazy { UserPreferencesRepository(this) }
    val geminiService by lazy { GeminiService() }

    override fun onCreate() {
        super.onCreate()
        instance = this
    }

    companion object {
        lateinit var instance: IronCoachApp
            private set
    }
}
