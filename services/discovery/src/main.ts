import { NestFactory } from "@nestjs/core";
import { DiscoveryModule } from "./app.module";

async function bootstrap() {
  const app = await NestFactory.create(DiscoveryModule);
  app.enableShutdownHooks();
  await app.listen(process.env.PORT ?? 3000);
}
void bootstrap();
