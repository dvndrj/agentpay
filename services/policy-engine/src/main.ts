import { NestFactory } from "@nestjs/core";
import { PolicyEngineModule } from "./app.module";

async function bootstrap() {
  const app = await NestFactory.create(PolicyEngineModule);
  app.enableShutdownHooks();
  await app.listen(process.env.PORT ?? 3000);
}
void bootstrap();
