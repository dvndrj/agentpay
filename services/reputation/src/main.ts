import { NestFactory } from "@nestjs/core";
import { ReputationModule } from "./app.module";

async function bootstrap() {
  const app = await NestFactory.create(ReputationModule);
  app.enableShutdownHooks();
  await app.listen(process.env.PORT ?? 3000);
}
void bootstrap();
