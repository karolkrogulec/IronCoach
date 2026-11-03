package com.ironcoach.app.data.local.dao;

import android.database.Cursor;
import android.os.CancellationSignal;
import androidx.annotation.NonNull;
import androidx.room.CoroutinesRoom;
import androidx.room.EntityDeletionOrUpdateAdapter;
import androidx.room.EntityInsertionAdapter;
import androidx.room.RoomDatabase;
import androidx.room.RoomSQLiteQuery;
import androidx.room.util.CursorUtil;
import androidx.room.util.DBUtil;
import androidx.sqlite.db.SupportSQLiteStatement;
import com.ironcoach.app.data.local.entity.WorkoutSetEntity;
import java.lang.Class;
import java.lang.Double;
import java.lang.Exception;
import java.lang.Long;
import java.lang.Object;
import java.lang.Override;
import java.lang.String;
import java.lang.SuppressWarnings;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.concurrent.Callable;
import javax.annotation.processing.Generated;
import kotlin.Unit;
import kotlin.coroutines.Continuation;
import kotlinx.coroutines.flow.Flow;

@Generated("androidx.room.RoomProcessor")
@SuppressWarnings({"unchecked", "deprecation"})
public final class WorkoutSetDao_Impl implements WorkoutSetDao {
  private final RoomDatabase __db;

  private final EntityInsertionAdapter<WorkoutSetEntity> __insertionAdapterOfWorkoutSetEntity;

  private final EntityDeletionOrUpdateAdapter<WorkoutSetEntity> __deletionAdapterOfWorkoutSetEntity;

  private final EntityDeletionOrUpdateAdapter<WorkoutSetEntity> __updateAdapterOfWorkoutSetEntity;

  public WorkoutSetDao_Impl(@NonNull final RoomDatabase __db) {
    this.__db = __db;
    this.__insertionAdapterOfWorkoutSetEntity = new EntityInsertionAdapter<WorkoutSetEntity>(__db) {
      @Override
      @NonNull
      protected String createQuery() {
        return "INSERT OR REPLACE INTO `workout_sets` (`id`,`sessionId`,`exerciseName`,`setNumber`,`weightKg`,`reps`,`rpe`,`isCompleted`,`completedAtMs`) VALUES (nullif(?, 0),?,?,?,?,?,?,?,?)";
      }

      @Override
      protected void bind(@NonNull final SupportSQLiteStatement statement,
          @NonNull final WorkoutSetEntity entity) {
        statement.bindLong(1, entity.getId());
        statement.bindLong(2, entity.getSessionId());
        statement.bindString(3, entity.getExerciseName());
        statement.bindLong(4, entity.getSetNumber());
        statement.bindDouble(5, entity.getWeightKg());
        statement.bindLong(6, entity.getReps());
        if (entity.getRpe() == null) {
          statement.bindNull(7);
        } else {
          statement.bindDouble(7, entity.getRpe());
        }
        final int _tmp = entity.isCompleted() ? 1 : 0;
        statement.bindLong(8, _tmp);
        if (entity.getCompletedAtMs() == null) {
          statement.bindNull(9);
        } else {
          statement.bindLong(9, entity.getCompletedAtMs());
        }
      }
    };
    this.__deletionAdapterOfWorkoutSetEntity = new EntityDeletionOrUpdateAdapter<WorkoutSetEntity>(__db) {
      @Override
      @NonNull
      protected String createQuery() {
        return "DELETE FROM `workout_sets` WHERE `id` = ?";
      }

      @Override
      protected void bind(@NonNull final SupportSQLiteStatement statement,
          @NonNull final WorkoutSetEntity entity) {
        statement.bindLong(1, entity.getId());
      }
    };
    this.__updateAdapterOfWorkoutSetEntity = new EntityDeletionOrUpdateAdapter<WorkoutSetEntity>(__db) {
      @Override
      @NonNull
      protected String createQuery() {
        return "UPDATE OR ABORT `workout_sets` SET `id` = ?,`sessionId` = ?,`exerciseName` = ?,`setNumber` = ?,`weightKg` = ?,`reps` = ?,`rpe` = ?,`isCompleted` = ?,`completedAtMs` = ? WHERE `id` = ?";
      }

      @Override
      protected void bind(@NonNull final SupportSQLiteStatement statement,
          @NonNull final WorkoutSetEntity entity) {
        statement.bindLong(1, entity.getId());
        statement.bindLong(2, entity.getSessionId());
        statement.bindString(3, entity.getExerciseName());
        statement.bindLong(4, entity.getSetNumber());
        statement.bindDouble(5, entity.getWeightKg());
        statement.bindLong(6, entity.getReps());
        if (entity.getRpe() == null) {
          statement.bindNull(7);
        } else {
          statement.bindDouble(7, entity.getRpe());
        }
        final int _tmp = entity.isCompleted() ? 1 : 0;
        statement.bindLong(8, _tmp);
        if (entity.getCompletedAtMs() == null) {
          statement.bindNull(9);
        } else {
          statement.bindLong(9, entity.getCompletedAtMs());
        }
        statement.bindLong(10, entity.getId());
      }
    };
  }

