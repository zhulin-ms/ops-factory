package db.migration.common;

import java.sql.Connection;
import org.flywaydb.core.api.migration.Context;

public class V3__add_job_progress_columns extends BaseMetadataMigration {

    @Override
    public void migrate(Context context) throws Exception {
        Connection connection = context.getConnection();
        executeIfMissing(connection, "ingestion_job", "stage",
            "alter table ingestion_job add column stage TEXT");
        executeIfMissing(connection, "ingestion_job", "created_by",
            "alter table ingestion_job add column created_by TEXT");
        executeIfMissing(connection, "ingestion_job", "total_documents",
            "alter table ingestion_job add column total_documents INTEGER NOT NULL DEFAULT 0");
        executeIfMissing(connection, "ingestion_job", "processed_documents",
            "alter table ingestion_job add column processed_documents INTEGER NOT NULL DEFAULT 0");
        executeIfMissing(connection, "ingestion_job", "success_documents",
            "alter table ingestion_job add column success_documents INTEGER NOT NULL DEFAULT 0");
        executeIfMissing(connection, "ingestion_job", "failed_documents",
            "alter table ingestion_job add column failed_documents INTEGER NOT NULL DEFAULT 0");
        executeIfMissing(connection, "ingestion_job", "current_document_id",
            "alter table ingestion_job add column current_document_id TEXT");
        executeIfMissing(connection, "ingestion_job", "current_document_name",
            "alter table ingestion_job add column current_document_name TEXT");
        executeIfMissing(connection, "ingestion_job", "error_summary",
            "alter table ingestion_job add column error_summary TEXT");
    }
}
