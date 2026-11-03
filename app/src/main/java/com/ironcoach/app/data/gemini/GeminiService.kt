package com.ironcoach.app.data.gemini

import com.google.ai.client.generativeai.GenerativeModel
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject

class GeminiService {

    suspend fun parseKeepNote(
        rawNoteText: String,
        apiKey: String
    ): Result<ParsedKeepPlan> = withContext(Dispatchers.IO) {
        runCatching {
            val generativeModel = GenerativeModel(
                modelName = "gemini-1.5-flash",
                apiKey = apiKey
            )

            val prompt = """
                Jesteś ekspertem treningu siłowego i analizy danych sportowych.
                Otrzymujesz surową treść notatki z Google Keep z planem treningowym lub zapiskami z siłowni:
                
                \"\"\"
                $rawNoteText
                \"\"\"
                
                Przekształć tę notatkę w czysty obiekt JSON o dokładnie następującej strukturze:
                {
                  "planName": "Nazwa planu (np. Push, Klatka + Triceps, FBW)",
                  "description": "Krótki opis lub data jeśli występuje",
                  "exercises": [
                    {
                      "name": "Nazwa ćwiczenia (np. Wyciskanie sztangi leżąc)",
                      "muscleGroup": "Główna partia mięśniowa (np. Klatka, Plecy, Nogi, Barki, Ramiona, Brzuch)",
                      "targetSets": 4,
                      "targetReps": 8,
                      "targetWeightKg": 80.0,
                      "notes": "Ewentualne uwagi z notatki"
                    }
                  ]
                }
                
                Zasady:
                1. Jeśli ciężar nie został podany, wstaw 0.0.
                2. Jeśli liczba powtórzeń to np. "max", wstaw 15 i dopisz w notes "do upadku".
                3. Zwróć WYŁĄCZNIE poprawny format JSON, bez żadnego bloku markdown typu ```json i bez żadnego dodatkowego komentarza.
            """.trimIndent()

            val response = generativeModel.generateContent(prompt)
            val jsonText = cleanJsonResponse(response.text.orEmpty())
            parsePlanJson(jsonText)
        }
    }

    suspend fun analyzeWorkoutSession(
        request: SessionAnalysisRequest,
        apiKey: String
    ): Result<String> = withContext(Dispatchers.IO) {
        runCatching {
            val generativeModel = GenerativeModel(
                modelName = "gemini-1.5-flash",
                apiKey = apiKey
            )

            val setsInfo = buildString {
                val groupedByExercise = request.sets.groupBy { it.exerciseName }
                groupedByExercise.forEach { (exercise, sets) ->
                    append("- $exercise: ")
                    append(sets.joinToString(", ") { "S${it.setNumber}: ${it.weightKg}kg x ${it.reps}powt" })
                    append("\n")
                }
            }

            val prompt = """
                Działasz jako doświadczony, motywujący trener personalny i analityk periodyzacji siłowej.
                Właśnie zakończyła się sesja treningowa użytkownika:
                
                Plan: ${request.planName}
                Czas trwania: ${request.durationMinutes} minut
                Całkowity tonaż (objętość): ${request.totalVolumeKg} kg
                Uwagi użytkownika: ${if (request.userNotes.isBlank()) "Brak uwag" else request.userNotes}
                
                Wykonane serie:
                $setsInfo
                
                Przygotuj zwięzłą, profesjonalną analizę treningu w języku polskim w formacie Markdown:
                1. 📊 **Podsumowanie & Objętość**: Krótka ocena tonażu i intensywności sesji.
                2. 🎯 **Progresywne Przeładowanie (Wskazówki na następną sesję)**:
                   - Konkretne zalecenia dla 1-2 kluczowych ćwiczeń (np. "Wyciskanie: dodaj +2.5kg", "Przysiad: utrzymaj ciężar, celuj w +1 powtórzenie w 1. serii").
                3. ⚡ **Regeneracja & Wskazówki Trenera**:
                   - Porada dotycząca regeneracji lub uwagi technicznej.
                
                Bądź konkretny, merytoryczny i motywujący. Używaj estetycznych nagłówków i punktorów.
            """.trimIndent()

            val response = generativeModel.generateContent(prompt)
            response.text ?: "Brak odpowiedzi trenera."
        }
    }

    suspend fun askCoach(
        question: String,
        currentContext: String,
        apiKey: String
    ): Result<String> = withContext(Dispatchers.IO) {
        runCatching {
            val generativeModel = GenerativeModel(
                modelName = "gemini-1.5-flash",
                apiKey = apiKey
            )

            val prompt = """
                Jesteś profesjonalnym trenerem siłowym w aplikacji IronCoach.
                Odpowiedz krótko, praktycznie i precyzyjnie na pytanie użytkownika.
                
                Kontekst treningowy użytkownika:
                $currentContext
                
                Pytanie:
                $question
            """.trimIndent()

            val response = generativeModel.generateContent(prompt)
            response.text ?: "Brak odpowiedzi."
        }
    }

    private fun cleanJsonResponse(raw: String): String {
        var text = raw.trim()
        if (text.startsWith("```json")) {
            text = text.removePrefix("```json")
        } else if (text.startsWith("```")) {
            text = text.removePrefix("```")
        }
        if (text.endsWith("```")) {
            text = text.removeSuffix("```")
        }
        return text.trim()
    }

    private fun parsePlanJson(jsonString: String): ParsedKeepPlan {
        val json = JSONObject(jsonString)
        val planName = json.optString("planName", "Plan z Keep")
        val description = json.optString("description", "")
        val exercisesJson = json.optJSONArray("exercises") ?: JSONArray()

        val exercises = mutableListOf<ParsedExercise>()
        for (i in 0 until exercisesJson.length()) {
            val ex = exercisesJson.getJSONObject(i)
            exercises.add(
                ParsedExercise(
                    name = ex.optString("name", "Ćwiczenie ${i + 1}"),
                    muscleGroup = ex.optString("muscleGroup", "Inne"),
                    targetSets = ex.optInt("targetSets", 3),
                    targetReps = ex.optInt("targetReps", 10),
                    targetWeightKg = ex.optDouble("targetWeightKg", 0.0),
                    notes = ex.optString("notes", "")
                )
            )
        }

        return ParsedKeepPlan(
            planName = planName,
            description = description,
            exercises = exercises
        )
    }
}
