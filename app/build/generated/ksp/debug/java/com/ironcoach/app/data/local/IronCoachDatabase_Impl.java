package com.ironcoach.app.data.local;

import androidx.annotation.NonNull;
import androidx.room.DatabaseConfiguration;
import androidx.room.InvalidationTracker;
import androidx.room.RoomDatabase;
import androidx.room.RoomOpenHelper;
import androidx.room.migration.AutoMigrationSpec;
import androidx.room.migration.Migration;
import androidx.room.util.DBUtil;
import androidx.room.util.TableInfo;
import androidx.sqlite.db.SupportSQLiteDatabase;
import androidx.sqlite.db.SupportSQLiteOpenHelper;
import com.ironcoach.app.data.local.dao.ExerciseDao;
import com.ironcoach.app.data.local.dao.ExerciseDao_Impl;
import com.ironcoach.app.data.local.dao.WorkoutPlanDao;
import com.ironcoach.app.data.local.dao.WorkoutPlanDao_Impl;
import com.ironcoach.app.data.local.dao.WorkoutSessionDao;
import com.ironcoach.app.data.local.dao.WorkoutSessionDao_Impl;
import com.ironcoach.app.data.local.dao.WorkoutSetDao;
import com.ironcoach.app.data.local.dao.WorkoutSetDao_Impl;
import java.lang.Class;
import java.lang.Override;
import java.lang.String;
import java.lang.SuppressWarnings;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import javax.annotation.processing.Generated;

@Generated("androidx.room.RoomProcessor")
@SuppressWarnings({"unchecked", "deprecation"})
public final class IronCoachDatabase_Impl extends IronCoachDatabase {
  private volatile WorkoutPlanDao _workoutPlanDao;

  private volatile ExerciseDao _exerciseDao;

  private volatile WorkoutSessionDao _workoutSessionDao;

  private volatile WorkoutSetDao _workoutSetDao;

