/**
 * IronCoach AI - bezpieczny webhook backupu na Google Drive.
 *
 * KONFIGURACJA (Ustawienia projektu -> Właściwości skryptu):
 *   SECRET_KEY  - tajny klucz (ten sam wpisujesz w aplikacji). NIE wpisuj go w kodzie!
 *   FOLDER_ID   - (opcjonalnie) ID dedykowanego folderu na Dysku.
 *                 Jeśli puste, skrypt sam utworzy folder "IronCoach Backups".
 */

var MAX_BODY_BYTES = 5 * 1024 * 1024; // 5 MB
var MAX_FILES_IN_FOLDER = 400;
var DEFAULT_FOLDER_NAME = "IronCoach Backups";

function respond_(status, message) {
  console.log("Wynik wykonania: [" + status + "] " + (message || ""));
  return ContentService
    .createTextOutput(JSON.stringify({ status: status, message: message || "" }))
    .setMimeType(ContentService.MimeType.JSON);
}

// Porównanie w stałym czasie (odporne na timing attack)
function safeEquals_(a, b) {
  a = String(a || "");
  b = String(b || "");
  var diff = a.length ^ b.length;
  var len = Math.max(a.length, b.length);
  for (var i = 0; i < len; i++) {
    diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  }
  return diff === 0;
}

function getBackupFolder_() {
  var props = PropertiesService.getScriptProperties();
  var folderId = props.getProperty("FOLDER_ID");
  if (folderId) {
    console.log("Używam FOLDER_ID z właściwości: " + folderId);
    return DriveApp.getFolderById(folderId);
  }
  var it = DriveApp.getFoldersByName(DEFAULT_FOLDER_NAME);
  if (it.hasNext()) {
    var existingFolder = it.next();
    console.log("Znaleziono istniejący folder: " + existingFolder.getName() + " (ID: " + existingFolder.getId() + ")");
    return existingFolder;
  }
  var folder = DriveApp.createFolder(DEFAULT_FOLDER_NAME);
  console.log("Utworzono nowy folder: " + DEFAULT_FOLDER_NAME + " (ID: " + folder.getId() + ")");
  props.setProperty("FOLDER_ID", folder.getId());
  return folder;
}

function doPost(e) {
  console.log("--- NOWE ŻĄDANIE BACKUPU ---");
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
  } catch (err) {
    return respond_("error", "Serwer zajęty");
  }

  try {
    var rawSecret = PropertiesService.getScriptProperties().getProperty("SECRET_KEY");
    var secret = String(rawSecret || "").trim();
    if (!secret || secret.length < 16) {
      return respond_("error", "Błąd: Brak właściwości SECRET_KEY w Ustawieniach projektu Apps Script (musi mieć min. 16 znaków)!");
    }

    if (!e || !e.postData || !e.postData.contents) {
      return respond_("error", "Błąd: Puste żądanie (brak danych)");
    }
    if (e.postData.contents.length > MAX_BODY_BYTES) {
      return respond_("error", "Błąd: Plik przekracza limit 5MB");
    }

    var requestData = JSON.parse(e.postData.contents);
    var incomingSecret = String((requestData && requestData.secret) || "").trim();

    if (!incomingSecret || !safeEquals_(incomingSecret, secret)) {
      console.log("Odmowa: Przesłany klucz 'secret' (długość: " + incomingSecret.length + ") nie zgadza się z SECRET_KEY (długość: " + secret.length + ")");
      return respond_("error", "Brak autoryzacji: Przesłany klucz nie pasuje do SECRET_KEY w Google Apps Script. Długość wpisana w aplikacji: " + incomingSecret.length + " zn., długość w Apps Script: " + secret.length + " zn. Upewnij się, że wielkość liter i znaki są w 100% identyczne.");
    }

    var payload = requestData.payload;
    if (payload === undefined || payload === null || (typeof payload !== "object" && typeof payload !== "string")) {
      return respond_("error", "Nieprawidłowy format danych");
    }
    var fileContent = typeof payload === "string" ? payload : JSON.stringify(payload, null, 2);
    if (fileContent.length > MAX_BODY_BYTES) {
      return respond_("error", "Plik zbyt duży");
    }

    var folder = getBackupFolder_();
    var dateString = Utilities.formatDate(new Date(), "Europe/Warsaw", "yyyy-MM-dd");
    var fileName = "ironcoach-backup-" + dateString + ".json";

    // Jeden plik na dzień: nadpisz istniejący zamiast tworzyć kolejny
    var existing = folder.getFilesByName(fileName);
    if (existing.hasNext()) {
      var file = existing.next();
      file.setContent(fileContent);
      console.log("Plik zaktualizowany na Dysku: " + fileName + " (URL: " + file.getUrl() + ")");
      return respond_("success", "Zaktualizowano " + fileName);
    }

    // Limit liczby plików w folderze
    var count = 0;
    var all = folder.getFiles();
    while (all.hasNext() && count <= MAX_FILES_IN_FOLDER) {
      all.next();
      count++;
    }
    if (count >= MAX_FILES_IN_FOLDER) {
      return respond_("error", "Limit plików w folderze osiągnięty");
    }

    var newFile = folder.createFile(fileName, fileContent, MimeType.PLAIN_TEXT);
    console.log("Nowy plik utworzony na Dysku: " + fileName + " (URL: " + newFile.getUrl() + ")");
    return respond_("success", "Utworzono " + fileName);
  } catch (err) {
    console.log("Błąd krytyczny doPost: " + err.toString());
    return respond_("error", "Błąd serwera: " + err.toString());
  } finally {
    lock.releaseLock();
  }
}
