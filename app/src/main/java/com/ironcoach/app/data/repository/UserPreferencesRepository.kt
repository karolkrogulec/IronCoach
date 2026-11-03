package com.ironcoach.app.data.repository

import android.content.Context
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map

private val Context.dataStore: DataStore<Preferences> by preferencesDataStore(name = "user_settings")

class UserPreferencesRepository(private val context: Context) {

    private val geminiApiKeyKey = stringPreferencesKey("gemini_api_key")

    val geminiApiKey: Flow<String> = context.dataStore.data.map { preferences ->
        preferences[geminiApiKeyKey] ?: ""
    }

    suspend fun saveGeminiApiKey(apiKey: String) {
        context.dataStore.edit { preferences ->
            preferences[geminiApiKeyKey] = apiKey.trim()
        }
    }
}