  @Override
  public Object insertSet(final WorkoutSetEntity set,
      final Continuation<? super Long> $completion) {
    return CoroutinesRoom.execute(__db, true, new Callable<Long>() {
      @Override
      @NonNull
      public Long call() throws Exception {
        __db.beginTransaction();
        try {
          final Long _result = __insertionAdapterOfWorkoutSetEntity.insertAndReturnId(set);
          __db.setTransactionSuccessful();
          return _result;
        } finally {
          __db.endTransaction();
        }
      }
    }, $completion);
  }

  @Override
  public Object insertSets(final List<WorkoutSetEntity> sets,
      final Continuation<? super Unit> $completion) {
    return CoroutinesRoom.execute(__db, true, new Callable<Unit>() {
      @Override
      @NonNull
      public Unit call() throws Exception {
        __db.beginTransaction();
        try {
          __insertionAdapterOfWorkoutSetEntity.insert(sets);
          __db.setTransactionSuccessful();
          return Unit.INSTANCE;
        } finally {
          __db.endTransaction();
        }
      }
    }, $completion);
  }

  @Override
  public Object deleteSet(final WorkoutSetEntity set,
      final Continuation<? super Unit> $completion) {
    return CoroutinesRoom.execute(__db, true, new Callable<Unit>() {
      @Override
      @NonNull
      public Unit call() throws Exception {
        __db.beginTransaction();
        try {
          __deletionAdapterOfWorkoutSetEntity.handle(set);
          __db.setTransactionSuccessful();
          return Unit.INSTANCE;
        } finally {
          __db.endTransaction();
        }
      }
    }, $completion);
  }

  @Override
  public Object updateSet(final WorkoutSetEntity set,
      final Continuation<? super Unit> $completion) {
    return CoroutinesRoom.execute(__db, true, new Callable<Unit>() {
      @Override
      @NonNull
      public Unit call() throws Exception {
        __db.beginTransaction();
        try {
          __updateAdapterOfWorkoutSetEntity.handle(set);
          __db.setTransactionSuccessful();
          return Unit.INSTANCE;
        } finally {
          __db.endTransaction();
        }
      }
    }, $completion);
  }

