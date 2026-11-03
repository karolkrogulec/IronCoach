package com.ironcoach.app.data.local.dao;

import android.database.Cursor;
import android.os.CancellationSignal;
import androidx.annotation.NonNull;
import androidx.annotation.Nullable;
import androidx.room.CoroutinesRoom;
import androidx.room.EntityDeletionOrUpdateAdapter;
import androidx.room.EntityInsertionAdapter;
import androidx.room.RoomDatabase;
import androidx.room.RoomSQLiteQuery;
import androidx.room.SharedSQLiteStatement;
import androidx.room.util.CursorUtil;
import androidx.room.util.DBUtil;
import androidx.sqlite.db.SupportSQLiteStatement;
import com.ironcoach.app.data.local.entity.WorkoutSessionEntity;
import java.lang.Class;
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
public final class WorkoutSessionDao_Impl implements WorkoutSessionDao {
  private final RoomDatabase __db;

  private final EntityInsertionAdapter<WorkoutSessionEntity> __insertionAdapterOfWorkoutSessionEntity;

  private final EntityDeletionOrUpdateAdapter<WorkoutSessionEntity> __updateAdapterOfWorkoutSessionEntity;

  private final SharedSQLiteStatement __preparedStmtOfDeleteSessionById;

  public WorkoutSessionDao_Impl(@NonNull final RoomDatabase __db) {
    this.__db = __db;
    this.__insertionAdapterOfWorkoutSessionEntity = new EntityInsertionAdapter<WorkoutSessionEntity>(__db) {
      @Override
      @NonNull
      protected String createQuery() {
        return "INSERT OR REPLACE INTO `workout_sessions` (`id`,`planId`,`planName`,`startTimeMs`,`endTimeMs`,`isFinished`,`totalVolumeKg`,`totalSetsCompleted`,`notes`,`coachFeedback`) VALUES (nullif(?, 0),?,?,?,?,?,?,?,?,?)";
      }

      @Override
      protected void bind(@NonNull final SupportSQLiteStatement statement,
          @NonNull final WorkoutSessionEntity entity) {
        statement.bindLong(1, entity.getId());
        statement.bindLong(2, entity.getPlanId());
        statement.bindString(3, entity.getPlanName());
        statement.bindLong(4, entity.getStartTimeMs());
        if (entity.getEndTimeMs() == null) {
          statement.bindNull(5);
        } else {
          statement.bindLong(5, entity.getEndTimeMs());
        }
        final int _tmp = entity.isFinished() ? 1 : 0;
        statement.bindLong(6, _tmp);
        statement.bindDouble(7, entity.getTotalVolumeKg());
        statement.bindLong(8, entity.getTotalSetsCompleted());
        statement.bindString(9, entity.getNotes());
        if (entity.getCoachFeedback() == null) {
          statement.bindNull(10);
        } else {
          statement.bindString(10, entity.getCoachFeedback());
        }
      }
    };
    this.__updateAdapterOfWorkoutSessionEntity = new EntityDeletionOrUpdateAdapter<WorkoutSessionEntity>(__db) {
      @Override
      @NonNull
      protected String createQuery() {
        return "UPDATE OR ABORT `workout_sessions` SET `id` = ?,`planId` = ?,`planName` = ?,`startTimeMs` = ?,`endTimeMs` = ?,`isFinished` = ?,`totalVolumeKg` = ?,`totalSetsCompleted` = ?,`notes` = ?,`coachFeedback` = ? WHERE `id` = ?";
      }

      @Override
      protected void bind(@NonNull final SupportSQLiteStatement statement,
          @NonNull final WorkoutSessionEntity entity) {
        statement.bindLong(1, entity.getId());
        statement.bindLong(2, entity.getPlanId());
        statement.bindString(3, entity.getPlanName());
        statement.bindLong(4, entity.getStartTimeMs());
        if (entity.getEndTimeMs() == null) {
          statement.bindNull(5);
        } else {
          statement.bindLong(5, entity.getEndTimeMs());
        }
        final int _tmp = entity.isFinished() ? 1 : 0;
        statement.bindLong(6, _tmp);
        statement.bindDouble(7, entity.getTotalVolumeKg());
        statement.bindLong(8, entity.getTotalSetsCompleted());
        statement.bindString(9, entity.getNotes());
        if (entity.getCoachFeedback() == null) {
          statement.bindNull(10);
        } else {
          statement.bindString(10, entity.getCoachFeedback());
        }
        statement.bindLong(11, entity.getId());
      }
    };
    this.__preparedStmtOfDeleteSessionById = new SharedSQLiteStatement(__db) {
      @Override
      @NonNull
      public String createQuery() {
        final String _query = "DELETE FROM workout_sessions WHERE id = ?";
        return _query;
      }
    };
  }

