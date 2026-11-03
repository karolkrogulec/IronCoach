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
import com.ironcoach.app.data.local.entity.ExerciseEntity;
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
public final class ExerciseDao_Impl implements ExerciseDao {
  private final RoomDatabase __db;

  private final EntityInsertionAdapter<ExerciseEntity> __insertionAdapterOfExerciseEntity;

  private final EntityDeletionOrUpdateAdapter<ExerciseEntity> __deletionAdapterOfExerciseEntity;

  private final EntityDeletionOrUpdateAdapter<ExerciseEntity> __updateAdapterOfExerciseEntity;

  public ExerciseDao_Impl(@NonNull final RoomDatabase __db) {
    this.__db = __db;
    this.__insertionAdapterOfExerciseEntity = new EntityInsertionAdapter<ExerciseEntity>(__db) {
      @Override
      @NonNull
      protected String createQuery() {
        return "INSERT OR REPLACE INTO `exercises` (`id`,`planId`,`name`,`muscleGroup`,`targetSets`,`targetReps`,`targetWeightKg`,`orderIndex`,`notes`) VALUES (nullif(?, 0),?,?,?,?,?,?,?,?)";
      }

      @Override
      protected void bind(@NonNull final SupportSQLiteStatement statement,
          @NonNull final ExerciseEntity entity) {
        statement.bindLong(1, entity.getId());
        statement.bindLong(2, entity.getPlanId());
        statement.bindString(3, entity.getName());
        statement.bindString(4, entity.getMuscleGroup());
        statement.bindLong(5, entity.getTargetSets());
        statement.bindLong(6, entity.getTargetReps());
        statement.bindDouble(7, entity.getTargetWeightKg());
        statement.bindLong(8, entity.getOrderIndex());
        statement.bindString(9, entity.getNotes());
      }
    };
    this.__deletionAdapterOfExerciseEntity = new EntityDeletionOrUpdateAdapter<ExerciseEntity>(__db) {
      @Override
      @NonNull
      protected String createQuery() {
        return "DELETE FROM `exercises` WHERE `id` = ?";
      }

      @Override
      protected void bind(@NonNull final SupportSQLiteStatement statement,
          @NonNull final ExerciseEntity entity) {
        statement.bindLong(1, entity.getId());
      }
    };
    this.__updateAdapterOfExerciseEntity = new EntityDeletionOrUpdateAdapter<ExerciseEntity>(__db) {
      @Override
      @NonNull
      protected String createQuery() {
        return "UPDATE OR ABORT `exercises` SET `id` = ?,`planId` = ?,`name` = ?,`muscleGroup` = ?,`targetSets` = ?,`targetReps` = ?,`targetWeightKg` = ?,`orderIndex` = ?,`notes` = ? WHERE `id` = ?";
      }

      @Override
      protected void bind(@NonNull final SupportSQLiteStatement statement,
          @NonNull final ExerciseEntity entity) {
        statement.bindLong(1, entity.getId());
        statement.bindLong(2, entity.getPlanId());
        statement.bindString(3, entity.getName());
        statement.bindString(4, entity.getMuscleGroup());
        statement.bindLong(5, entity.getTargetSets());
        statement.bindLong(6, entity.getTargetReps());
        statement.bindDouble(7, entity.getTargetWeightKg());
        statement.bindLong(8, entity.getOrderIndex());
        statement.bindString(9, entity.getNotes());
        statement.bindLong(10, entity.getId());
      }
    };
  }

  @Override
  public Object insertExercise(final ExerciseEntity exercise,
      final Continuation<? super Long> $completion) {
    return CoroutinesRoom.execute(__db, true, new Callable<Long>() {
      @Override
      @NonNull
      public Long call() throws Exception {
        __db.beginTransaction();
        try {
          final Long _result = __insertionAdapterOfExerciseEntity.insertAndReturnId(exercise);
          __db.setTransactionSuccessful();
          return _result;
        } finally {
          __db.endTransaction();
        }
      }
    }, $completion);
  }

