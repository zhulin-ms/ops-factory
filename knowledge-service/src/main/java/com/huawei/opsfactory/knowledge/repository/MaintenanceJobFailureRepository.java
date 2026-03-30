package com.huawei.opsfactory.knowledge.repository;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Instant;
import java.util.List;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Repository;

@Repository
public class MaintenanceJobFailureRepository {

    private final JdbcTemplate jdbcTemplate;
    private final RowMapper<FailureRecord> mapper = this::map;

    public MaintenanceJobFailureRepository(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    public void insert(FailureRecord record) {
        jdbcTemplate.update(
            """
                insert into maintenance_job_failure (
                    id, job_id, source_id, document_id, document_name, stage, error_code, message, finished_at
                ) values (?,?,?,?,?,?,?,?,?)
                """,
            record.id(), record.jobId(), record.sourceId(), record.documentId(), record.documentName(),
            record.stage(), record.errorCode(), record.message(), record.finishedAt().toString()
        );
    }

    public List<FailureRecord> findByJobId(String jobId) {
        return jdbcTemplate.query(
            "select * from maintenance_job_failure where job_id = ? order by finished_at desc, document_name asc",
            mapper,
            jobId
        );
    }

    public void deleteByJobId(String jobId) {
        jdbcTemplate.update("delete from maintenance_job_failure where job_id = ?", jobId);
    }

    private FailureRecord map(ResultSet rs, int rowNum) throws SQLException {
        return new FailureRecord(
            rs.getString("id"),
            rs.getString("job_id"),
            rs.getString("source_id"),
            rs.getString("document_id"),
            rs.getString("document_name"),
            rs.getString("stage"),
            rs.getString("error_code"),
            rs.getString("message"),
            Instant.parse(rs.getString("finished_at"))
        );
    }

    public record FailureRecord(
        String id,
        String jobId,
        String sourceId,
        String documentId,
        String documentName,
        String stage,
        String errorCode,
        String message,
        Instant finishedAt
    ) {
    }
}
