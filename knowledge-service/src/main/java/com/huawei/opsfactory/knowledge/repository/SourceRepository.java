package com.huawei.opsfactory.knowledge.repository;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Repository;

@Repository
public class SourceRepository {

    private final JdbcTemplate jdbcTemplate;
    private final RowMapper<SourceRecord> mapper = this::map;

    public SourceRepository(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    public void insert(SourceRecord record) {
        jdbcTemplate.update(
            """
            insert into knowledge_source (
                id, name, description, status, storage_mode, index_profile_id, retrieval_profile_id,
                runtime_status, runtime_message, current_job_id, last_job_error, rebuild_required, created_at, updated_at
            ) values (?,?,?,?,?,?,?,?,?,?,?,?,?,?)
            """,
            record.id(), record.name(), record.description(), record.status(), record.storageMode(),
            record.indexProfileId(), record.retrievalProfileId(), record.runtimeStatus(), record.runtimeMessage(),
            record.currentJobId(), record.lastJobError(), record.rebuildRequired() ? 1 : 0,
            record.createdAt().toString(), record.updatedAt().toString()
        );
    }

    public List<SourceRecord> findAll() {
        return jdbcTemplate.query("select * from knowledge_source order by created_at desc", mapper);
    }

    public Optional<SourceRecord> findById(String id) {
        return jdbcTemplate.query("select * from knowledge_source where id = ?", mapper, id).stream().findFirst();
    }

    public void update(SourceRecord record) {
        jdbcTemplate.update(
            """
            update knowledge_source
            set name=?, description=?, status=?, index_profile_id=?, retrieval_profile_id=?, runtime_status=?,
                runtime_message=?, current_job_id=?, last_job_error=?, rebuild_required=?, updated_at=?
            where id=?
            """,
            record.name(), record.description(), record.status(), record.indexProfileId(), record.retrievalProfileId(),
            record.runtimeStatus(), record.runtimeMessage(), record.currentJobId(), record.lastJobError(),
            record.rebuildRequired() ? 1 : 0, record.updatedAt().toString(), record.id()
        );
    }

    public void delete(String id) {
        jdbcTemplate.update("delete from knowledge_source where id = ?", id);
    }

    private SourceRecord map(ResultSet rs, int rowNum) throws SQLException {
        return new SourceRecord(
            rs.getString("id"),
            rs.getString("name"),
            rs.getString("description"),
            rs.getString("status"),
            rs.getString("storage_mode"),
            rs.getString("index_profile_id"),
            rs.getString("retrieval_profile_id"),
            rs.getString("runtime_status"),
            rs.getString("runtime_message"),
            rs.getString("current_job_id"),
            rs.getString("last_job_error"),
            rs.getInt("rebuild_required") != 0,
            Instant.parse(rs.getString("created_at")),
            Instant.parse(rs.getString("updated_at"))
        );
    }

    public record SourceRecord(
        String id,
        String name,
        String description,
        String status,
        String storageMode,
        String indexProfileId,
        String retrievalProfileId,
        String runtimeStatus,
        String runtimeMessage,
        String currentJobId,
        String lastJobError,
        boolean rebuildRequired,
        Instant createdAt,
        Instant updatedAt
    ) {
    }
}