  @Override
  @NonNull
  protected SupportSQLiteOpenHelper createOpenHelper(@NonNull final DatabaseConfiguration config) {
    final SupportSQLiteOpenHelper.Callback _openCallback = new RoomOpenHelper(config, new RoomOpenHelper.Delegate(1) {
      @Override
      public void createAllTables(@NonNull final SupportSQLiteDatabase db) {
        db.execSQL("CREATE TABLE IF NOT EXISTS `workout_plans` (`id` INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL, `name` TEXT NOT NULL, `description` TEXT NOT NULL, `createdAt` INTEGER NOT NULL)");
        db.execSQL("CREATE TABLE IF NOT EXISTS `exercises` (`id` INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL, `planId` INTEGER NOT NULL, `name` TEXT NOT NULL, `muscleGroup` TEXT NOT NULL, `targetSets` INTEGER NOT NULL, `targetReps` INTEGER NOT NULL, `targetWeightKg` REAL NOT NULL, `orderIndex` INTEGER NOT NULL, `notes` TEXT NOT NULL, FOREIGN KEY(`planId`) REFERENCES `workout_plans`(`id`) ON UPDATE NO ACTION ON DELETE CASCADE )");
        db.execSQL("CREATE INDEX IF NOT EXISTS `index_exercises_planId` ON `exercises` (`planId`)");
        db.execSQL("CREATE TABLE IF NOT EXISTS `workout_sessions` (`id` INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL, `planId` INTEGER NOT NULL, `planName` TEXT NOT NULL, `startTimeMs` INTEGER NOT NULL, `endTimeMs` INTEGER, `isFinished` INTEGER NOT NULL, `totalVolumeKg` REAL NOT NULL, `totalSetsCompleted` INTEGER NOT NULL, `notes` TEXT NOT NULL, `coachFeedback` TEXT)");
        db.execSQL("CREATE TABLE IF NOT EXISTS `workout_sets` (`id` INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL, `sessionId` INTEGER NOT NULL, `exerciseName` TEXT NOT NULL, `setNumber` INTEGER NOT NULL, `weightKg` REAL NOT NULL, `reps` INTEGER NOT NULL, `rpe` REAL, `isCompleted` INTEGER NOT NULL, `completedAtMs` INTEGER, FOREIGN KEY(`sessionId`) REFERENCES `workout_sessions`(`id`) ON UPDATE NO ACTION ON DELETE CASCADE )");
        db.execSQL("CREATE INDEX IF NOT EXISTS `index_workout_sets_sessionId` ON `workout_sets` (`sessionId`)");
        db.execSQL("CREATE INDEX IF NOT EXISTS `index_workout_sets_exerciseName` ON `workout_sets` (`exerciseName`)");
        db.execSQL("CREATE TABLE IF NOT EXISTS room_master_table (id INTEGER PRIMARY KEY,identity_hash TEXT)");
        db.execSQL("INSERT OR REPLACE INTO room_master_table (id,identity_hash) VALUES(42, 'a1c1ad1782aec179302ec8374d5753ec')");
      }

      @Override
      public void dropAllTables(@NonNull final SupportSQLiteDatabase db) {
        db.execSQL("DROP TABLE IF EXISTS `workout_plans`");
        db.execSQL("DROP TABLE IF EXISTS `exercises`");
        db.execSQL("DROP TABLE IF EXISTS `workout_sessions`");
        db.execSQL("DROP TABLE IF EXISTS `workout_sets`");
        final List<? extends RoomDatabase.Callback> _callbacks = mCallbacks;
        if (_callbacks != null) {
          for (RoomDatabase.Callback _callback : _callbacks) {
            _callback.onDestructiveMigration(db);
          }
        }
      }

      @Override
      public void onCreate(@NonNull final SupportSQLiteDatabase db) {
        final List<? extends RoomDatabase.Callback> _callbacks = mCallbacks;
        if (_callbacks != null) {
          for (RoomDatabase.Callback _callback : _callbacks) {
            _callback.onCreate(db);
          }
        }
      }

      @Override
      public void onOpen(@NonNull final SupportSQLiteDatabase db) {
        mDatabase = db;
        db.execSQL("PRAGMA foreign_keys = ON");
        internalInitInvalidationTracker(db);
        final List<? extends RoomDatabase.Callback> _callbacks = mCallbacks;
        if (_callbacks != null) {
          for (RoomDatabase.Callback _callback : _callbacks) {
            _callback.onOpen(db);
          }
        }
      }

      @Override
      public void onPreMigrate(@NonNull final SupportSQLiteDatabase db) {
        DBUtil.dropFtsSyncTriggers(db);
      }

      @Override
      public void onPostMigrate(@NonNull final SupportSQLiteDatabase db) {
      }

      @Override
      @NonNull
      public RoomOpenHelper.ValidationResult onValidateSchema(
          @NonNull final SupportSQLiteDatabase db) {
        final HashMap<String, TableInfo.Column> _columnsWorkoutPlans = new HashMap<String, TableInfo.Column>(4);
        _columnsWorkoutPlans.put("id", new TableInfo.Column("id", "INTEGER", true, 1, null, TableInfo.CREATED_FROM_ENTITY));
        _columnsWorkoutPlans.put("name", new TableInfo.Column("name", "TEXT", true, 0, null, TableInfo.CREATED_FROM_ENTITY));
        _columnsWorkoutPlans.put("description", new TableInfo.Column("description", "TEXT", true, 0, null, TableInfo.CREATED_FROM_ENTITY));
        _columnsWorkoutPlans.put("createdAt", new TableInfo.Column("createdAt", "INTEGER", true, 0, null, TableInfo.CREATED_FROM_ENTITY));
        final HashSet<TableInfo.ForeignKey> _foreignKeysWorkoutPlans = new HashSet<TableInfo.ForeignKey>(0);
        final HashSet<TableInfo.Index> _indicesWorkoutPlans = new HashSet<TableInfo.Index>(0);
        final TableInfo _infoWorkoutPlans = new TableInfo("workout_plans", _columnsWorkoutPlans, _foreignKeysWorkoutPlans, _indicesWorkoutPlans);
        final TableInfo _existingWorkoutPlans = TableInfo.read(db, "workout_plans");
        if (!_infoWorkoutPlans.equals(_existingWorkoutPlans)) {
          return new RoomOpenHelper.ValidationResult(false, "workout_plans(com.ironcoach.app.data.local.entity.WorkoutPlanEntity).\n"
                  + " Expected:\n" + _infoWorkoutPlans + "\n"
                  + " Found:\n" + _existingWorkoutPlans);
        }
        final HashMap<String, TableInfo.Column> _columnsExercises = new HashMap<String, TableInfo.Column>(9);
        _columnsExercises.put("id", new TableInfo.Column("id", "INTEGER", true, 1, null, TableInfo.CREATED_FROM_ENTITY));
        _columnsExercises.put("planId", new TableInfo.Column("planId", "INTEGER", true, 0, null, TableInfo.CREATED_FROM_ENTITY));
        _columnsExercises.put("name", new TableInfo.Column("name", "TEXT", true, 0, null, TableInfo.CREATED_FROM_ENTITY));
        _columnsExercises.put("muscleGroup", new TableInfo.Column("muscleGroup", "TEXT", true, 0, null, TableInfo.CREATED_FROM_ENTITY));
        _columnsExercises.put("targetSets", new TableInfo.Column("targetSets", "INTEGER", true, 0, null, TableInfo.CREATED_FROM_ENTITY));
        _columnsExercises.put("targetReps", new TableInfo.Column("targetReps", "INTEGER", true, 0, null, TableInfo.CREATED_FROM_ENTITY));
        _columnsExercises.put("targetWeightKg", new TableInfo.Column("targetWeightKg", "REAL", true, 0, null, TableInfo.CREATED_FROM_ENTITY));
        _columnsExercises.put("orderIndex", new TableInfo.Column("orderIndex", "INTEGER", true, 0, null, TableInfo.CREATED_FROM_ENTITY));
        _columnsExercises.put("notes", new TableInfo.Column("notes", "TEXT", true, 0, null, TableInfo.CREATED_FROM_ENTITY));
        final HashSet<TableInfo.ForeignKey> _foreignKeysExercises = new HashSet<TableInfo.ForeignKey>(1);
        _foreignKeysExercises.add(new TableInfo.ForeignKey("workout_plans", "CASCADE", "NO ACTION", Arrays.asList("planId"), Arrays.asList("id")));
        final HashSet<TableInfo.Index> _indicesExercises = new HashSet<TableInfo.Index>(1);
        _indicesExercises.add(new TableInfo.Index("index_exercises_planId", false, Arrays.asList("planId"), Arrays.asList("ASC")));
        final TableInfo _infoExercises = new TableInfo("exercises", _columnsExercises, _foreignKeysExercises, _indicesExercises);
        final TableInfo _existingExercises = TableInfo.read(db, "exercises");
        if (!_infoExercises.equals(_existingExercises)) {
          return new RoomOpenHelper.ValidationResult(false, "exercises(com.ironcoach.app.data.local.entity.ExerciseEntity).\n"
                  + " Expected:\n" + _infoExercises + "\n"
                  + " Found:\n" + _existingExercises);
        }
        final HashMap<String, TableInfo.Column> _columnsWorkoutSessions = new HashMap<String, TableInfo.Column>(10);
        _columnsWorkoutSessions.put("id", new TableInfo.Column("id", "INTEGER", true, 1, null, TableInfo.CREATED_FROM_ENTITY));
        _columnsWorkoutSessions.put("planId", new TableInfo.Column("planId", "INTEGER", true, 0, null, TableInfo.CREATED_FROM_ENTITY));
        _columnsWorkoutSessions.put("planName", new TableInfo.Column("planName", "TEXT", true, 0, null, TableInfo.CREATED_FROM_ENTITY));
        _columnsWorkoutSessions.put("startTimeMs", new TableInfo.Column("startTimeMs", "INTEGER", true, 0, null, TableInfo.CREATED_FROM_ENTITY));
        _columnsWorkoutSessions.put("endTimeMs", new TableInfo.Column("endTimeMs", "INTEGER", false, 0, null, TableInfo.CREATED_FROM_ENTITY));
        _columnsWorkoutSessions.put("isFinished", new TableInfo.Column("isFinished", "INTEGER", true, 0, null, TableInfo.CREATED_FROM_ENTITY));
        _columnsWorkoutSessions.put("totalVolumeKg", new TableInfo.Column("totalVolumeKg", "REAL", true, 0, null, TableInfo.CREATED_FROM_ENTITY));
        _columnsWorkoutSessions.put("totalSetsCompleted", new TableInfo.Column("totalSetsCompleted", "INTEGER", true, 0, null, TableInfo.CREATED_FROM_ENTITY));
        _columnsWorkoutSessions.put("notes", new TableInfo.Column("notes", "TEXT", true, 0, null, TableInfo.CREATED_FROM_ENTITY));
        _columnsWorkoutSessions.put("coachFeedback", new TableInfo.Column("coachFeedback", "TEXT", false, 0, null, TableInfo.CREATED_FROM_ENTITY));
        final HashSet<TableInfo.ForeignKey> _foreignKeysWorkoutSessions = new HashSet<TableInfo.ForeignKey>(0);
        final HashSet<TableInfo.Index> _indicesWorkoutSessions = new HashSet<TableInfo.Index>(0);
        final TableInfo _infoWorkoutSessions = new TableInfo("workout_sessions", _columnsWorkoutSessions, _foreignKeysWorkoutSessions, _indicesWorkoutSessions);
        final TableInfo _existingWorkoutSessions = TableInfo.read(db, "workout_sessions");
        if (!_infoWorkoutSessions.equals(_existingWorkoutSessions)) {
          return new RoomOpenHelper.ValidationResult(false, "workout_sessions(com.ironcoach.app.data.local.entity.WorkoutSessionEntity).\n"
                  + " Expected:\n" + _infoWorkoutSessions + "\n"
                  + " Found:\n" + _existingWorkoutSessions);
        }
        final HashMap<String, TableInfo.Column> _columnsWorkoutSets = new HashMap<String, TableInfo.Column>(9);
        _columnsWorkoutSets.put("id", new TableInfo.Column("id", "INTEGER", true, 1, null, TableInfo.CREATED_FROM_ENTITY));
        _columnsWorkoutSets.put("sessionId", new TableInfo.Column("sessionId", "INTEGER", true, 0, null, TableInfo.CREATED_FROM_ENTITY));
        _columnsWorkoutSets.put("exerciseName", new TableInfo.Column("exerciseName", "TEXT", true, 0, null, TableInfo.CREATED_FROM_ENTITY));
        _columnsWorkoutSets.put("setNumber", new TableInfo.Column("setNumber", "INTEGER", true, 0, null, TableInfo.CREATED_FROM_ENTITY));
        _columnsWorkoutSets.put("weightKg", new TableInfo.Column("weightKg", "REAL", true, 0, null, TableInfo.CREATED_FROM_ENTITY));
        _columnsWorkoutSets.put("reps", new TableInfo.Column("reps", "INTEGER", true, 0, null, TableInfo.CREATED_FROM_ENTITY));
        _columnsWorkoutSets.put("rpe", new TableInfo.Column("rpe", "REAL", false, 0, null, TableInfo.CREATED_FROM_ENTITY));
        _columnsWorkoutSets.put("isCompleted", new TableInfo.Column("isCompleted", "INTEGER", true, 0, null, TableInfo.CREATED_FROM_ENTITY));
        _columnsWorkoutSets.put("completedAtMs", new TableInfo.Column("completedAtMs", "INTEGER", false, 0, null, TableInfo.CREATED_FROM_ENTITY));
        final HashSet<TableInfo.ForeignKey> _foreignKeysWorkoutSets = new HashSet<TableInfo.ForeignKey>(1);
        _foreignKeysWorkoutSets.add(new TableInfo.ForeignKey("workout_sessions", "CASCADE", "NO ACTION", Arrays.asList("sessionId"), Arrays.asList("id")));
        final HashSet<TableInfo.Index> _indicesWorkoutSets = new HashSet<TableInfo.Index>(2);
        _indicesWorkoutSets.add(new TableInfo.Index("index_workout_sets_sessionId", false, Arrays.asList("sessionId"), Arrays.asList("ASC")));
        _indicesWorkoutSets.add(new TableInfo.Index("index_workout_sets_exerciseName", false, Arrays.asList("exerciseName"), Arrays.asList("ASC")));
        final TableInfo _infoWorkoutSets = new TableInfo("workout_sets", _columnsWorkoutSets, _foreignKeysWorkoutSets, _indicesWorkoutSets);
        final TableInfo _existingWorkoutSets = TableInfo.read(db, "workout_sets");
        if (!_infoWorkoutSets.equals(_existingWorkoutSets)) {
          return new RoomOpenHelper.ValidationResult(false, "workout_sets(com.ironcoach.app.data.local.entity.WorkoutSetEntity).\n"
                  + " Expected:\n" + _infoWorkoutSets + "\n"
                  + " Found:\n" + _existingWorkoutSets);
        }
        return new RoomOpenHelper.ValidationResult(true, null);
      }
    }, "a1c1ad1782aec179302ec8374d5753ec", "8fe925eaa1fbce43b04174bc6eeefda5");
    final SupportSQLiteOpenHelper.Configuration _sqliteConfig = SupportSQLiteOpenHelper.Configuration.builder(config.context).name(config.name).callback(_openCallback).build();
    final SupportSQLiteOpenHelper _helper = config.sqliteOpenHelperFactory.create(_sqliteConfig);
    return _helper;
  }

