import { NestFactory } from "@nestjs/core";
import { VerificationModule } from "./app.module";

async function bootstrap() {
  const app = await NestFactory.create(VerificationModule);
  app.enableShutdownHooks();
  await app.listen(process.env.PORT ?? 3000);
}
void bootstrap();