  @Override
  public Flow<List<WorkoutSetEntity>> getSetsForSession(final long sessionId) {
    final String _sql = "SELECT * FROM workout_sets WHERE sessionId = ? ORDER BY exerciseName, setNumber ASC";
    final RoomSQLiteQuery _statement = RoomSQLiteQuery.acquire(_sql, 1);
    int _argIndex = 1;
    _statement.bindLong(_argIndex, sessionId);
    return CoroutinesRoom.createFlow(__db, false, new String[] {"workout_sets"}, new Callable<List<WorkoutSetEntity>>() {
      @Override
      @NonNull
      public List<WorkoutSetEntity> call() throws Exception {
        final Cursor _cursor = DBUtil.query(__db, _statement, false, null);
        try {
          final int _cursorIndexOfId = CursorUtil.getColumnIndexOrThrow(_cursor, "id");
          final int _cursorIndexOfSessionId = CursorUtil.getColumnIndexOrThrow(_cursor, "sessionId");
          final int _cursorIndexOfExerciseName = CursorUtil.getColumnIndexOrThrow(_cursor, "exerciseName");
          final int _cursorIndexOfSetNumber = CursorUtil.getColumnIndexOrThrow(_cursor, "setNumber");
          final int _cursorIndexOfWeightKg = CursorUtil.getColumnIndexOrThrow(_cursor, "weightKg");
          final int _cursorIndexOfReps = CursorUtil.getColumnIndexOrThrow(_cursor, "reps");
          final int _cursorIndexOfRpe = CursorUtil.getColumnIndexOrThrow(_cursor, "rpe");
          final int _cursorIndexOfIsCompleted = CursorUtil.getColumnIndexOrThrow(_cursor, "isCompleted");
          final int _cursorIndexOfCompletedAtMs = CursorUtil.getColumnIndexOrThrow(_cursor, "completedAtMs");
          final List<WorkoutSetEntity> _result = new ArrayList<WorkoutSetEntity>(_cursor.getCount());
          while (_cursor.moveToNext()) {
            final WorkoutSetEntity _item;
            final long _tmpId;
            _tmpId = _cursor.getLong(_cursorIndexOfId);
            final long _tmpSessionId;
            _tmpSessionId = _cursor.getLong(_cursorIndexOfSessionId);
            final String _tmpExerciseName;
            _tmpExerciseName = _cursor.getString(_cursorIndexOfExerciseName);
            final int _tmpSetNumber;
            _tmpSetNumber = _cursor.getInt(_cursorIndexOfSetNumber);
            final double _tmpWeightKg;
            _tmpWeightKg = _cursor.getDouble(_cursorIndexOfWeightKg);
            final int _tmpReps;
            _tmpReps = _cursor.getInt(_cursorIndexOfReps);
            final Double _tmpRpe;
            if (_cursor.isNull(_cursorIndexOfRpe)) {
              _tmpRpe = null;
            } else {
              _tmpRpe = _cursor.getDouble(_cursorIndexOfRpe);
            }
            final boolean _tmpIsCompleted;
            final int _tmp;
            _tmp = _cursor.getInt(_cursorIndexOfIsCompleted);
            _tmpIsCompleted = _tmp != 0;
            final Long _tmpCompletedAtMs;
            if (_cursor.isNull(_cursorIndexOfCompletedAtMs)) {
              _tmpCompletedAtMs = null;
            } else {
              _tmpCompletedAtMs = _cursor.getLong(_cursorIndexOfCompletedAtMs);
            }
            _item = new WorkoutSetEntity(_tmpId,_tmpSessionId,_tmpExerciseName,_tmpSetNumber,_tmpWeightKg,_tmpReps,_tmpRpe,_tmpIsCompleted,_tmpCompletedAtMs);
            _result.add(_item);
          }
          return _result;
        } finally {
          _cursor.close();
        }
      }

      @Override
      protected void finalize() {
        _statement.release();
      }
    });
  }