  @Override
  @NonNull
  protected InvalidationTracker createInvalidationTracker() {
    final HashMap<String, String> _shadowTablesMap = new HashMap<String, String>(0);
    final HashMap<String, Set<String>> _viewTables = new HashMap<String, Set<String>>(0);
    return new InvalidationTracker(this, _shadowTablesMap, _viewTables, "workout_plans","exercises","workout_sessions","workout_sets");
  }

  @Override
  public void clearAllTables() {
    super.assertNotMainThread();
    final SupportSQLiteDatabase _db = super.getOpenHelper().getWritableDatabase();
    final boolean _supportsDeferForeignKeys = android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.LOLLIPOP;
    try {
      if (!_supportsDeferForeignKeys) {
        _db.execSQL("PRAGMA foreign_keys = FALSE");
      }
      super.beginTransaction();
      if (_supportsDeferForeignKeys) {
        _db.execSQL("PRAGMA defer_foreign_keys = TRUE");
      }
      _db.execSQL("DELETE FROM `workout_plans`");
      _db.execSQL("DELETE FROM `exercises`");
      _db.execSQL("DELETE FROM `workout_sessions`");
      _db.execSQL("DELETE FROM `workout_sets`");
      super.setTransactionSuccessful();
    } finally {
      super.endTransaction();
      if (!_supportsDeferForeignKeys) {
        _db.execSQL("PRAGMA foreign_keys = TRUE");
      }
      _db.query("PRAGMA wal_checkpoint(FULL)").close();
      if (!_db.inTransaction()) {
        _db.execSQL("VACUUM");
      }
    }
  }

