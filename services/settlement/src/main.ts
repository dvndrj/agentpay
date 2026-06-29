import { NestFactory } from "@nestjs/core";
import { SettlementModule } from "./app.module";

async function bootstrap() {
  const app = await NestFactory.create(SettlementModule);
  app.enableShutdownHooks();
  await app.listen(process.env.PORT ?? 3000);
}
void bootstrap();
