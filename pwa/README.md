# 📱 IronCoach AI - Wersja Mobilna (PWA)

Ta wersja została stworzona specjalnie po to, abyś mógł **rozwijać, edytować i używać aplikacji bezpośrednio na telefonie**.

---

## 🚀 Jak uruchomić na telefonie w 1 minutę?

### Metoda 1: Lokalne testowanie w sieci Wi-Fi
1. Na komputerze uruchom lokalny serwer:
   ```bash
   cd "Antigravity Project/pwa"
   python3 -m http.server 8000
   ```
2. Na telefonie w przeglądarce Chrome wpisz:
   `http://[IP_TWOJEGO_MACA]:8000` (np. `http://192.168.1.50:8000`).

### Metoda 2: Darmowy hosting (GitHub Pages / Vercel / Netlify)
1. Wrzuć folder `pwa` na swoje repozytorium GitHub.
2. Włącz **GitHub Pages** (Settings -> Pages -> Branch main -> folder /pwa).
3. Otrzymujesz bezpieczny adres `https://twoj-login.github.io/...`.
4. Otwórz ten link na telefonie w **Chrome** -> kliknij trzy kropki -> **"Zainstaluj aplikację"** lub **"Dodaj do ekranu głównego"**.

---

## 🛠️ Jak kontynuować development na komórce?

Możesz edytować kod w 100% z poziomu smartfona na dwa sposoby:

1. **W przeglądarce przez VS Code Web (GitHub.dev):**
   * Otwórz swoje repozytorium na telefonie w przeglądarce.
   * Wciśnij klawisz `.` (lub zmień `github.com` na `github.dev`).
   * Otworzy się pełnoprawny edytor VS Code w oknie przeglądarki! Możesz edytować `app.js` i `index.html` oraz od razu zatwierdzać commity.

2. **Dedykowany mobilny edytor kodu na Androida (z Google Play):**
   * **Acode - code editor** (świetny, lekki edytor z podglądem na żywo i obsługą Git).
   * **Spck Editor** (idealny edytor JavaScript/HTML z wbudowanym podglądem na telefonie).