  @Override
  public Object getSetsForSessionDirect(final long sessionId,
      final Continuation<? super List<WorkoutSetEntity>> $completion) {
    final String _sql = "SELECT * FROM workout_sets WHERE sessionId = ? ORDER BY exerciseName, setNumber ASC";
    final RoomSQLiteQuery _statement = RoomSQLiteQuery.acquire(_sql, 1);
    int _argIndex = 1;
    _statement.bindLong(_argIndex, sessionId);
    final CancellationSignal _cancellationSignal = DBUtil.createCancellationSignal();
    return CoroutinesRoom.execute(__db, false, _cancellationSignal, new Callable<List<WorkoutSetEntity>>() {
      @Override
      @NonNull
      public List<WorkoutSetEntity> call() throws Exception {
        final Cursor _cursor = DBUtil.query(__db, _statement, false, null);
        try {
          final int _cursorIndexOfId = CursorUtil.getColumnIndexOrThrow(_cursor, "id");
          final int _cursorIndexOfSessionId = CursorUtil.getColumnIndexOrThrow(_cursor, "sessionId");
          final int _cursorIndexOfExerciseName = CursorUtil.getColumnIndexOrThrow(_cursor, "exerciseName");
          final int _cursorIndexOfSetNumber = CursorUtil.getColumnIndexOrThrow(_cursor, "setNumber");
          final int _cursorIndexOfWeightKg = CursorUtil.getColumnIndexOrThrow(_cursor, "weightKg");
          final int _cursorIndexOfReps = CursorUtil.getColumnIndexOrThrow(_cursor, "reps");
          final int _cursorIndexOfRpe = CursorUtil.getColumnIndexOrThrow(_cursor, "rpe");
          final int _cursorIndexOfIsCompleted = CursorUtil.getColumnIndexOrThrow(_cursor, "isCompleted");
          final int _cursorIndexOfCompletedAtMs = CursorUtil.getColumnIndexOrThrow(_cursor, "completedAtMs");
          final List<WorkoutSetEntity> _result = new ArrayList<WorkoutSetEntity>(_cursor.getCount());
          while (_cursor.moveToNext()) {
            final WorkoutSetEntity _item;
            final long _tmpId;
            _tmpId = _cursor.getLong(_cursorIndexOfId);
            final long _tmpSessionId;
            _tmpSessionId = _cursor.getLong(_cursorIndexOfSessionId);
            final String _tmpExerciseName;
            _tmpExerciseName = _cursor.getString(_cursorIndexOfExerciseName);
            final int _tmpSetNumber;
            _tmpSetNumber = _cursor.getInt(_cursorIndexOfSetNumber);
            final double _tmpWeightKg;
            _tmpWeightKg = _cursor.getDouble(_cursorIndexOfWeightKg);
            final int _tmpReps;
            _tmpReps = _cursor.getInt(_cursorIndexOfReps);
            final Double _tmpRpe;
            if (_cursor.isNull(_cursorIndexOfRpe)) {
              _tmpRpe = null;
            } else {
              _tmpRpe = _cursor.getDouble(_cursorIndexOfRpe);
            }
            final boolean _tmpIsCompleted;
            final int _tmp;
            _tmp = _cursor.getInt(_cursorIndexOfIsCompleted);
            _tmpIsCompleted = _tmp != 0;
            final Long _tmpCompletedAtMs;
            if (_cursor.isNull(_cursorIndexOfCompletedAtMs)) {
              _tmpCompletedAtMs = null;
            } else {
              _tmpCompletedAtMs = _cursor.getLong(_cursorIndexOfCompletedAtMs);
            }
            _item = new WorkoutSetEntity(_tmpId,_tmpSessionId,_tmpExerciseName,_tmpSetNumber,_tmpWeightKg,_tmpReps,_tmpRpe,_tmpIsCompleted,_tmpCompletedAtMs);
            _result.add(_item);
          }
          return _result;
        } finally {
          _cursor.close();
          _statement.release();
        }
      }
    }, $completion);
  }