  @Override
  public Object insertSession(final WorkoutSessionEntity session,
      final Continuation<? super Long> $completion) {
    return CoroutinesRoom.execute(__db, true, new Callable<Long>() {
      @Override
      @NonNull
      public Long call() throws Exception {
        __db.beginTransaction();
        try {
          final Long _result = __insertionAdapterOfWorkoutSessionEntity.insertAndReturnId(session);
          __db.setTransactionSuccessful();
          return _result;
        } finally {
          __db.endTransaction();
        }
      }
    }, $completion);
  }

  @Override
  public Object updateSession(final WorkoutSessionEntity session,
      final Continuation<? super Unit> $completion) {
    return CoroutinesRoom.execute(__db, true, new Callable<Unit>() {
      @Override
      @NonNull
      public Unit call() throws Exception {
        __db.beginTransaction();
        try {
          __updateAdapterOfWorkoutSessionEntity.handle(session);
          __db.setTransactionSuccessful();
          return Unit.INSTANCE;
        } finally {
          __db.endTransaction();
        }
      }
    }, $completion);
  }

  @Override
  public Object deleteSessionById(final long sessionId,
      final Continuation<? super Unit> $completion) {
    return CoroutinesRoom.execute(__db, true, new Callable<Unit>() {
      @Override
      @NonNull
      public Unit call() throws Exception {
        final SupportSQLiteStatement _stmt = __preparedStmtOfDeleteSessionById.acquire();
        int _argIndex = 1;
        _stmt.bindLong(_argIndex, sessionId);
        try {
          __db.beginTransaction();
          try {
            _stmt.executeUpdateDelete();
            __db.setTransactionSuccessful();
            return Unit.INSTANCE;
          } finally {
            __db.endTransaction();
          }
        } finally {
          __preparedStmtOfDeleteSessionById.release(_stmt);
        }
      }
    }, $completion);
  }

