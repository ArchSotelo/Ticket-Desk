package com.empresa.ticketmanagement.repository;

import com.empresa.ticketmanagement.entity.TicketAttachment;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface TicketAttachmentRepository extends JpaRepository<TicketAttachment, Long> {
    List<TicketAttachment> findByTicketIdAndActivoTrue(Long ticketId);
}
