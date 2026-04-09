package com.huawei.opsfactory.knowledge.repository;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.huawei.opsfactory.knowledge.common.util.Jsons;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Repository;

@Repository
public class ProfileRepository {

    private final JdbcTemplate jdbcTemplate;
    private final ObjectMapper objectMapper;
    private final RowMapper<ProfileRecord> indexMapper = (rs, rowNum) -> map(rs, "index");
    private final RowMapper<ProfileRecord> retrievalMapper = (rs, rowNum) -> map(rs, "retrieval");

    public ProfileRepository(JdbcTemplate jdbcTemplate, ObjectMapper objectMapper) {
        this.jdbcTemplate = jdbcTemplate;
        this.objectMapper = objectMapper;
    }

    public void insertIndex(ProfileRecord record) {
        jdbcTemplate.update(
            """
            insert into index_profile (
                id, name, config_json, owner_source_id, readonly, derived_from_profile_id, created_at, updated_at
            ) values (?,?,?,?,?,?,?,?)
            """,
            record.id(), record.name(), Jsons.write(objectMapper, record.config()), record.ownerSourceId(),
            record.readonly() ? 1 : 0, record.derivedFromProfileId(), record.createdAt().toString(), record.updatedAt().toString()
        );
    }

    public void insertRetrieval(ProfileRecord record) {
        jdbcTemplate.update(
            """
            insert into retrieval_profile (
                id, name, config_json, owner_source_id, readonly, derived_from_profile_id, created_at, updated_at
            ) values (?,?,?,?,?,?,?,?)
            """,
            record.id(), record.name(), Jsons.write(objectMapper, record.config()), record.ownerSourceId(),
            record.readonly() ? 1 : 0, record.derivedFromProfileId(), record.createdAt().toString(), record.updatedAt().toString()
        );
    }

    public List<ProfileRecord> findAllIndex() {
        return jdbcTemplate.query("select * from index_profile order by created_at desc", indexMapper);
    }

    public List<ProfileRecord> findAllRetrieval() {
        return jdbcTemplate.query("select * from retrieval_profile order by created_at desc", retrievalMapper);
    }

    public Optional<ProfileRecord> findIndexById(String id) {
        return jdbcTemplate.query("select * from index_profile where id = ?", indexMapper, id).stream().findFirst();
    }

    public Optional<ProfileRecord> findRetrievalById(String id) {
        return jdbcTemplate.query("select * from retrieval_profile where id = ?", retrievalMapper, id).stream().findFirst();
    }

    public Optional<ProfileRecord> findIndexByName(String name) {
        return jdbcTemplate.query("select * from index_profile where name = ?", indexMapper, name).stream().findFirst();
    }

    public Optional<ProfileRecord> findRetrievalByName(String name) {
        return jdbcTemplate.query("select * from retrieval_profile where name = ?", retrievalMapper, name).stream().findFirst();
    }

    public Optional<ProfileRecord> findIndexByOwnerSourceId(String sourceId) {
        return jdbcTemplate.query("select * from index_profile where owner_source_id = ?", indexMapper, sourceId).stream().findFirst();
    }

    public Optional<ProfileRecord> findRetrievalByOwnerSourceId(String sourceId) {
        return jdbcTemplate.query("select * from retrieval_profile where owner_source_id = ?", retrievalMapper, sourceId).stream().findFirst();
    }

    public void updateIndex(ProfileRecord record) {
        jdbcTemplate.update(
            """
            update index_profile
            set name=?, config_json=?, owner_source_id=?, readonly=?, derived_from_profile_id=?, updated_at=?
            where id=?
            """,
            record.name(), Jsons.write(objectMapper, record.config()), record.ownerSourceId(), record.readonly() ? 1 : 0,
            record.derivedFromProfileId(), record.updatedAt().toString(), record.id()
        );
    }

    public void updateRetrieval(ProfileRecord record) {
        jdbcTemplate.update(
            """
            update retrieval_profile
            set name=?, config_json=?, owner_source_id=?, readonly=?, derived_from_profile_id=?, updated_at=?
            where id=?
            """,
            record.name(), Jsons.write(objectMapper, record.config()), record.ownerSourceId(), record.readonly() ? 1 : 0,
            record.derivedFromProfileId(), record.updatedAt().toString(), record.id()
        );
    }

    public void deleteIndex(String id) {
        jdbcTemplate.update("delete from index_profile where id = ?", id);
    }

    public void deleteRetrieval(String id) {
        jdbcTemplate.update("delete from retrieval_profile where id = ?", id);
    }

    private ProfileRecord map(ResultSet rs, String type) throws SQLException {
        return new ProfileRecord(
            rs.getString("id"),
            rs.getString("name"),
            Jsons.readMap(objectMapper, rs.getString("config_json")),
            type,
            rs.getString("owner_source_id"),
            rs.getInt("readonly") != 0,
            rs.getString("derived_from_profile_id"),
            Instant.parse(rs.getString("created_at")),
            Instant.parse(rs.getString("updated_at"))
        );
    }

    public record ProfileRecord(
        String id,
        String name,
        Map<String, Object> config,
        String type,
        String ownerSourceId,
        boolean readonly,
        String derivedFromProfileId,
        Instant createdAt,
        Instant updatedAt
    ) {
    }
}