  @Override
  public Object insertExercises(final List<ExerciseEntity> exercises,
      final Continuation<? super Unit> $completion) {
    return CoroutinesRoom.execute(__db, true, new Callable<Unit>() {
      @Override
      @NonNull
      public Unit call() throws Exception {
        __db.beginTransaction();
        try {
          __insertionAdapterOfExerciseEntity.insert(exercises);
          __db.setTransactionSuccessful();
          return Unit.INSTANCE;
        } finally {
          __db.endTransaction();
        }
      }
    }, $completion);
  }

  @Override
  public Object deleteExercise(final ExerciseEntity exercise,
      final Continuation<? super Unit> $completion) {
    return CoroutinesRoom.execute(__db, true, new Callable<Unit>() {
      @Override
      @NonNull
      public Unit call() throws Exception {
        __db.beginTransaction();
        try {
          __deletionAdapterOfExerciseEntity.handle(exercise);
          __db.setTransactionSuccessful();
          return Unit.INSTANCE;
        } finally {
          __db.endTransaction();
        }
      }
    }, $completion);
  }

  @Override
  public Object updateExercise(final ExerciseEntity exercise,
      final Continuation<? super Unit> $completion) {
    return CoroutinesRoom.execute(__db, true, new Callable<Unit>() {
      @Override
      @NonNull
      public Unit call() throws Exception {
        __db.beginTransaction();
        try {
          __updateAdapterOfExerciseEntity.handle(exercise);
          __db.setTransactionSuccessful();
          return Unit.INSTANCE;
        } finally {
          __db.endTransaction();
        }
      }
    }, $completion);
  }