  @Override
  public Flow<List<WorkoutSessionEntity>> getAllSessions() {
    final String _sql = "SELECT * FROM workout_sessions ORDER BY startTimeMs DESC";
    final RoomSQLiteQuery _statement = RoomSQLiteQuery.acquire(_sql, 0);
    return CoroutinesRoom.createFlow(__db, false, new String[] {"workout_sessions"}, new Callable<List<WorkoutSessionEntity>>() {
      @Override
      @NonNull
      public List<WorkoutSessionEntity> call() throws Exception {
        final Cursor _cursor = DBUtil.query(__db, _statement, false, null);
        try {
          final int _cursorIndexOfId = CursorUtil.getColumnIndexOrThrow(_cursor, "id");
          final int _cursorIndexOfPlanId = CursorUtil.getColumnIndexOrThrow(_cursor, "planId");
          final int _cursorIndexOfPlanName = CursorUtil.getColumnIndexOrThrow(_cursor, "planName");
          final int _cursorIndexOfStartTimeMs = CursorUtil.getColumnIndexOrThrow(_cursor, "startTimeMs");
          final int _cursorIndexOfEndTimeMs = CursorUtil.getColumnIndexOrThrow(_cursor, "endTimeMs");
          final int _cursorIndexOfIsFinished = CursorUtil.getColumnIndexOrThrow(_cursor, "isFinished");
          final int _cursorIndexOfTotalVolumeKg = CursorUtil.getColumnIndexOrThrow(_cursor, "totalVolumeKg");
          final int _cursorIndexOfTotalSetsCompleted = CursorUtil.getColumnIndexOrThrow(_cursor, "totalSetsCompleted");
          final int _cursorIndexOfNotes = CursorUtil.getColumnIndexOrThrow(_cursor, "notes");
          final int _cursorIndexOfCoachFeedback = CursorUtil.getColumnIndexOrThrow(_cursor, "coachFeedback");
          final List<WorkoutSessionEntity> _result = new ArrayList<WorkoutSessionEntity>(_cursor.getCount());
          while (_cursor.moveToNext()) {
            final WorkoutSessionEntity _item;
            final long _tmpId;
            _tmpId = _cursor.getLong(_cursorIndexOfId);
            final long _tmpPlanId;
            _tmpPlanId = _cursor.getLong(_cursorIndexOfPlanId);
            final String _tmpPlanName;
            _tmpPlanName = _cursor.getString(_cursorIndexOfPlanName);
            final long _tmpStartTimeMs;
            _tmpStartTimeMs = _cursor.getLong(_cursorIndexOfStartTimeMs);
            final Long _tmpEndTimeMs;
            if (_cursor.isNull(_cursorIndexOfEndTimeMs)) {
              _tmpEndTimeMs = null;
            } else {
              _tmpEndTimeMs = _cursor.getLong(_cursorIndexOfEndTimeMs);
            }
            final boolean _tmpIsFinished;
            final int _tmp;
            _tmp = _cursor.getInt(_cursorIndexOfIsFinished);
            _tmpIsFinished = _tmp != 0;
            final double _tmpTotalVolumeKg;
            _tmpTotalVolumeKg = _cursor.getDouble(_cursorIndexOfTotalVolumeKg);
            final int _tmpTotalSetsCompleted;
            _tmpTotalSetsCompleted = _cursor.getInt(_cursorIndexOfTotalSetsCompleted);
            final String _tmpNotes;
            _tmpNotes = _cursor.getString(_cursorIndexOfNotes);
            final String _tmpCoachFeedback;
            if (_cursor.isNull(_cursorIndexOfCoachFeedback)) {
              _tmpCoachFeedback = null;
            } else {
              _tmpCoachFeedback = _cursor.getString(_cursorIndexOfCoachFeedback);
            }
            _item = new WorkoutSessionEntity(_tmpId,_tmpPlanId,_tmpPlanName,_tmpStartTimeMs,_tmpEndTimeMs,_tmpIsFinished,_tmpTotalVolumeKg,_tmpTotalSetsCompleted,_tmpNotes,_tmpCoachFeedback);
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
  public Object getActiveSession(final Continuation<? super WorkoutSessionEntity> $completion) {
    final String _sql = "SELECT * FROM workout_sessions WHERE isFinished = 0 LIMIT 1";
    final RoomSQLiteQuery _statement = RoomSQLiteQuery.acquire(_sql, 0);
    final CancellationSignal _cancellationSignal = DBUtil.createCancellationSignal();
    return CoroutinesRoom.execute(__db, false, _cancellationSignal, new Callable<WorkoutSessionEntity>() {
      @Override
      @Nullable
      public WorkoutSessionEntity call() throws Exception {
        final Cursor _cursor = DBUtil.query(__db, _statement, false, null);
        try {
          final int _cursorIndexOfId = CursorUtil.getColumnIndexOrThrow(_cursor, "id");
          final int _cursorIndexOfPlanId = CursorUtil.getColumnIndexOrThrow(_cursor, "planId");
          final int _cursorIndexOfPlanName = CursorUtil.getColumnIndexOrThrow(_cursor, "planName");
          final int _cursorIndexOfStartTimeMs = CursorUtil.getColumnIndexOrThrow(_cursor, "startTimeMs");
          final int _cursorIndexOfEndTimeMs = CursorUtil.getColumnIndexOrThrow(_cursor, "endTimeMs");
          final int _cursorIndexOfIsFinished = CursorUtil.getColumnIndexOrThrow(_cursor, "isFinished");
          final int _cursorIndexOfTotalVolumeKg = CursorUtil.getColumnIndexOrThrow(_cursor, "totalVolumeKg");
          final int _cursorIndexOfTotalSetsCompleted = CursorUtil.getColumnIndexOrThrow(_cursor, "totalSetsCompleted");
          final int _cursorIndexOfNotes = CursorUtil.getColumnIndexOrThrow(_cursor, "notes");
          final int _cursorIndexOfCoachFeedback = CursorUtil.getColumnIndexOrThrow(_cursor, "coachFeedback");
          final WorkoutSessionEntity _result;
          if (_cursor.moveToFirst()) {
            final long _tmpId;
            _tmpId = _cursor.getLong(_cursorIndexOfId);
            final long _tmpPlanId;
            _tmpPlanId = _cursor.getLong(_cursorIndexOfPlanId);
            final String _tmpPlanName;
            _tmpPlanName = _cursor.getString(_cursorIndexOfPlanName);
            final long _tmpStartTimeMs;
            _tmpStartTimeMs = _cursor.getLong(_cursorIndexOfStartTimeMs);
            final Long _tmpEndTimeMs;
            if (_cursor.isNull(_cursorIndexOfEndTimeMs)) {
              _tmpEndTimeMs = null;
            } else {
              _tmpEndTimeMs = _cursor.getLong(_cursorIndexOfEndTimeMs);
            }
            final boolean _tmpIsFinished;
            final int _tmp;
            _tmp = _cursor.getInt(_cursorIndexOfIsFinished);
            _tmpIsFinished = _tmp != 0;
            final double _tmpTotalVolumeKg;
            _tmpTotalVolumeKg = _cursor.getDouble(_cursorIndexOfTotalVolumeKg);
            final int _tmpTotalSetsCompleted;
            _tmpTotalSetsCompleted = _cursor.getInt(_cursorIndexOfTotalSetsCompleted);
            final String _tmpNotes;
            _tmpNotes = _cursor.getString(_cursorIndexOfNotes);
            final String _tmpCoachFeedback;
            if (_cursor.isNull(_cursorIndexOfCoachFeedback)) {
              _tmpCoachFeedback = null;
            } else {
              _tmpCoachFeedback = _cursor.getString(_cursorIndexOfCoachFeedback);
            }
            _result = new WorkoutSessionEntity(_tmpId,_tmpPlanId,_tmpPlanName,_tmpStartTimeMs,_tmpEndTimeMs,_tmpIsFinished,_tmpTotalVolumeKg,_tmpTotalSetsCompleted,_tmpNotes,_tmpCoachFeedback);
          } else {
            _result = null;
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
  public Object getSessionById(final long sessionId,
      final Continuation<? super WorkoutSessionEntity> $completion) {
    final String _sql = "SELECT * FROM workout_sessions WHERE id = ?";
    final RoomSQLiteQuery _statement = RoomSQLiteQuery.acquire(_sql, 1);
    int _argIndex = 1;
    _statement.bindLong(_argIndex, sessionId);
    final CancellationSignal _cancellationSignal = DBUtil.createCancellationSignal();
    return CoroutinesRoom.execute(__db, false, _cancellationSignal, new Callable<WorkoutSessionEntity>() {
      @Override
      @Nullable
      public WorkoutSessionEntity call() throws Exception {
        final Cursor _cursor = DBUtil.query(__db, _statement, false, null);
        try {
          final int _cursorIndexOfId = CursorUtil.getColumnIndexOrThrow(_cursor, "id");
          final int _cursorIndexOfPlanId = CursorUtil.getColumnIndexOrThrow(_cursor, "planId");
          final int _cursorIndexOfPlanName = CursorUtil.getColumnIndexOrThrow(_cursor, "planName");
          final int _cursorIndexOfStartTimeMs = CursorUtil.getColumnIndexOrThrow(_cursor, "startTimeMs");
          final int _cursorIndexOfEndTimeMs = CursorUtil.getColumnIndexOrThrow(_cursor, "endTimeMs");
          final int _cursorIndexOfIsFinished = CursorUtil.getColumnIndexOrThrow(_cursor, "isFinished");
          final int _cursorIndexOfTotalVolumeKg = CursorUtil.getColumnIndexOrThrow(_cursor, "totalVolumeKg");
          final int _cursorIndexOfTotalSetsCompleted = CursorUtil.getColumnIndexOrThrow(_cursor, "totalSetsCompleted");
          final int _cursorIndexOfNotes = CursorUtil.getColumnIndexOrThrow(_cursor, "notes");
          final int _cursorIndexOfCoachFeedback = CursorUtil.getColumnIndexOrThrow(_cursor, "coachFeedback");
          final WorkoutSessionEntity _result;
          if (_cursor.moveToFirst()) {
            final long _tmpId;
            _tmpId = _cursor.getLong(_cursorIndexOfId);
            final long _tmpPlanId;
            _tmpPlanId = _cursor.getLong(_cursorIndexOfPlanId);
            final String _tmpPlanName;
            _tmpPlanName = _cursor.getString(_cursorIndexOfPlanName);
            final long _tmpStartTimeMs;
            _tmpStartTimeMs = _cursor.getLong(_cursorIndexOfStartTimeMs);
            final Long _tmpEndTimeMs;
            if (_cursor.isNull(_cursorIndexOfEndTimeMs)) {
              _tmpEndTimeMs = null;
            } else {
              _tmpEndTimeMs = _cursor.getLong(_cursorIndexOfEndTimeMs);
            }
            final boolean _tmpIsFinished;
            final int _tmp;
            _tmp = _cursor.getInt(_cursorIndexOfIsFinished);
            _tmpIsFinished = _tmp != 0;
            final double _tmpTotalVolumeKg;
            _tmpTotalVolumeKg = _cursor.getDouble(_cursorIndexOfTotalVolumeKg);
            final int _tmpTotalSetsCompleted;
            _tmpTotalSetsCompleted = _cursor.getInt(_cursorIndexOfTotalSetsCompleted);
            final String _tmpNotes;
            _tmpNotes = _cursor.getString(_cursorIndexOfNotes);
            final String _tmpCoachFeedback;
            if (_cursor.isNull(_cursorIndexOfCoachFeedback)) {
              _tmpCoachFeedback = null;
            } else {
              _tmpCoachFeedback = _cursor.getString(_cursorIndexOfCoachFeedback);
            }
            _result = new WorkoutSessionEntity(_tmpId,_tmpPlanId,_tmpPlanName,_tmpStartTimeMs,_tmpEndTimeMs,_tmpIsFinished,_tmpTotalVolumeKg,_tmpTotalSetsCompleted,_tmpNotes,_tmpCoachFeedback);
          } else {
            _result = null;
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
  public Flow<WorkoutSessionEntity> getSessionFlowById(final long sessionId) {
    final String _sql = "SELECT * FROM workout_sessions WHERE id = ?";
    final RoomSQLiteQuery _statement = RoomSQLiteQuery.acquire(_sql, 1);
    int _argIndex = 1;
    _statement.bindLong(_argIndex, sessionId);
    return CoroutinesRoom.createFlow(__db, false, new String[] {"workout_sessions"}, new Callable<WorkoutSessionEntity>() {
      @Override
      @Nullable
      public WorkoutSessionEntity call() throws Exception {
        final Cursor _cursor = DBUtil.query(__db, _statement, false, null);
        try {
          final int _cursorIndexOfId = CursorUtil.getColumnIndexOrThrow(_cursor, "id");
          final int _cursorIndexOfPlanId = CursorUtil.getColumnIndexOrThrow(_cursor, "planId");
          final int _cursorIndexOfPlanName = CursorUtil.getColumnIndexOrThrow(_cursor, "planName");
          final int _cursorIndexOfStartTimeMs = CursorUtil.getColumnIndexOrThrow(_cursor, "startTimeMs");
          final int _cursorIndexOfEndTimeMs = CursorUtil.getColumnIndexOrThrow(_cursor, "endTimeMs");
          final int _cursorIndexOfIsFinished = CursorUtil.getColumnIndexOrThrow(_cursor, "isFinished");
          final int _cursorIndexOfTotalVolumeKg = CursorUtil.getColumnIndexOrThrow(_cursor, "totalVolumeKg");
          final int _cursorIndexOfTotalSetsCompleted = CursorUtil.getColumnIndexOrThrow(_cursor, "totalSetsCompleted");
          final int _cursorIndexOfNotes = CursorUtil.getColumnIndexOrThrow(_cursor, "notes");
          final int _cursorIndexOfCoachFeedback = CursorUtil.getColumnIndexOrThrow(_cursor, "coachFeedback");
          final WorkoutSessionEntity _result;
          if (_cursor.moveToFirst()) {
            final long _tmpId;
            _tmpId = _cursor.getLong(_cursorIndexOfId);
            final long _tmpPlanId;
            _tmpPlanId = _cursor.getLong(_cursorIndexOfPlanId);
            final String _tmpPlanName;
            _tmpPlanName = _cursor.getString(_cursorIndexOfPlanName);
            final long _tmpStartTimeMs;
            _tmpStartTimeMs = _cursor.getLong(_cursorIndexOfStartTimeMs);
            final Long _tmpEndTimeMs;
            if (_cursor.isNull(_cursorIndexOfEndTimeMs)) {
              _tmpEndTimeMs = null;
            } else {
              _tmpEndTimeMs = _cursor.getLong(_cursorIndexOfEndTimeMs);
            }
            final boolean _tmpIsFinished;
            final int _tmp;
            _tmp = _cursor.getInt(_cursorIndexOfIsFinished);
            _tmpIsFinished = _tmp != 0;
            final double _tmpTotalVolumeKg;
            _tmpTotalVolumeKg = _cursor.getDouble(_cursorIndexOfTotalVolumeKg);
            final int _tmpTotalSetsCompleted;
            _tmpTotalSetsCompleted = _cursor.getInt(_cursorIndexOfTotalSetsCompleted);
            final String _tmpNotes;
            _tmpNotes = _cursor.getString(_cursorIndexOfNotes);
            final String _tmpCoachFeedback;
            if (_cursor.isNull(_cursorIndexOfCoachFeedback)) {
              _tmpCoachFeedback = null;
            } else {
              _tmpCoachFeedback = _cursor.getString(_cursorIndexOfCoachFeedback);
            }
            _result = new WorkoutSessionEntity(_tmpId,_tmpPlanId,_tmpPlanName,_tmpStartTimeMs,_tmpEndTimeMs,_tmpIsFinished,_tmpTotalVolumeKg,_tmpTotalSetsCompleted,_tmpNotes,_tmpCoachFeedback);
          } else {
            _result = null;
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
  public Flow<List<WorkoutSessionEntity>> getRecentCompletedSessions() {
    final String _sql = "SELECT * FROM workout_sessions WHERE isFinished = 1 ORDER BY startTimeMs DESC LIMIT 10";
    final RoomSQLiteQuery _statement = RoomSQLiteQuery.acquire(_sql, 0);
    return CoroutinesRoom.createFlow(__db, false, new String[] {"workout_sessions"}, new Callable<List<WorkoutSessionEntity>>() {
      @Override
      @NonNull
      public List<WorkoutSessionEntity> call() throws Exception {
        final Cursor _cursor = DBUtil.query(__db, _statement, false, null);
        try {
          final int _cursorIndexOfId = CursorUtil.getColumnIndexOrThrow(_cursor, "id");
          final int _cursorIndexOfPlanId = CursorUtil.getColumnIndexOrThrow(_cursor, "planId");
          final int _cursorIndexOfPlanName = CursorUtil.getColumnIndexOrThrow(_cursor, "planName");
          final int _cursorIndexOfStartTimeMs = CursorUtil.getColumnIndexOrThrow(_cursor, "startTimeMs");
          final int _cursorIndexOfEndTimeMs = CursorUtil.getColumnIndexOrThrow(_cursor, "endTimeMs");
          final int _cursorIndexOfIsFinished = CursorUtil.getColumnIndexOrThrow(_cursor, "isFinished");
          final int _cursorIndexOfTotalVolumeKg = CursorUtil.getColumnIndexOrThrow(_cursor, "totalVolumeKg");
          final int _cursorIndexOfTotalSetsCompleted = CursorUtil.getColumnIndexOrThrow(_cursor, "totalSetsCompleted");
          final int _cursorIndexOfNotes = CursorUtil.getColumnIndexOrThrow(_cursor, "notes");
          final int _cursorIndexOfCoachFeedback = CursorUtil.getColumnIndexOrThrow(_cursor, "coachFeedback");
          final List<WorkoutSessionEntity> _result = new ArrayList<WorkoutSessionEntity>(_cursor.getCount());
          while (_cursor.moveToNext()) {
            final WorkoutSessionEntity _item;
            final long _tmpId;
            _tmpId = _cursor.getLong(_cursorIndexOfId);
            final long _tmpPlanId;
            _tmpPlanId = _cursor.getLong(_cursorIndexOfPlanId);
            final String _tmpPlanName;
            _tmpPlanName = _cursor.getString(_cursorIndexOfPlanName);
            final long _tmpStartTimeMs;
            _tmpStartTimeMs = _cursor.getLong(_cursorIndexOfStartTimeMs);
            final Long _tmpEndTimeMs;
            if (_cursor.isNull(_cursorIndexOfEndTimeMs)) {
              _tmpEndTimeMs = null;
            } else {
              _tmpEndTimeMs = _cursor.getLong(_cursorIndexOfEndTimeMs);
            }
            final boolean _tmpIsFinished;
            final int _tmp;
            _tmp = _cursor.getInt(_cursorIndexOfIsFinished);
            _tmpIsFinished = _tmp != 0;
            final double _tmpTotalVolumeKg;
            _tmpTotalVolumeKg = _cursor.getDouble(_cursorIndexOfTotalVolumeKg);
            final int _tmpTotalSetsCompleted;
            _tmpTotalSetsCompleted = _cursor.getInt(_cursorIndexOfTotalSetsCompleted);
            final String _tmpNotes;
            _tmpNotes = _cursor.getString(_cursorIndexOfNotes);
            final String _tmpCoachFeedback;
            if (_cursor.isNull(_cursorIndexOfCoachFeedback)) {
              _tmpCoachFeedback = null;
            } else {
              _tmpCoachFeedback = _cursor.getString(_cursorIndexOfCoachFeedback);
            }
            _item = new WorkoutSessionEntity(_tmpId,_tmpPlanId,_tmpPlanName,_tmpStartTimeMs,_tmpEndTimeMs,_tmpIsFinished,_tmpTotalVolumeKg,_tmpTotalSetsCompleted,_tmpNotes,_tmpCoachFeedback);
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

  @NonNull
  public static List<Class<?>> getRequiredConverters() {
    return Collections.emptyList();
  }
}
