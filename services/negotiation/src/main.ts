import { NestFactory } from "@nestjs/core";
import { NegotiationModule } from "./app.module";

async function bootstrap() {
  const app = await NestFactory.create(NegotiationModule);
  app.enableShutdownHooks();
  await app.listen(process.env.PORT ?? 3000);
}
void bootstrap();
