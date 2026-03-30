package com.huawei.opsfactory.knowledge.repository;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.huawei.opsfactory.knowledge.common.util.Ids;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Instant;
import java.util.Collection;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.stream.Collectors;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Repository;

@Repository
public class EmbeddingRepository {

    private static final TypeReference<List<Double>> VECTOR_TYPE = new TypeReference<>() {
    };

    private final JdbcTemplate jdbcTemplate;
    private final ObjectMapper objectMapper;
    private final RowMapper<EmbeddingRecord> mapper = this::map;

    public EmbeddingRepository(JdbcTemplate jdbcTemplate, ObjectMapper objectMapper) {
        this.jdbcTemplate = jdbcTemplate;
        this.objectMapper = objectMapper;
    }

    public Map<String, EmbeddingRecord> findByContentHashes(String model, int dimension, Collection<String> contentHashes) {
        if (contentHashes == null || contentHashes.isEmpty()) {
            return Map.of();
        }

        List<String> hashes = contentHashes.stream()
            .filter(Objects::nonNull)
            .distinct()
            .toList();
        if (hashes.isEmpty()) {
            return Map.of();
        }

        String placeholders = hashes.stream().map(id -> "?").collect(Collectors.joining(","));
        List<EmbeddingRecord> records = jdbcTemplate.query(
            "select * from embedding_cache where model = ? and dimension = ? and content_hash in (" + placeholders + ")",
            mapper,
            concatParams(model, dimension, hashes)
        );
        return records.stream().collect(Collectors.toMap(EmbeddingRecord::contentHash, record -> record));
    }

    public void upsert(String contentHash, String model, int dimension, List<Double> vector) {
        Instant now = Instant.now();
        String vectorJson = writeVector(vector);
        jdbcTemplate.update(
            "delete from embedding_cache where content_hash = ? and model = ? and dimension <> ?",
            contentHash,
            model,
            dimension
        );
        int updated = jdbcTemplate.update(
            "update embedding_cache set vector_json = ?, updated_at = ? where content_hash = ? and model = ? and dimension = ?",
            vectorJson, now.toString(), contentHash, model, dimension
        );
        if (updated > 0) {
            return;
        }

        jdbcTemplate.update(
            "insert into embedding_cache (id, content_hash, model, dimension, vector_json, created_at, updated_at) values (?,?,?,?,?,?,?)",
            Ids.newId("emb"), contentHash, model, dimension, vectorJson, now.toString(), now.toString()
        );
    }

    private EmbeddingRecord map(ResultSet rs, int rowNum) throws SQLException {
        return new EmbeddingRecord(
            rs.getString("id"),
            rs.getString("content_hash"),
            rs.getString("model"),
            rs.getInt("dimension"),
            readVector(rs.getString("vector_json")),
            Instant.parse(rs.getString("created_at")),
            Instant.parse(rs.getString("updated_at"))
        );
    }

    private Object[] concatParams(String model, int dimension, List<String> hashes) {
        Object[] params = new Object[hashes.size() + 2];
        params[0] = model;
        params[1] = dimension;
        for (int index = 0; index < hashes.size(); index++) {
            params[index + 2] = hashes.get(index);
        }
        return params;
    }

    private List<Double> readVector(String json) {
        try {
            return objectMapper.readValue(json, VECTOR_TYPE);
        } catch (Exception e) {
            throw new IllegalStateException("Failed to read embedding vector", e);
        }
    }

    private String writeVector(List<Double> vector) {
        try {
            return objectMapper.writeValueAsString(vector);
        } catch (Exception e) {
            throw new IllegalStateException("Failed to write embedding vector", e);
        }
    }

    public record EmbeddingRecord(
        String id,
        String contentHash,
        String model,
        int dimension,
        List<Double> vector,
        Instant createdAt,
        Instant updatedAt
    ) {
    }
}
