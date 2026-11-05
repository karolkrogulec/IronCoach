/**
 * IronCoach AI - bezpieczny webhook backupu na Google Drive.
 *
 * KONFIGURACJA (Ustawienia projektu -> Właściwości skryptu):
 *   SECRET_KEY  - tajny klucz (ten sam wpisujesz w aplikacji). NIE wpisuj go w kodzie!
 *   FOLDER_ID   - (opcjonalnie) ID dedykowanego folderu na Dysku.
 *                 Jeśli puste, skrypt sam utworzy folder "IronCoach Backups".
 *
 * Zabezpieczenia: klucz poza kodem, porównanie w stałym czasie, limit rozmiaru,
 * zapis tylko do jednego folderu, jeden plik na dzień (nadpisywany),
 * limit liczby plików w folderze, blokada równoległych zapisów.
 */

var MAX_BODY_BYTES = 5 * 1024 * 1024; // 5 MB
var MAX_FILES_IN_FOLDER = 400;
var DEFAULT_FOLDER_NAME = "IronCoach Backups";

function respond_(status, message) {
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
    return DriveApp.getFolderById(folderId);
  }
  var it = DriveApp.getFoldersByName(DEFAULT_FOLDER_NAME);
  if (it.hasNext()) return it.next();
  var folder = DriveApp.createFolder(DEFAULT_FOLDER_NAME);
  props.setProperty("FOLDER_ID", folder.getId());
  return folder;
}

function doPost(e) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
  } catch (err) {
    return respond_("error", "Serwer zajęty");
  }

  try {
    var secret = PropertiesService.getScriptProperties().getProperty("SECRET_KEY");
    if (!secret || secret.length < 16) {
      return respond_("error", "Skrypt nieskonfigurowany");
    }

    if (!e || !e.postData || !e.postData.contents) {
      return respond_("error", "Brak danych");
    }
    // Limit rozmiaru przed parsowaniem
    if (e.postData.contents.length > MAX_BODY_BYTES) {
      return respond_("error", "Plik zbyt duży");
    }

    var requestData = JSON.parse(e.postData.contents);
    if (!requestData || !safeEquals_(requestData.secret, secret)) {
      return respond_("error", "Brak autoryzacji");
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
      existing.next().setContent(fileContent);
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

    folder.createFile(fileName, fileContent, MimeType.PLAIN_TEXT);
    return respond_("success", "Utworzono " + fileName);
  } catch (err) {
    return respond_("error", "Błąd serwera");
  } finally {
    lock.releaseLock();
  }
}
