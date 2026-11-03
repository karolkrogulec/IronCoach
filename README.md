# 🏋️‍♂️ IronCoach AI (Android)

Nowoczesna aplikacja na Androida do **treningu siłowego**, **śledzenia progresu** oraz **inteligentnej analizy periodyzacji z Gemini AI**.

---

## 🚀 Kluczowe Funkcjonalności

1. **📥 Jednorazowy Import z Google Keep (Gemini Parser):**
   * Otwórz notatkę w Google Keep -> kliknij **Udostępnij** -> wybierz **IronCoach AI**.
   * Model **Gemini 1.5 Flash** automatycznie analizuje dowolny format tekstu/zapisków z Keep i przekształca go w gotowy plan treningowy z ćwiczeniami, seriami i ciężarami.
   * Możliwe jest też klasyczne wklejenie tekstu z notatnika.

2. **⚡ Aktywny Rejestrator Treningu (Offline-First):**
   * Baza lokalna **SQLite Room** – działa w 100% offline (w piwnicach siłowni bez zasięgu).
   * Proste wprowadzanie serii, wagi ($kg$) oraz powtórzeń.
   * Automatyczny **stoper przerw** (odliczanie 90s z możliwością wydłużenia).
   * Obliczanie łącznego tonażu treningu ($\sum \text{ciężar} \times \text{powtórzenia}$).

3. **🧠 Trener Gemini AI:**
   * **Raport po treningu:** Analiza objętości, zmęczenia i podsumowanie sesji.
   * **Progresywne Przeładowanie (Progressive Overload):** Gemini rekomenduje konkretne ciężary i zakresy powtórzeń na następną sesję.
   * **Czat z Trenerem:** Możliwość zadawania pytań o technikę, zamienniki ćwiczeń i regenerację w trakcie i po treningu.

4. **☁️ Kopia Zapasowa Online:**
   * Skonfigurowane reguły Android Auto Backup (Google Drive App Data) – Twoje dane są bezpieczne i przenoszą się między telefonami.

---

## 🛠️ Stos Technologiczny

* **Język:** Kotlin (wersja 2.0+)
* **UI:** Jetpack Compose + Material 3 (ciemny motyw siłowni – Amber & Cyan)
* **Baza Danych:** Room (SQLite) z reaktywnym wsparciem `Flow`
* **AI:** Google Generative AI Client SDK (`gemini-1.5-flash`)
* **Ustawienia:** Android Jetpack DataStore Preferences
* **Wstrzykiwanie zależności & Architektura:** MVVM / Clean Architecture

---

## 📱 Jak uruchomić w Android Studio?

1. Otwórz projekt w **Android Studio** (Ladybug lub nowszy).
2. Poczekaj na automatyczną synchronizację Gradle (`Sync Project with Gradle Files`).
3. Uruchom aplikację na emulatorze lub fizycznym telefonie z systemem Android (min. Android 8.0, target Android 15).
4. W aplikacji wejdź w **Ustawienia** i wklej swój darmowy klucz Gemini API z [Google AI Studio](https://aistudio.google.com/app/apikey).
