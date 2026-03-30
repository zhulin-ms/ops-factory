package db.migration.common;

import org.flywaydb.core.api.migration.Context;

public class V4__drop_legacy_embedding_record extends BaseMetadataMigration {

    @Override
    public void migrate(Context context) throws Exception {
        executeQuietly(context.getConnection(), "drop table if exists embedding_record");
    }
}