  @Override
  @NonNull
  protected Map<Class<?>, List<Class<?>>> getRequiredTypeConverters() {
    final HashMap<Class<?>, List<Class<?>>> _typeConvertersMap = new HashMap<Class<?>, List<Class<?>>>();
    _typeConvertersMap.put(WorkoutPlanDao.class, WorkoutPlanDao_Impl.getRequiredConverters());
    _typeConvertersMap.put(ExerciseDao.class, ExerciseDao_Impl.getRequiredConverters());
    _typeConvertersMap.put(WorkoutSessionDao.class, WorkoutSessionDao_Impl.getRequiredConverters());
    _typeConvertersMap.put(WorkoutSetDao.class, WorkoutSetDao_Impl.getRequiredConverters());
    return _typeConvertersMap;
  }

  @Override
  @NonNull
  public Set<Class<? extends AutoMigrationSpec>> getRequiredAutoMigrationSpecs() {
    final HashSet<Class<? extends AutoMigrationSpec>> _autoMigrationSpecsSet = new HashSet<Class<? extends AutoMigrationSpec>>();
    return _autoMigrationSpecsSet;
  }

  @Override
  @NonNull
  public List<Migration> getAutoMigrations(
      @NonNull final Map<Class<? extends AutoMigrationSpec>, AutoMigrationSpec> autoMigrationSpecs) {
    final List<Migration> _autoMigrations = new ArrayList<Migration>();
    return _autoMigrations;
  }

