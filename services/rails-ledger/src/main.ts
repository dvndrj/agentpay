import { NestFactory } from "@nestjs/core";
import { RailsLedgerModule } from "./app.module";

async function bootstrap() {
  const app = await NestFactory.create(RailsLedgerModule);
  app.enableShutdownHooks();
  await app.listen(process.env.PORT ?? 3000);
}
void bootstrap();
