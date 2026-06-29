import { NestFactory } from "@nestjs/core";
import { IdentityRegistryModule } from "./app.module";

async function bootstrap() {
  const app = await NestFactory.create(IdentityRegistryModule);
  app.enableShutdownHooks();
  await app.listen(process.env.PORT ?? 3000);
}
void bootstrap();