  @Override
  public Object getRecentSetsForExercise(final String exerciseName,
      final Continuation<? super List<WorkoutSetEntity>> $completion) {
    final String _sql = "\n"
            + "        SELECT * FROM workout_sets \n"
            + "        WHERE exerciseName = ? AND isCompleted = 1 \n"
            + "        ORDER BY completedAtMs DESC LIMIT 5\n"
            + "    ";
    final RoomSQLiteQuery _statement = RoomSQLiteQuery.acquire(_sql, 1);
    int _argIndex = 1;
    _statement.bindString(_argIndex, exerciseName);
    final CancellationSignal _cancellationSignal = DBUtil.createCancellationSignal();
    return CoroutinesRoom.execute(__db, false, _cancellationSignal, new Callable<List<WorkoutSetEntity>>() {
      @Override
      @NonNull
      public List<WorkoutSetEntity> call() throws Exception {
        final Cursor _cursor = DBUtil.query(__db, _statement, false, null);
        try {
          final int _cursorIndexOfId = CursorUtil.getColumnIndexOrThrow(_cursor, "id");
          final int _cursorIndexOfSessionId = CursorUtil.getColumnIndexOrThrow(_cursor, "sessionId");
          final int _cursorIndexOfExerciseName = CursorUtil.getColumnIndexOrThrow(_cursor, "exerciseName");
          final int _cursorIndexOfSetNumber = CursorUtil.getColumnIndexOrThrow(_cursor, "setNumber");
          final int _cursorIndexOfWeightKg = CursorUtil.getColumnIndexOrThrow(_cursor, "weightKg");
          final int _cursorIndexOfReps = CursorUtil.getColumnIndexOrThrow(_cursor, "reps");
          final int _cursorIndexOfRpe = CursorUtil.getColumnIndexOrThrow(_cursor, "rpe");
          final int _cursorIndexOfIsCompleted = CursorUtil.getColumnIndexOrThrow(_cursor, "isCompleted");
          final int _cursorIndexOfCompletedAtMs = CursorUtil.getColumnIndexOrThrow(_cursor, "completedAtMs");
          final List<WorkoutSetEntity> _result = new ArrayList<WorkoutSetEntity>(_cursor.getCount());
          while (_cursor.moveToNext()) {
            final WorkoutSetEntity _item;
            final long _tmpId;
            _tmpId = _cursor.getLong(_cursorIndexOfId);
            final long _tmpSessionId;
            _tmpSessionId = _cursor.getLong(_cursorIndexOfSessionId);
            final String _tmpExerciseName;
            _tmpExerciseName = _cursor.getString(_cursorIndexOfExerciseName);
            final int _tmpSetNumber;
            _tmpSetNumber = _cursor.getInt(_cursorIndexOfSetNumber);
            final double _tmpWeightKg;
            _tmpWeightKg = _cursor.getDouble(_cursorIndexOfWeightKg);
            final int _tmpReps;
            _tmpReps = _cursor.getInt(_cursorIndexOfReps);
            final Double _tmpRpe;
            if (_cursor.isNull(_cursorIndexOfRpe)) {
              _tmpRpe = null;
            } else {
              _tmpRpe = _cursor.getDouble(_cursorIndexOfRpe);
            }
            final boolean _tmpIsCompleted;
            final int _tmp;
            _tmp = _cursor.getInt(_cursorIndexOfIsCompleted);
            _tmpIsCompleted = _tmp != 0;
            final Long _tmpCompletedAtMs;
            if (_cursor.isNull(_cursorIndexOfCompletedAtMs)) {
              _tmpCompletedAtMs = null;
            } else {
              _tmpCompletedAtMs = _cursor.getLong(_cursorIndexOfCompletedAtMs);
            }
            _item = new WorkoutSetEntity(_tmpId,_tmpSessionId,_tmpExerciseName,_tmpSetNumber,_tmpWeightKg,_tmpReps,_tmpRpe,_tmpIsCompleted,_tmpCompletedAtMs);
            _result.add(_item);
          }
          return _result;
        } finally {
          _cursor.close();
          _statement.release();
        }
      }
    }, $completion);
  }

  @NonNull
  public static List<Class<?>> getRequiredConverters() {
    return Collections.emptyList();
  }
}
