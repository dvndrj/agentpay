import {
  Controller,
  Post,
  Get,
  Patch,
  Put,
  Delete,
  Param,
  Query,
  Body,
  HttpCode,
  HttpStatus,
} from "@nestjs/common";
import { AuditLoggerService } from "./audit-logger.service";
import { AppendAuditEventDto, ExportAuditQueryDto } from "./audit-record.dto";

@Controller("v1/audit")
export class AuditLoggerController {
  constructor(private readonly auditLogger: AuditLoggerService) {}

  /**
   * POST /v1/audit/append
   *
   * Append an event to the hash-chained audit log (R10.1).
   * Body: AuditEvent in canonical JSON form.
   * Returns: { recordId, recordHash }
   */
  @Post("append")
  @HttpCode(HttpStatus.CREATED)
  async append(@Body() dto: AppendAuditEventDto) {
    return this.auditLogger.append(dto);
  }

  /**
   * GET /v1/audit/:handle/head
   *
   * Return the head (latest record_hash) for a handle (R10.1).
   */
  @Get(":handle/head")
  async head(@Param("handle") handle: string) {
    return this.auditLogger.getHead(handle);
  }

  /**
   * GET /v1/audit/export?handle=&from=&to=
   *
   * Export audit records for a handle within a time range (R10.3).
   * Results are ordered by timestamp ascending.
   */
  @Get("export")
  async exportRecords(@Query() query: ExportAuditQueryDto) {
    return this.auditLogger.exportRecords(query);
  }

  /**
   * Reject any mutation attempt with 405 Method Not Allowed (R10.2).
   *
   * Postgres RULEs block UPDATE/DELETE at the database layer;
   * this is the application-layer enforcement.
   */
  @Patch(":id")
  @HttpCode(HttpStatus.METHOD_NOT_ALLOWED)
  rejectPatch() {
    return { code: "immutable_record", message: "Audit records are immutable" };
  }

  @Put(":id")
  @HttpCode(HttpStatus.METHOD_NOT_ALLOWED)
  rejectPut() {
    return { code: "immutable_record", message: "Audit records are immutable" };
  }

  @Delete(":id")
  @HttpCode(HttpStatus.METHOD_NOT_ALLOWED)
  rejectDelete() {
    return { code: "immutable_record", message: "Audit records are immutable" };
  }
}
