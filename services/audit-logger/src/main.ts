import { NestFactory } from "@nestjs/core";
import { AuditLoggerModule } from "./app.module";

async function bootstrap() {
  const app = await NestFactory.create(AuditLoggerModule);
  app.enableShutdownHooks();
  await app.listen(process.env.PORT ?? 3001);
}
void bootstrap();