  @Override
  public Flow<List<ExerciseEntity>> getExercisesForPlan(final long planId) {
    final String _sql = "SELECT * FROM exercises WHERE planId = ? ORDER BY orderIndex ASC";
    final RoomSQLiteQuery _statement = RoomSQLiteQuery.acquire(_sql, 1);
    int _argIndex = 1;
    _statement.bindLong(_argIndex, planId);
    return CoroutinesRoom.createFlow(__db, false, new String[] {"exercises"}, new Callable<List<ExerciseEntity>>() {
      @Override
      @NonNull
      public List<ExerciseEntity> call() throws Exception {
        final Cursor _cursor = DBUtil.query(__db, _statement, false, null);
        try {
          final int _cursorIndexOfId = CursorUtil.getColumnIndexOrThrow(_cursor, "id");
          final int _cursorIndexOfPlanId = CursorUtil.getColumnIndexOrThrow(_cursor, "planId");
          final int _cursorIndexOfName = CursorUtil.getColumnIndexOrThrow(_cursor, "name");
          final int _cursorIndexOfMuscleGroup = CursorUtil.getColumnIndexOrThrow(_cursor, "muscleGroup");
          final int _cursorIndexOfTargetSets = CursorUtil.getColumnIndexOrThrow(_cursor, "targetSets");
          final int _cursorIndexOfTargetReps = CursorUtil.getColumnIndexOrThrow(_cursor, "targetReps");
          final int _cursorIndexOfTargetWeightKg = CursorUtil.getColumnIndexOrThrow(_cursor, "targetWeightKg");
          final int _cursorIndexOfOrderIndex = CursorUtil.getColumnIndexOrThrow(_cursor, "orderIndex");
          final int _cursorIndexOfNotes = CursorUtil.getColumnIndexOrThrow(_cursor, "notes");
          final List<ExerciseEntity> _result = new ArrayList<ExerciseEntity>(_cursor.getCount());
          while (_cursor.moveToNext()) {
            final ExerciseEntity _item;
            final long _tmpId;
            _tmpId = _cursor.getLong(_cursorIndexOfId);
            final long _tmpPlanId;
            _tmpPlanId = _cursor.getLong(_cursorIndexOfPlanId);
            final String _tmpName;
            _tmpName = _cursor.getString(_cursorIndexOfName);
            final String _tmpMuscleGroup;
            _tmpMuscleGroup = _cursor.getString(_cursorIndexOfMuscleGroup);
            final int _tmpTargetSets;
            _tmpTargetSets = _cursor.getInt(_cursorIndexOfTargetSets);
            final int _tmpTargetReps;
            _tmpTargetReps = _cursor.getInt(_cursorIndexOfTargetReps);
            final double _tmpTargetWeightKg;
            _tmpTargetWeightKg = _cursor.getDouble(_cursorIndexOfTargetWeightKg);
            final int _tmpOrderIndex;
            _tmpOrderIndex = _cursor.getInt(_cursorIndexOfOrderIndex);
            final String _tmpNotes;
            _tmpNotes = _cursor.getString(_cursorIndexOfNotes);
            _item = new ExerciseEntity(_tmpId,_tmpPlanId,_tmpName,_tmpMuscleGroup,_tmpTargetSets,_tmpTargetReps,_tmpTargetWeightKg,_tmpOrderIndex,_tmpNotes);
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
  public Object getExercisesForPlanDirect(final long planId,
      final Continuation<? super List<ExerciseEntity>> $completion) {
    final String _sql = "SELECT * FROM exercises WHERE planId = ? ORDER BY orderIndex ASC";
    final RoomSQLiteQuery _statement = RoomSQLiteQuery.acquire(_sql, 1);
    int _argIndex = 1;
    _statement.bindLong(_argIndex, planId);
    final CancellationSignal _cancellationSignal = DBUtil.createCancellationSignal();
    return CoroutinesRoom.execute(__db, false, _cancellationSignal, new Callable<List<ExerciseEntity>>() {
      @Override
      @NonNull
      public List<ExerciseEntity> call() throws Exception {
        final Cursor _cursor = DBUtil.query(__db, _statement, false, null);
        try {
          final int _cursorIndexOfId = CursorUtil.getColumnIndexOrThrow(_cursor, "id");
          final int _cursorIndexOfPlanId = CursorUtil.getColumnIndexOrThrow(_cursor, "planId");
          final int _cursorIndexOfName = CursorUtil.getColumnIndexOrThrow(_cursor, "name");
          final int _cursorIndexOfMuscleGroup = CursorUtil.getColumnIndexOrThrow(_cursor, "muscleGroup");
          final int _cursorIndexOfTargetSets = CursorUtil.getColumnIndexOrThrow(_cursor, "targetSets");
          final int _cursorIndexOfTargetReps = CursorUtil.getColumnIndexOrThrow(_cursor, "targetReps");
          final int _cursorIndexOfTargetWeightKg = CursorUtil.getColumnIndexOrThrow(_cursor, "targetWeightKg");
          final int _cursorIndexOfOrderIndex = CursorUtil.getColumnIndexOrThrow(_cursor, "orderIndex");
          final int _cursorIndexOfNotes = CursorUtil.getColumnIndexOrThrow(_cursor, "notes");
          final List<ExerciseEntity> _result = new ArrayList<ExerciseEntity>(_cursor.getCount());
          while (_cursor.moveToNext()) {
            final ExerciseEntity _item;
            final long _tmpId;
            _tmpId = _cursor.getLong(_cursorIndexOfId);
            final long _tmpPlanId;
            _tmpPlanId = _cursor.getLong(_cursorIndexOfPlanId);
            final String _tmpName;
            _tmpName = _cursor.getString(_cursorIndexOfName);
            final String _tmpMuscleGroup;
            _tmpMuscleGroup = _cursor.getString(_cursorIndexOfMuscleGroup);
            final int _tmpTargetSets;
            _tmpTargetSets = _cursor.getInt(_cursorIndexOfTargetSets);
            final int _tmpTargetReps;
            _tmpTargetReps = _cursor.getInt(_cursorIndexOfTargetReps);
            final double _tmpTargetWeightKg;
            _tmpTargetWeightKg = _cursor.getDouble(_cursorIndexOfTargetWeightKg);
            final int _tmpOrderIndex;
            _tmpOrderIndex = _cursor.getInt(_cursorIndexOfOrderIndex);
            final String _tmpNotes;
            _tmpNotes = _cursor.getString(_cursorIndexOfNotes);
            _item = new ExerciseEntity(_tmpId,_tmpPlanId,_tmpName,_tmpMuscleGroup,_tmpTargetSets,_tmpTargetReps,_tmpTargetWeightKg,_tmpOrderIndex,_tmpNotes);
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
