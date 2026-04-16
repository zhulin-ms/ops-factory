package db.migration.common;

import java.sql.Connection;
import org.flywaydb.core.api.migration.Context;

public class V5__add_profile_scope_columns extends BaseMetadataMigration {

    @Override
    public void migrate(Context context) throws Exception {
        Connection connection = context.getConnection();

        addProfileColumns(connection, "index_profile");
        addProfileColumns(connection, "retrieval_profile");

        executeQuietly(connection,
            "create unique index if not exists uk_index_profile_owner_source_id on index_profile(owner_source_id)");
        executeQuietly(connection,
            "create unique index if not exists uk_retrieval_profile_owner_source_id on retrieval_profile(owner_source_id)");

        executeQuietly(connection,
            "update index_profile set readonly = 1, owner_source_id = null, derived_from_profile_id = null where name = 'system-default-index'");
        executeQuietly(connection,
            "update retrieval_profile set readonly = 1, owner_source_id = null, derived_from_profile_id = null where name = 'system-default-retrieval'");
    }

    private void addProfileColumns(Connection connection, String tableName) throws Exception {
        executeIfMissing(connection, tableName, "owner_source_id",
            "alter table " + tableName + " add column owner_source_id TEXT");
        executeIfMissing(connection, tableName, "readonly",
            "alter table " + tableName + " add column readonly INTEGER NOT NULL DEFAULT 0");
        executeIfMissing(connection, tableName, "derived_from_profile_id",
            "alter table " + tableName + " add column derived_from_profile_id TEXT");
    }
}