  @Override
  public WorkoutPlanDao workoutPlanDao() {
    if (_workoutPlanDao != null) {
      return _workoutPlanDao;
    } else {
      synchronized(this) {
        if(_workoutPlanDao == null) {
          _workoutPlanDao = new WorkoutPlanDao_Impl(this);
        }
        return _workoutPlanDao;
      }
    }
  }

  @Override
  public ExerciseDao exerciseDao() {
    if (_exerciseDao != null) {
      return _exerciseDao;
    } else {
      synchronized(this) {
        if(_exerciseDao == null) {
          _exerciseDao = new ExerciseDao_Impl(this);
        }
        return _exerciseDao;
      }
    }
  }

  @Override
  public WorkoutSessionDao workoutSessionDao() {
    if (_workoutSessionDao != null) {
      return _workoutSessionDao;
    } else {
      synchronized(this) {
        if(_workoutSessionDao == null) {
          _workoutSessionDao = new WorkoutSessionDao_Impl(this);
        }
        return _workoutSessionDao;
      }
    }
  }

  @Override
  public WorkoutSetDao workoutSetDao() {
    if (_workoutSetDao != null) {
      return _workoutSetDao;
    } else {
      synchronized(this) {
        if(_workoutSetDao == null) {
          _workoutSetDao = new WorkoutSetDao_Impl(this);
        }
        return _workoutSetDao;
      }
    }
  }
}
