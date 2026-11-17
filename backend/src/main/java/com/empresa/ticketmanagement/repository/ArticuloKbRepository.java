package com.empresa.ticketmanagement.repository;

import com.empresa.ticketmanagement.entity.ArticuloKb;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

@Repository
public interface ArticuloKbRepository extends JpaRepository<ArticuloKb, Long> {

    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("UPDATE ArticuloKb a SET a.vistas = COALESCE(a.vistas, 0) + 1 " +
            "WHERE a.id = :id AND (:incluirPrivados = true OR a.esPublico = true)")
    int incrementarVistas(@Param("id") Long id, @Param("incluirPrivados") boolean incluirPrivados);

    @Query(value = """
        SELECT a.* FROM articulos_kb a
        WHERE (:busqueda IS NULL OR :busqueda = '' OR
               LOWER(a.titulo) LIKE LOWER(CONCAT('%', :busqueda, '%')) OR
               LOWER(CAST(a.contenido_markdown AS CHAR)) LIKE LOWER(CONCAT('%', :busqueda, '%')))
        AND (:categoriaId IS NULL OR a.categoria_id = :categoriaId)
        AND (:incluirPrivados = true OR a.es_publico = true)
        """,
        countQuery = """
        SELECT COUNT(*) FROM articulos_kb a
        WHERE (:busqueda IS NULL OR :busqueda = '' OR
               LOWER(a.titulo) LIKE LOWER(CONCAT('%', :busqueda, '%')) OR
               LOWER(CAST(a.contenido_markdown AS CHAR)) LIKE LOWER(CONCAT('%', :busqueda, '%')))
        AND (:categoriaId IS NULL OR a.categoria_id = :categoriaId)
        AND (:incluirPrivados = true OR a.es_publico = true)
        """,
        nativeQuery = true)
    Page<ArticuloKb> buscar(@Param("busqueda") String busqueda,
                            @Param("categoriaId") Long categoriaId,
                            @Param("incluirPrivados") boolean incluirPrivados,
                            Pageable pageable);
}
